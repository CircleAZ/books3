"""
Serializers for Order Management.
"""
from rest_framework import serializers
from decimal import Decimal
from django.utils.html import strip_tags
from .models import (
    Order, OrderItem, Payment, OrderStatusHistory,
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
    max_returnable_quantity = serializers.SerializerMethodField()
    
    class Meta:
        model = OrderItem
        fields = [
            'id', 'product', 'product_name', 'product_display_id', 'product_stock',
            'quantity', 'confirmed_quantity', 'delivered_quantity', 'remaining_quantity', 'returned_quantity',
            'max_returnable_quantity',
            'unit_price', 
            'discount_type', 'discount_value', 'discount_amount',
            'line_total'
        ]
        read_only_fields = ['id', 'confirmed_quantity', 'delivered_quantity', 'remaining_quantity', 'returned_quantity', 'max_returnable_quantity', 'discount_amount', 'line_total']

    def get_max_returnable_quantity(self, obj):
        already_returned = sum(
            ri.quantity for ri in obj.return_items.filter(
                return_request__status__in=['initiated', 'items_received', 'completed']
            )
        )
        return max(0, obj.delivered_quantity - already_returned)



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
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    net_paid = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_refunded = serializers.SerializerMethodField()
    balance_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    change_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    returned_value = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    effective_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    max_refundable = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
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
            'amount_paid', 'net_paid', 'total_refunded', 'balance_due', 'change_due',
            'returned_value', 'effective_total', 'max_refundable',
            'notes', 'items', 'payments', 'deliveries', 'status_history',
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

    def get_total_refunded(self, obj):
        # Use Python in-memory filtering over all() to leverage prefetched refunds
        return sum(r.amount for r in obj.refunds.all() if r.status == 'completed')


class OrderItemCreateSerializer(serializers.Serializer):
    """For creating order items in nested create."""
    product = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    discount_type = serializers.ChoiceField(choices=['', 'percent', 'fixed'], required=False, allow_blank=True)
    discount_value = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0, min_value=0)


class PaymentCreateSerializer(serializers.Serializer):
    """For creating payments nested inside order creation (no order FK required)."""
    method = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    destination_bank = serializers.UUIDField(required=False, allow_null=True)
    destination_wallet = serializers.UUIDField(required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    upi_reference = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')


class OrderCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating orders with nested items and payments."""
    items = OrderItemCreateSerializer(many=True, write_only=True)
    payments = PaymentCreateSerializer(many=True, required=False, write_only=True)
    discount_value = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0, min_value=0)
    
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
        from decimal import Decimal
        items_data = validated_data.pop('items', [])
        payments_data = validated_data.pop('payments', [])
        
        # ── Pre-calculate totals to avoid multiple redundant saves ──
        subtotal = Decimal('0')
        for item_data in items_data:
            gross = Decimal(str(item_data['unit_price'])) * int(item_data['quantity'])
            dt = item_data.get('discount_type', '')
            dv = Decimal(str(item_data.get('discount_value', 0)))
            if dt == 'percent' and dv:
                subtotal += (gross - (gross * dv / Decimal('100')).quantize(Decimal('0.01')))
            elif dt == 'fixed' and dv:
                subtotal += (gross - min(dv, gross))
            else:
                subtotal += gross
                
        validated_data['subtotal'] = subtotal
        order_discount_type = validated_data.get('discount_type', '')
        order_discount_value = Decimal(str(validated_data.get('discount_value', 0)))
        
        if order_discount_type == 'percent' and order_discount_value:
            order_discount_amount = (subtotal * order_discount_value / Decimal('100')).quantize(Decimal('0.01'))
        elif order_discount_type == 'fixed' and order_discount_value:
            order_discount_amount = min(order_discount_value, subtotal)
        else:
            order_discount_amount = Decimal('0')
            
        validated_data['discount_amount'] = order_discount_amount
        total = max(Decimal('0'), subtotal - order_discount_amount)
        validated_data['total'] = total
        
        total_paid = sum(Decimal(str(p['amount'])) for p in payments_data)
        
        # --- ATOMIC POS SPLIT (Murphy's Checkpoint in Backend) ---
        excess = total_paid - total
        legacy_debt_payment = Decimal('0')
        customer = validated_data.get('customer')
        
        if excess > Decimal('0') and customer and hasattr(customer, 'legacy_debt'):
            from customers.models import LegacyDebt
            # Lock the row for update
            debt = LegacyDebt.objects.select_for_update().get(id=customer.legacy_debt.id)
            remaining_debt = debt.principal_amount - debt.recovered_amount
            
            if remaining_debt > Decimal('0'):
                legacy_debt_payment = min(excess, remaining_debt)
                # Ensure enough fresh cash exists to cover the debt split
                fresh_cash_amount = sum(Decimal(str(p['amount'])) for p in payments_data if p.get('method', '') != 'Customer Wallet')
                if legacy_debt_payment > fresh_cash_amount:
                    raise serializers.ValidationError({"payments": "Legacy debt cannot be paid using existing store credit. Fresh cash required."})
        
        order_total_paid = total_paid - legacy_debt_payment
        
        if order_total_paid > total:
            validated_data['payment_status'] = 'overpaid'
        elif order_total_paid == total and total > 0:
            validated_data['payment_status'] = 'paid'
        elif order_total_paid > 0:
            validated_data['payment_status'] = 'partial'
        else:
            validated_data['payment_status'] = 'pending'
            
        if order_total_paid > 0 and validated_data.get('order_status', 'draft') == 'draft':
            validated_data['order_status'] = 'confirmed'
        
        # Now create the order with all derived fields fully populated
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
        
        # Phase 5 perf fix: Use bulk_create to avoid N+1 save() and redundant calculate_totals()
        order_items_to_create = []
        from decimal import Decimal
        
        for item_data in items_data:
            product = products_map[item_data['product']]
            unit_price = item_data['unit_price']
            quantity = item_data['quantity']
            discount_type = item_data.get('discount_type', '')
            discount_value = item_data.get('discount_value', 0)
            
            gross = unit_price * quantity
            if discount_type == 'percent' and discount_value:
                discount_amount = (gross * discount_value / Decimal('100')).quantize(Decimal('0.01'))
            elif discount_type == 'fixed' and discount_value:
                discount_amount = min(discount_value, gross)
            else:
                discount_amount = Decimal('0')
            
            line_total = gross - discount_amount
            
            order_items_to_create.append(OrderItem(
                order=order,
                product=product,
                quantity=quantity,
                unit_price=unit_price,
                cost_price=product.cost_price,
                discount_type=discount_type,
                discount_value=discount_value,
                discount_amount=discount_amount,
                line_total=line_total
            ))
            
        if order_items_to_create:
            OrderItem.objects.bulk_create(order_items_to_create)

        # Collect deferred ledger deposits (Phase 4 perf fix)
        # Customer Wallet debits stay SYNC (balance-critical).
        # Cash/bank deposits are just bookkeeping — safe to defer.
        deferred_deposits = []
        payments_to_create = []
        
        remaining_debt_to_siphon = legacy_debt_payment
        
        for payment_data in payments_data:
            method = payment_data.get('method', '')
            original_amount = Decimal(str(payment_data['amount']))
            
            siphon_from_this_payment = Decimal('0')
            if remaining_debt_to_siphon > Decimal('0') and method != 'Customer Wallet':
                siphon_from_this_payment = min(remaining_debt_to_siphon, original_amount)
                remaining_debt_to_siphon -= siphon_from_this_payment
                
            order_payment_amount = original_amount - siphon_from_this_payment
            
            if order_payment_amount > Decimal('0'):
                payments_to_create.append(Payment(
                    order=order,
                    amount=order_payment_amount,
                    method=method,
                    destination_bank_id=payment_data.get('destination_bank'),
                    destination_wallet_id=payment_data.get('destination_wallet'),
                    upi_reference=payment_data.get('upi_reference', ''),
                    created_by=validated_data.get('created_by')
                ))
            
            if method == 'Customer Wallet':
                # SYNC: must be atomic with order creation
                if getattr(order.customer, 'wallet', None) and original_amount > Decimal('0'):
                    order.customer.wallet.debit(
                        original_amount, 
                        f"Payment for Order #{order.display_id}", 
                        user=validated_data.get('created_by')
                    )
            else:
                # DEFERRED: cash/bank deposit runs after commit
                if original_amount > Decimal('0'):
                    deferred_deposits.append({
                        'amount': original_amount, # Full cash is deposited to ledger
                        'destination_bank_id': payment_data.get('destination_bank'),
                        'destination_wallet_id': payment_data.get('destination_wallet'),
                        'reference': f"order_{order.display_id}",
                        'description': f"Payment for Order #{order.display_id}" + (" & Legacy Debt" if legacy_debt_payment > 0 else ""),
                        'user_id': validated_data.get('created_by').id if validated_data.get('created_by') else None,
                    })

        if legacy_debt_payment > Decimal('0'):
            # Debt was already locked at the top of the function
            debt.recovered_amount += legacy_debt_payment
            debt.save()
            
            from customers.models import Wallet
            from finance.models import WalletTransaction
            from django.db.models import F
            
            wallet, _ = Wallet.objects.get_or_create(customer=customer)
            Wallet.objects.filter(id=wallet.id).update(balance=F('balance') + legacy_debt_payment)
            wallet.refresh_from_db()
            
            WalletTransaction.objects.create(
                wallet=wallet,
                amount=legacy_debt_payment,
                transaction_type='credit',
                reason=f'Legacy Debt Auto-Payment via Order #{order.display_id}',
                created_by=validated_data.get('created_by')
            )
        
        if payments_to_create:
            Payment.objects.bulk_create(payments_to_create)
        
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
        
        # Replace/update items if provided
        if items_data is not None:
            from rest_framework import serializers
            from orders.models import OrderItem
            from inventory.models import Product
            
            existing_items = {item.product_id: item for item in instance.items.all()}
            incoming_products = [item['product'] for item in items_data]
            
            # 1. Validation Checks
            # A. Check if any already delivered item is missing from incoming items (deletion attempt)
            for old_pid, old_item in existing_items.items():
                if old_item.delivered_quantity > 0 and old_pid not in incoming_products:
                    raise serializers.ValidationError(
                        {'items': [f"Cannot remove product '{old_item.product.name}' because it has already been partially delivered."]}
                    )
            
            # B. Validate each incoming item against existing constraints
            products_map = {
                p.id: p for p in Product.objects.filter(id__in=incoming_products)
            }
            missing = [pid for pid in incoming_products if pid not in products_map]
            if missing:
                raise serializers.ValidationError(
                    {'items': [f"Product(s) not found: {missing}"]}
                )
                
            for item_data in items_data:
                pid = item_data['product']
                product = products_map[pid]
                new_qty = item_data['quantity']
                new_price = item_data['unit_price']
                new_disc_type = item_data.get('discount_type', '')
                new_disc_val = item_data.get('discount_value', 0)
                
                if pid in existing_items:
                    old_item = existing_items[pid]
                    del_qty = old_item.delivered_quantity
                    if del_qty > 0:
                        # Enforce constraints for delivered items
                        if new_qty < del_qty:
                            raise serializers.ValidationError(
                                {'items': [f"Quantity for product '{product.name}' cannot be less than delivered quantity ({del_qty})."]}
                            )
                        if new_price != old_item.unit_price:
                            raise serializers.ValidationError(
                                {'items': [f"Price for product '{product.name}' cannot be modified because it has already been partially delivered."]}
                            )
                        if new_disc_type != old_item.discount_type or new_disc_val != old_item.discount_value:
                            raise serializers.ValidationError(
                                {'items': [f"Discount for product '{product.name}' cannot be modified because it has already been partially delivered."]}
                            )
            
            # 2. Database Modifications
            processed_pids = set()
            historical_costs = {item.product_id: item.cost_price for item in existing_items.values()}
            
            for item_data in items_data:
                pid = item_data['product']
                product = products_map[pid]
                new_qty = item_data['quantity']
                new_price = item_data['unit_price']
                new_disc_type = item_data.get('discount_type', '')
                new_disc_val = item_data.get('discount_value', 0)
                
                # Calculate line discount & line total
                from decimal import Decimal
                gross = new_price * new_qty
                if new_disc_type == 'percent' and new_disc_val:
                    discount_amount = (gross * new_disc_val / Decimal('100')).quantize(Decimal('0.01'))
                elif new_disc_type == 'fixed' and new_disc_val:
                    discount_amount = min(new_disc_val, gross)
                else:
                    discount_amount = Decimal('0')
                line_total = gross - discount_amount
                
                if pid in existing_items:
                    old_item = existing_items[pid]
                    # Update existing OrderItem
                    old_item.quantity = new_qty
                    # If active, also update confirmed_quantity
                    if instance.order_status in ('confirmed', 'completed'):
                        old_item.confirmed_quantity = new_qty
                    
                    # For undelivered items, allow price/discount updates
                    if old_item.delivered_quantity == 0:
                        old_item.unit_price = new_price
                        old_item.discount_type = new_disc_type
                        old_item.discount_value = new_disc_val
                        old_item.discount_amount = discount_amount
                        old_item.line_total = line_total
                    else:
                        # Price/discount were validated to be identical, but recalculate line total just in case of quantity changes
                        old_item.discount_amount = discount_amount
                        old_item.line_total = line_total
                    
                    old_item.save()
                    processed_pids.add(pid)
                else:
                    # Create new OrderItem
                    historical_cost = historical_costs.get(pid)
                    final_cost_price = historical_cost if historical_cost is not None else product.cost_price
                    
                    OrderItem.objects.create(
                        order=instance,
                        product=product,
                        quantity=new_qty,
                        confirmed_quantity=new_qty if instance.order_status in ('confirmed', 'completed') else None,
                        unit_price=new_price,
                        cost_price=final_cost_price,
                        discount_type=new_disc_type,
                        discount_value=new_disc_val,
                        discount_amount=discount_amount,
                        line_total=line_total
                    )
                    processed_pids.add(pid)
            
            # Delete old items that were not in incoming payload and have 0 deliveries
            for old_pid, old_item in existing_items.items():
                if old_pid not in processed_pids and old_item.delivered_quantity == 0:
                    old_item.delete()
                    
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
    unit_price = serializers.SerializerMethodField()
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
        from decimal import Decimal
        order_item = obj.order_item
        if order_item.quantity <= 0:
            return Decimal('0.00')
            
        base_refund = (order_item.line_total / order_item.quantity) * obj.quantity
        order = order_item.order
        if order.subtotal > 0 and order.discount_amount > 0:
            ratio = order.total / order.subtotal
            return (base_refund * ratio).quantize(Decimal('0.01'))
            
        return Decimal(str(base_refund)).quantize(Decimal('0.01'))

    def get_unit_price(self, obj):
        from decimal import Decimal
        if obj.quantity <= 0:
            return Decimal('0.00')
        return (self.get_line_total(obj) / obj.quantity).quantize(Decimal('0.01'))



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
    order_max_refundable = serializers.DecimalField(source='order.max_refundable', max_digits=12, decimal_places=2, read_only=True)
    order_change_due = serializers.DecimalField(source='order.change_due', max_digits=12, decimal_places=2, read_only=True)
    order_net_paid = serializers.DecimalField(source='order.net_paid', max_digits=12, decimal_places=2, read_only=True)
    customer_name = serializers.SerializerMethodField()
    items = ReturnItemSerializer(many=True, read_only=True)
    refunds = serializers.SerializerMethodField()
    total_refund_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_refunded = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, default=None)
    
    class Meta:
        model = Return
        fields = [
            'id', 'display_id', 'order', 'order_display_id', 'order_total', 'order_max_refundable',
            'order_change_due', 'order_net_paid',
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
        """Validate order is delivered or partially delivered and not cancelled."""
        if value.delivery_status not in ['delivered', 'partial']:
            raise serializers.ValidationError('Can only return items from delivered or partially delivered orders.')
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
            available = order_item.delivered_quantity - already_returned
            
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
            # Check total refunds don't exceed order's max_refundable limit
            existing_refunds = sum(
                r.amount for r in order.refunds.filter(status='completed')
            )
            if existing_refunds + amount > order.max_refundable:
                raise serializers.ValidationError({
                    'amount': f'Total refunds ({existing_refunds + amount}) would exceed the maximum refundable limit ({order.max_refundable}).'
                })
        
        return data
        
    def create(self, validated_data):
        from django.db import transaction
        with transaction.atomic():
            # Idempotency Lock
            order = Order.objects.select_for_update().get(pk=validated_data['order'].pk)
            amount = validated_data.get('amount', Decimal('0'))
            existing_refunds = sum(r.amount for r in order.refunds.filter(status='completed'))
            if existing_refunds + amount > order.max_refundable:
                raise serializers.ValidationError({
                    'amount': f'Concurrent refund attempt blocked. Total refunds would exceed the maximum refundable limit.'
                })
            
            refund = super().create(validated_data)
            method = validated_data.get('method')
            
            if method == 'customer_wallet':
                from customers.models import Customer, Wallet
                # Guest Conversion
                if order.is_guest:
                    cust = Customer.objects.create(
                        first_name=order.guest_name or f"Guest {order.id}",
                        phone=order.guest_phone or f"0000000000{order.id}"[:15],
                        notes=f"Auto-converted from guest for Refund #{refund.id} wallet credit"
                    )
                    order.customer = cust
                    order.is_guest = False
                    order.save(update_fields=['customer', 'is_guest'])
                    
                customer_wallet, _ = Wallet.objects.select_for_update().get_or_create(customer=order.customer)
                cwt = customer_wallet.credit(
                    amount,
                    f"Refund for Order #{order.display_id}",
                    user=validated_data.get('created_by')
                )
                refund.customer_wallet_transaction = cwt
                refund.save(update_fields=['customer_wallet_transaction'])
                
            elif method in ['bank', 'cash', 'upi', 'cheque']:
                from finance.services import LedgerService
                transaction_obj = LedgerService.process_withdrawal(
                    amount=refund.amount,
                    source_bank=refund.source_bank,
                    source_wallet=refund.source_wallet,
                    reference=f"refund_{refund.id}",
                    description=f"Refund for Order #{refund.order.display_id}",
                    user=validated_data.get('created_by')
                )
                if transaction_obj:
                    if refund.source_bank:
                        refund.bank_transaction = transaction_obj
                        refund.save(update_fields=['bank_transaction'])
                    elif refund.source_wallet:
                        refund.wallet_transaction = transaction_obj
                        refund.save(update_fields=['wallet_transaction'])
                        
            return refund


class CreditNoteSerializer(serializers.ModelSerializer):
    """Serializer for credit notes."""
    refund_amount = serializers.DecimalField(source='refund.amount', max_digits=12, decimal_places=2, read_only=True)
    order_display_id = serializers.IntegerField(source='refund.order.display_id', read_only=True)
    
    class Meta:
        model = CreditNote
        fields = ['id', 'display_id', 'refund', 'refund_amount', 'order_display_id', 'created_at']
        read_only_fields = ['id', 'display_id', 'created_at']
