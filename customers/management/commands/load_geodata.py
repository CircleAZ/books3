import json
import os
from django.core.management.base import BaseCommand
from django.db import transaction
from django.contrib.gis.geos import Polygon
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

            # Parse boundary
            boundary_geom = None
            boundary_data = item.get('boundary')
            if boundary_data and boundary_data.get('type') == 'Polygon':
                coords = boundary_data.get('coordinates', [])
                if coords and len(coords) > 0:
                    try:
                        # GeoJSON/PostGIS expects (longitude, latitude) -> (x, y)
                        # Extracted coords are [lat, lng]
                        linear_ring = [(float(pt[1]), float(pt[0])) for pt in coords[0]]
                        
                        # GEOS requires a closed ring
                        if linear_ring and linear_ring[0] != linear_ring[-1]:
                            linear_ring.append(linear_ring[0])
                            
                        boundary_geom = Polygon(linear_ring)
                    except Exception as e:
                        self.stderr.write(self.style.WARNING(f"Error parsing geometry for {name}: {e}"))

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
                        'boundary': boundary_geom,
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
                region.boundary = boundary_geom
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
