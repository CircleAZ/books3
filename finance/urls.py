"""
URL configuration for Finance App.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ExpenseCategoryViewSet, ExpenseViewSet, ExpensePaymentViewSet,
    OtherIncomeViewSet, BankAccountViewSet, BankTransactionViewSet,
    EmployeeExpenseViewSet, EmployeeSalaryViewSet, SalaryPaymentViewSet,
    LenderViewSet, LoanViewSet, LoanRepaymentViewSet,
    IncomeCategoryViewSet, RecurringExpenseViewSet, CategoryBudgetViewSet,
    FinanceAuditLogViewSet, FinancialDashboardView,
    ExpenseTripViewSet, CashWalletViewSet, CashTransferViewSet
)

router = DefaultRouter()
router.register(r'expense-categories', ExpenseCategoryViewSet)
router.register(r'expenses', ExpenseViewSet)
router.register(r'expense-payments', ExpensePaymentViewSet)
router.register(r'other-income', OtherIncomeViewSet)
router.register(r'bank-accounts', BankAccountViewSet)
router.register(r'bank-transactions', BankTransactionViewSet)
router.register(r'employee-expenses', EmployeeExpenseViewSet)
router.register(r'salaries', EmployeeSalaryViewSet)
router.register(r'salary-payments', SalaryPaymentViewSet)
router.register(r'lenders', LenderViewSet)
router.register(r'loans', LoanViewSet)
router.register(r'loan-repayments', LoanRepaymentViewSet)
# New in Phase 3+4
router.register(r'income-categories', IncomeCategoryViewSet)
router.register(r'recurring-expenses', RecurringExpenseViewSet)
router.register(r'category-budgets', CategoryBudgetViewSet)
router.register(r'audit-logs', FinanceAuditLogViewSet)
# Trip / Expense Group
router.register(r'expense-trips', ExpenseTripViewSet)
# Cash Flow
router.register(r'cash-wallets', CashWalletViewSet)
router.register(r'cash-transfers', CashTransferViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('dashboard/', FinancialDashboardView.as_view(), name='financial-dashboard'),
]
