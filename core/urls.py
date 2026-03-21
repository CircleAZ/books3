"""
Core URL configuration for AZ Books RBAC system.
"""
from django.urls import path
from .views import ManagerOverrideView

urlpatterns = [
    path('manager-override/', ManagerOverrideView.as_view(), name='manager-override'),
]
