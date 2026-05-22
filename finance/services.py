import logging
from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from .models import BankAccount, BankTransaction, CashWallet, CashWalletTransaction

logger = logging.getLogger(__name__)

class LedgerService:
    @staticmethod
    def process_deposit(amount, destination_bank=None, destination_wallet=None, reference="", description="", user=None, date=None, **kwargs):
        if not destination_bank and not destination_wallet:
            return  # Legacy or null routing
            
        # Strict validation of kwargs (Option A)
        allowed_keys = {'related_loan', 'related_expense', 'recorded_by', 'created_by'}
        invalid_keys = set(kwargs.keys()) - allowed_keys
        if invalid_keys:
            raise ValidationError(f"Invalid keyword arguments passed to process_deposit: {', '.join(invalid_keys)}")
            
        tx_date = date or timezone.now().date()
        with transaction.atomic():
            if destination_bank:
                # Precedence Constraint (Option B): pop attribution if present, override positional user
                bank_user = kwargs.pop('recorded_by', user)
                
                # Partition kwargs to prevent ORM crash
                bank_kwargs = {k: v for k, v in kwargs.items() if k in {'related_loan', 'related_expense'}}
                
                # Lock row to prevent race conditions during transaction creation
                bank = BankAccount.objects.select_for_update().get(id=destination_bank.id)
                return BankTransaction.objects.create(
                    account=bank,
                    date=tx_date,
                    transaction_type='deposit',
                    amount=amount,
                    reference=reference,
                    description=description,
                    is_reconciled=False,
                    recorded_by=bank_user,
                    **bank_kwargs
                )
            elif destination_wallet:
                # Precedence Constraint (Option B): pop attribution if present, override positional user
                wallet_user = kwargs.pop('created_by', user)
                
                # Partition kwargs to prevent ORM crash (CashWalletTransaction only supports related_loan)
                wallet_kwargs = {k: v for k, v in kwargs.items() if k in {'related_loan'}}
                
                wallet = CashWallet.objects.select_for_update().get(id=destination_wallet.id)
                wallet.balance += Decimal(str(amount))
                wallet.save(update_fields=['balance'])
                return CashWalletTransaction.objects.create(
                    wallet=wallet,
                    transaction_type='deposit',
                    amount=amount,
                    reference_id=reference,
                    description=description,
                    balance_after=wallet.balance,
                    date=tx_date,
                    created_by=wallet_user,
                    **wallet_kwargs
                )

    @staticmethod
    def process_withdrawal(amount, source_bank=None, source_wallet=None, reference="", description="", user=None, date=None, allow_overdraft=False):
        if not source_bank and not source_wallet:
            return
            
        tx_date = date or timezone.now().date()
        with transaction.atomic():
            if source_bank:
                bank = BankAccount.objects.select_for_update().get(id=source_bank.id)
                if not allow_overdraft and (bank.current_balance - Decimal(str(amount)) < 0):
                    raise ValidationError(f"Insufficient funds in bank account: {bank.name}")
                
                return BankTransaction.objects.create(
                    account=bank,
                    date=tx_date,
                    transaction_type='withdrawal',
                    amount=amount,
                    reference=reference,
                    description=description,
                    is_reconciled=False
                )
            elif source_wallet:
                wallet = CashWallet.objects.select_for_update().get(id=source_wallet.id)
                wallet.balance -= Decimal(str(amount))
                if not allow_overdraft and wallet.balance < 0:
                    raise ValidationError(f"Insufficient funds in cash wallet: {wallet.name}")
                wallet.save(update_fields=['balance'])
                return CashWalletTransaction.objects.create(
                    wallet=wallet,
                    transaction_type='withdrawal',
                    amount=amount,
                    reference_id=reference,
                    description=description,
                    balance_after=wallet.balance,
                    date=tx_date,
                    created_by=user
                )
            return None
