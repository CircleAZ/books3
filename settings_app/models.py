"""
Settings app models - Store configuration, RBAC, Tax, Payment, etc.
"""
from django.db import models
from django.conf import settings
from core.models import UUIDPrimaryKeyModel


# ============ Existing models (keep these) ============

class School(UUIDPrimaryKeyModel):
    """School/College entity that customers can belong to."""
    name = models.CharField(max_length=200, unique=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Class(UUIDPrimaryKeyModel):
    """Class/Grade level within a school."""
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='classes')
    name = models.CharField(max_length=100)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'name']
        unique_together = ['school', 'name']

    def __str__(self):
        return f"{self.school.name} - {self.name}"


class Division(UUIDPrimaryKeyModel):
    """Division/Section within a class."""
    class_obj = models.ForeignKey(Class, on_delete=models.CASCADE, related_name='divisions')
    name = models.CharField(max_length=50)

    class Meta:
        unique_together = ['class_obj', 'name']

    def __str__(self):
        return f"{self.class_obj} - {self.name}"


class Subdivision(UUIDPrimaryKeyModel):
    """Optional subdivision within a division."""
    division = models.ForeignKey(Division, on_delete=models.CASCADE, related_name='subdivisions')
    name = models.CharField(max_length=50)

    class Meta:
        unique_together = ['division', 'name']

    def __str__(self):
        return f"{self.division} - {self.name}"


# ============ Template Catalogs (reusable name pools) ============

class ClassTemplate(UUIDPrimaryKeyModel):
    """Reusable class name catalog. Not FK-linked to any school."""
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ['name']

    def clean(self):
        self.name = self.name.strip()
        if not self.name:
            from django.core.exceptions import ValidationError
            raise ValidationError({'name': 'Name cannot be empty.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class DivisionTemplate(UUIDPrimaryKeyModel):
    """Reusable division name catalog."""
    name = models.CharField(max_length=100, unique=True)
    applicable_classes = models.ManyToManyField(
        ClassTemplate, blank=True, related_name='available_divisions',
        help_text='If empty, this division is available for ALL classes.'
    )

    class Meta:
        ordering = ['name']

    def clean(self):
        self.name = self.name.strip()
        if not self.name:
            from django.core.exceptions import ValidationError
            raise ValidationError({'name': 'Name cannot be empty.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class SubdivisionTemplate(UUIDPrimaryKeyModel):
    """Reusable subdivision name catalog."""
    name = models.CharField(max_length=100, unique=True)
    applicable_divisions = models.ManyToManyField(
        DivisionTemplate, blank=True, related_name='available_subdivisions',
        help_text='If empty, this subdivision is available for ALL divisions.'
    )

    class Meta:
        ordering = ['name']

    def clean(self):
        self.name = self.name.strip()
        if not self.name:
            from django.core.exceptions import ValidationError
            raise ValidationError({'name': 'Name cannot be empty.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


# ============ Customer Grouping ============

class CustomerGroup(UUIDPrimaryKeyModel):
    """Customer grouping for segmentation."""
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    def __str__(self):
        return self.name


class LinkType(UUIDPrimaryKeyModel):
    """Types of relationships between customers."""
    name = models.CharField(max_length=100, unique=True)
    reverse_name = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return self.name


class LocationTag(UUIDPrimaryKeyModel):
    """Tags for locations/areas for delivery routing."""
    name = models.CharField(max_length=100, unique=True)
    color = models.CharField(max_length=7, default='#6366f1')

    def __str__(self):
        return self.name


# ============ New Phase 14 models ============

class StoreSettings(models.Model):
    """Store/Business information - singleton model."""
    name = models.CharField(max_length=200, default='AZ Books')
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    logo = models.ImageField(upload_to='store/', blank=True, null=True)
    
    currency_symbol = models.CharField(max_length=10, default='₹')
    timezone = models.CharField(max_length=50, default='Asia/Kolkata')
    
    gst_number = models.CharField(max_length=50, blank=True)
    business_registration = models.CharField(max_length=100, blank=True)
    
    # Maintenance mode
    maintenance_mode = models.BooleanField(default=False)
    
    class Meta:
        verbose_name = 'Store Settings'
        verbose_name_plural = 'Store Settings'
    
    def save(self, *args, **kwargs):
        # Singleton pattern - only one instance
        self.pk = 1
        super().save(*args, **kwargs)
    
    @classmethod
    def get_instance(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
    
    def __str__(self):
        return self.name


class Role(UUIDPrimaryKeyModel):
    """RBAC Role definition."""
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    is_default = models.BooleanField(default=False)
    is_system = models.BooleanField(default=False, help_text='System roles cannot be deleted')
    
    class Meta:
        ordering = ['name']
    
    def save(self, *args, **kwargs):
        if self.is_default:
            Role.objects.filter(is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Permission(UUIDPrimaryKeyModel):
    """System permission."""
    CATEGORIES = [
        ('inventory', 'Inventory'),
        ('customers', 'Customers'),
        ('orders', 'Orders'),
        ('reports', 'Reports'),
        ('settings', 'Settings'),
        ('finance', 'Finance'),
    ]
    
    codename = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=50, choices=CATEGORIES)
    
    class Meta:
        ordering = ['category', 'name']
    
    def __str__(self):
        return f"{self.category}: {self.name}"


class RolePermission(models.Model):
    """Role-Permission mapping."""
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='role_permissions')
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE, related_name='permission_roles')
    
    class Meta:
        unique_together = ['role', 'permission']
    
    def __str__(self):
        return f"{self.role.name} - {self.permission.name}"


class UserRole(models.Model):
    """User-Role assignment."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='user_roles'
    )
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='role_users')
    
    class Meta:
        unique_together = ['user', 'role']
    
    def __str__(self):
        return f"{self.user.username} - {self.role.name}"


class TaxSettings(UUIDPrimaryKeyModel):
    """Tax rate configuration."""
    name = models.CharField(max_length=100)
    percentage = models.DecimalField(max_digits=5, decimal_places=2)
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    
    class Meta:
        verbose_name_plural = 'Tax Settings'
        ordering = ['name']
    
    def save(self, *args, **kwargs):
        if self.is_default:
            TaxSettings.objects.filter(is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.percentage}%)"


class PaymentMethod(UUIDPrimaryKeyModel):
    """Payment method configuration."""
    METHOD_TYPES = [
        ('cash', 'Cash'),
        ('upi', 'UPI'),
        ('card', 'Card'),
        ('bank', 'Bank Transfer'),
    ]
    
    name = models.CharField(max_length=100)
    method_type = models.CharField(max_length=20, choices=METHOD_TYPES)
    is_enabled = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)
    
    class Meta:
        ordering = ['display_order', 'name']
    
    def __str__(self):
        return self.name


class UPIAccount(UUIDPrimaryKeyModel):
    """UPI account for payments."""
    upi_id = models.CharField(max_length=100, unique=True)
    display_name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    qr_code = models.ImageField(upload_to='upi_qr/', blank=True, null=True)
    
    def __str__(self):
        return f"{self.display_name} ({self.upi_id})"


class ReceiptSettings(models.Model):
    """Receipt customization - singleton model."""
    header_text = models.TextField(blank=True, default='Thank you for your purchase!')
    footer_text = models.TextField(blank=True, default='Visit again!')
    show_logo = models.BooleanField(default=True)
    show_address = models.BooleanField(default=True)
    show_gst = models.BooleanField(default=True)
    show_phone = models.BooleanField(default=True)
    
    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)
    
    @classmethod
    def get_instance(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class NotificationPreference(UUIDPrimaryKeyModel):
    """Notification configuration."""
    NOTIFICATION_TYPES = [
        ('low_stock', 'Low Stock Alert'),
        ('new_order', 'New Order'),
        ('daily_summary', 'Daily Sales Summary'),
        ('payment_received', 'Payment Received'),
        ('return_request', 'Return Request'),
    ]
    
    notification_type = models.CharField(max_length=50, choices=NOTIFICATION_TYPES, unique=True)
    is_enabled = models.BooleanField(default=True)
    recipients = models.TextField(blank=True, help_text='Comma-separated email addresses')
    
    def __str__(self):
        return self.get_notification_type_display()


class IntegrationSettings(UUIDPrimaryKeyModel):
    """Third-party integration configuration."""
    SERVICE_TYPES = [
        ('email', 'Email (SMTP)'),
        ('sms', 'SMS Gateway'),
        ('whatsapp', 'WhatsApp API'),
        ('maps', 'Maps Service'),
    ]
    
    service_type = models.CharField(max_length=20, choices=SERVICE_TYPES, unique=True)
    is_enabled = models.BooleanField(default=False)
    api_key = models.CharField(max_length=500, blank=True)
    config = models.JSONField(default=dict, blank=True)
    
    class Meta:
        verbose_name_plural = 'Integration Settings'
    
    def __str__(self):
        return self.get_service_type_display()


class RoleAuditLog(models.Model):
    """
    Immutable audit trail for all RBAC privilege changes.
    Records persist even after user deletion (SET_NULL).
    Not deletable through the UI — read-only for Admin.
    """
    ACTION_CHOICES = [
        ('GRANT', 'Permission Granted'),
        ('REVOKE', 'Permission Revoked'),
        ('OVERRIDE', 'Manager Override'),
        ('ROLE_ASSIGN', 'Role Assigned'),
        ('ROLE_REMOVE', 'Role Removed'),
    ]

    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='audit_targets',
        help_text='The user whose permissions were changed'
    )
    permission_code = models.CharField(
        max_length=100,
        blank=True,
        help_text='The permission codename affected (e.g., finance.approve_expenses)'
    )
    role_name = models.CharField(
        max_length=100,
        blank=True,
        help_text='The role name involved in this action'
    )
    executed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='executed_audits',
        help_text='The admin/manager who performed this action'
    )
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text='Additional context (e.g., override payload, reason)'
    )

    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Role Audit Log'
        verbose_name_plural = 'Role Audit Logs'

    def __str__(self):
        return f"[{self.timestamp}] {self.action}: {self.executed_by} → {self.target_user} ({self.permission_code or self.role_name})"
