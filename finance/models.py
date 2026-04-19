"""
Finance & Accounting Models for AZ Books.
Phase 13: Complete financial management including expenses, income, banking, 
employee finance, and lenders.
"""

from decimal import Decimal
from django.db import models, transaction
from simple_history.models import HistoricalRecords
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.utils import timezone
from core.models import TimestampedModel, SoftDeleteModel


class ExpenseCategory(TimestampedModel):
    """
    Categories for organizing expenses.
    """
    name = models.CharField(max_length=100, unique=True)
    icon = models.CharField(max_length=50, blank=True, default='receipt')
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        verbose_name_plural = 'Expense Categories'
        ordering = ['name']
    
    def __str__(self):
        return self.name


class Expense(SoftDeleteModel):
    history = HistoricalRecords()

    """
    Company expenses with payment tracking.
    Payee can be a Vendor, Employee, or Lender.
    """
    class PaymentStatus(models.TextChoices):
        UNPAID = 'unpaid', 'Unpaid'
        PARTIAL = 'partial', 'Partially Paid'
        PAID = 'paid', 'Fully Paid'

    class PayeeType(models.TextChoices):
        VENDOR = 'vendor', 'Vendor'
        EMPLOYEE = 'employee', 'Employee'
        LENDER = 'lender', 'Lender'
        OTHER = 'other', 'Other'

    class ApprovalStatus(models.TextChoices):
        AUTO_APPROVED = 'auto_approved', 'Auto-Approved'
        PENDING = 'pending', 'Pending Approval'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
    
    date = models.DateField(db_index=True)
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='expenses'
    )
    payee_type = models.CharField(max_length=20, choices=PayeeType.choices)
    payee_name = models.CharField(max_length=200)
    payee_id = models.UUIDField(null=True, blank=True, help_text='ID of vendor/employee/lender')
    description = models.TextField(blank=True)
    amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    tax_amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        default=Decimal('0.00')
    )
    total_amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
        db_index=True
    )
    approval_status = models.CharField(
        max_length=20,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.AUTO_APPROVED,
        db_index=True
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='approved_expenses'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    paid_amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        default=Decimal('0.00')
    )
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_expenses'
    )
    
    class Meta:
        ordering = ['-date', '-created_at']
    
    def __str__(self):
        return f"{self.date} - {self.payee_name} - {self.total_amount}"
    
    def save(self, *args, **kwargs):
        # Auto-calculate total if not explicitly provided
        if not self.total_amount or self.total_amount <= 0:
            self.total_amount = self.amount + self.tax_amount
        # Update payment status based on paid amount
        if self.paid_amount >= self.total_amount:
            self.payment_status = self.PaymentStatus.PAID
        elif self.paid_amount > 0:
            self.payment_status = self.PaymentStatus.PARTIAL
        else:
            self.payment_status = self.PaymentStatus.UNPAID
        # P1 Fix: Re-check approval threshold on both create AND update
        if self.approval_status == self.ApprovalStatus.AUTO_APPROVED:
            if self.total_amount >= Decimal('5000.00'):
                self.approval_status = self.ApprovalStatus.PENDING
        super().save(*args, **kwargs)
    
    @property
    def balance_due(self):
        return self.total_amount - self.paid_amount


class ExpensePayment(SoftDeleteModel):
    """
    Individual payment records for an expense.
    Supports multi-payment for single expense.
    """
    class PaymentMethod(models.TextChoices):
        CASH = 'cash', 'Cash'
        UPI = 'upi', 'UPI'
        BANK = 'bank', 'Bank Transfer'
        CHEQUE = 'cheque', 'Cheque'
        CARD = 'card', 'Card'
    
    expense = models.ForeignKey(
        Expense,
        on_delete=models.CASCADE,
        related_name='payments'
    )
    payment_date = models.DateField()
    amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    
    # Phase 1 Migration Fields
    source_bank = models.ForeignKey('BankAccount', on_delete=models.PROTECT, null=True, blank=True, related_name='expense_payments')
    source_wallet = models.ForeignKey('CashWallet', on_delete=models.PROTECT, null=True, blank=True, related_name='expense_payments')
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices, null=True, blank=True)
    
    reference = models.CharField(max_length=100, blank=True, help_text='Transaction/Cheque reference')
    payer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='expense_payments_made'
    )
    receipt = models.ImageField(upload_to='expense_receipts/', blank=True, null=True)
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-payment_date', '-created_at']
    
    def __str__(self):
        return f"{self.payment_date} - {self.amount} ({self.payment_method})"
    
    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        # P2 Fix: Use F() incremental update instead of re-aggregating all payments
        with transaction.atomic():
            expense = Expense.objects.select_for_update().get(pk=self.expense_id)
            if is_new:
                # Use F() for atomic increment, then refresh to get actual value
                Expense.objects.filter(pk=self.expense_id).update(
                    paid_amount=models.F('paid_amount') + self.amount
                )
                expense.refresh_from_db()
            else:
                # Fallback: re-aggregate on update
                total_paid = expense.payments.aggregate(
                    total=models.Sum('amount')
                )['total'] or Decimal('0.00')
                expense.paid_amount = total_paid
            # Now paid_amount is a real Decimal, safe to compare in save()
            expense.save()


class OtherIncome(SoftDeleteModel):
    """
    Non-sales revenue (interest, rent, etc.)
    """
    # NOTE: category FK added after IncomeCategory definition below

    date = models.DateField()
    source = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='other_income_received'
    )
    
    class Meta:
        verbose_name_plural = 'Other Income'
        ordering = ['-date', '-created_at']
    
    def __str__(self):
        return f"{self.date} - {self.source} - {self.amount}"


class CashWallet(TimestampedModel):
    """
    Decoupled cash tracking system for individual users and system vaults.
    """
    name = models.CharField(max_length=100)
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='cash_wallet',
        help_text="If null, this is a system wallet (e.g., Vault, Safe)"
    )
    is_system = models.BooleanField(default=False)
    balance = models.DecimalField(
        max_digits=14, 
        decimal_places=2, 
        default=Decimal('0.00')
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-is_system', 'name']

    def __str__(self):
        return f"{self.name} (₹{self.balance})"


class CashTransfer(TimestampedModel):
    """
    Approval flow for moving cash between wallets or to a bank.
    """
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending Approval'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        
    source_wallet = models.ForeignKey(CashWallet, on_delete=models.PROTECT, related_name='outbound_transfers')
    destination_wallet = models.ForeignKey(CashWallet, on_delete=models.PROTECT, null=True, blank=True, related_name='inbound_transfers')
    destination_bank = models.ForeignKey('BankAccount', on_delete=models.PROTECT, null=True, blank=True, related_name='inbound_cash_deposits')
    
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    
    initiated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='initiated_cash_transfers')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name='approved_cash_transfers')
    
    notes = models.TextField(blank=True)

    def clean(self):
        if not self.destination_wallet and not self.destination_bank:
            raise ValidationError("Must specify either a destination wallet or a destination bank.")
        if self.destination_wallet and self.destination_bank:
            raise ValidationError("Cannot specify both a destination wallet and a destination bank.")
        if self.status == self.Status.APPROVED and not self.approved_by:
            raise ValidationError("Approved transfers must have an approver.")
        if self.initiated_by == self.approved_by:
            raise ValidationError("A user cannot approve their own cash transfer.")

    def __str__(self):
        return f"Transfer ₹{self.amount} from {self.source_wallet.name} ({self.status})"


class CashWalletTransaction(SoftDeleteModel):
    """
    Ledger for CashWallet, mirroring BankTransaction.
    """
    class TransactionType(models.TextChoices):
        DEPOSIT = 'deposit', 'Deposit'
        WITHDRAWAL = 'withdrawal', 'Withdrawal'
        
    wallet = models.ForeignKey(CashWallet, on_delete=models.PROTECT, related_name='transactions')
    transaction_type = models.CharField(max_length=20, choices=TransactionType.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    
    # Generic linking fields (order payment, expense, transfer)
    reference_id = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    
    balance_after = models.DecimalField(max_digits=14, decimal_places=2)
    
    date = models.DateField(default=timezone.now)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.transaction_type.title()} ₹{self.amount} - {self.wallet.name}"


class BankAccount(TimestampedModel):
    """
    Bank accounts for tracking company finances.
    """
    class AccountType(models.TextChoices):
        CURRENT = 'current', 'Current Account'
        SAVINGS = 'savings', 'Savings Account'
        CASH = 'cash', 'Cash Account (Deprecated)'
    
    name = models.CharField(max_length=100)
    account_type = models.CharField(max_length=20, choices=AccountType.choices)
    bank_name = models.CharField(max_length=100, blank=True)
    account_number = models.CharField(max_length=50, blank=True)
    ifsc_code = models.CharField(max_length=15, blank=True)
    branch = models.CharField(max_length=100, blank=True)
    opening_balance = models.DecimalField(
        max_digits=14, 
        decimal_places=2, 
        default=Decimal('0.00')
    )
    current_balance = models.DecimalField(
        max_digits=14, 
        decimal_places=2, 
        default=Decimal('0.00')
    )
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['-is_default', 'name']
    
    def __str__(self):
        return f"{self.name} ({self.bank_name})" if self.bank_name else self.name
    
    def save(self, *args, **kwargs):
        # Initialize current balance from opening balance for new accounts
        if not self.pk:
            self.current_balance = self.opening_balance
        # Ensure only one default account
        if self.is_default:
            BankAccount.objects.filter(is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)


class BankTransaction(SoftDeleteModel):
    """
    Bank transactions (deposits, withdrawals, transfers).
    """
    class TransactionType(models.TextChoices):
        DEPOSIT = 'deposit', 'Deposit'
        WITHDRAWAL = 'withdrawal', 'Withdrawal'
        TRANSFER_IN = 'transfer_in', 'Transfer In'
        TRANSFER_OUT = 'transfer_out', 'Transfer Out'
    
    account = models.ForeignKey(
        BankAccount,
        on_delete=models.CASCADE,
        related_name='transactions'
    )
    transaction_type = models.CharField(max_length=20, choices=TransactionType.choices)
    date = models.DateField(db_index=True)
    amount = models.DecimalField(
        max_digits=14, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    description = models.TextField()
    reference = models.CharField(max_length=100, blank=True)
    # For transfers
    transfer_account = models.ForeignKey(
        BankAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transfer_transactions',
        help_text='Other account in transfer'
    )
    # Linking
    related_expense = models.ForeignKey(
        Expense,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bank_transactions'
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='bank_transactions_recorded'
    )
    is_reconciled = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['-date', '-created_at']
    
    def __str__(self):
        return f"{self.date} - {self.transaction_type} - {self.amount}"
    
    def save(self, *args, **kwargs):
        # P1 Fix: Skip balance logic when called from delete (via _skip_balance flag)
        if getattr(self, '_skip_balance', False):
            super().save(*args, **kwargs)
            return

        with transaction.atomic():
            account = BankAccount.objects.select_for_update().get(pk=self.account_id)
            
            if not self._state.adding:
                # P1 Fix: Use all_objects to find soft-deleted records too
                try:
                    old = BankTransaction.all_objects.get(pk=self.pk)
                    if old.transaction_type in ['deposit', 'transfer_in']:
                        account.current_balance -= old.amount
                    else:
                        account.current_balance += old.amount
                except BankTransaction.DoesNotExist:
                    pass
            
            super().save(*args, **kwargs)
            
            # Apply the new/updated transaction's effect on balance
            if self.transaction_type in ['deposit', 'transfer_in']:
                account.current_balance += self.amount
            else:
                account.current_balance -= self.amount
            account.save()
    
    def delete(self, *args, **kwargs):
        with transaction.atomic():
            account = BankAccount.objects.select_for_update().get(pk=self.account_id)
            if self.transaction_type in ['deposit', 'transfer_in']:
                account.current_balance -= self.amount
            else:
                account.current_balance += self.amount
            account.save()
            # P1 Fix: Set flag so SoftDeleteModel's internal save() skips balance logic
            self._skip_balance = True
            super().delete(*args, **kwargs)


# ======== Employee Finance Models ========

class EmployeeExpense(SoftDeleteModel):
    history = HistoricalRecords()

    """
    Employee-submitted expenses for reimbursement.
    """
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending Review'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        REIMBURSED = 'reimbursed', 'Reimbursed'
    
    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='expense_claims'
    )
    date = models.DateField(db_index=True)
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='employee_expenses'
    )
    description = models.TextField()
    amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    receipt = models.ImageField(upload_to='employee_receipts/', blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expenses_reviewed'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    reimbursed_at = models.DateTimeField(null=True, blank=True)
    reimbursement_method = models.CharField(max_length=50, blank=True)
    
    class Meta:
        ordering = ['-date', '-created_at']
    
    def __str__(self):
        return f"{self.employee.username} - {self.date} - {self.amount}"


class EmployeeSalary(TimestampedModel):
    """
    Employee salary configuration.
    """
    class Frequency(models.TextChoices):
        MONTHLY = 'monthly', 'Monthly'
        WEEKLY = 'weekly', 'Weekly'
        BIWEEKLY = 'biweekly', 'Bi-Weekly'
    
    employee = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salary_config'
    )
    base_amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))]
    )
    frequency = models.CharField(max_length=20, choices=Frequency.choices, default=Frequency.MONTHLY)
    payment_day = models.PositiveSmallIntegerField(
        default=1,
        help_text='Day of month for monthly, day of week for weekly'
    )
    bank_account = models.CharField(max_length=50, blank=True)
    bank_name = models.CharField(max_length=100, blank=True)
    ifsc_code = models.CharField(max_length=15, blank=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        verbose_name_plural = 'Employee Salaries'
    
    def __str__(self):
        return f"{self.employee.username} - {self.base_amount}/{self.frequency}"


class SalaryPayment(SoftDeleteModel):
    """
    Individual salary payment records.
    """
    salary = models.ForeignKey(
        EmployeeSalary,
        on_delete=models.CASCADE,
        related_name='payments'
    )
    period_start = models.DateField()
    period_end = models.DateField()
    payment_date = models.DateField()
    base_amount = models.DecimalField(max_digits=12, decimal_places=2)
    deductions = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    bonuses = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    net_amount = models.DecimalField(max_digits=12, decimal_places=2)
    
    # Phase 1 Migration Fields
    source_bank = models.ForeignKey('BankAccount', on_delete=models.PROTECT, null=True, blank=True, related_name='salary_payments')
    source_wallet = models.ForeignKey('CashWallet', on_delete=models.PROTECT, null=True, blank=True, related_name='salary_payments')
    payment_method = models.CharField(max_length=50, null=True, blank=True)
    
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='salaries_paid'
    )
    
    class Meta:
        ordering = ['-payment_date']
    
    def __str__(self):
        return f"{self.salary.employee.username} - {self.period_start} to {self.period_end}"
    
    def save(self, *args, **kwargs):
        # Calculate net amount
        self.net_amount = self.base_amount - self.deductions + self.bonuses
        super().save(*args, **kwargs)


# ======== Lender Models ========

class Lender(SoftDeleteModel):
    """
    Lender/Creditor information.
    """
    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['name']
    
    def __str__(self):
        return self.name
    
    @property
    def total_loans(self):
        return self.loans.filter(is_active=True).count()
    
    @property
    def total_outstanding(self):
        return sum(loan.balance_due for loan in self.loans.filter(is_active=True))


class Loan(SoftDeleteModel):
    """
    Loan from a lender.
    """
    lender = models.ForeignKey(
        Lender,
        on_delete=models.CASCADE,
        related_name='loans'
    )
    loan_number = models.CharField(max_length=50, blank=True)
    principal_amount = models.DecimalField(
        max_digits=14, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    interest_rate = models.DecimalField(
        max_digits=5, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text='Annual interest rate in percentage'
    )
    term_months = models.PositiveIntegerField(
        help_text='Loan term in months',
        validators=[MinValueValidator(1)]
    )
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    monthly_payment = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        null=True,
        blank=True
    )
    total_paid = models.DecimalField(
        max_digits=14, 
        decimal_places=2, 
        default=Decimal('0.00')
    )
    INTEREST_TYPE_CHOICES = [
        ('simple', 'Simple Interest'),
        ('compound', 'Compound Interest'),
        ('flat', 'Flat Rate'),
    ]
    interest_type = models.CharField(max_length=20, choices=INTEREST_TYPE_CHOICES, default='simple')
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-start_date']
    
    def __str__(self):
        return f"{self.lender.name} - {self.principal_amount}"
    
    @property
    def balance_due(self):
        return self.principal_amount + self.total_interest - self.total_paid
    
    @property
    def total_interest(self):
        if self.interest_type == 'compound':
            r = self.interest_rate / (12 * 100)
            n = self.term_months
            if r == 0:
                return Decimal('0.00')
            total = self.principal_amount * (1 + r) ** n
            return total - self.principal_amount
        # Simple interest (default)
        return (self.principal_amount * self.interest_rate * self.term_months) / (12 * 100)
    
    @property
    def emi(self):
        """Calculate EMI using reducing balance method with pure Decimal math."""
        n = self.term_months
        if not n or n <= 0:
            return Decimal('0.00')
        rate = self.interest_rate / (12 * 100)
        if rate == 0:
            return (self.principal_amount / n).quantize(Decimal('0.01'))
        # Pure Decimal: EMI = P * r * (1+r)^n / ((1+r)^n - 1)
        one_plus_r_n = (1 + rate) ** n
        emi_val = self.principal_amount * rate * one_plus_r_n / (one_plus_r_n - 1)
        return emi_val.quantize(Decimal('0.01'))


class LoanRepayment(SoftDeleteModel):
    """
    Individual loan repayment record.
    """
    class PaymentType(models.TextChoices):
        PRINCIPAL = 'principal', 'Principal'
        INTEREST = 'interest', 'Interest'
        BOTH = 'both', 'Principal + Interest'
    
    loan = models.ForeignKey(
        Loan,
        on_delete=models.CASCADE,
        related_name='repayments'
    )
    date = models.DateField()
    amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    principal_portion = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        default=Decimal('0.00')
    )
    interest_portion = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        default=Decimal('0.00')
    )
    
    # Phase 1 Migration Fields
    source_bank = models.ForeignKey('BankAccount', on_delete=models.PROTECT, null=True, blank=True, related_name='loan_repayments')
    source_wallet = models.ForeignKey('CashWallet', on_delete=models.PROTECT, null=True, blank=True, related_name='loan_repayments')
    payment_method = models.CharField(max_length=50, null=True, blank=True)
    
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='loan_repayments_recorded'
    )
    
    class Meta:
        ordering = ['-date']
    
    def __str__(self):
        return f"{self.loan} - {self.date} - {self.amount}"
    
    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        # P2 Fix: Use F() incremental update instead of re-aggregating all repayments
        with transaction.atomic():
            loan = Loan.objects.select_for_update().get(pk=self.loan_id)
            if is_new:
                loan.total_paid = models.F('total_paid') + self.principal_portion
            else:
                # Fallback: re-aggregate on update
                total = loan.repayments.aggregate(
                    total=models.Sum('principal_portion')
                )['total'] or Decimal('0.00')
                loan.total_paid = total
            loan.save()


# ======== Income Categories ========

class IncomeCategory(TimestampedModel):
    """Categories for organizing other income."""
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        verbose_name_plural = 'Income Categories'
        ordering = ['name']
    
    def __str__(self):
        return self.name


# ======== Recurring Expenses ========

class RecurringExpense(TimestampedModel):
    """Template for auto-generating recurring expenses."""
    class Frequency(models.TextChoices):
        DAILY = 'daily', 'Daily'
        WEEKLY = 'weekly', 'Weekly'
        MONTHLY = 'monthly', 'Monthly'
        QUARTERLY = 'quarterly', 'Quarterly'
        YEARLY = 'yearly', 'Yearly'
    
    name = models.CharField(max_length=200)
    category = models.ForeignKey(
        ExpenseCategory, on_delete=models.PROTECT, related_name='recurring_expenses'
    )
    payee_name = models.CharField(max_length=200)
    payee_type = models.CharField(
        max_length=20, choices=Expense.PayeeType.choices, default=Expense.PayeeType.OTHER
    )
    amount = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))]
    )
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    frequency = models.CharField(max_length=20, choices=Frequency.choices)
    next_date = models.DateField(db_index=True)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='recurring_expenses_created'
    )
    
    class Meta:
        ordering = ['next_date']
    
    def __str__(self):
        return f"{self.name} - {self.frequency} - {self.amount}"


# ======== Budget Tracking ========

class CategoryBudget(TimestampedModel):
    """Budget allocation per expense category per period."""
    category = models.ForeignKey(
        ExpenseCategory, on_delete=models.CASCADE, related_name='budgets'
    )
    period_start = models.DateField()
    period_end = models.DateField()
    budget_amount = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))]
    )
    
    class Meta:
        unique_together = ['category', 'period_start']
        ordering = ['-period_start']
    
    def __str__(self):
        return f"{self.category.name} - {self.period_start} to {self.period_end}"
    
    @property
    def spent(self):
        # P2 Fix: Use annotated value from queryset if available, else fallback to DB query
        if hasattr(self, '_spent'):
            return self._spent
        return Expense.objects.filter(
            category=self.category,
            date__gte=self.period_start,
            date__lte=self.period_end,
            is_deleted=False
        ).aggregate(total=models.Sum('total_amount'))['total'] or Decimal('0.00')
    
    @property
    def remaining(self):
        return self.budget_amount - self.spent
    
    @property
    def utilization_pct(self):
        if self.budget_amount == 0:
            return Decimal('0.00')
        return (self.spent / self.budget_amount * 100).quantize(Decimal('0.01'))


# ======== Trip / Expense Group ========

class ExpenseTrip(SoftDeleteModel):
    history = HistoricalRecords()

    """
    Groups multiple expenses under a single trip or event.
    Each line item can be paid by the company or by an employee (reimbursement).
    """
    class SettlementStatus(models.TextChoices):
        UNSETTLED = 'unsettled', 'Unsettled'
        PARTIAL = 'partial', 'Partially Settled'
        SETTLED = 'settled', 'Fully Settled'

    name = models.CharField(max_length=200)
    date = models.DateField(db_index=True)
    purpose = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    settlement_status = models.CharField(
        max_length=20,
        choices=SettlementStatus.choices,
        default=SettlementStatus.UNSETTLED
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='expense_trips'
    )

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.name} ({self.date})"

    def recalculate_settlement(self):
        """Update settlement_status based on linked employee expense statuses."""
        employee_items = self.items.filter(paid_by_type='employee', is_deleted=False)
        if not employee_items.exists():
            # No employee items → settled if all company expenses exist
            self.settlement_status = self.SettlementStatus.SETTLED
        else:
            reimbursed_count = employee_items.filter(
                employee_expense__status='reimbursed'
            ).count()
            total_count = employee_items.count()
            if reimbursed_count == total_count:
                self.settlement_status = self.SettlementStatus.SETTLED
            elif reimbursed_count > 0:
                self.settlement_status = self.SettlementStatus.PARTIAL
            else:
                self.settlement_status = self.SettlementStatus.UNSETTLED
        self.save(update_fields=['settlement_status', 'updated_at'])


class ExpenseTripItem(SoftDeleteModel):
    """
    A single line item within a trip. Linked to either a company Expense
    or an EmployeeExpense depending on who paid.
    """
    class PaidByType(models.TextChoices):
        COMPANY = 'company', 'Company Budget'
        EMPLOYEE = 'employee', 'Employee'

    trip = models.ForeignKey(
        ExpenseTrip,
        on_delete=models.CASCADE,
        related_name='items'
    )
    description = models.CharField(max_length=200)
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='trip_items'
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    paid_by_type = models.CharField(
        max_length=20,
        choices=PaidByType.choices,
        default=PaidByType.COMPANY
    )
    paid_by_employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='trip_items_paid'
    )
    receipt = models.ImageField(upload_to='trip_receipts/', blank=True, null=True)
    # Auto-linked records
    expense = models.ForeignKey(
        Expense,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='trip_item'
    )
    employee_expense = models.ForeignKey(
        EmployeeExpense,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='trip_item'
    )

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.description} — ₹{self.amount}"


# ======== Audit Trail ========

class FinanceAuditLog(models.Model):
    """Audit trail for financial actions."""
    action = models.CharField(max_length=50)
    model_name = models.CharField(max_length=50)
    object_id = models.CharField(max_length=50)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name='finance_audit_logs'
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    details = models.JSONField(default=dict)
    
    class Meta:
        ordering = ['-timestamp']
    
    def __str__(self):
        return f"{self.action} - {self.model_name} - {self.timestamp}"
