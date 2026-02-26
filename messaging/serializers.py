"""Messaging app serializers."""
from rest_framework import serializers
from django.utils.html import strip_tags
from .models import Gateway, MessageTemplate, MessageQueue


class GatewaySerializer(serializers.ModelSerializer):
    is_online = serializers.BooleanField(read_only=True)
    success_rate = serializers.FloatField(read_only=True)

    class Meta:
        model = Gateway
        fields = [
            'id', 'name', 'description', 'api_url', 'api_key',
            'is_active', 'priority', 'last_heartbeat',
            'messages_sent', 'messages_failed',
            'is_online', 'success_rate',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['messages_sent', 'messages_failed', 'last_heartbeat']
        extra_kwargs = {'api_key': {'write_only': True}}
    
    def validate_name(self, value):
        """Sanitize name to prevent XSS."""
        return strip_tags(value).strip() if value else value


class MessageTemplateSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_type_display', read_only=True)
    language_display = serializers.CharField(source='get_language_display', read_only=True)
    preview = serializers.SerializerMethodField()

    class Meta:
        model = MessageTemplate
        fields = [
            'id', 'name', 'type', 'type_display',
            'language', 'language_display', 'content',
            'is_active', 'preview', 'created_at', 'updated_at'
        ]
    
    def get_preview(self, obj):
        """Generate a sample expanded message."""
        sample_vars = {
            'name': 'Customer',
            'order_id': 'ORD-001',
            'amount': '₹500',
            'date': 'today'
        }
        return obj.expand_spintax(sample_vars)
    
    def validate_name(self, value):
        """Sanitize name."""
        return strip_tags(value).strip() if value else value


class MessageQueueSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    type_display = serializers.CharField(source='get_message_type_display', read_only=True)
    gateway_name = serializers.CharField(source='gateway.name', read_only=True)
    template_name = serializers.CharField(source='template.name', read_only=True)

    class Meta:
        model = MessageQueue
        fields = [
            'id', 'phone', 'content', 'message_type', 'type_display',
            'status', 'status_display', 'gateway', 'gateway_name',
            'template', 'template_name', 'attempts', 'max_attempts',
            'error_log', 'scheduled_at', 'sent_at', 'delivered_at',
            'related_order', 'related_customer',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'attempts', 'error_log', 'sent_at', 'delivered_at'
        ]


class MessageQueueCreateSerializer(serializers.ModelSerializer):
    """Simplified serializer for creating messages."""
    
    class Meta:
        model = MessageQueue
        fields = [
            'phone', 'content', 'message_type', 'template',
            'scheduled_at', 'related_order', 'related_customer'
        ]
    
    def validate_phone(self, value):
        """Validate phone number format."""
        import re
        # Remove common prefixes and spaces
        cleaned = re.sub(r'[\s\-\(\)]', '', value)
        if not re.match(r'^\+?\d{10,15}$', cleaned):
            raise serializers.ValidationError("Invalid phone number format")
        return cleaned


class QueueStatsSerializer(serializers.Serializer):
    """Stats for message queue dashboard."""
    pending = serializers.IntegerField()
    processing = serializers.IntegerField()
    sent = serializers.IntegerField()
    delivered = serializers.IntegerField()
    failed = serializers.IntegerField()
    total_today = serializers.IntegerField()
