from rest_framework import serializers
from .models import (Outlet, OutletStock, OutletStockTransfer, OutletStockTransferItem, 
                     OutletStockReturn, OutletStockReturnItem, OutletDailySale, 
                     OutletDailySaleItem, OutletPayment, OutletProductCommission)
from inventory.serializers import ProductListSerializer

class OutletSerializer(serializers.ModelSerializer):
    total_gross_sales = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_commission = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_net_sales = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_paid = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    outstanding_balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Outlet
        fields = '__all__'
        read_only_fields = ('display_id',)


# --- Commission Overrides ---
class OutletProductCommissionSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.SerializerMethodField()
    default_commission = serializers.DecimalField(
        source='product.default_commission', max_digits=5, decimal_places=2, read_only=True
    )

    class Meta:
        model = OutletProductCommission
        fields = ('id', 'outlet', 'product', 'product_name', 'product_sku', 
                  'commission_percentage', 'default_commission')

    def get_product_sku(self, obj):
        return getattr(obj.product, 'sku', '') if obj.product else ''


class OutletStockSerializer(serializers.ModelSerializer):
    product_details = ProductListSerializer(source='product', read_only=True)
    
    class Meta:
        model = OutletStock
        fields = ('id', 'outlet', 'product', 'product_details', 'quantity')


# --- Transfers ---
class OutletStockTransferItemSerializer(serializers.ModelSerializer):
    product_details = ProductListSerializer(source='product', read_only=True)
    
    class Meta:
        model = OutletStockTransferItem
        fields = ('id', 'product', 'product_details', 'quantity', 'frozen_cost_price')
        read_only_fields = ('frozen_cost_price',)

class OutletStockTransferSerializer(serializers.ModelSerializer):
    items = OutletStockTransferItemSerializer(many=True, required=False)
    
    class Meta:
        model = OutletStockTransfer
        fields = '__all__'
        read_only_fields = ('display_id', 'created_by', 'status')

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        transfer = OutletStockTransfer.objects.create(**validated_data)
        for item_data in items_data:
            OutletStockTransferItem.objects.create(transfer=transfer, **item_data)
        return transfer

    def update(self, instance, validated_data):
        from django.db import transaction
        if instance.status != OutletStockTransfer.Status.DRAFT:
            raise serializers.ValidationError("Only draft transfers can be modified.")
            
        items_data = validated_data.pop('items', None)
        
        with transaction.atomic():
            # Update basic fields if any
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
            
            # Recreate nested items if provided
            if items_data is not None:
                instance.items.all().delete()
                for item_data in items_data:
                    OutletStockTransferItem.objects.create(transfer=instance, **item_data)
                    
        return instance


# --- Returns ---
class OutletStockReturnItemSerializer(serializers.ModelSerializer):
    product_details = ProductListSerializer(source='product', read_only=True)
    
    class Meta:
        model = OutletStockReturnItem
        fields = ('id', 'product', 'product_details', 'quantity')

class OutletStockReturnSerializer(serializers.ModelSerializer):
    items = OutletStockReturnItemSerializer(many=True, required=False)
    
    class Meta:
        model = OutletStockReturn
        fields = '__all__'
        read_only_fields = ('display_id', 'created_by', 'status')

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        return_rec = OutletStockReturn.objects.create(**validated_data)
        for item_data in items_data:
            OutletStockReturnItem.objects.create(return_record=return_rec, **item_data)
        return return_rec


# --- Sales ---
class OutletDailySaleItemSerializer(serializers.ModelSerializer):
    product_details = ProductListSerializer(source='product', read_only=True)
    
    class Meta:
        model = OutletDailySaleItem
        fields = ('id', 'product', 'product_details', 'quantity', 'unit_price', 
                  'commission_percentage', 'commission_amount', 'line_total')
        read_only_fields = ('unit_price', 'commission_percentage', 'commission_amount', 'line_total')

class OutletDailySaleSerializer(serializers.ModelSerializer):
    items = OutletDailySaleItemSerializer(many=True, required=False)
    
    class Meta:
        model = OutletDailySale
        fields = '__all__'
        read_only_fields = ('display_id', 'recorded_by', 'gross_total', 'commission_amount', 'net_total')

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        sale = OutletDailySale.objects.create(**validated_data)
        for item_data in items_data:
            OutletDailySaleItem.objects.create(sale=sale, **item_data)
        return sale


# --- Payments ---
class OutletPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = OutletPayment
        fields = '__all__'
        read_only_fields = ('display_id', 'recorded_by', 'bank_transaction', 'wallet_transaction')
