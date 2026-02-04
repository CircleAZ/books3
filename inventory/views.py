from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import Category, Vendor, Tag, Product
from .serializers import (
    CategorySerializer, VendorSerializer, TagSerializer,
    ProductListSerializer, ProductDetailSerializer, ProductCreateUpdateSerializer
)

class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]

class VendorViewSet(viewsets.ModelViewSet):
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    permission_classes = [IsAuthenticated]

class TagViewSet(viewsets.ModelViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [IsAuthenticated]

class ProductViewSet(viewsets.ModelViewSet):
    # Default queryset filters out deleted items via SoftDeleteManager
    queryset = Product.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend, filters.OrderingFilter]
    search_fields = ['name', 'display_id']
    filterset_fields = ['category', 'vendor', 'is_deleted']
    ordering_fields = ['created_at', 'name', 'selling_price']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return ProductListSerializer
        elif self.action == 'retrieve':
            return ProductDetailSerializer
        return ProductCreateUpdateSerializer

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