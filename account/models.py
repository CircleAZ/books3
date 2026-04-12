"""
Account app models for AZ Books
- User: Custom User model with UUID and extended fields (merged UserProfile)
- ActivityLog: Tracks user actions for audit trail
"""
import uuid
import secrets
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
from datetime import timedelta
from core.models import UUIDPrimaryKeyModel, TimestampedModel, SoftDeleteModel

class User(AbstractUser, UUIDPrimaryKeyModel):
    """
    Custom User model for AZ Books.
    Uses UUID as primary key.
    Includes fields previously in UserProfile.
    """
    
    class Role(models.TextChoices):
        OWNER = 'owner', 'Owner'
        MANAGER = 'manager', 'Manager'
        CASHIER = 'cashier', 'Cashier'
        STAFF = 'staff', 'Staff'
    
    # UUID is inherited from UUIDPrimaryKeyModel
    
    # Override AbstractUser.email to make it required and unique
    email = models.EmailField('email address', unique=True)

    # Extended Fields
    phone = models.CharField(max_length=20, blank=True, default='')
    profile_picture = models.ImageField(
        upload_to='profile_pictures/', 
        blank=True, 
        null=True
    )
    role = models.CharField(
        max_length=20, 
        choices=Role.choices, 
        default=Role.STAFF
    )
    
    # Settings
    remember_me_enabled = models.BooleanField(default=False)
    last_login_ip = models.GenericIPAddressField(blank=True, null=True)

    # OTP / Email Verification
    email_verified = models.BooleanField(default=False)
    last_otp_verified_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        # AbstractUser already has 'db_table' = 'auth_user' by default, 
        # but since we are replacing it, we can let Django handle the table name (app_label_model_name -> account_user)
        # or force it to be something specific. Default is fine.

    def __str__(self):
        return self.username

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip() or self.username
    
    @property
    def initials(self):
        if self.first_name and self.last_name:
            return f"{self.first_name[0]}{self.last_name[0]}".upper()
        return self.username[:2].upper()

    @property
    def otp_verified_today(self):
        """Check if OTP was already verified today (server timezone)."""
        if not self.last_otp_verified_at:
            return False
        return self.last_otp_verified_at.date() == timezone.now().date()

    @property
    def masked_email(self):
        """Return masked email like m***k@gmail.com for OTP prompts."""
        local, domain = self.email.split('@')
        if len(local) <= 2:
            masked = local[0] + '***'
        else:
            masked = local[0] + '***' + local[-1]
        return f"{masked}@{domain}"


class EmailOTP(UUIDPrimaryKeyModel):
    """One-time passwords for email verification and login challenges."""

    class Purpose(models.TextChoices):
        LOGIN = 'login', 'Login Verification'
        VERIFY_EMAIL = 'verify_email', 'Email Verification'

    user = models.ForeignKey(
        'account.User',
        on_delete=models.CASCADE,
        related_name='email_otps'
    )
    code = models.CharField(max_length=6)
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Email OTP'
        verbose_name_plural = 'Email OTPs'

    def __str__(self):
        return f"{self.user.username} - {self.purpose} - {self.code}"

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    @property
    def is_valid(self):
        return not self.is_used and not self.is_expired

    @classmethod
    def generate(cls, user, purpose='login', lifetime_minutes=5):
        """
        Generate a new 6-digit OTP for the given user.
        Invalidates all previous unused OTPs for the same user+purpose.
        """
        # Invalidate previous OTPs
        cls.objects.filter(
            user=user, purpose=purpose, is_used=False
        ).update(is_used=True)

        code = f"{secrets.randbelow(1000000):06d}"
        return cls.objects.create(
            user=user,
            code=code,
            purpose=purpose,
            expires_at=timezone.now() + timedelta(minutes=lifetime_minutes)
        )


class ActivityLog(UUIDPrimaryKeyModel):
    """Tracks user actions for audit trail"""
    
    class ActionType(models.TextChoices):
        LOGIN = 'login', 'Login'
        LOGOUT = 'logout', 'Logout'
        PASSWORD_CHANGE = 'password_change', 'Password Changed'
        PROFILE_UPDATE = 'profile_update', 'Profile Updated'
        ORDER_CREATE = 'order_create', 'Order Created'
        ORDER_UPDATE = 'order_update', 'Order Updated'
        PRODUCT_CREATE = 'product_create', 'Product Created'
        PRODUCT_UPDATE = 'product_update', 'Product Updated'
        CUSTOMER_CREATE = 'customer_create', 'Customer Created'
        CUSTOMER_UPDATE = 'customer_update', 'Customer Updated'
        OTHER = 'other', 'Other'
    
    user = models.ForeignKey(
        'account.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='activity_logs'
    )
    action = models.CharField(max_length=50, choices=ActionType.choices)
    description = models.CharField(max_length=255)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    user_agent = models.CharField(max_length=255, blank=True, default='')
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Activity Log'
        verbose_name_plural = 'Activity Logs'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.user.username} - {self.action} - {self.created_at}"
    
    @classmethod
    def log_action(cls, user, action, description, request=None, metadata=None):
        """Helper method to create activity log entries"""
        ip_address = None
        user_agent = ''
        
        if request:
            x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
            if x_forwarded_for:
                ip_address = x_forwarded_for.split(',')[0]
            else:
                ip_address = request.META.get('REMOTE_ADDR')
            user_agent = request.META.get('HTTP_USER_AGENT', '')[:255]
        
        return cls.objects.create(
            user=user,
            action=action,
            description=description,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata=metadata or {}
        )


class Notification(UUIDPrimaryKeyModel):
    """User notifications for the notification panel"""

    class NotificationType(models.TextChoices):
        INFO = 'info', 'Info'
        WARNING = 'warning', 'Warning'
        SUCCESS = 'success', 'Success'
        ERROR = 'error', 'Error'
        STOCK = 'stock', 'Stock Alert'
        ORDER = 'order', 'Order'

    user = models.ForeignKey(
        'account.User',
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    type = models.CharField(
        max_length=20,
        choices=NotificationType.choices,
        default=NotificationType.INFO
    )
    title = models.CharField(max_length=200)
    message = models.CharField(max_length=500)
    link = models.CharField(max_length=500, blank=True, default='')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'

    def __str__(self):
        return f"{self.user.username} - {self.title} ({'read' if self.is_read else 'unread'})"

    @classmethod
    def notify(cls, user, title, message, notification_type='info', link=''):
        """Helper to create a notification"""
        return cls.objects.create(
            user=user,
            type=notification_type,
            title=title,
            message=message,
            link=link
        )
