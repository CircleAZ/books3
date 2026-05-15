import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')

import django
django.setup()

import pandas as pd
from orders.models import OrderItem

def generate_owed_report():
    # Pre-fetch delivery items to prevent N+1 DB queries across remote connection
    order_items = OrderItem.objects.filter(
        order__delivery_status__in=['pending', 'partial'],
        order__is_deleted=False
    ).select_related('product').prefetch_related('delivery_items')

    product_owed = {}
    
    for item in order_items:
        owed = item.remaining_quantity
        if owed > 0:
            product_name = item.product.name
            if product_name in product_owed:
                product_owed[product_name] += owed
            else:
                product_owed[product_name] = owed
                
    # Convert to flat data structure
    data = [{'Product Name': name, 'Owed Qty': qty} for name, qty in product_owed.items()]
    
    df = pd.DataFrame(data)
    
    if not df.empty:
        # Sort alphabetically by product name for readability
        df = df.sort_values(by='Product Name')
        
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Owed_Quantity_Report.xlsx')
    df.to_excel(output_path, index=False)
    print(f"Report generated successfully: {output_path}")

if __name__ == '__main__':
    generate_owed_report()
