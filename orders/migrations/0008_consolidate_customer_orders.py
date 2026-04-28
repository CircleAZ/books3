# Generated manually to consolidate orders and clean up duplicates
from django.db import migrations, transaction
from decimal import Decimal
import logging
from django.utils import timezone

logger = logging.getLogger(__name__)

def consolidate_orders(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')
    OrderItem = apps.get_model('orders', 'OrderItem')
    Payment = apps.get_model('orders', 'Payment')
    Delivery = apps.get_model('orders', 'Delivery')
    OrderStatusHistory = apps.get_model('orders', 'OrderStatusHistory')
    User = apps.get_model('account', 'User')
    Product = apps.get_model('inventory', 'Product')
    StockAdjustment = apps.get_model('inventory', 'StockAdjustment')
    StockHistory = apps.get_model('inventory', 'StockHistory')

    admin_user = User.objects.filter(is_superuser=True).first()
    if not admin_user:
        admin_user = User.objects.first()

    merges = [
        {'source': 1023, 'target': 1020},
        {'source': 1014, 'target': 1012},
        {'source': 1016, 'target': 1011},
    ]

    cancellations = [1048, 1037]

    with transaction.atomic():
        # --- PHASE 1: MERGES ---
        for merge in merges:
            src_id = merge['source']
            tgt_id = merge['target']
            
            try:
                src_order = Order.objects.get(display_id=src_id)
                tgt_order = Order.objects.get(display_id=tgt_id)
            except Order.DoesNotExist:
                logger.warning(f"Could not find source {src_id} or target {tgt_id}. Skipping this merge.")
                continue

            if src_order.is_deleted:
                logger.info(f"Source order {src_id} is already deleted. Skipping merge.")
                continue

            # 1. Move Items
            for item in src_order.items.all():
                item.order = tgt_order
                item.save(update_fields=['order'])
            
            # 2. Move Payments
            for payment in src_order.payments.all():
                payment.order = tgt_order
                payment.save(update_fields=['order'])
                
            # 3. Move Deliveries (to avoid dangling references)
            for delivery in src_order.deliveries.all():
                delivery.order = tgt_order
                delivery.save(update_fields=['order'])
                
            # 4. Recalculate Target Order Totals
            # Refresh items from DB to get the newly added ones
            tgt_items = OrderItem.objects.filter(order=tgt_order)
            subtotal = sum(item.line_total for item in tgt_items)
            
            discount_type = tgt_order.discount_type
            discount_value = tgt_order.discount_value
            discount_amount = Decimal('0')
            
            if discount_type == 'percent' and discount_value:
                # Need to use Decimal('0.01') for quantize
                discount_amount = (subtotal * discount_value / 100).quantize(Decimal('0.01'))
            elif discount_type == 'fixed' and discount_value:
                discount_amount = min(discount_value, subtotal)
                
            total = subtotal - discount_amount
            
            tgt_order.subtotal = subtotal
            tgt_order.discount_amount = discount_amount
            tgt_order.total = total
            
            # Recalculate Payment Status for Target Order
            tgt_payments = Payment.objects.filter(order=tgt_order)
            total_paid = sum(p.amount for p in tgt_payments)
            # Refunds are not expected here, but we default to 0 just in case
            total_refunded = Decimal('0')
            net_paid = total_paid - total_refunded
            
            if net_paid <= 0 and total_paid > 0:
                tgt_order.payment_status = 'refunded'
            elif net_paid > total:
                tgt_order.payment_status = 'overpaid'
            elif net_paid == total:
                tgt_order.payment_status = 'paid'
            elif net_paid > 0:
                tgt_order.payment_status = 'partial'
            else:
                tgt_order.payment_status = 'pending'
                
            if total_paid > 0 and tgt_order.order_status == 'draft':
                tgt_order.order_status = 'confirmed'
                
            tgt_order.save(update_fields=['subtotal', 'discount_amount', 'total', 'payment_status', 'order_status'])
            
            # 5. Soft Delete Source Order
            src_order.is_deleted = True
            src_order.deleted_at = timezone.now()
            src_order.save(update_fields=['is_deleted', 'deleted_at', 'updated_at'])
            
            logger.info(f"Successfully merged order {src_id} into {tgt_id} and deleted {src_id}.")

        # --- PHASE 2: CANCELLATIONS ---
        for del_id in cancellations:
            try:
                order = Order.objects.get(display_id=del_id)
            except Order.DoesNotExist:
                logger.info(f"Order {del_id} does not exist. Skipping cancellation.")
                continue
                
            if order.order_status == 'cancelled' and order.cancellation_status == 'completed':
                logger.info(f"Order {del_id} is already cancelled. Skipping.")
                continue
                
            # Restore stock for the items
            for item in order.items.all():
                qty_to_restore = item.confirmed_quantity if item.confirmed_quantity is not None else item.quantity
                if qty_to_restore > 0:
                    product = Product.objects.select_for_update().get(pk=item.product_id)
                    old_qty = product.stock_quantity
                    new_qty = old_qty + qty_to_restore
                    
                    product.stock_quantity = new_qty
                    product.save(update_fields=['stock_quantity'])

                    reason = 'correction'
                    notes = f"Order #{order.display_id} deleted by admin cleanup"

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
                note='System: Order cleanly deleted and stock restored by admin cleanup',
                created_by=admin_user
            )
            OrderStatusHistory.objects.create(
                order=order,
                status_field='order_status',
                old_value=old_order_status,
                new_value='cancelled',
                note='System: Order cleanly deleted and stock restored by admin cleanup',
                created_by=admin_user
            )
            
            logger.info(f"Successfully cancelled order {del_id} and restored its stock.")

def reverse_cleanup(apps, schema_editor):
    pass  # No automated rollback for data fixes

class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0007_cancel_duplicate_order_1055'),
        ('inventory', '0006_reconcile_physical_stock'),
        ('account', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(consolidate_orders, reverse_cleanup),
    ]
