"""
Views for Finance App.
Includes ViewSets for all models and Financial Dashboard API.
"""

from decimal import Decimal
from datetime import date, timedelta
from django.db.models import Sum, Q, F, DecimalField
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from .permissions import FinancePermission

from .models import (
    ExpenseCategory, Expense, ExpensePayment, OtherIncome,
    BankAccount, BankTransaction, EmployeeExpense, EmployeeSalary,
    SalaryPayment, Lender, Loan, LoanRepayment
)
from .serializers import (
    ExpenseCategorySerializer, ExpenseSerializer, ExpenseCreateSerializer,
    ExpensePaymentSerializer, OtherIncomeSerializer,
    BankAccountSerializer, BankTransactionSerializer,
    EmployeeExpenseSerializer, EmployeeSalarySerializer, SalaryPaymentSerializer,
    LenderSerializer, LoanSerializer, LoanRepaymentSerializer,
    FinancialDashboardSerializer
)


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    """CRUD for expense categories."""
    queryset = ExpenseCategory.objects.all()
    serializer_class = ExpenseCategorySerializer
    permission_classes = [FinancePermission]
    
    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('active_only'):
            qs = qs.filter(is_active=True)
        return qs


class ExpenseViewSet(viewsets.ModelViewSet):
    """CRUD for expenses with payment support."""
    queryset = Expense.objects.select_related('category', 'created_by').prefetch_related('payments')
    permission_classes = [FinancePermission]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return ExpenseCreateSerializer
        return ExpenseSerializer
    
    def get_queryset(self):
        qs = super().get_queryset()
        
        # Filters
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(payment_status=status_filter)
        
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category_id=category)
        
        payee_type = self.request.query_params.get('payee_type')
        if payee_type:
            qs = qs.filter(payee_type=payee_type)
        
        date_from = self.request.query_params.get('date_from')
        if date_from:
            qs = qs.filter(date__gte=date_from)
        
        date_to = self.request.query_params.get('date_to')
        if date_to:
            qs = qs.filter(date__lte=date_to)
        
        return qs
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def add_payment(self, request, pk=None):
        """Add a payment to an expense."""
        expense = self.get_object()
        
        serializer = ExpensePaymentSerializer(data={
            **request.data,
            'expense': expense.id
        })
        
        if serializer.is_valid():
            serializer.save(payer=request.user)
            expense.refresh_from_db()
            return Response(ExpenseSerializer(expense).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ExpensePaymentViewSet(viewsets.ModelViewSet):
    """CRUD for expense payments."""
    queryset = ExpensePayment.objects.select_related('expense', 'payer')
    serializer_class = ExpensePaymentSerializer
    permission_classes = [FinancePermission]
    
    def perform_create(self, serializer):
        serializer.save(payer=self.request.user)


class OtherIncomeViewSet(viewsets.ModelViewSet):
    """CRUD for other income."""
    queryset = OtherIncome.objects.select_related('received_by')
    serializer_class = OtherIncomeSerializer
    permission_classes = [FinancePermission]
    
    def get_queryset(self):
        qs = super().get_queryset()
        
        date_from = self.request.query_params.get('date_from')
        if date_from:
            qs = qs.filter(date__gte=date_from)
        
        date_to = self.request.query_params.get('date_to')
        if date_to:
            qs = qs.filter(date__lte=date_to)
        
        return qs
    
    def perform_create(self, serializer):
        serializer.save(received_by=self.request.user)


class BankAccountViewSet(viewsets.ModelViewSet):
    """CRUD for bank accounts."""
    queryset = BankAccount.objects.prefetch_related('transactions')
    serializer_class = BankAccountSerializer
    permission_classes = [FinancePermission]
    
    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('active_only'):
            qs = qs.filter(is_active=True)
        return qs
    
    @action(detail=True, methods=['post'])
    def set_default(self, request, pk=None):
        """Set this account as default."""
        account = self.get_object()
        account.is_default = True
        account.save()
        return Response(BankAccountSerializer(account).data)


class BankTransactionViewSet(viewsets.ModelViewSet):
    """CRUD for bank transactions."""
    queryset = BankTransaction.objects.select_related('account', 'recorded_by')
    serializer_class = BankTransactionSerializer
    permission_classes = [FinancePermission]
    
    def get_queryset(self):
        qs = super().get_queryset()
        
        account = self.request.query_params.get('account')
        if account:
            qs = qs.filter(account_id=account)
        
        txn_type = self.request.query_params.get('type')
        if txn_type:
            qs = qs.filter(transaction_type=txn_type)
        
        date_from = self.request.query_params.get('date_from')
        if date_from:
            qs = qs.filter(date__gte=date_from)
        
        date_to = self.request.query_params.get('date_to')
        if date_to:
            qs = qs.filter(date__lte=date_to)
        
        return qs
    
    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)
    
    @action(detail=True, methods=['post'])
    def reconcile(self, request, pk=None):
        """Mark transaction as reconciled."""
        txn = self.get_object()
        txn.is_reconciled = True
        txn.save()
        return Response(BankTransactionSerializer(txn).data)


class EmployeeExpenseViewSet(viewsets.ModelViewSet):
    """CRUD for employee expense claims."""
    queryset = EmployeeExpense.objects.select_related('employee', 'category', 'reviewed_by')
    serializer_class = EmployeeExpenseSerializer
    permission_classes = [FinancePermission]
    
    def get_queryset(self):
        qs = super().get_queryset()
        
        # Regular employees can only see their own
        if not self.request.user.is_staff:
            qs = qs.filter(employee=self.request.user)
        
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        
        return qs
    
    def perform_create(self, serializer):
        serializer.save(employee=self.request.user)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve an expense claim."""
        expense = self.get_object()
        expense.status = 'approved'
        expense.reviewed_by = request.user
        expense.reviewed_at = timezone.now()
        expense.save()
        return Response(EmployeeExpenseSerializer(expense).data)
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject an expense claim."""
        expense = self.get_object()
        expense.status = 'rejected'
        expense.reviewed_by = request.user
        expense.reviewed_at = timezone.now()
        expense.rejection_reason = request.data.get('reason', '')
        expense.save()
        return Response(EmployeeExpenseSerializer(expense).data)
    
    @action(detail=True, methods=['post'])
    def reimburse(self, request, pk=None):
        """Mark expense as reimbursed."""
        expense = self.get_object()
        if expense.status != 'approved':
            return Response({'error': 'Must be approved first'}, status=status.HTTP_400_BAD_REQUEST)
        
        expense.status = 'reimbursed'
        expense.reimbursed_at = timezone.now()
        expense.reimbursement_method = request.data.get('method', 'bank')
        expense.save()
        return Response(EmployeeExpenseSerializer(expense).data)


class EmployeeSalaryViewSet(viewsets.ModelViewSet):
    """CRUD for employee salaries."""
    queryset = EmployeeSalary.objects.select_related('employee').prefetch_related('payments')
    serializer_class = EmployeeSalarySerializer
    permission_classes = [FinancePermission]
    
    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        """Record a salary payment."""
        salary = self.get_object()
        
        payment_data = {
            'salary': salary.id,
            'period_start': request.data.get('period_start'),
            'period_end': request.data.get('period_end'),
            'payment_date': request.data.get('payment_date', date.today()),
            'base_amount': salary.base_amount,
            'deductions': request.data.get('deductions', 0),
            'bonuses': request.data.get('bonuses', 0),
            'payment_method': request.data.get('payment_method', 'bank'),
            'reference': request.data.get('reference', ''),
            'notes': request.data.get('notes', ''),
        }
        
        serializer = SalaryPaymentSerializer(data=payment_data)
        if serializer.is_valid():
            serializer.save(paid_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SalaryPaymentViewSet(viewsets.ModelViewSet):
    """CRUD for salary payments."""
    queryset = SalaryPayment.objects.select_related('salary__employee', 'paid_by')
    serializer_class = SalaryPaymentSerializer
    permission_classes = [FinancePermission]
    
    def perform_create(self, serializer):
        serializer.save(paid_by=self.request.user)


class LenderViewSet(viewsets.ModelViewSet):
    """CRUD for lenders."""
    queryset = Lender.objects.prefetch_related('loans')
    serializer_class = LenderSerializer
    permission_classes = [FinancePermission]
    
    def get_queryset(self):
        qs = super().get_queryset()
        
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(contact_person__icontains=search)
            )
        
        return qs


class LoanViewSet(viewsets.ModelViewSet):
    """CRUD for loans."""
    queryset = Loan.objects.select_related('lender').prefetch_related('repayments')
    serializer_class = LoanSerializer
    permission_classes = [FinancePermission]
    
    def get_queryset(self):
        qs = super().get_queryset()
        
        lender = self.request.query_params.get('lender')
        if lender:
            qs = qs.filter(lender_id=lender)
        
        active_only = self.request.query_params.get('active_only')
        if active_only:
            qs = qs.filter(is_active=True)
        
        return qs
    
    @action(detail=True, methods=['post'])
    def repay(self, request, pk=None):
        """Record a loan repayment."""
        loan = self.get_object()
        
        repayment_data = {
            'loan': loan.id,
            'date': request.data.get('date', date.today()),
            'amount': request.data.get('amount'),
            'principal_portion': request.data.get('principal_portion', 0),
            'interest_portion': request.data.get('interest_portion', 0),
            'payment_method': request.data.get('payment_method', 'bank'),
            'reference': request.data.get('reference', ''),
            'notes': request.data.get('notes', ''),
        }
        
        serializer = LoanRepaymentSerializer(data=repayment_data)
        if serializer.is_valid():
            serializer.save(recorded_by=request.user)
            loan.refresh_from_db()
            return Response(LoanSerializer(loan).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoanRepaymentViewSet(viewsets.ModelViewSet):
    """CRUD for loan repayments."""
    queryset = LoanRepayment.objects.select_related('loan__lender', 'recorded_by')
    serializer_class = LoanRepaymentSerializer
    permission_classes = [FinancePermission]
    
    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


# ======== Financial Dashboard ========

class FinancialDashboardView(APIView):
    """
    Financial dashboard with KPIs.
    Aggregates revenue, COGS, expenses, and accounts payable.
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        # Get period parameters
        period = request.query_params.get('period', 'month')
        today = date.today()
        
        if period == 'today':
            start_date = today
            end_date = today
        elif period == 'week':
            start_date = today - timedelta(days=today.weekday())
            end_date = today
        elif period == 'month':
            start_date = today.replace(day=1)
            end_date = today
        elif period == 'custom':
            try:
                start_str = request.query_params.get('start_date')
                end_str = request.query_params.get('end_date')
                start_date = date.fromisoformat(start_str) if start_str else today.replace(day=1)
                end_date = date.fromisoformat(end_str) if end_str else today
            except (ValueError, TypeError):
                start_date = today.replace(day=1)
                end_date = today
        else:
            start_date = today.replace(day=1)
            end_date = today
        
        # Calculate Revenue (from Orders) - requires orders app
        try:
            from orders.models import Order, OrderItem
            revenue = Order.objects.filter(
                created_at__date__gte=start_date,
                created_at__date__lte=end_date,
                order_status__in=['completed', 'confirmed']
            ).aggregate(total=Sum('total'))['total'] or Decimal('0.00')
            
            # COGS from order items (cost_price × quantity)
            cogs = OrderItem.objects.filter(
                order__created_at__date__gte=start_date,
                order__created_at__date__lte=end_date,
                order__order_status__in=['completed', 'confirmed']
            ).aggregate(
                total=Sum(
                    F('cost_price') * F('quantity'),
                    output_field=DecimalField()
                )
            )['total'] or Decimal('0.00')
        except Exception:
            revenue = Decimal('0.00')
            cogs = Decimal('0.00')
        
        # Gross Profit
        gross_profit = revenue - cogs
        
        # Expenses
        expenses_total = Expense.objects.filter(
            date__gte=start_date,
            date__lte=end_date,
            is_deleted=False
        ).aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')
        
        # Net Profit
        net_profit = gross_profit - expenses_total
        
        # Other Income
        other_income = OtherIncome.objects.filter(
            date__gte=start_date,
            date__lte=end_date,
            is_deleted=False
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        # Add other income to net profit
        net_profit += other_income
        
        # Cash Balance (sum of all bank accounts)
        cash_balance = BankAccount.objects.filter(
            is_active=True
        ).aggregate(total=Sum('current_balance'))['total'] or Decimal('0.00')
        
        # Accounts Receivable (unpaid confirmed orders)
        try:
            from orders.models import Order
            # amount_paid and balance_due are @property, so annotate from payments
            ar_orders = Order.objects.filter(
                order_status__in=['confirmed', 'completed'],
                payment_status__in=['pending', 'partial']
            ).annotate(
                paid=Coalesce(Sum('payments__amount'), Decimal('0.00'))
            ).aggregate(
                total_due=Coalesce(Sum('total'), Decimal('0.00')),
                total_paid=Coalesce(Sum('paid'), Decimal('0.00'))
            )
            accounts_receivable = ar_orders['total_due'] - ar_orders['total_paid']
        except Exception:
            accounts_receivable = Decimal('0.00')
        
        # Accounts Payable breakdown
        outstanding_expenses = Expense.objects.filter(
            payment_status__in=['unpaid', 'partial'],
            is_deleted=False
        ).aggregate(total=Sum('total_amount') - Sum('paid_amount'))['total'] or Decimal('0.00')
        
        unpaid_reimbursements = EmployeeExpense.objects.filter(
            status='approved',
            is_deleted=False
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        # Accrued salaries (simplified - could be more complex)
        accrued_salaries = Decimal('0.00')  # Would need payroll logic
        
        lender_payments_due = Loan.objects.filter(
            is_active=True,
            is_deleted=False
        ).aggregate(total=Sum('principal_amount') - Sum('total_paid'))['total'] or Decimal('0.00')
        
        accounts_payable = {
            'total': outstanding_expenses + unpaid_reimbursements + accrued_salaries + lender_payments_due,
            'company_expenses': outstanding_expenses,
            'employee_reimbursements': unpaid_reimbursements,
            'accrued_salaries': accrued_salaries,
            'lender_payments': lender_payments_due,
        }
        
        data = {
            'revenue': revenue,
            'cogs': cogs,
            'gross_profit': gross_profit,
            'expenses': expenses_total,
            'other_income': other_income,
            'net_profit': net_profit,
            'cash_balance': cash_balance,
            'accounts_receivable': accounts_receivable,
            'accounts_payable': accounts_payable,
            'period': period,
            'start_date': start_date,
            'end_date': end_date,
        }
        
        return Response(data)
