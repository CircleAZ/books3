"""Messaging app views."""
from rest_framework import viewsets, permissions, status
from core.permissions import HasRequiredPermission
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Count, Q
from datetime import timedelta

from .models import Gateway, MessageTemplate, MessageQueue
from .serializers import (
    GatewaySerializer, MessageTemplateSerializer,
    MessageQueueSerializer, MessageQueueCreateSerializer,
    QueueStatsSerializer
)


class GatewayViewSet(viewsets.ModelViewSet):
    """Gateway CRUD + heartbeat."""
    queryset = Gateway.objects.all()
    serializer_class = GatewaySerializer
    permission_classes = [permissions.IsAdminUser]
    
    @action(detail=True, methods=['post'])
    def heartbeat(self, request, pk=None):
        """Update gateway heartbeat timestamp."""
        gateway = self.get_object()
        gateway.last_heartbeat = timezone.now()
        gateway.save(update_fields=['last_heartbeat'])
        return Response({
            'status': 'ok',
            'last_heartbeat': gateway.last_heartbeat,
            'is_online': gateway.is_online
        })
    
    @action(detail=True, methods=['post'])
    def toggle(self, request, pk=None):
        """Toggle gateway active status."""
        gateway = self.get_object()
        gateway.is_active = not gateway.is_active
        gateway.save(update_fields=['is_active'])
        return Response({
            'is_active': gateway.is_active
        })


class MessageTemplateViewSet(viewsets.ModelViewSet):
    """Message template CRUD."""
    queryset = MessageTemplate.objects.all()
    serializer_class = MessageTemplateSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'settings.manage_store'
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by type
        msg_type = self.request.query_params.get('type')
        if msg_type:
            queryset = queryset.filter(type=msg_type)
        
        # Filter by language
        language = self.request.query_params.get('language')
        if language:
            queryset = queryset.filter(language=language)
        
        # Filter by active status
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        return queryset
    
    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        """Generate preview with custom variables."""
        template = self.get_object()
        variables = request.data.get('variables', {})
        expanded = template.expand_spintax(variables)
        return Response({
            'original': template.content,
            'expanded': expanded
        })


class MessageQueueViewSet(viewsets.ModelViewSet):
    """Message queue management."""
    queryset = MessageQueue.objects.select_related('gateway', 'template')
    permission_classes = [HasRequiredPermission]
    required_permission = 'settings.manage_store'
    
    def get_serializer_class(self):
        if self.action == 'create':
            return MessageQueueCreateSerializer
        return MessageQueueSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by status
        msg_status = self.request.query_params.get('status')
        if msg_status:
            queryset = queryset.filter(status=msg_status)
        
        # Filter by type
        msg_type = self.request.query_params.get('type')
        if msg_type:
            queryset = queryset.filter(message_type=msg_type)
        
        # Filter by gateway
        gateway = self.request.query_params.get('gateway')
        if gateway:
            queryset = queryset.filter(gateway_id=gateway)
        
        # Filter by phone
        phone = self.request.query_params.get('phone')
        if phone:
            queryset = queryset.filter(phone__icontains=phone)
        
        return queryset.select_related('gateway', 'template')
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get queue statistics."""
        today = timezone.now().date()
        
        agg_stats = MessageQueue.objects.aggregate(
            pending_count=Count('id', filter=Q(status='pending')),
            processing_count=Count('id', filter=Q(status='processing')),
            sent_count=Count('id', filter=Q(status='sent')),
            delivered_count=Count('id', filter=Q(status='delivered')),
            failed_count=Count('id', filter=Q(status='failed')),
            total_today_count=Count('id', filter=Q(created_at__date=today))
        )
        
        stats = {
            'pending': agg_stats['pending_count'],
            'processing': agg_stats['processing_count'],
            'sent': agg_stats['sent_count'],
            'delivered': agg_stats['delivered_count'],
            'failed': agg_stats['failed_count'],
            'total_today': agg_stats['total_today_count']
        }
        
        serializer = QueueStatsSerializer(stats)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        """Reset failed message for retry."""
        message = self.get_object()
        if message.status != 'failed':
            return Response(
                {'error': 'Only failed messages can be retried'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        message.status = 'pending'
        message.attempts = 0
        message.error_log += f"\n[{timezone.now()}] Manual retry"
        message.save()
        
        return Response({'status': 'queued for retry'})
    
    @action(detail=False, methods=['post'])
    def retry_all_failed(self, request):
        """Retry all failed messages."""
        failed = MessageQueue.objects.filter(status='failed')
        count = failed.count()
        
        failed.update(
            status='pending',
            attempts=0
        )
        
        return Response({'retried': count})
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel a pending message."""
        message = self.get_object()
        if message.status not in ['pending', 'processing']:
            return Response(
                {'error': 'Only pending/processing messages can be cancelled'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        message.status = 'cancelled'
        message.save()
        return Response({'status': 'cancelled'})
    
    @action(detail=False, methods=['post'])
    def send_test(self, request):
        """Send a test message."""
        import re
        phone = request.data.get('phone')
        content = request.data.get('content', 'This is a test message from AZ Books')
        msg_type = request.data.get('type', 'sms')
        
        if not phone:
            return Response(
                {'error': 'Phone number required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate phone format (same rules as MessageQueueCreateSerializer)
        cleaned = re.sub(r'[\s\-\(\)]', '', phone)
        if not re.match(r'^\+?\d{10,15}$', cleaned):
            return Response(
                {'error': 'Invalid phone number format'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        message = MessageQueue.objects.create(
            phone=cleaned,
            content=content,
            message_type=msg_type
        )
        
        return Response(MessageQueueSerializer(message).data)
