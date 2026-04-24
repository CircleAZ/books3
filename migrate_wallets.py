import os
import django
from decimal import Decimal

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import transaction
from orders.models import Order, Refund
from customers.models import Customer, Wallet
from django.contrib.auth import get_user_model

User = get_user_model()

def run_migration():
    # We can assume a system user or first admin
    system_user = User.objects.filter(is_superuser=True).first()
    
    overpaid_orders = Order.objects.filter(payment_status='overpaid')
    
    print(f"Found {overpaid_orders.count()} overpaid orders to sweep.")
    count = 0
    with transaction.atomic():
        for order in overpaid_orders:
            change = order.change_due
            if change > 0:
                print(f"Sweeping {change} from Order #{order.display_id}")
                if order.is_guest:
                    cust = Customer.objects.create(
                        first_name=order.guest_name or f"Guest {order.id}",
                        phone=order.guest_phone or f"0000000000{order.id}"[:15],
                        notes="Auto-converted from guest for wallet overpayment migration"
                    )
                    order.customer = cust
                    order.is_guest = False
                    order.save(update_fields=['customer', 'is_guest'])
                
                customer = order.customer
                wallet, _ = Wallet.objects.get_or_create(customer=customer)
                
                wallet.credit(change, f"Swept overpayment from Order #{order.display_id}", user=system_user)
                
                Refund.objects.create(
                    order=order,
                    amount=change,
                    method='Wallet Transfer',
                    status='completed',
                    created_by=system_user
                )
                
                order.update_payment_status()
                count += 1
                
    print(f"Successfully swept overpayments into wallets for {count} orders.")

if __name__ == "__main__":
    run_migration()
