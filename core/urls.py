"""
Core URL configuration for AZ Books RBAC system.
"""
from django.urls import path
from .views import ManagerOverrideView
from .views_omnisearch import OmniSearchView

urlpatterns = [
    path('manager-override/', ManagerOverrideView.as_view(), name='manager-override'),
    path('omnisearch/', OmniSearchView.as_view(), name='omnisearch'),
]
