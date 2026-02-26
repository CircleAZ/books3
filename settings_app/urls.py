from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    StoreSettingsViewSet, RoleViewSet, UserViewSet, 
    TaxSettingsViewSet, NotificationSettingsViewSet,
    FinancialSettingsViewSet, ReceiptSettingsViewSet,
    PaymentMethodViewSet, UPIAccountViewSet,
    IntegrationSettingsViewSet, SystemInfoView, DataManagementView
)

router = DefaultRouter()
router.register(r'store', StoreSettingsViewSet, basename='store-settings')
router.register(r'roles', RoleViewSet)
router.register(r'users', UserViewSet)
router.register(r'taxes', TaxSettingsViewSet)
router.register(r'notifications', NotificationSettingsViewSet)
router.register(r'receipts', ReceiptSettingsViewSet, basename='receipt-settings')
router.register(r'financial', FinancialSettingsViewSet, basename='financial-settings')
router.register(r'payment-methods', PaymentMethodViewSet)
router.register(r'upi-accounts', UPIAccountViewSet)
router.register(r'integrations', IntegrationSettingsViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('system-info/', SystemInfoView.as_view(), name='system-info'),
    path('data-management/', DataManagementView.as_view(), name='data-management'),
]