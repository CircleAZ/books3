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
    delivery_status__in=['pending', 'partial']
).exclude(order_status='cancelled')

print(f"\n--- 1. Undelivered Products for Machhiwad ---")
print(f"Found {pending_orders.count()} pending/partial orders.")

undelivered_products = {}
for order in pending_orders:
    for item in order.items.all():
        remaining = item.remaining_quantity
        if remaining > 0:
            pid = item.product.id
            if pid not in undelivered_products:
                undelivered_products[pid] = {
                    'name': item.product.name,
                    'qty': 0,
                    'physical_stock': item.product.physical_stock,
                    'available_stock': item.product.stock_quantity
                }
            undelivered_products[pid]['qty'] += remaining

df_owed = pd.DataFrame([
    {
        'Product': data['name'], 
        'Owed Quantity': data['qty'],
        'Physical Stock': data['physical_stock'],
        'Available Stock': data['available_stock']
    }
    for pid, data in undelivered_products.items()
])

# 2. Products from Machhiwad delivered in the last 2 days (from 10/05/2026).
target_date = datetime(2026, 5, 10)
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
            'qty': 0,
            'physical_stock': item.order_item.product.physical_stock,
            'available_stock': item.order_item.product.stock_quantity
        }
    delivered_products[pid]['qty'] += item.quantity

df_delivered = pd.DataFrame([
    {
        'Product': data['name'], 
        'Recently Delivered': data['qty'],
        'Physical Stock': data['physical_stock'],
        'Available Stock': data['available_stock']
    }
    for pid, data in delivered_products.items()
])

# 3. Merge and save
try:
    if df_owed.empty and df_delivered.empty:
        print("No data found to save.")
    else:
        if df_owed.empty:
            merged = df_delivered
        elif df_delivered.empty:
            merged = df_owed
        else:
            # Full outer join on Product, Physical Stock, Available Stock
            merged = pd.merge(
                df_owed, 
                df_delivered, 
                on=['Product', 'Physical Stock', 'Available Stock'], 
                how='outer'
            ).fillna(0)
            
        # Reorder columns to match SQL output
        for col in ['Owed Quantity', 'Recently Delivered']:
            if col not in merged.columns:
                merged[col] = 0
                
        merged = merged[['Product', 'Owed Quantity', 'Recently Delivered', 'Physical Stock', 'Available Stock']]
        
        # Save the result
        excel_path = r"z:\books2\Plan\Delivery_transport\Machhiwad_Extraction_Result_12May.xlsx"
        os.makedirs(os.path.dirname(excel_path), exist_ok=True)
        
        with pd.ExcelWriter(excel_path) as writer:
            merged.to_excel(writer, sheet_name='Machhiwad', index=False)
        
        print(f"Success! Data saved to {excel_path}")
    
except Exception as e:
    print(f"Error processing: {e}")

