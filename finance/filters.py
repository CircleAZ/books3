"""
Tokenized Search Filters for Finance App.
Provides tokenized parsing for Bank Transactions, Cash Wallet Transactions,
Unified All-Transactions Ledger, Company Expenses, and Employee Expenses.
"""

import re
from decimal import Decimal
from django.db.models import Q
from core.filters import BaseTokenizedSearchFilter


class TransactionTokenizedSearchFilter(BaseTokenizedSearchFilter):
    """
    Tokenized search filter for Bank Transactions & Unified Ledger.
    Supported qualifiers:
      - ref:<str>         -> reference / UTR number lookup
      - type:<str>        -> transaction type or linked domain type (order_payment, expense, salary, deposit, withdrawal)
      - source:<str>      -> ledger source ('bank' vs 'wallet')
      - account:<str>     -> bank account name lookup
      - amount:<op><num>  -> numeric amount comparison (>5000, <=1000, =2500)
      - user:<str>        -> recorded_by username or name
      - order:<num>       -> order display_id lookup in reference
      - date:<date_expr>  -> transaction date comparison (today, yesterday, this_week, this_month, >YYYY-MM-DD)
      - reconciled:<bool> -> reconciliation status filter
      - -<prefix>:<val>   -> inverted negation (~Q)
      - <free text>       -> reference, description, account name
    """
    DISPLAY_ID_FIELD = None
    FREE_TEXT_FIELDS = ['reference', 'description', 'account__name', 'account__bank_name', 'recorded_by__username']

    PREFIX_MAP = {
        'ref': 'reference__icontains',
        'type': 'handle_type',
        'source': 'handle_source',
        'account': 'handle_account',
        'amount': ('numeric', 'amount'),
        'user': 'handle_user',
        'order': 'handle_order',
        'date': ('date', 'date'),
        'reconciled': 'handle_reconciled',
    }

    @classmethod
    def handle_type(cls, val):
        clean_val = val.strip().lower()
        if clean_val in ('deposit', 'withdrawal', 'transfer_in', 'transfer_out'):
            return Q(transaction_type__iexact=clean_val)
        elif clean_val in ('order_payment', 'order'):
            return Q(reference__startswith='order_') | Q(description__icontains='order')
        elif clean_val == 'expense':
            return Q(reference__startswith='expense_') | Q(description__icontains='expense')
        elif clean_val == 'employee_expense':
            return Q(reference__startswith='employee_expense_') | Q(description__icontains='employee expense')
        elif clean_val == 'salary':
            return Q(reference__startswith='salary_') | Q(description__icontains='salary')
        elif clean_val == 'refund':
            return Q(reference__startswith='refund_') | Q(description__icontains='refund')
        elif clean_val == 'loan':
            return Q(reference__startswith='loan_') | Q(description__icontains='loan')
        elif clean_val == 'other_income':
            return Q(reference__startswith='other_income_') | Q(description__icontains='income')
        return Q(transaction_type__iexact=clean_val) | Q(reference__icontains=clean_val)

    @classmethod
    def handle_source(cls, val):
        # On BankTransaction, all records belong to source 'bank'
        clean_val = val.strip().lower()
        if clean_val == 'bank':
            return ~Q(pk__isnull=True)
        elif clean_val in ('wallet', 'cash'):
            return Q(pk__isnull=True)
        return Q()

    @classmethod
    def handle_account(cls, val):
        return Q(account__name__icontains=val) | Q(account__bank_name__icontains=val)

    @classmethod
    def handle_user(cls, val):
        return (
            Q(recorded_by__username__icontains=val) |
            Q(recorded_by__first_name__icontains=val) |
            Q(recorded_by__last_name__icontains=val)
        )

    @classmethod
    def handle_order(cls, val):
        clean_id = re.sub(r'^(?:ord|order)[#\-_]?', '', val.strip(), flags=re.IGNORECASE).lstrip('#').strip()
        if not clean_id:
            return Q(pk__isnull=True)
        return Q(reference__icontains=f"order_{clean_id}") | Q(description__icontains=clean_id)

    @classmethod
    def handle_reconciled(cls, val):
        is_true = val.strip().lower() in ('true', 'yes', '1')
        return Q(is_reconciled=is_true)

    @classmethod
    def has_source_filter(cls, query_str):
        """
        Detects if query_str specifies source:bank or source:wallet (including negation).
        Returns 'bank', 'wallet', 'none', or None.
        """
        if not query_str:
            return None
        tokens = cls.TOKEN_PATTERN.findall(query_str)
        allow_bank = None
        allow_wallet = None
        for token in tokens:
            is_negated = token.startswith('-')
            clean = token[1:] if is_negated else token
            if clean.lower().startswith('source:'):
                val = clean.split(':', 1)[1].strip().strip('"').lower()
                if val == 'bank':
                    if is_negated:
                        allow_bank = False
                    else:
                        allow_bank = True
                        if allow_wallet is None:
                            allow_wallet = False
                elif val in ('wallet', 'cash'):
                    if is_negated:
                        allow_wallet = False
                    else:
                        allow_wallet = True
                        if allow_bank is None:
                            allow_bank = False
        if allow_bank is True and allow_wallet is False:
            return 'bank'
        if allow_wallet is True and allow_bank is False:
            return 'wallet'
        if allow_bank is False and allow_wallet is False:
            return 'none'
        return None

    @classmethod
    def parse_query_for_wallet(cls, query_str):
        """
        Parses full query_str specifically mapped to CashWalletTransaction fields.
        """
        if not query_str or not query_str.strip():
            return Q()

        clean_query = query_str.strip()
        if clean_query.count('"') % 2 != 0:
            clean_query += '"'

        tokens = cls.TOKEN_PATTERN.findall(clean_query)
        main_q = Q()
        free_terms = []

        for token in tokens:
            is_negated = token.startswith('-')
            clean_token = token[1:] if is_negated else token

            if ':' in clean_token:
                parts = clean_token.split(':', 1)
                prefix = parts[0].lower()
                val = parts[1].strip().strip('"')

                if not val:
                    continue

                clause = None
                if prefix == 'ref':
                    clause = Q(reference_id__icontains=val)
                elif prefix == 'type':
                    clean_val = val.lower()
                    if clean_val in ('deposit', 'withdrawal'):
                        clause = Q(transaction_type__iexact=clean_val)
                    elif clean_val in ('order_payment', 'order'):
                        clause = Q(reference_id__startswith='order_') | Q(description__icontains='order')
                    elif clean_val == 'expense':
                        clause = Q(reference_id__startswith='expense_') | Q(description__icontains='expense')
                    elif clean_val == 'employee_expense':
                        clause = Q(reference_id__startswith='employee_expense_') | Q(description__icontains='employee expense')
                    elif clean_val == 'salary':
                        clause = Q(reference_id__startswith='salary_') | Q(description__icontains='salary')
                    elif clean_val == 'refund':
                        clause = Q(reference_id__startswith='refund_') | Q(description__icontains='refund')
                    elif clean_val == 'loan':
                        clause = Q(reference_id__startswith='loan_') | Q(description__icontains='loan')
                    else:
                        clause = Q(transaction_type__iexact=clean_val) | Q(reference_id__icontains=clean_val)
                elif prefix == 'source':
                    # On CashWalletTransaction, source is wallet
                    clean_val = val.lower()
                    if clean_val in ('wallet', 'cash'):
                        clause = ~Q(pk__isnull=True)
                    elif clean_val == 'bank':
                        clause = Q(pk__isnull=True)
                elif prefix in ('account', 'wallet'):
                    clause = Q(wallet__name__icontains=val)
                elif prefix == 'amount':
                    clause = cls.parse_numeric_clause('amount', val)
                elif prefix == 'user':
                    clause = (
                        Q(created_by__username__icontains=val) |
                        Q(created_by__first_name__icontains=val) |
                        Q(created_by__last_name__icontains=val)
                    )
                elif prefix == 'order':
                    clean_id = re.sub(r'^(?:ord|order)[#\-_]?', '', val.strip(), flags=re.IGNORECASE).lstrip('#').strip()
                    if not clean_id:
                        clause = Q(pk__isnull=True)
                    else:
                        clause = Q(reference_id__icontains=f"order_{clean_id}") | Q(description__icontains=clean_id)
                elif prefix == 'date':
                    clause = cls.parse_date_clause('date', val)

                if clause is not None:
                    if is_negated:
                        main_q &= ~clause
                    else:
                        main_q &= clause
                else:
                    free_terms.append(clean_token)
            else:
                free_terms.append(token)

        for term in free_terms:
            clean_term = term.strip('"').strip()
            if not clean_term:
                continue
            term_q = (
                Q(reference_id__icontains=clean_term) |
                Q(description__icontains=clean_term) |
                Q(wallet__name__icontains=clean_term) |
                Q(created_by__username__icontains=clean_term)
            )
            main_q &= term_q

        return main_q


class ExpenseTokenizedSearchFilter(BaseTokenizedSearchFilter):
    """
    Tokenized search filter for Company Expenses.
    Supported qualifiers:
      - id:<str>          -> UUID startswith or stripped ID lookup
      - payee:<str>       -> payee_name icontains
      - category:<str>    -> category name icontains
      - status:<str>      -> payment status (unpaid, partial, paid) or approval status
      - approval:<str>    -> approval status (auto_approved, pending, approved, rejected)
      - employee:<str>    -> created_by username or name
      - user:<str>        -> created_by username or name
      - amount:<op><num>  -> numeric comparison on total_amount
      - high_value:<bool> -> total_amount >= 5000.00 (approval rule threshold)
      - date:<date_expr>  -> expense date comparison (today, yesterday, this_week, this_month, >YYYY-MM-DD)
      - -<prefix>:<val>   -> inverted negation (~Q)
      - <free text>       -> payee_name, description, notes
    """
    DISPLAY_ID_FIELD = None
    FREE_TEXT_FIELDS = ['payee_name', 'description', 'notes', 'created_by__username']

    PREFIX_MAP = {
        'id': 'handle_id',
        'payee': 'payee_name__icontains',
        'category': 'category__name__icontains',
        'status': 'handle_status',
        'approval': 'approval_status__iexact',
        'employee': 'handle_employee',
        'user': 'handle_employee',
        'amount': ('numeric', 'total_amount'),
        'high_value': 'handle_high_value',
        'date': ('date', 'date'),
    }

    @classmethod
    def handle_id(cls, val):
        clean_id = re.sub(r'^(?:exp)[#\-_]?', '', val.strip(), flags=re.IGNORECASE).lstrip('#').strip()
        if not clean_id:
            return Q(pk__isnull=True)
        return Q(id__startswith=clean_id)

    @classmethod
    def handle_status(cls, val):
        clean_val = val.strip().lower()
        if clean_val in ('unpaid', 'partial', 'paid'):
            return Q(payment_status__iexact=clean_val)
        elif clean_val in ('auto_approved', 'pending', 'approved', 'rejected'):
            return Q(approval_status__iexact=clean_val)
        return Q(payment_status__iexact=clean_val) | Q(approval_status__iexact=clean_val)

    @classmethod
    def handle_employee(cls, val):
        return (
            Q(created_by__username__icontains=val) |
            Q(created_by__first_name__icontains=val) |
            Q(created_by__last_name__icontains=val)
        )

    @classmethod
    def handle_high_value(cls, val):
        is_high = val.strip().lower() in ('true', 'yes', '1')
        if is_high:
            return Q(total_amount__gte=Decimal('5000.00'))
        return Q(total_amount__lt=Decimal('5000.00'))


class EmployeeExpenseTokenizedSearchFilter(BaseTokenizedSearchFilter):
    """
    Tokenized search filter for Employee Expense Claims.
    Supported qualifiers:
      - id:<str>          -> UUID startswith lookup
      - employee:<str>    -> employee username or full name icontains
      - user:<str>        -> employee username or full name icontains
      - category:<str>    -> category name icontains
      - status:<str>      -> claim status (pending, approved, rejected, reimbursed)
      - amount:<op><num>  -> numeric amount comparison
      - high_value:<bool> -> amount >= 5000.00
      - date:<date_expr>  -> expense date comparison
      - -<prefix>:<val>   -> inverted negation (~Q)
      - <free text>       -> description, rejection_reason, employee username/name
    """
    DISPLAY_ID_FIELD = None
    FREE_TEXT_FIELDS = ['description', 'rejection_reason', 'employee__username', 'employee__first_name', 'employee__last_name']

    PREFIX_MAP = {
        'id': 'handle_id',
        'employee': 'handle_employee',
        'user': 'handle_employee',
        'category': 'category__name__icontains',
        'status': 'status__iexact',
        'amount': ('numeric', 'amount'),
        'high_value': 'handle_high_value',
        'date': ('date', 'date'),
    }

    @classmethod
    def handle_id(cls, val):
        clean_id = re.sub(r'^(?:exp)[#\-_]?', '', val.strip(), flags=re.IGNORECASE).lstrip('#').strip()
        if not clean_id:
            return Q(pk__isnull=True)
        return Q(id__startswith=clean_id)

    @classmethod
    def handle_employee(cls, val):
        return (
            Q(employee__username__icontains=val) |
            Q(employee__first_name__icontains=val) |
            Q(employee__last_name__icontains=val)
        )

    @classmethod
    def handle_high_value(cls, val):
        is_high = val.strip().lower() in ('true', 'yes', '1')
        if is_high:
            return Q(amount__gte=Decimal('5000.00'))
        return Q(amount__lt=Decimal('5000.00'))
