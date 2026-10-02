"""
Khata Working Capital Gate Engine — Books3 Data Intelligence Platform.
Implements the Finn Protocol and account-level Days Sales Outstanding (DSO) aging.
Enforces hard mechanical halts: blocks automated replenishment for accounts with
DSO > 45 days or outstanding balance exceeding credit limits.
"""

from decimal import Decimal
from typing import List, Dict, Any, Optional
from datetime import date, datetime
import math


class KhataWorkingCapitalGateEngine:
    """
    Sovereign Working Capital Gate evaluating customer and outlet receivables.
    Protects bookstore liquidity by intercepting replenishment proposals before
    credit limits or aging thresholds are breached.
    """

    DEFAULT_MAX_DSO_DAYS = 45
    DEFAULT_WARNING_DSO_DAYS = 30
    DEFAULT_CREDIT_LIMIT = Decimal('50000.00')

    STATUS_CLEARED = 'CLEARED'
    STATUS_WARNING = 'WARNING'
    STATUS_BLOCKED = 'BLOCKED'

    @classmethod
    def evaluate_account(
        cls,
        account_id: str,
        account_name: str,
        invoices: List[Dict[str, Any]],
        payments: List[Dict[str, Any]],
        credit_limit: Optional[float] = None,
        max_dso_threshold: int = DEFAULT_MAX_DSO_DAYS,
        as_of_date: Optional[date] = None,
        legacy_debt_amount: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Evaluates an account's financial exposure using The Finn Protocol and aging analysis.

        Parameters:
        - account_id: UUID or string ID of customer/outlet
        - account_name: Human-readable entity name
        - invoices: List of dicts: [{'id': str, 'date': 'YYYY-MM-DD', 'amount': float, 'net_paid': float}]
        - payments: List of dicts: [{'id': str, 'date': 'YYYY-MM-DD', 'amount': float}]
        - credit_limit: Account-specific credit ceiling (defaults to ₹50,000)
        - max_dso_threshold: Upper limit for days sales outstanding (default: 45 days)
        - as_of_date: Evaluation timestamp (defaults to current date)
        - legacy_debt_amount: Outstanding unrecovered legacy debt
        """
        ref_date = as_of_date or date.today()
        limit = Decimal(str(credit_limit)) if credit_limit is not None else cls.DEFAULT_CREDIT_LIMIT

        # 1. Deterministic Finn Protocol Balance Calculation
        # Outstanding Balance = Sum(Invoice Amounts) + Legacy Debt - Sum(Payments)
        total_invoiced = Decimal('0.00')
        total_paid_invoices = Decimal('0.00')
        unpaid_invoices = []

        for inv in invoices:
            inv_amt = Decimal(str(inv.get('amount', 0.0)))
            inv_paid = Decimal(str(inv.get('net_paid', 0.0)))
            total_invoiced += inv_amt
            total_paid_invoices += inv_paid

            balance_due = max(Decimal('0.00'), inv_amt - inv_paid)
            if balance_due > Decimal('0.00'):
                inv_date_str = str(inv.get('date', ''))
                try:
                    inv_date = datetime.strptime(inv_date_str, '%Y-%m-%d').date()
                except (ValueError, TypeError):
                    inv_date = ref_date

                age_days = max(0, (ref_date - inv_date).days)
                unpaid_invoices.append({
                    'id': str(inv.get('id', '')),
                    'date': inv_date.isoformat(),
                    'amount': float(inv_amt),
                    'balance_due': float(balance_due),
                    'age_days': age_days,
                })

        # Sort unpaid invoices chronologically (oldest first)
        unpaid_invoices.sort(key=lambda x: x['age_days'], reverse=True)

        total_direct_payments = Decimal('0.00')
        for p in payments:
            total_direct_payments += Decimal(str(p.get('amount', 0.0)))

        legacy_debt = Decimal(str(legacy_debt_amount))
        
        # Finn Protocol: Outstanding Balance
        # When net_paid is tracked per invoice, sum(balance_due) + legacy_debt
        outstanding_balance = sum((Decimal(str(it['balance_due'])) for it in unpaid_invoices), Decimal('0.00')) + legacy_debt

        # 2. Aging Bucketing & Days Sales Outstanding (DSO)
        bucket_0_30 = Decimal('0.00')
        bucket_31_45 = Decimal('0.00')
        bucket_46_60 = Decimal('0.00')
        bucket_61_plus = Decimal('0.00')

        weighted_days_sum = Decimal('0.00')
        max_dso_days = 0
        oldest_unpaid_date = None

        if unpaid_invoices:
            max_dso_days = unpaid_invoices[0]['age_days']
            oldest_unpaid_date = unpaid_invoices[0]['date']

        for it in unpaid_invoices:
            due = Decimal(str(it['balance_due']))
            age = it['age_days']
            weighted_days_sum += due * Decimal(str(age))

            if age <= 30:
                bucket_0_30 += due
            elif age <= 45:
                bucket_31_45 += due
            elif age <= 60:
                bucket_46_60 += due
            else:
                bucket_61_plus += due

        # If legacy debt exists, assign it to the oldest bucket (61+ days)
        if legacy_debt > Decimal('0.00'):
            bucket_61_plus += legacy_debt
            if max_dso_days < 90:
                max_dso_days = 90  # Legacy debt is from prior annual cycle
            weighted_days_sum += legacy_debt * Decimal('90')

        weighted_dso = float(weighted_days_sum / max(Decimal('1.00'), outstanding_balance)) if outstanding_balance > Decimal('0.00') else 0.0

        # 3. Credit Utilization
        credit_utilization_pct = 0.0
        if limit > Decimal('0.00'):
            credit_utilization_pct = round(float((outstanding_balance / limit) * Decimal('100.0')), 2)

        # 4. Mechanical Working Capital Gate Evaluation
        violations = []
        status = cls.STATUS_CLEARED

        is_dso_breached = max_dso_days > max_dso_threshold
        is_limit_breached = outstanding_balance > limit

        if is_dso_breached:
            violations.append(
                f"DSO limit exceeded: Oldest unpaid invoice is {max_dso_days} days old (threshold: {max_dso_threshold} days)."
            )
        if is_limit_breached:
            violations.append(
                f"Credit limit breached: Outstanding balance of ₹{float(outstanding_balance):,.2f} exceeds authorized limit of ₹{float(limit):,.2f} ({credit_utilization_pct}% utilization)."
            )

        if is_dso_breached or is_limit_breached:
            status = cls.STATUS_BLOCKED
            is_cleared = False
            overdue_amount = float(bucket_46_60 + bucket_61_plus)
            recommended_action = (
                f"HALT REPLENISHMENT: Account has ₹{overdue_amount:,.2f} overdue (>45d). "
                f"Settle delinquent balance to unlock order dispatch."
            )
        elif max_dso_days > cls.DEFAULT_WARNING_DSO_DAYS or credit_utilization_pct >= 80.0:
            status = cls.STATUS_WARNING
            is_cleared = True
            recommended_action = (
                f"ELEVATED RISK: Account is at {credit_utilization_pct}% credit utilization with {max_dso_days}d DSO. "
                f"Request collection before expanding credit lines."
            )
        else:
            status = cls.STATUS_CLEARED
            is_cleared = True
            recommended_action = "Account in good standing. Replenishment cleared."

        return {
            'account_id': str(account_id),
            'account_name': str(account_name),
            'is_cleared': is_cleared,
            'status': status,
            'max_dso_days': int(max_dso_days),
            'weighted_dso_days': round(weighted_dso, 1),
            'outstanding_balance': float(outstanding_balance.quantize(Decimal('0.01'))),
            'credit_limit': float(limit.quantize(Decimal('0.01'))),
            'credit_utilization_pct': credit_utilization_pct,
            'oldest_unpaid_date': oldest_unpaid_date,
            'unpaid_invoice_count': len(unpaid_invoices),
            'aging_breakdown': {
                'current_0_30': float(bucket_0_30.quantize(Decimal('0.01'))),
                'watchlist_31_45': float(bucket_31_45.quantize(Decimal('0.01'))),
                'delinquent_46_60': float(bucket_46_60.quantize(Decimal('0.01'))),
                'critical_61_plus': float(bucket_61_plus.quantize(Decimal('0.01'))),
            },
            'violations': violations,
            'recommended_action': recommended_action,
        }

    @classmethod
    def batch_gate_check(
        cls,
        accounts: List[Dict[str, Any]],
        max_dso_threshold: int = DEFAULT_MAX_DSO_DAYS,
        as_of_date: Optional[date] = None,
    ) -> Dict[str, Any]:
        """
        Evaluates a batch of customer/outlet accounts simultaneously.
        Categorizes accounts into cleared, warning, and blocked cohorts.
        """
        results = []
        cleared_count = 0
        warning_count = 0
        blocked_count = 0
        total_blocked_exposure = Decimal('0.00')

        for acc in accounts:
            eval_res = cls.evaluate_account(
                account_id=acc.get('account_id', ''),
                account_name=acc.get('account_name', ''),
                invoices=acc.get('invoices', []),
                payments=acc.get('payments', []),
                credit_limit=acc.get('credit_limit'),
                max_dso_threshold=max_dso_threshold,
                as_of_date=as_of_date,
                legacy_debt_amount=acc.get('legacy_debt_amount', 0.0),
            )
            results.append(eval_res)

            st = eval_res['status']
            if st == cls.STATUS_BLOCKED:
                blocked_count += 1
                total_blocked_exposure += Decimal(str(eval_res['outstanding_balance']))
            elif st == cls.STATUS_WARNING:
                warning_count += 1
            else:
                cleared_count += 1

        return {
            'total_accounts_evaluated': len(accounts),
            'cleared_accounts_count': cleared_count,
            'warning_accounts_count': warning_count,
            'blocked_accounts_count': blocked_count,
            'total_blocked_receivables_exposure': float(total_blocked_exposure.quantize(Decimal('0.01'))),
            'accounts': results,
        }
