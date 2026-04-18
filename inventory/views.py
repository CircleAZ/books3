from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, F
from django.core.exceptions import ValidationError
from django_filters.rest_framework import DjangoFilterBackend
from .models import Category, Vendor, Tag, Product, StockAdjustment, StockHistory
from .serializers import (
    CategorySerializer, VendorSerializer, TagSerializer,
    ProductListSerializer, ProductDetailSerializer, ProductCreateUpdateSerializer,
    StockAdjustmentSerializer, StockHistorySerializer
)
from .services import StockService
from django.db import transaction

class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.annotate(product_count=Count('products'))
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        reassign_to_id = request.query_params.get('reassign_to')
        
        if reassign_to_id:
            # Guard: cannot reassign to the category being deleted
            if str(reassign_to_id) == str(instance.pk):
                return Response(
                    {'error': 'Cannot reassign products to the category being deleted.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            with transaction.atomic():
                try:
                    new_category = Category.objects.get(pk=reassign_to_id)
                    instance.products.update(category=new_category)
                except (Category.DoesNotExist, ValidationError):
                    return Response(
                        {'error': 'Target category for reassignment not found.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
        
        # If no reassign_to, products become null (SET_NULL in model)
        return super().destroy(request, *args, **kwargs)

class VendorViewSet(viewsets.ModelViewSet):
    queryset = Vendor.objects.annotate(product_count=Count('products'))
    serializer_class = VendorSerializer
    permission_classes = [IsAuthenticated]

class TagViewSet(viewsets.ModelViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [IsAuthenticated]

class ProductViewSet(viewsets.ModelViewSet):
    # Default queryset filters out deleted items via SoftDeleteManager
    # Optimized queryset to prevent N+1 queries
    queryset = Product.objects.all().select_related('category', 'vendor').prefetch_related('images', 'tags')
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend, filters.OrderingFilter]
    search_fields = ['name', 'display_id']
    filterset_fields = ['category', 'vendor', 'is_deleted']
    ordering_fields = ['created_at', 'name', 'category__name', 'vendor__name', 'cost_price', 'selling_price', 'stock_quantity', 'order_count']
    ordering = ['-order_count', '-created_at', 'id']

    def get_queryset(self):
        return super().get_queryset().annotate(
            order_count=Count('order_items', distinct=True)
        )

    def get_serializer_class(self):
        if self.action == 'list':
            return ProductListSerializer
        elif self.action == 'retrieve':
            return ProductDetailSerializer
        return ProductCreateUpdateSerializer

    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        """Return products where stock_quantity <= low_stock_threshold"""
        queryset = self.filter_queryset(self.get_queryset())
        products = queryset.filter(stock_quantity__lte=F('low_stock_threshold')).order_by('stock_quantity')
        
        # Bypass pagination so the frontend receives all alerts simultaneously
        serializer = ProductListSerializer(products, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def negative_stock(self, request):
        """Return products where stock_quantity < 0"""
        queryset = self.filter_queryset(self.get_queryset())
        products = queryset.filter(stock_quantity__lt=0).order_by('stock_quantity')
        
        # Bypass pagination so the frontend receives all alerts simultaneously
        serializer = ProductListSerializer(products, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def deleted(self, request):
        # Use .all_objects to access everything, then filter for deleted
        deleted_products = Product.all_objects.filter(is_deleted=True)
        
        # Apply pagination if configured
        page = self.paginate_queryset(deleted_products)
        if page is not None:
            serializer = ProductListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
            
        serializer = ProductListSerializer(deleted_products, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        try:
            # Need all_objects because standard objects manager hides deleted ones
            product = Product.all_objects.get(pk=pk)
        except Product.DoesNotExist:
            return Response({'detail': 'Product not found.'}, status=status.HTTP_404_NOT_FOUND)
            
        product.restore()
        serializer = ProductDetailSerializer(product)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def hard_delete(self, request, pk=None):
        """Permanently delete a soft-deleted product."""
        try:
            product = Product.all_objects.get(pk=pk)
        except Product.DoesNotExist:
            return Response({'detail': 'Product not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not product.is_deleted:
            return Response(
                {'detail': 'Product must be soft-deleted before it can be permanently deleted.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        product.hard_delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def remove_image(self, request, pk=None):
        """Remove a specific image from the product."""
        try:
            product = self.get_object()
            image_id = request.data.get('image_id')
            # Local import to avoid circular dependency if needed, but ProductImage is already accessible if we query product.images
            image = product.images.get(id=image_id)
            image.delete()
            return Response({'detail': 'Image removed successfully.'}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)



class StockAdjustmentViewSet(viewsets.ModelViewSet):
    queryset = StockAdjustment.objects.all().order_by('-created_at')
    serializer_class = StockAdjustmentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['product__name', 'reason', 'notes']
    filterset_fields = ['product', 'adjustment_type', 'created_by']

    def perform_create(self, serializer):
        """
        Use StockService for atomic update and history logging.
        StockService.adjust_stock already creates the StockAdjustment and
        StockHistory records atomically — do NOT call serializer.save()
        as that would create a duplicate StockAdjustment.
        """
        StockService.adjust_stock(
            product_id=serializer.validated_data['product'].pk,
            adjustment_type=serializer.validated_data['adjustment_type'],
            quantity=serializer.validated_data['quantity'],
            reason=serializer.validated_data['reason'],
            notes=serializer.validated_data.get('notes', ''),
            user=self.request.user,
            unit_cost=serializer.validated_data.get('unit_cost'),
        )

class StockHistoryViewSet(viewsets.ModelViewSet):
    queryset = StockHistory.objects.all()
    serializer_class = StockHistorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.OrderingFilter, DjangoFilterBackend]
    ordering = ['-created_at']
    filterset_fields = ['product', 'reason']

    ordering = ['-created_at']
    filterset_fields = ['product', 'reason']
    http_method_names = ['get', 'head', 'options'] # Read-only

    # perform_create removed. Usage must go through StockAdjustment.
