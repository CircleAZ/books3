from rest_framework import viewsets, filters, status
import logging
logger = logging.getLogger(__name__)

from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, F, Sum, Q, Subquery, OuterRef, IntegerField, Value
from django.db.models.functions import Coalesce, Greatest

from django.core.exceptions import ValidationError
import django_filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import Category, Vendor, Tag, Product, StockAdjustment, StockHistory
from .filters import ProductTokenizedSearchFilter
from orders.constants import VALID_SALE_STATUSES
from .serializers import (
    CategorySerializer, VendorSerializer, TagSerializer,
    ProductListSerializer, ProductDetailSerializer, ProductCreateUpdateSerializer,
    StockAdjustmentSerializer, StockHistorySerializer
)
from .services import StockService
from django.db import transaction
from core.permissions import HasRequiredPermission
from rest_framework.pagination import PageNumberPagination

class ProductPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 1000

class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.annotate(product_count=Count('products'))
    serializer_class = CategorySerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'inventory.manage_categories'
    permission_map = {
        'list': 'inventory.view_products',
        'retrieve': 'inventory.view_products',
    }
    pagination_class = None

    def list(self, request, *args, **kwargs):
        from django.core.cache import cache
        import hashlib
        import json
        
        try:
            cache_version = cache.get_or_set('category_cache_version', 1)
            params = sorted(request.query_params.items())
            params_hash = hashlib.md5(json.dumps(params).encode('utf-8')).hexdigest()
            cache_key = f"category_list_v{cache_version}_{params_hash}"
            
            cached_data = cache.get(cache_key)
            if cached_data is not None:
                return Response(cached_data)
        except Exception as e:
            logger.warning(f"Category cache lookup failed: {e}")
            cache_key = None
            
        response = super().list(request, *args, **kwargs)
        
        if cache_key is not None and response.status_code == 200:
            try:
                cache.set(cache_key, response.data, timeout=86400)  # 24 hours
            except Exception as e:
                logger.warning(f"Category cache write failed: {e}")
        return response

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
    permission_classes = [HasRequiredPermission]
    required_permission = 'inventory.manage_vendors'
    permission_map = {
        'list': 'inventory.view_products',
        'retrieve': 'inventory.view_products',
    }
    pagination_class = None

    def list(self, request, *args, **kwargs):
        from django.core.cache import cache
        import hashlib
        import json
        
        try:
            cache_version = cache.get_or_set('vendor_cache_version', 1)
            params = sorted(request.query_params.items())
            params_hash = hashlib.md5(json.dumps(params).encode('utf-8')).hexdigest()
            cache_key = f"vendor_list_v{cache_version}_{params_hash}"
            
            cached_data = cache.get(cache_key)
            if cached_data is not None:
                return Response(cached_data)
        except Exception as e:
            logger.warning(f"Vendor cache lookup failed: {e}")
            cache_key = None
            
        response = super().list(request, *args, **kwargs)
        
        if cache_key is not None and response.status_code == 200:
            try:
                cache.set(cache_key, response.data, timeout=86400)  # 24 hours
            except Exception as e:
                logger.warning(f"Vendor cache write failed: {e}")
        return response

class TagViewSet(viewsets.ModelViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'inventory.manage_products'

class ProductViewSet(viewsets.ModelViewSet):
    # Default queryset filters out deleted items via SoftDeleteManager
    # Optimized queryset to prevent N+1 queries
    queryset = Product.objects.all().select_related('category', 'vendor').prefetch_related('images', 'tags')
    permission_classes = [HasRequiredPermission]
    required_permission = 'inventory.manage_products'
    pagination_class = ProductPagination
    permission_map = {
        'list': 'inventory.view_products',
        'retrieve': 'inventory.view_products',
        'low_stock': 'inventory.view_products',
        'negative_stock': 'inventory.view_products',
        'deleted': 'inventory.manage_products',
        'search_suggestions': 'inventory.view_products',
    }
    filter_backends = [ProductTokenizedSearchFilter, DjangoFilterBackend, filters.OrderingFilter]
    search_fields = ['name', 'display_id']
    filterset_fields = ['category', 'vendor', 'is_deleted']
    ordering_fields = ['display_id', 'created_at', 'name', 'category__name', 'vendor__name', 'cost_price', 'selling_price', 'stock_quantity', 'order_count', 'delivered_quantity', 'owed_quantity']
    ordering = ['-created_at', 'id']

    def list(self, request, *args, **kwargs):
        from django.core.cache import cache
        import hashlib
        import json
        
        try:
            cache_version = cache.get_or_set('product_cache_version', 1)
            params = sorted(request.query_params.items())
            params_hash = hashlib.md5(json.dumps(params).encode('utf-8')).hexdigest()
            cache_key = f"product_list_v{cache_version}_{params_hash}"
            
            cached_data = cache.get(cache_key)
            if cached_data is not None:
                return Response(cached_data)
        except Exception as e:
            logger.warning(f"Product cache lookup failed: {e}")
            cache_key = None
            
        response = super().list(request, *args, **kwargs)
        
        if cache_key is not None and response.status_code == 200:
            try:
                cache.set(cache_key, response.data, timeout=300)  # 5 minutes
            except Exception as e:
                logger.warning(f"Product cache write failed: {e}")
        return response

    def get_queryset(self):
        qs = super().get_queryset()
        
        # Annotate order_count when explicitly requested in ordering params.
        # The default ordering no longer references order_count to prevent
        # FieldError crashes on retrieve/detail actions where the annotation
        # would be missing (the annotation adds a costly COUNT JOIN).
        ordering = self.request.query_params.get('ordering', '')
        if 'order_count' in ordering:
            qs = qs.annotate(order_count=Count('order_items', distinct=True))
            
        from orders.models import OrderItem, DeliveryItem
        
        # Subquery for delivered quantity of each OrderItem
        delivered_subquery = DeliveryItem.objects.filter(
            order_item=OuterRef('pk')
        ).values('order_item').annotate(
            total=Sum('quantity')
        ).values('total')
        
        # Subquery for total owed quantity of a product (sum of remaining quantities of active order items)
        owed_subquery = OrderItem.objects.filter(
            product=OuterRef('pk'),
            order__order_status__in=VALID_SALE_STATUSES,
            order__cancellation_status__in=['na', 'pending'],
            order__is_deleted=False
        ).annotate(
            delivered_qty=Coalesce(Subquery(delivered_subquery), 0),
            remaining=Greatest(0, Coalesce(F('confirmed_quantity'), F('quantity')) - F('delivered_qty'))
        ).values('product').annotate(
            total_owed=Sum('remaining')
        ).values('total_owed')
        
        # Subquery for total pack variants' owed quantity (remaining quantities * pack_size)
        pack_owed_subquery = OrderItem.objects.filter(
            product__base_product=OuterRef('pk'),
            product__is_pack=True,
            order__order_status__in=VALID_SALE_STATUSES,
            order__cancellation_status__in=['na', 'pending'],
            order__is_deleted=False
        ).annotate(
            delivered_qty=Coalesce(Subquery(delivered_subquery), 0),
            remaining=Greatest(0, Coalesce(F('confirmed_quantity'), F('quantity')) - F('delivered_qty')),
            pack_remaining=F('remaining') * F('product__pack_size')
        ).values('product__base_product').annotate(
            total_pack_owed=Sum('pack_remaining')
        ).values('total_pack_owed')

        # Annotate delivered_quantity and owed_quantity for frontend columns
        qs = qs.annotate(
            delivered_quantity=Coalesce(
                Sum(
                    'order_items__delivery_items__quantity',
                    filter=Q(
                        order_items__order__order_status__in=VALID_SALE_STATUSES,
                        order_items__order__cancellation_status__in=['na', 'pending'],
                        order_items__confirmed_quantity__isnull=False
                    )
                ), 0
            ),
            owed_quantity=Coalesce(Subquery(owed_subquery, output_field=IntegerField()), 0) +
                          Coalesce(Subquery(pack_owed_subquery, output_field=IntegerField()), 0)
        )
            
        exclude_prefix = self.request.query_params.get('exclude_category_prefix')
        if exclude_prefix:
            qs = qs.exclude(
                Q(category__isnull=False) & (
                    Q(category__name__startswith=exclude_prefix) |
                    Q(category__name__icontains='nav') |
                    Q(category__name__icontains='text') |
                    Q(category__name__icontains='ideal')
                )
            )
        
        # --- Commission & Transfer Filters (used by Outlet Commissions tab) ---
        
        # Filter: products previously sent to a specific outlet
        sent_to_outlet = self.request.query_params.get('sent_to_outlet')
        if sent_to_outlet:
            from outlets.models import OutletStockTransferItem
            sent_product_ids = OutletStockTransferItem.objects.filter(
                transfer__outlet_id=sent_to_outlet,
                transfer__status='dispatched',
                transfer__is_deleted=False
            ).values_list('product_id', flat=True).distinct()
            qs = qs.filter(id__in=sent_product_ids)
        
        # Filter: products that have a commission override at a specific outlet
        has_override_for = self.request.query_params.get('has_override_for')
        commission_filter = self.request.query_params.get('commission_status')  # 'override' | 'default'
        if has_override_for and commission_filter:
            from outlets.models import OutletProductCommission
            override_product_ids = OutletProductCommission.objects.filter(
                outlet_id=has_override_for
            ).values_list('product_id', flat=True)
            if commission_filter == 'override':
                qs = qs.filter(id__in=override_product_ids)
            elif commission_filter == 'default':
                qs = qs.exclude(id__in=override_product_ids)
        
        return qs

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

    @action(detail=False, methods=['get'], url_path='search-suggestions')
    def search_suggestions(self, request):
        """
        Returns search prefix schema cheatsheet OR dynamic distinct values with counts
        for product tokens.
        """
        prefix = request.query_params.get('prefix', '').strip().lower()
        q = request.query_params.get('q', '').strip()

        if not prefix:
            return Response({
                'prefixes': [
                    {'prefix': 'id', 'label': 'Product ID', 'example': 'id:101', 'description': 'Filter by exact product sequence ID'},
                    {'prefix': 'name', 'label': 'Product Name', 'example': 'name:"Notebook"', 'description': 'Search by product name'},
                    {'prefix': 'category', 'label': 'Category', 'example': 'category:Stationery', 'description': 'Filter by product category'},
                    {'prefix': 'vendor', 'label': 'Vendor', 'example': 'vendor:"Navneet"', 'description': 'Filter by supplier or publisher'},
                    {'prefix': 'tag', 'label': 'Tag', 'example': 'tag:Exam', 'description': 'Filter by assigned tags'},
                    {'prefix': 'status', 'label': 'Stock Status', 'example': 'status:low_stock', 'description': 'in_stock, low_stock, out_of_stock'},
                    {'prefix': 'stock', 'label': 'Available Stock', 'example': 'stock:<10', 'description': 'Comparison: >, <, >=, <=, ='},
                    {'prefix': 'physical', 'label': 'Physical Stock', 'example': 'physical:<5', 'description': 'Warehouse physical stock count'},
                    {'prefix': 'price', 'label': 'Selling Price', 'example': 'price:>200', 'description': 'Comparison on retail selling price'},
                    {'prefix': 'cost', 'label': 'Cost Price', 'example': 'cost:>100', 'description': 'Comparison on unit cost price'},
                    {'prefix': 'pack', 'label': 'Pack Bundle', 'example': 'pack:true', 'description': 'pack:true or pack:false'},
                ]
            })

        suggestions = []
        if prefix == 'category':
            from inventory.models import Category
            qs = Category.objects.filter(is_deleted=False)
            if q:
                qs = qs.filter(name__icontains=q)
            results = qs.annotate(
                count=Count('products', filter=Q(products__is_deleted=False))
            ).values('name', 'count').order_by('-count')[:10]
            suggestions = [
                {'value': r['name'], 'label': r['name'], 'count': r['count'], 'prefix': 'category', 'badge': 'CATEGORY'}
                for r in results
            ]

        elif prefix == 'vendor':
            from inventory.models import Vendor
            qs = Vendor.objects.filter(is_deleted=False)
            if q:
                qs = qs.filter(name__icontains=q)
            results = qs.annotate(
                count=Count('products', filter=Q(products__is_deleted=False))
            ).values('name', 'count').order_by('-count')[:10]
            suggestions = [
                {'value': r['name'], 'label': r['name'], 'count': r['count'], 'prefix': 'vendor', 'badge': 'VENDOR'}
                for r in results
            ]

        elif prefix == 'tag':
            from inventory.models import Tag
            qs = Tag.objects.all()
            if q:
                qs = qs.filter(name__icontains=q)
            results = qs.annotate(
                count=Count('products', filter=Q(products__is_deleted=False))
            ).values('name', 'count').order_by('-count')[:10]
            suggestions = [
                {'value': r['name'], 'label': r['name'], 'count': r['count'], 'prefix': 'tag', 'badge': 'TAG'}
                for r in results
            ]

        elif prefix == 'status':
            from inventory.models import Product
            low_thresh = Coalesce(F('low_stock_threshold'), Value(10))
            in_stock_cnt = Product.objects.filter(is_deleted=False, stock_quantity__gt=low_thresh).count()
            low_stock_cnt = Product.objects.filter(is_deleted=False, stock_quantity__gt=0, stock_quantity__lte=low_thresh).count()
            out_stock_cnt = Product.objects.filter(is_deleted=False, stock_quantity__lte=0).count()


            items = [
                {'value': 'in_stock', 'label': 'In Stock', 'count': in_stock_cnt, 'prefix': 'status', 'badge': 'STATUS'},
                {'value': 'low_stock', 'label': 'Low Stock', 'count': low_stock_cnt, 'prefix': 'status', 'badge': 'STATUS'},
                {'value': 'out_of_stock', 'label': 'Out of Stock', 'count': out_stock_cnt, 'prefix': 'status', 'badge': 'STATUS'},
            ]
            suggestions = [it for it in items if not q or q.lower() in it['value'].lower() or q.lower() in it['label'].lower()]

        elif prefix == 'pack':
            from inventory.models import Product
            packs_cnt = Product.objects.filter(is_deleted=False, is_pack=True).count()
            singles_cnt = Product.objects.filter(is_deleted=False, is_pack=False).count()
            items = [
                {'value': 'true', 'label': 'Pack Bundles Only', 'count': packs_cnt, 'prefix': 'pack', 'badge': 'PACK'},
                {'value': 'false', 'label': 'Single Base Products', 'count': singles_cnt, 'prefix': 'pack', 'badge': 'PACK'},
            ]
            suggestions = [it for it in items if not q or q.lower() in it['value'].lower() or q.lower() in it['label'].lower()]

        elif prefix in ('stock', 'physical'):
            presets = [
                {'value': '<10', 'label': 'Under 10 Units', 'prefix': prefix},
                {'value': '=0', 'label': 'Zero Stock (=0)', 'prefix': prefix},
                {'value': '>100', 'label': 'Over 100 Units', 'prefix': prefix},
            ]
            suggestions = [p for p in presets if not q or q in p['value']]

        elif prefix in ('price', 'cost'):
            presets = [
                {'value': '>100', 'label': 'Over ₹100', 'prefix': prefix},
                {'value': '>500', 'label': 'Over ₹500', 'prefix': prefix},
                {'value': '<50', 'label': 'Under ₹50', 'prefix': prefix},
            ]
            suggestions = [p for p in presets if not q or q in p['value']]

        return Response({
            'prefix': prefix,
            'suggestions': suggestions
        })


class StockAdjustmentViewSet(viewsets.ModelViewSet):
    queryset = StockAdjustment.objects.all().select_related('product', 'created_by').order_by('-created_at')
    serializer_class = StockAdjustmentSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'inventory.manage_stock'
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

class StockHistoryFilter(django_filters.FilterSet):
    """Server-side filters for Stock History: date range, change direction, user."""
    date_from = django_filters.DateFilter(field_name='created_at', lookup_expr='date__gte')
    date_to = django_filters.DateFilter(field_name='created_at', lookup_expr='date__lte')
    change_direction = django_filters.CharFilter(method='filter_change_direction')

    def filter_change_direction(self, queryset, name, value):
        if value == 'positive':
            return queryset.filter(quantity_change__gt=0)
        elif value == 'negative':
            return queryset.filter(quantity_change__lt=0)
        return queryset

    class Meta:
        model = StockHistory
        fields = ['product', 'reason', 'created_by']


class StockHistoryViewSet(viewsets.ModelViewSet):
    queryset = StockHistory.objects.all().select_related('product', 'created_by')
    serializer_class = StockHistorySerializer
    pagination_class = ProductPagination
    permission_classes = [HasRequiredPermission]
    required_permission = 'inventory.view_products'
    filter_backends = [filters.SearchFilter, filters.OrderingFilter, DjangoFilterBackend]
    search_fields = ['product__name', 'notes']
    ordering = ['-created_at']
    filterset_class = StockHistoryFilter
    http_method_names = ['get', 'head', 'options']  # Read-only

    # perform_create removed. Usage must go through StockAdjustment.

    @action(detail=False, methods=['get'])
    def filter_options(self, request):
        """Return distinct users and reason choices for filter dropdowns."""
        users = (
            StockHistory.objects.filter(created_by__isnull=False)
            .values_list('created_by__id', 'created_by__username')
            .distinct()
        )
        return Response({
            'users': [{'id': str(uid), 'username': uname} for uid, uname in users],
            'reasons': [{'value': c[0], 'label': c[1]} for c in StockHistory.REASON_CHOICES],
        })
