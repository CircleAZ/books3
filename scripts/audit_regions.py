"""Audit current region assignments and test spatial containment."""
import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'books2.settings')
django.setup()

from customers.models import Address, GeographicRegion
from django.db.models import Count

# Count addresses with location
total_with_loc = Address.objects.filter(is_primary=True, location__isnull=False).count()
print(f"Primary addresses with GPS: {total_with_loc}")

# Count boundaries
boundaries = GeographicRegion.objects.filter(layer='village', boundary__isnull=False)
print(f"Villages with boundaries: {boundaries.count()}")
for b in boundaries:
    print(f"  - {b.name}")

# Current region distribution
regions = Address.objects.filter(
    is_primary=True, location__isnull=False, region__isnull=False
).values('region__name', 'region__layer').annotate(c=Count('id')).order_by('-c')
print(f"\nCurrent region assignments:")
for r in regions:
    print(f"  {r['region__name']} ({r['region__layer']}): {r['c']}")

no_region = Address.objects.filter(is_primary=True, location__isnull=False, region__isnull=True).count()
print(f"  (no region): {no_region}")

# Test spatial containment: how many addresses fall inside each boundary?
print(f"\n--- Spatial containment test ---")
addresses_with_loc = Address.objects.filter(is_primary=True, location__isnull=False)
for region in boundaries:
    contained = addresses_with_loc.filter(location__within=region.boundary).count()
    print(f"  {region.name}: {contained} addresses fall inside")

# Check for addresses that fall in NO boundary
from django.db.models import Q
outside_all = addresses_with_loc
for region in boundaries:
    outside_all = outside_all.exclude(location__within=region.boundary)
print(f"\n  Outside all boundaries: {outside_all.count()}")
