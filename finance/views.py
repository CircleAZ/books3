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
from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.pagination import PageNumberPagination
from rest_framework.throttling import UserRateThrottle
from core.permissions import HasRequiredPermission, HasElevatedAuth

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
    queryset = Expense.objects.all()
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_expenses'
    pagination_class = FinancePagination
    
    def get_serializer_class(self):
        if self.action == 'create':
            return ExpenseCreateSerializer
        return ExpenseSerializer
    
    def get_queryset(self):
        # Lean path for list — no payments prefetch
        if self.action == 'list':
            qs = Expense.objects.select_related('category', 'created_by', 'approved_by')
        else:
            qs = Expense.objects.select_related('category', 'created_by', 'approved_by').prefetch_related('payments')
        
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
        from .services import LedgerService
        from django.db import transaction
        with transaction.atomic():
            payment = serializer.save(payer=self.request.user)
            LedgerService.process_withdrawal(
                amount=payment.amount,
                source_bank=payment.source_bank,
                source_wallet=payment.source_wallet,
                reference=payment.reference or f"expense_{payment.expense.id}",
                description=f"Payment for Expense #{payment.expense.id}",
                user=self.request.user
            )


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
    permission_map = {
        'list': ['finance.manage_banking', 'settings.manage_payments'],
        'retrieve': ['finance.manage_banking', 'settings.manage_payments'],
    }
    pagination_class = FinancePagination
    
    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('active_only'):
            qs = qs.filter(is_active=True)
        return qs

    def get_permissions(self):
        perms = super().get_permissions()
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'set_default']:
            perms.append(HasElevatedAuth())
        return perms
    
    @action(detail=True, methods=['post'], throttle_classes=[FinanceActionThrottle])
    def set_default(self, request, pk=None):
        """Set this account as default."""
        account = self.get_object()
        account.is_default = True
        account.save()
        _audit_log('set_default', 'BankAccount', account.id, request.user)
        return Response(BankAccountSerializer(account).data)

    def perform_destroy(self, instance):
        """Catch ProtectedError and return a clear message instead of 500."""
        from django.db.models import ProtectedError
        try:
            instance.delete()
        except ProtectedError as e:
            # Extract the names of blocking objects
            blocking = [str(obj) for obj in list(e.protected_objects)[:5]]
            raise serializers.ValidationError({
                'error': f'Cannot delete this bank account. It is still linked to: {", ".join(blocking)}. '
                         f'Remove those references first.'
            })


from rest_framework import mixins

class BankTransactionViewSet(mixins.CreateModelMixin,
                             mixins.RetrieveModelMixin,
                             mixins.ListModelMixin,
                             viewsets.GenericViewSet):
    """
    Immutable ledger for bank transactions.
    Supports Create, Read, and List ONLY. Update and Delete are permanently disabled.
    """
    queryset = BankTransaction.objects.select_related('account', 'recorded_by')
    serializer_class = BankTransactionSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_banking'
    pagination_class = FinancePagination
    
    def get_permissions(self):
        perms = super().get_permissions()
        if self.action == 'create':
            perms.append(HasElevatedAuth())
        return perms
    
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
    """CRUD for employee expenses.
    
    Staff can submit claims (create) and view their own (list/retrieve).
    Finance roles (Admin/Manager/Accountant) can view all and approve/reject/reimburse.
    """
    queryset = EmployeeExpense.objects.select_related('employee', 'category', 'reviewed_by')
    serializer_class = EmployeeExpenseSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_expenses'
    permission_map = {
        'list': None,       # Any authenticated user (queryset filters to own)
        'retrieve': None,   # Any authenticated user (queryset filters to own)
        'create': None,     # Any authenticated user can submit claims
        'approve': 'finance.approve_expenses',
        'reject': 'finance.approve_expenses',
        'reimburse': 'finance.approve_expenses',
    }
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
        from .services import LedgerService
        from django.db import transaction
        with transaction.atomic():
            payment = serializer.save(paid_by=self.request.user)
            LedgerService.process_withdrawal(
                amount=payment.net_amount,
                source_bank=payment.source_bank,
                source_wallet=payment.source_wallet,
                reference=payment.reference or f"salary_{payment.id}",
                description=f"Salary Payment to {payment.salary.employee.username}",
                user=self.request.user
            )


# ======== Lender ViewSets ========

class LenderViewSet(viewsets.ModelViewSet):
    """CRUD for lenders."""
    queryset = Lender.objects.all()
    serializer_class = LenderSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_loans'
    pagination_class = FinancePagination
    
    def get_queryset(self):
        # Lean for list — no loans prefetch
        if self.action == 'list':
            qs = Lender.objects.all()
        else:
            qs = Lender.objects.prefetch_related('loans')
        
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(contact_person__icontains=search)
            )
        
        return qs


class LoanViewSet(viewsets.ModelViewSet):
    """CRUD for loans."""
    queryset = Loan.objects.all()
    serializer_class = LoanSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_loans'
    pagination_class = FinancePagination
    
    def get_queryset(self):
        # Lean for list — no repayments prefetch
        if self.action == 'list':
            qs = Loan.objects.select_related('lender')
        else:
            qs = Loan.objects.select_related('lender').prefetch_related('repayments')
        
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

    @action(detail=True, methods=['post'], throttle_classes=[FinanceActionThrottle])
    def disburse(self, request, pk=None):
        """Record a loan disbursement into a bank account or cash wallet."""
        from django.db import transaction as db_transaction
        from decimal import Decimal

        loan = self.get_object()
        amount = Decimal(str(request.data.get('amount', 0)))
        destination_bank_id = request.data.get('destination_bank')
        destination_wallet_id = request.data.get('destination_wallet')
        disburse_date = request.data.get('date', date.today())
        reference = request.data.get('reference', '')
        notes = request.data.get('notes', '')

        if amount <= 0:
            return Response({'error': 'Amount must be positive.'}, status=status.HTTP_400_BAD_REQUEST)

        remaining = loan.principal_amount - loan.disbursed_amount
        if amount > remaining:
            return Response(
                {'error': f'Amount ({amount}) exceeds remaining undisbursed principal ({remaining}).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not destination_bank_id and not destination_wallet_id:
            return Response({'error': 'Must specify a destination bank account or cash wallet.'},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            with db_transaction.atomic():
                description = f"Loan disbursement from {loan.lender.name} - {loan.loan_number or loan.id}"

                if destination_bank_id:
                    bank_account = BankAccount.objects.get(pk=destination_bank_id)
                    BankTransaction.objects.create(
                        account=bank_account,
                        transaction_type='deposit',
                        date=disburse_date,
                        amount=amount,
                        description=description,
                        reference=reference,
                        related_loan=loan,
                        recorded_by=request.user,
                    )
                elif destination_wallet_id:
                    from .models import CashWallet, CashWalletTransaction
                    wallet = CashWallet.objects.select_for_update().get(pk=destination_wallet_id)
                    new_balance = wallet.balance + amount
                    CashWalletTransaction.objects.create(
                        wallet=wallet,
                        transaction_type='deposit',
                        amount=amount,
                        description=description,
                        reference_id=reference,
                        related_loan=loan,
                        balance_after=new_balance,
                        date=disburse_date,
                        created_by=request.user,
                    )
                    wallet.balance = new_balance
                    wallet.save()

                # Update loan disbursed_amount
                Loan.objects.filter(pk=loan.pk).update(
                    disbursed_amount=F('disbursed_amount') + amount
                )

            _audit_log('loan_disbursement', 'Loan', loan.id, request.user,
                       {'amount': str(amount), 'destination_bank': destination_bank_id or '',
                        'destination_wallet': destination_wallet_id or ''})
            loan.refresh_from_db()
            return Response(LoanSerializer(loan).data)
        except BankAccount.DoesNotExist:
            return Response({'error': 'Bank account not found.'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.exception(f'Error disbursing loan {pk}')
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def perform_destroy(self, instance):
        """Catch ProtectedError on loan deletion."""
        from django.db.models import ProtectedError
        try:
            _audit_log('delete', 'Loan', instance.id, self.request.user,
                       {'lender': instance.lender.name, 'principal': str(instance.principal_amount)})
            instance.delete()
        except ProtectedError as e:
            blocking = [str(obj) for obj in list(e.protected_objects)[:5]]
            raise serializers.ValidationError({
                'error': f'Cannot delete this loan. It is still linked to: {", ".join(blocking)}. '
                         f'Remove those references first.'
            })


class LoanRepaymentViewSet(viewsets.ModelViewSet):
    """CRUD for loan repayments."""
    queryset = LoanRepayment.objects.select_related('loan__lender', 'recorded_by')
    serializer_class = LoanRepaymentSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_loans'
    pagination_class = FinancePagination
    
    def perform_create(self, serializer):
        from .services import LedgerService
        from django.db import transaction
        with transaction.atomic():
            payment = serializer.save(recorded_by=self.request.user)
            LedgerService.process_withdrawal(
                amount=payment.amount,
                source_bank=payment.source_bank,
                source_wallet=payment.source_wallet,
                reference=payment.reference or f"loan_{payment.loan.id}",
                description=f"Loan Repayment to {payment.loan.lender.name}",
                user=self.request.user
            )


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
    queryset = ExpenseTrip.objects.all()
    serializer_class = ExpenseTripSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_expenses'
    pagination_class = FinancePagination

    def get_queryset(self):
        # Lean for list — no item prefetch
        if self.action == 'list':
            qs = ExpenseTrip.objects.select_related('created_by')
        else:
            qs = ExpenseTrip.objects.prefetch_related(
                'items', 'items__category', 'items__paid_by_employee',
                'items__expense', 'items__employee_expense'
            ).select_related('created_by')
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

# ======== Cash Flow ViewSets ========

from .models import CashWallet, CashTransfer
from .serializers import CashWalletSerializer, CashTransferSerializer

class CashWalletViewSet(viewsets.ModelViewSet):
    """CRUD for cash wallets."""
    queryset = CashWallet.objects.all().select_related('owner')
    serializer_class = CashWalletSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_banking'
    permission_map = {
        'list': ['finance.manage_banking', 'orders.create_orders'],
        'retrieve': ['finance.manage_banking', 'orders.create_orders'],
    }
    pagination_class = FinancePagination
    
    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('active_only'):
            qs = qs.filter(is_active=True)
            
        # If superuser or has manage_banking role, see all wallets
        if self.request.user.is_superuser or HasRequiredPermission._check_rbac(self.request.user, 'finance.manage_banking'):
            return qs
            
        # Normal cashier sees only their own or system wallets
        return qs.filter(Q(owner=self.request.user) | Q(is_system=True))

    def get_permissions(self):
        perms = super().get_permissions()
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            perms.append(HasElevatedAuth())
        return perms

    def perform_create(self, serializer):
        """Auto-set is_system=True when no owner is specified (company wallet)."""
        owner = serializer.validated_data.get('owner')
        serializer.save(is_system=(owner is None))

class CashTransferViewSet(viewsets.ModelViewSet):
    """CRUD for cash transfers with peer review."""
    queryset = CashTransfer.objects.select_related('source_wallet', 'destination_wallet', 'destination_bank', 'initiated_by', 'approved_by')
    serializer_class = CashTransferSerializer
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_banking'
    pagination_class = FinancePagination
    
    def create(self, request, *args, **kwargs):
        """Override create to enforce idempotency key for duplicate prevention."""
        idempotency_key = request.headers.get('X-Idempotency-Key')
        if idempotency_key:
            from django.core.cache import cache
            cache_key = f"cashtransfer_idempotency_{request.user.id}_{idempotency_key}"
            cached_transfer_id = cache.get(cache_key)
            if cached_transfer_id:
                # Duplicate request — return the already-created transfer
                try:
                    from .models import CashTransfer
                    existing_transfer = CashTransfer.objects.get(pk=cached_transfer_id)
                    serializer = self.get_serializer(existing_transfer)
                    return Response(serializer.data, status=status.HTTP_200_OK)
                except Exception:
                    pass  # Cache stale, proceed with creation

        response = super().create(request, *args, **kwargs)

        if idempotency_key and response.status_code == 201:
            from django.core.cache import cache
            cache_key = f"cashtransfer_idempotency_{request.user.id}_{idempotency_key}"
            transfer_id = response.data.get('id')
            if transfer_id:
                cache.set(cache_key, transfer_id, timeout=300)

        return response
    
    def perform_create(self, serializer):
        serializer.save(initiated_by=self.request.user)
        
    @action(detail=True, methods=['post'], throttle_classes=[FinanceActionThrottle])
    def approve(self, request, pk=None):
        transfer = self.get_object()
        if transfer.status != 'pending':
            return Response({'error': 'Transfer is not pending.'}, status=status.HTTP_400_BAD_REQUEST)
        if transfer.initiated_by == request.user and not request.user.is_superuser:
            return Response({'error': 'Cannot approve your own transfer. Requires peer manager review.'}, status=status.HTTP_403_FORBIDDEN)
            
        from .services import LedgerService
        from django.db import transaction
        from django.core.exceptions import ValidationError
        
        try:
            with transaction.atomic():
                transfer.status = 'approved'
                transfer.approved_by = request.user
                transfer.clean()
                transfer.save()
                
                # Atomic ledger transfer
                LedgerService.process_withdrawal(
                    amount=transfer.amount,
                    source_wallet=transfer.source_wallet,
                    description=f"Transfer to {transfer.destination_wallet.name if transfer.destination_wallet else transfer.destination_bank.name}",
                    user=request.user
                )
                LedgerService.process_deposit(
                    amount=transfer.amount,
                    destination_bank=transfer.destination_bank,
                    destination_wallet=transfer.destination_wallet,
                    description=f"Transfer from {transfer.source_wallet.name}",
                    user=request.user
                )
                
        except ValidationError as e:
            # Catch model-level or LedgerService insufficient funds errors to prevent 500
            return Response({'error': e.messages[0] if hasattr(e, 'messages') else str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
        return Response(CashTransferSerializer(transfer).data)
        
    @action(detail=True, methods=['post'], throttle_classes=[FinanceActionThrottle])
    def reject(self, request, pk=None):
        transfer = self.get_object()
        if transfer.status != 'pending':
            return Response({'error': 'Transfer is not pending.'}, status=status.HTTP_400_BAD_REQUEST)
        transfer.status = 'rejected'
        transfer.save()
        return Response(CashTransferSerializer(transfer).data)

# ======== Unified Financial Ledger ========

class AllTransactionsViewSet(viewsets.ViewSet):
    """
    Unified Ledger consolidating Bank and Cash Wallet transactions.
    Tracks exact money movement and provides rich drill-down metadata.
    """
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_banking'

    def list(self, request):
        from finance.models import BankTransaction, CashWalletTransaction, Expense, Loan, SalaryPayment
        from orders.models import Order
        from django.db.models import Q, Value, CharField, F
        from rest_framework.exceptions import ValidationError
        
        # 1. Filters with 500 Error Shield
        try:
            date_from = request.query_params.get('date_from')
            date_to = request.query_params.get('date_to')
            txn_type = request.query_params.get('transaction_type')
            source = request.query_params.get('source') # 'bank' or 'wallet'
            min_amount = request.query_params.get('min_amount')
            max_amount = request.query_params.get('max_amount')
            search = request.query_params.get('search')
            
            bt_qs = BankTransaction.objects.all()
            cw_qs = CashWalletTransaction.objects.all()
            
            if date_from:
                bt_qs = bt_qs.filter(date__gte=date_from)
                cw_qs = cw_qs.filter(date__gte=date_from)
            if date_to:
                bt_qs = bt_qs.filter(date__lte=date_to)
                cw_qs = cw_qs.filter(date__lte=date_to)
            if txn_type:
                bt_qs = bt_qs.filter(transaction_type=txn_type)
                cw_qs = cw_qs.filter(transaction_type=txn_type)
            if min_amount:
                bt_qs = bt_qs.filter(amount__gte=float(min_amount))
                cw_qs = cw_qs.filter(amount__gte=float(min_amount))
            if max_amount:
                bt_qs = bt_qs.filter(amount__lte=float(max_amount))
                cw_qs = cw_qs.filter(amount__lte=float(max_amount))
                
            if search:
                # Defeating the Architect: Strip wildcards and enforce minimum length
                search = search.replace('%', '').replace('_', '').strip()
                if len(search) < 3:
                    raise ValidationError("Search query must be at least 3 characters long after ignoring wildcards.")
                    
                # We search across description and reference.
                bt_qs = bt_qs.filter(Q(reference__icontains=search) | Q(description__icontains=search))
                cw_qs = cw_qs.filter(Q(reference_id__icontains=search) | Q(description__icontains=search))
        except (ValueError, TypeError):
            raise ValidationError("Invalid filter parameters provided.")
        except Exception as e:
            from django.core.exceptions import ValidationError as DjangoValidationError
            if isinstance(e, DjangoValidationError):
                raise ValidationError("Invalid date or filter parameters provided.")
            raise e
            
        # Annotate Common Fields
        bt_values = bt_qs.annotate(
            source_type=Value('bank', output_field=CharField()),
            source_name=F('account__name'),
            source_id=F('account_id'),
            ref=F('reference'),
            user_name=F('recorded_by__username')
        ).values('id', 'date', 'transaction_type', 'amount', 'ref', 'description', 'source_type', 'source_name', 'source_id', 'created_at', 'user_name')
        
        cw_values = cw_qs.annotate(
            source_type=Value('wallet', output_field=CharField()),
            source_name=F('wallet__name'),
            source_id=F('wallet_id'),
            ref=F('reference_id'),
            user_name=F('created_by__username')
        ).values('id', 'date', 'transaction_type', 'amount', 'ref', 'description', 'source_type', 'source_name', 'source_id', 'created_at', 'user_name')
        
        if source == 'bank':
            unified = bt_values
        elif source == 'wallet':
            unified = cw_values
        else:
            unified = bt_values.union(cw_values)
            
        unified = unified.order_by('-date', '-created_at')
        
        # Defeating the Arbitrageur: Cap pagination depth to prevent OOM/DoS
        req_page = request.query_params.get('page', 1)
        try:
            if int(req_page) > 1000:
                raise ValidationError("Maximum pagination depth (1000) exceeded. Please use date filters to narrow your search.")
        except ValueError:
            pass # Let standard paginator handle non-integers
            
        paginator = FinancePagination()
        paginator.page_size = 30 # As requested
        page = paginator.paginate_queryset(unified, request)
        
        # 2. The N+1 Fix & Defeating The Prism (IDOR): Bulk resolve + RBAC Checks
        from core.permissions import HasRequiredPermission
        can_view_orders = HasRequiredPermission._check_rbac(request.user, 'orders.view_orders') or request.user.is_superuser
        can_view_expenses = HasRequiredPermission._check_rbac(request.user, 'finance.manage_expenses') or request.user.is_superuser
        can_view_salaries = HasRequiredPermission._check_rbac(request.user, 'finance.manage_salaries') or request.user.is_superuser
        can_view_loans = HasRequiredPermission._check_rbac(request.user, 'finance.manage_loans') or request.user.is_superuser

        order_display_ids = set()
        expense_ids = set()
        salary_ids = set()
        loan_ids = set()
        
        for item in page:
            ref = item.get('ref', '') or ''
            if (ref.startswith('order_') or ref.startswith('refund_')) and can_view_orders:
                display_id = ref.replace('order_', '').replace('refund_', '')
                if display_id:
                    order_display_ids.add(display_id)
            elif ref.startswith('expense_') and can_view_expenses:
                exp_id = ref.replace('expense_', '')
                if exp_id.isdigit():
                    expense_ids.add(exp_id)
            elif ref.startswith('salary_') and can_view_salaries:
                sal_id = ref.replace('salary_', '')
                if sal_id.isdigit():
                    salary_ids.add(sal_id)
            elif ref.startswith('loan_') and can_view_loans:
                ln_id = ref.replace('loan_', '')
                if ln_id.isdigit():
                    loan_ids.add(ln_id)
                    
        orders_map = {}
        if order_display_ids:
            orders = Order.objects.filter(display_id__in=order_display_ids).select_related('customer')
            orders_map = {order.display_id: order for order in orders}
            
        expenses_map = {}
        if expense_ids:
            expenses = Expense.objects.filter(id__in=expense_ids).select_related('category')
            expenses_map = {str(exp.id): exp for exp in expenses}
            
        salaries_map = {}
        if salary_ids:
            salaries = SalaryPayment.objects.filter(id__in=salary_ids).select_related('salary__employee')
            salaries_map = {str(sal.id): sal for sal in salaries}
            
        loans_map = {}
        if loan_ids:
            loans = Loan.objects.filter(id__in=loan_ids).select_related('lender')
            loans_map = {str(ln.id): ln for ln in loans}
        
        # Enrich results with drill-down metadata
        enriched_results = []
        for item in page:
            item_dict = dict(item)
            ref = item_dict.get('ref', '') or ''
            linked_data = None
            
            try:
                if (ref.startswith('order_') or ref.startswith('refund_')) and can_view_orders:
                    display_id = ref.replace('order_', '').replace('refund_', '')
                    order = orders_map.get(display_id)
                    if order:
                        linked_data = {
                            'type': 'order' if ref.startswith('order_') else 'refund',
                            'id': str(order.id),
                            'display_id': order.display_id,
                            'customer_name': order.guest_name if order.is_guest else (order.customer.full_name if order.customer else 'Guest'),
                            'customer_id': order.customer.display_id if order.customer else None,
                            'status': order.payment_status if ref.startswith('order_') else None
                        }
                elif ref.startswith('expense_') and can_view_expenses:
                    exp_id = ref.replace('expense_', '')
                    exp = expenses_map.get(exp_id)
                    if exp:
                        linked_data = {
                            'type': 'expense',
                            'id': str(exp.id),
                            'payee': exp.payee_name,
                            'category': exp.category.name if exp.category else 'Uncategorized'
                        }
                elif ref.startswith('salary_') and can_view_salaries:
                    sal_id = ref.replace('salary_', '')
                    sal = salaries_map.get(sal_id)
                    if sal:
                        linked_data = {
                            'type': 'salary',
                            'id': str(sal.id),
                            'employee': sal.salary.employee.username
                        }
                elif ref.startswith('loan_') and can_view_loans:
                    ln_id = ref.replace('loan_', '')
                    ln = loans_map.get(ln_id)
                    if ln:
                        linked_data = {
                            'type': 'loan',
                            'id': str(ln.id),
                            'lender': ln.lender.name
                        }
            except Exception as e:
                logger.error(f"Failed to resolve linked data for ref {ref}: {e}")
                
            item_dict['linked_entity'] = linked_data
            enriched_results.append(item_dict)
            
        return paginator.get_paginated_response(enriched_results)
