from customers.models import GeographicRegion, Address
from django.db import connection

expected = ['Krushnapur', 'Machhiwad', 'Choramalabhatha', 'Ranabhatha', 'Onjal', 'Kaniyet', 'Movasa', 'Bhat', 'Mendhar']

orphans = GeographicRegion.objects.exclude(name__in=expected)
orphan_count = orphans.count()

# Step 1: Nullify the 2 address FK references to orphan regions
nullified = Address.objects.filter(region__in=orphans).update(region=None)
print(f"Step 1: Nullified {nullified} address FK references to orphan regions")

# Step 2: Hard-delete (not soft-delete) all 603 orphan records
# We use _raw_delete via the queryset's internal delete to bypass SoftDeleteModel
with connection.cursor() as cursor:
    orphan_ids = list(orphans.values_list('id', flat=True))
    if orphan_ids:
        # Format UUIDs for SQL IN clause
        id_list = ",".join([f"'{str(uid)}'" for uid in orphan_ids])
        cursor.execute(f"DELETE FROM customers_geographicregion WHERE id IN ({id_list})")
        print(f"Step 2: Hard-deleted {cursor.rowcount} orphan GeographicRegion records")

# Step 3: Verify
remaining = GeographicRegion.objects.count()
print(f"Step 3: Verification — {remaining} records remain in DB")
for r in GeographicRegion.objects.all().order_by('name'):
    has_b = 'YES' if r.boundary else 'NO'
    print(f"  {r.name} | {r.layer} | boundary={has_b}")
