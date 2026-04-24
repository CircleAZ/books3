from rest_framework import serializers
from .models import Category, Vendor, Tag, Product, ProductImage, StockAdjustment, StockHistory
from core.permissions import HasRequiredPermission

def has_finance_perms(request):
    if not request or not getattr(request, 'user', None) or not request.user.is_authenticated:
        return False
    if getattr(request.user, 'is_superuser', False):
        return True
    return (HasRequiredPermission._check_rbac(request.user, 'finance.manage_expenses') or
            HasRequiredPermission._check_rbac(request.user, 'finance.view_reports'))

class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ['id', 'name', 'description', 'display_id', 'product_count']
        read_only_fields = ['display_id']

class VendorSerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Vendor
        fields = [
            'id', 'name', 'description', 
            'contact_name', 'contact_email', 'contact_phone', 
            'address', 'notes', 'product_count'
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if not has_finance_perms(request):
            data.pop('contact_name', None)
            data.pop('contact_email', None)
            data.pop('contact_phone', None)
        return data

class StockAdjustmentSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = StockAdjustment
        fields = [
            'id', 'product', 'product_name', 'adjustment_type', 
            'quantity', 'unit_cost', 'reason', 'notes', 'created_by', 'created_at'
        ]
        read_only_fields = ['created_by', 'created_at']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if not has_finance_perms(request):
            data.pop('unit_cost', None)
        return data

    def create(self, validated_data):
        # Ensure created_by is set from context if available
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['created_by'] = request.user
        return super().create(validated_data)

class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['id', 'name']

class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ['id', 'image', 'thumbnail', 'is_primary']

class ProductListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    primary_image_url = serializers.SerializerMethodField()
    is_low_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id', 'display_id', 'name', 'category_name', 'vendor_name',
            'cost_price', 'selling_price', 'stock_quantity',
            'low_stock_threshold', 'primary_image_url', 'is_low_stock',
            'deleted_at'
        ]
        read_only_fields = ['display_id']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if not has_finance_perms(request):
            data.pop('cost_price', None)
        return data

    def get_primary_image_url(self, obj):
        # Use .all() to leverage prefetch_related cache
        images = list(obj.images.all())
        if not images:
            return None
            
        # Find primary image in python
        primary = next((img for img in images if img.is_primary), None)
        
        # Fallback to first image
        target_image = primary if primary else images[0]
        
        try:
            url = target_image.thumbnail.url if target_image.thumbnail else target_image.image.url
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(url)
            return url
        except ValueError:
            return None

    def get_is_low_stock(self, obj):
        return obj.stock_quantity <= obj.low_stock_threshold

class ProductDetailSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    vendor = VendorSerializer(read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    is_low_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id', 'display_id', 'name', 'description', 'category', 'vendor',
            'tags', 'images', 'cost_price', 'selling_price',
            'stock_quantity', 'low_stock_threshold', 'is_low_stock'
        ]
        read_only_fields = ['display_id']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if not has_finance_perms(request):
            data.pop('cost_price', None)
        return data

    def get_is_low_stock(self, obj):
        return obj.stock_quantity <= obj.low_stock_threshold

class ProductCreateUpdateSerializer(serializers.ModelSerializer):
    images = serializers.ListField(child=serializers.ImageField(), write_only=True, required=False)
    thumbnails = serializers.ListField(child=serializers.ImageField(), write_only=True, required=False)
    tags = serializers.ListField(child=serializers.CharField(), write_only=True, required=False)

    class Meta:
        model = Product
        fields = [
            'id', 'display_id', 'name', 'description', 'category', 'vendor', 'tags',
            'cost_price', 'selling_price', 'stock_quantity', 'low_stock_threshold',
            'is_additional', 'images', 'thumbnails'
        ]
        read_only_fields = ['id', 'display_id']
    
    def validate_name(self, value):
        """Sanitize name to prevent XSS."""
        from django.utils.html import strip_tags
        return strip_tags(value).strip() if value else value
    
    def validate_description(self, value):
        """Sanitize description to prevent XSS."""
        from django.utils.html import strip_tags
        return strip_tags(value) if value else value
    
    def validate_selling_price(self, value):
        """Prevent negative prices."""
        if value is not None and value < 0:
            raise serializers.ValidationError("Price cannot be negative")
        return value
    
    def validate_cost_price(self, value):
        """Prevent negative costs."""
        if value is not None and value < 0:
            raise serializers.ValidationError("Cost price cannot be negative")
        return value

    def create(self, validated_data):
        tags_data = validated_data.pop('tags', [])
        images_data = validated_data.pop('images', [])
        thumbnails_data = validated_data.pop('thumbnails', [])

        product = Product.objects.create(**validated_data)

        for tag_name in tags_data:
            tag, _ = Tag.objects.get_or_create(name=tag_name)
            product.tags.add(tag)

        for i, image_data in enumerate(images_data):
            thumb_data = thumbnails_data[i] if i < len(thumbnails_data) else None
            ProductImage.objects.create(
                product=product,
                image=image_data,
                thumbnail=thumb_data,
                is_primary=(i == 0)
            )

        return product

    def update(self, instance, validated_data):
        tags_data = validated_data.pop('tags', None)
        images_data = validated_data.pop('images', None)

        # Update scalar fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Update tags if provided (clear and re-add)
        if tags_data is not None:
            instance.tags.clear()
            for tag_name in tags_data:
                tag, _ = Tag.objects.get_or_create(name=tag_name)
                instance.tags.add(tag)

        # Append new images (don't destroy existing ones — use remove_image endpoint for individual deletion)
        if images_data is not None:
            thumbnails_data = validated_data.pop('thumbnails', [])
            existing_count = instance.images.count()
            try:
                for i, image_data in enumerate(images_data):
                    thumb_data = thumbnails_data[i] if i < len(thumbnails_data) else None
                    ProductImage.objects.create(
                        product=instance,
                        image=image_data,
                        thumbnail=thumb_data,
                        is_primary=(existing_count == 0 and i == 0)
                    )
            except Exception as e:
                import traceback
                print(f"S3 Upload Error: {str(e)}")
                from rest_framework.serializers import ValidationError
                raise ValidationError({"images": f"Storage Error: {str(e)}"})

        return instance


class StockHistorySerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = StockHistory
        fields = [
            'id', 'product', 'product_name', 'quantity_change', 
            'quantity_after', 'cost_at_time', 'reason', 
            'notes', 'created_by', 'created_by_name', 'created_at'
        ]
        read_only_fields = ['quantity_after', 'cost_at_time', 'created_by']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if not has_finance_perms(request):
            data.pop('cost_at_time', None)
        return data
