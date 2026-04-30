from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'outlets', views.OutletViewSet)
router.register(r'stock', views.OutletStockViewSet)
router.register(r'commissions', views.OutletProductCommissionViewSet)
router.register(r'transfers', views.OutletStockTransferViewSet)
router.register(r'returns', views.OutletStockReturnViewSet)
router.register(r'sales', views.OutletDailySaleViewSet)
router.register(r'payments', views.OutletPaymentViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
