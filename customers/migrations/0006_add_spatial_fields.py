# Step 1 of 3: Non-destructive schema additions.
# Creates GeographicRegion table and adds new spatial fields alongside
# the old latitude/longitude/village columns. No data is lost.

import django.contrib.gis.db.models.fields
import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0005_alter_customer_options_alter_targetvillage_options'),
    ]

    operations = [
        # ── Create GeographicRegion table ──
        migrations.CreateModel(
            name='GeographicRegion',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, help_text='Unique identifier for this record', primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200)),
                ('label', models.CharField(max_length=200)),
                ('layer', models.CharField(choices=[('district', 'District'), ('taluka', 'Taluka'), ('village', 'Village')], max_length=20)),
                ('pincode', models.CharField(blank=True, max_length=10)),
                ('color', models.CharField(blank=True, max_length=10)),
                ('boundary', django.contrib.gis.db.models.fields.MultiPolygonField(blank=True, null=True, srid=4326)),
                ('center', django.contrib.gis.db.models.fields.PointField(blank=True, null=True, srid=4326)),
                ('parent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='children', to='customers.geographicregion')),
            ],
            options={
                'ordering': ['layer', 'name'],
            },
        ),

        # ── ADD new spatial fields to Address (old columns preserved) ──
        migrations.AddField(
            model_name='address',
            name='location',
            field=django.contrib.gis.db.models.fields.PointField(blank=True, null=True, srid=4326),
        ),
        migrations.AddField(
            model_name='address',
            name='region',
            field=models.ForeignKey(blank=True, help_text='Strictly normalized village/taluka layer', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='addresses', to='customers.geographicregion'),
        ),

        # ── ADD new spatial field to TargetVillage (old columns preserved) ──
        migrations.AddField(
            model_name='targetvillage',
            name='location',
            field=django.contrib.gis.db.models.fields.PointField(blank=True, null=True, srid=4326),
        ),

        # ── Update faliya help text ──
        migrations.AlterField(
            model_name='address',
            name='faliya',
            field=models.CharField(blank=True, help_text='Sub-locality within a village (manual entry)', max_length=200),
        ),
    ]
