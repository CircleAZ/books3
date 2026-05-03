"""
Serializers for Order Management.
"""
from rest_framework import serializers
from decimal import Decimal
from django.utils.html import strip_tags
from .models import (
    Order, OrderItem, Payment, OrderStatusHistory, OrderNote,
    ReturnReason, Return, ReturnItem, Refund, CreditNote,
    Delivery, DeliveryItem
)


class PaymentSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, default=None)
    
    class Meta:
        model = Payment
        fields = ['id', 'order', 'method', 'destination_bank', 'destination_wallet', 'amount', 'upi_reference', 'created_at', 'created_by_name']
        read_only_fields = ['id', 'created_at', 'created_by_name']
    
    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Payment amount must be strictly greater than zero.")
        return value
    
    def validate(self, data):
        """Prevent overpayment and payment on fully paid orders."""
        order = data.get('order')
        amount = data.get('amount', Decimal('0'))
        
        if order:
            # Check if already fully paid
            if order.payment_status == 'paid':
                raise serializers.ValidationError({'order': 'Order is already fully paid'})
            
            # Check if amount exceeds balance due
            if amount > order.balance_due:
                raise serializers.ValidationError({
                    'amount': f'Amount ({amount}) exceeds balance due ({order.balance_due})'
                })
        
        return data


class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_display_id = serializers.IntegerField(source='product.display_id', read_only=True)
    product_stock = serializers.IntegerField(source='product.stock_quantity', read_only=True)
    
    class Meta:
        model = OrderItem
        fields = [
            'id', 'product', 'product_name', 'product_display_id', 'product_stock',
            'quantity', 'confirmed_quantity', 'delivered_quantity', 'remaining_quantity',
            'unit_price', 
            'discount_type', 'discount_value', 'discount_amount',
            'line_total'
        ]
        read_only_fields = ['id', 'confirmed_quantity', 'delivered_quantity', 'remaining_quantity', 'discount_amount', 'line_total']


class OrderListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""
    customer_name = serializers.CharField(source='annotated_customer_name', read_only=True)
    item_count = serializers.IntegerField(read_only=True)
    derived_status = serializers.CharField(read_only=True)
    
    class Meta:
        model = Order
        fields = [
            'id', 'display_id', 'customer_name', 'is_guest',
            'order_status', 'payment_status', 'delivery_status', 'derived_status',
            'total', 'item_count', 'created_at'
        ]


class OrderStatusHistorySerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, default=None)
    
    class Meta:
        model = OrderStatusHistory
        fields = ['id', 'status_field', 'old_value', 'new_value', 'note', 'created_at', 'created_by_name']
        read_only_fields = ['id', 'created_at', 'created_by_name']


class OrderNoteSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, default=None)
    
    class Meta:
        model = OrderNote
        fields = ['id', 'order', 'content', 'created_at', 'created_by_name']
        read_only_fields = ['id', 'created_at', 'created_by_name']


class DeliveryItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='order_item.product.name', read_only=True)
    
    class Meta:
        model = DeliveryItem
        fields = ['id', 'delivery', 'order_item', 'product_name', 'quantity', 'created_at']
        read_only_fields = ['id', 'created_at']


class DeliverySerializer(serializers.ModelSerializer):
    delivered_by_name = serializers.CharField(source='delivered_by.username', read_only=True, default=None)
    items = DeliveryItemSerializer(many=True, read_only=True)
    
    class Meta:
        model = Delivery
        fields = ['id', 'order', 'notes', 'delivered_by', 'delivered_by_name', 'created_at', 'items']
        read_only_fields = ['id', 'created_at', 'delivered_by_name']


class OrderDetailSerializer(serializers.ModelSerializer):
    """Full detail serializer with nested items, payments, history, and notes."""
    items = OrderItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    deliveries = DeliverySerializer(many=True, read_only=True)
    status_history = OrderStatusHistorySerializer(many=True, read_only=True)
    order_notes = OrderNoteSerializer(many=True, read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    balance_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    change_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    derived_status = serializers.CharField(read_only=True)
    can_edit = serializers.BooleanField(read_only=True)
    can_cancel = serializers.BooleanField(read_only=True)
    receipt_uuid = serializers.SerializerMethodField()
    customer_wallet_balance = serializers.SerializerMethodField()
    
    class Meta:
        model = Order
        fields = [
            'id', 'display_id', 
            'customer', 'customer_name', 'customer_phone', 'customer_wallet_balance', 'is_guest', 
            'guest_name', 'guest_phone', 'guest_email',
            'order_status', 'payment_status', 'delivery_status',
            'return_status', 'refund_status', 'cancellation_status',
            'derived_status', 'can_edit', 'can_cancel',
            'subtotal', 'discount_type', 'discount_value', 'discount_amount', 'total',
            'amount_paid', 'balance_due', 'change_due',
            'notes', 'items', 'payments', 'deliveries', 'status_history', 'order_notes',
            'receipt_uuid',
            'created_at', 'updated_at'
        ]
    
    def get_customer_name(self, obj):
        if obj.is_guest:
            return obj.guest_name or 'Guest'
        return obj.customer.full_name if obj.customer else 'Unknown'

    def get_customer_phone(self, obj):
        if obj.is_guest:
            return obj.guest_phone or ''
        return obj.customer.phone if obj.customer else ''
        
    def get_customer_wallet_balance(self, obj):
        if obj.customer and hasattr(obj.customer, 'wallet'):
            return obj.customer.wallet.balance
        return 0
    
    def get_receipt_uuid(self, obj):
        """Get the order's receipt_uuid."""
        return str(obj.receipt_uuid) if obj.receipt_uuid else None


class OrderItemCreateSerializer(serializers.Serializer):
    """For creating order items in nested create."""
    product = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=2)
    discount_type = serializers.ChoiceField(choices=['', 'percent', 'fixed'], required=False, allow_blank=True)
    discount_value = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)


class PaymentCreateSerializer(serializers.Serializer):
    """For creating payments nested inside order creation (no order FK required)."""
    method = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    destination_bank = serializers.UUIDField(required=False, allow_null=True)
    destination_wallet = serializers.UUIDField(required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    upi_reference = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')


class OrderCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating orders with nested items and payments."""
    items = OrderItemCreateSerializer(many=True, write_only=True)
    payments = PaymentCreateSerializer(many=True, required=False, write_only=True)
    
    class Meta:
        model = Order
        fields = [
            'id', 'display_id',
            'customer', 'is_guest', 'guest_name', 'guest_phone', 'guest_email',
            'order_status', 'discount_type', 'discount_value', 'notes',
            'items', 'payments'
        ]
        read_only_fields = ['id', 'display_id']

    def validate_order_status(self, value):
        """Only 'draft' and 'confirmed' are valid initial states.
        
        'completed' is auto-set when delivery is done.
        'cancelled' is auto-set via the cancellation workflow.
        """
        if value not in ('draft', 'confirmed'):
            raise serializers.ValidationError(
                f"Cannot create order with status '{value}'. "
                f"Only 'draft' or 'confirmed' are valid. "
                f"'completed' and 'cancelled' are managed automatically."
            )
        return value
    
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        payments_data = validated_data.pop('payments', [])
        
        order = Order.objects.create(**validated_data)
        
        # Bulk-fetch all products in a single query (Phase 1 perf fix)
        from inventory.models import Product
        product_ids = [item['product'] for item in items_data]
        products_map = {
            p.id: p for p in Product.objects.filter(id__in=product_ids)
        }
        missing = [pid for pid in product_ids if pid not in products_map]
        if missing:
            raise serializers.ValidationError(
                {'items': [f"Product(s) not found: {missing}"]}
            )
        
        for item_data in items_data:
            product = products_map[item_data['product']]
            OrderItem.objects.create(
                order=order,
                product=product,
                quantity=item_data['quantity'],
                unit_price=item_data['unit_price'],
                discount_type=item_data.get('discount_type', ''),
                discount_value=item_data.get('discount_value', 0)
            )
        # Collect deferred ledger deposits (Phase 4 perf fix)
        # Customer Wallet debits stay SYNC (balance-critical).
        # Cash/bank deposits are just bookkeeping — safe to defer.
        deferred_deposits = []
        
        for payment_data in payments_data:
            payment = Payment.objects.create(
                order=order,
                amount=payment_data['amount'],
                method=payment_data.get('method', ''),
                destination_bank_id=payment_data.get('destination_bank'),
                destination_wallet_id=payment_data.get('destination_wallet'),
                upi_reference=payment_data.get('upi_reference', ''),
                created_by=validated_data.get('created_by')
            )
            if payment.method == 'Customer Wallet':
                # SYNC: must be atomic with order creation
                if getattr(order.customer, 'wallet', None):
                    order.customer.wallet.debit(
                        payment.amount, 
                        f"Payment for Order #{order.display_id}", 
                        user=validated_data.get('created_by')
                    )
            else:
                # DEFERRED: cash/bank deposit runs after commit
                deferred_deposits.append({
                    'amount': payment.amount,
                    'destination_bank_id': payment.destination_bank_id,
                    'destination_wallet_id': payment.destination_wallet_id,
                    'reference': f"order_{order.display_id}",
                    'description': f"Initial Payment for Order #{order.display_id}",
                    'user_id': validated_data.get('created_by').id if validated_data.get('created_by') else None,
                })
        
        order.calculate_totals()
        # update_payment_status() intentionally omitted — already called by
        # Payment.save() hook (models.py:615) for each payment. For zero-payment
        # orders (drafts), the default 'pending' status is correct.

        # ── Post-commit async tasks: ledger deposits + R2 snapshot ──
        from django.db import transaction
        
        def run_post_commit_tasks(order_id, deposits):
            from django.db import close_old_connections
            import logging
            logger = logging.getLogger(__name__)
            try:
                close_old_connections()
                
                # Process deferred ledger deposits
                if deposits:
                    from finance.services import LedgerService
                    from finance.models import BankAccount, CashWallet
                    for dep in deposits:
                        try:
                            dest_bank = BankAccount.objects.get(id=dep['destination_bank_id']) if dep['destination_bank_id'] else None
                            dest_wallet = CashWallet.objects.get(id=dep['destination_wallet_id']) if dep['destination_wallet_id'] else None
                            from django.contrib.auth import get_user_model
                            User = get_user_model()
                            user = User.objects.get(id=dep['user_id']) if dep['user_id'] else None
                            LedgerService.process_deposit(
                                amount=dep['amount'],
                                destination_bank=dest_bank,
                                destination_wallet=dest_wallet,
                                reference=dep['reference'],
                                description=dep['description'],
                                user=user
                            )
                        except Exception:
                            logger.exception("Deferred ledger deposit failed for %s", dep['reference'])
                
                # R2 snapshot
                try:
                    from orders.models import Order
                    order = Order.objects.get(id=order_id)
                    from messaging.r2 import update_receipt_snapshot
                    update_receipt_snapshot(order)
                except Exception:
                    logger.exception("R2 snapshot thread failed for order %s", order_id)
                    
            finally:
                close_old_connections()
        
        def trigger_post_commit():
            import threading
            threading.Thread(
                target=run_post_commit_tasks, 
                args=(order.id, deferred_deposits),
                daemon=True
            ).start()
        
        transaction.on_commit(trigger_post_commit)

        return order
    
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        
        # Update order fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Replace items if provided
        if items_data is not None:
            instance.items.all().delete()
            
            # Bulk-fetch all products in a single query (same as create)
            from inventory.models import Product
            product_ids = [item['product'] for item in items_data]
            products_map = {
                p.id: p for p in Product.objects.filter(id__in=product_ids)
            }
            missing = [pid for pid in product_ids if pid not in products_map]
            if missing:
                raise serializers.ValidationError(
                    {'items': [f"Product(s) not found: {missing}"]}
                )
            
            for item_data in items_data:
                product = products_map[item_data['product']]
                OrderItem.objects.create(
                    order=instance,
                    product=product,
                    quantity=item_data['quantity'],
                    unit_price=item_data['unit_price'],
                    discount_type=item_data.get('discount_type', ''),
                    discount_value=item_data.get('discount_value', 0)
                )
        
        instance.calculate_totals()
        return instance


# ============================================================================
# Returns & Refunds Serializers
# ============================================================================

class ReturnReasonSerializer(serializers.ModelSerializer):
    """Serializer for return reasons."""
    
    class Meta:
        model = ReturnReason
        fields = ['id', 'name', 'description', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate_name(self, value):
        """Sanitize name input."""
        return strip_tags(value).strip()


class ReturnItemSerializer(serializers.ModelSerializer):
    """Serializer for individual return items."""
    product_name = serializers.CharField(source='order_item.product.name', read_only=True)
    product_id = serializers.UUIDField(source='order_item.product.id', read_only=True)
    unit_price = serializers.DecimalField(
        source='order_item.unit_price', max_digits=10, decimal_places=2, read_only=True
    )
    reason_name = serializers.CharField(source='reason.name', read_only=True, default=None)
    line_total = serializers.SerializerMethodField()
    
    class Meta:
        model = ReturnItem
        fields = [
            'id', 'order_item', 'product_name', 'product_id', 'unit_price',
            'quantity', 'reason', 'reason_name', 'stock_action', 'stock_restored',
            'line_total', 'created_at'
        ]
        read_only_fields = ['id', 'stock_restored', 'created_at']
    
    def get_line_total(self, obj):
        return obj.order_item.unit_price * obj.quantity


class ReturnListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for return list views."""
    order_display_id = serializers.IntegerField(source='order.display_id', read_only=True)
    customer_name = serializers.SerializerMethodField()
    item_count = serializers.IntegerField(read_only=True)
    total_refund_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    refund_status = serializers.SerializerMethodField()
    
    class Meta:
        model = Return
        fields = [
            'id', 'display_id', 'order', 'order_display_id', 'customer_name',
            'status', 'item_count', 'total_refund_amount', 'refund_status', 'created_at'
        ]
    
    def get_customer_name(self, obj):
        order = obj.order
        if order.is_guest:
            return order.guest_name or 'Guest'
        return order.customer.full_name if order.customer else 'Unknown'
    
    def get_refund_status(self, obj):
        """Get refund status for this return."""
        refunds = obj.refunds.filter(status='completed')
        if refunds.exists():
            return 'refunded'
        return 'pending'


class ReturnDetailSerializer(serializers.ModelSerializer):
    """Full detail serializer for return with nested items and refunds."""
    order_display_id = serializers.IntegerField(source='order.display_id', read_only=True)
    order_total = serializers.DecimalField(source='order.total', max_digits=12, decimal_places=2, read_only=True)
    customer_name = serializers.SerializerMethodField()
    items = ReturnItemSerializer(many=True, read_only=True)
    refunds = serializers.SerializerMethodField()
    total_refund_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_refunded = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, default=None)
    
    class Meta:
        model = Return
        fields = [
            'id', 'display_id', 'order', 'order_display_id', 'order_total',
            'customer_name', 'status', 'notes', 'items', 'refunds',
            'total_refund_amount', 'total_refunded',
            'created_at', 'updated_at', 'created_by_name'
        ]
    
    def get_customer_name(self, obj):
        order = obj.order
        if order.is_guest:
            return order.guest_name or 'Guest'
        return order.customer.full_name if order.customer else 'Unknown'
    
    def get_refunds(self, obj):
        return RefundSerializer(obj.refunds.all(), many=True).data
    
    def get_total_refunded(self, obj):
        return sum(r.amount for r in obj.refunds.filter(status='completed'))


class ReturnItemCreateSerializer(serializers.Serializer):
    """For creating return items in nested create."""
    order_item = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    reason = serializers.UUIDField(required=False, allow_null=True)
    stock_action = serializers.ChoiceField(
        choices=['return_to_stock', 'damaged'],
        default='return_to_stock'
    )


class ReturnCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a return request."""
    items = ReturnItemCreateSerializer(many=True, write_only=True)
    
    class Meta:
        model = Return
        fields = ['id', 'display_id', 'order', 'notes', 'items']
        read_only_fields = ['id', 'display_id']
    
    def validate_order(self, value):
        """Validate order is delivered and not cancelled."""
        if value.delivery_status != 'delivered':
            raise serializers.ValidationError('Can only return items from delivered orders.')
        if value.cancellation_status == 'completed':
            raise serializers.ValidationError('Cannot return items from cancelled orders.')
        return value
    
    def validate_items(self, value):
        """Validate items list is not empty."""
        if not value:
            raise serializers.ValidationError('At least one item must be selected for return.')
        return value
    
    def validate(self, data):
        """Validate item quantities don't exceed available quantities."""
        order = data.get('order')
        items_data = data.get('items', [])
        
        for item_data in items_data:
            order_item_id = item_data['order_item']
            quantity = item_data['quantity']
            
            # Check order item belongs to this order
            try:
                order_item = OrderItem.objects.get(pk=order_item_id, order=order)
            except OrderItem.DoesNotExist:
                raise serializers.ValidationError({
                    'items': f'Order item {order_item_id} not found in this order.'
                })
            
            # Check quantity doesn't exceed what's available
            already_returned = sum(
                ri.quantity for ri in order_item.return_items.filter(
                    return_request__status__in=['initiated', 'items_received', 'completed']
                )
            )
            available = order_item.quantity - already_returned
            
            if quantity > available:
                raise serializers.ValidationError({
                    'items': f'Cannot return {quantity} of {order_item.product.name}. Only {available} available.'
                })
        
        return data
    
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        
        # Create return request
        return_request = Return.objects.create(**validated_data)
        
        # Create return items
        for item_data in items_data:
            order_item = OrderItem.objects.get(pk=item_data['order_item'])
            reason = None
            if item_data.get('reason'):
                reason = ReturnReason.objects.filter(pk=item_data['reason']).first()
            
            ReturnItem.objects.create(
                return_request=return_request,
                order_item=order_item,
                quantity=item_data['quantity'],
                reason=reason,
                stock_action=item_data.get('stock_action', 'return_to_stock')
            )
        
        # Update order return status
        return_request.order.return_status = 'pending'
        return_request.order.save(update_fields=['return_status'])
        
        return return_request


class RefundSerializer(serializers.ModelSerializer):
    """Serializer for refund records."""
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, default=None)
    order_display_id = serializers.IntegerField(source='order.display_id', read_only=True)
    return_display_id = serializers.IntegerField(source='return_request.display_id', read_only=True, default=None)
    
    class Meta:
        model = Refund
        fields = [
            'id', 'return_request', 'return_display_id', 'order', 'order_display_id',
            'amount', 'method', 'source_bank', 'source_wallet', 'transaction_id', 'note', 'status',
            'created_at', 'created_by_name'
        ]
        read_only_fields = ['id', 'created_at', 'created_by_name']
    
    def validate_amount(self, value):
        """Validate refund amount is positive."""
        if value <= 0:
            raise serializers.ValidationError('Refund amount must be greater than zero.')
        return value
    
    def validate(self, data):
        """Additional validations."""
        order = data.get('order')
        amount = data.get('amount', Decimal('0'))
        
        if order:
            # Check total refunds don't exceed order total
            existing_refunds = sum(
                r.amount for r in order.refunds.filter(status='completed')
            )
            if existing_refunds + amount > order.total:
                raise serializers.ValidationError({
                    'amount': f'Total refunds ({existing_refunds + amount}) would exceed order total ({order.total}).'
                })
        
        return data
        
    def create(self, validated_data):
        refund = super().create(validated_data)
        from finance.services import LedgerService
        LedgerService.process_withdrawal(
            amount=refund.amount,
            source_bank=refund.source_bank,
            source_wallet=refund.source_wallet,
            reference=f"refund_{refund.id}",
            description=f"Refund for Order #{refund.order.display_id}",
            user=validated_data.get('created_by')
        )
        return refund


class CreditNoteSerializer(serializers.ModelSerializer):
    """Serializer for credit notes."""
    refund_amount = serializers.DecimalField(source='refund.amount', max_digits=12, decimal_places=2, read_only=True)
    order_display_id = serializers.IntegerField(source='refund.order.display_id', read_only=True)
    
    class Meta:
        model = CreditNote
        fields = ['id', 'display_id', 'refund', 'refund_amount', 'order_display_id', 'created_at']
        read_only_fields = ['id', 'display_id', 'created_at']
