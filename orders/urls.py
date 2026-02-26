"""Orders app URL configuration."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    OrderViewSet, PaymentViewSet, OrderNoteViewSet,
    ReturnReasonViewSet, ReturnViewSet, RefundViewSet
)
from .receipt_views import PublicReceiptView, ReceiptPDFView

router = DefaultRouter()
router.register(r'orders', OrderViewSet)
router.register(r'payments', PaymentViewSet)
router.register(r'order-notes', OrderNoteViewSet)
router.register(r'return-reasons', ReturnReasonViewSet)
router.register(r'returns', ReturnViewSet)
router.register(r'refunds', RefundViewSet)

urlpatterns = [
    path('', include(router.urls)),
    # Public receipt endpoints (no auth required)
    path('receipts/<uuid:public_uuid>/', PublicReceiptView.as_view(), name='public-receipt'),
    path('receipts/<uuid:public_uuid>/pdf/', ReceiptPDFView.as_view(), name='receipt-pdf'),
]

