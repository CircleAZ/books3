from rest_framework import viewsets, status, permissions
from core.permissions import HasRequiredPermission
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.core.exceptions import ValidationError
from django.db.models import Sum, F, DecimalField, Count, Q
from django.utils.dateparse import parse_date
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone

from django_filters.rest_framework import DjangoFilterBackend
import django_filters
from rest_framework import filters

from .models import Transporter, PurchaseOrder, PurchaseOrderItem, PurchaseCharge, PurchasePayment
from .serializers import (
    TransporterSerializer, PurchaseOrderListSerializer, PurchaseOrderDetailSerializer,
    PurchaseChargeSerializer, PurchasePaymentSerializer, POCreateSerializer, POReceiveSerializer
)
from .services import ProcurementService
from .filters import PurchaseOrderTokenizedSearchFilter

class TransporterViewSet(viewsets.ModelViewSet):
    queryset = Transporter.objects.all()
    serializer_class = TransporterSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'inventory.manage_stock'

class PurchaseOrderFilter(django_filters.FilterSet):
    order_date_after = django_filters.DateFilter(field_name='order_date', lookup_expr='gte')
    order_date_before = django_filters.DateFilter(field_name='order_date', lookup_expr='lte')
    
    class Meta:
        model = PurchaseOrder
        fields = {
            'status': ['exact', 'in'],
            'payment_status': ['exact', 'in'],
            'vendor': ['exact'],
        }

class PurchaseOrderViewSet(viewsets.ModelViewSet):
    queryset = PurchaseOrder.objects.select_related('vendor', 'created_by').prefetch_related('items', 'charges', 'payments').all().order_by('-created_at')
    permission_classes = [HasRequiredPermission]
    required_permission = 'inventory.manage_stock'
    filter_backends = [PurchaseOrderTokenizedSearchFilter, filters.OrderingFilter, DjangoFilterBackend]
    ordering_fields = ['display_id', 'order_date', 'expected_delivery_date', 'total_amount', 'amount_paid', 'created_at']
    filterset_class = PurchaseOrderFilter

    def get_serializer_class(self):
        if self.action in ['list']:
            return PurchaseOrderListSerializer
        if self.action in ['create_po']:
            return POCreateSerializer
        if self.action in ['receive_items', 'reverse_items']:
            return POReceiveSerializer
        return PurchaseOrderDetailSerializer

    # ── C3 FIX: Block invalid status transitions via direct PATCH/PUT ──
    VALID_STATUS_TRANSITIONS = {
        PurchaseOrder.Status.DRAFT: [PurchaseOrder.Status.ORDERED, PurchaseOrder.Status.CANCELLED],
        PurchaseOrder.Status.ORDERED: [PurchaseOrder.Status.PARTIAL, PurchaseOrder.Status.RECEIVED, PurchaseOrder.Status.CANCELLED],
        PurchaseOrder.Status.PARTIAL: [PurchaseOrder.Status.RECEIVED, PurchaseOrder.Status.CANCELLED],
        PurchaseOrder.Status.RECEIVED: [],  # Terminal state — no transitions allowed
        PurchaseOrder.Status.CANCELLED: [],  # Terminal state
    }

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        new_status = request.data.get('status')
        
        if new_status and new_status != instance.status:
            allowed = self.VALID_STATUS_TRANSITIONS.get(instance.status, [])
            if new_status not in allowed:
                return Response(
                    {'detail': f'Cannot transition from "{instance.get_status_display()}" to "{new_status}". Allowed: {[s for s in allowed]}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        new_status = request.data.get('status')
        
        if new_status and new_status != instance.status:
            allowed = self.VALID_STATUS_TRANSITIONS.get(instance.status, [])
            if new_status not in allowed:
                return Response(
                    {'detail': f'Cannot transition from "{instance.get_status_display()}" to "{new_status}". Allowed: {[s for s in allowed]}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        return super().partial_update(request, *args, **kwargs)

    @action(detail=False, methods=['post'], url_path='create-po')
    @transaction.atomic
    def create_po(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        data = serializer.validated_data
        
        po = PurchaseOrder.objects.create(
            vendor_id=data['vendor_id'],
            expected_delivery_date=data.get('expected_delivery_date'),
            notes=data.get('notes', ''),
            created_by=request.user
        )
        
        subtotal = Decimal('0.00')
        for item_data in data['items']:
            item = PurchaseOrderItem.objects.create(
                purchase_order=po,
                product_id=item_data['product_id'],
                vendor_pack_size=item_data['vendor_pack_size'],
                purchased_packs=item_data['purchased_packs'],
                unit_cost_price=item_data['unit_cost_price']
            )
            subtotal += item.line_total
            
        total_charges = Decimal('0.00')
        for charge_data in data.get('charges', []):
            charge = PurchaseCharge.objects.create(
                purchase_order=po,
                charge_type=charge_data['charge_type'],
                transporter_id=charge_data.get('transporter_id'),
                amount=charge_data['amount'],
                description=charge_data.get('description', '')
            )
            total_charges += charge.amount
            
        po.subtotal = subtotal
        po.total_charges = total_charges
        po.total_amount = subtotal + total_charges
        po.save(update_fields=['subtotal', 'total_charges', 'total_amount'])
        
        return Response(PurchaseOrderDetailSerializer(po).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='receive')
    def receive_items(self, request, pk=None):
        po = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            bypass_vol = serializer.validated_data.get('bypass_inventory_volume', False)
            bypass_wac = serializer.validated_data.get('bypass_inventory_wac', False)
            
            if (bypass_vol or bypass_wac) and not request.user.is_superuser:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Historical bypasses are restricted to administrators.")
                
            po = ProcurementService.receive_order(
                po.id, 
                serializer.validated_data['items'], 
                request.user,
                bypass_inventory_volume=bypass_vol,
                bypass_inventory_wac=bypass_wac
            )
            return Response(PurchaseOrderDetailSerializer(po).data)
        except (ValidationError, Exception) as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='reverse')
    def reverse_items(self, request, pk=None):
        po = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            po = ProcurementService.reverse_receipt(
                po.id, 
                serializer.validated_data['items'], 
                request.user
            )
            return Response(PurchaseOrderDetailSerializer(po).data)
        except (ValidationError, Exception) as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='analytics')
    def analytics(self, request):
        """
        Procurement analytics with date filtering.
        
        Query params:
          - period: 'week', 'month', 'quarter', 'year', 'all'
          - start_date, end_date: YYYY-MM-DD (custom range)
        
        Returns:
          - global: total_spend, total_charges, charge_ratio
          - vendors: ranked by hidden cost multiplier
          - items: cost variance (vendor quote vs landed cost)
        """
        # Date filtering
        period = request.query_params.get('period')
        today = timezone.now().date()
        
        if period == 'week':
            start_date = today - timedelta(days=7)
        elif period == 'month':
            start_date = today - timedelta(days=30)
        elif period == 'quarter':
            start_date = today - timedelta(days=90)
        elif period == 'year':
            start_date = today - timedelta(days=365)
        elif period == 'all':
            start_date = None
        else:
            start_str = request.query_params.get('start_date')
            end_str = request.query_params.get('end_date')
            start_date = parse_date(start_str) if start_str else today - timedelta(days=30)
            end_date_param = parse_date(end_str) if end_str else today
            today = end_date_param  # Override end date
        
        # Build base queryset
        pos = PurchaseOrder.objects.exclude(status=PurchaseOrder.Status.CANCELLED)
        if start_date:
            pos = pos.filter(order_date__gte=start_date, order_date__lte=today)
        
        # ── Global Metrics ──
        global_agg = pos.aggregate(
            total_spend=Sum('total_amount'),
            total_goods=Sum('subtotal'),
            total_charges=Sum('total_charges'),
            po_count=Sum(F('id') * 0 + 1),  # count
        )
        total_spend = global_agg['total_spend'] or Decimal('0')
        total_goods = global_agg['total_goods'] or Decimal('0')
        total_charges = global_agg['total_charges'] or Decimal('0')
        charge_ratio = float(total_charges / total_goods * 100) if total_goods > 0 else 0.0
        
        # ── Vendor Performance ──
        vendor_data = pos.values(
            'vendor__id', 'vendor__name'
        ).annotate(
            vendor_spend=Sum('total_amount'),
            vendor_goods=Sum('subtotal'),
            vendor_charges=Sum('total_charges'),
        ).order_by('-vendor_charges')
        
        vendors = []
        for v in vendor_data:
            goods = v['vendor_goods'] or Decimal('0')
            charges = v['vendor_charges'] or Decimal('0')
            inflation = float(charges / goods * 100) if goods > 0 else 0.0
            vendors.append({
                'id': str(v['vendor__id']),
                'name': v['vendor__name'],
                'total_spend': v['vendor_spend'],
                'goods_value': goods,
                'charges': charges,
                'inflation_pct': round(inflation, 2),
            })
        
        # ── Item Cost Variance ──
        received_items = PurchaseOrderItem.objects.filter(
            purchase_order__in=pos,
            received_packs__gt=0,
        ).select_related('product', 'purchase_order')
        
        items = []
        for item in received_items[:50]:  # Limit for performance
            po_obj = item.purchase_order
            po_charges = po_obj.total_charges
            po_subtotal = po_obj.subtotal
            
            proportion = (item.line_total / po_subtotal) if po_subtotal > 0 else Decimal('0')
            item_charge = po_charges * proportion
            base_units = item.received_packs * item.vendor_pack_size
            
            if base_units > 0:
                landed = float(item.unit_cost_price + item_charge / base_units)
                vendor_quote = float(item.unit_cost_price)
                variance = ((landed - vendor_quote) / vendor_quote * 100) if vendor_quote > 0 else 0.0
            else:
                landed = float(item.unit_cost_price)
                vendor_quote = float(item.unit_cost_price)
                variance = 0.0
            
            items.append({
                'product_name': item.product.name,
                'po_display_id': po_obj.display_id,
                'vendor_quote': round(vendor_quote, 4),
                'landed_cost': round(landed, 4),
                'variance_pct': round(variance, 2),
                'base_units': base_units,
            })
        
        # Sort by variance descending
        items.sort(key=lambda x: x['variance_pct'], reverse=True)
        
        return Response({
            'period': {
                'start': str(start_date) if start_date else 'all',
                'end': str(today),
            },
            'global': {
                'total_spend': total_spend,
                'total_goods': total_goods,
                'total_charges': total_charges,
                'charge_ratio_pct': round(charge_ratio, 2),
                'po_count': pos.count(),
            },
            'vendors': vendors,
            'items': items,
        })

    @action(detail=False, methods=['get'], url_path='search-suggestions')
    def search_suggestions(self, request):
        """
        Returns search prefix schema cheatsheet OR dynamic distinct values with counts
        for purchase order tokens.
        """
        prefix = request.query_params.get('prefix', '').strip().lower()
        q = request.query_params.get('q', '').strip()

        if not prefix:
            return Response({
                'prefixes': [
                    {'prefix': 'id', 'label': 'PO Number', 'example': 'id:101', 'description': 'Filter by exact PO display ID'},
                    {'prefix': 'vendor', 'label': 'Vendor', 'example': 'vendor:"Navneet"', 'description': 'Filter by supplier/publisher name'},
                    {'prefix': 'status', 'label': 'Status', 'example': 'status:ordered', 'description': 'draft, ordered, partially_received, received, cancelled'},
                    {'prefix': 'payment', 'label': 'Payment Status', 'example': 'payment:pending', 'description': 'pending, partial, paid'},
                    {'prefix': 'product', 'label': 'Product Name', 'example': 'product:"Notebook"', 'description': 'Filter POs containing this product'},
                    {'prefix': 'total', 'label': 'Total Amount', 'example': 'total:>10000', 'description': 'Comparison: >, <, >=, <=, ='},
                    {'prefix': 'paid', 'label': 'Amount Paid', 'example': 'paid:>0', 'description': 'Comparison: >, <, >=, <=, ='},
                    {'prefix': 'date', 'label': 'Order Date', 'example': 'date:today', 'description': 'today, yesterday, or YYYY-MM-DD'},
                    {'prefix': 'due', 'label': 'Expected Delivery', 'example': 'due:today', 'description': 'today, yesterday, or YYYY-MM-DD'},
                ]
            })

        suggestions = []
        if prefix == 'vendor':
            from inventory.models import Vendor
            qs = Vendor.objects.filter(is_deleted=False)
            if q:
                qs = qs.filter(name__icontains=q)
            results = qs.annotate(
                count=Count('purchase_orders', filter=Q(purchase_orders__is_deleted=False))
            ).values('name', 'count').order_by('-count')[:10]
            suggestions = [
                {'value': r['name'], 'label': r['name'], 'count': r['count'], 'prefix': 'vendor', 'badge': 'VENDOR'}
                for r in results
            ]

        elif prefix in ('status', 'po_status'):
            status_counts = dict(
                PurchaseOrder.objects.filter(is_deleted=False)
                .values('status')
                .annotate(count=Count('id'))
                .values_list('status', 'count')
            )
            for val, label in PurchaseOrder.Status.choices:
                if not q or q.lower() in val.lower() or q.lower() in label.lower():
                    suggestions.append({
                        'value': val,
                        'label': label,
                        'count': status_counts.get(val, 0),
                        'prefix': 'status',
                        'badge': 'STATUS'
                    })

        elif prefix in ('payment', 'payment_status'):
            pay_counts = dict(
                PurchaseOrder.objects.filter(is_deleted=False)
                .values('payment_status')
                .annotate(count=Count('id'))
                .values_list('payment_status', 'count')
            )
            for val, label in PurchaseOrder.PaymentStatus.choices:
                if not q or q.lower() in val.lower() or q.lower() in label.lower():
                    suggestions.append({
                        'value': val,
                        'label': label,
                        'count': pay_counts.get(val, 0),
                        'prefix': 'payment',
                        'badge': 'PAYMENT'
                    })

        elif prefix == 'product':
            item_qs = PurchaseOrderItem.objects.filter(purchase_order__is_deleted=False)
            if q:
                item_qs = item_qs.filter(product__name__icontains=q)
            top_products = item_qs.values('product__name').annotate(
                count=Count('purchase_order_id', distinct=True)
            ).order_by('-count')[:10]
            suggestions = [
                {
                    'value': r['product__name'],
                    'label': r['product__name'],
                    'count': r['count'],
                    'prefix': 'product',
                    'badge': 'PRODUCT'
                }
                for r in top_products
            ]

        elif prefix in ('date', 'due'):
            presets = [
                {'value': 'today', 'label': "Today", 'prefix': prefix},
                {'value': 'yesterday', 'label': "Yesterday", 'prefix': prefix},
            ]
            suggestions = [p for p in presets if not q or q.lower() in p['value']]

        elif prefix in ('total', 'paid'):
            presets = [
                {'value': '>10000', 'label': 'Over ₹10,000', 'prefix': prefix},
                {'value': '>50000', 'label': 'Over ₹50,000', 'prefix': prefix},
                {'value': '<=5000', 'label': 'Under ₹5,000', 'prefix': prefix},
                {'value': '=0', 'label': 'Zero (₹0)', 'prefix': prefix},
            ]
            suggestions = [p for p in presets if not q or q in p['value']]

        return Response({
            'prefix': prefix,
            'suggestions': suggestions
        })

class PurchaseChargeViewSet(viewsets.ModelViewSet):
    queryset = PurchaseCharge.objects.select_related('transporter').all()
    serializer_class = PurchaseChargeSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'inventory.manage_stock'
    
    def perform_create(self, serializer):
        charge = serializer.save()
        po = charge.purchase_order
        
        # Block charge entry on cancelled POs only
        if po.status == PurchaseOrder.Status.CANCELLED:
            charge.delete()
            raise ValidationError("Cannot add charges to a cancelled PO.")
        
        po.total_charges += charge.amount
        po.total_amount = po.subtotal + po.total_charges
        po.save(update_fields=['total_charges', 'total_amount'])
        
        # Phase 6.1: If PO is already received, trigger retroactive WAC correction
        if po.status == PurchaseOrder.Status.RECEIVED:
            ProcurementService.apply_retroactive_charge(po.id, charge.amount, self.request.user)

class PurchasePaymentViewSet(viewsets.ModelViewSet):
    queryset = PurchasePayment.objects.select_related('paid_by_employee', 'finance_expense', 'source_wallet', 'source_bank').all()
    serializer_class = PurchasePaymentSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'inventory.manage_stock'

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        bypass_exp = serializer.validated_data.pop('bypass_finance_expense', False)
        bypass_ledg = serializer.validated_data.pop('bypass_finance_ledger', False)
        
        if (bypass_exp or bypass_ledg) and not request.user.is_superuser:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Historical bypasses are restricted to administrators.")
            
        payment = serializer.save()
        
        try:
            ProcurementService.process_payment(
                payment.id, 
                request.user,
                bypass_finance_expense=bypass_exp,
                bypass_finance_ledger=bypass_ledg
            )
        except Exception as e:
            # If service fails (e.g. ValidationError), delete the payment to avoid orphan state
            payment.delete()
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
        return Response(PurchasePaymentSerializer(payment).data, status=status.HTTP_201_CREATED)
