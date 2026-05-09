import os
import django
import sys

sys.path.append(r'z:\books2')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "azbooks.settings")
django.setup()

from orders.models import Refund
from customers.models import WalletTransaction
from django.db import transaction

@transaction.atomic
def reverse_ghost():
    try:
        refund = Refund.objects.get(id='a2c8b8ff-472e-4764-9c9c-5f7fcf26d65f')
        wt = WalletTransaction.objects.get(id='ed9c221b-94d2-4a2d-912b-9e8a9b6979de')
        wallet = wt.wallet
        
        # 1. Deduct amount from wallet
        wallet.balance -= wt.amount
        wallet.save()
        print(f"Deducted {wt.amount} from {wallet.customer.full_name}'s wallet. New balance: {wallet.balance}")
        
        # 2. Delete the wallet transaction
        wt.delete()
        print("Deleted WalletTransaction.")
        
        # 3. Delete the Refund record
        order = refund.order
        refund.delete()
        print("Deleted Ghost Refund.")
        
        # 4. Update Order Status
        total_refunded = sum(r.amount for r in order.refunds.filter(status='completed'))
        if total_refunded >= order.total:
            order.refund_status = 'completed'
        elif total_refunded > 0:
            order.refund_status = 'partial'
        else:
            order.refund_status = 'pending'
        order.save(update_fields=['refund_status'])
        order.update_payment_status()
        
        print(f"Ghost refund reversed. Order #{order.display_id} refund_status reset to '{order.refund_status}'.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    reverse_ghost()
