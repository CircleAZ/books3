"""
Reports app models.
"""
from django.db import models
from django.conf import settings


class ActivityLog(models.Model):
    """Tracks user activity for audit purposes."""
    
    ACTION_TYPES = [
        ('login', 'Login'),
        ('logout', 'Logout'),
        ('create', 'Create'),
        ('update', 'Update'),
        ('delete', 'Delete'),
        ('view', 'View'),
        ('export', 'Export'),
        ('payment', 'Payment'),
        ('order', 'Order'),
        ('return', 'Return'),
        ('refund', 'Refund'),
    ]
    
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='report_activity_logs'
    )
    action_type = models.CharField(max_length=20, choices=ACTION_TYPES)
    entity_type = models.CharField(max_length=50, blank=True)  # e.g., 'Order', 'Product'
    entity_id = models.CharField(max_length=100, blank=True)  # ID of affected entity
    description = models.TextField()
    details = models.TextField(blank=True, null=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['action_type', '-created_at']),
            models.Index(fields=['-created_at']),
        ]
    
    def __str__(self):
        return f"{self.user} - {self.action_type} - {self.created_at}"
    
    @classmethod
    def log_action(cls, user, action_type, description, entity_type='', entity_id='', 
                   ip_address=None, user_agent='', details=''):
        """Helper to create activity log entries."""
        return cls.objects.create(
            user=user,
            action_type=action_type,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id else '',
            description=description,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent
        )
