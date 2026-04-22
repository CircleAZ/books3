"""
Base models for AZ Books application.
All models should inherit from these base classes.
"""

import uuid
from django.db import models


class SoftDeleteManager(models.Manager):
    """
    Custom manager that excludes soft-deleted records by default.
    Use .all_with_deleted() to include deleted records.
    """
    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)
    
    def all_with_deleted(self):
        """Return all records including soft-deleted ones."""
        return super().get_queryset()
    
    def deleted_only(self):
        """Return only soft-deleted records."""
        return super().get_queryset().filter(is_deleted=True)


class UUIDPrimaryKeyModel(models.Model):
    """
    Abstract base model that uses UUID as primary key.
    All database tables must use UUID (v4) as the primary key to ensure
    global uniqueness and data integrity.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        help_text="Unique identifier for this record"
    )
    
    class Meta:
        abstract = True


class TimestampedModel(UUIDPrimaryKeyModel):
    """
    Abstract base model with UUID primary key and timestamp fields.
    Provides created_at and updated_at fields for tracking record lifecycle.
    """
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When this record was created"
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="When this record was last updated"
    )
    
    class Meta:
        abstract = True


class SoftDeleteModel(TimestampedModel):
    """
    Abstract base model with soft delete functionality.
    Records are not permanently deleted but marked as deleted.
    
    Uses SoftDeleteManager by default which filters out deleted records.
    Access deleted records via:
        - Model.all_objects.all() - all records including deleted
        - Model.all_objects.deleted_only() - only deleted records
    """
    is_deleted = models.BooleanField(
        default=False,
        help_text="Whether this record has been soft deleted"
    )
    deleted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this record was soft deleted"
    )
    
    # Default manager excludes deleted records
    objects = SoftDeleteManager()
    # Secondary manager to access all records including deleted
    all_objects = models.Manager()
    
    class Meta:
        abstract = True
    
    def soft_delete(self):
        """Mark record as deleted without removing from database."""
        from django.utils import timezone
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=['is_deleted', 'deleted_at', 'updated_at'])
    
    def restore(self):
        """Restore a soft-deleted record."""
        self.is_deleted = False
        self.deleted_at = None
        self.save(update_fields=['is_deleted', 'deleted_at', 'updated_at'])
    
    def hard_delete(self):
        """Permanently delete the record from database."""
        super().delete()
    
    def delete(self, *args, **kwargs):
        """Override delete to perform soft delete by default."""
        self.soft_delete()


class DisplayIDMixin(models.Model):
    """
    Mixin to add display ID functionality.
    Display IDs are auto-incrementing integers scoped to store/tenant.
    The format is a simple integer (e.g., 1001, 1002) - UI can add prefixes.
    
    IMPORTANT: Consuming models must either:
    1. Call generate_display_id() in their save() method, OR
    2. Use a signal to populate display_id before save
    
    The generation uses database-level MAX+1 with proper locking.
    """
    display_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        db_index=True,
        help_text="User-friendly display ID (auto-generated on server)"
    )
    # Provisional ID for offline-created records
    provisional_id = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text="Temporary ID for offline-created records (TEMP-UUID-n format)"
    )
    
    # Starting value for display IDs (appears more established)
    DISPLAY_ID_START = 1000
    
    class Meta:
        abstract = True
    
    def generate_display_id(self):
        """
        Generate the next display ID for this model.
        Uses explicit table lock on PostgreSQL to handle race conditions.
        Should be called in save() method of consuming model.
        """
        if self.display_id is not None:
            return  # Already has a display ID
        
        from django.db import transaction, connection
        
        with transaction.atomic():
            model_class = self.__class__
            
            # Lock the table exclusively on PostgreSQL to prevent concurrent max() aggregation
            if connection.vendor == 'postgresql':
                with connection.cursor() as cursor:
                    cursor.execute(f'LOCK TABLE "{model_class._meta.db_table}" IN EXCLUSIVE MODE')
            
            # Now safely calculate max
            max_id = model_class.objects.aggregate(
                max_id=models.Max('display_id')
            )['max_id']
            
            if max_id is None:
                self.display_id = self.DISPLAY_ID_START
            else:
                self.display_id = max_id + 1
            
            # Clear provisional ID since we now have a real ID
            if self.provisional_id:
                self.provisional_id = None
    
    def save(self, *args, **kwargs):
        """Override save to generate display_id if not set."""
        if self.display_id is None:
            self.generate_display_id()
        super().save(*args, **kwargs)
