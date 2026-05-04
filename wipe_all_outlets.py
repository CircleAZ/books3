import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

from django.apps import apps
from finance.models import BankTransaction, CashWalletTransaction
from outlets.models import OutletPayment

print("Initiating full hard wipe of Outlets Consignment module...")

# 1. Clean Finance Ledgers created by Outlets
payments = OutletPayment.all_objects.all()
for p in payments:
    bt = p.bank_transaction
    wt = p.wallet_transaction
    p.hard_delete()
    if bt:
        bt.delete()
    if wt:
        wt.delete()
print("Outlet payments and associated finance ledgers wiped.")

# 2. Iteratively delete all models in the outlets app
# We need to delete them in reverse dependency order or just catch ProtectedError and loop
outlets_app = apps.get_app_config('outlets')
models = list(outlets_app.get_models())

# Custom deletion order to avoid ProtectedError
deletion_order = [
    'OutletDailySaleItem', 'OutletDailySale', 
    'OutletStockTransferItem', 'OutletStockTransfer',
    'OutletStockReturnItem', 'OutletStockReturn',
    'OutletStock', 'OutletCommissionOverride' # Assuming the override is named this
]

for model_name in deletion_order:
    try:
        model = apps.get_model('outlets', model_name)
        if hasattr(model, 'all_objects'):
            for obj in model.all_objects.all(): obj.hard_delete()
        else:
            model.objects.all().delete()
    except LookupError:
        pass # Model doesn't exist

# Finally, Outlet itself
from outlets.models import Outlet
for outlet in Outlet.all_objects.all():
    outlet.hard_delete()

print("Hard wipe completed.")
