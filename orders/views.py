"""
Views for Order Management.
"""
import logging
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from django.db.models import Count, Case, When, Value, CharField, F
from django.db.models.functions import Coalesce
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
import django_filters

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
        fields = ['order_status', 'payment_status', 'delivery_status', 'return_status', 
                  'refund_status', 'cancellation_status', 'overall_status', 'customer', 'is_guest']


class OrderViewSet(viewsets.ModelViewSet):
    """
    CRUD operations for orders with custom actions.
    """
    queryset = Order.objects.all().select_related(
        'customer', 'created_by'
    ).prefetch_related('items', 'items__product', 'payments', 'status_history', 'order_notes').annotate(
        item_count=Count('items'),
        customer_sort_name=Case(
            When(is_guest=True, then=Coalesce('guest_name', Value('Guest'))),
            default=Coalesce('customer__first_name', Value('')),
            output_field=CharField(),
        ),
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter, DjangoFilterBackend]
    search_fields = ['display_id', 'guest_name', 'guest_phone', 'customer__first_name', 'customer__last_name']
    ordering_fields = ['created_at', 'total', 'display_id', 'payment_status', 'order_status', 'delivery_status', 'customer_sort_name', 'item_count']
    filterset_class = OrderFilter
    
    def get_queryset(self):
        """Restrict access to own orders unless staff."""
        queryset = super().get_queryset()
        user = self.request.user
        if user.is_staff:
            return queryset
        # For customers, show their orders
        if hasattr(user, 'customer_profile'):
             return queryset.filter(customer=user.customer_profile)
        # For non-customer users (e.g. just a user account?), show created_by
        return queryset.filter(created_by=user)
    
    
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

        # Stock Management for Completed Orders
        is_completed = instance.order_status == 'completed'
        old_items = []
        if is_completed:
            old_items = list(instance.items.all())

        with transaction.atomic():
            # If previously completed, restore stock for old items before update
            if is_completed:
                from inventory.services import StockService
                for item in old_items:
                     StockService.adjust_stock(
                        product_id=item.product.id,
                        adjustment_type='increase', # Restore
                        quantity=item.quantity,
                        reason='correction',
                        notes=f"Order #{instance.display_id} Edit (Restore)",
                        user=request.user
                    )

            self.perform_update(serializer)
            instance.refresh_from_db()

            # If still completed, re-deduct stock for new items
            if is_completed and instance.order_status == 'completed':
                 from inventory.services import StockService
                 for item in instance.items.all():
                     StockService.adjust_stock(
                        product_id=item.product.id,
                        adjustment_type='decrease',
                        quantity=item.quantity,
                        reason='sale',
                        notes=f"Order #{instance.display_id} Edit (Deduct)",
                        user=request.user
                    )
            
            # Log history
            if is_completed:
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
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
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
        
        from inventory.services import StockService
        
        # Deduct stock for each item
        with transaction.atomic():
            order.order_status = 'completed'
            order.save(update_fields=['order_status'])
            
            for item in order.items.all():
                StockService.adjust_stock(
                    product_id=item.product.id,
                    adjustment_type='decrease',
                    quantity=item.quantity,
                    reason='sale',
                    notes=f"Order #{order.display_id}",
                    user=request.user
                )
        
        # Dispatch receipt notification via customer preference
        try:
            dispatch_receipt(order)
        except Exception as e:
            logger.error("Failed to dispatch receipt for order #%s: %s", order.display_id, e)
        
        return Response({'status': 'Order completed'})
    
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
            order.approve_cancellation()
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
        order = self.get_object()
        
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
            'method': request.data.get('method'),
            'amount': str(amount),
            'upi_reference': request.data.get('upi_reference', '')
        })
        
        if serializer.is_valid():
            serializer.save(created_by=request.user)
            order.refresh_from_db()
            return Response({
                'payment': serializer.data,
                'payment_status': order.payment_status,
                'amount_paid': float(order.amount_paid),
                'balance_due': float(order.balance_due),
                'change_due': float(order.change_due)
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
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
        
        # Validate field name
        valid_fields = ['delivery_status', 'order_status', 
                        'return_status', 'refund_status', 'cancellation_status']
        if field not in valid_fields:
            return Response({'error': f'Invalid field: {field}'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate new_value is a valid choice for the field
        valid_choices = {
            'delivery_status': ['pending', 'processing', 'ready', 'delivered'],
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
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['order', 'method']
    
    def perform_create(self, serializer):
        with transaction.atomic():
            serializer.save(created_by=self.request.user)


class OrderNoteViewSet(viewsets.ModelViewSet):
    """CRUD for order notes."""
    queryset = OrderNote.objects.all().select_related('order', 'created_by')
    serializer_class = OrderNoteSerializer
    permission_classes = [IsAuthenticated]
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
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class ReturnViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing returns with custom actions for workflow.
    """
    queryset = Return.objects.all().select_related(
        'order', 'order__customer', 'created_by'
    ).prefetch_related('items', 'items__order_item', 'items__order_item__product', 'items__reason', 'refunds')
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter, DjangoFilterBackend]
    search_fields = ['display_id', 'order__display_id', 'order__guest_name', 'order__customer__first_name']
    ordering_fields = ['created_at', 'display_id']
    filterset_class = ReturnFilter
    
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
            # If items not yet received, restore stock now
            if return_request.status == 'initiated':
                for item in return_request.items.all():
                    item.restore_stock(user=request.user)
            
            return_request.status = 'completed'
            return_request.save(update_fields=['status'])
            
            return_request.order.return_status = 'completed'
            return_request.order.save(update_fields=['return_status'])
        
        return Response({
            'status': 'Return completed',
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
            refund = serializer.save(created_by=request.user)
            
            # Create credit note
            CreditNote.objects.create(refund=refund)
            
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class RefundViewSet(viewsets.ModelViewSet):
    """CRUD for refunds."""
    queryset = Refund.objects.all().select_related('order', 'return_request', 'created_by')
    serializer_class = RefundSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['order', 'return_request', 'status', 'method']
    
    def perform_create(self, serializer):
        refund = serializer.save(created_by=self.request.user)
        # Auto-create credit note
        CreditNote.objects.create(refund=refund)
