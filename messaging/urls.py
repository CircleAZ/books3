"""Messaging app URL configuration."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import GatewayViewSet, MessageTemplateViewSet, MessageQueueViewSet

router = DefaultRouter()
router.register(r'gateways', GatewayViewSet, basename='gateway')
router.register(r'templates', MessageTemplateViewSet, basename='message-template')
router.register(r'queue', MessageQueueViewSet, basename='message-queue')

urlpatterns = [
    path('', include(router.urls)),
]
