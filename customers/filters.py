"""
Tokenized Search Filter for Customers.
Decomposes search queries into namespaced qualifiers (phone:, email:, taluka:, wallet:, etc.)
and free-text terms, compiling them into optimized Django ORM Q-objects.
"""

import re
from rest_framework.filters import BaseFilterBackend
from django.db.models import Q, Exists, OuterRef


class CustomerTokenizedSearchFilter(BaseFilterBackend):
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
      - -<prefix>:<val>       -> negation (~Q)
      - <raw terms>           -> fallback to first_name, last_name, phone, display_id
    """
    search_param = 'search'

    @classmethod
    def parse_query(cls, query_str):
        if not query_str or not query_str.strip():
            return Q()

        # Balance dangling quotation marks to prevent regex stalls
        clean_query = query_str.strip()
        if clean_query.count('"') % 2 != 0:
            clean_query += '"'

        # Token extraction supporting quotes: -?prefix:"quoted string" or word
        token_pattern = re.compile(r'(-?[\w]+:(?:"[^"]*"|[^\s]+)|[^\s]+)')
        tokens = token_pattern.findall(clean_query)

        main_q = Q()
        free_terms = []

        from customers.models import Address

        for token in tokens:
            is_negated = token.startswith('-')
            clean_token = token[1:] if is_negated else token

            if ':' in clean_token:
                parts = clean_token.split(':', 1)
                prefix = parts[0].lower()
                val = parts[1].strip().strip('"')

                if not val:
                    continue

                clause = Q()
                if prefix == 'phone':
                    clause = Q(phone__icontains=val)
                elif prefix == 'email':
                    clause = Q(email__icontains=val)
                elif prefix == 'name':
                    clause = (
                        Q(first_name__icontains=val) |
                        Q(middle_name__icontains=val) |
                        Q(last_name__icontains=val)
                    )
                elif prefix in ('id', 'display_id'):
                    clean_id = val.lstrip('#')
                    if clean_id.isdigit():
                        clause = Q(display_id=int(clean_id))
                    else:
                        clause = Q(id__startswith=val)
                elif prefix == 'taluka':
                    subq = Address.objects.filter(
                        customer=OuterRef('pk'),
                        taluka__icontains=val
                    )
                    clause = Q(Exists(subq))
                elif prefix == 'district':
                    subq = Address.objects.filter(
                        customer=OuterRef('pk'),
                        district__icontains=val
                    )
                    clause = Q(Exists(subq))
                elif prefix == 'village':
                    subq = Address.objects.filter(
                        customer=OuterRef('pk'),
                        region__name__icontains=val
                    )
                    clause = Q(Exists(subq))
                elif prefix == 'wallet':
                    m = re.match(r'^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$', val)
                    if m:
                        op, num_str = m.groups()
                        num = float(num_str)
                        if op == '>':
                            clause = Q(wallet__balance__gt=num)
                        elif op == '>=':
                            clause = Q(wallet__balance__gte=num)
                        elif op == '<':
                            clause = Q(wallet__balance__lt=num)
                        elif op == '<=':
                            clause = Q(wallet__balance__lte=num)
                        else:
                            clause = Q(wallet__balance=num)
                elif prefix == 'debt':
                    m = re.match(r'^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$', val)
                    if m:
                        op, num_str = m.groups()
                        num = float(num_str)
                        if op == '>':
                            clause = Q(legacy_debt__principal_amount__gt=num)
                        elif op == '>=':
                            clause = Q(legacy_debt__principal_amount__gte=num)
                        elif op == '<':
                            clause = Q(legacy_debt__principal_amount__lt=num)
                        elif op == '<=':
                            clause = Q(legacy_debt__principal_amount__lte=num)
                        else:
                            clause = Q(legacy_debt__principal_amount=num)
                elif prefix == 'group':
                    clause = Q(customer_group__name__icontains=val)
                else:
                    # Unknown prefix -> treat as free text
                    free_terms.append(clean_token)
                    continue

                if is_negated:
                    main_q &= ~clause
                else:
                    main_q &= clause
            else:
                free_terms.append(token)

        # Free terms fall back to matching name, phone, or display_id
        for term in free_terms:
            clean_term = term.strip('"')
            if not clean_term:
                continue
                
            term_q = (
                Q(first_name__icontains=clean_term) |
                Q(last_name__icontains=clean_term) |
                Q(phone__icontains=clean_term)
            )
            if clean_term.isdigit():
                term_q |= Q(display_id=int(clean_term))
            elif clean_term.startswith('#') and clean_term[1:].isdigit():
                term_q |= Q(display_id=int(clean_term[1:]))

            main_q &= term_q

        return main_q

    def filter_queryset(self, request, queryset, view):
        search_terms = request.query_params.get(self.search_param, '')
        if not search_terms:
            return queryset

        q = self.parse_query(search_terms)
        return queryset.filter(q)
