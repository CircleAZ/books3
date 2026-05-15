import os
import django
from collections import defaultdict

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

from inventory.models import Product
from orders.models import OrderItem

print("Fetching data...")
order_items = OrderItem.objects.filter(
    order__order_status__in=['confirmed', 'completed']
).prefetch_related('delivery_items')

owed_by_product = defaultdict(int)
delivered_by_product = defaultdict(int)

for oi in order_items:
    base = oi.confirmed_quantity if oi.confirmed_quantity is not None else oi.quantity
    deliv = sum(di.quantity for di in oi.delivery_items.all())
    
    pid = oi.product_id
    delivered_by_product[pid] += deliv
    owed_by_product[pid] += max(0, base - deliv)

products = Product.objects.filter(is_deleted=False).order_by('name')

with open('product_report.md', 'w', encoding='utf-8') as f:
    f.write("| Product Name | Available Qty | Physical Qty | Owed | Delivered |\n")
    f.write("| :--- | :--- | :--- | :--- | :--- |\n")
    
    for p in products:
        owed = owed_by_product.get(p.id, 0)
        delivered = delivered_by_product.get(p.id, 0)
        f.write(f"| {p.name} | {p.stock_quantity} | {p.physical_stock} | {owed} | {delivered} |\n")
print("Done!")
