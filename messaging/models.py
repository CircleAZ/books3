"""Messaging system models for SMS/WhatsApp gateway."""
import uuid
import re
import random
from django.db import models
from simple_history.models import HistoricalRecords
from django.utils import timezone


class Gateway(models.Model):
    """Android gateway device configuration."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    api_url = models.URLField(help_text="Gateway API endpoint URL")
    api_key = models.CharField(max_length=255, help_text="API authentication key")
    is_active = models.BooleanField(default=True)
    priority = models.IntegerField(default=0, help_text="Higher priority = preferred gateway")
    last_heartbeat = models.DateTimeField(null=True, blank=True)
    messages_sent = models.IntegerField(default=0)
    messages_failed = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-priority', 'name']

    def __str__(self):
        return f"{self.name} ({'Active' if self.is_active else 'Inactive'})"
    
    @property
    def is_online(self):
        """Check if gateway heartbeat is recent (last 5 minutes)."""
        if not self.last_heartbeat:
            return False
        return (timezone.now() - self.last_heartbeat).total_seconds() < 300
    
    @property
    def success_rate(self):
        """Calculate message success rate."""
        total = self.messages_sent + self.messages_failed
        if total == 0:
            return 100.0
        return round((self.messages_sent / total) * 100, 2)


class MessageTemplate(models.Model):
    """Message templates with Spintax support."""
    TYPE_CHOICES = [
        ('order_confirm', 'Order Confirmation'),
        ('payment_received', 'Payment Received'),
        ('order_ready', 'Order Ready'),
        ('delivery_reminder', 'Delivery Reminder'),
        ('low_balance', 'Low Balance Alert'),
        ('promotional', 'Promotional'),
        ('custom', 'Custom'),
    ]
    
    LANGUAGE_CHOICES = [
        ('en', 'English'),
        ('hi', 'Hindi'),
        ('gu', 'Gujarati'),
        ('mr', 'Marathi'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    language = models.CharField(max_length=5, choices=LANGUAGE_CHOICES, default='en')
    content = models.TextField(help_text="Spintax template, e.g. {Hi|Hello} {name}!")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['type', 'language', 'name']
        unique_together = ['type', 'language', 'name']

    def __str__(self):
        return f"{self.name} ({self.get_type_display()} - {self.get_language_display()})"
    
    def expand_spintax(self, variables=None):
        """Expand Spintax and substitute variables."""
        content = self.content
        
        # Expand Spintax: {option1|option2|option3}
        pattern = r'\{([^{}]+)\}'
        while re.search(pattern, content):
            content = re.sub(
                pattern,
                lambda m: random.choice(m.group(1).split('|')),
                content
            )
        
        # Substitute variables: {{variable_name}}
        if variables:
            for key, value in variables.items():
                content = content.replace(f'{{{{{key}}}}}', str(value))
        
        return content


class MessageQueue(models.Model):
    """Outbound message queue."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('sent', 'Sent'),
        ('delivered', 'Delivered'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]
    
    TYPE_CHOICES = [
        ('sms', 'SMS'),
        ('whatsapp', 'WhatsApp'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone = models.CharField(max_length=20)
    content = models.TextField()
    message_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='sms')
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending')
    gateway = models.ForeignKey(
        Gateway, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='messages'
    )
    template = models.ForeignKey(
        MessageTemplate, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='messages'
    )
    attempts = models.IntegerField(default=0)
    max_attempts = models.IntegerField(default=3)
    error_log = models.TextField(blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Reference fields for tracking
    related_order = models.UUIDField(null=True, blank=True)
    related_customer = models.UUIDField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['phone']),
            models.Index(fields=['gateway', 'status']),
        ]

    def __str__(self):
        return f"{self.phone} - {self.get_status_display()} ({self.message_type})"
    
    def mark_sent(self, gateway=None):
        """Mark message as sent."""
        self.status = 'sent'
        self.sent_at = timezone.now()
        if gateway:
            self.gateway = gateway
            gateway.messages_sent += 1
            gateway.save(update_fields=['messages_sent'])
        self.save()
    
    def mark_failed(self, error, gateway=None):
        """Mark message as failed and log error."""
        self.attempts += 1
        self.error_log += f"\n[{timezone.now()}] {error}"
        
        if self.attempts >= self.max_attempts:
            self.status = 'failed'
            if gateway:
                gateway.messages_failed += 1
                gateway.save(update_fields=['messages_failed'])
        else:
            self.status = 'pending'  # Retry
        
        self.save()
    
    @classmethod
    def get_pending(cls, limit=50):
        """Get pending messages ready for dispatch."""
        now = timezone.now()
        return cls.objects.filter(
            status='pending'
        ).filter(
            models.Q(scheduled_at__isnull=True) | models.Q(scheduled_at__lte=now)
        ).select_related('gateway', 'template')[:limit]
