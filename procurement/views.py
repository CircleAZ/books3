from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from decimal import Decimal

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
            
        po.subtotal = subtotal
        po.total_amount = subtotal # Charges added later
        po.save(update_fields=['subtotal', 'total_amount'])
        
        return Response(PurchaseOrderDetailSerializer(po).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='receive')
    def receive_items(self, request, pk=None):
        po = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            po = ProcurementService.receive_order(po.id, serializer.validated_data['items'], request.user)
            return Response(PurchaseOrderDetailSerializer(po).data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class PurchaseChargeViewSet(viewsets.ModelViewSet):
    queryset = PurchaseCharge.objects.select_related('transporter').all()
    serializer_class = PurchaseChargeSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def perform_create(self, serializer):
        charge = serializer.save()
        po = charge.purchase_order
        po.total_charges += charge.amount
        po.total_amount = po.subtotal + po.total_charges
        po.save(update_fields=['total_charges', 'total_amount'])

class PurchasePaymentViewSet(viewsets.ModelViewSet):
    queryset = PurchasePayment.objects.select_related('paid_by_employee', 'finance_expense').all()
    serializer_class = PurchasePaymentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment = serializer.save()
        
        try:
            ProcurementService.process_payment(payment.id, request.user)
        except Exception as e:
            # If service fails (e.g. ValidationError), delete the payment to avoid orphan state
            payment.delete()
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
        return Response(PurchasePaymentSerializer(payment).data, status=status.HTTP_201_CREATED)
