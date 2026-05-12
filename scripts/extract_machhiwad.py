import os
import sys
import csv
import django
from datetime import datetime
from zoneinfo import ZoneInfo

# Add project root to python path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

from orders.models import OrderItem, DeliveryItem
from inventory.models import Product

def run_extraction():
    items_owed = OrderItem.objects.filter(
        order__customer__addresses__region__name__iexact='Machhiwad',
        order__delivery_status__in=['pending', 'partial']
    )
    
    product_owed_map = {}
    for item in items_owed:
        rem = item.remaining_quantity
        if rem > 0:
            if item.product_id not in product_owed_map:
                product_owed_map[item.product_id] = {
                    'name': item.product.name,
                    'owed': 0,
                    'recently_delivered': 0,
                    'physical_stock': item.product.physical_stock,
                    'available_stock': item.product.stock_quantity,
                }
            product_owed_map[item.product_id]['owed'] += rem
            
    tz = ZoneInfo('Asia/Kolkata')
    dt_start = datetime(2026, 5, 10, 0, 0, 0, tzinfo=tz)
    
    recent_deliveries = DeliveryItem.objects.filter(
        delivery__order__customer__addresses__region__name__iexact='Machhiwad',
        delivery__created_at__gte=dt_start
    )
    
    for d_item in recent_deliveries:
        prod = d_item.order_item.product
        if prod.id not in product_owed_map:
            product_owed_map[prod.id] = {
                'name': prod.name,
                'owed': 0,
                'recently_delivered': 0,
                'physical_stock': prod.physical_stock,
                'available_stock': prod.stock_quantity,
            }
        product_owed_map[prod.id]['recently_delivered'] += d_item.quantity

    output_path = r'Z:\books2\Plan\Delivery_transport\Machhiwad_Extraction.csv'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['Product', 'Owed Quantity', 'Recently Delivered (Since 10/05)', 'Physical Stock', 'Available Stock'])
        for pid, info in product_owed_map.items():
            writer.writerow([
                info['name'],
                info['owed'],
                info['recently_delivered'],
                info['physical_stock'],
                info['available_stock']
            ])
            
    print(f"CSV Extraction complete. File saved to: {output_path}")

if __name__ == '__main__':
    run_extraction()
