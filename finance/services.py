import logging
from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from .models import BankAccount, BankTransaction, CashWallet, CashWalletTransaction

logger = logging.getLogger(__name__)

class LedgerService:
    @staticmethod
    def process_deposit(amount, destination_bank=None, destination_wallet=None, reference="", description="", user=None):
        if not destination_bank and not destination_wallet:
            return  # Legacy or null routing
            
        with transaction.atomic():
            if destination_bank:
                # Lock row to prevent race conditions during transaction creation
                bank = BankAccount.objects.select_for_update().get(id=destination_bank.id)
                BankTransaction.objects.create(
                    account=bank,
                    date=timezone.now().date(),
                    transaction_type='deposit',
                    amount=amount,
                    reference=reference,
                    description=description,
                    is_reconciled=False
                )
            elif destination_wallet:
                wallet = CashWallet.objects.select_for_update().get(id=destination_wallet.id)
                wallet.balance += Decimal(str(amount))
                wallet.save(update_fields=['balance'])
                CashWalletTransaction.objects.create(
                    wallet=wallet,
                    transaction_type='deposit',
                    amount=amount,
                    reference_id=reference,
                    description=description,
                    balance_after=wallet.balance,
                    created_by=user
                )

    @staticmethod
    def process_withdrawal(amount, source_bank=None, source_wallet=None, reference="", description="", user=None):
        if not source_bank and not source_wallet:
            return
            
        with transaction.atomic():
            if source_bank:
                bank = BankAccount.objects.select_for_update().get(id=source_bank.id)
                if bank.current_balance - Decimal(str(amount)) < 0:
                    raise ValidationError(f"Insufficient funds in bank account: {bank.name}")
                
                BankTransaction.objects.create(
                    account=bank,
                    date=timezone.now().date(),
                    transaction_type='withdrawal',
                    amount=amount,
                    reference=reference,
                    description=description,
                    is_reconciled=False
                )
            elif source_wallet:
                wallet = CashWallet.objects.select_for_update().get(id=source_wallet.id)
                wallet.balance -= Decimal(str(amount))
                if wallet.balance < 0:
                    raise ValidationError(f"Insufficient funds in cash wallet: {wallet.name}")
                wallet.save(update_fields=['balance'])
                CashWalletTransaction.objects.create(
                    wallet=wallet,
                    transaction_type='withdrawal',
                    amount=amount,
                    reference_id=reference,
                    description=description,
                    balance_after=wallet.balance,
                    created_by=user
                )
