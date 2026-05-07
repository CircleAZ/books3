"""
Management command: Generate PWA icons from current store logo.

Usage:
    python manage.py generate_pwa_icons          # From logo or defaults
    python manage.py generate_pwa_icons --force   # Regenerate even if icons exist
"""

from django.core.management.base import BaseCommand
from settings_app.models import StoreSettings
from settings_app.pwa_icons import generate_pwa_icons, ICON_SIZES
from django.core.files.storage import default_storage


class Command(BaseCommand):
    help = 'Generate PWA icons from store logo (or create text-based defaults)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Regenerate icons even if they already exist',
        )

    def handle(self, *args, **options):
        force = options['force']

        # Check if icons already exist
        if not force:
            all_exist = all(default_storage.exists(path) for path in ICON_SIZES.keys())
            if all_exist:
                self.stdout.write(self.style.WARNING(
                    'All PWA icons already exist. Use --force to regenerate.'
                ))
                return

        store = StoreSettings.get_instance()
        self.stdout.write(f'Store: {store.name}')

        logo = store.logo if store.logo and store.logo.name else None
        if logo:
            self.stdout.write(f'Logo found: {store.logo.name}')
        else:
            self.stdout.write(self.style.WARNING(
                'No logo uploaded — generating text-based defaults'
            ))

        paths = generate_pwa_icons(
            logo_field=logo,
            store_name=store.name,
        )

        if paths:
            for p in paths:
                self.stdout.write(self.style.SUCCESS(f'  OK {p}'))
            self.stdout.write(self.style.SUCCESS(
                f'Done — {len(paths)} icons generated.'
            ))
        else:
            self.stdout.write(self.style.ERROR('No icons were generated.'))
