import os
import django
import sys
import pandas as pd
from collections import defaultdict

# Setup Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/..")
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
try:
    django.setup()
except Exception as e:
    print(f"Failed to setup django: {e}")
    sys.exit(1)

from orders.models import Order, OrderItem
from customers.models import Address

addresses = Address.objects.filter(
    region__name__icontains='Machhiwad'
) | Address.objects.filter(
    address_line__icontains='Machhiwad'
) | Address.objects.filter(
    faliya__icontains='Machhiwad'
) | Address.objects.filter(
    landmark__icontains='Machhiwad'
)

customer_ids = addresses.values_list('customer_id', flat=True).distinct()
print(f"Found {len(customer_ids)} customers in Machhiwad.")

orders = Order.objects.filter(
    customer_id__in=customer_ids
).exclude(order_status='cancelled').prefetch_related(
    'items__product',
    'items__delivery_items',
    'items__return_items__return_request'
)

print(f"Found {orders.count()} non-cancelled orders.")

agg = defaultdict(lambda: {'ordered': 0, 'delivered': 0, 'returned': 0, 'remaining': 0})

for order in orders:
    for item in order.items.all():
        product_name = item.product.name
        agg[product_name]['ordered'] += item.quantity
        agg[product_name]['delivered'] += item.delivered_quantity
        agg[product_name]['returned'] += item.returned_quantity
        agg[product_name]['remaining'] += item.remaining_quantity

data = []
for name, stats in agg.items():
    data.append({
        'Item': name,
        'Total Ordered': stats['ordered'],
        'Delivered': stats['delivered'],
        'Returned': stats['returned'],
        'Remaining': stats['remaining']
    })

# sort by name
data.sort(key=lambda x: x['Item'])

df = pd.DataFrame(data)
output_path = r"z:\books2\Plan\Delivery_transport\Machhiwad_All_Orders_Aggregated.xlsx"
os.makedirs(os.path.dirname(output_path), exist_ok=True)
df.to_excel(output_path, index=False)

print(f"\nSaved to {output_path}\n")
print(df.to_markdown(index=False))
