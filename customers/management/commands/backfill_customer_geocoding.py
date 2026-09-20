import time
import requests
from django.core.management.base import BaseCommand
from django.db import transaction
from customers.models import Address, GeographicRegion

class Command(BaseCommand):
    help = (
        "Backfill customer addresses using PostGIS internal polygons for Village "
        "and OpenStreetMap Nominatim for Taluka (admin_level 6) and District (admin_level 5)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview backfill results without committing changes to the database.',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Limit processing to first N records (useful for smoke testing).',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Reprocess records even if taluka or district are already set.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        limit = options['limit']
        force = options['force']

        if dry_run:
            self.stdout.write(self.style.WARNING("=== DRY RUN MODE: No database changes will be committed ==="))

        # Load active village boundary polygons into memory
        regions = list(GeographicRegion.objects.filter(is_deleted=False, boundary__isnull=False))
        self.stdout.write(f"Loaded {len(regions)} active village boundary polygon(s) from database.")

        # Query addresses with coordinates
        qs = Address.objects.filter(
            location__isnull=False
        ).select_related('customer', 'region').order_by('id')

        if not force:
            # By default, process addresses missing either taluka or district or village check
            qs = qs.filter(taluka='', district='')

        total_available = qs.count()
        if limit:
            addresses = list(qs[:limit])
            self.stdout.write(f"Found {total_available} candidate address(es). Processing limited to {len(addresses)}.")
        else:
            addresses = list(qs)
            self.stdout.write(f"Found {len(addresses)} candidate address(es) to backfill.")

        if not addresses:
            self.stdout.write(self.style.SUCCESS("No addresses need backfilling."))
            return

        # Setup Nominatim session and in-memory coordinate cache
        # Nominatim policy requires: custom User-Agent, max 1 req/sec
        session = requests.Session()
        session.headers.update({
            'User-Agent': 'CircleAZ-Books3-Backfill/1.0 (contact: info@circleaz.in)'
        })

        osm_cache = {}  # key: (round(lat, 4), round(lon, 4)) -> { taluka, district, address_line }

        updated_count = 0
        village_matched_count = 0
        outside_village_count = 0
        osm_hits_count = 0
        osm_queries_count = 0

        self.stdout.write("\nStarting geocoding backfill...\n")

        for idx, addr in enumerate(addresses, 1):
            lat = addr.location.y
            lon = addr.location.x
            cache_key = (round(lat, 4), round(lon, 4))

            # 1. PostGIS Village Resolution (Strict Internal Authority)
            matched_region = None
            for r in regions:
                try:
                    if r.boundary.contains(addr.location):
                        matched_region = r
                        break
                except Exception as e:
                    self.stderr.write(f"Spatial error testing region {r.name}: {e}")

            if matched_region:
                resolved_village = matched_region.name
                village_matched_count += 1
            else:
                resolved_village = ""
                outside_village_count += 1

            # 2. OSM Nominatim Reverse Geocode (Taluka & District Authority)
            if cache_key in osm_cache:
                osm_data = osm_cache[cache_key]
                osm_hits_count += 1
            else:
                osm_data = {
                    'taluka': '',
                    'district': '',
                    'address_line': ''
                }
                try:
                    url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&zoom=18&addressdetails=1"
                    resp = session.get(url, timeout=10)
                    osm_queries_count += 1

                    if resp.status_code == 200:
                        data = resp.json()
                        addr_details = data.get('address', {})
                        
                        # Level 6: Taluka / County / Subdistrict / Tehsil
                        taluka = (
                            addr_details.get('county') or
                            addr_details.get('subdistrict') or
                            addr_details.get('tehsil') or
                            addr_details.get('taluk') or
                            ''
                        )
                        # Level 5: District / State District
                        district = (
                            addr_details.get('state_district') or
                            addr_details.get('district') or
                            ''
                        )
                        address_line = data.get('display_name', '')

                        osm_data = {
                            'taluka': taluka[:100],
                            'district': district[:100],
                            'address_line': address_line
                        }
                    else:
                        self.stderr.write(f"[{idx}/{len(addresses)}] Nominatim returned HTTP {resp.status_code} for ({lat}, {lon})")

                    # Rate-limiting compliance: sleep 1.1s between external Nominatim calls
                    time.sleep(1.1)

                except Exception as ex:
                    self.stderr.write(f"[{idx}/{len(addresses)}] Nominatim error for ({lat}, {lon}): {ex}")
                    time.sleep(1.1)

                osm_cache[cache_key] = osm_data

            # 3. Apply updates to address
            addr.region = matched_region
            addr.taluka = osm_data['taluka']
            addr.district = osm_data['district']
            if not addr.address_line and osm_data['address_line']:
                addr.address_line = osm_data['address_line']

            customer_name = addr.customer.full_name if addr.customer else "Unknown Customer"
            status_desc = f"Village: '{resolved_village or '[Outside]'}' | Taluka: '{addr.taluka}' | Dist: '{addr.district}'"

            if not dry_run:
                addr.save(update_fields=['region', 'taluka', 'district', 'address_line'])

            updated_count += 1
            self.stdout.write(
                f"[{idx}/{len(addresses)}] ID: {addr.id} | {customer_name[:22]:<22} | "
                f"({lat:.5f}, {lon:.5f}) -> {status_desc}"
            )

        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.SUCCESS(f"Backfill Complete!"))
        self.stdout.write(f"Total Processed:         {updated_count}")
        self.stdout.write(f"Inside Village Polygon:  {village_matched_count}")
        self.stdout.write(f"Outside Village Polygon: {outside_village_count}")
        self.stdout.write(f"OSM HTTP Queries Made:   {osm_queries_count}")
        self.stdout.write(f"OSM Cache Hits:          {osm_hits_count}")
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN completed. No database rows were changed."))
