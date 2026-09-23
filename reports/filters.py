"""
Tokenized Search Filter for Activity Audit Logs.
Decomposes search queries into namespaced qualifiers (user:, action:, model:, id:, date:, ip:)
and free-text terms compiled directly into Django ORM Q-objects.
"""

from django.db.models import Q
from core.filters import BaseTokenizedSearchFilter


class ActivityLogTokenizedSearchFilter(BaseTokenizedSearchFilter):
    """
    Intelligent tokenized search filter for ActivityLog supporting:
      - user:<str>        -> username or full name match
      - action:<str>      -> action_type match (login, logout, create, update, delete, view, export, order, return, refund)
      - model:<str>       -> entity_type match (order, customer, product, expense, etc.)
      - entity:<str>      -> entity_type match
      - id:<str>          -> entity_id or audit log sequence ID match
      - date:<date_expr>  -> created_at date match (today, yesterday, this_week, this_month, >YYYY-MM-DD)
      - ip:<str>          -> IP address icontains match
      - -<prefix>:<val>   -> inverted negation (~Q)
      - <free text>       -> description, details, entity_type, entity_id, username
    """
    DISPLAY_ID_FIELD = None
    FREE_TEXT_FIELDS = ['description', 'details', 'entity_type', 'entity_id', 'user__username']

    PREFIX_MAP = {
        'user': 'handle_user',
        'action': 'action_type__iexact',
        'model': 'handle_model',
        'entity': 'handle_model',
        'id': 'handle_id',
        'date': ('date', 'created_at__date'),
        'ip': 'ip_address__icontains',
    }

    @classmethod
    def handle_user(cls, val):
        return (
            Q(user__username__icontains=val) |
            Q(user__first_name__icontains=val) |
            Q(user__last_name__icontains=val)
        )

    @classmethod
    def handle_model(cls, val):
        clean = val.strip().rstrip('s') if val.strip().lower().endswith('s') and len(val.strip()) > 3 else val.strip()
        return Q(entity_type__iexact=val.strip()) | Q(entity_type__icontains=clean)

    @classmethod
    def handle_id(cls, val):
        clean_val = val.strip().lstrip('#')
        if not clean_val:
            return Q(pk__isnull=True)
        id_q = Q(entity_id__icontains=clean_val)
        if clean_val.isdigit():
            id_q |= Q(id=int(clean_val))
        return id_q

    @classmethod
    def build_free_text_q(cls, term):
        q = super().build_free_text_q(term)
        clean = term.strip().lstrip('#')
        if clean.isdigit():
            q |= Q(id=int(clean)) | Q(entity_id__icontains=clean)
        elif clean:
            q |= Q(entity_id__icontains=clean)
        return q
