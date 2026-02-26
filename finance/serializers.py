"""
Serializers for Finance App.
"""

from rest_framework import serializers
from django.db.models import Sum
from .models import (
    ExpenseCategory, Expense, ExpensePayment, OtherIncome,
    BankAccount, BankTransaction, EmployeeExpense, EmployeeSalary,
    SalaryPayment, Lender, Loan, LoanRepayment
)


class ExpenseCategorySerializer(serializers.ModelSerializer):
    expenses_count = serializers.SerializerMethodField()
    
    class Meta:
        model = ExpenseCategory
        fields = ['id', 'name', 'icon', 'description', 'is_active', 'expenses_count', 'created_at']
        read_only_fields = ['id', 'created_at']
    
    def get_expenses_count(self, obj):
        return obj.expenses.count()


class ExpensePaymentSerializer(serializers.ModelSerializer):
    payer_name = serializers.CharField(source='payer.username', read_only=True)
    
    class Meta:
        model = ExpensePayment
        fields = ['id', 'expense', 'date', 'amount', 'method', 'reference', 
                  'payer', 'payer_name', 'receipt', 'notes', 'created_at']
        read_only_fields = ['id', 'created_at']


class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    payments = ExpensePaymentSerializer(many=True, read_only=True)
    balance_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    
    class Meta:
        model = Expense
        fields = ['id', 'date', 'category', 'category_name', 'payee_type', 
                  'payee_name', 'payee_id', 'description', 'amount', 'tax_amount',
                  'total_amount', 'payment_status', 'paid_amount', 'balance_due',
                  'notes', 'payments', 'created_by', 'created_by_name', 
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'payment_status', 'paid_amount', 'created_by', 
                           'created_at', 'updated_at']


class ExpenseCreateSerializer(serializers.ModelSerializer):
    """Simplified serializer for expense creation."""
    
    class Meta:
        model = Expense
        fields = ['date', 'category', 'payee_type', 'payee_name', 'payee_id',
                  'description', 'amount', 'tax_amount', 'total_amount', 'notes']


class OtherIncomeSerializer(serializers.ModelSerializer):
    received_by_name = serializers.CharField(source='received_by.username', read_only=True)
    
    class Meta:
        model = OtherIncome
        fields = ['id', 'date', 'source', 'description', 'amount', 
                  'received_by', 'received_by_name', 'created_at', 'updated_at']
        read_only_fields = ['id', 'received_by', 'created_at', 'updated_at']


class BankTransactionSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source='account.name', read_only=True)
    recorded_by_name = serializers.CharField(source='recorded_by.username', read_only=True)
    
    class Meta:
        model = BankTransaction
        fields = ['id', 'account', 'account_name', 'transaction_type', 'date',
                  'amount', 'description', 'reference', 'transfer_account',
                  'related_expense', 'recorded_by', 'recorded_by_name',
                  'is_reconciled', 'created_at']
        read_only_fields = ['id', 'recorded_by', 'created_at']


class BankAccountSerializer(serializers.ModelSerializer):
    recent_transactions = serializers.SerializerMethodField()
    
    class Meta:
        model = BankAccount
        fields = ['id', 'name', 'account_type', 'bank_name', 'account_number',
                  'ifsc_code', 'branch', 'opening_balance', 'current_balance',
                  'is_active', 'is_default', 'recent_transactions', 'created_at']
        read_only_fields = ['id', 'current_balance', 'created_at']
    
    def get_recent_transactions(self, obj):
        txns = obj.transactions.all()[:5]
        return BankTransactionSerializer(txns, many=True).data


class EmployeeExpenseSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.username', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.username', read_only=True)
    
    class Meta:
        model = EmployeeExpense
        fields = ['id', 'employee', 'employee_name', 'date', 'category', 
                  'category_name', 'description', 'amount', 'receipt', 'status',
                  'reviewed_by', 'reviewed_by_name', 'reviewed_at', 
                  'rejection_reason', 'reimbursed_at', 'reimbursement_method',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'employee', 'reviewed_by', 'reviewed_at',
                           'reimbursed_at', 'created_at', 'updated_at']


class SalaryPaymentSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='salary.employee.username', read_only=True)
    paid_by_name = serializers.CharField(source='paid_by.username', read_only=True)
    
    class Meta:
        model = SalaryPayment
        fields = ['id', 'salary', 'employee_name', 'period_start', 'period_end',
                  'payment_date', 'base_amount', 'deductions', 'bonuses', 
                  'net_amount', 'payment_method', 'reference', 'notes',
                  'paid_by', 'paid_by_name', 'created_at']
        read_only_fields = ['id', 'net_amount', 'paid_by', 'created_at']


class EmployeeSalarySerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.username', read_only=True)
    recent_payments = serializers.SerializerMethodField()
    
    class Meta:
        model = EmployeeSalary
        fields = ['id', 'employee', 'employee_name', 'base_amount', 'frequency',
                  'payment_day', 'bank_account', 'bank_name', 'ifsc_code',
                  'is_active', 'recent_payments', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_recent_payments(self, obj):
        payments = obj.payments.all()[:5]
        return SalaryPaymentSerializer(payments, many=True).data


class LoanRepaymentSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source='recorded_by.username', read_only=True)
    
    class Meta:
        model = LoanRepayment
        fields = ['id', 'loan', 'date', 'amount', 'principal_portion',
                  'interest_portion', 'payment_method', 'reference', 'notes',
                  'recorded_by', 'recorded_by_name', 'created_at']
        read_only_fields = ['id', 'recorded_by', 'created_at']


class LoanSerializer(serializers.ModelSerializer):
    lender_name = serializers.CharField(source='lender.name', read_only=True)
    balance_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_interest = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    repayments = LoanRepaymentSerializer(many=True, read_only=True)
    
    class Meta:
        model = Loan
        fields = ['id', 'lender', 'lender_name', 'loan_number', 'principal_amount',
                  'interest_rate', 'term_months', 'start_date', 'end_date',
                  'monthly_payment', 'total_paid', 'balance_due', 'total_interest',
                  'is_active', 'notes', 'repayments', 'created_at', 'updated_at']
        read_only_fields = ['id', 'total_paid', 'created_at', 'updated_at']


class LenderSerializer(serializers.ModelSerializer):
    total_loans = serializers.IntegerField(read_only=True)
    total_outstanding = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    active_loans = serializers.SerializerMethodField()
    
    class Meta:
        model = Lender
        fields = ['id', 'name', 'contact_person', 'phone', 'email', 'address',
                  'notes', 'total_loans', 'total_outstanding', 'active_loans',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_active_loans(self, obj):
        loans = obj.loans.filter(is_active=True)[:5]
        return LoanSerializer(loans, many=True).data


# ======== Dashboard Serializers ========

class FinancialDashboardSerializer(serializers.Serializer):
    """Serializer for the financial dashboard KPIs."""
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2)
    cogs = serializers.DecimalField(max_digits=14, decimal_places=2)
    gross_profit = serializers.DecimalField(max_digits=14, decimal_places=2)
    expenses = serializers.DecimalField(max_digits=14, decimal_places=2)
    net_profit = serializers.DecimalField(max_digits=14, decimal_places=2)
    cash_balance = serializers.DecimalField(max_digits=14, decimal_places=2)
    accounts_receivable = serializers.DecimalField(max_digits=14, decimal_places=2)
    accounts_payable = serializers.DictField()
    period = serializers.CharField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
