from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from .models import (Outlet, OutletStock, OutletStockTransfer, OutletStockReturn, 
                     OutletDailySale, OutletPayment)
from .serializers import (OutletSerializer, OutletStockSerializer, 
                          OutletStockTransferSerializer, OutletStockReturnSerializer,
                          OutletDailySaleSerializer, OutletPaymentSerializer)

class OutletViewSet(viewsets.ModelViewSet):
    queryset = Outlet.objects.all()
    serializer_class = OutletSerializer

class OutletStockViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = OutletStock.objects.select_related('outlet', 'product')
    serializer_class = OutletStockSerializer
    filterset_fields = ['outlet', 'product']

class OutletStockTransferViewSet(viewsets.ModelViewSet):
    queryset = OutletStockTransfer.objects.all()
    serializer_class = OutletStockTransferSerializer
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
    queryset = OutletStockReturn.objects.all()
    serializer_class = OutletStockReturnSerializer
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
    queryset = OutletDailySale.objects.all()
    serializer_class = OutletDailySaleSerializer
    filterset_fields = ['outlet', 'date']

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)

class OutletPaymentViewSet(viewsets.ModelViewSet):
    queryset = OutletPayment.objects.all()
    serializer_class = OutletPaymentSerializer
    filterset_fields = ['outlet', 'payment_method', 'date']

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)
