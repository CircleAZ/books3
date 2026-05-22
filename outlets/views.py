from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django_filters.rest_framework import DjangoFilterBackend
from .models import (Outlet, OutletStock, OutletStockTransfer, OutletStockReturn, 
                     OutletDailySale, OutletPayment, OutletProductCommission)
from .serializers import (OutletSerializer, OutletStockSerializer, 
                          OutletStockTransferSerializer, OutletStockReturnSerializer,
                          OutletDailySaleSerializer, OutletPaymentSerializer,
                          OutletProductCommissionSerializer)
from core.permissions import HasRequiredPermission

class OutletViewSet(viewsets.ModelViewSet):
    queryset = Outlet.objects.with_financials().all()
    serializer_class = OutletSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'outlets.manage_outlet'
    permission_map = {
        'list': 'outlets.view_outlet',
        'retrieve': 'outlets.view_outlet',
    }

class OutletStockViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = OutletStock.objects.select_related(
        'outlet', 'product', 'product__category', 'product__vendor'
    ).prefetch_related('product__images')
    serializer_class = OutletStockSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'outlets.view_outlet'
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['outlet', 'product']

class OutletProductCommissionViewSet(viewsets.ModelViewSet):
    """
    CRUD for per-product commission overrides at an outlet.
    Supports bulk upsert via POST to /bulk_upsert/
    """
    queryset = OutletProductCommission.objects.select_related('product')
    serializer_class = OutletProductCommissionSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'outlets.manage_outlet'
    permission_map = {
        'list': 'outlets.view_outlet',
        'retrieve': 'outlets.view_outlet',
    }
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['outlet', 'product']

    @action(detail=False, methods=['post'])
    def bulk_upsert(self, request):
        """
        Accept a list of { outlet, product, commission_type, commission_value } dicts.
        Creates or updates each entry atomically.
        """
        items = request.data
        if not isinstance(items, list):
            return Response({'error': 'Expected a list of items'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(data=items, many=True)
        serializer.is_valid(raise_exception=True)

        results = []
        with transaction.atomic():
            for item in serializer.validated_data:
                outlet_obj = item.get('outlet')
                product_obj = item.get('product')
                c_type = item.get('commission_type', 'percent')
                c_value = item.get('commission_value')

                obj, created = OutletProductCommission.objects.update_or_create(
                    outlet=outlet_obj,
                    product=product_obj,
                    defaults={'commission_type': c_type, 'commission_value': c_value}
                )
                results.append({
                    'id': str(obj.id),
                    'product': str(product_obj.id),
                    'commission_type': obj.commission_type,
                    'commission_value': str(obj.commission_value),
                    'created': created
                })

        return Response(results, status=status.HTTP_200_OK)


class OutletStockTransferViewSet(viewsets.ModelViewSet):
    queryset = OutletStockTransfer.objects.prefetch_related(
        'items__product', 'items__product__category',
        'items__product__vendor', 'items__product__images'
    )
    serializer_class = OutletStockTransferSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'outlets.manage_transfer'
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['outlet', 'status']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def dispatch_transfer(self, request, pk=None):
        transfer = self.get_object()
        try:
            transfer.dispatch(user=request.user)
            return Response({'status': 'dispatched'})
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': 'Internal Server Error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class OutletStockReturnViewSet(viewsets.ModelViewSet):
    queryset = OutletStockReturn.objects.prefetch_related(
        'items__product', 'items__product__category',
        'items__product__vendor', 'items__product__images'
    )
    serializer_class = OutletStockReturnSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'outlets.manage_return'
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['outlet', 'status', 'reason']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def receive_return(self, request, pk=None):
        return_rec = self.get_object()
        try:
            return_rec.receive(user=request.user)
            return Response({'status': 'received'})
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': 'Internal Server Error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class OutletDailySaleViewSet(viewsets.ModelViewSet):
    queryset = OutletDailySale.objects.prefetch_related(
        'items__product', 'items__product__category',
        'items__product__vendor', 'items__product__images'
    )
    serializer_class = OutletDailySaleSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'outlets.manage_outlet'
    permission_map = {
        'list': 'outlets.view_outlet',
        'retrieve': 'outlets.view_outlet',
    }
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['outlet', 'date']

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)

class OutletPaymentViewSet(viewsets.ModelViewSet):
    queryset = OutletPayment.objects.select_related('outlet', 'recorded_by')
    serializer_class = OutletPaymentSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'outlets.manage_outlet'
    permission_map = {
        'list': 'outlets.view_outlet',
        'retrieve': 'outlets.view_outlet',
    }
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['outlet', 'payment_method', 'date']

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)
