"""
Tokenized Search Filter for Procurement Purchase Orders.
Decomposes search queries into namespaced qualifiers (id:, vendor:, status:, payment:,
product:, total:, paid:, date:, due:, etc.) and free-text terms.
"""

from django.db.models import Q, Exists, OuterRef
from core.filters import BaseTokenizedSearchFilter


class PurchaseOrderTokenizedSearchFilter(BaseTokenizedSearchFilter):
    """
    Intelligent tokenized search filter for Purchase Orders supporting:
      - id:<int>              -> exact display_id match (or #<int>)
      - vendor:<str>          -> vendor name icontains
      - status:<str>          -> PO status (draft, ordered, partially_received, received, cancelled)
      - payment:<str>         -> payment_status (pending, partial, paid)
      - product:<str>         -> Exists() subquery on PurchaseOrderItem.product.name
      - total:<op><num>       -> total_amount comparison (>10000, <=5000, =2000)
      - paid:<op><num>        -> amount_paid comparison (>0, =0)
      - date:<date_expr>      -> date:today, date:yesterday, date:>2026-08-01 on order_date
      - due:<date_expr>       -> expected_delivery_date comparison
      - -<prefix>:<val>       -> negation (~Q)
      - <raw terms>           -> fallback to display_id, vendor name, notes
    """
    DISPLAY_ID_FIELD = 'display_id'

    FREE_TEXT_FIELDS = [
        'vendor__name',
        'notes',
    ]

    PREFIX_MAP = {
        'id': ('id', 'display_id'),
        'display_id': ('id', 'display_id'),
        'vendor': 'vendor__name__icontains',
        'status': 'status__iexact',
        'payment': 'payment_status__iexact',
        'payment_status': 'payment_status__iexact',
        'product': 'handle_product',
        'total': ('numeric', 'total_amount'),
        'total_amount': ('numeric', 'total_amount'),
        'paid': ('numeric', 'amount_paid'),
        'amount_paid': ('numeric', 'amount_paid'),
        'date': ('date', 'order_date'),
        'order_date': ('date', 'order_date'),
        'due': ('date', 'expected_delivery_date'),
        'expected_delivery_date': ('date', 'expected_delivery_date'),
    }

    @classmethod
    def handle_product(cls, val):
        from procurement.models import PurchaseOrderItem
        return Q(
            Exists(
                PurchaseOrderItem.objects.filter(
                    purchase_order=OuterRef('pk'),
                    product__name__icontains=val
                )
            )
        )

    @classmethod
    def build_free_text_q(cls, term):
        term_q = super().build_free_text_q(term)
        from procurement.models import PurchaseOrderItem
        term_q |= Q(
            Exists(
                PurchaseOrderItem.objects.filter(
                    purchase_order=OuterRef('pk'),
                    product__name__icontains=term
                )
            )
        )
        return term_q

