"""Living receipt serializers — reads from Order directly (not through Receipt model).

Per tribunal mandate: Receipt is a "living document" showing items + payment history + balance.
The separate Receipt model was merged into Order.receipt_uuid.
"""
from rest_framework import serializers
from .models import Order, Payment


class ReceiptPaymentSerializer(serializers.ModelSerializer):
    """Payment record for the living receipt."""
    method_display = serializers.CharField(source='get_method_display', read_only=True)
    date = serializers.DateTimeField(source='created_at', format='%d/%m/%Y', read_only=True)

    class Meta:
        model = Payment
        fields = ['date', 'method_display', 'amount']


class LivingReceiptSerializer(serializers.ModelSerializer):
    """
    Public living receipt: items + payment history + balance.
    
    Served at /api/orders/receipts/{receipt_uuid}/
    No authentication required — receipt_uuid acts as capability token.
    """
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    payments = ReceiptPaymentSerializer(many=True, read_only=True)
    paid = serializers.DecimalField(
        source='amount_paid', max_digits=12, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(
        source='balance_due', max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Order
        fields = [
            'receipt_uuid', 'display_id', 'created_at',
            'customer_name', 'customer_phone',
            'items', 'subtotal', 'discount_amount', 'total',
            'payments', 'paid', 'balance', 'payment_status',
        ]

    def get_customer_name(self, obj):
        """Mask customer name for privacy on public receipt."""
        if obj.is_guest:
            name = obj.guest_name or "Guest"
        elif obj.customer:
            name = obj.customer.full_name
        else:
            return "Guest"
        if len(name) <= 3:
            return name[0] + "***"
        return name[:3] + "***"

    def get_customer_phone(self, obj):
        """Mask phone number for privacy on public receipt."""
        phone = obj.customer.phone if obj.customer else obj.guest_phone
        if not phone or len(phone) < 6:
            return phone or "N/A"
        return phone[:2] + "****" + phone[-2:]

    def get_items(self, obj):
        """Get order items with minimal info for receipt display."""
        return [
            {
                'name': item.product.name if item.product else 'Unknown',
                'quantity': item.quantity,
                'price': str(item.unit_price),
                'total': str(item.line_total),
            }
            for item in obj.items.select_related('product').all()
        ]


class BalanceSerializer(serializers.ModelSerializer):
    """
    Tiny serializer — just current balance for UPI Pay Now button.
    
    This endpoint is NEVER cached (must be live for UPI amount accuracy).
    Served at /api/orders/receipts/{receipt_uuid}/balance/
    """
    balance = serializers.DecimalField(
        source='balance_due', max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Order
        fields = ['balance', 'payment_status']
