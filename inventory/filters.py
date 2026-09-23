"""
Tokenized Search Filter for Products and Inventory.
Decomposes search queries into namespaced qualifiers (name:, category:, vendor:,
tag:, stock:, physical:, price:, cost:, status:, pack:, etc.) and free-text terms.
"""

from django.db.models import Q, F, Value
from django.db.models.functions import Coalesce
from core.filters import BaseTokenizedSearchFilter



class ProductTokenizedSearchFilter(BaseTokenizedSearchFilter):
    """
    Intelligent tokenized search filter supporting:
      - id:<int>              -> exact display_id match (or #<int>)
      - name:<str>            -> product name icontains
      - category:<str>        -> category name icontains
      - vendor:<str>          -> vendor name icontains
      - tag:<str>             -> tag name iexact
      - stock:<op><num>       -> stock_quantity comparison (>100, <=0, =10)
      - physical:<op><num>    -> physical_stock comparison
      - price:<op><num>       -> selling_price comparison
      - cost:<op><num>        -> cost_price comparison
      - status:<str>          -> in_stock, low_stock, out_of_stock
      - pack:<bool>           -> pack:true, pack:false
      - -<prefix>:<val>       -> negation (~Q)
      - <raw terms>           -> fallback to name, description, display_id
    """
    FREE_TEXT_FIELDS = ['name', 'description']

    PREFIX_MAP = {
        'id': ('id', 'display_id'),
        'display_id': ('id', 'display_id'),
        'name': 'name__icontains',
        'category': 'category__name__icontains',
        'vendor': 'vendor__name__icontains',
        'tag': 'tags__name__iexact',
        'stock': ('numeric', 'stock_quantity'),
        'stock_quantity': ('numeric', 'stock_quantity'),
        'physical': ('numeric', 'physical_stock'),
        'physical_stock': ('numeric', 'physical_stock'),
        'price': ('numeric', 'selling_price'),
        'cost': ('numeric', 'cost_price'),
        'status': 'handle_status',
        'pack': 'handle_pack',
    }

    @classmethod
    def handle_status(cls, val):
        v = val.strip().lower()
        low_threshold = Coalesce(F('low_stock_threshold'), Value(10))
        if v in ('out_of_stock', 'out-of-stock', 'out'):
            return Q(stock_quantity__lte=0)
        elif v in ('low_stock', 'low-stock', 'low'):
            return Q(stock_quantity__gt=0, stock_quantity__lte=low_threshold)
        elif v in ('in_stock', 'in-stock', 'in'):
            return Q(stock_quantity__gt=low_threshold)
        return None


    @classmethod
    def handle_pack(cls, val):
        v = val.strip().lower()
        if v in ('true', '1', 'yes', 'packs'):
            return Q(is_pack=True)
        elif v in ('false', '0', 'no', 'single'):
            return Q(is_pack=False)
        return None


class StockHistoryTokenizedSearchFilter(BaseTokenizedSearchFilter):
    """
    Intelligent tokenized search filter for Stock History supporting:
      - product:<str>         -> product name icontains
      - type:<str>            -> increase / positive, decrease / negative, set
      - reason:<str>          -> reason iexact/icontains or notes icontains
      - user:<str>            -> created_by username or names icontains
      - qty:<op><num>         -> quantity_change comparison (>50, <0, =10)
      - cost:<op><num>        -> cost_at_time comparison (>100, <=50)
      - date:<date_expr>      -> created_at__date comparison
      - -<prefix>:<val>       -> negation (~Q)
      - <raw terms>           -> fallback to product name, notes, reason
    """
    DISPLAY_ID_FIELD = None

    FREE_TEXT_FIELDS = [
        'product__name',
        'notes',
        'reason',
        'created_by__username',
    ]

    PREFIX_MAP = {
        'product': 'product__name__icontains',
        'type': 'handle_type',
        'reason': 'handle_reason',
        'user': 'handle_user',
        'qty': ('numeric', 'quantity_change'),
        'quantity': ('numeric', 'quantity_change'),
        'cost': ('numeric', 'cost_at_time'),
        'unit_cost': ('numeric', 'cost_at_time'),
        'cost_at_time': ('numeric', 'cost_at_time'),
        'date': ('date', 'created_at__date'),
    }

    @classmethod
    def handle_type(cls, val):
        v = val.strip().lower()
        if v in ('increase', 'positive', 'in'):
            return Q(quantity_change__gt=0)
        elif v in ('decrease', 'negative', 'out'):
            return Q(quantity_change__lt=0)
        elif v in ('set', 'set_total'):
            return Q(notes__icontains='Set Stock') | Q(notes__icontains='(set)')
        return Q(notes__icontains=f"({v})")

    @classmethod
    def handle_reason(cls, val):
        return Q(reason__icontains=val) | Q(notes__icontains=val)

    @classmethod
    def handle_user(cls, val):
        return (
            Q(created_by__username__icontains=val) |
            Q(created_by__first_name__icontains=val) |
            Q(created_by__last_name__icontains=val)
        )

