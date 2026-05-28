"""Orders app URL configuration."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    OrderViewSet, PaymentViewSet,
    ReturnReasonViewSet, ReturnViewSet, RefundViewSet
)
from .receipt_views import PublicReceiptView, ReceiptBalanceView

router = DefaultRouter()
router.register(r'orders', OrderViewSet)
router.register(r'payments', PaymentViewSet)
router.register(r'return-reasons', ReturnReasonViewSet)
router.register(r'returns', ReturnViewSet)
router.register(r'refunds', RefundViewSet)

urlpatterns = [
    path('', include(router.urls)),
    # Public receipt endpoints (no auth required)
    path('receipts/<uuid:receipt_uuid>/', PublicReceiptView.as_view(), name='public-receipt'),
    path('receipts/<uuid:receipt_uuid>/balance/', ReceiptBalanceView.as_view(), name='receipt-balance'),
]
