"""
Tokenized Search Filter for Customers.
Decomposes search queries into namespaced qualifiers (phone:, email:, taluka:, wallet:, etc.)
and free-text terms, compiling them into optimized Django ORM Q-objects.
"""

from django.db.models import Q, Exists, OuterRef
from core.filters import BaseTokenizedSearchFilter


class CustomerTokenizedSearchFilter(BaseTokenizedSearchFilter):
    """
    Intelligent tokenized search filter supporting:
      - phone:<digits>        -> targeted phone prefix/icontains
      - email:<str>           -> targeted email icontains
      - name:<str>            -> first, middle, or last name icontains
      - taluka:<str>          -> Exists() subquery on Address.taluka
      - district:<str>        -> Exists() subquery on Address.district
      - village:<str>         -> Exists() subquery on Address.region.name
      - wallet:<op><num>      -> wallet balance comparison (>0, >=100, <50, =0)
      - debt:<op><num>        -> legacy debt principal comparison
      - id:<int>              -> exact display_id match
      - group:<str>           -> customer group name icontains
      - coords:<bool>         -> filter by saved GPS location coordinates (true/false)
      - -<prefix>:<val>       -> negation (~Q)
      - <raw terms>           -> fallback to first_name, last_name, phone, display_id
    """
    FREE_TEXT_FIELDS = ['first_name', 'last_name', 'phone']

    PREFIX_MAP = {
        'phone': 'phone__icontains',
        'email': 'email__icontains',
        'name': 'handle_name',
        'id': ('id', 'display_id'),
        'display_id': ('id', 'display_id'),
        'taluka': 'handle_taluka',
        'district': 'handle_district',
        'village': 'handle_village',
        'wallet': 'handle_wallet',
        'debt': 'handle_debt',
        'group': 'customer_group__name__icontains',
        'coords': 'handle_coords',
        'location': 'handle_coords',
        'geo': 'handle_coords',
        'gps': 'handle_coords',
    }

    @classmethod
    def handle_name(cls, val):
        return (
            Q(first_name__icontains=val) |
            Q(middle_name__icontains=val) |
            Q(last_name__icontains=val)
        )

    @classmethod
    def handle_taluka(cls, val):
        from customers.models import Address
        return Q(Exists(Address.objects.filter(customer=OuterRef('pk'), taluka__icontains=val)))

    @classmethod
    def handle_district(cls, val):
        from customers.models import Address
        return Q(Exists(Address.objects.filter(customer=OuterRef('pk'), district__icontains=val)))

    @classmethod
    def handle_village(cls, val):
        from customers.models import Address
        return Q(Exists(Address.objects.filter(customer=OuterRef('pk'), region__name__icontains=val)))

    @classmethod
    def handle_wallet(cls, val):
        return cls.parse_numeric_clause('wallet__balance', val)

    @classmethod
    def handle_debt(cls, val):
        return cls.parse_numeric_clause('legacy_debt__principal_amount', val)

    @classmethod
    def handle_coords(cls, val):
        from customers.models import Address
        clean_val = val.strip().lower()
        has_coords = clean_val in ('true', 'yes', '1', 'saved', 'has')
        has_coords_q = Exists(Address.objects.filter(customer=OuterRef('pk'), location__isnull=False))
        if has_coords:
            return Q(has_coords_q)
        return ~Q(has_coords_q)

