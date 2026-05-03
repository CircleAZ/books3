"""Daily overdue payment reminder command.

Schedule: GitHub Actions cron at 30 3 * * * (9:00 AM IST = 3:30 AM UTC)
Tribunal rule: 15 days post-delivery, max 1 reminder per week per order.
"""
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.db import models
from django.utils import timezone
from orders.models import Order
from orders.constants import VALID_SALE_STATUSES
from messaging.dispatch import dispatch_payment_update


class Command(BaseCommand):
    help = "Send gentle reminders for orders overdue >15 days post-delivery (max 1/week)"

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Preview which orders would receive reminders without sending'
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        cutoff = timezone.now() - timedelta(days=15)
        week_ago = timezone.now() - timedelta(days=7)

        overdue = Order.objects.filter(
            payment_status__in=['pending', 'partial'],
            delivered_at__isnull=False,
            delivered_at__lt=cutoff,
            order_status__in=VALID_SALE_STATUSES,
        ).filter(
            # Max 1 reminder per week
            models.Q(last_reminder_sent__isnull=True) |
            models.Q(last_reminder_sent__lt=week_ago)
        ).select_related('customer')

        self.stdout.write(f"Found {overdue.count()} overdue orders.")

        sent = 0
        skipped = 0
        for order in overdue:
            if not order.customer or not order.customer.phone:
                skipped += 1
                continue

            if dry_run:
                self.stdout.write(
                    f"  [DRY RUN] Order #{order.display_id} — "
                    f"Balance: ₹{order.balance_due} — "
                    f"Customer: {order.customer.full_name} — "
                    f"Delivered: {order.delivered_at:%d/%m/%Y}"
                )
                continue

            result = dispatch_payment_update(order, payment=None)
            if 'sent' in result:
                order.last_reminder_sent = timezone.now()
                order.save(update_fields=['last_reminder_sent'])
                sent += 1
                self.stdout.write(f"  ✅ Order #{order.display_id} — reminder sent ({result})")
            else:
                skipped += 1
                self.stdout.write(f"  ⏭️ Order #{order.display_id} — skipped ({result})")

        if dry_run:
            self.stdout.write(self.style.WARNING(f"\nDry run complete. {overdue.count()} orders eligible."))
        else:
            self.stdout.write(self.style.SUCCESS(f"\nDone. Sent: {sent}, Skipped: {skipped}"))
