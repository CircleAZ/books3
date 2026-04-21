import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'azbooks.settings')
django.setup()

from django.db import connection

from customers.models import Customer
from inventory.models import Category, Product, StockAdjustment, StockHistory, Tag, Vendor, ProductImage
from orders.models import Order, OrderItem, Payment, OrderStatusHistory, OrderNote, Return, ReturnItem, Refund, CreditNote
from finance.models import (
    Expense, ExpensePayment, OtherIncome,
    CashWalletTransaction, BankTransaction,
    EmployeeExpense, SalaryPayment,
    Loan, LoanRepayment, Lender,
    ExpenseTrip, ExpenseTripItem,
    FinanceAuditLog,
)
from settings_app.models import UPIAccount


def hard_delete_all(model):
    """Bypass SoftDeleteManager and truly delete all rows from the table."""
    # Use all_objects if available (SoftDeleteModel), else objects
    manager = getattr(model, 'all_objects', model.objects)
    count = manager.all().count()
    if count > 0:
        # Use raw SQL for guaranteed hard delete, bypassing Django's soft-delete override
        table = model._meta.db_table
        with connection.cursor() as cursor:
            cursor.execute(f'DELETE FROM "{table}"')
        print(f"    Deleted {count} rows from {model.__name__}")
    else:
        print(f"    {model.__name__}: already empty")


def wipe_data():
    # Disable FK checks for SQLite during wipe
    with connection.cursor() as cursor:
        cursor.execute("PRAGMA foreign_keys = OFF;")

    # -- Orders & Returns (child tables first) --
    print("Wiping Order data...")
    hard_delete_all(Refund)
    hard_delete_all(ReturnItem)
    hard_delete_all(Return)
    hard_delete_all(CreditNote)
    hard_delete_all(OrderNote)
    hard_delete_all(OrderStatusHistory)
    hard_delete_all(Payment)
    hard_delete_all(OrderItem)
    hard_delete_all(Order)
    print("  [OK] Orders wiped.\n")

    # -- Finance Transactions --
    print("Wiping Finance transaction data...")
    hard_delete_all(FinanceAuditLog)
    hard_delete_all(ExpenseTripItem)
    hard_delete_all(ExpenseTrip)
    hard_delete_all(LoanRepayment)
    hard_delete_all(Loan)
    hard_delete_all(Lender)
    hard_delete_all(SalaryPayment)
    hard_delete_all(EmployeeExpense)
    hard_delete_all(BankTransaction)
    hard_delete_all(CashWalletTransaction)
    hard_delete_all(OtherIncome)
    hard_delete_all(ExpensePayment)
    hard_delete_all(Expense)
    print("  [OK] Finance wiped.\n")

    # -- Customers --
    print("Wiping Customers...")
    hard_delete_all(Customer)
    print("  [OK] Customers wiped.\n")

    # -- Inventory --
    print("Wiping Inventory...")
    hard_delete_all(StockHistory)
    hard_delete_all(StockAdjustment)
    hard_delete_all(ProductImage)
    hard_delete_all(Product)
    hard_delete_all(Category)
    hard_delete_all(Vendor)
    hard_delete_all(Tag)
    print("  [OK] Inventory wiped.\n")

    # Re-enable FK checks
    with connection.cursor() as cursor:
        cursor.execute("PRAGMA foreign_keys = ON;")

    # -- Summary --
    print("=== PRESERVED (Configuration Data) ===")
    print("  - User Accounts & Permissions")
    print("  - Store Settings (currency, tax, etc.)")
    print("  - Payment Methods")
    print("  - Return Reasons")
    print("  - UPI Accounts")
    print("  - Cash Wallets & Bank Accounts (ledgers)")
    print("  - Expense Categories & Income Categories")
    print("  - Employee Salary Configs")
    print("  - Category Budgets & Recurring Expenses")
    print("")
    print("[DONE] All test data wiped successfully.")


if __name__ == '__main__':
    confirm = input("WARNING: THIS WILL PERMANENTLY DELETE ALL TRANSACTIONAL DATA. Type 'WIPE' to confirm: ")
    if confirm == 'WIPE':
        wipe_data()
    else:
        print("Aborted.")
