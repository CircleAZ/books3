import logging
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.core.cache import cache

logger = logging.getLogger(__name__)


def increment_cache_version(key):
    """
    Safely increment the cache version key in Django's cache.
    If the key does not exist, set it to 1.
    """
    try:
        cache.incr(key)
        logger.info(f"Incremented cache version for '{key}'")
    except ValueError:
        cache.set(key, 1, timeout=None)
        logger.info(f"Initialized cache version for '{key}' to 1")
    except Exception as e:
        logger.warning(f"Failed to increment cache version for '{key}': {e}")


# --- Inventory Product Version Invalidation ---

@receiver([post_save, post_delete], sender='inventory.Product')
def invalidate_product_cache(sender, instance, **kwargs):
    increment_cache_version('product_cache_version')


@receiver([post_save, post_delete], sender='inventory.StockAdjustment')
def invalidate_stock_adjustment_cache(sender, instance, **kwargs):
    increment_cache_version('product_cache_version')


# --- Category and Vendor Cache Invalidation ---

@receiver([post_save, post_delete], sender='inventory.Category')
def invalidate_category_cache(sender, instance, **kwargs):
    increment_cache_version('category_cache_version')
    # Since products are linked to categories, category changes can affect product listings
    increment_cache_version('product_cache_version')


@receiver([post_save, post_delete], sender='inventory.Vendor')
def invalidate_vendor_cache(sender, instance, **kwargs):
    increment_cache_version('vendor_cache_version')
    # Since products are linked to vendors, vendor changes can affect product listings
    increment_cache_version('product_cache_version')


# --- Order / Delivery / Return Item Version Invalidation ---
# These models store items whose quantity changes affect annotated product fields 
# (e.g. owed_quantity, delivered_quantity, stock_quantity)

@receiver([post_save, post_delete], sender='orders.OrderItem')
def invalidate_order_item_product_cache(sender, instance, **kwargs):
    increment_cache_version('product_cache_version')


@receiver([post_save, post_delete], sender='orders.DeliveryItem')
def invalidate_delivery_item_product_cache(sender, instance, **kwargs):
    increment_cache_version('product_cache_version')


@receiver([post_save, post_delete], sender='orders.ReturnItem')
def invalidate_return_item_product_cache(sender, instance, **kwargs):
    increment_cache_version('product_cache_version')
