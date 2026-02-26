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
    FinancialDashboardView
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

urlpatterns = [
    path('', include(router.urls)),
    path('dashboard/', FinancialDashboardView.as_view(), name='financial-dashboard'),
]
