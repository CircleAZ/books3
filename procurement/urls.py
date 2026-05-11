from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TransporterViewSet, PurchaseOrderViewSet, 
    PurchaseChargeViewSet, PurchasePaymentViewSet
)

router = DefaultRouter()
router.register(r'transporters', TransporterViewSet)
router.register(r'purchase-orders', PurchaseOrderViewSet)
router.register(r'purchase-charges', PurchaseChargeViewSet)
router.register(r'purchase-payments', PurchasePaymentViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
