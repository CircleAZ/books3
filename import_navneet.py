import os
import sys

sys.path.append(r"z:\books2")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "azbooks.settings")

import django
django.setup()

import json
from django.core.files import File
from inventory.models import Product, Category, Vendor, ProductImage
from django.db import transaction

@transaction.atomic
def run_import():
    json_path = r"Z:\Navneet_Products\products.json"
    image_dir = r"Z:\Navneet_Products"
    
    with open(json_path, 'r', encoding='utf-8-sig') as f:
        data = json.load(f)
    
    vendor, _ = Vendor.objects.get_or_create(name="Atul")
    
    imported_count = 0
    skipped_count = 0

    for item in data:
        name = item.get("Name")
        class_val = item.get("Class")
        price = float(item.get("Price", 0))
        image_file = item.get("ImageFile")
        
        category_name = f"Nav_{class_val}"
        category, _ = Category.objects.get_or_create(name=category_name)
        
        cost_price = price * 0.7
        selling_price = price * 0.9
        
        product, created = Product.objects.get_or_create(
            name=name,
            category=category,
            vendor=vendor,
            defaults={
                'cost_price': cost_price,
                'selling_price': selling_price,
                'stock_quantity': 0,
                'low_stock_threshold': 0,
            }
        )
        
        if created:
            if image_file:
                img_path = os.path.join(image_dir, image_file)
                if os.path.exists(img_path):
                    with open(img_path, 'rb') as img_f:
                        pi = ProductImage(product=product, is_primary=True)
                        pi.image.save(image_file, File(img_f), save=True)
            imported_count += 1
            print(f"Imported item with Class: Nav_{class_val}")
        else:
            skipped_count += 1
            print(f"Skipped (already exists) with Class: Nav_{class_val}")

    print(f"\nImport complete! Imported: {imported_count}, Skipped: {skipped_count}")

if __name__ == '__main__':
    run_import()
