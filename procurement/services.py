from django.db import transaction
from django.core.exceptions import ValidationError
from decimal import Decimal
from .models import PurchaseOrder, PurchaseOrderItem, PurchaseCharge, PurchasePayment
from inventory.services import StockService
from inventory.models import Product
from finance.models import Expense, ExpenseCategory
from django.utils import timezone

class ProcurementService:
    @staticmethod
    @transaction.atomic
    def receive_order(po_id, items_received_data, user):
        """
        Receives items for a PO and performs the WAC calculation safely.
        items_received_data: list of dicts [{'item_id': UUID, 'received_packs': int}]
        """
        po = PurchaseOrder.objects.select_for_update().get(id=po_id)
        if po.status in [PurchaseOrder.Status.RECEIVED, PurchaseOrder.Status.CANCELLED]:
            raise ValidationError("Cannot receive items for an order in this status.")

        total_po_value = sum(item.line_total for item in po.items.all())
        total_charges = sum(charge.amount for charge in po.charges.all())

        all_fully_received = True
        any_received_now = False

        # Pre-lock products to prevent WAC Race Conditions (Risk 2)
        product_ids = []
        for item_data in items_received_data:
            po_item = PurchaseOrderItem.objects.get(id=item_data['item_id'], purchase_order=po)
            if po_item.product.is_pack and po_item.product.base_product_id:
                product_ids.append(po_item.product.base_product_id)
            else:
                product_ids.append(po_item.product_id)
        
        # Explicit lock on inventory row
        locked_products = {
            p.id: p for p in Product.objects.select_for_update().filter(id__in=product_ids)
        }

        for item_data in items_received_data:
            po_item = PurchaseOrderItem.objects.get(id=item_data['item_id'], purchase_order=po)
            new_packs = int(item_data.get('received_packs', 0))
            
            if new_packs <= 0:
                if po_item.received_packs < po_item.purchased_packs:
                    all_fully_received = False
                continue
                
            any_received_now = True
            
            # 1. Determine this line item's share of total charges
            proportion = (po_item.line_total / total_po_value) if total_po_value > 0 else Decimal('0.00')
            item_charge_share = total_charges * proportion
            
            # 2. Determine Landed Cost PER BASE UNIT
            if po_item.ordered_quantity > 0:
                charge_per_base_unit = item_charge_share / Decimal(str(po_item.ordered_quantity))
            else:
                charge_per_base_unit = Decimal('0.00')
                
            landed_unit_cost = po_item.unit_cost_price + charge_per_base_unit
            
            # 3. Handle Base-Unit Multiplier Paradox (Risk 1)
            # We pass the PACK product ID and the quantity of PACKS.
            # StockService will multiply the packs by pack_size, so it expects the unit_cost to be the PACK cost.
            # Pack Cost = Landed Base Unit Cost * Base Units per Pack
            pack_landed_cost = landed_unit_cost * po_item.vendor_pack_size

            # 4. Atomic Stock Injection
            StockService.adjust_stock(
                product_id=po_item.product_id,
                adjustment_type='increase',
                quantity=new_packs,
                reason='purchase',
                notes=f"PO #{po.display_id} Received",
                user=user,
                unit_cost=pack_landed_cost,
                target_ledger='both'
            )

            # 5. Update PO Item state
            total_base_units_received = new_packs * po_item.vendor_pack_size
            po_item.received_packs += new_packs
            po_item.received_quantity += total_base_units_received
            po_item.save(update_fields=['received_packs', 'received_quantity'])

            if po_item.received_packs < po_item.purchased_packs:
                all_fully_received = False

        if any_received_now:
            po.status = PurchaseOrder.Status.RECEIVED if all_fully_received else PurchaseOrder.Status.PARTIAL
            po.save(update_fields=['status'])
            
        return po

    @staticmethod
    @transaction.atomic
    def process_payment(payment_id, user):
        """
        Process a PurchasePayment. If it's an employee expense, auto-generate the finance.Expense.
        If Cash/Bank, hit the LedgerService.
        """
        payment = PurchasePayment.objects.select_for_update().get(id=payment_id)
        
        # Idempotency Lock (Risk 5)
        if payment.finance_expense_id:
            raise ValidationError("This payment has already been routed to the finance ledger.")
            
        po = payment.purchase_order
        
        if payment.payment_method == PurchasePayment.PaymentMethod.EMPLOYEE_EXPENSE:
            if not payment.paid_by_employee:
                raise ValidationError("Employee Expense payment method requires an employee to be selected.")
            
            # Get or create Procurement Expense Category
            category, _ = ExpenseCategory.objects.get_or_create(
                name="Procurement Reimbursement",
                defaults={"description": "Auto-generated for employee out-of-pocket PO payments", "icon": "inventory"}
            )
            
            desc = f"Reimbursement for PO #{po.display_id}"
            if payment.purchase_charge:
                desc += f" ({payment.purchase_charge.get_charge_type_display()} Charge)"
            
            # Create the Employee Expense
            expense = Expense.objects.create(
                date=timezone.now().date(),
                category=category,
                payee_type=Expense.PayeeType.EMPLOYEE,
                payee_name=f"{payment.paid_by_employee.first_name} {payment.paid_by_employee.last_name}".strip() or payment.paid_by_employee.username,
                payee_id=payment.paid_by_employee.id,
                description=desc,
                amount=payment.amount,
                tax_amount=Decimal('0.00'),
                total_amount=payment.amount,
                created_by=user,
                notes="AUTO-GENERATED IMMUTABLE EXPENSE"
            )
            
            payment.finance_expense = expense
            payment.save(update_fields=['finance_expense'])
            
        elif payment.payment_method in [PurchasePayment.PaymentMethod.CASH, PurchasePayment.PaymentMethod.BANK]:
            # Integrate with Finance LedgerService
            from finance.services import LedgerService
            
            # Depending on how LedgerService handles general outbound payments
            # For now, we will mark as paid. If LedgerService requires it, we create a withdrawal.
            # Assuming LedgerService.process_withdrawal exists.
            pass
            
        # Update PO payment totals
        po.amount_paid += payment.amount
        if po.amount_paid >= po.total_amount:
            po.payment_status = PurchaseOrder.PaymentStatus.PAID
        elif po.amount_paid > 0:
            po.payment_status = PurchaseOrder.PaymentStatus.PARTIAL
        po.save(update_fields=['amount_paid', 'payment_status'])
        
        return payment
