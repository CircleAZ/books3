"""
Views for Order Management.
"""
import logging
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from django.db.models import Count, Case, When, Value, CharField, F
from django.db.models.functions import Coalesce, Concat
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
import django_filters
from core.permissions import HasRequiredPermission

from .models import (
    Order, OrderItem, Payment, OrderStatusHistory, OrderNote,
    ReturnReason, Return, ReturnItem, Refund, CreditNote
)
from messaging.dispatch import dispatch_receipt, dispatch_payment_update
from .serializers import (
    OrderListSerializer, OrderDetailSerializer, OrderCreateSerializer,
    OrderItemSerializer, PaymentSerializer, OrderStatusHistorySerializer, OrderNoteSerializer,
    ReturnReasonSerializer, ReturnListSerializer, ReturnDetailSerializer, ReturnCreateSerializer,
    RefundSerializer, CreditNoteSerializer
)

logger = logging.getLogger(__name__)


class OrderFilter(django_filters.FilterSet):
    """Custom filter for orders with date range support."""
    created_after = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='gte')
    created_before = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='lte')
    
    class Meta:
        model = Order
        fields = {
            'order_status': ['exact'],
            'payment_status': ['exact'],
            'delivery_status': ['exact', 'in'],
            'return_status': ['exact'],
            'refund_status': ['exact'],
            'cancellation_status': ['exact'],
            'overall_status': ['exact'],
            'customer': ['exact'],
            'is_guest': ['exact']
        }


class OrderViewSet(viewsets.ModelViewSet):
    """
    CRUD operations for orders with custom actions.
    """
    # ── Base queryset: minimal, used by router for model detection ──
    queryset = Order.objects.all()

    permission_classes = [HasRequiredPermission]
    required_permission = 'orders.edit_orders'
    permission_map = {
        'list': 'orders.view_orders',
        'retrieve': 'orders.view_orders',
        'create': 'orders.create_orders',
        'update': 'orders.edit_orders',
        'partial_update': 'orders.edit_orders',
        'destroy': 'orders.cancel_orders',
    }
    filter_backends = [filters.SearchFilter, filters.OrderingFilter, DjangoFilterBackend]
    search_fields = ['display_id', 'guest_name', 'guest_phone', 'customer__first_name', 'customer__last_name']
    ordering_fields = ['created_at', 'total', 'display_id', 'payment_status', 'order_status', 'delivery_status', 'customer_sort_name', 'item_count']
    filterset_class = OrderFilter
    
    # ── Shared annotations (used by both lean and fat querysets) ──
    _shared_annotations = dict(
        item_count=Count('items'),
        annotated_customer_name=Case(
            When(is_guest=True, then=Coalesce('guest_name', Value('Guest'))),
            default=Coalesce(
                Concat('customer__first_name', Value(' '), 'customer__last_name'),
                Value('Unknown')
            ),
            output_field=CharField(),
        ),
        customer_sort_name=Case(
            When(is_guest=True, then=Coalesce('guest_name', Value('Guest'))),
            default=Coalesce('customer__first_name', Value('')),
            output_field=CharField(),
        ),
    )

    def get_queryset(self):
        """
        Lean queryset for list views, fat queryset for detail views.
        List views only need customer name + counts — no nested prefetches.
        Detail views load everything for the full serializer.
        """
        # ── Lean path: list, drafts ──
        if self.action in ('list', 'drafts'):
            qs = Order.objects.select_related('customer').annotate(
                **self._shared_annotations
            )
        else:
            # ── Fat path: retrieve, create, update, custom actions ──
            qs = Order.objects.select_related(
                'customer', 'created_by'
            ).prefetch_related(
                'items', 'items__product',
                'payments',
                'deliveries', 'deliveries__items',
                'deliveries__items__order_item__product',
                'deliveries__delivered_by',
                'status_history', 'order_notes'
            ).annotate(**self._shared_annotations)

        # ── Access control ──
        user = self.request.user
        if user.is_staff:
            return qs
        if hasattr(user, 'customer_profile'):
             return qs.filter(customer=user.customer_profile)
        return qs.filter(created_by=user)
    
    def create(self, request, *args, **kwargs):
        """
        Override create with three-layer duplicate prevention:
        1. Cache-based idempotency key (fast-path, fail-open)
        2. DB-level fingerprint guard (definitive backstop)
        3. Fingerprint stored on created order for future checks
        """
        import hashlib
        import math
        import time
        from django.utils import timezone
        from datetime import timedelta

        # ── Layer 1: Cache-based idempotency key (fail-open) ──
        idempotency_key = request.headers.get('X-Idempotency-Key')
        if idempotency_key:
            try:
                from django.core.cache import cache
                cache_key = f"order_idempotency_{request.user.id}_{idempotency_key}"
                cached_order_id = cache.get(cache_key)
                if cached_order_id:
                    # Duplicate request — return the already-created order
                    try:
                        existing_order = Order.objects.get(pk=cached_order_id)
                        serializer = self.get_serializer(existing_order)
                        return Response(serializer.data, status=status.HTTP_200_OK)
                    except Order.DoesNotExist:
                        pass  # Cache stale, proceed with creation
            except Exception:
                logger.warning(
                    "Cache idempotency check failed for user=%s key=%s — proceeding (fail-open)",
                    request.user.id, idempotency_key
                )

        # ── Layer 2: Compute order fingerprint ──
        # Content-only fingerprint (no time_bucket — time is handled by the
        # sliding-window query in Layer 2b, not by the hash itself).
        items_data = request.data.get('items', [])
        customer_id = request.data.get('customer', '')
        item_fingerprint = ','.join(sorted(
            f"{item.get('product', '')}:{item.get('quantity', '')}"
            for item in items_data
        ))
        raw_fingerprint = f"{customer_id}|{item_fingerprint}"
        fingerprint = hashlib.sha256(raw_fingerprint.encode()).hexdigest()

        # Stash fingerprint on the request so perform_create can access it
        request._order_fingerprint = fingerprint

        # ── Layer 2b + Layer 3: Atomic fingerprint check + order creation ──
        guard_failed = False
        if customer_id:
            # Phase A: Guard query (fail-open — if the guard itself breaks,
            # we still create the order, just without duplicate protection)
            try:
                from customers.models import Customer
                Customer.objects.filter(pk=customer_id).first()  # Validate customer exists
            except Exception:
                guard_failed = True
                logger.warning(
                    "DB duplicate guard: customer query failed for fingerprint=%s — proceeding (fail-open)",
                    fingerprint[:16]
                )

        # ── 1. Validate data OUTSIDE the atomic block (fast, no locks) ──
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # ── 2. Create the order inside the atomic block ──
        if not guard_failed:
            with transaction.atomic():
                if customer_id:
                    # Lock customer row — concurrent requests for this customer will wait
                    Customer.objects.select_for_update().filter(pk=customer_id).first()

                recent_dup = Order.objects.filter(
                    order_fingerprint=fingerprint,
                    is_deleted=False,
                    created_at__gte=timezone.now() - timedelta(minutes=10),
                ).first()
                if recent_dup:
                    logger.warning(
                        "DB duplicate guard triggered: fingerprint=%s matches order #%s",
                        fingerprint[:16], recent_dup.display_id
                    )
                    return Response(
                        {
                            'detail': (
                                f'A similar order (#{recent_dup.display_id}) was created '
                                f'recently. Please verify before resubmitting.'
                            ),
                            'existing_order_id': str(recent_dup.id),
                            'existing_display_id': recent_dup.display_id,
                        },
                        status=status.HTTP_409_CONFLICT
                    )

                # No duplicate — create inside the same atomic block (lock held).
                import time
                lock_start = time.time()
                self.perform_create(serializer)
                lock_end = time.time()
                logger.warning(
                    "⚠️ [LOCK AUTOPSY] DB lock held for %.3f seconds during order creation!",
                    lock_end - lock_start
                )
        else:
            # Fallback path: guest orders (no customer_id) or guard failure (fail-open)
            self.perform_create(serializer)

        # ── 3. Serialize response OUTSIDE the atomic block (slow, no locks) ──
        headers = self.get_success_headers(serializer.data)
        response = Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

        if idempotency_key and response.status_code == 201:
            try:
                from django.core.cache import cache
                cache_key = f"order_idempotency_{request.user.id}_{idempotency_key}"
                order_id = response.data.get('id')
                if order_id:
                    cache.set(cache_key, order_id, timeout=600)
            except Exception:
                logger.warning("Cache set failed for idempotency key=%s", idempotency_key)

        return response

    def perform_create(self, serializer):
        """Inject created_by, store fingerprint, and freeze quantities if confirmed."""
        fingerprint = getattr(self.request, '_order_fingerprint', '')
        instance = serializer.save(
            created_by=self.request.user,
            order_fingerprint=fingerprint
        )
        if instance.order_status in ('confirmed', 'completed'):
            instance.freeze_confirmed_quantities()
            
    
    def update(self, request, *args, **kwargs):
        """Standard update with offline sync protection (V-01)."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        
        # Check if editable
        if not instance.can_edit:
             return Response({'error': 'Cannot edit this order (Delivered or Cancelled)'}, status=status.HTTP_400_BAD_REQUEST)

        # V-01: Offline Sync Protection
        client_updated_at = request.data.get('client_updated_at')
        if client_updated_at:
            from django.utils.dateparse import parse_datetime
            client_ts = parse_datetime(client_updated_at)
            if client_ts and client_ts < instance.updated_at:
                return Response({
                    'error': 'Stale update. Server has newer data.',
                    'server_updated_at': instance.updated_at,
                    'your_data': request.data
                }, status=status.HTTP_409_CONFLICT)

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        # Stock Management for Active Orders
        is_active = instance.order_status in ('confirmed', 'completed')
        old_items = []
        if is_active:
            old_items = list(instance.items.select_related('product').all())

        with transaction.atomic():
            # If previously active, batch-restore stock for old items
            if is_active and old_items:
                from collections import defaultdict
                from inventory.models import Product, StockAdjustment, StockHistory
                
                # Aggregate restore quantities per product
                restore_qty = defaultdict(int)
                for item in old_items:
                    restore_qty[item.product_id] += item.quantity
                
                products = {
                    p.id: p for p in
                    Product.objects.select_for_update().filter(id__in=restore_qty.keys())
                }
                
                adjustments = []
                histories = []
                for pid, qty in restore_qty.items():
                    product = products[pid]
                    product.stock_quantity += qty
                    adjustments.append(StockAdjustment(
                        product=product, adjustment_type='increase', quantity=qty,
                        reason='correction',
                        notes=f"Order #{instance.display_id} Edit (Restore)",
                        created_by=request.user
                    ))
                    histories.append(StockHistory(
                        product=product, quantity_change=qty,
                        quantity_after=product.stock_quantity,
                        cost_at_time=product.cost_price, reason='adjustment',
                        notes=f"Adjustment (increase): Order #{instance.display_id} Edit (Restore)",
                        created_by=request.user
                    ))
                
                Product.objects.bulk_update(list(products.values()), ['stock_quantity'])
                StockAdjustment.objects.bulk_create(adjustments)
                StockHistory.objects.bulk_create(histories)

            self.perform_update(serializer)
            instance.refresh_from_db()

            # Handle Draft -> Confirmed transition OR update of Active orders
            if instance.order_status in ('confirmed', 'completed'):
                if is_active:
                    # Batch-deduct stock for new items
                    from collections import defaultdict
                    from inventory.models import Product, StockAdjustment, StockHistory
                    
                    new_items = list(instance.items.select_related('product').all())
                    deduct_qty = defaultdict(int)
                    for item in new_items:
                        deduct_qty[item.product_id] += item.quantity
                    
                    products = {
                        p.id: p for p in
                        Product.objects.select_for_update().filter(id__in=deduct_qty.keys())
                    }
                    
                    adjustments = []
                    histories = []
                    for item in new_items:
                        if item.confirmed_quantity is None:
                            item.confirmed_quantity = item.quantity
                    
                    from orders.models import OrderItem
                    items_to_update = [i for i in new_items if i.confirmed_quantity == i.quantity]
                    if items_to_update:
                        OrderItem.objects.bulk_update(items_to_update, ['confirmed_quantity'])
                    
                    for pid, qty in deduct_qty.items():
                        product = products[pid]
                        product.stock_quantity -= qty
                        adjustments.append(StockAdjustment(
                            product=product, adjustment_type='decrease', quantity=qty,
                            reason='sale',
                            notes=f"Order #{instance.display_id} Edit (Deduct)",
                            created_by=request.user
                        ))
                        histories.append(StockHistory(
                            product=product, quantity_change=-qty,
                            quantity_after=product.stock_quantity,
                            cost_at_time=product.cost_price, reason='sale',
                            notes=f"Adjustment (decrease): Order #{instance.display_id} Edit (Deduct)",
                            created_by=request.user
                        ))
                    
                    Product.objects.bulk_update(list(products.values()), ['stock_quantity'])
                    StockAdjustment.objects.bulk_create(adjustments)
                    StockHistory.objects.bulk_create(histories)
                else:
                    # Transitioned from draft to confirmed during this update
                    instance.freeze_confirmed_quantities()
            
            # Log history
            if is_active:
                 OrderStatusHistory.objects.create(
                    order=instance,
                    status_field='order_details',
                    old_value='Modified',
                    new_value='Modified',
                    note='Order items modified after completion (Stock adjusted)',
                    created_by=request.user
                )

        if getattr(instance, '_prefetched_objects_cache', None):
            instance._prefetched_objects_cache = {}

        return Response(serializer.data)

    def get_serializer_class(self):
        if self.action == 'list':
            return OrderListSerializer
        elif self.action in ['create', 'update', 'partial_update']:
            return OrderCreateSerializer
        return OrderDetailSerializer
    

    @action(detail=False, methods=['get'])
    def drafts(self, request):
        """Get all draft/held orders."""
        drafts = self.get_queryset().filter(order_status='draft')
        serializer = OrderListSerializer(drafts, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def hold(self, request, pk=None):
        """Save order as draft."""
        order = self.get_object()
        order.order_status = 'draft'
        order.save(update_fields=['order_status'])
        return Response({'status': 'Order held as draft'})
    
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Confirm the order."""
        order = self.get_object()
        if order.order_status not in ['draft', 'confirmed']:
            return Response(
                {'error': 'Cannot confirm this order'},
                status=status.HTTP_400_BAD_REQUEST
            )
        order.order_status = 'confirmed'
        order.save(update_fields=['order_status'])
        
        # Ensure quantities are frozen and stock deducted if transitioning from draft
        if order.items.filter(confirmed_quantity__isnull=True).exists():
            order.freeze_confirmed_quantities()
            
        return Response({'status': 'Order confirmed'})
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Complete the order (mark as completed)."""
        order = self.get_object()

        # Prevent double stock deduction if already completed (e.g., created as completed via POS)
        if order.order_status == 'completed':
            return Response(
                {'error': 'Order is already completed'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if order.payment_status != 'paid':
            return Response(
                {'error': 'Order must be fully paid to complete'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        with transaction.atomic():
            order.order_status = 'completed'
            order.save(update_fields=['order_status'])
            
            # Ensure quantities are frozen and stock deducted
            if order.items.filter(confirmed_quantity__isnull=True).exists():
                order.freeze_confirmed_quantities()
        
        # Dispatch receipt notification via customer preference
        try:
            dispatch_receipt(order)
        except Exception as e:
            logger.error("Failed to dispatch receipt for order #%s: %s", order.display_id, e)
        
        return Response({'status': 'Order completed'})
    
    @action(detail=True, methods=['post'])
    def deliver_all(self, request, pk=None):
        """Deliver all remaining items in the order."""
        order = self.get_object()
        
        if order.order_status not in ['confirmed', 'completed']:
            return Response(
                {'error': 'Order must be confirmed or completed to start delivery'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        if order.delivery_status == 'delivered':
            return Response(
                {'error': 'Order is already fully delivered'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        notes = request.data.get('notes', '')
        
        with transaction.atomic():
            # Acquire lock to prevent concurrent delivery exploits
            order = Order.objects.select_for_update().get(pk=order.pk)
            
            # Re-verify status after acquiring lock
            if order.delivery_status == 'delivered':
                return Response(
                    {'error': 'Order is already fully delivered'},
                    status=status.HTTP_400_BAD_REQUEST
                )
                
            # Ensure quantities are frozen
            if order.items.filter(confirmed_quantity__isnull=True).exists():
                order.freeze_confirmed_quantities()
                
            from orders.models import Delivery, DeliveryItem
            delivery = Delivery.objects.create(
                order=order,
                notes=notes,
                delivered_by=request.user
            )
            
            items_delivered = False
            for item in order.items.all():
                remaining = item.remaining_quantity
                if remaining > 0:
                    DeliveryItem.objects.create(
                        delivery=delivery,
                        order_item=item,
                        quantity=remaining
                    )
                    from inventory.services import StockService
                    StockService.adjust_stock(
                        product_id=item.product.id,
                        adjustment_type='decrease',
                        quantity=remaining,
                        reason='sale',
                        notes=f"Order #{order.display_id} Delivery",
                        user=request.user,
                        target_ledger='physical'
                    )
                    items_delivered = True
            
            if not items_delivered:
                return Response({'error': 'No items left to deliver'}, status=status.HTTP_400_BAD_REQUEST)
                
            # Trigger status update after items are attached
            order.update_delivery_status()
            order.refresh_from_db()
            
        return Response({
            'status': 'All items delivered',
            'delivery_status': order.delivery_status,
            'derived_status': order.derived_status
        })

    @action(detail=True, methods=['post'])
    def deliver_partial(self, request, pk=None):
        """Deliver a specific set of items and quantities."""
        order = self.get_object()
        
        if order.order_status not in ['confirmed', 'completed']:
            return Response(
                {'error': 'Order must be confirmed or completed to start delivery'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        if order.delivery_status == 'delivered':
            return Response(
                {'error': 'Order is already fully delivered'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        items_data = request.data.get('items', [])
        if not items_data or not isinstance(items_data, list):
            return Response(
                {'error': 'Must provide a list of items to deliver'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        notes = request.data.get('notes', '')
        from django.core.exceptions import ValidationError
        
        try:
            with transaction.atomic():
                # Acquire lock to prevent concurrent delivery exploits
                order = Order.objects.select_for_update().get(pk=order.pk)
                
                # Re-verify status after acquiring lock
                if order.delivery_status == 'delivered':
                    return Response(
                        {'error': 'Order is already fully delivered'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                    
                if order.items.filter(confirmed_quantity__isnull=True).exists():
                    order.freeze_confirmed_quantities()
                    
                from orders.models import Delivery, DeliveryItem
                delivery = Delivery.objects.create(
                    order=order,
                    notes=notes,
                    delivered_by=request.user
                )
                
                for item_data in items_data:
                    item_id = item_data.get('order_item')
                    qty = item_data.get('quantity')
                    
                    if not item_id or not qty or int(qty) <= 0:
                        raise ValidationError("Invalid item data. Requires order_item and positive quantity.")
                    
                    try:
                        order_item = order.items.get(pk=item_id)
                    except Exception:
                        raise ValidationError(f"Order item {item_id} not found in this order.")
                        
                    if int(qty) > order_item.remaining_quantity:
                        raise ValidationError(f"Cannot deliver {qty} of {order_item.product.name}. Only {order_item.remaining_quantity} remaining.")
                        
                    DeliveryItem.objects.create(
                        delivery=delivery,
                        order_item=order_item,
                        quantity=int(qty)
                    )
                    from inventory.services import StockService
                    StockService.adjust_stock(
                        product_id=order_item.product.id,
                        adjustment_type='decrease',
                        quantity=int(qty),
                        reason='sale',
                        notes=f"Order #{order.display_id} Partial Delivery",
                        user=request.user,
                        target_ledger='physical'
                    )
                    
                # Update status after items attached
                order.update_delivery_status()
                order.refresh_from_db()
                
        except ValidationError as e:
            return Response(
                {'error': str(e.message if hasattr(e, 'message') else str(e))},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        return Response({
            'status': 'Partial delivery recorded',
            'delivery_status': order.delivery_status,
            'derived_status': order.derived_status
        })
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Request cancellation (step 1 of 2-step flow)."""
        order = self.get_object()
        from django.core.exceptions import ValidationError
        try:
            order.cancel_order()
            return Response({
                'status': 'Cancellation requested',
                'cancellation_status': order.cancellation_status,
                'derived_status': order.derived_status
            })
        except ValidationError as e:
            return Response(
                {'error': str(e.message if hasattr(e, 'message') else e.messages[0] if hasattr(e, 'messages') else str(e))},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def approve_cancellation(self, request, pk=None):
        """Approve a pending cancellation (step 2)."""
        order = self.get_object()
        from django.core.exceptions import ValidationError
        try:
            old_cancellation = order.cancellation_status
            old_order_status = order.order_status
            
            with transaction.atomic():
                order.approve_cancellation()
                
                # Restore Available Stock for undelivered items
                from inventory.services import StockService
                for item in order.items.all():
                    if item.remaining_quantity > 0:
                        StockService.adjust_stock(
                            product_id=item.product.id,
                            adjustment_type='increase',
                            quantity=item.remaining_quantity,
                            reason='correction',
                            notes=f"Order #{order.display_id} Cancelled",
                            user=request.user,
                            target_ledger='available'
                        )
                
                # Audit trail
            OrderStatusHistory.objects.create(
                order=order, status_field='cancellation_status',
                old_value=old_cancellation, new_value='completed',
                note='Cancellation approved', created_by=request.user
            )
            OrderStatusHistory.objects.create(
                order=order, status_field='order_status',
                old_value=old_order_status, new_value='cancelled',
                note='Order cancelled via approved cancellation', created_by=request.user
            )
            return Response({
                'status': 'Cancellation approved',
                'cancellation_status': order.cancellation_status,
                'order_status': order.order_status,
                'derived_status': order.derived_status
            })
        except ValidationError as e:
            return Response(
                {'error': str(e.message if hasattr(e, 'message') else str(e))},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def reject_cancellation(self, request, pk=None):
        """Reject a pending cancellation."""
        order = self.get_object()
        from django.core.exceptions import ValidationError
        try:
            old_cancellation = order.cancellation_status
            order.reject_cancellation()
            # Audit trail
            OrderStatusHistory.objects.create(
                order=order, status_field='cancellation_status',
                old_value=old_cancellation, new_value='na',
                note='Cancellation rejected', created_by=request.user
            )
            return Response({
                'status': 'Cancellation rejected',
                'cancellation_status': order.cancellation_status,
                'derived_status': order.derived_status
            })
        except ValidationError as e:
            return Response(
                {'error': str(e.message if hasattr(e, 'message') else str(e))},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def add_payment(self, request, pk=None):
        """Add a payment to the order."""
        from decimal import Decimal
        
        idempotency_key = request.headers.get('X-Idempotency-Key')
        
        with transaction.atomic():
            # 1. Lock the order row to prevent TOCTOU race conditions (double-submit)
            order = Order.objects.select_for_update().get(pk=pk)
            
            # 2. Re-check Idempotency Key inside the lock to catch blocked threads
            if idempotency_key:
                from django.core.cache import cache
                cache_key = f"payment_idemp_{request.user.id}_{pk}_{idempotency_key}"
                if cache.get(cache_key):
                    return Response(
                        {'error': 'Duplicate payment request detected. Please refresh.'}, 
                        status=status.HTTP_409_CONFLICT
                    )
            
            # Prevent double payment - check if already fully paid
            if order.payment_status == 'paid':
                return Response(
                    {'error': 'Order is already fully paid'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Validate amount doesn't exceed balance due
            try:
                amount = Decimal(str(request.data.get('amount', 0)))
            except:
                return Response(
                    {'error': 'Invalid amount'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if amount <= 0:
                return Response(
                    {'error': 'Amount must be positive'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if amount > order.balance_due:
                return Response(
                    {'error': f'Amount ({amount}) exceeds balance due ({order.balance_due})'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            serializer = PaymentSerializer(data={
                'order': order.id,
                'method': request.data.get('method', ''),
                'destination_bank': request.data.get('destination_bank'),
                'destination_wallet': request.data.get('destination_wallet'),
                'amount': str(amount),
                'upi_reference': request.data.get('upi_reference', '')
            })
        
        if serializer.is_valid():
            with transaction.atomic():
                payment = serializer.save(created_by=request.user)
                if payment.method == 'Customer Wallet':
                    if getattr(order.customer, 'wallet', None):
                        order.customer.wallet.debit(
                            payment.amount, 
                            f"Payment for Order #{order.display_id}", 
                            user=request.user
                        )
                else:
                    from finance.services import LedgerService
                    LedgerService.process_deposit(
                        amount=payment.amount,
                        destination_bank=payment.destination_bank,
                        destination_wallet=payment.destination_wallet,
                        reference=f"order_{order.display_id}",
                        description=f"Payment for Order #{order.display_id}",
                        user=request.user
                    )
            order.refresh_from_db()
            
            if idempotency_key:
                try:
                    cache.set(cache_key, str(payment.id), timeout=600)
                except Exception:
                    pass
                    
            return Response({
                'payment': serializer.data,
                'payment_status': order.payment_status,
                'amount_paid': float(order.amount_paid),
                'balance_due': float(order.balance_due),
                'change_due': float(order.change_due)
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def add_change_to_wallet(self, request, pk=None):
        """Sweep overpayment change into the customer's wallet."""
        from django.db import transaction
        from customers.models import Customer, Wallet
        from orders.models import Refund
        order = self.get_object()
        
        if order.change_due <= 0:
            return Response(
                {'error': 'No change due on this order.'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        with transaction.atomic():
            if order.is_guest:
                # Convert to normal customer
                cust = Customer.objects.create(
                    first_name=order.guest_name or f"Guest {order.id}",
                    phone=order.guest_phone or f"0000000000{order.id}"[:15],
                    notes="Auto-converted from guest for wallet overpayment"
                )
                order.customer = cust
                order.is_guest = False
                order.save(update_fields=['customer', 'is_guest'])
            
            customer = order.customer
            wallet, _ = Wallet.objects.get_or_create(customer=customer)
            change = order.change_due
            
            # 1. Credit the customer wallet
            wallet.credit(change, f"Swept overpayment from Order #{order.display_id}", user=request.user)
            
            # 2. Record a Refund on the Order (bypassing LedgerService physical withdrawal)
            Refund.objects.create(
                order=order,
                amount=change,
                method='Wallet Transfer',
                status='completed',
                created_by=request.user
            )
            
            order.update_payment_status()
            order.refresh_from_db()
            
        return Response({
            'status': 'Change added to wallet',
            'wallet_balance': wallet.balance,
            'payment_status': order.payment_status,
            'change_due': order.change_due
        })
    @action(detail=True, methods=['post'])
    def edit_payment(self, request, pk=None):
        """Edit the amount of an existing payment record."""
        from decimal import Decimal
        from django.utils import timezone
        from datetime import timedelta

        order = self.get_object()
        payment_id = request.data.get('payment_id')
        new_amount_raw = request.data.get('amount')

        if not payment_id or not new_amount_raw:
            return Response(
                {'error': 'payment_id and amount are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            new_amount = Decimal(str(new_amount_raw))
        except Exception:
            return Response(
                {'error': 'Invalid amount.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if new_amount <= 0:
            return Response(
                {'error': 'Amount must be positive.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # ── Block editing on cancelled orders ──
        if order.order_status == 'cancelled' or order.cancellation_status == 'completed':
            return Response(
                {'error': 'Cannot edit payments on a cancelled order.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Find the payment
        try:
            payment = order.payments.get(pk=payment_id)
        except Payment.DoesNotExist:
            return Response(
                {'error': 'Payment not found on this order.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        old_amount = payment.amount

        if new_amount == old_amount:
            return Response(
                {'error': 'New amount is the same as the current amount.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # ── Time restriction: 24h for staff/cashier, unrestricted for manager/owner ──
        user_role = getattr(request.user, 'role', 'staff')
        is_privileged = user_role in ('owner', 'manager') or request.user.is_superuser
        if not is_privileged:
            age = timezone.now() - payment.created_at
            if age > timedelta(hours=24):
                return Response(
                    {'error': 'Payment is older than 24 hours. Only managers can edit older payments.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        # ── Validate the new amount doesn't create an impossible state ──
        delta = new_amount - old_amount
        current_net_paid = order.net_paid
        projected_net_paid = current_net_paid + delta

        if projected_net_paid < 0:
            return Response(
                {'error': 'Reducing by this much would result in negative total paid.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # ── Atomic update: lock payment + ledger + order status ──
        with transaction.atomic():
            # Lock the payment row to prevent concurrent edits
            payment = Payment.objects.select_for_update().get(pk=payment_id)

            # Re-validate old_amount after lock (another edit could have changed it)
            if payment.amount != old_amount:
                return Response(
                    {'error': 'Payment was modified by another user. Please refresh and try again.'},
                    status=status.HTTP_409_CONFLICT
                )

            # Adjust ledger based on delta and payment method
            is_customer_wallet = payment.method == 'Customer Wallet'
            abs_delta = abs(delta)

            if is_customer_wallet:
                # Customer Wallet payments: credit/debit the customer's own wallet
                customer_wallet = getattr(order.customer, 'wallet', None)
                if customer_wallet:
                    if delta < 0:
                        # Reducing payment → credit back to customer wallet
                        customer_wallet.credit(
                            abs_delta,
                            f"Payment edited on Order #{order.display_id} ({old_amount} → {new_amount})",
                            user=request.user
                        )
                    else:
                        # Increasing payment → debit more from customer wallet
                        try:
                            customer_wallet.debit(
                                abs_delta,
                                f"Payment edited on Order #{order.display_id} ({old_amount} → {new_amount})",
                                user=request.user
                            )
                        except Exception as e:
                            return Response(
                                {'error': f'Insufficient customer wallet balance: {str(e)}'},
                                status=status.HTTP_400_BAD_REQUEST
                            )
                else:
                    return Response(
                        {'error': 'Customer wallet not found. Cannot adjust wallet payment.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            elif delta != 0:
                # Bank/Cash Wallet payments: use LedgerService
                from finance.services import LedgerService

                if delta < 0:
                    try:
                        LedgerService.process_withdrawal(
                            amount=abs_delta,
                            source_bank=payment.destination_bank,
                            source_wallet=payment.destination_wallet,
                            reference=f"edit_payment_{order.display_id}",
                            description=f"Payment edit: Order #{order.display_id} ({old_amount} → {new_amount})",
                            user=request.user
                        )
                    except Exception as e:
                        return Response(
                            {'error': f'Ledger adjustment failed: {str(e)}'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                else:
                    LedgerService.process_deposit(
                        amount=delta,
                        destination_bank=payment.destination_bank,
                        destination_wallet=payment.destination_wallet,
                        reference=f"edit_payment_{order.display_id}",
                        description=f"Payment edit: Order #{order.display_id} ({old_amount} → {new_amount})",
                        user=request.user
                    )

            # Update the payment record (bypass save() auto-dispatch to avoid double-triggers)
            Payment.objects.filter(pk=payment.pk).update(amount=new_amount)

            # Audit trail
            OrderStatusHistory.objects.create(
                order=order,
                status_field='payment_edited',
                old_value=str(old_amount),
                new_value=str(new_amount),
                note=f"Payment edited: ₹{old_amount} → ₹{new_amount} by {request.user.username}",
                created_by=request.user
            )

            # Recalculate order payment status
            order.update_payment_status()
            order.refresh_from_db()

        # Re-dispatch notifications
        try:
            dispatch_payment_update(order)
        except Exception:
            pass
        try:
            from messaging.r2 import update_receipt_snapshot
            update_receipt_snapshot(order)
        except Exception:
            pass

        return Response({
            'status': 'Payment updated',
            'old_amount': float(old_amount),
            'new_amount': float(new_amount),
            'payment_status': order.payment_status,
            'amount_paid': float(order.amount_paid),
            'balance_due': float(order.balance_due),
            'change_due': float(order.change_due)
        })

    @action(detail=True, methods=['post'])
    def recalculate(self, request, pk=None):
        """Force recalculation of order totals."""
        order = self.get_object()
        order.calculate_totals()
        return Response({
            'subtotal': float(order.subtotal),
            'discount_amount': float(order.discount_amount),
            'total': float(order.total)
        })
    
    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """Update a status field with transition validation and history tracking."""
        order = self.get_object()
        
        field = request.data.get('field')
        new_value = request.data.get('value')
        note = request.data.get('note', '')
        
        # Block manual payment_status changes
        if field == 'payment_status':
            return Response(
                {'error': 'Payment status is auto-computed and cannot be set manually.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Block manual delivery_status changes (auto-computed from delivery events)
        if field == 'delivery_status':
            return Response(
                {'error': 'Delivery status is auto-computed. Use deliver_all or deliver_partial endpoints.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Block manual order_status → 'completed' (auto-computed from delivery)
        if field == 'order_status' and new_value == 'completed':
            return Response(
                {'error': 'Order status is auto-set to completed when delivery is done. '
                          'Use the delivery workflow instead.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate field name
        valid_fields = ['order_status', 
                        'return_status', 'refund_status', 'cancellation_status']
        if field not in valid_fields:
            return Response({'error': f'Invalid field: {field}'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate new_value is a valid choice for the field
        valid_choices = {
            'order_status': ['draft', 'confirmed', 'completed', 'cancelled'],
            'return_status': ['na', 'pending', 'received', 'completed', 'cancelled'],
            'refund_status': ['na', 'pending', 'partial', 'completed', 'cancelled'],
            'cancellation_status': ['na', 'pending', 'completed', 'cancelled'],
        }
        if new_value not in valid_choices.get(field, []):
            return Response({'error': f'Invalid value for {field}: {new_value}'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Enforce state transition matrix
        from django.core.exceptions import ValidationError
        try:
            order.validate_transition(field, new_value)
        except ValidationError as e:
            return Response(
                {'error': str(e.message if hasattr(e, 'message') else str(e))},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Require explicit confirmation for delivery
        if field == 'delivery_status' and new_value == 'delivered':
            if not request.data.get('confirm'):
                return Response(
                    {'error': 'Delivery confirmation required. This action cannot be undone.',
                     'requires_confirmation': True},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
        # V-01: Offline Sync Protection
        client_updated_at = request.data.get('client_updated_at')
        if client_updated_at:
            from django.utils.dateparse import parse_datetime
            client_ts = parse_datetime(client_updated_at)
            if client_ts and client_ts < order.updated_at:
                return Response({
                    'error': 'Stale update. Server has newer data.',
                    'server_updated_at': order.updated_at,
                    'current_status': getattr(order, field)
                }, status=status.HTTP_409_CONFLICT)
        
        # Check edit restrictions for delivered orders
        if not order.can_edit and field not in ['return_status', 'refund_status']:
            return Response({'error': 'Cannot modify delivered order'}, status=status.HTTP_400_BAD_REQUEST)
        
        old_value = getattr(order, field)
        
        # Create history record
        OrderStatusHistory.objects.create(
            order=order,
            status_field=field,
            old_value=old_value,
            new_value=new_value,
            note=note,
            created_by=request.user
        )
        
        # Update the field
        setattr(order, field, new_value)
        order.save(update_fields=[field])
        
        return Response({
            'status': f'{field} updated',
            'old_value': old_value,
            'new_value': new_value,
            'derived_status': order.derived_status
        })
    
    @action(detail=True, methods=['post'])
    def add_note(self, request, pk=None):
        """Add a note to the order."""
        order = self.get_object()
        content = request.data.get('content', '').strip()
        
        if not content:
            return Response({'error': 'Content is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        note = OrderNote.objects.create(
            order=order,
            content=content,
            created_by=request.user
        )
        
        return Response(OrderNoteSerializer(note).data, status=status.HTTP_201_CREATED)


class PaymentViewSet(viewsets.ModelViewSet):
    """CRUD for payments."""
    queryset = Payment.objects.all().select_related('order', 'created_by')
    serializer_class = PaymentSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'orders.manage_payments'
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['order', 'method']
    
    def perform_create(self, serializer):
        with transaction.atomic():
            payment = serializer.save(created_by=self.request.user)
            from finance.services import LedgerService
            LedgerService.process_deposit(
                amount=payment.amount,
                destination_bank=payment.destination_bank,
                destination_wallet=payment.destination_wallet,
                reference=f"order_{payment.order.display_id}",
                description=f"Payment for Order #{payment.order.display_id}",
                user=self.request.user
            )


class OrderNoteViewSet(viewsets.ModelViewSet):
    """CRUD for order notes."""
    queryset = OrderNote.objects.all().select_related('order', 'created_by')
    serializer_class = OrderNoteSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'orders.view_orders'
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['order']
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


# ============================================================================
# Returns & Refunds ViewSets
# ============================================================================

class ReturnFilter(django_filters.FilterSet):
    """Filter for returns with date range support."""
    created_after = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='gte')
    created_before = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='lte')
    
    class Meta:
        model = Return
        fields = ['status', 'order']


class ReturnReasonViewSet(viewsets.ModelViewSet):
    """CRUD for return reasons."""
    queryset = ReturnReason.objects.all()
    serializer_class = ReturnReasonSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'orders.manage_returns'
    pagination_class = None
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class ReturnViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing returns with custom actions for workflow.
    """
    queryset = Return.objects.all()
    permission_classes = [HasRequiredPermission]
    required_permission = 'orders.manage_returns'
    filter_backends = [filters.SearchFilter, filters.OrderingFilter, DjangoFilterBackend]
    search_fields = ['display_id', 'order__display_id', 'order__guest_name', 'order__customer__first_name']
    ordering_fields = ['created_at', 'display_id']
    filterset_class = ReturnFilter
    
    def get_queryset(self):
        if self.action == 'list':
            return Return.objects.select_related('order', 'order__customer', 'created_by')
        return Return.objects.select_related(
            'order', 'order__customer', 'created_by'
        ).prefetch_related(
            'items', 'items__order_item', 'items__order_item__product',
            'items__reason', 'refunds'
        )

    def get_serializer_class(self):
        if self.action == 'list':
            return ReturnListSerializer
        elif self.action == 'create':
            return ReturnCreateSerializer
        return ReturnDetailSerializer
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def receive_items(self, request, pk=None):
        """
        Mark items as received and restore stock for items marked 'return_to_stock'.
        """
        return_request = self.get_object()
        
        if return_request.status != 'initiated':
            return Response(
                {'error': 'Can only receive items for initiated returns'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Restore stock for each item
        with transaction.atomic():
            for item in return_request.items.all():
                item.restore_stock(user=request.user)
            
            # Update return status
            return_request.status = 'items_received'
            return_request.save(update_fields=['status'])
            
            # Update order return status
            return_request.order.return_status = 'received'
            return_request.order.save(update_fields=['return_status'])
        
        return Response({
            'status': 'Items received and stock restored',
            'return_status': return_request.status
        })
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Complete the return process."""
        return_request = self.get_object()
        
        if return_request.status not in ['initiated', 'items_received']:
            return Response(
                {'error': 'Cannot complete this return'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        with transaction.atomic():
            # Lock the return request and its order to prevent race conditions
            return_request = Return.objects.select_for_update().get(pk=return_request.pk)
            order = Order.objects.select_for_update().get(pk=return_request.order.pk)
            
            # If items not yet received, restore stock now
            if return_request.status == 'initiated':
                for item in return_request.items.all():
                    item.restore_stock(user=request.user)
            
            return_request.status = 'completed'
            return_request.save(update_fields=['status'])
            
            order.return_status = 'completed'
            order.save(update_fields=['return_status'])
        
        return Response({
            'status': 'Return completed. Awaiting manual refund record.',
            'return_status': return_request.status
        })
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel the return request."""
        return_request = self.get_object()
        
        if return_request.status != 'initiated':
            return Response(
                {'error': 'Can only cancel initiated returns'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return_request.status = 'cancelled'
        return_request.save(update_fields=['status'])
        
        # Check if there are other active returns for this order
        other_returns = return_request.order.returns.exclude(pk=return_request.pk).exclude(status='cancelled')
        if not other_returns.exists():
            return_request.order.return_status = 'na'
            return_request.order.save(update_fields=['return_status'])
        
        return Response({'status': 'Return cancelled'})
    
    @action(detail=True, methods=['post'])
    def add_refund(self, request, pk=None):
        """Add a refund to this return."""
        return_request = self.get_object()
        
        data = request.data.copy()
        data['return_request'] = return_request.id
        data['order'] = return_request.order.id
        
        serializer = RefundSerializer(data=data)
        if serializer.is_valid():
            with transaction.atomic():
                refund = serializer.save(created_by=request.user)
                
                # Create credit note
                CreditNote.objects.create(refund=refund)

                
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class RefundViewSet(viewsets.ModelViewSet):
    """CRUD for refunds."""
    queryset = Refund.objects.all().select_related('order', 'return_request', 'created_by')
    serializer_class = RefundSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'orders.manage_returns'
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['order', 'return_request', 'status', 'method']
    
    def perform_create(self, serializer):
        with transaction.atomic():
            refund = serializer.save(created_by=self.request.user)
            # Auto-create credit note
            CreditNote.objects.create(refund=refund)
