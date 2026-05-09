"""
Order Management models for POS functionality.
"""
import uuid as uuid_lib
from django.db import models
from simple_history.models import HistoricalRecords
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
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
        ('partial', 'Partially Delivered'),
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
    # payment_status and delivery_status are EXCLUDED — they are always auto-computed.
    VALID_TRANSITIONS = {
        'order_status': {
            'draft': ['confirmed', 'cancelled'],
            'confirmed': ['completed', 'cancelled'],
            'completed': [],   # Terminal — use returns/refunds
            'cancelled': [],   # Terminal
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
    
    # Duplicate prevention — deterministic hash of customer + sorted items
    # Computed server-side during create; used by the DB-level duplicate guard.
    order_fingerprint = models.CharField(
        max_length=64, blank=True, default='',
        db_index=True,
        help_text="SHA-256 content hash for duplicate order detection"
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
        
        net_paid = total_paid - total_refunded
        
        if net_paid <= 0 and total_paid > 0:
            self.payment_status = 'refunded'
        elif net_paid > self.total:
            self.payment_status = 'overpaid'
        elif net_paid == self.total:
            self.payment_status = 'paid'
        elif net_paid > 0:
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
    def net_paid(self):
        total_paid = sum(p.amount for p in self.payments.all())
        total_refunded = sum(r.amount for r in self.refunds.filter(status='completed'))
        return total_paid - total_refunded

    @property
    def amount_paid(self):
        return sum(p.amount for p in self.payments.all())
    
    @property
    def balance_due(self):
        return max(Decimal('0'), self.total - self.net_paid)
    
    @property
    def change_due(self):
        """For cash overpayment."""
        return max(Decimal('0'), self.net_paid - self.total)
    
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

        # ── Priority 6: Partial delivery ──
        if self.delivery_status == 'partial':
            return 'Partially Delivered'

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
            self.delivery_status == 'pending'
            and self.cancellation_status == 'na'
            and self.order_status != 'cancelled'
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
        if field == 'delivery_status':
            raise ValidationError("Delivery status is auto-computed from delivery records and cannot be set manually.")
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

    def update_delivery_status(self):
        """Auto-compute delivery_status from delivery records. Like update_payment_status."""
        items = self.items.all()
        if not items.exists():
            return
        
        all_delivered = True
        any_delivered = False
        
        for item in items:
            base = item.confirmed_quantity if item.confirmed_quantity is not None else item.quantity
            delivered = sum(di.quantity for di in item.delivery_items.all())
            if delivered > 0:
                any_delivered = True
            if delivered < base:
                all_delivered = False
        
        old_status = self.delivery_status
        if all_delivered:
            self.delivery_status = 'delivered'
        elif any_delivered:
            self.delivery_status = 'partial'
        else:
            self.delivery_status = 'pending'
        
        self.save(update_fields=['delivery_status'])
    
    def freeze_confirmed_quantities(self):
        """Freeze all item quantities and batch-deduct stock in minimal queries.
        
        Performance: ~5 queries total regardless of item count (was 6×N).
        
        Safety: Aggregates quantities per product to handle duplicate products
        in separate line items (e.g., "Pencil ×3" + "Pencil ×5" = deduct 8).
        """
        from collections import defaultdict
        from inventory.models import Product, StockAdjustment, StockHistory
        from django.db import transaction
        
        items = list(
            self.items.filter(confirmed_quantity__isnull=True)
                .select_related('product')
        )
        if not items:
            return
        
        # 1. Bulk freeze confirmed_quantity on all items (1 query)
        for item in items:
            item.confirmed_quantity = item.quantity
        from orders.models import OrderItem
        OrderItem.objects.bulk_update(items, ['confirmed_quantity'])
        
        # 2. Aggregate quantities per product (handles Option C pack translations)
        qty_by_product = defaultdict(int)
        for item in items:
            if item.product.is_pack and item.product.base_product_id:
                qty_by_product[item.product.base_product_id] += (item.quantity * item.product.pack_size)
            else:
                qty_by_product[item.product_id] += item.quantity
        
        # 3. Lock ALL affected products in one query
        with transaction.atomic():
            products = {
                p.id: p for p in
                Product.objects.select_for_update()
                    .filter(id__in=qty_by_product.keys())
            }
            
            adjustments = []
            histories = []
            
            for product_id, total_qty in qty_by_product.items():
                product = products[product_id]
                product.stock_quantity -= total_qty
                
                adjustments.append(StockAdjustment(
                    product=product,
                    adjustment_type='decrease',
                    quantity=total_qty,
                    reason='sale',
                    notes=f"Order #{self.display_id} Confirmed",
                    created_by=self.created_by
                ))
                histories.append(StockHistory(
                    product=product,
                    quantity_change=-total_qty,
                    quantity_after=product.stock_quantity,
                    cost_at_time=product.cost_price,
                    reason='sale',
                    notes=f"Adjustment (decrease): Order #{self.display_id} Confirmed",
                    created_by=self.created_by
                ))
            
            # 4. Bulk save all products (1 query)
            Product.objects.bulk_update(
                list(products.values()), ['stock_quantity']
            )
            
            # Sync pack variants (bulk_update skips save() so we do it manually)
            for product in products.values():
                product.sync_pack_stock()
            
            # 5. Bulk create audit records (2 queries)
            StockAdjustment.objects.bulk_create(adjustments)
            StockHistory.objects.bulk_create(histories)
    
    def save(self, *args, **kwargs):
        """Auto-configure order_status on every save.
        
        order_status is a DERIVED field. Its value is enforced by these
        invariants, in priority order:
        
        1. Cancellation approved  →  'cancelled'   (terminal)
        2. Delivery complete      →  'completed'   (terminal, sets delivered_at)
        3. 'completed' without delivery  →  auto-corrects to 'confirmed'
        4. Everything else        →  keep whatever was set (draft/confirmed)
        
        This makes it impossible for external code (frontend, API, admin)
        to force an order into 'completed' without actual delivery.
        """
        # ── Invariant 1: Cancellation is terminal ──
        if self.cancellation_status == 'completed':
            self.order_status = 'cancelled'

        # ── Invariant 2: Delivery complete → auto-complete ──
        elif self.delivery_status == 'delivered':
            if not self.delivered_at:
                self.delivered_at = timezone.now()
            if self.order_status in ('draft', 'confirmed'):
                self.order_status = 'completed'

        # ── Invariant 3: Guard against premature 'completed' ──
        elif self.order_status == 'completed' and self.delivery_status != 'delivered':
            # Someone/something tried to set 'completed' without delivery.
            # Auto-correct to 'confirmed' — the highest valid non-terminal state.
            self.order_status = 'confirmed'

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
    confirmed_quantity = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Frozen copy of quantity at order confirmation. Immutable after set."
    )
    unit_price = models.DecimalField(max_digits=10, decimal_places=4)
    cost_price = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True, help_text="Product cost at time of sale")
    
    # Line discount
    discount_type = models.CharField(max_length=10, choices=DISCOUNT_TYPE, blank=True)
    discount_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    @property
    def delivered_quantity(self):
        """Total quantity delivered across all delivery events."""
        return sum(di.quantity for di in self.delivery_items.all())
    
    @property
    def remaining_quantity(self):
        """Quantity still awaiting delivery."""
        base = self.confirmed_quantity if self.confirmed_quantity is not None else self.quantity
        return max(0, base - self.delivered_quantity)
        
    @property
    def returned_quantity(self):
        """Quantity returned for this item."""
        return sum(ri.quantity for ri in self.return_items.filter(return_request__status='completed'))
    
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


class Delivery(UUIDPrimaryKeyModel):
    """
    A single delivery event for an order. Supports partial deliveries.
    Multiple Delivery records per Order (like Payment records).
    Each delivery records which items and quantities were physically handed over.
    """
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='deliveries')
    notes = models.TextField(blank=True)
    
    delivered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='deliveries_made'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'Deliveries'
    
    def __str__(self):
        total_qty = sum(item.quantity for item in self.items.all())
        return f"Delivery ({total_qty} items) for Order #{self.order.display_id}"
    
    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Auto-update the order's delivery_status after recording a delivery
        self.order.update_delivery_status()


class DeliveryItem(UUIDPrimaryKeyModel):
    """
    Line item within a Delivery. Tracks how many of each OrderItem were delivered
    in this specific delivery event.
    """
    delivery = models.ForeignKey(Delivery, on_delete=models.CASCADE, related_name='items')
    order_item = models.ForeignKey(
        OrderItem, on_delete=models.PROTECT, related_name='delivery_items'
    )
    quantity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)]
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.order_item.product.name} x {self.quantity}"
    
    def clean(self):
        """Validate delivery quantity doesn't exceed remaining."""
        if self.order_item_id:
            remaining = self.order_item.remaining_quantity
            # If editing, add back our own quantity
            if self.pk:
                try:
                    old = DeliveryItem.objects.get(pk=self.pk)
                    remaining += old.quantity
                except DeliveryItem.DoesNotExist:
                    pass
            if self.quantity > remaining:
                raise ValidationError(
                    f"Cannot deliver {self.quantity} of {self.order_item.product.name}. "
                    f"Only {remaining} remaining."
                )


class Payment(UUIDPrimaryKeyModel):
    """
    Payment record for an order. Supports multiple payments per order.
    """
    PAYMENT_METHODS = [
        ('cash', 'Cash'),
        ('upi', 'UPI'),
        ('Customer Wallet', 'Customer Wallet'),
    ]
    
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='payments')
    
    # Phase 1 Migration Fields
    destination_bank = models.ForeignKey('finance.BankAccount', on_delete=models.PROTECT, null=True, blank=True, related_name='order_payments')
    destination_wallet = models.ForeignKey('finance.CashWallet', on_delete=models.PROTECT, null=True, blank=True, related_name='order_payments')
    method = models.CharField(max_length=100, null=True, blank=True)
    
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
        
        # Dispatch payment notification + update R2 snapshot asynchronously after commit
        from django.db import transaction
        
        def run_dispatch(order_id, payment_id):
            from django.db import close_old_connections
            import logging
            try:
                close_old_connections()
                from orders.models import Order, Payment
                order = Order.objects.get(id=order_id)
                payment = Payment.objects.get(id=payment_id)
                from messaging.dispatch import dispatch_payment_update
                dispatch_payment_update(order, payment=payment)
            except Exception:
                logging.getLogger(__name__).exception("Payment dispatch thread failed for order #%s", order_id)
            finally:
                close_old_connections()
                
        def run_r2(order_id):
            from django.db import close_old_connections
            import logging
            try:
                close_old_connections()
                from orders.models import Order
                order = Order.objects.get(id=order_id)
                from messaging.r2 import update_receipt_snapshot
                update_receipt_snapshot(order)
            except Exception:
                logging.getLogger(__name__).exception("R2 snapshot thread failed for order #%s", order_id)
            finally:
                close_old_connections()

        def trigger_async_tasks():
            import threading
            threading.Thread(target=run_dispatch, args=(self.order.id, self.id), daemon=True).start()
            threading.Thread(target=run_r2, args=(self.order.id,), daemon=True).start()

        transaction.on_commit(trigger_async_tasks)


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
        """Calculate total refund amount for items, factoring in line discounts and order-level discounts."""
        from decimal import Decimal
        base_refund = sum(
            (item.order_item.line_total / item.order_item.quantity) * item.quantity
            for item in self.items.all() if item.order_item.quantity > 0
        )
        
        # Apply order-level discount proportion
        order = self.order
        if order.subtotal > 0 and order.discount_amount > 0:
            ratio = order.total / order.subtotal
            return (base_refund * ratio).quantize(Decimal('0.01'))
            
        return Decimal(str(base_refund)).quantize(Decimal('0.01'))
    
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
        
        from inventory.services import StockService
        
        StockService.adjust_stock(
            product_id=self.order_item.product.id,
            adjustment_type='increase',
            quantity=self.quantity,
            reason='return',
            notes=f"Return #{self.return_request.display_id} - {self.reason.name if self.reason else 'No reason'}",
            user=user,
            target_ledger='both'
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
        ('bank', 'Bank Transfer'),
        ('upi', 'UPI'),
        ('cheque', 'Cheque'),
        ('customer_wallet', 'Customer Wallet'),
    ]
    
    return_request = models.ForeignKey(
        Return, on_delete=models.SET_NULL, 
        null=True, blank=True, 
        related_name='refunds'
    )
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='refunds')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    
    # Phase 1 Migration Fields
    source_bank = models.ForeignKey('finance.BankAccount', on_delete=models.PROTECT, null=True, blank=True, related_name='refunds_issued')
    source_wallet = models.ForeignKey('finance.CashWallet', on_delete=models.PROTECT, null=True, blank=True, related_name='refunds_issued')
    method = models.CharField(max_length=100, choices=REFUND_METHOD, null=True, blank=True)
    transaction_id = models.CharField(max_length=100, blank=True, help_text="Reference or transaction ID")
    
    # Ledger Hard-Links
    bank_transaction = models.OneToOneField('finance.BankTransaction', on_delete=models.SET_NULL, null=True, blank=True)
    wallet_transaction = models.OneToOneField('finance.CashWalletTransaction', on_delete=models.SET_NULL, null=True, blank=True)
    customer_wallet_transaction = models.OneToOneField('customers.WalletTransaction', on_delete=models.SET_NULL, null=True, blank=True)
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
        is_new = self._state.adding
        orig_status = None
        if not is_new:
            try:
                orig_status = Refund.objects.get(pk=self.pk).status
            except Refund.DoesNotExist:
                pass
                
        super().save(*args, **kwargs)
        
        # Handle Reversal if Cancelled
        if not is_new and orig_status != 'cancelled' and self.status == 'cancelled':
            self._reverse_ledgers()
            
        # Update order refund status
        self._update_order_refund_status()
        
    def _reverse_ledgers(self):
        """Reverse any linked financial transactions due to refund cancellation."""
        if self.bank_transaction:
            from finance.models import BankTransaction
            # Issue a reversing deposit
            BankTransaction.objects.create(
                account=self.bank_transaction.account,
                date=self.bank_transaction.date,
                transaction_type='deposit',
                amount=self.bank_transaction.amount,
                reference=f"Reversal of {self.transaction_id}",
                description=f"Refund Reversal for Order #{self.order.display_id}",
                is_reconciled=False
            )
            
        if self.wallet_transaction:
            from finance.models import CashWalletTransaction, CashWallet
            wallet = CashWallet.objects.select_for_update().get(pk=self.wallet_transaction.wallet.pk)
            new_balance = wallet.balance + self.wallet_transaction.amount
            CashWalletTransaction.objects.create(
                wallet=wallet,
                transaction_type='deposit',
                amount=self.wallet_transaction.amount,
                reference_id=f"Reversal of {self.transaction_id}",
                description=f"Refund Reversal for Order #{self.order.display_id}",
                balance_after=new_balance,
                created_by=self.created_by
            )
            wallet.balance = new_balance
            wallet.save(update_fields=['balance'])
            
        if self.customer_wallet_transaction:
            from customers.models import Wallet
            wallet = Wallet.objects.select_for_update().get(pk=self.customer_wallet_transaction.wallet.pk)
            wallet.debit(self.customer_wallet_transaction.amount, f"Refund Reversal for Order #{self.order.display_id}", self.created_by)
    
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
