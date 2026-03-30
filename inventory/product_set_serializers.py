from rest_framework import serializers
from .product_set_models import ProductSet, ProductSetItem
from .models import Product


class ProductSetItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    selling_price = serializers.DecimalField(
        source='product.selling_price', max_digits=10, decimal_places=2, read_only=True
    )
    cost_price = serializers.DecimalField(
        source='product.cost_price', max_digits=10, decimal_places=2, read_only=True
    )
    stock_quantity = serializers.IntegerField(source='product.stock_quantity', read_only=True)
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = ProductSetItem
        fields = [
            'id', 'product', 'product_name', 'quantity', 'notes',
            'selling_price', 'cost_price', 'stock_quantity', 'line_total',
        ]

    def get_line_total(self, obj):
        return float(obj.product.selling_price * obj.quantity)


class ProductSetSerializer(serializers.ModelSerializer):
    items = ProductSetItemSerializer(many=True, read_only=True)
    school_name = serializers.CharField(source='school.name', read_only=True, default=None)
    item_count = serializers.IntegerField(read_only=True)
    total_value = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = ProductSet
        fields = [
            'id', 'name', 'description', 'class_name',
            'school', 'school_name', 'division_name', 'subdivision_name',
            'is_active', 'item_count', 'total_value',
            'items', 'created_at', 'created_by',
        ]
        read_only_fields = ['created_by', 'created_at']


class ProductSetCreateSerializer(serializers.ModelSerializer):
    """Create/Update serializer that accepts inline items."""
    items = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)

    class Meta:
        model = ProductSet
        fields = [
            'id', 'name', 'description', 'class_name',
            'school', 'division_name', 'subdivision_name',
            'is_active', 'items',
        ]

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        validated_data['created_by'] = self.context['request'].user
        product_set = ProductSet.objects.create(**validated_data)
        self._save_items(product_set, items_data)
        return product_set

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data is not None:
            # Replace all items
            instance.items.all().delete()
            self._save_items(instance, items_data)
        return instance

    def _save_items(self, product_set, items_data):
        for item in items_data:
            ProductSetItem.objects.create(
                product_set=product_set,
                product_id=item['product'],
                quantity=item.get('quantity', 1),
                notes=item.get('notes', ''),
            )


class ProductSetResolveSerializer(serializers.Serializer):
    """Response serializer for the resolve endpoint."""
    product_set = ProductSetSerializer(read_only=True)
    scope_label = serializers.CharField(read_only=True)
