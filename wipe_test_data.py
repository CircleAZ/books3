import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

from customers.models import Customer
from inventory.models import Category, Unit, Product, StockMovement
from orders.models import Order, Payment, Return, Refund, CreditNote, OrderNote, ReturnReason
from finance.models import LedgerEntry
from settings_app.models import UPIAccount

def wipe_data():
    print("Wiping Orders...")
    Order.objects.all().delete()
    Payment.objects.all().delete()
    Return.objects.all().delete()
    Refund.objects.all().delete()
    CreditNote.objects.all().delete()
    OrderNote.objects.all().delete()

    print("Wiping Finance Ledger...")
    LedgerEntry.objects.all().delete()

    print("Wiping Customers...")
    Customer.objects.all().delete()

    print("Wiping Inventory...")
    StockMovement.objects.all().delete()
    Product.objects.all().delete()
    Category.objects.all().delete()
    Unit.objects.all().delete()

    print("Wiping Return Reasons...")
    ReturnReason.objects.all().delete()

    print("Wiping UPI Accounts...")
    UPIAccount.objects.all().delete()

    print("All test data wiped successfully. User accounts, permissions, and core Store Settings were preserved.")

if __name__ == '__main__':
    wipe_data()
