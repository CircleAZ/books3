# Step 3 of 3: Drop legacy columns.
# Only runs AFTER data migration (0007) has safely copied all data to new fields.
# This is the point of no return — the old columns are removed.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0007_migrate_spatial_data'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    "ALTER TABLE customers_address DROP COLUMN IF EXISTS latitude;",
                    reverse_sql=migrations.RunSQL.noop
                ),
                migrations.RunSQL(
                    "ALTER TABLE customers_address DROP COLUMN IF EXISTS longitude;",
                    reverse_sql=migrations.RunSQL.noop
                ),
                migrations.RunSQL(
                    "ALTER TABLE customers_address DROP COLUMN IF EXISTS village;",
                    reverse_sql=migrations.RunSQL.noop
                ),
                migrations.RunSQL(
                    "ALTER TABLE customers_targetvillage DROP COLUMN IF EXISTS latitude;",
                    reverse_sql=migrations.RunSQL.noop
                ),
                migrations.RunSQL(
                    "ALTER TABLE customers_targetvillage DROP COLUMN IF EXISTS longitude;",
                    reverse_sql=migrations.RunSQL.noop
                ),
            ],
            state_operations=[
                migrations.RemoveField(model_name='address', name='latitude'),
                migrations.RemoveField(model_name='address', name='longitude'),
                migrations.RemoveField(model_name='address', name='village'),
                migrations.RemoveField(model_name='targetvillage', name='latitude'),
                migrations.RemoveField(model_name='targetvillage', name='longitude'),
            ]
        )
    ]
