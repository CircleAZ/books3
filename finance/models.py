"""
Finance & Accounting Models for AZ Books.
Phase 13: Complete financial management including expenses, income, banking, 
employee finance, and lenders.
"""

from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
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
    """
    Company expenses with payment tracking.
    Payee can be a Vendor, Employee, or Lender.
    """
    PAYMENT_STATUS_CHOICES = [
        ('unpaid', 'Unpaid'),
        ('partial', 'Partially Paid'),
        ('paid', 'Fully Paid'),
    ]
    
    PAYEE_TYPE_CHOICES = [
        ('vendor', 'Vendor'),
        ('employee', 'Employee'),
        ('lender', 'Lender'),
        ('other', 'Other'),
    ]
    
    date = models.DateField()
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='expenses'
    )
    payee_type = models.CharField(max_length=20, choices=PAYEE_TYPE_CHOICES)
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
        choices=PAYMENT_STATUS_CHOICES, 
        default='unpaid'
    )
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
        return f"{self.date} - {self.payee_name} - ₹{self.total_amount}"
    
    def save(self, *args, **kwargs):
        # Auto-calculate total if not explicitly provided
        if self.total_amount is None:
            self.total_amount = self.amount + self.tax_amount
        # Update payment status based on paid amount
        if self.paid_amount >= self.total_amount:
            self.payment_status = 'paid'
        elif self.paid_amount > 0:
            self.payment_status = 'partial'
        else:
            self.payment_status = 'unpaid'
        super().save(*args, **kwargs)
    
    @property
    def balance_due(self):
        return self.total_amount - self.paid_amount


class ExpensePayment(TimestampedModel):
    """
    Individual payment records for an expense.
    Supports multi-payment for single expense.
    """
    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('upi', 'UPI'),
        ('bank', 'Bank Transfer'),
        ('cheque', 'Cheque'),
        ('card', 'Card'),
    ]
    
    expense = models.ForeignKey(
        Expense,
        on_delete=models.CASCADE,
        related_name='payments'
    )
    date = models.DateField()
    amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES)
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
        ordering = ['-date', '-created_at']
    
    def __str__(self):
        return f"{self.date} - ₹{self.amount} ({self.method})"
    
    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Update expense paid amount
        total_paid = self.expense.payments.aggregate(
            total=models.Sum('amount')
        )['total'] or Decimal('0.00')
        self.expense.paid_amount = total_paid
        self.expense.save()


class OtherIncome(SoftDeleteModel):
    """
    Non-sales revenue (interest, rent, etc.)
    """
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
        return f"{self.date} - {self.source} - ₹{self.amount}"


class BankAccount(TimestampedModel):
    """
    Bank accounts for tracking company finances.
    """
    ACCOUNT_TYPE_CHOICES = [
        ('current', 'Current Account'),
        ('savings', 'Savings Account'),
        ('cash', 'Cash Account'),
    ]
    
    name = models.CharField(max_length=100)
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPE_CHOICES)
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


class BankTransaction(TimestampedModel):
    """
    Bank transactions (deposits, withdrawals, transfers).
    """
    TRANSACTION_TYPE_CHOICES = [
        ('deposit', 'Deposit'),
        ('withdrawal', 'Withdrawal'),
        ('transfer_in', 'Transfer In'),
        ('transfer_out', 'Transfer Out'),
    ]
    
    account = models.ForeignKey(
        BankAccount,
        on_delete=models.CASCADE,
        related_name='transactions'
    )
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPE_CHOICES)
    date = models.DateField()
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
        return f"{self.date} - {self.transaction_type} - ₹{self.amount}"
    
    def save(self, *args, **kwargs):
        is_new = not self.pk
        old_amount = Decimal('0.00')
        old_type = None
        
        if not is_new:
            # Reverse the old transaction's effect on balance
            try:
                old = BankTransaction.objects.get(pk=self.pk)
                old_amount = old.amount
                old_type = old.transaction_type
                if old_type in ['deposit', 'transfer_in']:
                    self.account.current_balance -= old_amount
                else:
                    self.account.current_balance += old_amount
            except BankTransaction.DoesNotExist:
                pass
        
        super().save(*args, **kwargs)
        
        # Apply the new/updated transaction's effect on balance
        if self.transaction_type in ['deposit', 'transfer_in']:
            self.account.current_balance += self.amount
        else:
            self.account.current_balance -= self.amount
        self.account.save()
    
    def delete(self, *args, **kwargs):
        # Reverse balance before deleting
        if self.transaction_type in ['deposit', 'transfer_in']:
            self.account.current_balance -= self.amount
        else:
            self.account.current_balance += self.amount
        self.account.save()
        super().delete(*args, **kwargs)


# ======== Employee Finance Models ========

class EmployeeExpense(SoftDeleteModel):
    """
    Employee-submitted expenses for reimbursement.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending Review'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('reimbursed', 'Reimbursed'),
    ]
    
    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='expense_claims'
    )
    date = models.DateField()
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
    receipt = models.ImageField(upload_to='employee_receipts/')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
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
        return f"{self.employee.username} - {self.date} - ₹{self.amount}"


class EmployeeSalary(TimestampedModel):
    """
    Employee salary configuration.
    """
    FREQUENCY_CHOICES = [
        ('monthly', 'Monthly'),
        ('weekly', 'Weekly'),
        ('biweekly', 'Bi-Weekly'),
    ]
    
    employee = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='salary_config'
    )
    base_amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES, default='monthly')
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
        return f"{self.employee.username} - ₹{self.base_amount}/{self.frequency}"


class SalaryPayment(TimestampedModel):
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
    payment_method = models.CharField(max_length=50)
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
    term_months = models.PositiveIntegerField(help_text='Loan term in months')
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
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-start_date']
    
    def __str__(self):
        return f"{self.lender.name} - ₹{self.principal_amount}"
    
    @property
    def balance_due(self):
        # Simple calculation - principal minus paid
        return self.principal_amount - self.total_paid
    
    @property
    def total_interest(self):
        # Simple interest calculation
        return (self.principal_amount * self.interest_rate * self.term_months) / (12 * 100)


class LoanRepayment(TimestampedModel):
    """
    Individual loan repayment record.
    """
    PAYMENT_TYPE_CHOICES = [
        ('principal', 'Principal'),
        ('interest', 'Interest'),
        ('both', 'Principal + Interest'),
    ]
    
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
    payment_method = models.CharField(max_length=50)
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
        return f"{self.loan} - {self.date} - ₹{self.amount}"
    
    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Update loan total paid
        total = self.loan.repayments.aggregate(
            total=models.Sum('principal_portion')
        )['total'] or Decimal('0.00')
        self.loan.total_paid = total
        self.loan.save()
