"""Reports app URL configuration."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SalesReportViewSet, InventoryReportViewSet, CustomerReportViewSet, 
    ActivityLogViewSet, FinanceReportViewSet, QueryViewSet, QueryStateHistoryViewSet
)

router = DefaultRouter()
router.register(r'sales', SalesReportViewSet, basename='sales-report')
router.register(r'inventory', InventoryReportViewSet, basename='inventory-report')
router.register(r'customers', CustomerReportViewSet, basename='customer-report')
router.register(r'finance', FinanceReportViewSet, basename='finance-report')
router.register(r'activity', ActivityLogViewSet, basename='activity-log')
router.register(r'queries', QueryViewSet, basename='saved-query')
router.register(r'queries-history', QueryStateHistoryViewSet, basename='query-history')


urlpatterns = [
    path('', include(router.urls)),
]
