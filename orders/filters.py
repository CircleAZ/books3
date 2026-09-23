"""
Tokenized Search Filter for Orders.
Decomposes search queries into namespaced qualifiers (status:, payment:, delivery:,
customer:, product:, total:, balance:, date:, etc.) and free-text terms.
"""

import re
from decimal import Decimal
from django.db.models import Q, Exists, OuterRef, Subquery, Sum, DecimalField, F, Value, Case, When
from django.db.models.functions import Coalesce, Greatest
from core.filters import BaseTokenizedSearchFilter


class OrderTokenizedSearchFilter(BaseTokenizedSearchFilter):
    """
    Intelligent tokenized search filter supporting:
      - id:<int>              -> exact display_id match (or #<int>)
      - status:<str>          -> order_status / overall_status
      - payment:<str>         -> payment_status
      - delivery:<str>        -> delivery_status
      - return:<str>          -> return_status
      - refund:<str>          -> refund_status
      - cancel:<str>          -> cancellation_status
      - customer:<str>        -> customer first/last name or guest_name
      - phone:<str>           -> customer phone or guest_phone
      - product:<str>         -> Exists() subquery on OrderItem.product.name
      - total:<op><num>       -> order total comparison (>1000, <=500, =1500)
      - balance:<op><num>     -> outstanding balance comparison (>0, =0, >500)
      - date:<date_expr>      -> date:today, date:yesterday, date:>2026-09-01
      - -<prefix>:<val>       -> negation (~Q)
      - <raw terms>           -> fallback to customer/guest name, phone, display_id
    """
    FREE_TEXT_FIELDS = [
        'guest_name',
        'guest_phone',
        'customer__first_name',
        'customer__last_name',
        'customer__phone',
    ]

    PREFIX_MAP = {
        'id': ('id', 'display_id'),
        'display_id': ('id', 'display_id'),
        'status': 'handle_status',
        'order_status': 'handle_status',
        'payment': 'payment_status__iexact',
        'payment_status': 'payment_status__iexact',
        'delivery': 'delivery_status__iexact',
        'delivery_status': 'delivery_status__iexact',
        'return': 'return_status__iexact',
        'return_status': 'return_status__iexact',
        'refund': 'refund_status__iexact',
        'refund_status': 'refund_status__iexact',
        'cancel': 'cancellation_status__iexact',
        'cancellation': 'cancellation_status__iexact',
        'customer': 'handle_customer',
        'phone': 'handle_phone',
        'product': 'handle_product',
        'total': ('numeric', 'total'),
        'balance': 'handle_balance',
        'date': ('date', 'created_at__date'),
    }

    @classmethod
    def handle_status(cls, val):
        return Q(order_status__iexact=val) | Q(overall_status__iexact=val)

    @classmethod
    def handle_customer(cls, val):
        return (
            Q(customer__first_name__icontains=val) |
            Q(customer__last_name__icontains=val) |
            Q(guest_name__icontains=val)
        )

    @classmethod
    def handle_phone(cls, val):
        return (
            Q(customer__phone__icontains=val) |
            Q(guest_phone__icontains=val)
        )

    @classmethod
    def handle_product(cls, val):
        from orders.models import OrderItem
        return Q(
            Exists(
                OrderItem.objects.filter(
                    order=OuterRef('pk'),
                    product__name__icontains=val
                )
            )
        )

    @classmethod
    def handle_balance(cls, val):
        m = cls.NUMERIC_PATTERN.match(val.strip())
        if not m:
            return None
        op, num_str = m.groups()
        try:
            num = Decimal(num_str) if '.' in num_str else int(num_str)
        except Exception:
            return None

        if num == 0:
            if op == '>':
                return Q(annotated_balance__gt=0)
            elif op in ('=', '<=', None):
                return Q(annotated_balance=0)
            elif op == '<':
                return Q(payment_status='overpaid')

        lookup_suffix = cls.NUMERIC_OPERATORS.get(op, 'exact')
        if lookup_suffix == 'exact':
            return Q(annotated_balance=num)
        return Q(**{f"annotated_balance__{lookup_suffix}": num})

    def filter_queryset(self, request, queryset, view):
        search_terms = request.query_params.get(self.search_param, '')
        if not search_terms:
            return queryset

        # If balance token is used, annotate annotated_balance (case-insensitive with optional whitespace)
        if re.search(r'\bbalance\s*:', search_terms, re.IGNORECASE):
            from orders.models import Payment, Refund
            paid_sq = Payment.objects.filter(order=OuterRef('pk')).values('order').annotate(s=Sum('amount')).values('s')
            refund_sq = Refund.objects.filter(order=OuterRef('pk'), status='completed').values('order').annotate(s=Sum('amount')).values('s')
            queryset = queryset.annotate(
                _calc_net_paid=Coalesce(Subquery(paid_sq, output_field=DecimalField()), Value(Decimal('0'))) -
                               Coalesce(Subquery(refund_sq, output_field=DecimalField()), Value(Decimal('0')))
            ).annotate(
                annotated_balance=Case(
                    When(
                        Q(order_status='cancelled') | Q(payment_status__in=['paid', 'overpaid', 'refunded']),
                        then=Value(Decimal('0'))
                    ),
                    default=Greatest(Value(Decimal('0')), F('total') - F('_calc_net_paid')),
                    output_field=DecimalField()
                )
            )

        q = self.parse_query(search_terms)
        return queryset.filter(q)

