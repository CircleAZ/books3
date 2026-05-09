"""Rename GeographicRegion records to match updated JSON names."""
from customers.models import GeographicRegion
import json

data = json.load(open(r'z:\books2\data\layered_geocoding_data.json'))
json_entries = [e for e in data if e.get('layer') == 'village' and e.get('boundary')]
db_regions = list(GeographicRegion.objects.filter(layer='village', boundary__isnull=False))

print(f"DB records: {len(db_regions)}, JSON entries: {len(json_entries)}")

# Build a fuzzy match: compare first 5 chars lowercase
for r in db_regions:
    for jdata in json_entries:
        r_prefix = r.name.lower().replace(' village', '').replace(' ', '')[:6]
        j_prefix = jdata['name'].lower().replace(' village', '').replace(' ', '')[:6]
        if r_prefix == j_prefix:
            if r.name != jdata['name'] or r.label != jdata['label']:
                print(f"  RENAME: '{r.name}' -> '{jdata['name']}' (label: '{jdata['label']}')")
                r.name = jdata['name']
                r.label = jdata['label']
                r.save(update_fields=['name', 'label'])
            else:
                print(f"  OK: '{r.name}' (no change needed)")
            break
    else:
        print(f"  NO MATCH: '{r.name}'")

print("\nDone. Current names in DB:")
for r in GeographicRegion.objects.filter(layer='village', boundary__isnull=False).order_by('name'):
    print(f"  - {r.name}")
