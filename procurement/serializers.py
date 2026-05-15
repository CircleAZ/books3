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
    is_pack = serializers.BooleanField(source='product.is_pack', read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = [
            'id', 'purchase_order', 'product', 'product_name', 'is_pack',
            'vendor_pack_size', 'purchased_packs', 'ordered_quantity', 
            'received_packs', 'unit_cost_price', 'line_total'
        ]
        read_only_fields = ['ordered_quantity', 'line_total']

class PurchaseChargeSerializer(serializers.ModelSerializer):
    transporter_name = serializers.CharField(source='transporter.name', read_only=True, default='')

    class Meta:
        model = PurchaseCharge
        fields = ['id', 'purchase_order', 'charge_type', 'transporter', 'transporter_name', 'amount', 'description']

class PurchasePaymentSerializer(serializers.ModelSerializer):
    paid_by_employee_name = serializers.CharField(source='paid_by_employee.get_full_name', read_only=True, default='')
    source_wallet_name = serializers.CharField(source='source_wallet.name', read_only=True, default='')
    source_bank_name = serializers.CharField(source='source_bank.name', read_only=True, default='')

    bypass_finance_expense = serializers.BooleanField(write_only=True, required=False, default=False)
    bypass_finance_ledger = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = PurchasePayment
        fields = [
            'id', 'purchase_order', 'purchase_charge', 'amount', 'payment_method', 
            'paid_by_employee', 'paid_by_employee_name', 'finance_expense', 
            'source_wallet', 'source_wallet_name', 'source_bank', 'source_bank_name',
            'payment_date', 'reference_id', 'is_historical_bypass',
            'bypass_finance_expense', 'bypass_finance_ledger'
        ]
        read_only_fields = ['finance_expense', 'payment_date', 'is_historical_bypass']

class PurchaseOrderListSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'display_id', 'vendor', 'vendor_name', 'status', 'payment_status', 
            'order_date', 'expected_delivery_date', 'subtotal', 'total_charges', 
            'total_amount', 'amount_paid', 'created_by_name', 'is_historical_bypass'
        ]

class PurchaseOrderDetailSerializer(PurchaseOrderListSerializer):
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    charges = PurchaseChargeSerializer(many=True, read_only=True)
    payments = PurchasePaymentSerializer(many=True, read_only=True)

    class Meta(PurchaseOrderListSerializer.Meta):
        fields = PurchaseOrderListSerializer.Meta.fields + ['items', 'charges', 'payments', 'notes']

# ── V6 FIX: All PKs are UUIDs, not Integers ──
class POItemCreateSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    vendor_pack_size = serializers.IntegerField(min_value=1)
    purchased_packs = serializers.IntegerField(min_value=1)
    unit_cost_price = serializers.DecimalField(max_digits=10, decimal_places=4)

class POChargeCreateSerializer(serializers.Serializer):
    charge_type = serializers.ChoiceField(choices=PurchaseCharge.ChargeType.choices)
    transporter_id = serializers.UUIDField(required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.01'))
    description = serializers.CharField(required=False, allow_blank=True, default='')

class POCreateSerializer(serializers.Serializer):
    vendor_id = serializers.UUIDField()
    expected_delivery_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    items = POItemCreateSerializer(many=True)
    charges = POChargeCreateSerializer(many=True, required=False, default=list)
    
    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value

# ── C4 FIX: Typed receive serializer instead of raw DictField ──
class POReceiveItemSerializer(serializers.Serializer):
    item_id = serializers.UUIDField()
    received_packs = serializers.IntegerField(min_value=0)

class POReceiveSerializer(serializers.Serializer):
    items = POReceiveItemSerializer(many=True)
    bypass_inventory_volume = serializers.BooleanField(required=False, default=False)
    bypass_inventory_wac = serializers.BooleanField(required=False, default=False)
