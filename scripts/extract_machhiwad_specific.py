import os
import django
import sys
import pandas as pd

# Setup Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/..")
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
try:
    django.setup()
except Exception as e:
    print(f"Failed to setup django: {e}")
    sys.exit(1)

from orders.models import Order
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

orders = Order.objects.filter(
    customer_id__in=customer_ids
).exclude(order_status='cancelled').prefetch_related(
    'customer',
    'items__product',
    'items__delivery_items'
)

target_items = [
    "200 S",
    "200 S [box]",
    "A4 120",
    "A4 176",
    "B5 172 [4 line]",
    "Cover single piece",
    "Eraser Apsara",
    "Pencil Apsara Platinum",
    "Pencil Colour",
    "Pouch (9056)",
    "Saino Misti",
    "Sharpener",
    "Water Colour",
    "Wood Board",
    "XO"
]

data = []

for order in orders:
    customer_name = order.customer.full_name if order.customer else order.guest_name
    phone = order.customer.phone if order.customer else order.guest_phone
    
    for item in order.items.all():
        if item.product.name in target_items:
            remaining = item.remaining_quantity
            if remaining > 0:
                data.append({
                    'Order ID': order.display_id,
                    'Customer': customer_name,
                    'Phone': phone,
                    'Item': item.product.name,
                    'Ordered': item.quantity,
                    'Delivered': item.delivered_quantity,
                    'Remaining': remaining
                })

# sort by Customer, then Order ID
data.sort(key=lambda x: (x['Customer'], x['Order ID'], x['Item']))

df = pd.DataFrame(data)
output_path = r"z:\books2\Plan\Delivery_transport\Machhiwad_Specific_Items_Remaining.xlsx"
os.makedirs(os.path.dirname(output_path), exist_ok=True)
df.to_excel(output_path, index=False)

csv_path = r"C:\Users\mukun\.gemini\antigravity\brain\75a5ce31-7737-4c07-a9b7-bf04093c3f27\machhiwad_specific.csv"
df.to_csv(csv_path, index=False, encoding='utf-8')

print(f"\nSaved to {output_path}")
