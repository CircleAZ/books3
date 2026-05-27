from django.db import transaction
from django.core.exceptions import ValidationError
from decimal import Decimal
from .models import PurchaseOrder, PurchaseOrderItem, PurchaseCharge, PurchasePayment
from inventory.services import StockService
from inventory.models import Product
from finance.models import Expense, ExpenseCategory, EmployeeExpense
from finance.services import LedgerService
from django.utils import timezone

class ProcurementService:
    @staticmethod
    @transaction.atomic
    def receive_order(po_id, items_received_data, user, bypass_inventory_volume=False, bypass_inventory_wac=False):
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
            
            # ── C4 FIX: Over-receive validation ──
            remaining_packs = po_item.purchased_packs - po_item.received_packs
            if new_packs > remaining_packs:
                raise ValidationError(
                    f"Cannot receive {new_packs} packs for {po_item.product.name}. "
                    f"Only {remaining_packs} packs remaining (ordered: {po_item.purchased_packs}, "
                    f"already received: {po_item.received_packs})."
                )
                
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
            if not bypass_inventory_volume:
                StockService.adjust_stock(
                    product_id=po_item.product_id,
                    adjustment_type='increase',
                    quantity=new_packs,
                    reason='purchase',
                    notes=f"PO #{po.display_id} Received" + (" [WAC Bypassed]" if bypass_inventory_wac else ""),
                    user=user,
                    unit_cost=pack_landed_cost if not bypass_inventory_wac else None,
                    target_ledger='both',
                    pack_size=po_item.vendor_pack_size
                )

            # 5. Update PO Item state
            po_item.received_packs += new_packs
            po_item.save(update_fields=['received_packs'])

            if po_item.received_packs < po_item.purchased_packs:
                all_fully_received = False

        if bypass_inventory_volume or bypass_inventory_wac:
            po.is_historical_bypass = True

        if any_received_now:
            po.status = PurchaseOrder.Status.RECEIVED if all_fully_received else PurchaseOrder.Status.PARTIAL
            po.save(update_fields=['status', 'is_historical_bypass'])
            
        return po

    @staticmethod
    @transaction.atomic
    def process_payment(payment_id, user, bypass_finance_expense=False, bypass_finance_ledger=False):
        """
        Process a PurchasePayment. Creates finance.Expense for ALL payment types
        and routes Cash/Bank through LedgerService for ledger balance tracking.
        """
        payment = PurchasePayment.objects.select_for_update().get(id=payment_id)
        
        # Idempotency Lock (Risk 5)
        if payment.finance_expense_id:
            raise ValidationError("This payment has already been routed to the finance ledger.")
            
        po = payment.purchase_order
        
        if bypass_finance_expense or bypass_finance_ledger:
            payment.is_historical_bypass = True
            payment.save(update_fields=['is_historical_bypass'])
        
        # ── A1 FIX: Create Expense record for ALL payment types ──
        # Get or create Procurement Expense Category
        category, _ = ExpenseCategory.objects.get_or_create(
            name="Procurement",
            defaults={"description": "Purchase Order payments for inventory procurement", "icon": "inventory"}
        )
        
        # Build description
        desc = f"PO #{po.display_id} Payment"
        if payment.purchase_charge:
            desc += f" ({payment.purchase_charge.get_charge_type_display()} Charge)"
        
        # Determine payee based on payment method
        if payment.payment_method == PurchasePayment.PaymentMethod.EMPLOYEE_EXPENSE:
            if not payment.paid_by_employee:
                raise ValidationError("Employee Expense payment method requires an employee to be selected.")
            payee_type = Expense.PayeeType.EMPLOYEE
            payee_name = f"{payment.paid_by_employee.first_name} {payment.paid_by_employee.last_name}".strip() or payment.paid_by_employee.username
            payee_id = payment.paid_by_employee.id
            desc = f"Reimbursement for {desc}"
        else:
            payee_type = Expense.PayeeType.VENDOR
            payee_name = po.vendor.name if po.vendor else "Unknown Vendor"
            payee_id = po.vendor_id
        
        # Create the Expense record (common to ALL payment types)
        if not bypass_finance_expense:
            expense = Expense.objects.create(
                date=timezone.now().date(),
                category=category,
                payee_type=payee_type,
                payee_name=payee_name,
                payee_id=payee_id,
                description=desc,
                amount=payment.amount,
                tax_amount=Decimal('0.00'),
                total_amount=payment.amount,
                created_by=user,
                notes="AUTO-GENERATED IMMUTABLE EXPENSE"
            )
            
            payment.finance_expense = expense
            payment.save(update_fields=['finance_expense'])
            
            # Create ExpensePayment record for CASH or BANK payment types (mirroring ExpenseTrip pattern)
            if payment.payment_method in [PurchasePayment.PaymentMethod.CASH, PurchasePayment.PaymentMethod.BANK]:
                from finance.models import ExpensePayment
                
                exp_method = (
                    ExpensePayment.PaymentMethod.CASH 
                    if payment.payment_method == PurchasePayment.PaymentMethod.CASH 
                    else ExpensePayment.PaymentMethod.BANK
                )
                
                ExpensePayment.objects.create(
                    expense=expense,
                    payment_date=timezone.now().date(),
                    amount=payment.amount,
                    payment_method=exp_method,
                    source_bank=payment.source_bank,
                    source_wallet=payment.source_wallet,
                    reference=payment.reference_id or f"PO-{po.display_id}",
                    notes=f"Auto-created payment for PO #{po.display_id} payment record",
                    payer=user
                )
            
            # Create EmployeeExpense record so it feeds into the reimbursement pipeline
            if payment.payment_method == PurchasePayment.PaymentMethod.EMPLOYEE_EXPENSE:
                EmployeeExpense.objects.create(
                    employee=payment.paid_by_employee,
                    date=timezone.now().date(),
                    category=category,
                    description=desc,
                    amount=payment.amount,
                    status=EmployeeExpense.Status.PENDING,
                )
        
        # ── Route Cash/Bank through LedgerService for balance tracking ──
        if not bypass_finance_ledger:
            if payment.payment_method == PurchasePayment.PaymentMethod.CASH:
                if payment.source_wallet_id:
                    LedgerService.process_withdrawal(
                        amount=payment.amount,
                        source_wallet=payment.source_wallet,
                        reference=f"PO-{po.display_id}",
                        description=desc,
                        user=user
                    )
            elif payment.payment_method == PurchasePayment.PaymentMethod.BANK:
                if payment.source_bank_id:
                    LedgerService.process_withdrawal(
                        amount=payment.amount,
                        source_bank=payment.source_bank,
                        reference=f"PO-{po.display_id}",
                        description=desc,
                        user=user
                    )
            
        # Update PO payment totals
        po.amount_paid += payment.amount
        if po.amount_paid >= po.total_amount:
            po.payment_status = PurchaseOrder.PaymentStatus.PAID
        elif po.amount_paid > 0:
            po.payment_status = PurchaseOrder.PaymentStatus.PARTIAL
        po.save(update_fields=['amount_paid', 'payment_status'])
        
        return payment

    @staticmethod
    @transaction.atomic
    def apply_retroactive_charge(po_id, charge_amount, user):
        """
        Phase 6.1: Retroactive WAC Correction.
        
        When a late charge (transport/packing) is added to an already-received PO,
        this method:
        1. Prorates the charge across received line items (by value proportion).
        2. For each item, calculates the per-base-unit inflation.
        3. Locks the Product row and adds the inflation to cost_price.
        4. Detects units already sold since receiving. For those units, the
           transport cost can no longer be absorbed into future COGS.
           It logs an "Orphaned Margin Write-Off" expense for that exact amount.
        5. Logs StockAdjustment + StockHistory with quantity=0 for audit trail.
        """
        from inventory.models import Product, StockAdjustment, StockHistory
        from decimal import ROUND_HALF_UP
        
        po = PurchaseOrder.objects.get(id=po_id)
        items = list(po.items.filter(received_packs__gt=0))
        
        if not items:
            return  # Nothing received, nothing to correct
        
        total_po_value = sum(item.line_total for item in items)
        if total_po_value <= 0:
            return
        
        orphaned_total = Decimal('0.00')
        
        for item in items:
            # 1. Calculate this item's share of the charge
            proportion = item.line_total / total_po_value
            item_charge_share = (charge_amount * proportion).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
            
            # 2. Calculate per-base-unit inflation (Dijkstra's dimensional guard)
            base_units_received = item.received_packs * item.vendor_pack_size
            if base_units_received <= 0:
                continue
            
            inflation_per_unit = (item_charge_share / Decimal(str(base_units_received))).quantize(
                Decimal('0.0001'), rounding=ROUND_HALF_UP
            )
            
            if inflation_per_unit <= 0:
                continue
            
            # 3. Lock the product row (Linus's concurrency guard)
            # Handle pack translation: if the PO item is a pack product,
            # we need to inflate the BASE product's cost_price
            if item.product.is_pack and item.product.base_product_id:
                product = Product.objects.select_for_update().get(pk=item.product.base_product_id)
            else:
                product = Product.objects.select_for_update().get(pk=item.product_id)
            
            old_cost = product.cost_price
            
            # 4. Detect orphaned margin (units already sold)
            # The current stock tells us how many of the received units are still here.
            # If we received 100 and stock is 60, then 40 were sold (or adjusted out).
            units_still_in_stock = max(0, product.stock_quantity)
            units_sold_or_gone = max(0, base_units_received - units_still_in_stock)
            
            # Cap: if stock is higher than received (due to other purchases),
            # ALL received units are still conceptually in stock
            if units_still_in_stock >= base_units_received:
                units_sold_or_gone = 0
            
            # Orphaned margin = transport cost for sold units that will never hit COGS
            orphaned_amount = (inflation_per_unit * Decimal(str(units_sold_or_gone))).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
            orphaned_total += orphaned_amount
            
            # 5. Apply WAC inflation
            product.cost_price = old_cost + inflation_per_unit
            product.save(update_fields=['cost_price'])
            product.sync_pack_stock()
            
            # 6. Audit trail (Murphy's law: zero-quantity adjustment for cost change)
            StockAdjustment.objects.create(
                product=product,
                adjustment_type='increase',
                quantity=0,
                unit_cost=inflation_per_unit,
                reason='retroactive_charge',
                notes=f"PO #{po.display_id} late charge: +₹{inflation_per_unit}/unit "
                      f"(₹{item_charge_share} across {base_units_received} units). "
                      f"Old cost: ₹{old_cost}, New cost: ₹{product.cost_price}",
                created_by=user
            )
            StockHistory.objects.create(
                product=product,
                quantity_change=0,
                quantity_after=product.stock_quantity,
                cost_at_time=product.cost_price,
                reason='retroactive_charge',
                notes=f"Retroactive WAC correction: PO #{po.display_id} late charge "
                      f"+₹{inflation_per_unit}/unit",
                created_by=user
            )
        
        # 7. Log orphaned margin as a direct expense (the Lost Margin Sweeper)
        if orphaned_total > 0:
            category, _ = ExpenseCategory.objects.get_or_create(
                name="Late Transport Write-Off",
                defaults={
                    "description": "COGS correction for transport charges on already-sold inventory",
                    "icon": "warning"
                }
            )
            Expense.objects.create(
                date=timezone.now().date(),
                category=category,
                payee_type=Expense.PayeeType.VENDOR,
                payee_name=po.vendor.name if po.vendor else "Unknown Vendor",
                payee_id=po.vendor_id,
                description=f"PO #{po.display_id} late charge write-off: "
                            f"₹{orphaned_total} for {units_sold_or_gone} already-sold units",
                amount=orphaned_total,
                tax_amount=Decimal('0.00'),
                total_amount=orphaned_total,
                created_by=user,
                notes="AUTO-GENERATED: Orphaned margin from retroactive WAC correction"
            )

    @staticmethod
    @transaction.atomic
    def reverse_receipt(po_id, items_reversed_data, user):
        """
        Reverses received items for a PO.
        items_reversed_data: list of dicts [{'item_id': UUID, 'received_packs': int}]
        Note: we reuse 'received_packs' key from POReceiveSerializer to refer to packs to reverse.
        """
        po = PurchaseOrder.objects.select_for_update().get(id=po_id)
        if po.status == PurchaseOrder.Status.CANCELLED:
            raise ValidationError("Cannot reverse items for a cancelled order.")

        total_po_value = sum(item.line_total for item in po.items.all())
        total_charges = sum(charge.amount for charge in po.charges.all())

        product_ids = []
        for item_data in items_reversed_data:
            po_item = PurchaseOrderItem.objects.get(id=item_data['item_id'], purchase_order=po)
            if po_item.product.is_pack and po_item.product.base_product_id:
                product_ids.append(po_item.product.base_product_id)
            else:
                product_ids.append(po_item.product_id)
        
        locked_products = {
            p.id: p for p in Product.objects.select_for_update().filter(id__in=product_ids)
        }

        any_reversed_now = False

        for item_data in items_reversed_data:
            po_item = PurchaseOrderItem.objects.get(id=item_data['item_id'], purchase_order=po)
            reversed_packs = int(item_data.get('received_packs', 0))
            
            if reversed_packs <= 0:
                continue
            
            if reversed_packs > po_item.received_packs:
                raise ValidationError(
                    f"Cannot reverse {reversed_packs} packs for {po_item.product.name}. "
                    f"Only {po_item.received_packs} packs have been received."
                )
                
            any_reversed_now = True

            # Calculate original landed cost for this item to log correct value value
            proportion = (po_item.line_total / total_po_value) if total_po_value > 0 else Decimal('0.00')
            item_charge_share = total_charges * proportion
            
            if po_item.ordered_quantity > 0:
                charge_per_base_unit = item_charge_share / Decimal(str(po_item.ordered_quantity))
            else:
                charge_per_base_unit = Decimal('0.00')
                
            landed_unit_cost = po_item.unit_cost_price + charge_per_base_unit
            pack_landed_cost = landed_unit_cost * po_item.vendor_pack_size

            # Atomic Stock Deduction
            StockService.adjust_stock(
                product_id=po_item.product_id,
                adjustment_type='decrease',
                quantity=reversed_packs,
                reason='audit_correction',
                notes=f"PO #{po.display_id} Receipt Reversal",
                user=user,
                unit_cost=pack_landed_cost,
                target_ledger='both',
                pack_size=po_item.vendor_pack_size
            )

            po_item.received_packs -= reversed_packs
            po_item.save(update_fields=['received_packs'])

        if any_reversed_now:
            # Recalculate overall PO status
            all_items = po.items.all()
            all_zero = all(item.received_packs == 0 for item in all_items)
            any_received = any(item.received_packs > 0 for item in all_items)
            
            if all_zero:
                po.status = PurchaseOrder.Status.ORDERED
            elif any_received:
                po.status = PurchaseOrder.Status.PARTIAL
            po.save(update_fields=['status'])
            
        return po

