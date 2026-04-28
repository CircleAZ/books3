# Generated manually to fix duplicate order #1055
from django.db import migrations, transaction
import logging

logger = logging.getLogger(__name__)

def cancel_duplicate_order(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')
    OrderItem = apps.get_model('orders', 'OrderItem')
    OrderStatusHistory = apps.get_model('orders', 'OrderStatusHistory')
    User = apps.get_model('account', 'User')
    Product = apps.get_model('inventory', 'Product')
    StockAdjustment = apps.get_model('inventory', 'StockAdjustment')
    StockHistory = apps.get_model('inventory', 'StockHistory')

    # Get a system/admin user for audit trails
    admin_user = User.objects.filter(is_superuser=True).first()
    if not admin_user:
        admin_user = User.objects.first()

    try:
        order = Order.objects.get(display_id=1055)
    except Order.DoesNotExist:
        logger.info("Order 1055 does not exist. Skipping migration.")
        return

    if order.order_status == 'cancelled' and order.cancellation_status == 'completed':
        logger.info("Order 1055 is already cancelled. Skipping.")
        return

    # Validations to ensure it's exactly the duplicate we expect
    if order.order_status != 'completed':
        logger.warning(f"Order 1055 status is {order.order_status}, expected 'completed'. Skipping.")
        return
    if order.payment_status != 'pending':
        logger.warning(f"Order 1055 payment_status is {order.payment_status}, expected 'pending'. Skipping.")
        return
    if order.delivery_status != 'pending':
        logger.warning(f"Order 1055 delivery_status is {order.delivery_status}, expected 'pending'. Skipping.")
        return
    if order.cancellation_status != 'na':
        logger.warning(f"Order 1055 cancellation_status is {order.cancellation_status}, expected 'na'. Skipping.")
        return
    if order.payments.exists():
        logger.warning(f"Order 1055 has payments. Expected 0. Skipping.")
        return

    # Proceed with cancellation
    with transaction.atomic():
        # Restore stock
        for item in order.items.all():
            qty_to_restore = item.confirmed_quantity if item.confirmed_quantity is not None else item.quantity
            if qty_to_restore > 0:
                # Lock product to prevent race conditions during migration
                product = Product.objects.select_for_update().get(pk=item.product_id)
                
                old_qty = product.stock_quantity
                new_qty = old_qty + qty_to_restore
                
                # We are restoring to available ledger, so physical_stock is not changed
                # (As per StockService._do_adjust_stock logic for target_ledger='available')
                product.stock_quantity = new_qty
                product.save(update_fields=['stock_quantity'])

                reason = 'correction'
                notes = f"Duplicate order #{order.display_id} cancelled (duplicate of #1054)"

                StockAdjustment.objects.create(
                    product=product,
                    adjustment_type='increase',
                    quantity=qty_to_restore,
                    unit_cost=None,
                    reason=reason,
                    notes=notes,
                    created_by=admin_user
                )

                StockHistory.objects.create(
                    product=product,
                    quantity_change=qty_to_restore,
                    quantity_after=new_qty,
                    cost_at_time=product.cost_price,
                    reason=reason,
                    notes=f"Adjustment (increase): {notes}",
                    created_by=admin_user
                )
        
        # Update order status
        old_order_status = order.order_status
        old_cancellation = order.cancellation_status

        order.order_status = 'cancelled'
        order.cancellation_status = 'completed'
        order.overall_status = 'Order Cancelled'
        
        order.save(update_fields=['order_status', 'cancellation_status', 'overall_status'])

        # Audit history
        OrderStatusHistory.objects.create(
            order=order,
            status_field='cancellation_status',
            old_value=old_cancellation,
            new_value='completed',
            note='System: Duplicate order cancelled (BackgroundSync replay of #1054)',
            created_by=admin_user
        )
        OrderStatusHistory.objects.create(
            order=order,
            status_field='order_status',
            old_value=old_order_status,
            new_value='cancelled',
            note='System: Duplicate order cancelled (BackgroundSync replay of #1054)',
            created_by=admin_user
        )

def reverse_cancel(apps, schema_editor):
    pass  # No automated rollback for data fixes

class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0006_delivery_system'),
        ('inventory', '0006_reconcile_physical_stock'),
        ('account', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(cancel_duplicate_order, reverse_cancel),
    ]
