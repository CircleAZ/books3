"""
Base Tokenized Search Filter Engine for Books3.
Decomposes complex multi-attribute search queries into namespaced tokens,
comparison operators, and free-text terms compiled directly into Django ORM Q-objects.
"""

import re
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from django.db.models import Q
from rest_framework.filters import BaseFilterBackend


class BaseTokenizedSearchFilter(BaseFilterBackend):
    """
    Standard tokenized search filter backend for Books3.
    Parses key:value tokens, quotes, and negations with zero join duplication.
    """
    search_param = 'search'

    # Mapping of prefix -> lookup field, method name, or specification tuple
    # E.g. {
    #     'status': 'order_status__iexact',
    #     'product': 'handle_product',
    #     'total': ('numeric', 'total'),
    #     'id': ('id', 'display_id'),
    #     'date': ('date', 'created_at__date'),
    # }
    PREFIX_MAP = {}

    # Fields to query when an unprefixed term is provided
    FREE_TEXT_FIELDS = []

    # Numeric comparison operators: '>=', '<=', '>', '<', '='
    NUMERIC_OPERATORS = {
        '>=': 'gte',
        '<=': 'lte',
        '>': 'gt',
        '<': 'lt',
        '=': 'exact',
    }

    TOKEN_PATTERN = re.compile(
        r'(-?[\w]+:(?:"[^"]*"|(?:>=|<=|>|<|=)?\s*\d{4}-\d{2}-\d{2}|(?:>=|<=|>|<|=)?\s*(?:today|yesterday)|(?:>=|<=|>|<|=)\s*-?\d+(?:\.\d+)?|[^\s]+)|"[^"]*"|[^\s]+)'
    )
    NUMERIC_PATTERN = re.compile(r'^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$')


    @classmethod
    def parse_numeric_clause(cls, field_name, val):
        """
        Builds a numeric comparison Q-object for >, <, >=, <=, =.
        """
        m = cls.NUMERIC_PATTERN.match(val.strip())
        if not m:
            return None
        op, num_str = m.groups()
        try:
            num = Decimal(num_str) if '.' in num_str else int(num_str)
        except Exception:
            return None

        lookup_suffix = cls.NUMERIC_OPERATORS.get(op, 'exact')
        if lookup_suffix == 'exact':
            return Q(**{field_name: num})
        return Q(**{f"{field_name}__{lookup_suffix}": num})

    @classmethod
    def parse_id_clause(cls, field_name, val, id_field='id'):
        """
        Builds an ID lookup matching exact display_id (stripped of #, PO-, ORD-, RET-) or UUID prefix.
        """
        clean_id = re.sub(r'^(?:po|ord|ret)[#\-_]?', '', val.strip(), flags=re.IGNORECASE).lstrip('#').strip()
        if clean_id.isdigit():
            return Q(**{field_name: int(clean_id)})
        return Q(**{f"{id_field}__startswith": clean_id})

    @classmethod
    def parse_date_clause(cls, field_name, val):
        """
        Builds a date comparison Q-object supporting 'today', 'yesterday'
        (with optional comparison operators: >, <, >=, <=, =),
        or ISO date strings with optional operators.
        """
        v = val.strip().lower()
        today = timezone.localdate()

        # Match operator + relative date: e.g. '<today', '<=today', 'today', '>yesterday'
        m_rel = re.match(r'^(>=|<=|>|<|=)?\s*(today|yesterday)$', v)
        if m_rel:
            op, rel_kw = m_rel.groups()
            target_date = today if rel_kw == 'today' else today - timedelta(days=1)
            lookup_suffix = cls.NUMERIC_OPERATORS.get(op, 'exact')
            if lookup_suffix == 'exact':
                return Q(**{field_name: target_date})
            return Q(**{f"{field_name}__{lookup_suffix}": target_date})

        # Match operator + ISO date: e.g. '>2026-09-01', '<=2026-09-20', '2026-09-20'
        m = re.match(r'^(>=|<=|>|<|=)?\s*(\d{4}-\d{2}-\d{2})$', v)
        if m:
            op, date_str = m.groups()
            lookup_suffix = cls.NUMERIC_OPERATORS.get(op, 'exact')
            if lookup_suffix == 'exact':
                return Q(**{field_name: date_str})
            return Q(**{f"{field_name}__{lookup_suffix}": date_str})

        return None

    @classmethod
    def resolve_prefix(cls, prefix, val):
        """
        Resolves a single prefix:value token into a Q object using handle_<prefix>
        or PREFIX_MAP.
        """
        # 1. Custom classmethod / method handle_<prefix>
        method_name = f"handle_{prefix}"
        if hasattr(cls, method_name):
            return getattr(cls, method_name)(val)

        handler = cls.PREFIX_MAP.get(prefix)
        if handler is None:
            return None

        # 2. String: could be named method or direct ORM field lookup
        if isinstance(handler, str):
            if hasattr(cls, handler):
                return getattr(cls, handler)(val)
            return Q(**{handler: val})

        # 3. Tuple: ('numeric', field), ('id', field), ('date', field)
        if isinstance(handler, tuple) and len(handler) >= 2:
            kind, target = handler[0], handler[1]
            if kind == 'numeric':
                return cls.parse_numeric_clause(target, val)
            elif kind == 'id':
                id_field = handler[2] if len(handler) > 2 else 'id'
                return cls.parse_id_clause(target, val, id_field=id_field)
            elif kind == 'date':
                return cls.parse_date_clause(target, val)

        # 4. Raw callable / lambda
        if callable(handler):
            try:
                return handler(val)
            except TypeError:
                return handler(cls, val)

        return None

    @classmethod
    def build_free_text_q(cls, term):
        """
        Builds a Q-object for an un-prefixed search term across FREE_TEXT_FIELDS.
        """
        if not term:
            return Q()

        term_q = Q()
        for field in cls.FREE_TEXT_FIELDS:
            term_q |= Q(**{f"{field}__icontains": term})

        display_id_field = getattr(cls, 'DISPLAY_ID_FIELD', 'display_id')
        if display_id_field:
            clean_term = re.sub(r'^(?:po|ord|ret)[#\-_]?', '', term.strip(), flags=re.IGNORECASE).lstrip('#').strip()
            if clean_term.isdigit():
                term_q |= Q(**{display_id_field: int(clean_term)})

        return term_q


    @classmethod
    def parse_query(cls, query_str):
        """
        Parses full raw search query string into combined Q filter.
        """
        if not query_str or not query_str.strip():
            return Q()

        clean_query = query_str.strip()
        # Auto-balance dangling quotes to prevent regex errors
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

                clause = cls.resolve_prefix(prefix, val)
                if clause is not None:
                    if is_negated:
                        main_q &= ~clause
                    else:
                        main_q &= clause
                else:
                    # Unknown prefix -> treat as free text
                    free_terms.append(clean_token)
            else:
                free_terms.append(token)

        for term in free_terms:
            clean_term = term.strip('"').strip()
            if not clean_term:
                continue
            main_q &= cls.build_free_text_q(clean_term)

        return main_q

    def filter_queryset(self, request, queryset, view):
        search_terms = request.query_params.get(self.search_param, '')
        if not search_terms:
            return queryset

        q = self.parse_query(search_terms)
        return queryset.filter(q)
