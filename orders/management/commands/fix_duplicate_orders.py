"""
Management command to fix duplicate orders.

For each duplicate order:
1. Restore available stock (reverse freeze_confirmed_quantities deduction)
2. Restore physical stock if deliveries were made
3. Delete delivery records
4. Delete order items
5. Cancel and soft-delete the order

Usage:
    python manage.py fix_duplicate_orders          # Dry run (inspect only)
    python manage.py fix_duplicate_orders --execute # Actually mutate data
"""
from django.core.management.base import BaseCommand
from django.db import transaction


# Orders to clean up: display_id of the DUPLICATE to remove
DUPLICATE_DISPLAY_IDS = [1093, 1098, 1100, 1106, 1112, 1114]


class Command(BaseCommand):
    help = 'Fix duplicate orders by restoring stock, cancelling, and soft-deleting'

    def add_arguments(self, parser):
        parser.add_argument(
            '--execute',
            action='store_true',
            default=False,
            help='Actually execute the cleanup. Without this flag, only a dry-run report is shown.',
        )

    def handle(self, *args, **options):
        from orders.models import Order, OrderItem, Delivery, DeliveryItem
        from inventory.services import StockService

        execute = options['execute']
        mode = 'EXECUTE' if execute else 'DRY RUN'
        self.stdout.write(self.style.WARNING(f'\n=== Fix Duplicate Orders [{mode}] ===\n'))

        for display_id in DUPLICATE_DISPLAY_IDS:
            self.stdout.write(self.style.HTTP_INFO(f'\n--- Order #{display_id} ---'))

            try:
                order = Order.objects.get(display_id=display_id)
            except Order.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'  Order #{display_id} NOT FOUND. Skipping.'))
                continue

            # Show order state
            self.stdout.write(f'  Customer:     {order.customer or order.guest_name}')
            self.stdout.write(f'  Status:       order={order.order_status}, payment={order.payment_status}, delivery={order.delivery_status}')
            self.stdout.write(f'  Total:        {order.total}')
            self.stdout.write(f'  Cancellation: {order.cancellation_status}')

            # Show items
            items = list(order.items.all())
            self.stdout.write(f'  Items ({len(items)}):')
            for item in items:
                confirmed_qty = item.confirmed_quantity or item.quantity
                self.stdout.write(
                    f'    - {item.product.name} (#{item.product.display_id}) '
                    f'x {confirmed_qty} @ {item.unit_price}'
                )

            # Show deliveries
            deliveries = list(order.deliveries.all())
            delivery_items = []
            for d in deliveries:
                d_items = list(d.items.all())
                delivery_items.extend(d_items)
            self.stdout.write(f'  Deliveries ({len(deliveries)}):')
            for di in delivery_items:
                self.stdout.write(
                    f'    - {di.order_item.product.name} x {di.quantity} (physical stock deducted)'
                )

            # Show payments
            payments = list(order.payments.all())
            self.stdout.write(f'  Payments ({len(payments)}):')
            if payments:
                for p in payments:
                    self.stdout.write(f'    - {p.method}: {p.amount}')
                self.stdout.write(self.style.ERROR(
                    '  ⚠ ORDER HAS PAYMENTS! Skipping to prevent financial inconsistency.'
                ))
                continue
            else:
                self.stdout.write('    (none)')

            if not execute:
                self.stdout.write(self.style.WARNING('  [DRY RUN] Would restore stock, cancel, and soft-delete.'))
                continue

            # === EXECUTE ===
            try:
                with transaction.atomic():
                    # Step 1: Restore AVAILABLE stock for confirmed items
                    for item in items:
                        qty = item.confirmed_quantity or item.quantity
                        if qty > 0:
                            StockService.adjust_stock(
                                product_id=item.product.id,
                                adjustment_type='increase',
                                quantity=qty,
                                reason='correction',
                                notes=f'Duplicate Order #{display_id} cleanup: restore available stock',
                                user=None,
                                target_ledger='available'
                            )
                            self.stdout.write(self.style.SUCCESS(
                                f'  ✓ Restored {qty}x {item.product.name} (available)'
                            ))

                    # Step 2: Restore PHYSICAL stock for delivered items
                    for di in delivery_items:
                        if di.quantity > 0:
                            StockService.adjust_stock(
                                product_id=di.order_item.product.id,
                                adjustment_type='increase',
                                quantity=di.quantity,
                                reason='correction',
                                notes=f'Duplicate Order #{display_id} cleanup: restore physical stock',
                                user=None,
                                target_ledger='physical'
                            )
                            self.stdout.write(self.style.SUCCESS(
                                f'  ✓ Restored {di.quantity}x {di.order_item.product.name} (physical)'
                            ))

                    # Step 3: Delete delivery items and deliveries
                    for d in deliveries:
                        d.items.all().delete()
                        d.delete()
                    if deliveries:
                        self.stdout.write(f'  ✓ Deleted {len(deliveries)} delivery record(s)')

                    # Step 4: Delete order items (hard delete since order is being removed)
                    item_count = order.items.all().delete()[0]
                    self.stdout.write(f'  ✓ Deleted {item_count} order item(s)')

                    # Step 5: Cancel and soft-delete the order
                    order.order_status = 'cancelled'
                    order.cancellation_status = 'completed'
                    order.save(update_fields=['order_status', 'cancellation_status'])
                    order.soft_delete()
                    self.stdout.write(self.style.SUCCESS(
                        f'  ✓ Order #{display_id} cancelled and soft-deleted'
                    ))

            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  ✗ FAILED: {e}'))
                raise  # Re-raise to rollback the atomic block

        self.stdout.write(self.style.SUCCESS(f'\n=== Done [{mode}] ===\n'))
