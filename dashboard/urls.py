from django.urls import path
from .views import (
    DashboardStatsView,
    TopProductsView,
    SalesTrendView,
    RecentOrdersView,
    AlertsView
)

urlpatterns = [
    path('stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('top-products/', TopProductsView.as_view(), name='dashboard-top-products'),
    path('sales-trend/', SalesTrendView.as_view(), name='dashboard-sales-trend'),
    path('recent-orders/', RecentOrdersView.as_view(), name='dashboard-recent-orders'),
    path('alerts/', AlertsView.as_view(), name='dashboard-alerts'),
]