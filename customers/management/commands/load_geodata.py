import json
import os
from django.core.management.base import BaseCommand
from django.contrib.gis.geos import GEOSGeometry, MultiPolygon, Point
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
            
            # Parse center point
            lat = item.get('lat')
            lng = item.get('lng')
            center_point = None
            if lat and lng:
                center_point = Point(lng, lat, srid=4326)

            # Parse boundary
            boundary_geom = None
            boundary_data = item.get('boundary')
            if boundary_data:
                try:
                    geom = GEOSGeometry(json.dumps(boundary_data))
                    # Models expect MultiPolygon, so upgrade Polygon to MultiPolygon if necessary
                    if geom.geom_type == 'Polygon':
                        boundary_geom = MultiPolygon(geom)
                    elif geom.geom_type == 'MultiPolygon':
                        boundary_geom = geom
                    else:
                        self.stderr.write(f"Warning: Unexpected geometry type {geom.geom_type} for {name}")
                except Exception as e:
                    self.stderr.write(f"Error parsing geometry for {name}: {e}")

            # Update or create
            region, created = GeographicRegion.objects.update_or_create(
                name=name,
                layer=layer,
                defaults={
                    'label': label,
                    'pincode': pincode,
                    'color': color,
                    'center': center_point,
                    'boundary': boundary_geom,
                }
            )

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
