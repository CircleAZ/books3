"""
Management command to wipe all test/transactional data from the production database.
Preserves: Users, Permissions, Store Settings, Payment Methods, Return Reasons,
           UPI Accounts, Cash Wallets, Bank Accounts, Expense/Income Categories,
           Salary Configs, Budgets, Recurring Expenses.

USAGE:
  python manage.py wipe_test_data           # interactive confirmation
  python manage.py wipe_test_data --confirm # skip confirmation (for entrypoint)
"""

from django.core.management.base import BaseCommand
from django.db import connection


# Tables to wipe, in safe deletion order (children before parents).
# Uses raw SQL to bypass SoftDeleteModel's soft_delete() override.
TABLES_TO_WIPE = [
    # -- Orders child tables --
    'orders_refund',
    'orders_returnitem',
    'orders_return',
    'orders_creditnote',
    'orders_ordernote',
    'orders_orderstatushistory',
    'orders_payment',
    'orders_orderitem',
    'orders_order',

    # -- Finance transaction tables --
    'finance_financeauditlog',
    'finance_expensetripitem',
    'finance_expensetrip',
    'finance_loanrepayment',
    'finance_loan',
    'finance_lender',
    'finance_salarypayment',
    'finance_employeeexpense',
    'finance_banktransaction',
    'finance_cashwallettransaction',
    'finance_otherincome',
    'finance_expensepayment',
    'finance_expense',

    # -- Customers --
    'customers_customer',

    # -- Inventory (children first) --
    'inventory_stockhistory',
    'inventory_stockadjustment',
    'inventory_productimage',
    'inventory_product_tags',       # M2M through table
    'inventory_product',
    'inventory_category',
    'inventory_vendor',
    'inventory_tag',
]


class Command(BaseCommand):
    help = 'Permanently wipe all test/transactional data. Preserves config data.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='Skip interactive confirmation (for automated deploys)',
        )

    def handle(self, *args, **options):
        if not options['confirm']:
            answer = input('WARNING: This will PERMANENTLY DELETE all transactional data. Type WIPE to confirm: ')
            if answer != 'WIPE':
                self.stdout.write(self.style.WARNING('Aborted.'))
                return

        db_engine = connection.vendor  # 'postgresql' or 'sqlite'

        with connection.cursor() as cursor:
            if db_engine == 'postgresql':
                # Use TRUNCATE CASCADE - no superuser needed, handles FKs automatically
                table_list = ', '.join(f'"{t}"' for t in TABLES_TO_WIPE)
                self.stdout.write(f'Truncating {len(TABLES_TO_WIPE)} tables...')
                try:
                    cursor.execute(f'TRUNCATE {table_list} CASCADE;')
                    self.stdout.write('  All tables truncated.')
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f'  TRUNCATE failed: {e}'))
                    return
            else:
                # SQLite fallback: disable FK checks, delete one by one
                cursor.execute("PRAGMA foreign_keys = OFF;")
                for table in TABLES_TO_WIPE:
                    try:
                        cursor.execute(f'SELECT COUNT(*) FROM "{table}"')
                        count = cursor.fetchone()[0]
                        if count > 0:
                            cursor.execute(f'DELETE FROM "{table}"')
                            self.stdout.write(f'  Deleted {count} rows from {table}')
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f'  ERROR on {table}: {e}'))
                cursor.execute("PRAGMA foreign_keys = ON;")

        self.stdout.write('')
        self.stdout.write('=== PRESERVED ===')
        self.stdout.write('  User Accounts, Permissions, Store Settings')
        self.stdout.write('  Payment Methods, Return Reasons, UPI Accounts')
        self.stdout.write('  Cash Wallets, Bank Accounts (ledgers)')
        self.stdout.write('  Expense/Income Categories, Salary Configs')
        self.stdout.write('  Budgets, Recurring Expenses')
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            '[DONE] Wiped. Database is production-ready.'
        ))
