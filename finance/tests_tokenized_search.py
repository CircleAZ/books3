"""
Harsh Unit Tests for Wave 3: Financial Transactions, Ledger, and Expenses Tokenized Search.
Tests all qualifiers, operators, ranges, negations, cheatsheets, and autocomplete endpoints.
"""

from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from finance.models import (
    BankAccount, BankTransaction, CashWallet, CashWalletTransaction,
    ExpenseCategory, Expense, EmployeeExpense
)
from finance.filters import (
    TransactionTokenizedSearchFilter,
    ExpenseTokenizedSearchFilter,
    EmployeeExpenseTokenizedSearchFilter
)

User = get_user_model()


class FinancialTransactionsSearchTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(
            username='fin_admin',
            email='fin_admin@example.com',
            password='testpassword'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.account_axis = BankAccount.objects.create(
            name="Axis Main",
            bank_name="Axis Bank",
            account_number="111122223333",
            opening_balance=Decimal("100000.00"),
            current_balance=Decimal("100000.00")
        )
        self.account_hdfc = BankAccount.objects.create(
            name="HDFC Current",
            bank_name="HDFC Bank",
            account_number="444455556666",
            opening_balance=Decimal("50000.00"),
            current_balance=Decimal("50000.00")
        )

        today = timezone.localdate()
        self.today = today
        self.yesterday = today - timedelta(days=1)

        # Bank Transactions
        self.bt1 = BankTransaction.objects.create(
            account=self.account_axis,
            transaction_type='deposit',
            amount=Decimal('15000.00'),
            reference='order_1001',
            description='Customer Order 1001 payment via NEFT',
            date=today,
            recorded_by=self.user,
            is_reconciled=True
        )
        self.bt2 = BankTransaction.objects.create(
            account=self.account_axis,
            transaction_type='withdrawal',
            amount=Decimal('6200.00'),
            reference='expense_501',
            description='Office rent expense payment',
            date=today,
            recorded_by=self.user,
            is_reconciled=False
        )
        self.bt3 = BankTransaction.objects.create(
            account=self.account_hdfc,
            transaction_type='withdrawal',
            amount=Decimal('2500.00'),
            reference='salary_301',
            description='Staff salary disbursement',
            date=self.yesterday,
            recorded_by=self.user,
            is_reconciled=False
        )
        self.bt4 = BankTransaction.objects.create(
            account=self.account_hdfc,
            transaction_type='deposit',
            amount=Decimal('800.00'),
            reference='refund_901',
            description='Supplier refund',
            date=self.yesterday,
            recorded_by=self.user,
            is_reconciled=True
        )

        # Cash Wallet Transactions
        self.wallet = CashWallet.objects.create(
            name="Main Safe",
            balance=Decimal("20000.00"),
            is_system=True
        )
        self.cwt1 = CashWalletTransaction.objects.create(
            wallet=self.wallet,
            transaction_type='deposit',
            amount=Decimal('3500.00'),
            reference_id='order_1002',
            description='Cash payment for Order 1002',
            date=today,
            balance_after=Decimal('23500.00'),
            created_by=self.user
        )
        self.cwt2 = CashWalletTransaction.objects.create(
            wallet=self.wallet,
            transaction_type='withdrawal',
            amount=Decimal('450.00'),
            reference_id='expense_502',
            description='Tea and snacks pantry cash',
            date=self.yesterday,
            balance_after=Decimal('23050.00'),
            created_by=self.user
        )

    def test_bank_reference_search(self):
        q = TransactionTokenizedSearchFilter.parse_query('ref:order_1001')
        qs = BankTransaction.objects.filter(q)
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first(), self.bt1)

    def test_bank_type_search(self):
        q = TransactionTokenizedSearchFilter.parse_query('type:deposit')
        qs = BankTransaction.objects.filter(q)
        self.assertEqual(qs.count(), 2)

        q_order = TransactionTokenizedSearchFilter.parse_query('type:order_payment')
        qs_order = BankTransaction.objects.filter(q_order)
        self.assertEqual(qs_order.count(), 1)
        self.assertEqual(qs_order.first(), self.bt1)

    def test_bank_account_and_amount_inequality(self):
        q = TransactionTokenizedSearchFilter.parse_query('account:Axis amount:>10000')
        qs = BankTransaction.objects.filter(q)
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first(), self.bt1)

    def test_bank_reconciled_filter(self):
        q = TransactionTokenizedSearchFilter.parse_query('reconciled:true')
        qs = BankTransaction.objects.filter(q)
        self.assertEqual(qs.count(), 2)
        self.assertIn(self.bt1, qs)
        self.assertIn(self.bt4, qs)

    def test_bank_date_filter(self):
        q_today = TransactionTokenizedSearchFilter.parse_query('date:today')
        qs_today = BankTransaction.objects.filter(q_today)
        self.assertEqual(qs_today.count(), 2)

        q_yesterday = TransactionTokenizedSearchFilter.parse_query('date:yesterday')
        qs_yesterday = BankTransaction.objects.filter(q_yesterday)
        self.assertEqual(qs_yesterday.count(), 2)

    def test_bank_negation(self):
        q = TransactionTokenizedSearchFilter.parse_query('-type:withdrawal')
        qs = BankTransaction.objects.filter(q)
        self.assertEqual(qs.count(), 2)
        for t in qs:
            self.assertEqual(t.transaction_type, 'deposit')

    def test_all_transactions_unified_endpoint_with_source_token(self):
        # 1. Bank only
        res_bank = self.client.get('/api/finance/all-transactions/?search=source:bank')
        self.assertEqual(res_bank.status_code, 200)
        results = res_bank.data['results']
        self.assertEqual(len(results), 4)
        for r in results:
            self.assertEqual(r['source_type'], 'bank')

        # 2. Wallet only
        res_wallet = self.client.get('/api/finance/all-transactions/?search=source:wallet')
        self.assertEqual(res_wallet.status_code, 200)
        results = res_wallet.data['results']
        self.assertEqual(len(results), 2)
        for r in results:
            self.assertEqual(r['source_type'], 'wallet')

        # 3. High value across both
        res_hv = self.client.get('/api/finance/all-transactions/?search=amount:>5000')
        self.assertEqual(res_hv.status_code, 200)
        results = res_hv.data['results']
        self.assertEqual(len(results), 2)

    def test_all_transactions_suggestions_schema_and_counts(self):
        # Cheatsheet schema
        res_schema = self.client.get('/api/finance/all-transactions/search-suggestions/')
        self.assertEqual(res_schema.status_code, 200)
        prefixes = [p['prefix'] for p in res_schema.data['prefixes']]
        self.assertIn('ref', prefixes)
        self.assertIn('source', prefixes)
        self.assertIn('amount', prefixes)

        # Source suggestion counts
        res_src = self.client.get('/api/finance/all-transactions/search-suggestions/?prefix=source')
        self.assertEqual(res_src.status_code, 200)
        sug_map = {s['value']: s['count'] for s in res_src.data['suggestions']}
        self.assertEqual(sug_map['bank'], 4)
        self.assertEqual(sug_map['wallet'], 2)

    def test_bank_transactions_suggestions_endpoint(self):
        res = self.client.get('/api/finance/bank-transactions/search-suggestions/')
        self.assertEqual(res.status_code, 200)
        prefixes = [p['prefix'] for p in res.data['prefixes']]
        self.assertIn('ref', prefixes)
        self.assertIn('reconciled', prefixes)

        res_type = self.client.get('/api/finance/bank-transactions/search-suggestions/?prefix=type')
        self.assertEqual(res_type.status_code, 200)
        type_map = {s['value']: s['count'] for s in res_type.data['suggestions']}
        self.assertEqual(type_map['deposit'], 2)
        self.assertEqual(type_map['withdrawal'], 2)


class ExpensesSearchTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(
            username='exp_admin',
            email='exp_admin@example.com',
            password='testpassword'
        )
        self.staff_user = User.objects.create_user(
            username='exp_staff',
            email='exp_staff@example.com',
            password='testpassword'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        # Clear any orphaned expenses from TransactionTestCases
        Expense.objects.all().delete()
        EmployeeExpense.objects.all().delete()

        self.cat_travel = ExpenseCategory.objects.create(name="Travel & Lodging")
        self.cat_supplies = ExpenseCategory.objects.create(name="Office Supplies")

        today = timezone.localdate()
        self.today = today
        self.yesterday = today - timedelta(days=1)

        self.exp1 = Expense.objects.create(
            date=today,
            category=self.cat_supplies,
            payee_type=Expense.PayeeType.VENDOR,
            payee_name="Office Depot",
            description="Stationery, printer paper, toner",
            amount=Decimal('7500.00'),
            total_amount=Decimal('7500.00'),
            paid_amount=Decimal('7500.00'),
            payment_status=Expense.PaymentStatus.PAID,
            approval_status=Expense.ApprovalStatus.APPROVED,
            created_by=self.user
        )
        self.exp2 = Expense.objects.create(
            date=today,
            category=self.cat_travel,
            payee_type=Expense.PayeeType.EMPLOYEE,
            payee_name="Mukun Patel",
            description="Client visit fuel and tolls",
            amount=Decimal('1200.00'),
            total_amount=Decimal('1200.00'),
            payment_status=Expense.PaymentStatus.UNPAID,
            approval_status=Expense.ApprovalStatus.AUTO_APPROVED,
            created_by=self.user
        )
        self.exp3 = Expense.objects.create(
            date=self.yesterday,
            category=self.cat_supplies,
            payee_type=Expense.PayeeType.OTHER,
            payee_name="Quick Clean Services",
            description="Office sanitization",
            amount=Decimal('5500.00'),
            total_amount=Decimal('5500.00'),
            payment_status=Expense.PaymentStatus.UNPAID,
            approval_status=Expense.ApprovalStatus.PENDING,
            created_by=self.user
        )

        # Employee Expenses
        self.ee1 = EmployeeExpense.objects.create(
            employee=self.staff_user,
            date=today,
            category=self.cat_travel,
            description="Train tickets to Ahmedabad",
            amount=Decimal('1800.00'),
            status=EmployeeExpense.Status.PENDING
        )
        self.ee2 = EmployeeExpense.objects.create(
            employee=self.staff_user,
            date=self.yesterday,
            category=self.cat_supplies,
            description="Mouse and keyboard",
            amount=Decimal('6200.00'),
            status=EmployeeExpense.Status.APPROVED
        )

    def test_expense_payee_and_category_search(self):
        q = ExpenseTokenizedSearchFilter.parse_query('payee:"Office Depot" category:Supplies')
        qs = Expense.objects.filter(q)
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first(), self.exp1)

    def test_expense_status_and_approval_search(self):
        q_unpaid = ExpenseTokenizedSearchFilter.parse_query('status:unpaid')
        qs_unpaid = Expense.objects.filter(q_unpaid)
        self.assertEqual(qs_unpaid.count(), 2)

        q_pending = ExpenseTokenizedSearchFilter.parse_query('approval:pending')
        qs_pending = Expense.objects.filter(q_pending)
        self.assertEqual(qs_pending.count(), 1)
        self.assertEqual(qs_pending.first(), self.exp3)

    def test_expense_high_value_rule_threshold(self):
        q_hv = ExpenseTokenizedSearchFilter.parse_query('high_value:true')
        qs_hv = Expense.objects.filter(q_hv)
        self.assertEqual(qs_hv.count(), 2)
        self.assertIn(self.exp1, qs_hv)
        self.assertIn(self.exp3, qs_hv)

        q_low = ExpenseTokenizedSearchFilter.parse_query('high_value:false')
        qs_low = Expense.objects.filter(q_low)
        self.assertEqual(qs_low.count(), 1)
        self.assertEqual(qs_low.first(), self.exp2)

    def test_expense_amount_inequality(self):
        q = ExpenseTokenizedSearchFilter.parse_query('amount:>6000')
        qs = Expense.objects.filter(q)
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first(), self.exp1)

    def test_expense_negation(self):
        q = ExpenseTokenizedSearchFilter.parse_query('-status:paid')
        qs = Expense.objects.filter(q)
        self.assertEqual(qs.count(), 2)
        for exp in qs:
            self.assertNotEqual(exp.payment_status, Expense.PaymentStatus.PAID)

    def test_expense_suggestions_endpoint(self):
        res_schema = self.client.get('/api/finance/expenses/search-suggestions/')
        self.assertEqual(res_schema.status_code, 200)
        prefixes = [p['prefix'] for p in res_schema.data['prefixes']]
        self.assertIn('payee', prefixes)
        self.assertIn('category', prefixes)
        self.assertIn('high_value', prefixes)

        res_cat = self.client.get('/api/finance/expenses/search-suggestions/?prefix=category')
        self.assertEqual(res_cat.status_code, 200)
        sug_map = {s['value']: s['count'] for s in res_cat.data['suggestions']}
        self.assertEqual(sug_map['Office Supplies'], 2)
        self.assertEqual(sug_map['Travel & Lodging'], 1)

    def test_employee_expense_search_and_suggestions(self):
        q = EmployeeExpenseTokenizedSearchFilter.parse_query(f'employee:{self.staff_user.username} status:pending')
        qs = EmployeeExpense.objects.filter(q)
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first(), self.ee1)

        q_hv = EmployeeExpenseTokenizedSearchFilter.parse_query('high_value:true')
        qs_hv = EmployeeExpense.objects.filter(q_hv)
        self.assertEqual(qs_hv.count(), 1)
        self.assertEqual(qs_hv.first(), self.ee2)

        res = self.client.get('/api/finance/employee-expenses/search-suggestions/?prefix=status')
        self.assertEqual(res.status_code, 200)
        sug_map = {s['value']: s['count'] for s in res.data['suggestions']}
        self.assertEqual(sug_map['pending'], 1)
        self.assertEqual(sug_map['approved'], 1)
