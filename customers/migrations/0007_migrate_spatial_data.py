# Step 2 of 3: Data migration.
# Copies latitude/longitude → PostGIS PointField, and village text → region FK.
# This is the critical bridge that preserves all existing production data.

from django.db import migrations


def migrate_spatial_data(apps, schema_editor):
    """
    Forward: Copy legacy lat/lng/village fields into new PostGIS fields.
    Runs in a single pass per table for efficiency.
    """
    from django.contrib.gis.geos import Point

    Address = apps.get_model('customers', 'Address')
    TargetVillage = apps.get_model('customers', 'TargetVillage')
    GeographicRegion = apps.get_model('customers', 'GeographicRegion')

    # ── Migrate Address lat/lng → PointField ──
    migrated = 0
    for addr in Address.objects.all().iterator(chunk_size=500):
        changed = False

        # Copy lat/lng to PointField (only if location is not already set)
        if not addr.location and addr.latitude and addr.longitude:
            try:
                lat = float(addr.latitude)
                lng = float(addr.longitude)
                if lat != 0.0 or lng != 0.0:
                    addr.location = Point(lng, lat, srid=4326)
                    changed = True
            except (ValueError, TypeError):
                pass

        # Match village text to GeographicRegion FK
        if not addr.region and hasattr(addr, 'village') and addr.village:
            village_name = addr.village.strip()
            if village_name:
                region = GeographicRegion.objects.filter(
                    name__iexact=village_name
                ).first()
                if region:
                    addr.region = region
                    changed = True

        if changed:
            addr.save(update_fields=[
                f for f in ['location', 'region']
                if getattr(addr, f) is not None
            ])
            migrated += 1

    print(f'  → Migrated {migrated} addresses to PostGIS fields.')

    # ── Migrate TargetVillage lat/lng → PointField ──
    tv_migrated = 0
    for tv in TargetVillage.objects.all().iterator(chunk_size=100):
        if not tv.location and tv.latitude and tv.longitude:
            try:
                lat = float(tv.latitude)
                lng = float(tv.longitude)
                if lat != 0.0 or lng != 0.0:
                    tv.location = Point(lng, lat, srid=4326)
                    tv.save(update_fields=['location'])
                    tv_migrated += 1
            except (ValueError, TypeError):
                pass

    print(f'  → Migrated {tv_migrated} target villages to PostGIS fields.')


def reverse_spatial_data(apps, schema_editor):
    """
    Reverse: Copy PointField data back to legacy decimal fields.
    This ensures the migration is safely reversible.
    """
    Address = apps.get_model('customers', 'Address')
    TargetVillage = apps.get_model('customers', 'TargetVillage')
    GeographicRegion = apps.get_model('customers', 'GeographicRegion')

    for addr in Address.objects.filter(location__isnull=False).iterator(chunk_size=500):
        addr.latitude = addr.location.y
        addr.longitude = addr.location.x
        if addr.region and not addr.village:
            addr.village = addr.region.name
        addr.save(update_fields=['latitude', 'longitude', 'village'])

    for tv in TargetVillage.objects.filter(location__isnull=False).iterator(chunk_size=100):
        tv.latitude = tv.location.y
        tv.longitude = tv.location.x
        tv.save(update_fields=['latitude', 'longitude'])


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0006_add_spatial_fields'),
    ]

    operations = [
        migrations.RunPython(
            migrate_spatial_data,
            reverse_spatial_data,
            hints={'model_name': 'address'},
        ),
    ]
