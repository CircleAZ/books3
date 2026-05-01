# Generated manually to fix duplicate orders batch 2:
# 1122, 1121
#
# Each was created as 'completed' via a duplicate submission bug.
# Stock was deducted via freeze_confirmed_quantities (available ledger).
# No payments or deliveries exist on these duplicates.
#
# For each: restore available stock -> cancel -> soft-delete.
from django.db import migrations, transaction
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)

# (display_id_to_delete, partner_display_id_kept)
DUPLICATES = [
    (1122, 1120),  # Het Kapilbhai Tandel
    (1121, 1119),  # Bhavya Nimeshbhai Tandel
]

def cancel_duplicate_orders(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')
    OrderStatusHistory = apps.get_model('orders', 'OrderStatusHistory')
    Delivery = apps.get_model('orders', 'Delivery')
    DeliveryItem = apps.get_model('orders', 'DeliveryItem')
    User = apps.get_model('account', 'User')
    Product = apps.get_model('inventory', 'Product')
    StockAdjustment = apps.get_model('inventory', 'StockAdjustment')
    StockHistory = apps.get_model('inventory', 'StockHistory')

    admin_user = User.objects.filter(is_superuser=True).first()
    if not admin_user:
        admin_user = User.objects.first()

    for dup_id, kept_id in DUPLICATES:
        logger.info(f"Processing duplicate Order #{dup_id} (keeping #{kept_id})...")

        try:
            order = Order.objects.get(display_id=dup_id)
        except Order.DoesNotExist:
            logger.info(f"  Order #{dup_id} does not exist. Skipping.")
            continue

        # -- Safety checks --
        if order.order_status == 'cancelled' and order.cancellation_status == 'completed':
            logger.info(f"  Order #{dup_id} is already cancelled. Skipping.")
            continue

        if order.payments.exists():
            logger.warning(f"  Order #{dup_id} has payments! Skipping to prevent financial inconsistency.")
            continue

        with transaction.atomic():
            # -- Step 1: Restore AVAILABLE stock --
            for item in order.items.all():
                qty = item.confirmed_quantity if item.confirmed_quantity is not None else item.quantity
                if qty > 0:
                    product = Product.objects.select_for_update().get(pk=item.product_id)

                    old_qty = product.stock_quantity
                    new_qty = old_qty + qty
                    product.stock_quantity = new_qty
                    product.save(update_fields=['stock_quantity'])

                    notes = f"Duplicate Order #{dup_id} cancelled (duplicate of #{kept_id})"

                    StockAdjustment.objects.create(
                        product=product,
                        adjustment_type='increase',
                        quantity=qty,
                        unit_cost=None,
                        reason='correction',
                        notes=notes,
                        created_by=admin_user,
                    )
                    StockHistory.objects.create(
                        product=product,
                        quantity_change=qty,
                        quantity_after=new_qty,
                        cost_at_time=product.cost_price,
                        reason='correction',
                        notes=f"Adjustment (increase): {notes}",
                        created_by=admin_user,
                    )
                    logger.info(f"  ✓ Restored {qty}x {product.name} (available: {old_qty} -> {new_qty})")

            # -- Step 2: Restore PHYSICAL stock if any deliveries exist --
            deliveries = Delivery.objects.filter(order=order)
            for delivery in deliveries:
                for di in DeliveryItem.objects.filter(delivery=delivery):
                    if di.quantity > 0:
                        product = Product.objects.select_for_update().get(pk=di.order_item.product_id)

                        old_phys = product.physical_stock
                        new_phys = old_phys + di.quantity
                        product.physical_stock = new_phys
                        product.save(update_fields=['physical_stock'])

                        notes = f"Duplicate Order #{dup_id} delivery reversed (duplicate of #{kept_id})"

                        StockAdjustment.objects.create(
                            product=product,
                            adjustment_type='increase',
                            quantity=di.quantity,
                            unit_cost=None,
                            reason='correction',
                            notes=notes,
                            created_by=admin_user,
                        )
                        StockHistory.objects.create(
                            product=product,
                            quantity_change=di.quantity,
                            quantity_after=new_phys,
                            cost_at_time=product.cost_price,
                            reason='correction',
                            notes=f"Adjustment (increase): {notes}",
                            created_by=admin_user,
                        )
                        logger.info(f"  ✓ Restored {di.quantity}x physical stock for delivery reversal")

                # Delete delivery items then delivery
                DeliveryItem.objects.filter(delivery=delivery).delete()
                delivery.delete()

            # -- Step 3: Cancel the order --
            old_order_status = order.order_status
            old_cancellation = order.cancellation_status

            order.order_status = 'cancelled'
            order.cancellation_status = 'completed'
            order.overall_status = 'Order Cancelled'
            order.save(update_fields=['order_status', 'cancellation_status', 'overall_status'])

            # Audit trail
            OrderStatusHistory.objects.create(
                order=order,
                status_field='cancellation_status',
                old_value=old_cancellation,
                new_value='completed',
                note=f'System: Duplicate order #{dup_id} cancelled (duplicate of #{kept_id})',
                created_by=admin_user,
            )
            OrderStatusHistory.objects.create(
                order=order,
                status_field='order_status',
                old_value=old_order_status,
                new_value='cancelled',
                note=f'System: Duplicate order #{dup_id} cancelled (duplicate of #{kept_id})',
                created_by=admin_user,
            )

            # -- Step 4: Soft-delete the order --
            order.is_deleted = True
            order.deleted_at = timezone.now()
            order.save(update_fields=['is_deleted', 'deleted_at'])

            logger.info(f"  ✓ Order #{dup_id} cancelled + soft-deleted")

    logger.info("Duplicate order cleanup complete.")

def reverse_cancel(apps, schema_editor):
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0010_add_order_fingerprint'),
    ]

    operations = [
        migrations.RunPython(cancel_duplicate_orders, reverse_cancel),
    ]
