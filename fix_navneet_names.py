"""
Strip 'Navneet ' and 'Navaneet ' prefixes from product names in products.json.
Also updates the local SQLite database to match.
"""
import json
import os
import sys
import re

# ── 1. Fix products.json ──
json_path = r"Z:\Navneet_Products\products.json"

with open(json_path, 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

PREFIXES = ['Navaneet ', 'Navneet ']  # Navaneet first (longer match wins)

changed = 0
for item in data:
    old_name = item['Name']
    for prefix in PREFIXES:
        if old_name.startswith(prefix):
            item['Name'] = old_name[len(prefix):]
            changed += 1
            break

with open(json_path, 'w', encoding='utf-8-sig') as f:
    json.dump(data, f, indent=4, ensure_ascii=False)

print(f"JSON: Stripped prefix from {changed}/{len(data)} names.")

# ── 2. Fix local SQLite database ──
sys.path.append(r"z:\books2")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "azbooks.settings")

import django
django.setup()

from inventory.models import Product

updated = 0
for product in Product.objects.filter(vendor__name="Atul"):
    old = product.name
    for prefix in PREFIXES:
        if old.startswith(prefix):
            product.name = old[len(prefix):]
            product.save(update_fields=['name'])
            updated += 1
            break

print(f"DB:   Updated {updated} product names in local database.")
