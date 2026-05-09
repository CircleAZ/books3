import os
import django
import sys

sys.path.append(r'z:\books2')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "azbooks.settings")
django.setup()

from outlets.models import OutletPayment
from finance.models import CashWalletTransaction, CashWallet, BankTransaction, BankAccount
from django.db import transaction

@transaction.atomic
def fix_orphaned_payments():
    orphaned = OutletPayment.objects.filter(bank_transaction__isnull=True, wallet_transaction__isnull=True)
    count = orphaned.count()
    print(f"Found {count} orphaned OutletPayments.")

    for payment in orphaned:
        if payment.payment_method == OutletPayment.PaymentMethod.CASH:
            # Try to find user's wallet
            wallet = None
            if payment.recorded_by:
                wallet = CashWallet.objects.filter(name__icontains=payment.recorded_by.username).first()
            if not wallet:
                wallet = CashWallet.objects.first()

            if not wallet:
                print("No cash wallet found in the system to link!")
                continue

            # Manually trigger the ledger creation logic
            wallet = CashWallet.objects.select_for_update().get(pk=wallet.pk)
            new_balance = wallet.balance + payment.amount
            cwt = CashWalletTransaction.objects.create(
                wallet=wallet,
                transaction_type='deposit',
                amount=payment.amount,
                description=f"Outlet Payment (Retroactive Fix): {payment.outlet.name}",
                reference_id=payment.reference_id,
                balance_after=new_balance,
                date=payment.date,
                created_by=payment.recorded_by
            )
            wallet.balance = new_balance
            wallet.save(update_fields=['balance'])
            
            payment.destination_wallet = wallet
            payment.wallet_transaction = cwt
            payment.save(update_fields=['destination_wallet', 'wallet_transaction'])
            print(f"Linked payment {payment.display_id} to Cash Wallet: {wallet.name}")

        elif payment.payment_method in [OutletPayment.PaymentMethod.BANK, OutletPayment.PaymentMethod.CHEQUE, OutletPayment.PaymentMethod.UPI]:
            bank = BankAccount.objects.first()
            if not bank:
                print("No bank account found in the system to link!")
                continue
                
            bt = BankTransaction.objects.create(
                account=bank,
                transaction_type='deposit',
                date=payment.date,
                amount=payment.amount,
                description=f"Outlet Payment (Retroactive Fix): {payment.outlet.name}",
                reference=payment.reference_id,
                recorded_by=payment.recorded_by
            )
            payment.destination_bank = bank
            payment.bank_transaction = bt
            payment.save(update_fields=['destination_bank', 'bank_transaction'])
            print(f"Linked payment {payment.display_id} to Bank Account: {bank.name}")

if __name__ == '__main__':
    fix_orphaned_payments()
