# Data migration to reconcile stock_quantity for all products.
#
# ROOT CAUSE: A duplicate perform_create() in OrderViewSet silently
# overwrote the correct one, causing freeze_confirmed_quantities()
# to never be called on order creation.  This means:
#   - confirmed_quantity was never set (stays NULL)
#   - stock_quantity was never decremented
#
# FIX STRATEGY (Delta approach — surgical, idempotent):
# 1. Find all OrderItems where confirmed_quantity IS NULL
#    on ANY non-draft order (including cancelled ones).
# 2. For each affected product, decrement stock_quantity by the
#    sum of those unfrozen quantities. This fixes:
#    a) Active orders that never deducted stock.
#    b) Cancelled orders that artificially inflated stock (restored without deducting).
# 3. Set confirmed_quantity = quantity on those items.
# 4. Create StockHistory audit records.
#
# SAFETY:
# - Items already frozen by the delivery fallback have
#   confirmed_quantity set, so they are NOT touched.
# - This migration is idempotent: running it again finds 0 items.

from django.db import migrations


def reconcile_available_stock(apps, schema_editor):
    """
    Reconcile stock_quantity for all products by fixing unfrozen order items.
    """
    Product = apps.get_model('inventory', 'Product')
    OrderItem = apps.get_model('orders', 'OrderItem')
    StockHistory = apps.get_model('inventory', 'StockHistory')

    # Find all order items that SHOULD have been frozen but weren't.
    # This includes:
    # 1. Active orders (confirmed/completed) where stock was never deducted.
    # 2. Cancelled orders where stock was never deducted, but WAS restored upon cancellation (causing artificial inflation).
    unfrozen_items = OrderItem.objects.filter(
        confirmed_quantity__isnull=True,
        order__is_deleted=False,
    ).exclude(
        order__order_status='draft'
    ).select_related('product', 'order')

    # Group adjustments by product to apply a single atomic update per product
    product_map = {}  # product_id -> { 'total_qty': int, 'items': [], 'order_ids': [] }

    for item in unfrozen_items:
        pid = item.product_id
        if pid not in product_map:
            product_map[pid] = {'total_qty': 0, 'items': [], 'order_ids': set()}
        product_map[pid]['total_qty'] += item.quantity
        product_map[pid]['items'].append(item)
        product_map[pid]['order_ids'].add(item.order.display_id)

    if not product_map:
        print("  [reconcile] No unfrozen order items found. Stock is already consistent.")
        return

    print(f"  [reconcile] Found {len(product_map)} products with unfrozen order items.")

    for product_id, data in product_map.items():
        product = Product.objects.get(pk=product_id)
        old_stock = product.stock_quantity
        deduction = data['total_qty']
        new_stock = old_stock - deduction

        # 1. Update product stock
        product.stock_quantity = new_stock
        product.save(update_fields=['stock_quantity'])

        # 2. Create audit trail
        order_ids_str = ', '.join(str(oid) for oid in sorted(data['order_ids']))
        StockHistory.objects.create(
            product=product,
            quantity_change=-deduction,
            quantity_after=new_stock,
            cost_at_time=product.cost_price,
            reason='correction',
            notes=f"Migration 0007: Reconcile unfrozen stock. "
                  f"Deducted {deduction} across {len(data['items'])} order items. "
                  f"Orders: #{order_ids_str}",
            # created_by intentionally left NULL — this is a system migration
        )

        # 3. Freeze the confirmed_quantity on all affected items
        for item in data['items']:
            item.confirmed_quantity = item.quantity
            item.save(update_fields=['confirmed_quantity'])

        print(
            f"    Product #{product.display_id} '{product.name}': "
            f"stock {old_stock} → {new_stock} "
            f"(deducted {deduction} from {len(data['items'])} items, "
            f"orders: #{order_ids_str})"
        )

    print(f"  [reconcile] Done. Reconciled {len(product_map)} products.")


def reverse_noop(apps, schema_editor):
    """
    Reverse is a no-op. Manual review would be required to undo this.
    The migration is idempotent, so re-running forward is safe.
    """
    print("  [reconcile] Reverse migration is a no-op. Review manually if needed.")


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0006_reconcile_physical_stock'),
        ('orders', '0008_consolidate_customer_orders'),
    ]

    operations = [
        migrations.RunPython(reconcile_available_stock, reverse_noop),
    ]
