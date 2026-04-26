"""
Admin configuration for Finance App.
"""

from django.contrib import admin
from .models import (
    ExpenseCategory, Expense, ExpensePayment, OtherIncome,
    BankAccount, BankTransaction, EmployeeExpense, EmployeeSalary,
    SalaryPayment, Lender, Loan, LoanRepayment,
    IncomeCategory, RecurringExpense, CategoryBudget, FinanceAuditLog,
    ExpenseTrip, ExpenseTripItem,
    CashWallet, CashTransfer, CashWalletTransaction
)


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'icon', 'is_active', 'created_at']
    list_filter = ['is_active']
    search_fields = ['name', 'description']


class ExpensePaymentInline(admin.TabularInline):
    model = ExpensePayment
    extra = 0
    readonly_fields = ['created_at']


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ['date', 'payee_name', 'category', 'total_amount', 'payment_status',
                    'approval_status', 'paid_amount']
    list_filter = ['payment_status', 'approval_status', 'payee_type', 'category', 'date']
    search_fields = ['payee_name', 'description', 'notes']
    date_hierarchy = 'date'
    inlines = [ExpensePaymentInline]
    readonly_fields = ['created_at', 'updated_at']


@admin.register(ExpensePayment)
class ExpensePaymentAdmin(admin.ModelAdmin):
    list_display = ['expense', 'payment_date', 'amount', 'payment_method', 'payer']
    list_filter = ['payment_method', 'payment_date']
    search_fields = ['expense__payee_name', 'reference']


@admin.register(OtherIncome)
class OtherIncomeAdmin(admin.ModelAdmin):
    list_display = ['date', 'source', 'amount', 'received_by']
    list_filter = ['date']
    search_fields = ['source', 'description']
    date_hierarchy = 'date'


class BankTransactionInline(admin.TabularInline):
    model = BankTransaction
    extra = 0
    readonly_fields = ['created_at']
    fk_name = 'account'


@admin.register(BankAccount)
class BankAccountAdmin(admin.ModelAdmin):
    list_display = ['name', 'account_type', 'bank_name', 'masked_account', 'current_balance', 'is_active', 'is_default']
    list_filter = ['account_type', 'is_active', 'is_default']
    search_fields = ['name', 'bank_name']
    inlines = [BankTransactionInline]

    @admin.display(description='Account Number')
    def masked_account(self, obj):
        if obj.account_number and len(obj.account_number) > 4:
            return '•' * (len(obj.account_number) - 4) + obj.account_number[-4:]
        return obj.account_number or ''


@admin.register(BankTransaction)
class BankTransactionAdmin(admin.ModelAdmin):
    list_display = ['date', 'account', 'transaction_type', 'amount', 'is_reconciled']
    list_filter = ['transaction_type', 'is_reconciled', 'date', 'account']
    search_fields = ['description', 'reference']
    date_hierarchy = 'date'


@admin.register(EmployeeExpense)
class EmployeeExpenseAdmin(admin.ModelAdmin):
    list_display = ['date', 'employee', 'category', 'amount', 'status']
    list_filter = ['status', 'category', 'date']
    search_fields = ['employee__username', 'description']
    date_hierarchy = 'date'


class SalaryPaymentInline(admin.TabularInline):
    model = SalaryPayment
    extra = 0
    readonly_fields = ['created_at']


@admin.register(EmployeeSalary)
class EmployeeSalaryAdmin(admin.ModelAdmin):
    list_display = ['employee', 'base_amount', 'frequency', 'is_active']
    list_filter = ['frequency', 'is_active']
    search_fields = ['employee__username']
    inlines = [SalaryPaymentInline]


@admin.register(SalaryPayment)
class SalaryPaymentAdmin(admin.ModelAdmin):
    list_display = ['salary', 'period_start', 'period_end', 'net_amount', 'payment_date']
    list_filter = ['payment_date']
    search_fields = ['salary__employee__username']
    date_hierarchy = 'payment_date'


class LoanInline(admin.TabularInline):
    model = Loan
    extra = 0
    readonly_fields = ['total_paid']


@admin.register(Lender)
class LenderAdmin(admin.ModelAdmin):
    list_display = ['name', 'contact_person', 'phone', 'email', 'total_loans']
    search_fields = ['name', 'contact_person', 'phone', 'email']
    inlines = [LoanInline]


class LoanRepaymentInline(admin.TabularInline):
    model = LoanRepayment
    extra = 0
    readonly_fields = ['created_at']


@admin.register(Loan)
class LoanAdmin(admin.ModelAdmin):
    list_display = ['lender', 'principal_amount', 'interest_rate', 'interest_type',
                    'start_date', 'total_paid', 'is_active']
    list_filter = ['is_active', 'interest_type', 'start_date', 'lender']
    search_fields = ['lender__name', 'loan_number']
    inlines = [LoanRepaymentInline]


@admin.register(LoanRepayment)
class LoanRepaymentAdmin(admin.ModelAdmin):
    list_display = ['loan', 'date', 'amount', 'principal_portion', 'interest_portion']
    list_filter = ['date', 'loan__lender']
    search_fields = ['loan__lender__name', 'reference']
    date_hierarchy = 'date'


# ======== Cash Management ========

class CashWalletTransactionInline(admin.TabularInline):
    model = CashWalletTransaction
    extra = 0
    readonly_fields = ['created_at']

@admin.register(CashWallet)
class CashWalletAdmin(admin.ModelAdmin):
    list_display = ['name', 'owner', 'balance', 'is_system', 'is_active']
    list_filter = ['is_system', 'is_active']
    search_fields = ['name', 'owner__username']
    inlines = [CashWalletTransactionInline]

@admin.register(CashTransfer)
class CashTransferAdmin(admin.ModelAdmin):
    list_display = ['source_wallet', 'destination_wallet', 'destination_bank', 'amount', 'status', 'initiated_by']
    list_filter = ['status']
    search_fields = ['source_wallet__name', 'destination_wallet__name', 'destination_bank__name']

@admin.register(CashWalletTransaction)
class CashWalletTransactionAdmin(admin.ModelAdmin):
    list_display = ['date', 'wallet', 'transaction_type', 'amount', 'balance_after']
    list_filter = ['transaction_type', 'date', 'wallet']
    search_fields = ['description', 'reference_id']
    date_hierarchy = 'date'

# ======== New Models ========

@admin.register(IncomeCategory)
class IncomeCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active', 'created_at']
    list_filter = ['is_active']
    search_fields = ['name']


@admin.register(RecurringExpense)
class RecurringExpenseAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'payee_name', 'amount', 'frequency', 'next_date', 'is_active']
    list_filter = ['frequency', 'is_active', 'category']
    search_fields = ['name', 'payee_name']
    date_hierarchy = 'next_date'


@admin.register(CategoryBudget)
class CategoryBudgetAdmin(admin.ModelAdmin):
    list_display = ['category', 'period_start', 'period_end', 'budget_amount']
    list_filter = ['category']
    date_hierarchy = 'period_start'


@admin.register(FinanceAuditLog)
class FinanceAuditLogAdmin(admin.ModelAdmin):
    list_display = ['timestamp', 'action', 'model_name', 'object_id', 'user']
    list_filter = ['action', 'model_name', 'timestamp']
    search_fields = ['object_id', 'user__username']
    date_hierarchy = 'timestamp'
    readonly_fields = ['action', 'model_name', 'object_id', 'user', 'timestamp', 'details']


# ======== Trip / Expense Group ========

class ExpenseTripItemInline(admin.TabularInline):
    model = ExpenseTripItem
    extra = 0
    readonly_fields = ['expense', 'employee_expense', 'created_at']


@admin.register(ExpenseTrip)
class ExpenseTripAdmin(admin.ModelAdmin):
    list_display = ['name', 'date', 'purpose', 'settlement_status', 'created_by']
    list_filter = ['settlement_status', 'date']
    search_fields = ['name', 'purpose']
    date_hierarchy = 'date'
    inlines = [ExpenseTripItemInline]
    readonly_fields = ['created_at', 'updated_at']
