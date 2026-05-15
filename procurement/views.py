from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.core.exceptions import ValidationError
from django.db.models import Sum, F, DecimalField
from django.utils.dateparse import parse_date
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone

from .models import Transporter, PurchaseOrder, PurchaseOrderItem, PurchaseCharge, PurchasePayment
from .serializers import (
    TransporterSerializer, PurchaseOrderListSerializer, PurchaseOrderDetailSerializer,
    PurchaseChargeSerializer, PurchasePaymentSerializer, POCreateSerializer, POReceiveSerializer
)
from .services import ProcurementService

class TransporterViewSet(viewsets.ModelViewSet):
    queryset = Transporter.objects.all()
    serializer_class = TransporterSerializer
    permission_classes = [permissions.IsAuthenticated]

class PurchaseOrderViewSet(viewsets.ModelViewSet):
    queryset = PurchaseOrder.objects.select_related('vendor', 'created_by').prefetch_related('items', 'charges', 'payments').all().order_by('-created_at')
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ['list']:
            return PurchaseOrderListSerializer
        if self.action in ['create_po']:
            return POCreateSerializer
        if self.action in ['receive_items']:
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

class PurchaseChargeViewSet(viewsets.ModelViewSet):
    queryset = PurchaseCharge.objects.select_related('transporter').all()
    serializer_class = PurchaseChargeSerializer
    permission_classes = [permissions.IsAuthenticated]
    
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
    permission_classes = [permissions.IsAuthenticated]

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
