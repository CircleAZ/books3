from rest_framework import serializers
from decimal import Decimal
from .models import Transporter, PurchaseOrder, PurchaseOrderItem, PurchaseCharge, PurchasePayment
from inventory.models import Product

class TransporterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transporter
        fields = '__all__'

class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)


    class Meta:
        model = PurchaseOrderItem
        fields = [
            'id', 'purchase_order', 'product', 'product_name',
            'vendor_pack_size', 'purchased_packs', 'ordered_quantity', 
            'received_packs', 'unit_cost_price', 'line_total'
        ]
        read_only_fields = ['ordered_quantity', 'line_total']

class PurchaseChargeSerializer(serializers.ModelSerializer):
    transporter_name = serializers.CharField(source='transporter.name', read_only=True)

    class Meta:
        model = PurchaseCharge
        fields = ['id', 'purchase_order', 'charge_type', 'transporter', 'transporter_name', 'amount', 'description']

class PurchasePaymentSerializer(serializers.ModelSerializer):
    paid_by_employee_name = serializers.CharField(source='paid_by_employee.get_full_name', read_only=True)

    class Meta:
        model = PurchasePayment
        fields = [
            'id', 'purchase_order', 'purchase_charge', 'amount', 'payment_method', 
            'paid_by_employee', 'paid_by_employee_name', 'finance_expense', 
            'payment_date', 'reference_id'
        ]
        read_only_fields = ['finance_expense', 'payment_date']

class PurchaseOrderListSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'display_id', 'vendor', 'vendor_name', 'status', 'payment_status', 
            'order_date', 'expected_delivery_date', 'subtotal', 'total_charges', 
            'total_amount', 'amount_paid', 'created_by_name'
        ]

class PurchaseOrderDetailSerializer(PurchaseOrderListSerializer):
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    charges = PurchaseChargeSerializer(many=True, read_only=True)
    payments = PurchasePaymentSerializer(many=True, read_only=True)

    class Meta(PurchaseOrderListSerializer.Meta):
        fields = PurchaseOrderListSerializer.Meta.fields + ['items', 'charges', 'payments', 'notes']

class POItemCreateSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    vendor_pack_size = serializers.IntegerField(min_value=1)
    purchased_packs = serializers.IntegerField(min_value=1)
    unit_cost_price = serializers.DecimalField(max_digits=10, decimal_places=4)

class POCreateSerializer(serializers.Serializer):
    vendor_id = serializers.IntegerField()
    expected_delivery_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    items = POItemCreateSerializer(many=True)
    
    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value

class POReceiveSerializer(serializers.Serializer):
    # Expects [{'item_id': UUID, 'received_packs': int}]
    items = serializers.ListField(
        child=serializers.DictField()
    )
