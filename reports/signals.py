from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.contrib.auth.signals import user_logged_in, user_logged_out
from django.contrib.auth import get_user_model

from orders.models import Order, Return, Refund
from inventory.models import Product
from customers.models import Customer
from .models import ActivityLog

User = get_user_model()

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
        entity_type='Order',
        entity_id=instance.display_id
    )

# --- Inventory Signals ---

@receiver(post_save, sender=Product)
def log_product_save(sender, instance, created, **kwargs):
    action = 'create' if created else 'update'
    description = f"Product {instance.name} was {'created' if created else 'updated'}."
    
    # Only capturing creation properly as we lack 'modified_by'
    user = getattr(instance, 'created_by', None)
    if created and user:
         ActivityLog.log_action(
            user=user,
            action_type='create',
            description=description,
            entity_type='Product',
            entity_id=instance.id
        )

# --- Customer Signals ---

@receiver(post_save, sender=Customer)
def log_customer_save(sender, instance, created, **kwargs):
    if created and instance.created_by:
         ActivityLog.log_action(
            user=instance.created_by,
            action_type='create',
            description=f"Customer {instance.first_name} {instance.last_name} added.",
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
