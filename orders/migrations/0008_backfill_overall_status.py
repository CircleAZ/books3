"""
Data migration to backfill overall_status for existing orders.
"""
from django.db import migrations


def backfill_overall_status(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')
    for order in Order.objects.all():
        # Compute derived_status using the same priority logic
        status = compute_derived(order)
        if order.overall_status != status:
            order.overall_status = status
            order.save(update_fields=['overall_status'])


def compute_derived(order):
    """Standalone derived_status computation for migration context."""
    if order.cancellation_status == 'pending':
        return 'Cancellation Pending'
    if order.cancellation_status == 'completed':
        if (order.payment_status in ('partial', 'paid', 'overpaid')
                and order.refund_status in ('na', 'pending', 'partial')):
            return 'Cancelled \u2014 Refund Pending'
        return 'Order Cancelled'
    if (order.return_status == 'received'
            and order.refund_status in ('na', 'pending', 'partial')):
        return 'Return Received \u2014 Process Refund'
    if (order.payment_status == 'overpaid'
            and order.refund_status in ('na', 'pending', 'partial')):
        return 'Overpaid \u2014 Refund Due'
    if (order.delivery_status == 'delivered'
            and order.payment_status in ('pending', 'partial')):
        return 'Delivered - Awaiting Payment'
    if (order.delivery_status == 'delivered'
            and order.payment_status in ('paid', 'overpaid', 'refunded')
            and order.return_status in ('na', 'completed', 'cancelled')
            and order.refund_status in ('na', 'completed', 'cancelled')):
        return 'Order Complete'
    if order.delivery_status == 'delivered':
        if order.refund_status in ('pending', 'partial'):
            return 'Refund in Progress'
        if order.return_status == 'pending':
            return 'Return in Progress'
    if order.delivery_status == 'processing':
        return 'Processing'
    if order.delivery_status == 'ready':
        return 'Ready for Pickup'
    if order.order_status == 'draft':
        return 'Draft'
    if order.order_status == 'confirmed':
        return 'Confirmed'
    if order.delivery_status == 'pending':
        return 'Pending'
    return 'Processing'


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0007_order_overall_status'),
    ]

    operations = [
        migrations.RunPython(backfill_overall_status, migrations.RunPython.noop),
    ]
