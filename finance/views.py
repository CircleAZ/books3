"""
Views for Finance App.
Includes ViewSets for all models, CSV export, approval workflow, 
audit logging, and Financial Dashboard API with caching.
"""

import csv
import logging
from decimal import Decimal
from datetime import date, timedelta
from django.db.models import Sum, Q, F, DecimalField, Subquery, OuterRef
from django.db.models.functions import Coalesce
from django.http import HttpResponse, StreamingHttpResponse
from django.core.cache import cache
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.pagination import PageNumberPagination
from rest_framework.throttling import UserRateThrottle
from core.permissions import HasRequiredPermission

from .models import (
    ExpenseCategory, Expense, ExpensePayment, OtherIncome,
    BankAccount, BankTransaction, EmployeeExpense, EmployeeSalary,
    SalaryPayment, Lender, Loan, LoanRepayment,
    IncomeCategory, RecurringExpense, CategoryBudget, FinanceAuditLog,
    ExpenseTrip, ExpenseTripItem
)
from .serializers import (
    ExpenseCategorySerializer, ExpenseSerializer, ExpenseCreateSerializer,
    ExpensePaymentSerializer, OtherIncomeSerializer,
    BankAccountSerializer, BankTransactionSerializer,
    EmployeeExpenseSerializer, EmployeeSalarySerializer, SalaryPaymentSerializer,
    LenderSerializer, LoanSerializer, LoanRepaymentSerializer,
    IncomeCategorySerializer, RecurringExpenseSerializer, CategoryBudgetSerializer,
    FinanceAuditLogSerializer, FinancialDashboardSerializer,
    ExpenseTripSerializer, ExpenseTripItemSerializer
)

logger = logging.getLogger(__name__)


# ======== Helpers ========

def _audit_log(action, model_name, object_id, user, details=None):
    """Create an audit log entry for a financial action."""
    FinanceAuditLog.objects.create(
        action=action,
        model_name=model_name,
        object_id=str(object_id),
        user=user,
        details=details or {}
    )


# ======== Pagination & Throttling ========

class FinancePagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class FinanceActionThrottle(UserRateThrottle):
    rate = '30/min'


# ======== Expense ViewSets ========

class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    """CRUD for expense categories."""
    queryset = ExpenseCategory.objects.all()
    serializer_class = ExpenseCategorySerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_expenses'
    pagination_class = FinancePagination
    
    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('active_only'):
            qs = qs.filter(is_active=True)
        return qs


class ExpenseViewSet(viewsets.ModelViewSet):
    """CRUD for expenses with payment support, CSV export, and approval workflow."""
    queryset = Expense.objects.select_related('category', 'created_by', 'approved_by').prefetch_related('payments')
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_expenses'
    pagination_class = FinancePagination
    
    def get_serializer_class(self):
        if self.action == 'create':
            return ExpenseCreateSerializer
        return ExpenseSerializer
    
    def get_queryset(self):
        qs = super().get_queryset()
        
        # Text search
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(payee_name__icontains=search) |
                Q(description__icontains=search) |
                Q(notes__icontains=search)
            )
        
        # Filters
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(payment_status=status_filter)

        approval_filter = self.request.query_params.get('approval')
        if approval_filter:
            qs = qs.filter(approval_status=approval_filter)
        
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
        expense = serializer.save(created_by=self.request.user)
        _audit_log('create', 'Expense', expense.id, self.request.user,
                   {'amount': str(expense.total_amount), 'payee': expense.payee_name})
    
    @action(detail=True, methods=['post'], throttle_classes=[FinanceActionThrottle])
    def add_payment(self, request, pk=None):
        """Add a payment to an expense."""
        expense = self.get_object()
        
        # P0 Fix: Block payments on unapproved expenses
        if expense.approval_status in ('pending', 'rejected'):
            return Response(
                {'error': f'Cannot pay an expense with approval status "{expense.approval_status}". Approve it first.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = ExpensePaymentSerializer(data={
            **request.data,
            'expense': expense.id
        })
        
        if serializer.is_valid():
            payment = serializer.save(payer=request.user)
            _audit_log('add_payment', 'Expense', expense.id, request.user,
                       {'payment_amount': str(payment.amount), 'method': payment.method})
            expense.refresh_from_db()
            return Response(ExpenseSerializer(expense).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], throttle_classes=[FinanceActionThrottle])
    def approve_expense(self, request, pk=None):
        """Approve a company expense (for amounts >= threshold)."""
        expense = self.get_object()
        if expense.approval_status != 'pending':
            return Response({'error': 'Expense is not pending approval.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if expense.created_by == request.user:
            return Response({'error': 'Cannot approve your own expense.'},
                            status=status.HTTP_403_FORBIDDEN)
        expense.approval_status = Expense.ApprovalStatus.APPROVED
        expense.approved_by = request.user
        expense.approved_at = timezone.now()
        expense.save()
        _audit_log('approve_expense', 'Expense', expense.id, request.user,
                   {'amount': str(expense.total_amount)})
        return Response(ExpenseSerializer(expense).data)

    @action(detail=True, methods=['post'], throttle_classes=[FinanceActionThrottle])
    def reject_expense(self, request, pk=None):
        """Reject a company expense."""
        expense = self.get_object()
        if expense.approval_status != 'pending':
            return Response({'error': 'Expense is not pending approval.'},
                            status=status.HTTP_400_BAD_REQUEST)
        expense.approval_status = Expense.ApprovalStatus.REJECTED
        expense.approved_by = request.user
        expense.approved_at = timezone.now()
        expense.save()
        _audit_log('reject_expense', 'Expense', expense.id, request.user,
                   {'reason': request.data.get('reason', '')})
        return Response(ExpenseSerializer(expense).data)

    @staticmethod
    def _csv_safe(value):
        """Prevent CSV formula injection by prefixing dangerous chars."""
        s = str(value) if value else ''
        if s and s[0] in ('=', '+', '-', '@', '\t', '\r'):
            return "'" + s
        return s

    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        """Export filtered expenses as streaming CSV."""
        import io

        def csv_generator():
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(['Date', 'Payee', 'Type', 'Category', 'Description',
                             'Amount', 'Tax', 'Total', 'Paid', 'Status', 'Approval'])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

            safe = ExpenseViewSet._csv_safe
            for exp in self.get_queryset().select_related('category').iterator(chunk_size=500):
                writer.writerow([
                    exp.date, safe(exp.payee_name), safe(exp.payee_type),
                    safe(exp.category.name) if exp.category else '',
                    safe(exp.description[:100]), str(exp.amount), str(exp.tax_amount),
                    str(exp.total_amount), str(exp.paid_amount),
                    exp.payment_status, exp.approval_status
                ])
                yield output.getvalue()
                output.seek(0)
                output.truncate(0)

        response = StreamingHttpResponse(csv_generator(), content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="expenses.csv"'
        _audit_log('export_csv', 'Expense', 'bulk', request.user,
                   {'count': self.get_queryset().count()})
        return response


class ExpensePaymentViewSet(viewsets.ModelViewSet):
    """CRUD for expense payments."""
    queryset = ExpensePayment.objects.select_related('expense', 'recorded_by')
    serializer_class = ExpensePaymentSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_expenses'
    pagination_class = FinancePagination
    
    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


# ======== Income ViewSets ========

class IncomeCategoryViewSet(viewsets.ModelViewSet):
    """CRUD for income categories."""
    queryset = IncomeCategory.objects.all()
    serializer_class = IncomeCategorySerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_income'
    pagination_class = FinancePagination

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('active_only'):
            qs = qs.filter(is_active=True)
        return qs


class OtherIncomeViewSet(viewsets.ModelViewSet):
    """CRUD for other income (non-sales revenue)."""
    queryset = OtherIncome.objects.select_related('category', 'created_by')
    serializer_class = OtherIncomeSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_income'
    pagination_class = FinancePagination
    
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
        serializer.save(created_by=self.request.user)


# ======== Banking ViewSets ========

class BankAccountViewSet(viewsets.ModelViewSet):
    """CRUD for bank accounts."""
    queryset = BankAccount.objects.all()
    serializer_class = BankAccountSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_banking'
    pagination_class = FinancePagination
    
    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('active_only'):
            qs = qs.filter(is_active=True)
        return qs
    
    @action(detail=True, methods=['post'], throttle_classes=[FinanceActionThrottle])
    def set_default(self, request, pk=None):
        """Set this account as default."""
        account = self.get_object()
        account.is_default = True
        account.save()
        _audit_log('set_default', 'BankAccount', account.id, request.user)
        return Response(BankAccountSerializer(account).data)


class BankTransactionViewSet(viewsets.ModelViewSet):
    """CRUD for bank transactions."""
    queryset = BankTransaction.objects.select_related('bank_account', 'created_by')
    serializer_class = BankTransactionSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_banking'
    pagination_class = FinancePagination
    
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
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=['post'], throttle_classes=[FinanceActionThrottle])
    def reconcile(self, request, pk=None):
        """Mark transaction as reconciled."""
        txn = self.get_object()
        txn.is_reconciled = True
        txn.save()
        _audit_log('reconcile', 'BankTransaction', txn.id, request.user)
        return Response(BankTransactionSerializer(txn).data)


# ======== Employee Finance ViewSets ========

class EmployeeExpenseViewSet(viewsets.ModelViewSet):
    """CRUD for employee expenses."""
    queryset = EmployeeExpense.objects.select_related('employee', 'category', 'approved_by')
    serializer_class = EmployeeExpenseSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_expenses'
    pagination_class = FinancePagination
    
    def get_queryset(self):
        qs = super().get_queryset()
        
        # RBAC Fix: Check roles from UserRole table (not the orphaned User.role CharField)
        user = self.request.user
        from settings_app.models import Role
        user_role_names = set(
            Role.objects.filter(role_users__user=user).values_list('name', flat=True)
        )
        is_finance_role = bool(
            user_role_names & {'Admin', 'Manager', 'Accountant'}
        )
        
        if not user.is_superuser and not is_finance_role:
            qs = qs.filter(employee=user)
        
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        
        return qs
    
    def perform_create(self, serializer):
        serializer.save(employee=self.request.user)
    
    @action(detail=True, methods=['post'], throttle_classes=[FinanceActionThrottle])
    def approve(self, request, pk=None):
        """Approve an expense claim."""
        expense = self.get_object()
        if expense.employee == request.user:
            return Response(
                {'error': 'You cannot approve your own expense claim.'},
                status=status.HTTP_403_FORBIDDEN
            )
        expense.status = 'approved'
        expense.approved_by = request.user
        expense.approved_at = timezone.now()
        expense.save()
        _audit_log('approve', 'EmployeeExpense', expense.id, request.user,
                   {'employee': expense.employee.username, 'amount': str(expense.amount)})
        return Response(EmployeeExpenseSerializer(expense).data)
    
    @action(detail=True, methods=['post'], throttle_classes=[FinanceActionThrottle])
    def reject(self, request, pk=None):
        """Reject an expense claim."""
        expense = self.get_object()
        if expense.employee == request.user:
            return Response(
                {'error': 'You cannot reject your own expense claim.'},
                status=status.HTTP_403_FORBIDDEN
            )
        expense.status = 'rejected'
        expense.approved_by = request.user
        expense.approved_at = timezone.now()
        expense.rejection_reason = request.data.get('reason', '')
        expense.save()
        _audit_log('reject', 'EmployeeExpense', expense.id, request.user,
                   {'reason': expense.rejection_reason})
        return Response(EmployeeExpenseSerializer(expense).data)
    
    @action(detail=True, methods=['post'], throttle_classes=[FinanceActionThrottle])
    def reimburse(self, request, pk=None):
        """Mark expense as reimbursed."""
        expense = self.get_object()
        if expense.status != 'approved':
            return Response({'error': 'Must be approved first'}, status=status.HTTP_400_BAD_REQUEST)
        
        expense.status = 'reimbursed'
        expense.reimbursed_at = timezone.now()
        expense.reimbursement_method = request.data.get('method', 'bank')
        expense.save()
        _audit_log('reimburse', 'EmployeeExpense', expense.id, request.user,
                   {'method': expense.reimbursement_method, 'amount': str(expense.amount)})
        return Response(EmployeeExpenseSerializer(expense).data)


class EmployeeSalaryViewSet(viewsets.ModelViewSet):
    """CRUD for employee salary records."""
    queryset = EmployeeSalary.objects.select_related('employee')
    serializer_class = EmployeeSalarySerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_salaries'
    pagination_class = FinancePagination
    
    @action(detail=True, methods=['post'], throttle_classes=[FinanceActionThrottle])
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
        
        # P1 Fix: Duplicate salary period check
        period_start = payment_data['period_start']
        period_end = payment_data['period_end']
        if period_start and period_end:
            existing = SalaryPayment.objects.filter(
                salary=salary,
                is_deleted=False,
                period_start__lte=period_end,
                period_end__gte=period_start
            ).exists()
            if existing:
                return Response(
                    {'error': f'A salary payment already exists for an overlapping period ({period_start} to {period_end}).'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        serializer = SalaryPaymentSerializer(data=payment_data)
        if serializer.is_valid():
            payment = serializer.save(paid_by=request.user)
            _audit_log('salary_payment', 'SalaryPayment', payment.id, request.user,
                       {'employee': salary.employee.username, 'amount': str(payment.net_amount)})
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SalaryPaymentViewSet(viewsets.ModelViewSet):
    """CRUD for salary payments."""
    queryset = SalaryPayment.objects.select_related('salary__employee', 'paid_by')
    serializer_class = SalaryPaymentSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_salaries'
    pagination_class = FinancePagination
    
    def perform_create(self, serializer):
        serializer.save(paid_by=self.request.user)


# ======== Lender ViewSets ========

class LenderViewSet(viewsets.ModelViewSet):
    """CRUD for lenders."""
    queryset = Lender.objects.prefetch_related('loans')
    serializer_class = LenderSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_loans'
    pagination_class = FinancePagination
    
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
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_loans'
    pagination_class = FinancePagination
    
    def get_queryset(self):
        qs = super().get_queryset()
        
        lender = self.request.query_params.get('lender')
        if lender:
            qs = qs.filter(lender_id=lender)
        
        active_only = self.request.query_params.get('active_only')
        if active_only:
            qs = qs.filter(is_active=True)
        
        return qs
    
    @action(detail=True, methods=['post'], throttle_classes=[FinanceActionThrottle])
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
            repayment = serializer.save(recorded_by=request.user)
            _audit_log('loan_repayment', 'LoanRepayment', repayment.id, request.user,
                       {'loan': str(loan.id), 'amount': str(repayment.amount)})
            loan.refresh_from_db()
            return Response(LoanSerializer(loan).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoanRepaymentViewSet(viewsets.ModelViewSet):
    """CRUD for loan repayments."""
    queryset = LoanRepayment.objects.select_related('loan__lender', 'recorded_by')
    serializer_class = LoanRepaymentSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_loans'
    pagination_class = FinancePagination
    
    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


# ======== New Feature ViewSets ========

class RecurringExpenseViewSet(viewsets.ModelViewSet):
    """CRUD for recurring expense templates."""
    queryset = RecurringExpense.objects.select_related('category', 'created_by')
    serializer_class = RecurringExpenseSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_expenses'
    pagination_class = FinancePagination

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('active_only'):
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], throttle_classes=[FinanceActionThrottle])
    def generate(self, request, pk=None):
        """Manually generate the next expense from this recurring template."""
        from dateutil.relativedelta import relativedelta

        try:
            # P0 Fix: Atomic + select_for_update to prevent duplicate generation
            with transaction.atomic():
                recurring = RecurringExpense.objects.select_for_update().get(pk=pk)

                if not recurring.is_active:
                    return Response({'error': 'Template is inactive.'}, status=status.HTTP_400_BAD_REQUEST)
                if recurring.end_date and recurring.next_date > recurring.end_date:
                    return Response({'error': 'Past end date.'}, status=status.HTTP_400_BAD_REQUEST)

                expense = Expense.objects.create(
                    date=recurring.next_date,
                    category=recurring.category,
                    payee_type=recurring.payee_type,
                    payee_name=recurring.payee_name,
                    description=recurring.description or f'Recurring: {recurring.name}',
                    amount=recurring.amount,
                    tax_amount=recurring.tax_amount,
                    total_amount=recurring.amount + recurring.tax_amount,
                    created_by=request.user
                )

                # Advance next_date
                freq_map = {
                    'daily': timedelta(days=1),
                    'weekly': timedelta(weeks=1),
                    'monthly': relativedelta(months=1),
                    'quarterly': relativedelta(months=3),
                    'yearly': relativedelta(years=1),
                }
                recurring.next_date += freq_map.get(recurring.frequency, relativedelta(months=1))
                recurring.save()

            _audit_log('generate_recurring', 'RecurringExpense', recurring.id, request.user,
                       {'expense_id': str(expense.id)})
            return Response(ExpenseSerializer(expense).data, status=status.HTTP_201_CREATED)
        except RecurringExpense.DoesNotExist:
            return Response({'error': 'Recurring expense not found.'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.exception(f'Error generating expense from recurring template {pk}')
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CategoryBudgetViewSet(viewsets.ModelViewSet):
    """CRUD for category budgets."""
    queryset = CategoryBudget.objects.select_related('category')
    serializer_class = CategoryBudgetSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_budgets'
    pagination_class = FinancePagination

    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category_id=category)
        
        # P2 Fix: Annotate spent/remaining/utilization to eliminate N+1 queries
        spent_subquery = Expense.objects.filter(
            category=OuterRef('category'),
            date__gte=OuterRef('period_start'),
            date__lte=OuterRef('period_end'),
            is_deleted=False
        ).values('category').annotate(
            total=Sum('total_amount')
        ).values('total')
        
        qs = qs.annotate(
            _spent=Coalesce(Subquery(spent_subquery), Decimal('0.00'), output_field=DecimalField()),
        )
        return qs


class ExpenseTripViewSet(viewsets.ModelViewSet):
    """CRUD for expense trips with reimbursement actions."""
    queryset = ExpenseTrip.objects.prefetch_related(
        'items', 'items__category', 'items__paid_by_employee',
        'items__expense', 'items__employee_expense'
    ).select_related('created_by')
    serializer_class = ExpenseTripSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_expenses'
    pagination_class = FinancePagination

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(purpose__icontains=search)
            )
        settlement = self.request.query_params.get('settlement')
        if settlement:
            qs = qs.filter(settlement_status=settlement)
        return qs

    def _log(self, action, trip, details=None):
        """Helper: create a FinanceAuditLog entry for trip actions."""
        FinanceAuditLog.objects.create(
            action=action,
            model_name='ExpenseTrip',
            object_id=str(trip.id),
            user=self.request.user,
            details=details or {}
        )

    def perform_create(self, serializer):
        trip = serializer.save()
        items = trip.items.filter(is_deleted=False)
        self._log('trip_created', trip, {
            'name': trip.name,
            'date': str(trip.date),
            'items_count': items.count(),
            'total': str(sum(i.amount for i in items)),
        })

    def perform_update(self, serializer):
        trip = serializer.save()
        self._log('trip_updated', trip, {'name': trip.name})

    def perform_destroy(self, instance):
        """Soft-delete trip AND all linked Expense/EmployeeExpense records."""
        for item in instance.items.filter(is_deleted=False):
            if item.expense:
                item.expense.soft_delete()
            if item.employee_expense:
                item.employee_expense.soft_delete()
        self._log('trip_deleted', instance, {'name': instance.name})
        instance.soft_delete()

    @action(detail=True, methods=['post'], url_path='reimburse-employee')
    def reimburse_employee(self, request, pk=None):
        """Reimburse all items for a specific employee in this trip."""
        trip = self.get_object()
        employee_id = request.data.get('employee_id')
        if not employee_id:
            return Response(
                {'error': 'employee_id is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        emp_items = trip.items.filter(
            paid_by_type='employee',
            paid_by_employee_id=employee_id,
            is_deleted=False
        )
        if not emp_items.exists():
            return Response(
                {'error': 'No items found for this employee.'},
                status=status.HTTP_404_NOT_FOUND
            )
        now = timezone.now()
        method = request.data.get('method', 'cash')
        count = 0
        for item in emp_items:
            if item.employee_expense and item.employee_expense.status != 'reimbursed':
                item.employee_expense.status = 'reimbursed'
                item.employee_expense.reimbursed_at = now
                item.employee_expense.reimbursement_method = f"{method} (Trip: {trip.name})"
                item.employee_expense.save()
                count += 1
        trip.recalculate_settlement()
        self._log('trip_reimbursed', trip, {
            'employee_id': str(employee_id),
            'items_reimbursed': count,
            'method': method,
        })
        return Response(ExpenseTripSerializer(trip).data)

    @action(detail=True, methods=['post'], url_path='reimburse-all')
    def reimburse_all(self, request, pk=None):
        """Reimburse all employee items in this trip."""
        trip = self.get_object()
        emp_items = trip.items.filter(
            paid_by_type='employee',
            is_deleted=False
        )
        now = timezone.now()
        method = request.data.get('method', 'cash')
        count = 0
        for item in emp_items:
            if item.employee_expense and item.employee_expense.status != 'reimbursed':
                item.employee_expense.status = 'reimbursed'
                item.employee_expense.reimbursed_at = now
                item.employee_expense.reimbursement_method = f"{method} (Trip: {trip.name})"
                item.employee_expense.save()
                count += 1
        trip.recalculate_settlement()
        self._log('trip_reimbursed_all', trip, {
            'items_reimbursed': count,
            'method': method,
        })
        return Response({
            'message': f'{count} items reimbursed.',
            'trip': ExpenseTripSerializer(trip).data
        })


class FinanceAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only access to audit logs."""
    queryset = FinanceAuditLog.objects.select_related('user')
    serializer_class = FinanceAuditLogSerializer
    permission_classes = [IsAdminUser]
    pagination_class = FinancePagination

    def get_queryset(self):
        qs = super().get_queryset()
        model = self.request.query_params.get('model')
        if model:
            qs = qs.filter(model_name=model)
        action_filter = self.request.query_params.get('action')
        if action_filter:
            qs = qs.filter(action=action_filter)
        return qs


# ======== Financial Dashboard ========

class FinancialDashboardView(APIView):
    """
    Financial dashboard with KPIs and caching.
    Aggregates revenue, COGS, expenses, and accounts payable.
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
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
        elif period == 'quarter':
            month = today.month
            if month in [4, 5, 6]:
                start_date = date(today.year, 4, 1)
            elif month in [7, 8, 9]:
                start_date = date(today.year, 7, 1)
            elif month in [10, 11, 12]:
                start_date = date(today.year, 10, 1)
            else:
                start_date = date(today.year, 1, 1)
            end_date = today
        elif period == 'year':
            if today.month >= 4:
                start_date = date(today.year, 4, 1)
            else:
                start_date = date(today.year - 1, 4, 1)
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

        # Cache key based on period + dates
        cache_key = f"finance_dashboard_{period}_{start_date}_{end_date}"
        cached = cache.get(cache_key)
        if cached:
            return Response(cached)
        
        # Calculate Revenue
        try:
            from orders.models import Order, OrderItem
            revenue = Order.objects.filter(
                created_at__date__gte=start_date,
                created_at__date__lte=end_date,
                order_status__in=['completed', 'confirmed']
            ).aggregate(total=Sum('total'))['total'] or Decimal('0.00')
            
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
        except ImportError:
            logger.info("Orders app not installed — revenue and COGS set to 0")
            revenue = Decimal('0.00')
            cogs = Decimal('0.00')
        except Exception as e:
            logger.error(f"Dashboard revenue calculation failed: {e}", exc_info=True)
            revenue = Decimal('0.00')
            cogs = Decimal('0.00')
        
        gross_profit = revenue - cogs
        
        expenses_total = Expense.objects.filter(
            date__gte=start_date,
            date__lte=end_date,
            is_deleted=False
        ).aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')
        
        # P0 Fix: Include salaries, reimbursements, and loan interest in net profit
        salaries_total = SalaryPayment.objects.filter(
            payment_date__gte=start_date,
            payment_date__lte=end_date,
            is_deleted=False
        ).aggregate(total=Sum('net_amount'))['total'] or Decimal('0.00')
        
        reimbursements_total = EmployeeExpense.objects.filter(
            date__gte=start_date,
            date__lte=end_date,
            status='reimbursed',
            is_deleted=False
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        loan_interest = LoanRepayment.objects.filter(
            date__gte=start_date,
            date__lte=end_date,
            is_deleted=False
        ).aggregate(total=Sum('interest_portion'))['total'] or Decimal('0.00')
        
        total_opex = expenses_total + salaries_total + reimbursements_total + loan_interest
        net_profit = gross_profit - total_opex
        
        other_income = OtherIncome.objects.filter(
            date__gte=start_date,
            date__lte=end_date,
            is_deleted=False
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        net_profit += other_income
        
        cash_balance = BankAccount.objects.filter(
            is_active=True
        ).aggregate(total=Sum('current_balance'))['total'] or Decimal('0.00')
        
        try:
            from orders.models import Order
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
        except ImportError:
            accounts_receivable = Decimal('0.00')
        except Exception as e:
            logger.error(f"Dashboard AR calculation failed: {e}", exc_info=True)
            accounts_receivable = Decimal('0.00')
        
        outstanding_expenses = Expense.objects.filter(
            payment_status__in=['unpaid', 'partial'],
            is_deleted=False
        ).aggregate(total=Sum('total_amount') - Sum('paid_amount'))['total'] or Decimal('0.00')
        
        unpaid_reimbursements = EmployeeExpense.objects.filter(
            status='approved',
            is_deleted=False
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        accrued_salaries = Decimal('0.00')
        
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

        # Cache for 5 minutes (today period cached for 1 minute)
        ttl = 60 if period == 'today' else 300
        cache.set(cache_key, data, timeout=ttl)
        
        return Response(data)
