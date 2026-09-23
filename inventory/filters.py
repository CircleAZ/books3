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
