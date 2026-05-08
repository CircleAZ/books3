"""
Serializers for Finance App.
"""

from decimal import Decimal
from rest_framework import serializers
from django.db.models import Sum
from django.utils.html import strip_tags
from django.utils import timezone
from .models import (
    ExpenseCategory, Expense, ExpensePayment, OtherIncome,
    BankAccount, BankTransaction, EmployeeExpense, EmployeeSalary,
    SalaryPayment, Lender, Loan, LoanRepayment,
    IncomeCategory, RecurringExpense, CategoryBudget, FinanceAuditLog,
    ExpenseTrip, ExpenseTripItem
)


# ======== Sanitization helper ========

def _sanitize(value):
    """Strip HTML tags and whitespace from text input."""
    return strip_tags(value).strip() if value else value


# ======== Expense Serializers ========

class ExpenseCategorySerializer(serializers.ModelSerializer):
    expenses_count = serializers.SerializerMethodField()
    budget_info = serializers.SerializerMethodField()
    
    class Meta:
        model = ExpenseCategory
        fields = ['id', 'name', 'icon', 'custom_icon', 'description', 'is_active', 'expenses_count',
                  'budget_info', 'created_at']
        read_only_fields = ['id', 'created_at']
    
    def get_expenses_count(self, obj):
        return getattr(obj, '_expenses_count', obj.expenses.count())

    def get_budget_info(self, obj):
        """Return current period budget utilization from prefetched budgets if any."""
        budgets = getattr(obj, '_prefetched_objects_cache', {}).get('budgets')
        if budgets is not None:
            budget = budgets[0] if budgets else None
        else:
            from datetime import date
            today = date.today()
            budget = obj.budgets.filter(
                period_start__lte=today, period_end__gte=today
            ).first()
            
        if budget:
            return {
                'budget_amount': str(budget.budget_amount),
                'spent': str(budget.spent),
                'remaining': str(budget.remaining),
                'utilization_pct': str(budget.utilization_pct),
            }
        return None

    def validate_name(self, value):
        return _sanitize(value)

    def validate_description(self, value):
        return _sanitize(value)


class ExpensePaymentSerializer(serializers.ModelSerializer):
    payer_name = serializers.CharField(source='payer.username', read_only=True)
    
    class Meta:
        model = ExpensePayment
        fields = ['id', 'expense', 'date', 'amount', 'method', 'reference', 
                  'payer', 'payer_name', 'receipt', 'notes', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_reference(self, value):
        return _sanitize(value)

    def validate_notes(self, value):
        return _sanitize(value)

    def validate(self, data):
        """Prevent overpayment: sum of all payments must not exceed expense total."""
        expense = data.get('expense') or (self.instance.expense if self.instance else None)
        if expense:
            existing_paid = expense.payments.exclude(
                pk=getattr(self.instance, 'pk', None)
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            if existing_paid + data.get('amount', Decimal('0.00')) > expense.total_amount:
                raise serializers.ValidationError(
                    {'amount': 'Payment would exceed expense total amount.'}
                )
        return data


class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    payments = ExpensePaymentSerializer(many=True, read_only=True)
    balance_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.username', read_only=True)
    
    class Meta:
        model = Expense
        fields = ['id', 'date', 'category', 'category_name', 'payee_type', 
                  'payee_name', 'payee_id', 'description', 'amount', 'tax_amount',
                  'total_amount', 'payment_status', 'paid_amount', 'balance_due',
                  'approval_status', 'approved_by', 'approved_by_name', 'approved_at',
                  'notes', 'payments', 'created_by', 'created_by_name', 
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'payment_status', 'paid_amount', 'created_by',
                           'approval_status', 'approved_by', 'approved_at',
                           'created_at', 'updated_at']

    def validate_payee_name(self, value):
        return _sanitize(value)

    def validate_description(self, value):
        return _sanitize(value)

    def validate_notes(self, value):
        return _sanitize(value)


class ExpenseCreateSerializer(serializers.ModelSerializer):
    """Simplified serializer for expense creation."""
    
    class Meta:
        model = Expense
        fields = ['date', 'category', 'payee_type', 'payee_name', 'payee_id',
                  'description', 'amount', 'tax_amount', 'total_amount', 'notes']

    def validate_payee_name(self, value):
        return _sanitize(value)

    def validate_description(self, value):
        return _sanitize(value)

    def validate_notes(self, value):
        return _sanitize(value)


# ======== Income Serializers ========

class IncomeCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = IncomeCategory
        fields = ['id', 'name', 'description', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_name(self, value):
        return _sanitize(value)


class OtherIncomeSerializer(serializers.ModelSerializer):
    received_by_name = serializers.CharField(source='received_by.username', read_only=True)
    
    class Meta:
        model = OtherIncome
        fields = ['id', 'date', 'source', 'description', 'amount', 
                  'received_by', 'received_by_name', 'created_at', 'updated_at']
        read_only_fields = ['id', 'received_by', 'created_at', 'updated_at']

    def validate_source(self, value):
        return _sanitize(value)

    def validate_description(self, value):
        return _sanitize(value)


# ======== Banking Serializers ========

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

    def validate_description(self, value):
        return _sanitize(value)

    def validate_reference(self, value):
        return _sanitize(value)
        
    def validate_date(self, value):
        if value > timezone.now().date():
            raise serializers.ValidationError("Transaction date cannot be in the future.")
        return value
        
    def validate_amount(self, value):
        if value <= Decimal('0.00'):
            raise serializers.ValidationError("Transaction amount must be strictly greater than zero.")
        return value


class BankAccountSerializer(serializers.ModelSerializer):
    recent_transactions = serializers.SerializerMethodField()
    masked_account_number = serializers.SerializerMethodField()
    
    class Meta:
        model = BankAccount
        fields = ['id', 'name', 'account_type', 'bank_name', 'account_number',
                  'masked_account_number', 'ifsc_code', 'branch', 'opening_balance',
                  'current_balance', 'is_active', 'is_default', 'recent_transactions',
                  'created_at']
        read_only_fields = ['id', 'current_balance', 'created_at']
        # account_number is write-only (accepted on create/update, but read returns masked)
        extra_kwargs = {'account_number': {'write_only': True, 'required': False}}
    
    def get_recent_transactions(self, obj):
        txns = obj.transactions.all()[:5]
        return BankTransactionSerializer(txns, many=True).data

    def get_masked_account_number(self, obj):
        if obj.account_number and len(obj.account_number) > 4:
            return '•' * (len(obj.account_number) - 4) + obj.account_number[-4:]
        return obj.account_number or ''

    def validate_name(self, value):
        return _sanitize(value)

    def validate_bank_name(self, value):
        return _sanitize(value)

    def update(self, instance, validated_data):
        # If account_number is blank on edit, keep the existing value
        # (frontend can't pre-fill it since it's write-only)
        if 'account_number' in validated_data and not validated_data['account_number']:
            validated_data.pop('account_number')
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if request and request.user and not request.user.is_superuser:
            from core.permissions import HasRequiredPermission
            has_finance = HasRequiredPermission._check_rbac(request.user, 'finance.manage_banking')
            if not has_finance:
                for field in ['opening_balance', 'current_balance', 'recent_transactions', 'masked_account_number', 'ifsc_code', 'branch']:
                    data.pop(field, None)
        return data


# ======== Employee Finance Serializers ========

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
        read_only_fields = ['id', 'employee', 'status', 'reviewed_by', 'reviewed_at',
                           'rejection_reason', 'reimbursed_at', 'reimbursement_method',
                           'created_at', 'updated_at']

    def validate_description(self, value):
        return _sanitize(value)


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

    def validate_reference(self, value):
        return _sanitize(value)

    def validate_notes(self, value):
        return _sanitize(value)


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


# ======== Lender Serializers ========

class LoanRepaymentSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source='recorded_by.username', read_only=True)
    
    class Meta:
        model = LoanRepayment
        fields = ['id', 'loan', 'date', 'amount', 'principal_portion',
                  'interest_portion', 'payment_method', 'reference', 'notes',
                  'recorded_by', 'recorded_by_name', 'created_at']
        read_only_fields = ['id', 'recorded_by', 'created_at']

    def validate_reference(self, value):
        return _sanitize(value)

    def validate_notes(self, value):
        return _sanitize(value)


class LoanSerializer(serializers.ModelSerializer):
    lender_name = serializers.CharField(source='lender.name', read_only=True)
    balance_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_interest = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    emi = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    repayments = LoanRepaymentSerializer(many=True, read_only=True)
    
    class Meta:
        model = Loan
        fields = ['id', 'lender', 'lender_name', 'loan_number', 'principal_amount',
                  'interest_rate', 'interest_type', 'term_months', 'start_date', 'end_date',
                  'monthly_payment', 'total_paid', 'disbursed_amount', 'balance_due',
                  'total_interest', 'emi', 'is_active', 'notes', 'repayments',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'total_paid', 'disbursed_amount', 'created_at', 'updated_at']

    def validate_loan_number(self, value):
        return _sanitize(value)

    def validate_notes(self, value):
        return _sanitize(value)


class LenderSerializer(serializers.ModelSerializer):
    total_loans = serializers.IntegerField(read_only=True)
    total_outstanding = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    active_loans = serializers.SerializerMethodField()
    loans = serializers.SerializerMethodField()
    
    class Meta:
        model = Lender
        fields = ['id', 'name', 'contact_person', 'phone', 'email', 'address',
                  'notes', 'total_loans', 'total_outstanding', 'active_loans', 'loans',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_active_loans(self, obj):
        loans = obj.loans.filter(is_active=True)[:5]
        return LoanSerializer(loans, many=True).data

    def get_loans(self, obj):
        """Return ALL loans for the lender (for Loans History table)."""
        return LoanSerializer(obj.loans.all(), many=True).data

    def validate_name(self, value):
        return _sanitize(value)

    def validate_contact_person(self, value):
        return _sanitize(value)

    def validate_address(self, value):
        return _sanitize(value)

    def validate_notes(self, value):
        return _sanitize(value)


# ======== New Feature Serializers ========

class RecurringExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = RecurringExpense
        fields = ['id', 'name', 'category', 'category_name', 'payee_name', 'payee_type',
                  'amount', 'tax_amount', 'frequency', 'next_date', 'end_date',
                  'is_active', 'description', 'created_by', 'created_by_name',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def validate_name(self, value):
        return _sanitize(value)

    def validate_payee_name(self, value):
        return _sanitize(value)

    def validate_description(self, value):
        return _sanitize(value)


class CategoryBudgetSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    spent = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    remaining = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    utilization_pct = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)

    class Meta:
        model = CategoryBudget
        fields = ['id', 'category', 'category_name', 'period_start', 'period_end',
                  'budget_amount', 'spent', 'remaining', 'utilization_pct',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class FinanceAuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = FinanceAuditLog
        fields = ['id', 'action', 'model_name', 'object_id', 'user', 'user_name',
                  'timestamp', 'details']
        read_only_fields = ['id', 'timestamp']


# ======== Trip / Expense Group Serializers ========

class ExpenseTripItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    paid_by_employee_name = serializers.CharField(
        source='paid_by_employee.username', read_only=True
    )
    reimbursement_status = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseTripItem
        fields = [
            'id', 'description', 'category', 'category_name', 'amount',
            'paid_by_type', 'paid_by_employee', 'paid_by_employee_name',
            'receipt', 'expense', 'employee_expense',
            'reimbursement_status', 'created_at'
        ]
        read_only_fields = ['id', 'expense', 'employee_expense', 'created_at']

    def get_reimbursement_status(self, obj):
        if obj.paid_by_type == 'company':
            return obj.expense.payment_status if obj.expense else 'pending'
        else:
            return obj.employee_expense.status if obj.employee_expense else 'pending'

    def validate_description(self, value):
        return _sanitize(value)


class ExpenseTripSerializer(serializers.ModelSerializer):
    items = ExpenseTripItemSerializer(many=True, required=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    total_amount = serializers.SerializerMethodField()
    company_amount = serializers.SerializerMethodField()
    reimbursement_due = serializers.SerializerMethodField()
    employee_breakdown = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseTrip
        fields = [
            'id', 'name', 'date', 'purpose', 'notes', 'settlement_status',
            'created_by', 'created_by_name', 'items',
            'total_amount', 'company_amount', 'reimbursement_due',
            'employee_breakdown', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'settlement_status', 'created_by', 'created_at', 'updated_at']

    def get_total_amount(self, obj):
        return str(sum(i.amount for i in obj.items.filter(is_deleted=False)))

    def get_company_amount(self, obj):
        return str(sum(
            i.amount for i in obj.items.filter(paid_by_type='company', is_deleted=False)
        ))

    def get_reimbursement_due(self, obj):
        emp_items = obj.items.filter(paid_by_type='employee', is_deleted=False)
        reimbursed = emp_items.filter(employee_expense__status='reimbursed')
        total = sum(i.amount for i in emp_items)
        paid = sum(i.amount for i in reimbursed)
        return str(total - paid)

    def get_employee_breakdown(self, obj):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        emp_items = obj.items.filter(paid_by_type='employee', is_deleted=False)
        breakdown = {}
        for item in emp_items:
            if not item.paid_by_employee:
                continue
            emp_id = str(item.paid_by_employee_id)
            if emp_id not in breakdown:
                breakdown[emp_id] = {
                    'employee_id': emp_id,
                    'employee_name': item.paid_by_employee.username,
                    'items_count': 0,
                    'total_amount': Decimal('0.00'),
                    'reimbursed': Decimal('0.00'),
                    'remaining': Decimal('0.00'),
                }
            entry = breakdown[emp_id]
            entry['items_count'] += 1
            entry['total_amount'] += item.amount
            if item.employee_expense and item.employee_expense.status == 'reimbursed':
                entry['reimbursed'] += item.amount
            entry['remaining'] = entry['total_amount'] - entry['reimbursed']
        # Convert Decimals to strings for JSON
        for entry in breakdown.values():
            entry['total_amount'] = str(entry['total_amount'])
            entry['reimbursed'] = str(entry['reimbursed'])
            entry['remaining'] = str(entry['remaining'])
        return list(breakdown.values())

    def validate_name(self, value):
        return _sanitize(value)

    def validate_items(self, value):
        if not value or len(value) == 0:
            raise serializers.ValidationError('At least one line item is required.')
        return value

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        user = self.context['request'].user
        validated_data['created_by'] = user

        trip = ExpenseTrip.objects.create(**validated_data)

        for item_data in items_data:
            paid_by_type = item_data.get('paid_by_type', 'company')
            trip_item = ExpenseTripItem.objects.create(trip=trip, **item_data)

            if paid_by_type == 'company':
                # Create a company Expense record — marked as paid (company already spent)
                expense = Expense.objects.create(
                    date=trip.date,
                    category=item_data['category'],
                    payee_type='other',
                    payee_name=f"Trip: {trip.name}",
                    description=item_data['description'],
                    amount=item_data['amount'],
                    tax_amount=Decimal('0.00'),
                    total_amount=item_data['amount'],
                    paid_amount=item_data['amount'],  # Auto-paid: company already spent
                    created_by=user
                )
                trip_item.expense = expense
                trip_item.save(update_fields=['expense'])
            else:
                # Create an EmployeeExpense claim (auto-approved by admin)
                employee = item_data.get('paid_by_employee')
                if employee:
                    emp_expense = EmployeeExpense.objects.create(
                        employee=employee,
                        date=trip.date,
                        category=item_data['category'],
                        description=f"Trip: {trip.name} — {item_data['description']}",
                        amount=item_data['amount'],
                        status='approved',
                        reviewed_by=user,
                        reviewed_at=timezone.now()
                    )
                    trip_item.employee_expense = emp_expense
                    trip_item.save(update_fields=['employee_expense'])

        trip.recalculate_settlement()
        return trip

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        # Note: item editing is handled per-item, not full replacement
        return instance


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

# ======== Cash Flow Serializers ========

from .models import CashWallet, CashTransfer

class CashWalletSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source='owner.username', read_only=True)
    
    class Meta:
        model = CashWallet
        fields = ['id', 'name', 'owner', 'owner_name', 'is_system', 'balance', 'is_active', 'created_at']
        read_only_fields = ['id', 'is_system', 'balance', 'created_at']

class CashTransferSerializer(serializers.ModelSerializer):
    source_wallet_name = serializers.CharField(source='source_wallet.name', read_only=True)
    destination_wallet_name = serializers.CharField(source='destination_wallet.name', read_only=True)
    destination_bank_name = serializers.CharField(source='destination_bank.name', read_only=True)
    initiated_by_name = serializers.CharField(source='initiated_by.username', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.username', read_only=True)
    
    class Meta:
        model = CashTransfer
        fields = [
            'id', 'source_wallet', 'source_wallet_name', 'destination_wallet', 'destination_wallet_name', 
            'destination_bank', 'destination_bank_name', 'amount', 'notes', 'status', 
            'initiated_by', 'initiated_by_name', 'approved_by', 'approved_by_name', 
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'status', 'initiated_by', 'approved_by', 'created_at', 'updated_at']

