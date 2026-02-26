"""Messaging app admin configuration."""
from django.contrib import admin
from .models import Gateway, MessageTemplate, MessageQueue


@admin.register(Gateway)
class GatewayAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active', 'is_online', 'priority', 'messages_sent', 'messages_failed', 'success_rate', 'last_heartbeat']
    list_filter = ['is_active']
    search_fields = ['name', 'description']
    readonly_fields = ['messages_sent', 'messages_failed', 'last_heartbeat', 'created_at', 'updated_at']
    ordering = ['-priority', 'name']


@admin.register(MessageTemplate)
class MessageTemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'type', 'language', 'is_active', 'created_at']
    list_filter = ['type', 'language', 'is_active']
    search_fields = ['name', 'content']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(MessageQueue)
class MessageQueueAdmin(admin.ModelAdmin):
    list_display = ['phone', 'message_type', 'status', 'gateway', 'attempts', 'sent_at', 'created_at']
    list_filter = ['status', 'message_type', 'gateway']
    search_fields = ['phone', 'content']
    readonly_fields = ['attempts', 'error_log', 'sent_at', 'delivered_at', 'created_at', 'updated_at']
    date_hierarchy = 'created_at'
