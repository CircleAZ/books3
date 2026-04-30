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
    commission_percentage = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text="Percentage of gross sales kept by the outlet"
    )
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} (Commission: {self.commission_percentage}%)"
    
    # Financial Properties
    @property
    def total_gross_sales(self):
        return sum(sale.gross_total for sale in self.sales.all_objects.filter(is_deleted=False))
        
    @property
    def total_commission(self):
        return sum(sale.commission_amount for sale in self.sales.all_objects.filter(is_deleted=False))
        
    @property
    def total_net_sales(self):
        return sum(sale.net_total for sale in self.sales.all_objects.filter(is_deleted=False))
        
    @property
    def total_paid(self):
        return sum(payment.amount for payment in self.payments.all_objects.filter(is_deleted=False))
        
    @property
    def outstanding_balance(self):
        """The Finn Protocol: Outstanding Balance = SUM(Net Receivable) - SUM(OutletPayments)"""
        return self.total_net_sales - self.total_paid


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
    date = models.DateField(default=timezone.now)
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
    date = models.DateField(default=timezone.now)
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
