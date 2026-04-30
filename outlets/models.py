from decimal import Decimal
from django.db import models, transaction
from django.conf import settings
from django.core.validators import MinValueValidator
from django.utils import timezone
from core.models import SoftDeleteModel, UUIDPrimaryKeyModel, DisplayIDMixin
from inventory.models import Product

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

    def __str__(self):
        return self.name
    
    # Financial Properties
    @property
    def total_gross_sales(self):
        return sum(sale.gross_total for sale in self.sales.all())
        
    @property
    def total_commission(self):
        return sum(sale.commission_amount for sale in self.sales.all())
        
    @property
    def total_net_sales(self):
        return sum(sale.net_total for sale in self.sales.all())
        
    @property
    def total_paid(self):
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
    commission_percentage = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Specific commission percentage for this product at this outlet"
    )

    class Meta:
        unique_together = ('outlet', 'product')

    def __str__(self):
        return f"{self.outlet.name} - {self.product.name}: {self.commission_percentage}%"


class OutletStock(UUIDPrimaryKeyModel):
    """
    Live ledger of physical stock currently held at the outlet.
    """
    outlet = models.ForeignKey(Outlet, on_delete=models.CASCADE, related_name='stock')
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='outlet_stock')
    quantity = models.IntegerField(default=0)
    
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
        if self.status != self.Status.DRAFT:
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
            
            # 3. Add to Outlet Stock
            outlet_stock, created = OutletStock.objects.select_for_update().get_or_create(
                outlet=self.outlet,
                product_id=item.product_id,
                defaults={'quantity': 0}
            )
            outlet_stock.quantity += item.quantity
            outlet_stock.save()
            
        self.status = self.Status.DISPATCHED
        self.save(update_fields=['status', 'updated_at'])


class OutletStockTransferItem(SoftDeleteModel):
    transfer = models.ForeignKey(OutletStockTransfer, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    frozen_cost_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="AVCO Protection: Cost price at the exact moment of dispatch"
    )

    def __str__(self):
        return f"{self.quantity} x {self.product.name}"


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

    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='returns')
    date = models.DateField(default=timezone.localdate)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    reason = models.CharField(max_length=20, choices=Reason.choices, default=Reason.UNSOLD)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_outlet_returns')

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
        if self.status != self.Status.DRAFT:
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


class OutletDailySale(DisplayIDMixin, SoftDeleteModel):
    """
    Daily sales record submitted by an outlet.
    """
    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name='sales')
    date = models.DateField(default=timezone.localdate)
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='recorded_outlet_sales')
    
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
        decimal_places=2,
        help_text="Temporal Pricing: Captured exactly at the moment of sale creation"
    )
    commission_percentage = models.DecimalField(
        max_digits=5, 
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Frozen commission percentage at the time of sale"
    )
    commission_amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Calculated commission amount for this line item"
    )

    @property
    def line_total(self):
        return self.quantity * self.unit_price

    def __str__(self):
        return f"{self.quantity} x {self.product.name} @ {self.unit_price}"

    @staticmethod
    def resolve_commission_rate(outlet, product):
        """
        Two-Tier Commission Hierarchy:
        1. Check for outlet-specific override (OutletProductCommission)
        2. Fall back to product's global default_commission
        """
        try:
            override = OutletProductCommission.objects.get(
                outlet=outlet, product=product
            )
            return override.commission_percentage
        except OutletProductCommission.DoesNotExist:
            return product.default_commission

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        if is_new and not self.unit_price:
            # Temporal Pricing Constraint
            self.unit_price = self.product.selling_price
        
        if is_new:
            # Freeze the commission rate at time of sale
            self.commission_percentage = self.resolve_commission_rate(
                self.sale.outlet, self.product
            )
            
        # Calculate commission amount from frozen rate
        line = self.quantity * self.unit_price
        self.commission_amount = (line * self.commission_percentage / Decimal('100.00')).quantize(Decimal('0.01'))
            
        with transaction.atomic():
            super().save(*args, **kwargs)
            if is_new:
                # Deduct from Outlet Stock
                try:
                    outlet_stock = OutletStock.objects.select_for_update().get(
                        outlet=self.sale.outlet,
                        product=self.product
                    )
                    if outlet_stock.quantity < self.quantity:
                        raise ValueError(f"Outlet does not have enough {self.product.name} to sell.")
                    outlet_stock.quantity -= self.quantity
                    outlet_stock.save()
                except OutletStock.DoesNotExist:
                    raise ValueError(f"Outlet has no stock of {self.product.name}.")
            
            # Recalculate parent sale
            self.sale.recalculate_totals()

    def soft_delete(self):
        """
        Void Protocol: Restores the OutletStock upon deletion.
        """
        with transaction.atomic():
            super().soft_delete()
            outlet_stock = OutletStock.objects.select_for_update().get(
                outlet=self.sale.outlet,
                product=self.product
            )
            outlet_stock.quantity += self.quantity
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
