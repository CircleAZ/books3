from django.db import migrations

def drop_maps_columns(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        # SQLite way to drop columns safely, or PostgreSQL.
        # We will wrap in try/except because they might not exist on fresh installs.
        columns_to_drop = [
            'maps_directions_key',
            'maps_geocode_key',
            'maps_js_key'
        ]
        for col in columns_to_drop:
            try:
                # PostgreSQL / SQLite 3.35+ supports DROP COLUMN
                cursor.execute(f"ALTER TABLE account_user DROP COLUMN IF EXISTS {col}")
            except Exception as e:
                # Ignore if column doesn't exist
                pass

class Migration(migrations.Migration):

    dependencies = [
        ('account', '0005_alter_emailotp_purpose'),
    ]

    operations = [
        migrations.RunPython(drop_maps_columns, reverse_code=migrations.RunPython.noop),
    ]
