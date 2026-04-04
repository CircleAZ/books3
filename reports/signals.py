from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver
from django.contrib.auth.signals import user_logged_in, user_logged_out
from django.contrib.auth import get_user_model

from orders.models import Order, Return, Refund
from inventory.models import Product
from customers.models import Customer
from .models import ActivityLog

User = get_user_model()

# --- Field Diffing Helper ---
def track_changes(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        old_instance = sender.objects.get(pk=instance.pk)
    except sender.DoesNotExist:
        return
    
    changes = []
    ignore_fields = ['id', 'created_at', 'updated_at', 'last_login', 'password']
    for field in instance._meta.fields:
        if field.name in ignore_fields:
            continue
        try:
            old_val = getattr(old_instance, field.name)
            new_val = getattr(instance, field.name)
            if old_val != new_val:
                changes.append(f"{field.verbose_name or field.name} changed from '{old_val}' to '{new_val}'")
        except Exception:
            pass
    if changes:
        instance._activity_changes = ", ".join(changes)

@receiver(pre_save, sender=Order)
@receiver(pre_save, sender=Product)
@receiver(pre_save, sender=Customer)
@receiver(pre_save, sender=Return)
def pre_save_tracker(sender, instance, **kwargs):
    track_changes(sender, instance, **kwargs)

# --- Auth Signals ---

@receiver(user_logged_in)
def log_user_login(sender, request, user, **kwargs):
    ActivityLog.log_action(
        user=user,
        action_type='login',
        description=f"User {user.username} logged in",
        ip_address=request.META.get('REMOTE_ADDR')
    )

@receiver(user_logged_out)
def log_user_logout(sender, request, user, **kwargs):
    if user:
        ActivityLog.log_action(
            user=user,
            action_type='logout',
            description=f"User {user.username} logged out",
            ip_address=request.META.get('REMOTE_ADDR')
        )

# --- Order Signals ---

@receiver(post_save, sender=Order)
def log_order_save(sender, instance, created, **kwargs):
    action = 'create' if created else 'update'
    diff = getattr(instance, '_activity_changes', '')
    description = f"Order #{instance.display_id} was {'created' if created else 'updated'}."
    
    # Avoid logging every minor update if desired, or check specific fields
    # For now, log all.
    
    ActivityLog.log_action(
        user=instance.created_by, # Note: update might be by different user, need middleware for current user in signals or pass via save method. 
        # Since signals don't have request context, we rely on created_by or modified_by fields if available.
        # Order doesn't have modified_by. We'll use created_by for creation.
        # For updates, this is tricky without middleware. 
        # We will assume 'created_by' for creation. For updates, it's imperfect.
        action_type='order',
        description=description,
        details=diff,
        entity_type='Order',
        entity_id=instance.display_id
    )

# --- Inventory Signals ---

@receiver(post_save, sender=Product)
def log_product_save(sender, instance, created, **kwargs):
    action = 'create' if created else 'update'
    diff = getattr(instance, '_activity_changes', '')
    description = f"Product {instance.name} was {'created' if created else 'updated'}."
    
    # Only capturing creation properly as we lack 'modified_by' in standard models, but fallback to created_by for logs where needed.
    user = getattr(instance, 'created_by', None)
    if user:
         ActivityLog.log_action(
            user=user,
            action_type=action,
            description=description,
            details=diff,
            entity_type='Product',
            entity_id=instance.id
        )

# --- Customer Signals ---

@receiver(post_save, sender=Customer)
def log_customer_save(sender, instance, created, **kwargs):
    diff = getattr(instance, '_activity_changes', '')
    desc = f"Customer {instance.first_name} {instance.last_name} {'added' if created else 'updated'}."
    if instance.created_by:
         ActivityLog.log_action(
            user=instance.created_by,
            action_type='create' if created else 'update',
            description=desc,
            details=diff,
            entity_type='Customer',
            entity_id=instance.id
        )

# --- Return Signals ---
@receiver(post_save, sender=Return)
def log_return_save(sender, instance, created, **kwargs):
    if created and instance.created_by:
        ActivityLog.log_action(
            user=instance.created_by,
            action_type='return',
            description=f"Return #{instance.display_id} initiated for Order #{instance.order.display_id}",
            entity_type='Return',
            entity_id=instance.display_id
        )
