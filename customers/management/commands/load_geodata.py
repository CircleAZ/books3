import json
import os
from django.core.management.base import BaseCommand
from django.db import transaction
from customers.models import GeographicRegion

class Command(BaseCommand):
    help = 'Loads layered geocoding data into PostGIS GeographicRegion model'

    def add_arguments(self, parser):
        parser.add_argument('json_file', type=str, help='Path to the layered_geocoding_data JSON file')

    @transaction.atomic
    def handle(self, *args, **options):
        file_path = options['json_file']
        
        if not os.path.exists(file_path):
            self.stderr.write(self.style.ERROR(f"File not found: {file_path}"))
            return

        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        self.stdout.write(f"Loaded {len(data)} regions from JSON. Beginning database ingestion...")

        created_count = 0
        updated_count = 0

        for item in data:
            name = item.get('name', 'Unknown')
            label = item.get('label', '')
            layer = item.get('layer', 'village')
            pincode = item.get('pincode', '')
            color = item.get('color', '')

            # Robust Update or Create (handles duplicates from concurrent boots)
            try:
                # Try standard update_or_create
                region, created = GeographicRegion.objects.update_or_create(
                    name=name,
                    layer=layer,
                    defaults={
                        'label': label,
                        'pincode': pincode,
                        'color': color,
                    }
                )
            except GeographicRegion.MultipleObjectsReturned:
                # Concurrency race condition caused duplicates in the past.
                # Find all matching duplicates
                duplicates = list(GeographicRegion.objects.filter(name=name, layer=layer).order_by('id'))
                # Keep the first one, update it
                region = duplicates[0]
                region.label = label
                region.pincode = pincode
                region.color = color
                region.save()
                
                # Delete the rest
                for dup in duplicates[1:]:
                    dup.delete()
                    
                created = False
                self.stdout.write(self.style.WARNING(f"Cleaned up {len(duplicates)-1} duplicates for {name}"))

            if created:
                created_count += 1
            else:
                updated_count += 1

            if (created_count + updated_count) % 500 == 0:
                self.stdout.write(f"Processed {created_count + updated_count} records...")

        self.stdout.write(self.style.SUCCESS(
            f"Successfully processed {len(data)} regions. "
            f"Created: {created_count}, Updated: {updated_count}"
        ))
