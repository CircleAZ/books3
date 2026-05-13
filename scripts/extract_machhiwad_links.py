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

target_display_ids = [
    "1218", "1250", "1239", "1003", "1240", "1251", "1249", "1242", 
    "1254", "1253", "1059", "1257", "1032", "1060", "1244", "1252", "1256"
]

orders = Order.objects.filter(display_id__in=target_display_ids).select_related('customer')

data = []

for order in orders:
    customer_name = order.customer.full_name if order.customer else order.guest_name
    dashboard_link = f"https://books.circleaz.in/orders/{order.id}"
    receipt_link = f"https://books.circleaz.in/r/{order.receipt_uuid}"
    
    data.append({
        'Order ID': order.display_id,
        'Customer': customer_name,
        'Dashboard Link': dashboard_link,
        'Receipt Link': receipt_link
    })

# Sort by Order ID as provided in the list is probably not necessary, but sorting by numeric ID makes sense
data.sort(key=lambda x: int(x['Order ID']))

df = pd.DataFrame(data)
output_path = r"z:\books2\Plan\Delivery_transport\Machhiwad_Order_Links.xlsx"
os.makedirs(os.path.dirname(output_path), exist_ok=True)
df.to_excel(output_path, index=False)

csv_path = r"C:\Users\mukun\.gemini\antigravity\brain\75a5ce31-7737-4c07-a9b7-bf04093c3f27\machhiwad_links.csv"
df.to_csv(csv_path, index=False, encoding='utf-8')

print(f"\nSaved links to {output_path}")
