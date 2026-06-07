from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import OrderItem, Payment, Refund, DeliveryItem

@receiver([post_save, post_delete], sender=OrderItem)
def handle_order_item_change(sender, instance, **kwargs):
    """Recalculate order totals and status when an item is saved or deleted."""
    if instance.order:
        instance.order.calculate_totals()

@receiver(post_delete, sender=Payment)
def handle_payment_delete(sender, instance, **kwargs):
    """Recalculate order payment status when a payment is deleted."""
    if instance.order:
        instance.order.update_payment_status()

@receiver(post_delete, sender=Refund)
def handle_refund_delete(sender, instance, **kwargs):
    """Recalculate order payment and refund status when a refund is deleted."""
    if instance.order:
        instance._update_order_refund_status()

@receiver([post_save, post_delete], sender=DeliveryItem)
def handle_delivery_item_change(sender, instance, **kwargs):
    """Recalculate order delivery status when a delivery item is saved or deleted."""
    if instance.delivery and instance.delivery.order:
        instance.delivery.order.update_delivery_status()
