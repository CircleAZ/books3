"""
Data migration: Fix orders incorrectly born as 'completed'.

Root cause (Bug 7): The POS "Confirm Order" button sent order_status='completed'
directly, bypassing the confirmed→completed lifecycle. This migration identifies
orders that are 'completed' but have NOT been fully delivered (the only legitimate
path to 'completed') and downgrades them to 'confirmed'.

Safety: Orders with delivery_status='delivered' are left untouched — they are
legitimately completed. Cancelled orders are also untouched.
"""
from django.db import migrations


def fix_premature_completions(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')

    # Find orders that are 'completed' but delivery is NOT 'delivered'
    # These were set to 'completed' by the broken frontend, not by the delivery workflow
    bad_orders = Order.objects.filter(
        order_status='completed',
        delivery_status__in=['pending', 'partial'],
    ).exclude(
        cancellation_status='completed'
    )

    count = bad_orders.count()
    if count > 0:
        bad_orders.update(order_status='confirmed')
        print(f"\n  [OK] Fixed {count} orders: 'completed' -> 'confirmed' (delivery not done)")
    else:
        print("\n  [OK] No incorrectly-completed orders found. All clean.")


def noop(apps, schema_editor):
    """Reverse migration is a no-op — we can't know which orders were originally wrong."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0011_cancel_duplicate_orders_batch_2'),
    ]

    operations = [
        migrations.RunPython(
            fix_premature_completions,
            reverse_code=noop,
        ),
    ]
