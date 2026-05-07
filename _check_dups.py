from inventory.models import Product
from django.db.models import Count
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

dups = Product.objects.filter(is_deleted=False).values('name').annotate(count=Count('id')).filter(count__gt=1)
print(f'Total duplicate names: {dups.count()}')
for d in dups:
    print(f"{d['name']}: {d['count']} duplicates")
