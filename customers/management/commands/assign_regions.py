from django.core.management.base import BaseCommand
from django.db import transaction
from customers.models import Address, GeographicRegion


class Command(BaseCommand):
    help = 'Reassign customer addresses to village regions based on spatial containment (GPS inside boundary polygon)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Preview changes without saving to the database'
        )

    @transaction.atomic
    def handle(self, *args, **options):
        dry_run = options['dry_run']

        if dry_run:
            self.stdout.write(self.style.WARNING("=== DRY RUN — no changes will be saved ===\n"))

        # Get all village boundaries
        village_regions = GeographicRegion.objects.filter(is_deleted=False, boundary__isnull=False)
        self.stdout.write(f"Found {village_regions.count()} village boundaries to test against.\n")

        # Get all primary addresses with GPS coordinates
        addresses = Address.objects.filter(
            is_primary=True,
            location__isnull=False,
        ).select_related('customer', 'region')

        self.stdout.write(f"Checking {addresses.count()} primary addresses with GPS...\n")

        reassigned = 0
        already_correct = 0
        outside_all = 0

        for addr in addresses:
            # Find which village boundary contains this address
            matching_region = None
            for region in village_regions:
                if region.boundary.contains(addr.location):
                    matching_region = region
                    break

            if matching_region is None:
                outside_all += 1
                continue

            # Check if already assigned correctly
            if addr.region_id == matching_region.id:
                already_correct += 1
                continue

            # Reassign
            old_name = addr.region.name if addr.region else '(none)'
            self.stdout.write(
                f"  {addr.customer.full_name}: "
                f"{old_name} -> {matching_region.name}"
            )

            if not dry_run:
                addr.region = matching_region
                addr.save(update_fields=['region'])

            reassigned += 1

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Reassigned:       {reassigned}"))
        self.stdout.write(f"Already correct:  {already_correct}")
        self.stdout.write(f"Outside all:      {outside_all}")
        self.stdout.write(f"Total processed:  {addresses.count()}")

        if dry_run:
            self.stdout.write(self.style.WARNING("\nDry run complete. Run without --dry-run to apply changes."))
            # Roll back the transaction for dry run
            transaction.set_rollback(True)
