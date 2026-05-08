from decimal import Decimal
from django.db import models, transaction
from django.conf import settings
from django.core.validators import MinValueValidator
from django.utils import timezone
from django.db.models import Sum
from django.db.models.functions import Coalesce
from core.models import SoftDeleteModel, UUIDPrimaryKeyModel, DisplayIDMixin
from inventory.models import Product

class OutletManager(models.Manager):
    def with_financials(self):
        return self.annotate(
            annotated_gross_sales=Coalesce(Sum('sales__gross_total'), Decimal('0.00')),
            annotated_commission=Coalesce(Sum('sales__commission_amount'), Decimal('0.00')),
            annotated_net_sales=Coalesce(Sum('sales__net_total'), Decimal('0.00')),
            annotated_paid=Coalesce(Sum('payments__amount'), Decimal('0.00'))
        )

class Outlet(DisplayIDMixin, SoftDeleteModel):
    """
    Physical B2B location selling consignment stock.
    """
    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    objects = OutletManager()

    def __str__(self):
        return self.name
    
    # Financial Properties
    @property
    def total_gross_sales(self):
        if hasattr(self, 'annotated_gross_sales'):
            return self.annotated_gross_sales
        return sum(sale.gross_total for sale in self.sales.all())
        
    @property
    def total_commission(self):
        if hasattr(self, 'annotated_commission'):
            return self.annotated_commission
        return sum(sale.commission_amount for sale in self.sales.all())
        
    @property
    def total_net_sales(self):
        if hasattr(self, 'annotated_net_sales'):
            return self.annotated_net_sales
        return sum(sale.net_total for sale in self.sales.all())
        
    @property
    def total_paid(self):
        if hasattr(self, 'annotated_paid'):
            return self.annotated_paid
        return sum(payment.amount for payment in self.payments.all())
        
    @property
    def outstanding_balance(self):
        """The Finn Protocol: Outstanding Balance = SUM(Net Receivable) - SUM(OutletPayments)"""
        return self.total_net_sales - self.total_paid


class OutletProductCommission(UUIDPrimaryKeyModel):
    """
    Override mapping for specific product commission rates at a specific outlet.
    """
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='product_commissions')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='outlet_commissions')
    COMMISSION_TYPES = [
        ('percent', 'Percentage'),
        ('fixed', 'Fixed Amount'),
    ]
    commission_type = models.CharField(
        max_length=10, 
        choices=COMMISSION_TYPES, 
        default='percent',
        help_text="Type of commission (Percentage or Fixed amount per unit)"
    )
    commission_value = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Specific commission value for this product at this outlet"
    )

    class Meta:
        unique_together = ('outlet', 'product')

    def __str__(self):
        symbol = "%" if self.commission_type == 'percent' else "₹"
        return f"{self.outlet.name} - {self.product.name}: {self.commission_value}{symbol}"


class OutletStock(UUIDPrimaryKeyModel):
    """
    Live ledger of physical stock currently held at the outlet.
    """
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='stock')
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='outlet_stock')
    quantity = models.IntegerField(default=0)
    commission_queue = models.JSONField(default=list, help_text="FIFO Queue of batches: [{'qty': int, 'type': str, 'val': float}]")

    
    class Meta:
        unique_together = ('outlet', 'product')
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gte=0),
                name='outletstock_quantity_non_negative'
            )
        ]

    def __str__(self):
        return f"{self.outlet.name} - {self.product.name}: {self.quantity}"


class OutletStockTransfer(DisplayIDMixin, SoftDeleteModel):
    """
    Transferring stock from Main Warehouse to Outlet (Consignment).
    """
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        DISPATCHED = 'dispatched', 'Dispatched'
        RECEIVED = 'received', 'Received'

    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='transfers')
    date = models.DateField(default=timezone.localdate)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    reference_number = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_outlet_transfers')
    idempotency_key = models.CharField(max_length=255, null=True, blank=True, unique=True, help_text="Prevents duplicate creation on network retries")
    
    def __str__(self):
        return f"Transfer #{self.display_id} to {self.outlet.name} ({self.status})"
        
    def soft_delete(self):
        """
        Risk Mitigation: Soft-Delete Cascade.
        A Draft transfer can be soft-deleted. If it was already dispatched, we shouldn't delete it
        without reversing the stock. For safety, we block soft-deletion if it's dispatched.
        """
        if self.status != self.Status.DRAFT:
            raise ValueError("Cannot delete a transfer that has already been dispatched. Use a Stock Return instead.")
        
        super().soft_delete()
        # Soft delete children manually
        for item in self.items.all():
            item.soft_delete()

    @transaction.atomic
    def dispatch(self, user):
        """
        Risk Mitigation: Target_Ledger & AVCO Protection
        Deducts from 'both' ledgers in Main Inventory.
        Freezes the current cost_price on the transfer item.
        """
        locked_transfer = OutletStockTransfer.objects.select_for_update().get(id=self.id)
        if locked_transfer.status != self.Status.DRAFT:
            raise ValueError("Only draft transfers can be dispatched.")
            
        from inventory.services import StockService
        
        # We must lock the OutletStock records and Product records.
        # StockService does this internally for Products, but we need to update OutletStock.
        
        for item in self.items.all():
            if item.quantity <= 0:
                continue
                
            # 1. Freeze the cost price
            product = Product.objects.get(pk=item.product_id)
            item.frozen_cost_price = product.cost_price
            item.save(update_fields=['frozen_cost_price'])
            
            # 2. Deduct from Main Inventory (both available and physical)
            StockService.adjust_stock(
                product_id=item.product_id,
                adjustment_type='decrease',
                quantity=item.quantity,
                reason='adjustment', # 'transfer_out' isn't in StockHistory REASON_CHOICES natively, using 'adjustment'
                notes=f"Dispatched to Outlet {self.outlet.name} (Transfer #{self.display_id})",
                user=user,
                target_ledger='both'
            )
            
            # 3. Add to Outlet Stock and Push to Commission Queue
            outlet_stock, created = OutletStock.objects.select_for_update().get_or_create(
                outlet=self.outlet,
                product_id=item.product_id,
                defaults={'quantity': 0, 'commission_queue': []}
            )
            
            # Freeze the commission rate at time of dispatch
            from .models import OutletDailySaleItem
            c_type, c_val = OutletDailySaleItem.resolve_commission_rate(self.outlet, product)
            item.frozen_commission_type = c_type
            item.frozen_commission_value = c_val
            item.save(update_fields=['frozen_cost_price', 'frozen_commission_type', 'frozen_commission_value'])

            # Push to Queue
            queue = outlet_stock.commission_queue if outlet_stock.commission_queue is not None else []
            if queue and queue[-1]['type'] == c_type and Decimal(str(queue[-1]['val'])) == c_val:
                queue[-1]['qty'] += item.quantity
            else:
                queue.append({
                    "qty": item.quantity,
                    "type": c_type,
                    "val": float(c_val)
                })

            outlet_stock.quantity += item.quantity
            outlet_stock.commission_queue = queue
            outlet_stock.save()
            
        self.status = self.Status.DISPATCHED
        self.save(update_fields=['status', 'updated_at'])


class OutletStockTransferItem(SoftDeleteModel):
    transfer = models.ForeignKey(OutletStockTransfer, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    frozen_cost_price = models.DecimalField(
        max_digits=10, 
        decimal_places=4, 
        null=True, 
        blank=True,
        help_text="AVCO Protection: Cost price at the exact moment of dispatch"
    )
    COMMISSION_TYPES = [
        ('percent', 'Percentage'),
        ('fixed', 'Fixed Amount'),
    ]
    frozen_commission_type = models.CharField(max_length=10, choices=COMMISSION_TYPES, null=True, blank=True)
    frozen_commission_value = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f"{self.quantity} x {self.product.name}"

    def save(self, *args, **kwargs):
        if not self._state.adding and self.transfer.status != OutletStockTransfer.Status.DRAFT:
            raise ValueError("Cannot modify items of a dispatched transfer.")
        super().save(*args, **kwargs)


class OutletStockReturn(DisplayIDMixin, SoftDeleteModel):
    """
    Returning unsold or recalled stock from Outlet to Main Warehouse.
    """
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        RECEIVED = 'received', 'Received'
        
    class Reason(models.TextChoices):
        UNSOLD = 'unsold', 'Unsold'
        DAMAGE = 'damage', 'Damaged'
        RECALL = 'recall', 'Recalled'
        OVERSTOCK = 'overstock', 'Overstock / Rebalancing'
        EXPIRED = 'expired', 'Expired'
        DEFECTIVE = 'defective', 'Defective / Manufacturing Fault'
        WRONG_SHIPMENT = 'wrong_shipment', 'Wrong Shipment'
        DISCONTINUED = 'discontinued', 'Discontinued'
        SEASON_END = 'season_end', 'Season End / Clearance'
        OTHER = 'other', 'Other'

    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='returns')
    date = models.DateField(default=timezone.localdate)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    reason = models.CharField(max_length=20, choices=Reason.choices, default=Reason.UNSOLD)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_outlet_returns')
    idempotency_key = models.CharField(max_length=255, null=True, blank=True, unique=True, help_text="Prevents duplicate creation on network retries")

    def __str__(self):
        return f"Return #{self.display_id} from {self.outlet.name} ({self.status})"

    def soft_delete(self):
        """Soft-Delete Cascade override."""
        if self.status != self.Status.DRAFT:
            raise ValueError("Cannot delete a return that has already been received.")
        
        super().soft_delete()
        for item in self.items.all():
            item.soft_delete()
            
    @transaction.atomic
    def receive(self, user):
        """
        Risk Mitigation: Target_Ledger & AVCO Protection
        Restores to 'both' ledgers in Main Inventory.
        Injects the frozen_cost_price back into StockService to prevent AVCO skew.
        """
        locked_return = OutletStockReturn.objects.select_for_update().get(id=self.id)
        if locked_return.status != self.Status.DRAFT:
            raise ValueError("Only draft returns can be received.")
            
        from inventory.services import StockService
        
        for item in self.items.all():
            if item.quantity <= 0:
                continue
                
            # 1. Deduct from Outlet Stock
            try:
                outlet_stock = OutletStock.objects.select_for_update().get(
                    outlet=self.outlet,
                    product_id=item.product_id
                )
                if outlet_stock.quantity < item.quantity:
                    raise ValueError(f"Outlet does not have enough stock of {item.product.name} to return.")
                
                outlet_stock.quantity -= item.quantity
                outlet_stock.save()
            except OutletStock.DoesNotExist:
                raise ValueError(f"Outlet has no stock record for {item.product.name}.")
                
            # 2. Add to Main Inventory (injecting frozen_cost_price)
            # Find the most recent transfer for this product to this outlet to grab the frozen cost
            last_transfer_item = OutletStockTransferItem.objects.filter(
                transfer__outlet=self.outlet,
                transfer__status='dispatched', # or received
                product_id=item.product_id,
                frozen_cost_price__isnull=False
            ).order_by('-created_at').first()
            
            unit_cost = last_transfer_item.frozen_cost_price if last_transfer_item else item.product.cost_price
            
            StockService.adjust_stock(
                product_id=item.product_id,
                adjustment_type='increase',
                quantity=item.quantity,
                unit_cost=unit_cost, # AVCO Protection injection
                reason='return',
                notes=f"Returned from Outlet {self.outlet.name} (Return #{self.display_id})",
                user=user,
                target_ledger='both'
            )
            
        self.status = self.Status.RECEIVED
        self.save(update_fields=['status', 'updated_at'])


class OutletStockReturnItem(SoftDeleteModel):
    return_record = models.ForeignKey(OutletStockReturn, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])

    def __str__(self):
        return f"{self.quantity} x {self.product.name}"

    def save(self, *args, **kwargs):
        if not self._state.adding and self.return_record.status != OutletStockReturn.Status.DRAFT:
            raise ValueError("Cannot modify items of a received return.")
        super().save(*args, **kwargs)


class OutletDailySale(DisplayIDMixin, SoftDeleteModel):
    """
    Daily sales record submitted by an outlet.
    """
    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='sales')
    date = models.DateField(default=timezone.localdate)
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='recorded_outlet_sales')
    
    # Idempotency
    idempotency_key = models.CharField(max_length=255, null=True, blank=True, unique=True, help_text="Prevents duplicate creation on network retries")

    # Financials (Calculated and cached on item save)
    gross_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    commission_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    net_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    def __str__(self):
        return f"Sale #{self.display_id} for {self.outlet.name} on {self.date}"

    def soft_delete(self):
        """Soft-Delete Cascade override."""
        super().soft_delete()
        for item in self.items.all():
            item.soft_delete()
            
    def recalculate_totals(self):
        """Aggregate financials from per-line-item commission calculations."""
        items = list(self.items.all())
        gross = sum(item.line_total for item in items)
        commission = sum(item.commission_amount for item in items)
        net = gross - commission
        self.gross_total = gross
        self.commission_amount = commission
        self.net_total = net.quantize(Decimal('0.01'))
        self.save(update_fields=['gross_total', 'commission_amount', 'net_total'])


class OutletDailySaleItem(SoftDeleteModel):
    sale = models.ForeignKey(OutletDailySale, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    unit_price = models.DecimalField(
        max_digits=10, 
        decimal_places=4,
        help_text="Temporal Pricing: Captured exactly at the moment of sale creation"
    )
    COMMISSION_TYPES = [
        ('percent', 'Percentage'),
        ('fixed', 'Fixed Amount'),
    ]
    commission_type = models.CharField(
        max_length=10, 
        choices=COMMISSION_TYPES, 
        default='percent',
        help_text="Frozen type of commission (Percentage or Fixed amount)"
    )
    commission_value = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        help_text="Frozen commission value applied to this line item at time of sale",
        null=True, blank=True
    )
    commission_amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Calculated commission amount for this line item"
    )
    commission_breakdown = models.JSONField(
        default=list, 
        help_text="Records the specific FIFO batches consumed by this sale line item for rollback capability"
    )

    @property
    def line_total(self):
        return self.quantity * self.unit_price

    def __str__(self):
        return f"{self.quantity} x {self.product.name} @ {self.unit_price}"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._original_quantity = self.quantity if self.pk else None

    @staticmethod
    def resolve_commission_rate(outlet, product):
        """
        1. Check for specific OutletProductCommission override.
        2. Fall back to product's global default_commission_type and default_commission_value.
        Returns a tuple: (type, value)
        """
        override = OutletProductCommission.objects.filter(outlet=outlet, product=product).first()
        if override:
            return override.commission_type, override.commission_value
        
        # Ensure default_commission_type is respected even if it's missing (should default to percent)
        return getattr(product, 'default_commission_type', 'percent'), product.default_commission_value

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        if is_new and not self.unit_price:
            self.unit_price = self.product.selling_price
        
        with transaction.atomic():
            if is_new:
                # Deduct from Outlet Stock and resolve commission via FIFO Queue
                try:
                    outlet_stock = OutletStock.objects.select_for_update().get(
                        outlet=self.sale.outlet,
                        product=self.product
                    )
                    if outlet_stock.quantity < self.quantity:
                        raise ValueError(f"Outlet does not have enough {self.product.name} to sell.")
                    
                    # FIFO Commission Resolution
                    queue = outlet_stock.commission_queue if outlet_stock.commission_queue is not None else []
                    remaining_q = self.quantity
                    popped_batches = []
                    total_commission = Decimal('0.00')
                    margin_per_unit = max(Decimal('0.00'), self.unit_price - self.product.cost_price)

                    while remaining_q > 0 and queue:
                        batch = queue[0]
                        if batch['qty'] <= remaining_q:
                            q_taken = batch['qty']
                            popped_batches.append({"qty": q_taken, "type": batch['type'], "val": batch['val']})
                            queue.pop(0)
                        else:
                            q_taken = remaining_q
                            popped_batches.append({"qty": q_taken, "type": batch['type'], "val": batch['val']})
                            queue[0]['qty'] -= q_taken

                        remaining_q -= q_taken
                        b_val = Decimal(str(batch['val']))
                        if batch['type'] == 'fixed':
                            total_commission += q_taken * b_val
                        else:
                            total_commission += (q_taken * margin_per_unit) * b_val / Decimal('100.00')

                    if remaining_q > 0:
                        # Fallback if queue runs out but stock exists (legacy data protection)
                        c_type, c_val = self.resolve_commission_rate(self.sale.outlet, self.product)
                        popped_batches.append({"qty": remaining_q, "type": c_type, "val": float(c_val)})
                        if c_type == 'fixed':
                            total_commission += remaining_q * c_val
                        else:
                            total_commission += (remaining_q * margin_per_unit) * c_val / Decimal('100.00')

                    self.commission_amount = total_commission.quantize(Decimal('0.01'))
                    self.commission_breakdown = popped_batches
                    
                    # Calculate AVCO Blended Commission Rate for display/legacy compat
                    if self.quantity > 0:
                        # For simplicity, if all batches were percent, we calculate the implied percent
                        # If mixed, we store it as 'percent' representing the total margin cut
                        self.commission_type = 'percent'
                        total_possible_margin = self.quantity * margin_per_unit
                        if total_possible_margin > 0:
                            self.commission_value = ((self.commission_amount / total_possible_margin) * Decimal('100')).quantize(Decimal('0.01'))
                        else:
                            self.commission_value = Decimal('0.00')

                    outlet_stock.quantity -= self.quantity
                    outlet_stock.commission_queue = queue
                    outlet_stock.save()
                    
                except OutletStock.DoesNotExist:
                    raise ValueError(f"Outlet has no stock of {self.product.name}.")
                
                super().save(*args, **kwargs)
                
            else:
                # Delta handling for post-sale edits
                delta = self.quantity - (self._original_quantity or 0)
                if delta != 0:
                    raise ValueError("Cannot edit quantity of an existing sale. Void the sale and create a new one.")
                super().save(*args, **kwargs)

            self._original_quantity = self.quantity
            self.sale.recalculate_totals()

    def soft_delete(self):
        """
        Void Protocol: Restores the OutletStock and prepends the popped batches back to the FIFO queue.
        """
        with transaction.atomic():
            super().soft_delete()
            outlet_stock = OutletStock.objects.select_for_update().get(
                outlet=self.sale.outlet,
                product=self.product
            )
            outlet_stock.quantity += self.quantity
            queue = outlet_stock.commission_queue if outlet_stock.commission_queue is not None else []
            
            # Prepend the batches back to the front of the queue to restore original FIFO state
            if hasattr(self, 'commission_breakdown') and self.commission_breakdown:
                queue = self.commission_breakdown + queue
            else:
                # Legacy fallback
                c_type, c_val = self.resolve_commission_rate(self.sale.outlet, self.product)
                queue.insert(0, {"qty": self.quantity, "type": c_type, "val": float(c_val)})
                
            outlet_stock.commission_queue = queue
            outlet_stock.save()
            self.sale.recalculate_totals()


class OutletPayment(DisplayIDMixin, SoftDeleteModel):
    """
    Payments received from the Outlet for consignment sales.
    """
    class PaymentMethod(models.TextChoices):
        CASH = 'cash', 'Cash'
        BANK = 'bank', 'Bank Transfer'

    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='payments')
    date = models.DateField(default=timezone.localdate)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices)
    reference_id = models.CharField(max_length=100, blank=True)
    
    # Integration Hooks
    destination_bank = models.ForeignKey('finance.BankAccount', on_delete=models.PROTECT, null=True, blank=True)
    destination_wallet = models.ForeignKey('finance.CashWallet', on_delete=models.PROTECT, null=True, blank=True)
    
    # Hard Links for Ledger Safety
    bank_transaction = models.OneToOneField('finance.BankTransaction', on_delete=models.SET_NULL, null=True, blank=True)
    wallet_transaction = models.OneToOneField('finance.CashWalletTransaction', on_delete=models.SET_NULL, null=True, blank=True)
    
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    def __str__(self):
        return f"Payment of {self.amount} from {self.outlet.name}"

    @transaction.atomic
    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        
        if is_new:
            # Finance Ledger Integration
            if self.payment_method == self.PaymentMethod.BANK and self.destination_bank:
                from finance.models import BankTransaction
                bt = BankTransaction.objects.create(
                    account=self.destination_bank,
                    transaction_type='deposit',
                    date=self.date,
                    amount=self.amount,
                    description=f"Outlet Payment: {self.outlet.name}",
                    reference=self.reference_id,
                    recorded_by=self.recorded_by
                )
                self.bank_transaction = bt
                super().save(update_fields=['bank_transaction'])
                
            elif self.payment_method == self.PaymentMethod.CASH and self.destination_wallet:
                from finance.models import CashWalletTransaction, CashWallet
                wallet = CashWallet.objects.select_for_update().get(pk=self.destination_wallet.pk)
                new_balance = wallet.balance + self.amount
                cwt = CashWalletTransaction.objects.create(
                    wallet=wallet,
                    transaction_type='deposit',
                    amount=self.amount,
                    description=f"Outlet Payment: {self.outlet.name}",
                    reference_id=self.reference_id,
                    balance_after=new_balance,
                    date=self.date,
                    created_by=self.recorded_by
                )
                wallet.balance = new_balance
                wallet.save(update_fields=['balance'])
                self.wallet_transaction = cwt
                super().save(update_fields=['wallet_transaction'])

    @transaction.atomic
    def soft_delete(self):
        """
        Risk Mitigation: Bank Ledger Hard Links
        Deleting an OutletPayment must explicitly hard-delete the BankTransaction 
        to reverse the bank balance, since soft-deleting a payment won't touch the bank ledger.
        """
        super().soft_delete()
        if self.bank_transaction:
            self.bank_transaction.delete() # Triggers BankTransaction balance reversal logic
            
        if self.wallet_transaction:
            from finance.models import CashWallet
            wallet = CashWallet.objects.select_for_update().get(pk=self.destination_wallet.pk)
            wallet.balance -= self.wallet_transaction.amount
            wallet.save(update_fields=['balance'])
            self.wallet_transaction.delete()
