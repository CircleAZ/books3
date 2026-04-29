# Generated manually to load OSM data into production via Render deploy

from django.db import migrations
import json
import os

def load_osm_data(apps, schema_editor):
    GeographicRegion = apps.get_model('customers', 'GeographicRegion')
    
    # Path to the JSON file
    file_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'production_osm_geodata.json')
    
    if not os.path.exists(file_path):
        print(f"Warning: Data file not found at {file_path}. Skipping data load.")
        return
        
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    for item in data:
        name = item.get('name', 'Unknown')
        label = item.get('label', '')
        layer = item.get('layer', 'village')
        pincode = item.get('pincode', '')
        color = item.get('color', '')

        # We must use filter and update because we cannot use update_or_create 
        # cleanly with the historical models from apps.get_model if there are duplicates
        regions = GeographicRegion.objects.filter(name=name, layer=layer).order_by('id')
        if regions.exists():
            # Update the first one, delete the rest if duplicates exist
            region = regions.first()
            region.label = label
            region.pincode = pincode
            region.color = color
            region.save()
            
            for dup in regions[1:]:
                dup.delete()
        else:
            # Create
            GeographicRegion.objects.create(
                name=name,
                layer=layer,
                label=label,
                pincode=pincode,
                color=color
            )

def reverse_load(apps, schema_editor):
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0008_drop_legacy_spatial_fields'),
    ]

    operations = [
        migrations.RunPython(load_osm_data, reverse_load),
    ]
