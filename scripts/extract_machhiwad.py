import os
import django
import sys
from datetime import datetime, timedelta

# Setup Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/..")
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
try:
    django.setup()
except Exception as e:
    print(f"Failed to setup django: {e}")
    sys.exit(1)

from orders.models import Order, OrderItem, DeliveryItem
from customers.models import Address
from inventory.models import Product
from django.db.models import Sum, F
from django.utils import timezone
import pandas as pd

# We need to find "Machhiwad" orders.
# Let's search Address models where region name contains Machhiwad, or address_line contains it.
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

# 1. Retrieve all orders from Machhiwad with delivery status pending or partially delivered
# and retrieve products that are not delivered.
pending_orders = Order.objects.filter(
    customer_id__in=customer_ids,
    delivery_status__in=['pending', 'partially_delivered'],
    order_status__in=['draft', 'confirmed', 'completed'] # Make sure they are active
)

print(f"\n--- 1. Undelivered Products for Machhiwad ---")
print(f"Found {pending_orders.count()} pending/partially_delivered orders.")

undelivered_products = {}
for order in pending_orders:
    for item in order.items.all():
        remaining = item.quantity - item.delivered_quantity
        if remaining > 0:
            pid = item.product.id
            if pid not in undelivered_products:
                undelivered_products[pid] = {
                    'name': item.product.name,
                    'qty': 0
                }
            undelivered_products[pid]['qty'] += remaining

# Convert to DataFrame for easy display/merging
df_undelivered = pd.DataFrame([
    {'Product': data['name'], 'Required Qty': data['qty']}
    for pid, data in undelivered_products.items()
])

# 2. Products from Machhiwad delivered in the last 2 days (from 10/05/2026).
# Let's check DeliveryItem for these orders.
target_date = datetime(2026, 5, 10)
# Make timezone aware if needed, but for simplicity we can just filter by created_at or delivered_at
target_date_tz = timezone.make_aware(target_date, timezone.get_current_timezone())

delivered_items = DeliveryItem.objects.filter(
    order_item__order__customer_id__in=customer_ids,
    delivery__created_at__gte=target_date_tz
)

print(f"\n--- 2. Products Delivered in Machhiwad since {target_date.strftime('%Y-%m-%d')} ---")
delivered_products = {}
for item in delivered_items:
    pid = item.order_item.product.id
    if pid not in delivered_products:
        delivered_products[pid] = {
            'name': item.order_item.product.name,
            'qty': 0
        }
    delivered_products[pid]['qty'] += item.quantity

df_delivered = pd.DataFrame([
    {'Product': data['name'], 'Delivered Qty': data['qty']}
    for pid, data in delivered_products.items()
])

# 3. Read the Excel file "Machhiwad Sheet" and compare
excel_path = r"z:\books2\Plan\Delivery_transport\Village_Transport_Manifest_Combined.xlsx"

try:
    df_excel = pd.read_excel(excel_path, sheet_name='Machhiwad')
    
    # Merge all 3 datasets on "Product" name (assuming name matches roughly)
    if 'Product Name' in df_excel.columns:
        product_col = 'Product Name'
    elif 'Product' in df_excel.columns:
        product_col = 'Product'
    else:
        product_col = df_excel.columns[0]
        
    df_excel.rename(columns={product_col: 'Product'}, inplace=True)
    
    # Merge
    merged = pd.merge(df_undelivered, df_delivered, on='Product', how='outer').fillna(0)
    merged = pd.merge(merged, df_excel, on='Product', how='outer').fillna(0)
    
    # Save the result
    out_path = os.path.join(os.path.dirname(excel_path), 'Machhiwad_Extraction_Result.xlsx')
    with pd.ExcelWriter(out_path) as writer:
        df_undelivered.to_excel(writer, sheet_name='Pending', index=False)
        df_delivered.to_excel(writer, sheet_name='Delivered Last 2 Days', index=False)
        merged.to_excel(writer, sheet_name='Comparison', index=False)
    
    print(f"Success! Data saved to {out_path}")
    
except Exception as e:
    print(f"Error processing: {e}")

