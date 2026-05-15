from django.db import models
from core.models import SoftDeleteModel, UUIDPrimaryKeyModel, DisplayIDMixin
from django.conf import settings
from decimal import Decimal
from django.core.validators import MinValueValidator

class Transporter(SoftDeleteModel):
    name = models.CharField(max_length=200, unique=True)
    contact_name = models.CharField(max_length=100, blank=True)
    contact_phone = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return self.name

class PurchaseOrder(DisplayIDMixin, SoftDeleteModel):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        ORDERED = 'ordered', 'Ordered'
        PARTIAL = 'partially_received', 'Partially Received'
        RECEIVED = 'received', 'Fully Received'
        CANCELLED = 'cancelled', 'Cancelled'

    class PaymentStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PARTIAL = 'partial', 'Partial'
        PAID = 'paid', 'Paid'

    vendor = models.ForeignKey('inventory.Vendor', on_delete=models.PROTECT, related_name='purchase_orders')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    payment_status = models.CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING)
    
    order_date = models.DateField(auto_now_add=True)
    expected_delivery_date = models.DateField(null=True, blank=True)
    
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    total_charges = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    is_historical_bypass = models.BooleanField(default=False, help_text="Tainted flag indicating this PO bypassed standard inventory/financial logic.")

    def __str__(self):
        return f"PO #{self.display_id} - {self.vendor.name}"

class PurchaseOrderItem(UUIDPrimaryKeyModel):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('inventory.Product', on_delete=models.PROTECT, related_name='purchase_order_items')
    
    vendor_pack_size = models.PositiveIntegerField(default=1, help_text="Number of units per vendor pack")
    purchased_packs = models.PositiveIntegerField(default=1, help_text="Number of packs purchased")
    
    # Store the intended base units to detect vendor pack mismatches (Risk 4)
    ordered_quantity = models.PositiveIntegerField(help_text="Total base units ordered (packs * pack_size)")
    
    # Explicitly confirmed units received
    received_packs = models.PositiveIntegerField(default=0, help_text="Packs explicitly confirmed by warehouse")
    
    unit_cost_price = models.DecimalField(max_digits=10, decimal_places=4, help_text="Vendor quote per base unit")
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    def save(self, *args, **kwargs):
        self.ordered_quantity = self.purchased_packs * self.vendor_pack_size
        self.line_total = Decimal(str(self.ordered_quantity)) * self.unit_cost_price
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.ordered_quantity}x {self.product.name} (PO #{self.purchase_order.display_id})"

class PurchaseCharge(UUIDPrimaryKeyModel):
    class ChargeType(models.TextChoices):
        TRANSPORT = 'transport', 'Transport'
        PACKING = 'packing', 'Packing'
        HANDLING = 'handling', 'Handling'
        OTHER = 'other', 'Other'

    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='charges')
    charge_type = models.CharField(max_length=20, choices=ChargeType.choices)
    transporter = models.ForeignKey(Transporter, on_delete=models.SET_NULL, null=True, blank=True)
    
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    description = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"{self.get_charge_type_display()} for PO #{self.purchase_order.display_id}: {self.amount}"

class PurchasePayment(UUIDPrimaryKeyModel):
    class PaymentMethod(models.TextChoices):
        CASH = 'cash', 'Cash'
        BANK = 'bank', 'Bank Transfer'
        EMPLOYEE_EXPENSE = 'employee_expense', 'Employee Expense'

    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='payments')
    purchase_charge = models.ForeignKey(PurchaseCharge, on_delete=models.SET_NULL, null=True, blank=True, help_text="If this payment is specifically for a transport/packing charge")
    
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices)
    
    paid_by_employee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name='procurement_payments')
    finance_expense = models.ForeignKey('finance.Expense', on_delete=models.SET_NULL, null=True, blank=True, related_name='procurement_payments')
    
    # Payment source routing (Phase 5)
    source_wallet = models.ForeignKey('finance.CashWallet', on_delete=models.SET_NULL, null=True, blank=True, help_text="Cash wallet for Cash payments")
    source_bank = models.ForeignKey('finance.BankAccount', on_delete=models.SET_NULL, null=True, blank=True, help_text="Bank account for Bank payments")
    
    payment_date = models.DateField(auto_now_add=True)
    reference_id = models.CharField(max_length=100, blank=True)
    is_historical_bypass = models.BooleanField(default=False, help_text="Tainted flag indicating this Payment bypassed standard financial logic.")

    def __str__(self):
        return f"{self.amount} via {self.get_payment_method_display()} for PO #{self.purchase_order.display_id}"
