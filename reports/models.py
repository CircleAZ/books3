"""
Reports app models.
"""
from django.db import models
from django.conf import settings
from core.models import SoftDeleteModel


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


class SavedQuery(SoftDeleteModel):
    """Stores visual or text AZQL queries for future reuse."""
    
    ENTITY_CHOICES = [
        ('order', 'Order'),
        ('orderitem', 'OrderItem'),
        ('outlet', 'Outlet'),
        ('outletstock', 'OutletStock'),
        ('product', 'Product'),
        ('purchaseorder', 'PurchaseOrder'),
        ('customer', 'Customer'),
    ]
    QUERY_TYPE_CHOICES = [
        ('visual', 'Visual Builder'),
        ('azql', 'AZQL Editor'),
    ]
    
    name = models.CharField(max_length=200, help_text="Name of the saved query")
    entity = models.CharField(max_length=50, choices=ENTITY_CHOICES, help_text="Base target model")
    query_type = models.CharField(max_length=20, choices=QUERY_TYPE_CHOICES, default='visual', help_text="Query composition interface")
    rules = models.JSONField(null=True, blank=True, help_text="JSON AST tree representation for visual query builder")
    azql_text = models.TextField(null=True, blank=True, help_text="Raw text representation of AZQL query")
    columns = models.JSONField(default=list, help_text="Ordered list of display columns")
    aggregates = models.JSONField(default=list, help_text="Array of aggregate definitions")
    is_shared = models.BooleanField(default=False, help_text="Whether this query is shared team-wide")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='saved_queries',
        help_text="User who created this query"
    )
    
    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['created_by', 'is_deleted']),
            models.Index(fields=['is_shared', 'is_deleted']),
        ]
        verbose_name = "Saved Query"
        verbose_name_plural = "Saved Queries"
        
    def __str__(self):
        return f"{self.name} ({self.entity} - {self.query_type})"


class QueryStateHistory(models.Model):
    """Stores temporary auto-saved states and query execution history for recovery."""
    
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='query_history_states',
        help_text="User who owns this query state history record"
    )
    saved_query = models.ForeignKey(
        SavedQuery,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='history_states',
        help_text="Associated saved query if editing one"
    )
    name = models.CharField(max_length=200, blank=True, help_text="Label of state, e.g. 'Auto-saved' or 'Executed Query'")
    entity = models.CharField(max_length=50)
    query_type = models.CharField(max_length=20)
    rules = models.JSONField(null=True, blank=True)
    azql_text = models.TextField(null=True, blank=True)
    columns = models.JSONField(default=list)
    aggregates = models.JSONField(default=list)
    is_safe = models.BooleanField(default=False, help_text="Set to True when query executed successfully")
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
        ]
        verbose_name = "Query State History"
        verbose_name_plural = "Query State History Records"
        
    def __str__(self):
        return f"{self.user.username} - {self.name} - {self.entity} ({self.created_at})"
        
    def save(self, *args, **kwargs):
        from django.db import transaction
        with transaction.atomic():
            super().save(*args, **kwargs)
            # Pruning logic: keep at most 15 records total, but always preserve the last 5 safe points (is_safe=True)
            # 1. Fetch protected safe points
            safe_points = list(
                QueryStateHistory.objects.filter(user=self.user, is_safe=True).order_by('-created_at')[:5]
            )
            protected_ids = {sp.id for sp in safe_points}
            
            # 2. Find remaining records (all records EXCEPT the protected ones)
            remaining_qs = QueryStateHistory.objects.filter(user=self.user).exclude(id__in=protected_ids).order_by('-created_at')
            
            # 3. We want the total records in the database for this user to be <= 15
            # We already have len(protected_ids) records protected.
            # So we can keep at most (15 - len(protected_ids)) from the remaining records.
            max_remaining_to_keep = 15 - len(protected_ids)
            
            # 4. Delete the rest
            excess_ids = list(remaining_qs[max_remaining_to_keep:].values_list('id', flat=True))
            if excess_ids:
                QueryStateHistory.objects.filter(id__in=excess_ids).delete()

