"""
Order Management models for POS functionality.
"""
from django.db import models
from django.conf import settings
from decimal import Decimal
from core.models import SoftDeleteModel, UUIDPrimaryKeyModel, DisplayIDMixin


class Order(DisplayIDMixin, SoftDeleteModel):
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
    
    # Financial
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_type = models.CharField(max_length=10, choices=DISCOUNT_TYPE, blank=True)
    discount_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Metadata
    notes = models.TextField(blank=True)
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
        """Update payment status based on payments received."""
        total_paid = sum(p.amount for p in self.payments.all())
        
        if total_paid > self.total:
            self.payment_status = 'overpaid'
        elif total_paid == self.total:
            self.payment_status = 'paid'
        elif total_paid > 0:
            self.payment_status = 'partial'
        else:
            self.payment_status = 'pending'
        
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
        Follows P4.md §3.6 precedence rules with UI-friendly enhancements.

        Precedence (per P4 §3.6):
          1. Cancellation Pending  (§3.6.1)
          2. Cancellation Completed → Action Needed / Order Cancelled  (§3.6.2)
          3. Return Received + refund unresolved → Action Needed  (§3.6.3.1)
          4. Overpaid + refund unresolved → Action Needed  (§3.6.3.2)
          5. Delivered + unpaid → Delivered - Awaiting Payment  (§3.6.3.3)
          6. Delivered + paid + all resolved → Order Complete  (§3.6.3.4)
          7. Enhancement: Refund/Return in-progress states
          8. Delivery in-progress states
          9. Default catch-all → Processing  (§3.6.3.5)
        """
        # ── §3.6.1: Cancellation Pending (absolute precedence) ──
        if self.cancellation_status == 'pending':
            return 'Cancellation Pending'

        # ── §3.6.2: Cancellation Completed ──
        if self.cancellation_status == 'completed':
            # §3.6.2.1: Payment was collected but refund not fully resolved
            if (self.payment_status in ('partial', 'paid', 'overpaid')
                    and self.refund_status in ('na', 'pending', 'partial')):
                return 'Action Needed'
            # §3.6.2.2: No payment made, or refund already resolved
            return 'Order Cancelled'

        # ── §3.6.3: Order not cancelled (cancellation is NA or itself cancelled) ──

        # §3.6.3.1: Returned items received, refund/resolution pending
        if (self.return_status == 'received'
                and self.refund_status in ('na', 'pending', 'partial')):
            return 'Action Needed'

        # §3.6.3.2: Overpaid, refund for overage not resolved
        if (self.payment_status == 'overpaid'
                and self.refund_status in ('na', 'pending', 'partial')):
            return 'Action Needed'

        # §3.6.3.3: Delivered but awaiting payment
        if (self.delivery_status == 'delivered'
                and self.payment_status in ('pending', 'partial')):
            return 'Delivered - Awaiting Payment'

        # §3.6.3.4: Order Complete (fully delivered, paid, all processes resolved)
        if (self.delivery_status == 'delivered'
                and self.payment_status in ('paid', 'overpaid')
                and self.return_status in ('na', 'completed', 'cancelled')
                and self.refund_status in ('na', 'completed', 'cancelled')):
            return 'Order Complete'

        # ── Enhancement: Active refund/return on delivered orders ──
        # (Cases not explicitly in P4 but useful for UI clarity)
        if self.delivery_status == 'delivered':
            if self.refund_status in ('pending', 'partial'):
                return 'Refund in Progress'
            if self.return_status == 'pending':
                return 'Return in Progress'

        # ── Delivery in-progress states ──
        if self.delivery_status == 'processing':
            return 'Processing'
        if self.delivery_status == 'ready':
            return 'Ready for Pickup'

        # ── §3.6.3.5: Default catch-all for active orders ──
        # Default catch-all for active orders
        if self.order_status == 'draft':
            return 'Draft'
        if self.order_status == 'confirmed':
            return 'Confirmed'

        # order_status == 'completed' but delivery/payment still pending
        if self.delivery_status == 'pending':
            return 'Pending'

        return 'Processing'
    
    @property
    def can_edit(self):
        """Check if order can be edited (not delivered yet)."""
        return self.delivery_status != 'delivered' and self.cancellation_status == 'na'
    
    @property
    def can_cancel(self):
        """Check if order can be cancelled."""
        return self.delivery_status != 'delivered' and self.order_status != 'completed' and self.cancellation_status == 'na'

    def clean(self):
        """Validate state constraints."""
        from django.core.exceptions import ValidationError
        if self.cancellation_status != 'na' and self.delivery_status == 'delivered':
             # This is the 'Ironclad' check
             raise ValidationError("Cannot cancel a delivered order. Use Return workflow.")
             
    def cancel_order(self, reason=''):
        """
        Cancel the order if allowed.
        """
        if not self.can_cancel:
            from django.core.exceptions import ValidationError
            raise ValidationError("Order cannot be cancelled in its current state.")
            
        self.cancellation_status = 'completed' # Or pending/completed based on workflow
        self.order_status = 'cancelled'
        self.save(update_fields=['cancellation_status', 'order_status'])


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
