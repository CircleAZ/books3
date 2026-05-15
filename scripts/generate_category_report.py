import os
import sys

# Set up Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')

import django
django.setup()

import pandas as pd
from django.db.models import Q
from orders.models import OrderItem, Order

def generate_report():
    query = Q(product__category__name__icontains='nav') | \
            Q(product__category__name__icontains='textbook') | \
            Q(product__category__name__icontains='publication')

    order_items = OrderItem.objects.filter(
        order__delivery_status__in=['pending', 'partial'],
        order__is_deleted=False
    ).filter(query).select_related('order__customer', 'product__category')

    data = []
    for item in order_items:
        order = item.order
        customer = order.customer
        
        if customer:
            parts = [customer.first_name, customer.middle_name, customer.last_name]
            customer_name = " ".join([p for p in parts if p]).strip()
            contact_number = customer.phone or ''
        else:
            customer_name = order.guest_name or 'Guest'
            contact_number = order.guest_phone or ''
        
        url = f"https://books.circleaz.in/orders/{order.id}"
        hyperlink = f'=HYPERLINK("{url}", "{order.display_id}")'
        
        data.append({
            'Customer Name': customer_name,
            'Contact Number': contact_number,
            'Order ID': hyperlink,
            'Product Name': item.product.name,
            'Category': item.product.category.name if item.product.category else ''
        })

    df = pd.DataFrame(data)
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Pending_Nav_Textbook_Orders.xlsx')
    df.to_excel(output_path, index=False)
    print(f"Report generated successfully: {output_path}")

if __name__ == '__main__':
    generate_report()
