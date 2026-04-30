import sys
from orders.models import Order

order_ids = [1023, 1020, 1014, 1012, 1046, 1048, 1036, 1037, 1011, 1016]

for oid in order_ids:
    try:
        o = Order.objects.get(display_id=oid)
        items = list(o.items.all())
        payments = list(o.payments.all())
        customer_name = o.customer.full_name if o.customer else "Guest"
        print(f"Order {oid} ({customer_name}): Status={o.order_status}, Items={len(items)}, Payments={len(payments)}, Total={o.total}, Paid={o.amount_paid}")
        for i in items:
            print(f"  - Item: {i.product.name} x {i.quantity} (Confirmed: {i.confirmed_quantity})")
    except Exception as e:
        print(f"Order {oid}: Not found or error ({e})")
