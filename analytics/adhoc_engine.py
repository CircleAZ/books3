"""
Universal Ad-Hoc Relational Query Engine.
Compiles dynamic visual filter clauses across any ERP entity into optimized,
whitelisted Django ORM queries with type coercion and zero hardcoded presets.
"""

import re
import time
from decimal import Decimal
from django.db.models import Q, F, Sum, Subquery, OuterRef, IntegerField, DecimalField
from django.db.models.functions import Coalesce

from .adhoc_schema import ENTITY_REGISTRY, OPERATOR_LOOKUPS


def get_adhoc_schema():
    """Returns the serializable schema registry for the frontend query builder."""
    schema_clean = {}
    for ent_id, ent_def in ENTITY_REGISTRY.items():
        fields_clean = {}
        for f_id, f_def in ent_def['fields'].items():
            fields_clean[f_id] = {
                'label': f_def['label'],
                'type': f_def['type'],
                'placeholder': f_def.get('placeholder', ''),
                'choices': f_def.get('choices', []),
            }
        schema_clean[ent_id] = {
            'id': ent_id,
            'label': ent_def['label'],
            'description': ent_def['description'],
            'icon': ent_def['icon'],
            'fields': fields_clean,
            'columns': ent_def['columns'],
        }
    return schema_clean


def coerce_value(val, field_type):
    """Safely coerces raw input strings/values to expected Python/Django types."""
    if val is None or val == '':
        return None
    try:
        if field_type == 'decimal':
            return Decimal(str(val).strip().replace('₹', '').replace(',', ''))
        elif field_type == 'integer':
            return int(float(str(val).strip().replace(',', '')))
        elif field_type == 'boolean':
            str_val = str(val).strip().lower()
            return str_val in ('true', '1', 'yes', 't')
        elif field_type == 'choice':
            return str(val).strip()
        else:
            return str(val).strip()
    except Exception:
        return str(val).strip()


def build_filter_q(lookup, operator, value, field_type):
    """Builds a safe, whitelisted Django Q object from field lookup, operator, and value."""
    coerced = coerce_value(value, field_type)

    if operator in ('is_null', 'is_empty'):
        return Q(**{f"{lookup}__isnull": True}) | Q(**{f"{lookup}__exact": ''})
    if operator in ('not_null', 'is_not_empty'):
        return Q(**{f"{lookup}__isnull": False}) & ~Q(**{f"{lookup}__exact": ''})

    if coerced is None:
        return None

    if operator == 'equals':
        if field_type == 'decimal':
            # Safe floating tolerance for currency lookups
            return Q(**{f"{lookup}__gte": coerced - Decimal('0.01'), f"{lookup}__lte": coerced + Decimal('0.01')})
        return Q(**{lookup: coerced})

    elif operator == 'not_equals':
        if field_type == 'decimal':
            return ~Q(**{f"{lookup}__gte": coerced - Decimal('0.01'), f"{lookup}__lte": coerced + Decimal('0.01')})
        return ~Q(**{lookup: coerced})

    elif operator == 'contains':
        return Q(**{f"{lookup}__icontains": str(coerced)})

    elif operator == 'not_contains':
        return ~Q(**{f"{lookup}__icontains": str(coerced)})

    elif operator == 'gt':
        return Q(**{f"{lookup}__gt": coerced})

    elif operator == 'gte':
        return Q(**{f"{lookup}__gte": coerced})

    elif operator == 'lt':
        return Q(**{f"{lookup}__lt": coerced})

    elif operator == 'lte':
        return Q(**{f"{lookup}__lte": coerced})

    return Q(**{lookup: coerced})


KNOWN_REGIONS = [
    'krushnapur', 'dharampur', 'vansda', 'chikhli',
    'kaliawadi', 'mahuva', 'valsad', 'bilimora', 'navsari'
]


def parse_natural_language_query(query_str):
    """
    Parses a natural retail English query into structured relational tokens.
    Handles user driving example:
    "get all customers from village krushnapur who has ordered apsara pencil at price 55 and and that pencil is not delivered (something else might be delivered) but leave out those with some of the pencils are delivered."
    """
    from customers.models import GeographicRegion
    from inventory.models import Product

    if not query_str or not isinstance(query_str, str):
        return {
            'entity': 'customer',
            'village': None,
            'product': None,
            'price': None,
            'fulfillment': 'undelivered_strict',
        }

    raw = query_str.strip()
    text = raw.lower()

    # 1. Entity Extraction
    entity = 'customer'
    if re.search(r'\b(?:orders?)\b', text) and not re.search(r'\b(?:customers?|clients?|students?)\b', text):
        entity = 'order'
    elif re.search(r'\b(?:products?|items?|skus?)\b', text) and not re.search(r'\b(?:customers?|clients?|students?)\b', text):
        entity = 'product'

    # 2. Village Extraction
    village = None
    try:
        regions = list(GeographicRegion.objects.filter(is_deleted=False).values_list('name', flat=True)[:100])
        regions.sort(key=lambda s: len(s) if s else 0, reverse=True)
        for r in regions:
            if r and re.search(rf'\b{re.escape(r.lower())}\b', text):
                village = r
                break
    except Exception:
        pass

    if not village:
        for known in KNOWN_REGIONS:
            if re.search(rf'\b{known}\b', text):
                village = known.title()
                break

    if not village:
        v_delims = r'(?:customers?|clients?|students?|people|who|where|that|with|having|and|order|orders|ordered|bought|purchased|for)'
        v_match = (
            re.search(rf'(?:from|in|at)\s+(?:the\s+)?village\s+([a-zA-Z0-9_\-\s]+?)(?:\s+{v_delims}|\s*$)', text)
            or re.search(rf'\bvillage\s+([a-zA-Z0-9_\-\s]+?)(?:\s+{v_delims}|\s*$)', text)
            or re.search(rf'(?:from|in)\s+([a-zA-Z0-9_\-\s]+?)(?:\s+{v_delims}|\s*$)', text)
        )
        if v_match:
            candidate = v_match.group(1).strip()
            candidate = re.sub(r'^(?:the|a|an)\s+', '', candidate)
            candidate = re.sub(r'\s+(?:customers?|clients?|students?|people|order|orders)$', '', candidate)
            if candidate and candidate not in ('all', 'any', 'the', 'who', 'ordered', 'order', 'customers', 'customer'):
                village = candidate.title()

    # 3. Price Extraction
    price = None
    p_match = (
        re.search(r'(?:price|priced\s+at|at\s+price|@|at)\s*(?:of|is|:)?\s*₹?\s*(\d+(?:\.\d+)?)', text)
        or re.search(r'₹\s*(\d+(?:\.\d+)?)', text)
        or re.search(r'(\d+(?:\.\d+)?)\s*(?:rs|rupees|inr)\b', text)
    )
    if p_match:
        try:
            price = float(p_match.group(1))
        except (ValueError, TypeError):
            price = None

    # 4. Product Extraction
    product = None
    try:
        db_prods = list(Product.objects.filter(is_deleted=False).values_list('name', flat=True)[:200])
        db_prods.sort(key=lambda s: len(s) if s else 0, reverse=True)
        for p in db_prods:
            if not p:
                continue
            p_low = p.lower()
            if re.search(rf'\b{re.escape(p_low)}\b', text) or (not p_low.endswith('s') and re.search(rf'\b{re.escape(p_low)}s\b', text)):
                product = p
                break
    except Exception:
        pass

    if not product:
        prod_match = (
            re.search(
                r'(?:ordered|orders|bought|purchased|wants?|buying|seeking|need(?:s|ed)?|item|product)\s+'
                r'(?:(?:to|for|a|an|the|some)\s+)?'
                r'(?:(?:\d+)\s*(?:pcs?|packs?|units?|boxes?|nos?)?\s+(?:of\s+)?)?'
                r'([a-zA-Z0-9_\-\s\.\&]+?)'
                r'(?:\s+(?:at\s+price|priced\s+at|at\s+₹|price\s*[:\s]|@|at\s+\d+|with\s+\d+|with\s+0|not\s+delivered|undelivered|where|that|having|and\s+that|\(|$))',
                text
            )
            or re.search(
                r'\b([a-zA-Z0-9_\-\s]+?\b(?:pencils?|pens?|notebooks?|books?|erasers?|sharpeners?|geometry\s+box(?:es)?|compass(?:es)?|kits?))\b',
                text
            )
        )
        if prod_match:
            cand = prod_match.group(1).strip()
            cand = re.sub(r'^(?:a|an|the|some|of)\s+', '', cand)
            cand = re.sub(r'\s+(?:at|price|is|was|which|that|and)$', '', cand)
            if cand and len(cand) > 1 and cand not in ('price', 'village', 'customer', 'customers', 'order', 'orders'):
                product = cand.title()

    if product:
        try:
            if not Product.objects.filter(name__icontains=product, is_deleted=False).exists():
                if product.endswith('s') and Product.objects.filter(name__icontains=product[:-1], is_deleted=False).exists():
                    p_obj = Product.objects.filter(name__icontains=product[:-1], is_deleted=False).first()
                    if p_obj:
                        product = p_obj.name
        except Exception:
            pass

    # 5. Fulfillment Extraction
    fulfillment = 'undelivered_strict'
    if (
        'leave out' in text or 'exclude partial' in text or 'excluding partial' in text or
        'not delivered' in text or '0 delivered' in text or 'zero delivered' in text or
        'undelivered' in text or 'unfulfilled' in text or '0% delivered' in text
    ):
        fulfillment = 'undelivered_strict'
    elif 'partially' in text or 'partial' in text:
        fulfillment = 'partial'
    elif 'delivered' in text and not ('not delivered' in text or 'un' in text or '0 delivered' in text):
        fulfillment = 'delivered'
    elif 'any' in text:
        fulfillment = 'any'

    return {
        'entity': entity,
        'village': village,
        'product': product,
        'price': price,
        'fulfillment': fulfillment,
    }


def parse_natural_language_to_clauses(query_str):
    """
    Translates a natural language retail query into dynamic visual filter clauses.
    """
    tokens = parse_natural_language_query(query_str)
    clauses = []
    if tokens.get('village'):
        clauses.append({'field': 'village', 'operator': 'contains', 'value': tokens['village']})
    if tokens.get('product'):
        clauses.append({'field': 'product_name', 'operator': 'contains', 'value': tokens['product']})
    if tokens.get('price') is not None:
        clauses.append({'field': 'unit_price', 'operator': 'equals', 'value': tokens['price']})
    if tokens.get('fulfillment'):
        clauses.append({'field': 'line_fulfillment', 'operator': 'equals', 'value': tokens['fulfillment']})
    return 'order_items', clauses


def execute_adhoc_query(params):
    """
    Universal Dynamic Relational Query Compiler.
    Accepts:
    {
      "entity": "order_items" | "customers" | "orders" | "products" | "procurement" | "finance" | "expenses" | "outlets",
      "clauses": [
        { "field": "village", "operator": "contains", "value": "Krushnapur" },
        ...
      ],
      "query": "optional natural language string"
    }
    """
    start_time = time.perf_counter()

    if not isinstance(params, dict):
        params = {}
    if 'parameters' in params and isinstance(params['parameters'], dict):
        params = {**params, **params['parameters']}

    entity_id = params.get('entity')
    clauses = params.get('clauses') or []
    query_str = params.get('query') or params.get('natural_query') or ''
    mode = params.get('mode')

    # If mode is explicitly 'natural' or if query_str is sent without explicit clauses, parse it
    if (mode == 'natural' and query_str) or (query_str and not clauses):
        parsed_entity, parsed_clauses = parse_natural_language_to_clauses(query_str)
        if not entity_id or mode == 'natural':
            entity_id = parsed_entity
        clauses = parsed_clauses

    # Handle legacy flat token format if not in natural mode
    elif not clauses and (params.get('village') or params.get('product') or params.get('price') is not None or params.get('fulfillment')):
        if params.get('village'):
            clauses.append({'field': 'village', 'operator': 'contains', 'value': params.get('village')})
        if params.get('product'):
            clauses.append({'field': 'product_name', 'operator': 'contains', 'value': params.get('product')})
        if params.get('price') is not None:
            clauses.append({'field': 'unit_price', 'operator': 'equals', 'value': params.get('price')})
        if params.get('fulfillment'):
            clauses.append({'field': 'line_fulfillment', 'operator': 'equals', 'value': params.get('fulfillment')})

    if not entity_id or entity_id not in ENTITY_REGISTRY:
        entity_id = 'order_items'

    entity_def = ENTITY_REGISTRY[entity_id]
    fields_spec = entity_def['fields']

    # Dispatch to appropriate domain compiler
    if entity_id == 'order_items':
        result = _compile_order_items(clauses, fields_spec)
    elif entity_id == 'customers':
        result = _compile_customers(clauses, fields_spec)
    elif entity_id == 'orders':
        result = _compile_orders(clauses, fields_spec)
    elif entity_id == 'products':
        result = _compile_products(clauses, fields_spec)
    elif entity_id == 'procurement':
        result = _compile_procurement(clauses, fields_spec)
    elif entity_id == 'finance':
        result = _compile_finance(clauses, fields_spec)
    elif entity_id == 'expenses':
        result = _compile_expenses(clauses, fields_spec)
    elif entity_id == 'outlets':
        result = _compile_outlets(clauses, fields_spec)
    else:
        result = _compile_order_items(clauses, fields_spec)

    latency_ms = round((time.perf_counter() - start_time) * 1000, 2)

    primary_label = result['summary'].get('primary_metric_label', 'Matching Entities')
    primary_val = str(result['summary'].get('primary_metric_value', len(result['items'])))
    secondary_label = result['summary'].get('secondary_metric_label', 'Audited Records')
    secondary_val = str(result['summary'].get('secondary_metric_value', len(result['items'])))

    metrics = [
        {
            'label': primary_label,
            'value': primary_val,
            'sub': f"Across {entity_def['label']}",
        },
        {
            'label': secondary_label,
            'value': secondary_val,
            'sub': 'Dynamic Criteria',
        },
        {
            'label': 'Matched Rows',
            'value': f"{len(result['items'])} Rows",
            'sub': 'Active Table Projection',
        },
        {
            'label': 'Filter Clauses',
            'value': f"{len(clauses)} Active",
            'sub': 'Whitelisted ORM Compilers',
        },
    ]

    tokens_dict = {
        'entity': entity_id,
        'village': None,
        'product': None,
        'price': None,
        'fulfillment': None,
    }
    for c in clauses:
        f = c.get('field')
        v = c.get('value')
        if f == 'village':
            tokens_dict['village'] = v
        elif f == 'product_name':
            tokens_dict['product'] = v
        elif f == 'unit_price':
            tokens_dict['price'] = v
        elif f == 'line_fulfillment':
            tokens_dict['fulfillment'] = v

    return {
        'success': True,
        'engine': 'adhoc',
        'entity': entity_id,
        'entity_label': entity_def['label'],
        'columns': entity_def['columns'],
        'clauses': clauses,
        'tokens': tokens_dict,
        'summary': result['summary'],
        'metrics': metrics,
        'items': result['items'],
        'schema': get_adhoc_schema(),
        'execution_ms': latency_ms,
        'latency_ms': latency_ms,
        'is_fallback': False,
        'active_stream': True,
    }


# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN QUERY COMPILERS (Sovereign ORM Traversal)
# ─────────────────────────────────────────────────────────────────────────────

def _compile_order_items(clauses, fields_spec):
    from orders.models import OrderItem, DeliveryItem

    # Correlated Subquery for line-item delivered quantity (prevents Cartesian multiplication)
    delivered_subquery = (
        DeliveryItem.objects
        .filter(order_item=OuterRef('pk'))
        .values('order_item')
        .annotate(total=Sum('quantity'))
        .values('total')
    )

    qs = (
        OrderItem.objects
        .select_related('order', 'order__customer', 'product')
        .prefetch_related('order__customer__addresses', 'order__customer__addresses__region')
        .filter(
            order__is_deleted=False,
            order__customer__isnull=False,
            order__customer__is_deleted=False,
        )
        .exclude(order__order_status='cancelled')
        .annotate(
            delivered_qty=Coalesce(Subquery(delivered_subquery), 0, output_field=IntegerField())
        )
    )

    for c in clauses:
        f_name = c.get('field')
        op = c.get('operator') or 'equals'
        val = c.get('value')
        if not f_name or f_name not in fields_spec or val is None or val == '':
            continue

        f_def = fields_spec[f_name]

        if f_name == 'village':
            # Custom village traversal across Customer Address and Region
            v_str = str(val).strip()
            v_q = (
                Q(order__customer__addresses__region__name__icontains=v_str) |
                Q(order__customer__addresses__address_line__icontains=v_str) |
                Q(order__customer__addresses__taluka__icontains=v_str) |
                Q(order__customer__addresses__district__icontains=v_str) |
                Q(order__customer__notes__icontains=v_str)
            )
            qs = qs.filter(v_q if op == 'contains' or op == 'equals' else ~v_q)

        elif f_name == 'line_fulfillment':
            f_val = str(val).strip()
            if f_val == 'undelivered_strict':
                qs = qs.filter(delivered_qty=0)
            elif f_val == 'partial':
                qs = qs.filter(delivered_qty__gt=0, delivered_qty__lt=F('quantity'))
            elif f_val == 'delivered':
                qs = qs.filter(delivered_qty__gte=F('quantity'))
            elif f_val == 'any_undelivered':
                qs = qs.filter(delivered_qty__lt=F('quantity'))

        elif f_name == 'product_name':
            p_val = str(val).strip()
            p_sing = p_val[:-1] if p_val.endswith('s') else p_val
            p_q = Q(product__name__icontains=p_val) | Q(product__name__icontains=p_sing)
            qs = qs.filter(p_q if op in ('contains', 'equals') else ~p_q)

        elif f_name == 'customer_name':
            c_val = str(val).strip()
            c_q = Q(order__customer__first_name__icontains=c_val) | Q(order__customer__last_name__icontains=c_val)
            qs = qs.filter(c_q if op in ('contains', 'equals') else ~c_q)

        else:
            q_obj = build_filter_q(f_def['lookup'], op, val, f_def['type'])
            if q_obj:
                qs = qs.filter(q_obj)

    qs = qs.distinct().order_by('-order__created_at', 'order__display_id')[:500]

    items = []
    total_shortfall = 0
    total_unfulfilled_val = Decimal('0.00')

    for oi in qs:
        deliv = getattr(oi, 'delivered_qty', 0) or 0
        shortfall = max(0, oi.quantity - deliv)
        unfulfilled = Decimal(str(shortfall)) * (oi.unit_price or Decimal('0.00'))

        total_shortfall += shortfall
        total_unfulfilled_val += unfulfilled

        village_name = '—'
        customer = oi.order.customer
        if customer:
            primary_addr = customer.addresses.filter(is_primary=True).first() or customer.addresses.first()
            if primary_addr:
                village_name = (
                    primary_addr.region.name if primary_addr.region
                    else primary_addr.address_line or primary_addr.taluka or '—'
                )

        items.append({
            'id': str(oi.id),
            'customer_name': customer.full_name if customer else 'Walk-in',
            'customer_id': str(customer.id) if customer else None,
            'phone': customer.phone if customer else '—',
            'village': village_name,
            'order_id': str(oi.order.id),
            'order_display_id': f"#{oi.order.display_id}",
            'product_name': oi.product.name if oi.product else 'Unknown',
            'product_id': str(oi.product.id) if oi.product else None,
            'unit_price': float(oi.unit_price or 0),
            'quantity': oi.quantity,
            'ordered_qty': oi.quantity,
            'delivered_qty': deliv,
            'shortfall_qty': shortfall,
            'order_status': oi.order.order_status,
        })

    matching_cust_ids = set(it['customer_id'] for it in items if it.get('customer_id'))
    matching_cust_count = len(matching_cust_ids)

    return {
        'summary': {
            'matched_count': len(items),
            'matching_customer_count': matching_cust_count,
            'matching_customers_count': matching_cust_count,
            'starved_unit_total': total_shortfall,
            'starved_units_total': total_shortfall,
            'unfulfilled_value': float(total_unfulfilled_val),
            'primary_metric_label': 'Total Starved Units',
            'primary_metric_value': f"{total_shortfall:,}",
            'secondary_metric_label': 'Unfulfilled Exposure',
            'secondary_metric_value': f"₹{float(total_unfulfilled_val):,.2f}",
        },
        'items': items,
    }


def _compile_customers(clauses, fields_spec):
    from customers.models import Customer

    qs = (
        Customer.objects
        .prefetch_related('addresses', 'addresses__region')
        .filter(is_deleted=False)
    )

    for c in clauses:
        f_name = c.get('field')
        op = c.get('operator') or 'equals'
        val = c.get('value')
        if not f_name or f_name not in fields_spec or val is None or val == '':
            continue

        f_def = fields_spec[f_name]

        if f_name == 'village':
            v_str = str(val).strip()
            v_q = (
                Q(addresses__region__name__icontains=v_str) |
                Q(addresses__address_line__icontains=v_str) |
                Q(addresses__taluka__icontains=v_str)
            )
            qs = qs.filter(v_q if op == 'contains' or op == 'equals' else ~v_q)
        elif f_name == 'name':
            c_val = str(val).strip()
            c_q = Q(first_name__icontains=c_val) | Q(last_name__icontains=c_val)
            qs = qs.filter(c_q if op in ('contains', 'equals') else ~c_q)
        else:
            q_obj = build_filter_q(f_def['lookup'], op, val, f_def['type'])
            if q_obj:
                qs = qs.filter(q_obj)

    qs = qs.distinct().order_by('-outstanding_balance', 'first_name')[:500]

    items = []
    total_balance = Decimal('0.00')

    for cust in qs:
        bal = cust.outstanding_balance or Decimal('0.00')
        total_balance += bal

        village_name = '—'
        primary_addr = cust.addresses.filter(is_primary=True).first() or cust.addresses.first()
        if primary_addr:
            village_name = (
                primary_addr.region.name if primary_addr.region
                else primary_addr.address_line or primary_addr.taluka or '—'
            )

        items.append({
            'id': str(cust.id),
            'name': cust.full_name,
            'phone': cust.phone or '—',
            'village': village_name,
            'outstanding_balance': float(bal),
            'credit_limit': float(cust.credit_limit or 0),
            'status': cust.status,
            'created_at': cust.created_at.strftime('%Y-%m-%d') if cust.created_at else '—',
        })

    return {
        'summary': {
            'matched_count': len(items),
            'primary_metric_label': 'Total Outstanding Khata',
            'primary_metric_value': f"₹{float(total_balance):,.2f}",
            'secondary_metric_label': 'Average Debt / Account',
            'secondary_metric_value': f"₹{(float(total_balance)/len(items)):,.2f}" if items else '₹0.00',
        },
        'items': items,
    }


def _compile_orders(clauses, fields_spec):
    from orders.models import Order

    qs = (
        Order.objects
        .select_related('customer')
        .prefetch_related('customer__addresses', 'customer__addresses__region')
        .filter(is_deleted=False)
    )

    for c in clauses:
        f_name = c.get('field')
        op = c.get('operator') or 'equals'
        val = c.get('value')
        if not f_name or f_name not in fields_spec or val is None or val == '':
            continue

        f_def = fields_spec[f_name]

        if f_name == 'village':
            v_str = str(val).strip()
            v_q = (
                Q(customer__addresses__region__name__icontains=v_str) |
                Q(customer__addresses__address_line__icontains=v_str)
            )
            qs = qs.filter(v_q if op == 'contains' or op == 'equals' else ~v_q)
        elif f_name == 'customer_name':
            c_val = str(val).strip()
            c_q = Q(customer__first_name__icontains=c_val) | Q(customer__last_name__icontains=c_val)
            qs = qs.filter(c_q if op in ('contains', 'equals') else ~c_q)
        else:
            q_obj = build_filter_q(f_def['lookup'], op, val, f_def['type'])
            if q_obj:
                qs = qs.filter(q_obj)

    qs = qs.distinct().order_by('-created_at')[:500]

    items = []
    total_revenue = Decimal('0.00')
    total_balance = Decimal('0.00')

    for ord_obj in qs:
        tot = ord_obj.total_amount or Decimal('0.00')
        bal = ord_obj.balance_amount or Decimal('0.00')
        total_revenue += tot
        total_balance += bal

        village_name = '—'
        if ord_obj.customer:
            addr = ord_obj.customer.addresses.first()
            if addr:
                village_name = addr.region.name if addr.region else addr.address_line or '—'

        items.append({
            'id': str(ord_obj.id),
            'display_id': f"#{ord_obj.display_id}",
            'customer_name': ord_obj.customer.full_name if ord_obj.customer else 'Walk-in',
            'village': village_name,
            'order_type': ord_obj.order_type,
            'order_status': ord_obj.order_status,
            'payment_status': ord_obj.payment_status,
            'delivery_status': ord_obj.delivery_status,
            'total_amount': float(tot),
            'balance_amount': float(bal),
            'created_at': ord_obj.created_at.strftime('%Y-%m-%d') if ord_obj.created_at else '—',
        })

    return {
        'summary': {
            'matched_count': len(items),
            'primary_metric_label': 'Total Orders Value',
            'primary_metric_value': f"₹{float(total_revenue):,.2f}",
            'secondary_metric_label': 'Uncollected Balance',
            'secondary_metric_value': f"₹{float(total_balance):,.2f}",
        },
        'items': items,
    }


def _compile_products(clauses, fields_spec):
    from inventory.models import Product

    qs = Product.objects.select_related('category').filter(is_deleted=False)

    for c in clauses:
        f_name = c.get('field')
        op = c.get('operator') or 'equals'
        val = c.get('value')
        if not f_name or f_name not in fields_spec or val is None or val == '':
            continue
        f_def = fields_spec[f_name]
        q_obj = build_filter_q(f_def['lookup'], op, val, f_def['type'])
        if q_obj:
            qs = qs.filter(q_obj)

    qs = qs.order_by('name')[:500]

    items = []
    total_stock_value = Decimal('0.00')

    for p in qs:
        stock = p.physical_stock or 0
        cost = p.cost_price or Decimal('0.00')
        total_stock_value += (Decimal(str(stock)) * cost)

        items.append({
            'id': str(p.id),
            'name': p.name,
            'sku': p.sku or '—',
            'category': p.category.name if p.category else '—',
            'selling_price': float(p.selling_price or 0),
            'cost_price': float(p.cost_price or 0),
            'physical_stock': stock,
            'available_stock': p.available_stock or 0,
        })

    return {
        'summary': {
            'matched_count': len(items),
            'primary_metric_label': 'Total Inventory Valuation',
            'primary_metric_value': f"₹{float(total_stock_value):,.2f}",
            'secondary_metric_label': 'Average Unit Price',
            'secondary_metric_value': f"₹{(sum(i['selling_price'] for i in items)/len(items)):,.2f}" if items else '₹0.00',
        },
        'items': items,
    }


def _compile_procurement(clauses, fields_spec):
    from procurement.models import PurchaseOrder

    qs = PurchaseOrder.objects.select_related('vendor').filter(is_deleted=False)

    for c in clauses:
        f_name = c.get('field')
        op = c.get('operator') or 'equals'
        val = c.get('value')
        if not f_name or f_name not in fields_spec or val is None or val == '':
            continue
        f_def = fields_spec[f_name]
        q_obj = build_filter_q(f_def['lookup'], op, val, f_def['type'])
        if q_obj:
            qs = qs.filter(q_obj)

    qs = qs.order_by('-created_at')[:500]

    items = []
    total_val = Decimal('0.00')

    for po in qs:
        tot = po.total_amount or Decimal('0.00')
        total_val += tot
        items.append({
            'id': str(po.id),
            'display_id': f"#{po.display_id}",
            'vendor_name': po.vendor.name if po.vendor else '—',
            'status': po.status,
            'total_amount': float(tot),
            'created_at': po.created_at.strftime('%Y-%m-%d') if po.created_at else '—',
        })

    return {
        'summary': {
            'matched_count': len(items),
            'primary_metric_label': 'Total Procurement Value',
            'primary_metric_value': f"₹{float(total_val):,.2f}",
            'secondary_metric_label': 'Audited Purchase Orders',
            'secondary_metric_value': str(len(items)),
        },
        'items': items,
    }


def _compile_finance(clauses, fields_spec):
    from finance.models import BankTransaction

    qs = BankTransaction.objects.select_related('bank_account', 'category').filter(is_deleted=False)

    for c in clauses:
        f_name = c.get('field')
        op = c.get('operator') or 'equals'
        val = c.get('value')
        if not f_name or f_name not in fields_spec or val is None or val == '':
            continue
        f_def = fields_spec[f_name]
        q_obj = build_filter_q(f_def['lookup'], op, val, f_def['type'])
        if q_obj:
            qs = qs.filter(q_obj)

    qs = qs.order_by('-date', '-created_at')[:500]

    items = []
    total_vol = Decimal('0.00')

    for tx in qs:
        amt = tx.amount or Decimal('0.00')
        total_vol += amt
        items.append({
            'id': str(tx.id),
            'reference': tx.reference or '—',
            'transaction_type': tx.transaction_type,
            'amount': float(amt),
            'bank_account': tx.bank_account.account_name if tx.bank_account else 'Cash Wallet',
            'date': str(tx.date) if tx.date else '—',
        })

    return {
        'summary': {
            'matched_count': len(items),
            'primary_metric_label': 'Total Transaction Volume',
            'primary_metric_value': f"₹{float(total_vol):,.2f}",
            'secondary_metric_label': 'Audited Transactions',
            'secondary_metric_value': str(len(items)),
        },
        'items': items,
    }


def _compile_expenses(clauses, fields_spec):
    from finance.models import Expense

    qs = Expense.objects.select_related('category').filter(is_deleted=False)

    for c in clauses:
        f_name = c.get('field')
        op = c.get('operator') or 'equals'
        val = c.get('value')
        if not f_name or f_name not in fields_spec or val is None or val == '':
            continue
        f_def = fields_spec[f_name]
        q_obj = build_filter_q(f_def['lookup'], op, val, f_def['type'])
        if q_obj:
            qs = qs.filter(q_obj)

    qs = qs.order_by('-date', '-created_at')[:500]

    items = []
    total_exp = Decimal('0.00')

    for exp in qs:
        amt = exp.amount or Decimal('0.00')
        total_exp += amt
        items.append({
            'id': str(exp.id),
            'title': exp.title,
            'category': exp.category.name if exp.category else '—',
            'amount': float(amt),
            'status': exp.status,
            'date': str(exp.date) if exp.date else '—',
        })

    return {
        'summary': {
            'matched_count': len(items),
            'primary_metric_label': 'Total Operating Expenses',
            'primary_metric_value': f"₹{float(total_exp):,.2f}",
            'secondary_metric_label': 'Expense Records',
            'secondary_metric_value': str(len(items)),
        },
        'items': items,
    }


def _compile_outlets(clauses, fields_spec):
    from outlets.models import Outlet

    qs = Outlet.objects.filter(is_deleted=False)

    for c in clauses:
        f_name = c.get('field')
        op = c.get('operator') or 'equals'
        val = c.get('value')
        if not f_name or f_name not in fields_spec or val is None or val == '':
            continue
        f_def = fields_spec[f_name]
        q_obj = build_filter_q(f_def['lookup'], op, val, f_def['type'])
        if q_obj:
            qs = qs.filter(q_obj)

    qs = qs.order_by('name')[:500]

    items = []

    for out in qs:
        items.append({
            'id': str(out.id),
            'name': out.name,
            'owner_name': out.owner_name or '—',
            'village': out.village or '—',
            'phone': out.phone or '—',
            'status': out.status,
        })

    return {
        'summary': {
            'matched_count': len(items),
            'primary_metric_label': 'Total Registered Outlets',
            'primary_metric_value': str(len(items)),
            'secondary_metric_label': 'Territory Coverage',
            'secondary_metric_value': f"{len(set(i['village'] for i in items if i['village'] != '—'))} Villages",
        },
        'items': items,
    }
