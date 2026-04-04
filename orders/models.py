"""
Order Management models for POS functionality.
"""
import uuid as uuid_lib
from django.db import models
from simple_history.models import HistoricalRecords
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from decimal import Decimal
from core.models import SoftDeleteModel, UUIDPrimaryKeyModel, DisplayIDMixin


class Order(DisplayIDMixin, SoftDeleteModel):
    history = HistoricalRecords()

    """
    Order entity representing a customer purchase.
    Supports both registered customers and guest checkout.
    """
    # Status choices
    PAYMENT_STATUS = [
        ('pending', 'Pending'),
        ('partial', 'Partially Paid'),
        ('paid', 'Paid'),
        ('overpaid', 'Overpaid'),
        ('refunded', 'Refunded'),
    ]
    
    DELIVERY_STATUS = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('ready', 'Ready'),
        ('delivered', 'Delivered'),
    ]
    
    ORDER_STATUS = [
        ('draft', 'Draft'),
        ('confirmed', 'Confirmed'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    RETURN_STATUS = [
        ('na', 'N/A'),
        ('pending', 'Pending'),
        ('received', 'Item Received'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    REFUND_STATUS = [
        ('na', 'N/A'),
        ('pending', 'Pending'),
        ('partial', 'Partial'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    CANCELLATION_STATUS = [
        ('na', 'N/A'),
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    DISCOUNT_TYPE = [
        ('percent', 'Percentage'),
        ('fixed', 'Fixed Amount'),
    ]

    # ── State Transition Matrix ──
    # Defines legal transitions for each status field.
    # payment_status is EXCLUDED — it's always auto-computed.
    VALID_TRANSITIONS = {
        'order_status': {
            'draft': ['confirmed', 'cancelled'],
            'confirmed': ['completed', 'cancelled'],
            'completed': [],   # Terminal — use returns/refunds
            'cancelled': [],   # Terminal
        },
        'delivery_status': {
            'pending': ['processing'],
            'processing': ['ready', 'pending'],   # Allow rollback
            'ready': ['delivered', 'processing'],  # Allow rollback
            'delivered': [],  # Terminal — Ironclad lock
        },
        'cancellation_status': {
            'na': ['pending'],
            'pending': ['completed', 'cancelled'],  # Approve or reject
            'completed': [],
            'cancelled': ['na'],  # Reset after rejected cancellation
        },
        'return_status': {
            'na': ['pending'],
            'pending': ['received', 'cancelled'],
            'received': ['completed'],
            'completed': [],
            'cancelled': ['na'],
        },
        'refund_status': {
            'na': ['pending'],
            'pending': ['partial', 'completed', 'cancelled'],
            'partial': ['completed'],
            'completed': [],
            'cancelled': ['na'],
        },
    }
    
    # Customer - either registered or guest
    customer = models.ForeignKey(
        'customers.Customer', 
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='orders'
    )
    is_guest = models.BooleanField(default=False)
    guest_name = models.CharField(max_length=200, blank=True)
    guest_phone = models.CharField(max_length=20, blank=True)
    guest_email = models.EmailField(blank=True)
    
    # Status fields
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS, default='pending')
    delivery_status = models.CharField(max_length=20, choices=DELIVERY_STATUS, default='pending')
    order_status = models.CharField(max_length=20, choices=ORDER_STATUS, default='draft')
    return_status = models.CharField(max_length=20, choices=RETURN_STATUS, default='na')
    refund_status = models.CharField(max_length=20, choices=REFUND_STATUS, default='na')
    cancellation_status = models.CharField(max_length=20, choices=CANCELLATION_STATUS, default='na')
    
    # Cached derived status for DB-level filtering
    overall_status = models.CharField(max_length=40, default='Draft', blank=True)
    
    # Financial
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_type = models.CharField(max_length=10, choices=DISCOUNT_TYPE, blank=True)
    discount_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Metadata
    notes = models.TextField(blank=True)
    
    # Receipt & delivery (Tribunal Commandments #1, #7, #8)
    receipt_uuid = models.UUIDField(
        default=uuid_lib.uuid4, unique=True, editable=False,
        help_text="Public UUID for receipt access URL (/r/{uuid})"
    )
    delivered_at = models.DateTimeField(
        null=True, blank=True,
        help_text="When the order was physically delivered (auto-set)"
    )
    last_reminder_sent = models.DateTimeField(
        null=True, blank=True,
        help_text="Last overdue reminder sent (max 1/week)"
    )
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='orders_created'
    )
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        customer_name = self.guest_name if self.is_guest else (self.customer.full_name if self.customer else 'Unknown')
        return f"Order #{self.display_id} - {customer_name}"
    
    def calculate_totals(self):
        """Recalculate subtotal, discount, and total from items."""
        self.subtotal = sum(item.line_total for item in self.items.all())
        
        # Calculate order-level discount
        if self.discount_type == 'percent' and self.discount_value:
            self.discount_amount = (self.subtotal * self.discount_value / 100).quantize(Decimal('0.01'))
        elif self.discount_type == 'fixed' and self.discount_value:
            self.discount_amount = min(self.discount_value, self.subtotal)
        else:
            self.discount_amount = Decimal('0')
        
        self.total = self.subtotal - self.discount_amount
        self.save(update_fields=['subtotal', 'discount_amount', 'total'])
    
    def update_payment_status(self):
        """Update payment status based on payments and refunds."""
        total_paid = sum(p.amount for p in self.payments.all())
        total_refunded = sum(
            r.amount for r in self.refunds.filter(status='completed')
        )
        
        if total_refunded >= total_paid and total_paid > 0:
            self.payment_status = 'refunded'
        elif total_paid > self.total:
            self.payment_status = 'overpaid'
        elif total_paid == self.total:
            self.payment_status = 'paid'
        elif total_paid > 0:
            self.payment_status = 'partial'
        else:
            self.payment_status = 'pending'
        
        # Auto-transition: first payment on draft → confirmed
        if total_paid > 0 and self.order_status == 'draft':
            self.order_status = 'confirmed'
            self.save(update_fields=['payment_status', 'order_status'])
        else:
            self.save(update_fields=['payment_status'])
    
    @property
    def amount_paid(self):
        return sum(p.amount for p in self.payments.all())
    
    @property
    def balance_due(self):
        return max(Decimal('0'), self.total - self.amount_paid)
    
    @property
    def change_due(self):
        """For cash overpayment."""
        return max(Decimal('0'), self.amount_paid - self.total)
    
    @property
    def derived_status(self):
        """
        Compute overall order status from sub-statuses.
        Priority ladder — first match wins.
        """
        # ── Priority 1: Cancellation Pending ──
        if self.cancellation_status == 'pending':
            return 'Cancellation Pending'

        # ── Priority 2: Cancellation Completed ──
        if self.cancellation_status == 'completed':
            if (self.payment_status in ('partial', 'paid', 'overpaid')
                    and self.refund_status in ('na', 'pending', 'partial')):
                return 'Cancelled \u2014 Refund Pending'
            return 'Order Cancelled'

        # ── Priority 3: Post-delivery exceptions ──
        if (self.return_status == 'received'
                and self.refund_status in ('na', 'pending', 'partial')):
            return 'Return Received \u2014 Process Refund'

        if (self.payment_status == 'overpaid'
                and self.refund_status in ('na', 'pending', 'partial')):
            return 'Overpaid \u2014 Refund Due'

        if (self.delivery_status == 'delivered'
                and self.payment_status in ('pending', 'partial')):
            return 'Delivered - Awaiting Payment'

        # ── Priority 4: Perfect completion ──
        if (self.delivery_status == 'delivered'
                and self.payment_status in ('paid', 'overpaid', 'refunded')
                and self.return_status in ('na', 'completed', 'cancelled')
                and self.refund_status in ('na', 'completed', 'cancelled')):
            return 'Order Complete'

        # ── Priority 5: Active processes on delivered orders ──
        if self.delivery_status == 'delivered':
            if self.refund_status in ('pending', 'partial'):
                return 'Refund in Progress'
            if self.return_status == 'pending':
                return 'Return in Progress'

        # ── Priority 6: Delivery workflow ──
        if self.delivery_status == 'processing':
            return 'Processing'
        if self.delivery_status == 'ready':
            return 'Ready for Pickup'

        # ── Priority 7: Order lifecycle ──
        if self.order_status == 'draft':
            return 'Draft'
        if self.order_status == 'confirmed':
            return 'Confirmed'
        if self.delivery_status == 'pending':
            return 'Pending'

        return 'Processing'

    def _refresh_overall_status(self):
        """Recompute and cache the overall_status DB field."""
        self.overall_status = self.derived_status
    
    @property
    def can_edit(self):
        """Check if order can be edited."""
        return (
            self.delivery_status != 'delivered'
            and self.cancellation_status in ('na', 'cancelled')
        )
    
    @property
    def can_cancel(self):
        """Check if order can be cancelled."""
        return (
            self.delivery_status != 'delivered'
            and self.order_status not in ('completed', 'cancelled')
            and self.cancellation_status == 'na'
        )

    def validate_transition(self, field, new_value):
        """Validate that a status transition is legal per the transition matrix."""
        if field == 'payment_status':
            raise ValidationError("Payment status is auto-computed and cannot be set manually.")
        if field not in self.VALID_TRANSITIONS:
            raise ValidationError(f"Unknown status field: {field}")
        
        old_value = getattr(self, field)
        allowed = self.VALID_TRANSITIONS[field].get(old_value, [])
        if new_value not in allowed:
            raise ValidationError(
                f"Illegal transition: {field} cannot go from '{old_value}' to '{new_value}'. "
                f"Allowed: {allowed or 'none (terminal state)'}."
            )

    def validate_state_consistency(self):
        """Guard impossible state combinations."""
        if self.delivery_status == 'delivered' and self.order_status == 'draft':
            raise ValidationError("Impossible state: delivered order cannot be in draft.")
        if self.cancellation_status in ('pending', 'completed') and self.delivery_status == 'delivered':
            raise ValidationError("Cannot cancel a delivered order. Use Return workflow.")

    def clean(self):
        """Validate state constraints."""
        self.validate_state_consistency()
             
    def cancel_order(self):
        """Request cancellation (step 1 of 2-step flow). Sets status to pending."""
        if not self.can_cancel:
            raise ValidationError("Order cannot be cancelled in its current state.")
        self.cancellation_status = 'pending'
        self._refresh_overall_status()
        self.save(update_fields=['cancellation_status', 'overall_status'])

    def approve_cancellation(self):
        """Approve a pending cancellation (step 2). Finalizes the cancellation."""
        if self.cancellation_status != 'pending':
            raise ValidationError("No pending cancellation to approve.")
        self.cancellation_status = 'completed'
        self.order_status = 'cancelled'
        self._refresh_overall_status()
        self.save(update_fields=['cancellation_status', 'order_status', 'overall_status'])

    def reject_cancellation(self):
        """Reject a pending cancellation. Resets to normal."""
        if self.cancellation_status != 'pending':
            raise ValidationError("No pending cancellation to reject.")
        self.cancellation_status = 'na'
        self._refresh_overall_status()
        self.save(update_fields=['cancellation_status', 'overall_status'])

    def save(self, *args, **kwargs):
        """Auto-refresh overall_status on every save."""
        # Auto-set delivered_at when delivery transitions to 'delivered'
        if self.delivery_status == 'delivered' and not self.delivered_at:
            self.delivered_at = timezone.now()
        # Auto-transition: delivery=delivered → order=completed
        if self.delivery_status == 'delivered' and self.order_status in ('draft', 'confirmed'):
            self.order_status = 'completed'
        self._refresh_overall_status()
        super().save(*args, **kwargs)


class OrderItem(UUIDPrimaryKeyModel):
    """
    Line item in an order.
    """
    DISCOUNT_TYPE = [
        ('percent', 'Percentage'),
        ('fixed', 'Fixed Amount'),
    ]
    
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(
        'inventory.Product',
        on_delete=models.PROTECT,
        related_name='order_items'
    )
    
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    cost_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Product cost at time of sale")
    
    # Line discount
    discount_type = models.CharField(max_length=10, choices=DISCOUNT_TYPE, blank=True)
    discount_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    def __str__(self):
        return f"{self.product.name} x {self.quantity}"
    
    def save(self, *args, **kwargs):
        # Freeze cost price at time of sale if not set
        if self.cost_price is None and self.product:
            self.cost_price = self.product.cost_price

        # Calculate line discount and total
        gross = self.unit_price * self.quantity
        
        if self.discount_type == 'percent' and self.discount_value:
            self.discount_amount = (gross * self.discount_value / 100).quantize(Decimal('0.01'))
        elif self.discount_type == 'fixed' and self.discount_value:
            self.discount_amount = min(self.discount_value, gross)
        else:
            self.discount_amount = Decimal('0')
        
        self.line_total = gross - self.discount_amount
        super().save(*args, **kwargs)


class Payment(UUIDPrimaryKeyModel):
    """
    Payment record for an order. Supports multiple payments per order.
    """
    PAYMENT_METHODS = [
        ('cash', 'Cash'),
        ('upi', 'UPI'),
    ]
    
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='payments')
    method = models.CharField(max_length=20, choices=PAYMENT_METHODS)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    upi_reference = models.CharField(max_length=100, blank=True, 
        help_text="UPI transaction reference or account used")
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True
    )
    
    class Meta:
        ordering = ['created_at']
    
    def __str__(self):
        return f"{self.method}: ₹{self.amount}"
    
    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Update order payment status after saving
        self.order.update_payment_status()
        
        # Dispatch payment notification + update R2 snapshot
        # Wrapped in try/except: payment must never fail due to messaging/R2
        try:
            from messaging.dispatch import dispatch_payment_update
            dispatch_payment_update(self.order, payment=self)
        except Exception:
            import logging
            logging.getLogger(__name__).exception("Payment dispatch failed for order #%s", self.order.display_id)
        
        try:
            from messaging.r2 import update_receipt_snapshot
            update_receipt_snapshot(self.order)
        except Exception:
            import logging
            logging.getLogger(__name__).exception("R2 snapshot failed for order #%s", self.order.display_id)


class OrderStatusHistory(UUIDPrimaryKeyModel):
    """
    Track all status changes on an order for audit trail.
    """
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='status_history')
    status_field = models.CharField(max_length=30, help_text="Field that changed, e.g. 'payment_status'")
    old_value = models.CharField(max_length=30)
    new_value = models.CharField(max_length=30)
    note = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True
    )
    
    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'Order status histories'
    
    def __str__(self):
        return f"Order #{self.order.display_id}: {self.status_field} {self.old_value} → {self.new_value}"


class OrderNote(UUIDPrimaryKeyModel):
    """
    Notes attached to an order for internal communication.
    """
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='order_notes')
    content = models.TextField()
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True
    )
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Note on Order #{self.order.display_id}"


class ReturnReason(SoftDeleteModel):
    """
    Reasons for returning items (e.g., Damaged, Wrong Item, Changed Mind).
    """
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    
    class Meta:
        ordering = ['name']
    
    def __str__(self):
        return self.name


class Return(DisplayIDMixin, SoftDeleteModel):
    history = HistoricalRecords()

    """
    Return request for an order. Tracks the return process from initiation to completion.
    """
    RETURN_STATUS = [
        ('initiated', 'Initiated'),
        ('items_received', 'Items Received'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='returns')
    status = models.CharField(max_length=20, choices=RETURN_STATUS, default='initiated')
    notes = models.TextField(blank=True)
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='returns_created'
    )
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Return #{self.display_id} for Order #{self.order.display_id}"
    
    @property
    def total_refund_amount(self):
        """Calculate total refund amount for items in this return."""
        return sum(
            item.order_item.unit_price * item.quantity
            for item in self.items.all()
        )
    
    @property
    def item_count(self):
        return self.items.count()


class ReturnItem(UUIDPrimaryKeyModel):
    """
    Individual item being returned as part of a Return request.
    """
    STOCK_ACTION = [
        ('return_to_stock', 'Return to Inventory'),
        ('damaged', 'Mark as Damaged'),
    ]
    
    return_request = models.ForeignKey(Return, on_delete=models.CASCADE, related_name='items')
    order_item = models.ForeignKey(OrderItem, on_delete=models.PROTECT, related_name='return_items')
    quantity = models.PositiveIntegerField()
    reason = models.ForeignKey(ReturnReason, on_delete=models.SET_NULL, null=True, blank=True)
    stock_action = models.CharField(max_length=20, choices=STOCK_ACTION, default='return_to_stock')
    stock_restored = models.BooleanField(default=False, help_text="Whether stock was restored for this item")
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.order_item.product.name} x {self.quantity}"
    
    def restore_stock(self, user=None):
        """Restore stock for this item if marked for return to inventory."""
        if self.stock_restored or self.stock_action != 'return_to_stock':
            return False
        
        from inventory.models import Product, StockHistory
        
        product = self.order_item.product
        product.stock_quantity += self.quantity
        product.save(update_fields=['stock_quantity'])
        
        # Create stock history entry
        StockHistory.objects.create(
            product=product,
            quantity_change=self.quantity,
            quantity_after=product.stock_quantity,
            cost_at_time=product.cost_price,
            reason='return',
            notes=f"Return #{self.return_request.display_id} - {self.reason.name if self.reason else 'No reason'}",
            created_by=user
        )
        
        self.stock_restored = True
        self.save(update_fields=['stock_restored'])
        return True


class Refund(UUIDPrimaryKeyModel):
    history = HistoricalRecords()

    """
    Refund payment record. Can be linked to a Return or directly to an Order.
    """
    REFUND_STATUS = [
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    REFUND_METHOD = [
        ('cash', 'Cash'),
        ('upi', 'UPI'),
    ]
    
    return_request = models.ForeignKey(
        Return, on_delete=models.SET_NULL, 
        null=True, blank=True, 
        related_name='refunds'
    )
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='refunds')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=20, choices=REFUND_METHOD)
    transaction_id = models.CharField(max_length=100, blank=True, help_text="UPI reference or transaction ID")
    note = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=REFUND_STATUS, default='completed')
    
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='refunds_created'
    )
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Refund ₹{self.amount} for Order #{self.order.display_id}"
    
    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Update order refund status
        self._update_order_refund_status()
    
    def _update_order_refund_status(self):
        """Update the order's refund_status based on total refunds."""
        total_refunded = sum(r.amount for r in self.order.refunds.filter(status='completed'))
        
        if total_refunded >= self.order.total:
            self.order.refund_status = 'completed'
        elif total_refunded > 0:
            self.order.refund_status = 'partial'
        else:
            self.order.refund_status = 'pending'
        
        self.order.save(update_fields=['refund_status'])
        # Also refresh payment_status to handle 'refunded' state
        self.order.update_payment_status()


class CreditNote(DisplayIDMixin, UUIDPrimaryKeyModel):
    """
    Credit note record for a refund. PDF generation to be added in Phase 16.
    """
    refund = models.OneToOneField(Refund, on_delete=models.CASCADE, related_name='credit_note')
    created_at = models.DateTimeField(auto_now_add=True)
    # pdf_file = models.FileField(upload_to='credit_notes/', null=True, blank=True)  # Phase 16
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Credit Note #{self.display_id} for Refund ₹{self.refund.amount}"
