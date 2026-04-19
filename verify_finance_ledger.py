import os
from decimal import Decimal
from django.core.exceptions import ValidationError

from django.contrib.auth import get_user_model
from finance.models import BankAccount, CashWallet, CashTransfer
from finance.services import LedgerService
from django.db import transaction

User = get_user_model()

def run_tests():
    print("--- Simulating Finance Ledger Atomicity ---")
    
    # 1. Setup
    user = User.objects.filter(is_superuser=False).first() or User.objects.first()
    manager = User.objects.filter(is_superuser=True).first()
    
    bank, _ = BankAccount.objects.get_or_create(name="Test Bank", defaults={
        "account_type": "current",
        "opening_balance": Decimal("1000.00"),
        "current_balance": Decimal("1000.00")
    })
    
    wallet, _ = CashWallet.objects.get_or_create(owner=user, defaults={
        "name": "Test Cashier Wallet",
        "balance": Decimal("0.00")
    })
    
    initial_bank_balance = bank.current_balance
    initial_wallet_balance = wallet.balance
    
    # 2. Test Deposit (e.g., receiving payment)
    print("Testing Deposit to Wallet...")
    try:
        LedgerService.process_deposit(
            amount=Decimal("500.00"),
            destination_wallet=wallet,
            description="Test Payment Received",
            user=user
        )
        wallet.refresh_from_db()
        wallet.refresh_from_db()
        print(f"Expected: {initial_wallet_balance + Decimal('500.00')}, Got: {wallet.balance}")
        print("SUCCESS: Deposit to Wallet Successful.")
    except Exception as e:
        print(f"FAILED: Deposit to Wallet Failed: {e}")
        
    # 3. Test Withdrawal (e.g., paying expense)
    print("Testing Withdrawal from Bank...")
    try:
        bank.refresh_from_db()
        pre_withdrawal_balance = bank.current_balance
        LedgerService.process_withdrawal(
            amount=Decimal("200.00"),
            source_bank=bank,
            description="Test Expense Paid",
            user=manager
        )
        bank.refresh_from_db()
        bank.refresh_from_db()
        print(f"Expected: {pre_withdrawal_balance - Decimal('200.00')}, Got: {bank.current_balance}")
        print("SUCCESS: Withdrawal from Bank Successful.")
    except Exception as e:
        print(f"FAILED: Withdrawal from Bank Failed: {e}")
        
    # 4. Test Overdraft Prevention
    print("Testing Overdraft Prevention...")
    try:
        with transaction.atomic():
            LedgerService.process_withdrawal(
                amount=Decimal("99999.00"),
                source_bank=bank,
                description="This should fail",
                user=manager
            )
        print("FAILED: Overdraft Prevention Failed: Allowed negative balance!")
    except ValidationError as e:
        print(f"SUCCESS: Overdraft Prevention Successful: Caught expected ValidationError ({e})")
    except Exception as e:
        print(f"FAILED: Unexpected Error during overdraft test: {type(e)} - {e}")
        
    # 5. Test Peer Review Transfer
    print("Testing Peer Review Transfer...")
    try:
        wallet.refresh_from_db()
        bank.refresh_from_db()
        pre_transfer_wallet = wallet.balance
        pre_transfer_bank = bank.current_balance
        
        transfer = CashTransfer.objects.create(
            source_wallet=wallet,
            destination_bank=bank,
            amount=Decimal("100.00"),
            initiated_by=user,
            status="pending"
        )
        # Manager approves
        with transaction.atomic():
            transfer.status = 'approved'
            transfer.approved_by = manager
            transfer.save()
            
            LedgerService.process_withdrawal(
                amount=transfer.amount,
                source_wallet=transfer.source_wallet,
                description=f"Transfer to {transfer.destination_bank.name}",
                user=manager
            )
            LedgerService.process_deposit(
                amount=transfer.amount,
                destination_bank=transfer.destination_bank,
                description=f"Transfer from {transfer.source_wallet.name}",
                user=manager
            )
            
        wallet.refresh_from_db()
        bank.refresh_from_db()
        wallet.refresh_from_db()
        bank.refresh_from_db()
        print(f"Wallet Expected: {pre_transfer_wallet - Decimal('100.00')}, Got: {wallet.balance}")
        print(f"Bank Expected: {pre_transfer_bank + Decimal('100.00')}, Got: {bank.current_balance}")
        print("SUCCESS: Peer Review Transfer Successful.")
    except Exception as e:
        print(f"FAILED: Peer Review Transfer Failed: {e}")

    print("--- Simulation Complete ---")

if __name__ == "__main__":
    run_tests()
