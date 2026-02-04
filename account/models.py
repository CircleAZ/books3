"""
Account app models for AZ Books
- UserProfile: Extended user profile with additional fields
- ActivityLog: Tracks user actions for audit trail
"""
import uuid
from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
from core.models import TimestampedModel, UUIDPrimaryKeyModel


class UserProfile(TimestampedModel):
    """Extended user profile with additional fields"""
    
    class Role(models.TextChoices):
        OWNER = 'owner', 'Owner'
        MANAGER = 'manager', 'Manager'
        CASHIER = 'cashier', 'Cashier'
        STAFF = 'staff', 'Staff'
    
    user = models.OneToOneField(
        User, 
        on_delete=models.CASCADE, 
        related_name='profile'
    )
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
    
    class Meta:
        verbose_name = 'User Profile'
        verbose_name_plural = 'User Profiles'
    
    def __str__(self):
        return f"{self.user.username}'s Profile"
    
    @property
    def full_name(self):
        return f"{self.user.first_name} {self.user.last_name}".strip() or self.user.username
    
    @property
    def initials(self):
        if self.user.first_name and self.user.last_name:
            return f"{self.user.first_name[0]}{self.user.last_name[0]}".upper()
        return self.user.username[:2].upper()


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
        User, 
        on_delete=models.CASCADE, 
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


# Signal to create UserProfile when User is created
@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    if hasattr(instance, 'profile'):
        instance.profile.save()
