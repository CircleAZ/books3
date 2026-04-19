import os, django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "azbooks.settings")
django.setup()

from inventory.models import Product
for p in Product.objects.all().order_by('-created_at')[:2]:
    print(f"Product: {p.name}")
    for img in p.images.all():
        print(f"  Image URL: {img.image.url}")
