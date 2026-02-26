"""Receipt serializers."""
from rest_framework import serializers
from .receipt_models import Receipt, ReceiptVerification


class PublicReceiptSerializer(serializers.ModelSerializer):
    """Public receipt data with masked customer info."""
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    order_display_id = serializers.CharField(source='order.display_id', read_only=True)
    order_date = serializers.DateTimeField(source='order.created_at', read_only=True)
    items = serializers.SerializerMethodField()
    subtotal = serializers.DecimalField(source='order.subtotal', max_digits=12, decimal_places=2, read_only=True)
    discount = serializers.DecimalField(source='order.discount_amount', max_digits=12, decimal_places=2, read_only=True)
    tax = serializers.SerializerMethodField()
    total = serializers.DecimalField(source='order.total', max_digits=12, decimal_places=2, read_only=True)
    paid = serializers.DecimalField(source='order.amount_paid', max_digits=12, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(source='order.balance_due', max_digits=12, decimal_places=2, read_only=True)
    payment_status = serializers.CharField(source='order.payment_status', read_only=True)

    class Meta:
        model = Receipt
        fields = [
            'public_uuid', 'order_display_id', 'order_date',
            'customer_name', 'customer_phone',
            'items', 'subtotal', 'discount', 'tax', 'total',
            'paid', 'balance', 'payment_status', 'created_at'
        ]
    
    def get_customer_name(self, obj):
        return obj.get_masked_customer_name()
    
    def get_customer_phone(self, obj):
        return obj.get_masked_phone()
    
    def get_tax(self, obj):
        return 0.0
    
    def get_items(self, obj):
        """Get order items with minimal info."""
        items = []
        for item in obj.order.items.all():
            items.append({
                'name': item.product.name if item.product else 'Unknown',
                'quantity': item.quantity,
                'price': str(item.unit_price),
                'total': str(item.line_total)
            })
        return items


class ReceiptVerificationSerializer(serializers.Serializer):
    """Verify phone for PDF download."""
    phone_last4 = serializers.CharField(max_length=4, min_length=4)
    
    def validate_phone_last4(self, value):
        if not value.isdigit():
            raise serializers.ValidationError("Must be 4 digits")
        return value
