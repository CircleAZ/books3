import os
import django
import sys
import pandas as pd
from collections import defaultdict

# Setup Django Environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/..")
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
try:
    django.setup()
except Exception as e:
    print(f"Failed to setup django: {e}")
    sys.exit(1)

from orders.models import Order
from customers.models import Address

def extract_movasa_owed_quantities():
    print("Initiating Movasa extraction...")
    
    # 1. Identify Movasa Customers
    addresses = Address.objects.filter(
        region__name__icontains='Movasa'
    ) | Address.objects.filter(
        address_line__icontains='Movasa'
    ) | Address.objects.filter(
        faliya__icontains='Movasa'
    ) | Address.objects.filter(
        landmark__icontains='Movasa'
    )

    customer_ids = addresses.values_list('customer_id', flat=True).distinct()
    print(f"Located {len(customer_ids)} customers linked to Movasa.")

    # 2. Retrieve Active/Pending Orders (Vex & Kael Consensus)
    # Exclude cancelled/completed, ensure delivery is pending or partial.
    orders = Order.objects.filter(
        customer_id__in=customer_ids,
        delivery_status__in=['pending', 'partial']
    ).exclude(
        order_status__in=['cancelled', 'completed']
    ).prefetch_related(
        'items__product',
        'items__delivery_items'
    )
    
    print(f"Retrieved {orders.count()} active/pending orders.")

    # 3. Aggregate Owed Quantities
    owed_aggregates = defaultdict(int)
    
    for order in orders:
        for item in order.items.all():
            remaining = item.remaining_quantity
            if remaining > 0:
                owed_aggregates[item.product.name] += remaining

    # 4. Format Data
    data = [
        {'Product': product_name, 'Total Owed Quantity': qty}
        for product_name, qty in owed_aggregates.items()
    ]
    
    # Sort alphabetically by product name
    data.sort(key=lambda x: x['Product'])

    if not data:
        print("No pending products owed for Movasa.")
        return

    # 5. Export to Excel
    df = pd.DataFrame(data)
    output_path = r"z:\books2\Plan\Delivery_transport\Movasa_Owed_Quantities.xlsx"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_excel(output_path, index=False)
    
    print(f"SUCCESS: Data strictly exported to {output_path}")

if __name__ == '__main__':
    extract_movasa_owed_quantities()
