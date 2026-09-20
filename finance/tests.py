from django.test import TestCase
from decimal import Decimal
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from customers.models import Customer, Address
from finance.models import (
    BankAccount, BankTransaction, EmployeeSalary, SalaryPayment,
    Lender, Loan, LoanRepayment, ExpenseTrip, ExpenseTripItem, ExpenseCategory
)

User = get_user_model()

class FinanceQueryOptimizationTestCase(TestCase):
    def setUp(self):
        # Create administrative user
        self.user = User.objects.create_superuser(
            username="test_nplusone_admin",
            email="test_nplusone_admin@example.com",
            password="password"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        # Create standard expense category
        self.category = ExpenseCategory.objects.create(
            name="Trip Category",
            description="Trip Category Description",
            is_active=True
        )

    def test_customers_list_is_constant_queries(self):
        # 1 customer with addresses
        c1 = Customer.objects.create(first_name="Cust1", last_name="L1", phone="1000000001", created_by=self.user)
        Address.objects.create(customer=c1, address_line="Street 1", taluka="Taluka 1", district="District 1", is_primary=True)
        Address.objects.create(customer=c1, address_line="Street 1b", taluka="Taluka 1b", district="District 1b", is_primary=False)
        
        with CaptureQueriesContext(connection) as ctx1:
            res1 = self.client.get("/api/customers/customers/")
        q1_count = len(ctx1.captured_queries)
        self.assertEqual(res1.status_code, 200)
        
        # 6 customers with addresses
        for i in range(2, 7):
            ci = Customer.objects.create(first_name=f"Cust{i}", last_name=f"L{i}", phone=f"100000000{i}", created_by=self.user)
            Address.objects.create(customer=ci, address_line=f"Street {i}", taluka=f"Taluka {i}", district=f"District {i}", is_primary=True)
            Address.objects.create(customer=ci, address_line=f"Street {i}b", taluka=f"Taluka {i}b", district=f"District {i}b", is_primary=False)
            
        with CaptureQueriesContext(connection) as ctx5:
            res5 = self.client.get("/api/customers/customers/")
        q5_count = len(ctx5.captured_queries)
        self.assertEqual(res5.status_code, 200)
        
        # Verify O(1) query count
        self.assertEqual(q5_count, q1_count, f"N+1 leak on customer list: {q1_count} queries for 1 customer, but {q5_count} queries for 6 customers.")

    def test_bank_accounts_list_is_constant_queries(self):
        # 1 bank account with transactions
        b1 = BankAccount.objects.create(name="Bank 1", bank_name="Bank 1", account_number="1111", opening_balance=Decimal("100"), current_balance=Decimal("100"))
        for j in range(3):
            BankTransaction.objects.create(account=b1, date="2026-05-30", transaction_type="deposit", amount=Decimal("10"), description="Test deposit", recorded_by=self.user)
            
        with CaptureQueriesContext(connection) as ctx1:
            res1 = self.client.get("/api/finance/bank-accounts/")
        q1_count = len(ctx1.captured_queries)
        self.assertEqual(res1.status_code, 200)
        
        # 5 bank accounts with transactions
        for i in range(2, 6):
            bi = BankAccount.objects.create(name=f"Bank {i}", bank_name=f"Bank {i}", account_number=f"111{i}", opening_balance=Decimal("100"), current_balance=Decimal("100"))
            for j in range(3):
                BankTransaction.objects.create(account=bi, date="2026-05-30", transaction_type="deposit", amount=Decimal("10"), description="Test deposit", recorded_by=self.user)
                
        with CaptureQueriesContext(connection) as ctx5:
            res5 = self.client.get("/api/finance/bank-accounts/")
        q5_count = len(ctx5.captured_queries)
        self.assertEqual(res5.status_code, 200)
        
        # Verify 'recent_transactions' omitted from payload
        self.assertNotIn('recent_transactions', res5.data['results'][0])
        self.assertEqual(q5_count, q1_count, f"N+1 leak on bank accounts list: {q1_count} vs {q5_count}")

    def test_salaries_list_is_constant_queries(self):
        # 1 salary config with payments
        emp1 = User.objects.create(username="emp1", phone="1234567891", email="emp1@example.com")
        s1 = EmployeeSalary.objects.create(employee=emp1, base_amount=Decimal("1000"), frequency="monthly")
        for j in range(3):
            SalaryPayment.objects.create(salary=s1, period_start="2026-05-01", period_end="2026-05-31", payment_date="2026-05-30", base_amount=Decimal("1000"), net_amount=Decimal("1000"), payment_method="cash", paid_by=self.user)
            
        with CaptureQueriesContext(connection) as ctx1:
            res1 = self.client.get("/api/finance/salaries/")
        q1_count = len(ctx1.captured_queries)
        self.assertEqual(res1.status_code, 200)
        
        # 5 salary configs with payments
        for i in range(2, 6):
            empi = User.objects.create(username=f"emp{i}", phone=f"123456789{i}", email=f"emp{i}@example.com")
            si = EmployeeSalary.objects.create(employee=empi, base_amount=Decimal("1000"), frequency="monthly")
            for j in range(3):
                SalaryPayment.objects.create(salary=si, period_start="2026-05-01", period_end="2026-05-31", payment_date="2026-05-30", base_amount=Decimal("1000"), net_amount=Decimal("1000"), payment_method="cash", paid_by=self.user)
                
        with CaptureQueriesContext(connection) as ctx5:
            res5 = self.client.get("/api/finance/salaries/")
        q5_count = len(ctx5.captured_queries)
        self.assertEqual(res5.status_code, 200)
        
        # Verify 'recent_payments' omitted
        self.assertNotIn('recent_payments', res5.data['results'][0])
        self.assertEqual(q5_count, q1_count, f"N+1 leak on employee salaries list: {q1_count} vs {q5_count}")

    def test_lenders_list_and_details_prefetches(self):
        # 1 lender with loans & repayments
        len1 = Lender.objects.create(name="Lender 1")
        loan1 = Loan.objects.create(lender=len1, loan_number="L1", principal_amount=Decimal("5000"), interest_rate=Decimal("5.00"), term_months=12, start_date="2026-01-01")
        for j in range(3):
            LoanRepayment.objects.create(loan=loan1, date="2026-05-30", amount=Decimal("100"), principal_portion=Decimal("100"), interest_portion=Decimal("0"), payment_method="cash", recorded_by=self.user)
            
        with CaptureQueriesContext(connection) as ctx1:
            res1 = self.client.get("/api/finance/lenders/")
        q1_count = len(ctx1.captured_queries)
        self.assertEqual(res1.status_code, 200)
        
        # 5 lenders with loans & repayments
        for i in range(2, 6):
            leni = Lender.objects.create(name=f"Lender {i}")
            loani = Loan.objects.create(lender=leni, loan_number=f"L{i}", principal_amount=Decimal("5000"), interest_rate=Decimal("5.00"), term_months=12, start_date="2026-01-01")
            for j in range(3):
                LoanRepayment.objects.create(loan=loani, date="2026-05-30", amount=Decimal("100"), principal_portion=Decimal("100"), interest_portion=Decimal("0"), payment_method="cash", recorded_by=self.user)
                
        with CaptureQueriesContext(connection) as ctx5:
            res5 = self.client.get("/api/finance/lenders/")
        q5_count = len(ctx5.captured_queries)
        self.assertEqual(res5.status_code, 200)
        
        # Verify active_loans and loans are omitted from list payload
        self.assertNotIn('loans', res5.data['results'][0])
        self.assertNotIn('active_loans', res5.data['results'][0])
        self.assertEqual(q5_count, q1_count, f"N+1 leak on lender list: {q1_count} vs {q5_count}")
        
        # Verify prefetching on Lender retrieve detail endpoint
        with CaptureQueriesContext(connection) as ctx_retrieve:
            res_retrieve = self.client.get(f"/api/finance/lenders/{len1.id}/")
        self.assertEqual(res_retrieve.status_code, 200)
        # Prefetching with select_related should keep detail queries low
        # (~7-8: auth, lender, prefetch loans, prefetch repayments, + 3 property .filter() calls)
        self.assertLessEqual(len(ctx_retrieve.captured_queries), 10)

    def test_loans_list_is_constant_queries(self):
        lender = Lender.objects.create(name="Lender Base")
        loan1 = Loan.objects.create(lender=lender, loan_number="L1", principal_amount=Decimal("5000"), interest_rate=Decimal("5.00"), term_months=12, start_date="2026-01-01")
        for j in range(3):
            LoanRepayment.objects.create(loan=loan1, date="2026-05-30", amount=Decimal("100"), principal_portion=Decimal("100"), interest_portion=Decimal("0"), payment_method="cash", recorded_by=self.user)
            
        with CaptureQueriesContext(connection) as ctx1:
            res1 = self.client.get("/api/finance/loans/")
        q1_count = len(ctx1.captured_queries)
        self.assertEqual(res1.status_code, 200)
        
        for i in range(2, 6):
            loani = Loan.objects.create(lender=lender, loan_number=f"L{i}", principal_amount=Decimal("5000"), interest_rate=Decimal("5.00"), term_months=12, start_date="2026-01-01")
            for j in range(3):
                LoanRepayment.objects.create(loan=loani, date="2026-05-30", amount=Decimal("100"), principal_portion=Decimal("100"), interest_portion=Decimal("0"), payment_method="cash", recorded_by=self.user)
                
        with CaptureQueriesContext(connection) as ctx5:
            res5 = self.client.get("/api/finance/loans/")
        q5_count = len(ctx5.captured_queries)
        self.assertEqual(res5.status_code, 200)
        
        # Verify repayments omitted
        self.assertNotIn('repayments', res5.data['results'][0])
        self.assertEqual(q5_count, q1_count, f"N+1 leak on loan list: {q1_count} vs {q5_count}")

    def test_expense_trips_list_and_retrieve_in_memory(self):
        # 1 trip with items
        t1 = ExpenseTrip.objects.create(name="Trip 1", date="2026-05-30", purpose="Test Purpose 1", created_by=self.user)
        for j in range(3):
            ExpenseTripItem.objects.create(trip=t1, description=f"Item {j}", category=self.category, amount=Decimal("100"), paid_by_type="company")
            
        with CaptureQueriesContext(connection) as ctx1:
            res1 = self.client.get("/api/finance/expense-trips/")
        q1_count = len(ctx1.captured_queries)
        self.assertEqual(res1.status_code, 200)
        
        # 5 trips with items
        for i in range(2, 6):
            ti = ExpenseTrip.objects.create(name=f"Trip {i}", date="2026-05-30", purpose=f"Test Purpose {i}", created_by=self.user)
            for j in range(3):
                ExpenseTripItem.objects.create(trip=ti, description=f"Item {j}", category=self.category, amount=Decimal("100"), paid_by_type="company")
                
        with CaptureQueriesContext(connection) as ctx5:
            res5 = self.client.get("/api/finance/expense-trips/")
        q5_count = len(ctx5.captured_queries)
        self.assertEqual(res5.status_code, 200)
        
        # Verify correct values computed
        self.assertEqual(res5.data['results'][0]['total_amount'], "300.00")
        self.assertEqual(res5.data['results'][0]['company_amount'], "300.00")
        
        # Verify constant query count (O(1) queries due to prefetch + in-memory calculation)
        self.assertEqual(q5_count, q1_count, f"N+1 leak on expense trips list: {q1_count} vs {q5_count}")
