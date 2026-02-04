from rest_framework import serializers
from .models import Category, Vendor, Tag, Product, ProductImage

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'description', 'display_id']
        read_only_fields = ['display_id']

class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = ['id', 'name', 'description', 'contact_email', 'contact_phone']

class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['id', 'name']

class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ['id', 'image', 'is_primary']

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
            'low_stock_threshold', 'primary_image_url', 'is_low_stock'
        ]
        read_only_fields = ['display_id']

    def get_primary_image_url(self, obj):
        image = obj.images.filter(is_primary=True).first()
        if image:
            try:
                return image.image.url
            except ValueError:
                return None
        first_image = obj.images.first()
        if first_image:
             try:
                return first_image.image.url
             except ValueError:
                return None
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

    def get_is_low_stock(self, obj):
        return obj.stock_quantity <= obj.low_stock_threshold

class ProductCreateUpdateSerializer(serializers.ModelSerializer):
    images = serializers.ListField(child=serializers.ImageField(), write_only=True, required=False)
    tags = serializers.ListField(child=serializers.CharField(), write_only=True, required=False)

    class Meta:
        model = Product
        fields = [
            'name', 'description', 'category', 'vendor', 'tags',
            'cost_price', 'selling_price', 'stock_quantity', 'low_stock_threshold',
            'is_additional', 'images'
        ]

    def create(self, validated_data):
        tags_data = validated_data.pop('tags', [])
        images_data = validated_data.pop('images', [])

        product = Product.objects.create(**validated_data)

        for tag_name in tags_data:
            tag, _ = Tag.objects.get_or_create(name=tag_name)
            product.tags.add(tag)

        for i, image_data in enumerate(images_data):
            ProductImage.objects.create(
                product=product,
                image=image_data,
                is_primary=(i == 0)
            )

        return product
