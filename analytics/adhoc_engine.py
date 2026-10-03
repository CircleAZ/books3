"""
Ad-Hoc Relational Discovery & Query Workbench Engine.
Supports natural language retail queries and structured relational tokens
across multi-hop joins: Customer -> Address -> Order -> OrderItem -> DeliveryItem.
Performs strict decoupled line-item delivery reconciliation.
"""

import re
import time
from decimal import Decimal
from django.db.models import F, Q, Sum, IntegerField, Subquery, OuterRef
from django.db.models.functions import Coalesce
from orders.models import OrderItem, DeliveryItem
from inventory.models import Product
from customers.models import GeographicRegion


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
    # Check GeographicRegion database first (sorted by length descending for multi-word precision)
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
        # Check known regional list
        for known in KNOWN_REGIONS:
            if re.search(rf'\b{known}\b', text):
                village = known.title()
                break

    if not village:
        # Regex patterns for village (multi-word aware)
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
    # Match against known products in database dynamically (handling plurals & digits like 'Std 10 Math Kit')
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
        # Regex pattern: captures product phrases following order verbs, allowing digits/quantities
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
            # Clean common filler prefixes/suffixes
            cand = re.sub(r'^(?:a|an|the|some|of)\s+', '', cand)
            cand = re.sub(r'\s+(?:at|price|is|was|which|that|and)$', '', cand)
            if cand and len(cand) > 1 and cand not in ('price', 'village', 'customer', 'customers', 'order', 'orders'):
                product = cand.title()

    # Normalize plural form against DB if needed
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


def execute_adhoc_query(params):
    """
    Executes an ad-hoc relational query across multi-hop models:
    Customer -> Address -> Order -> OrderItem -> DeliveryItem.
    Accepts natural query text and/or structured relational tokens.
    """
    start_time = time.perf_counter()

    if not isinstance(params, dict):
        params = {}
    if 'parameters' in params and isinstance(params['parameters'], dict):
        nested = params['parameters']
        params = {**params, **nested}

    mode = params.get('mode')  # 'natural' | 'tokens'
    query_str = params.get('query') or params.get('natural_query') or ''

    # Parse natural text if provided
    parsed_tokens = parse_natural_language_query(query_str) if query_str else {}

    # Mode-aware parameter resolution
    if mode == 'natural':
        entity = parsed_tokens.get('entity') or 'customer'
        village = parsed_tokens.get('village')
        product = parsed_tokens.get('product')
        price = parsed_tokens.get('price')
        fulfillment = parsed_tokens.get('fulfillment') or 'undelivered_strict'
    elif mode == 'tokens':
        entity = params.get('entity') or 'customer'
        village = params.get('village')
        product = params.get('product') or params.get('product_name')
        price = params.get('price')
        fulfillment = params.get('fulfillment') or 'undelivered_strict'
    else:
        # Default auto-detect: if query_str is provided and no specific tokens given, use parsed tokens
        if query_str and not any(k in params for k in ('village', 'product', 'product_name', 'price')):
            entity = parsed_tokens.get('entity') or 'customer'
            village = parsed_tokens.get('village')
            product = parsed_tokens.get('product')
            price = parsed_tokens.get('price')
            fulfillment = parsed_tokens.get('fulfillment') or 'undelivered_strict'
        else:
            entity = params.get('entity') or parsed_tokens.get('entity') or 'customer'
            village = params.get('village') or parsed_tokens.get('village')
            product = params.get('product') or params.get('product_name') or parsed_tokens.get('product')
            price = params.get('price') if params.get('price') is not None else parsed_tokens.get('price')
            fulfillment = params.get('fulfillment') or parsed_tokens.get('fulfillment') or 'undelivered_strict'

    # Normalize values
    if village:
        village = str(village).strip()
    if product:
        product = str(product).strip()
    if price is not None:
        try:
            price = float(price)
        except (ValueError, TypeError):
            price = None

    # Base QuerySet: OrderItem joining Order and Customer
    qs = (
        OrderItem.objects
        .select_related('order', 'order__customer', 'product')
        .prefetch_related('order__customer__addresses', 'order__customer__addresses__region', 'delivery_items')
        .filter(
            order__is_deleted=False,
            order__customer__isnull=False,
            order__customer__is_deleted=False,
        )
        .exclude(order__order_status='cancelled')
    )

    # 1. Product Filter (handles singular and plural matches)
    if product:
        prod_singular = product[:-1] if product.endswith('s') else product
        qs = qs.filter(
            Q(product__name__icontains=product) |
            Q(product__name__icontains=prod_singular)
        )

    # 2. Price Filter (matches within 0.01 margin of unit_price)
    if price is not None:
        dec_price = Decimal(str(price))
        qs = qs.filter(
            unit_price__gte=dec_price - Decimal('0.01'),
            unit_price__lte=dec_price + Decimal('0.01')
        )

    # 3. Village Filter across Address (region, address_line, taluka, district) and Customer notes
    if village:
        qs = qs.filter(
            Q(order__customer__addresses__region__name__icontains=village) |
            Q(order__customer__addresses__address_line__icontains=village) |
            Q(order__customer__addresses__taluka__icontains=village) |
            Q(order__customer__addresses__district__icontains=village) |
            Q(order__customer__notes__icontains=village)
        ).distinct()

    # 4. Strict Line-Item Delivery Reconciliation via Subquery (prevents Cartesian product multiplication)
    from orders.models import DeliveryItem
    delivered_subquery = (
        DeliveryItem.objects
        .filter(order_item=OuterRef('pk'))
        .values('order_item')
        .annotate(total=Sum('quantity'))
        .values('total')
    )

    qs = qs.annotate(
        delivered_qty=Coalesce(Subquery(delivered_subquery), 0, output_field=IntegerField())
    ).distinct()

    if fulfillment == 'undelivered_strict':
        # Zero pencils delivered, strictly excluding partial pencil deliveries where delivered_qty > 0
        qs = qs.filter(delivered_qty=0)
    elif fulfillment == 'partial':
        qs = qs.filter(delivered_qty__gt=0, delivered_qty__lt=F('quantity'))
    elif fulfillment == 'delivered':
        qs = qs.filter(delivered_qty__gte=F('quantity'))
    elif fulfillment == 'any_undelivered':
        qs = qs.filter(delivered_qty__lt=F('quantity'))

    qs = qs.order_by('-order__created_at', 'order__display_id')

    # Build response rows
    items = []
    seen_order_item_ids = set()

    for oi in qs:
        if oi.id in seen_order_item_ids:
            continue
        seen_order_item_ids.add(oi.id)

        customer = oi.order.customer
        if not customer:
            continue

        # Extract primary address or matching address
        addr = None
        addresses = list(customer.addresses.all())
        if village:
            for a in addresses:
                v_cand = (a.region.name if a.region else '') or a.address_line or a.taluka or ''
                if village.lower() in v_cand.lower():
                    addr = a
                    break
        if not addr:
            addr = next((a for a in addresses if a.is_primary), None) or (addresses[0] if addresses else None)

        village_label = (
            (addr.region.name if addr and addr.region else None) or
            (addr.taluka if addr and addr.taluka else None) or
            (addr.address_line if addr and addr.address_line else None) or
            village or
            'Local'
        )

        ordered_qty = oi.quantity
        deliv_qty = oi.delivered_qty or 0
        shortfall = max(0, ordered_qty - deliv_qty)
        unit_price_float = float(oi.unit_price)

        fulfillment_desc = (
            '0% Delivered (Undelivered)' if deliv_qty == 0
            else f"Partially Delivered ({deliv_qty}/{ordered_qty})" if deliv_qty < ordered_qty
            else 'Fully Delivered (100%)'
        )

        items.append({
            'id': str(oi.id),
            'customer_id': customer.id,
            'customer_name': customer.full_name,
            'phone': customer.phone,
            'village': village_label,
            'order_id': str(oi.order.id),
            'order_display_id': str(oi.order.display_id),
            'product_id': str(oi.product.id),
            'product_name': oi.product.name,
            'unit_price': unit_price_float,
            'ordered_qty': ordered_qty,
            'delivered_qty': deliv_qty,
            'shortfall_qty': shortfall,
            'order_status': oi.order.order_status,
            'delivery_status': oi.order.delivery_status,
            'fulfillment_desc': fulfillment_desc,
            # Data Studio Cockpit Row Contract
            'entity': f"{customer.full_name} (#{oi.order.display_id})",
            'category': village_label,
            'baseline': f"{ordered_qty} Ordered (₹{ordered_qty * unit_price_float:,.2f})",
            'target': f"{deliv_qty} Delivered ({shortfall} Starved)",
            'variance': f"-{shortfall} Shortfall" if shortfall > 0 else '0 (Fulfilled)',
            'lever': 'Delivery Run-Sheet (Stream 2)',
            'quant_details': {
                'product_id': str(oi.product.id),
                'product_name': oi.product.name,
                'customer_name': customer.full_name,
                'customer_phone': customer.phone,
                'village': village_label,
                'cost_price': float(oi.product.cost_price or oi.unit_price),
                'unit_price': unit_price_float,
                'case_pack': oi.product.pack_size or 10,
                'shortfall_qty': shortfall,
                'ordered_qty': ordered_qty,
                'delivered_qty': deliv_qty,
            }
        })

    # Summary aggregations
    matching_cust_ids = set(it['customer_id'] for it in items)
    matching_customers_count = len(matching_cust_ids)
    starved_units_total = sum(it['shortfall_qty'] for it in items)
    unfulfilled_value = sum(it['shortfall_qty'] * it['unit_price'] for it in items)

    # Human-readable interpretation text
    interpretation_parts = [
        f"Targeting: {entity.title()}s",
    ]
    if village:
        interpretation_parts.append(f"Village: '{village}'")
    if product:
        interpretation_parts.append(f"Product: '{product}'")
    if price is not None:
        interpretation_parts.append(f"Price: ₹{price:,.2f}")
    if fulfillment == 'undelivered_strict':
        interpretation_parts.append("Strict Line Fulfillment: 0% Delivered (Strictly Exclude Partial)")
    elif fulfillment == 'partial':
        interpretation_parts.append("Line Fulfillment: Partial Deliveries Only")
    elif fulfillment == 'delivered':
        interpretation_parts.append("Line Fulfillment: 100% Delivered")

    query_interpretation = " | ".join(interpretation_parts)

    fulfillment_label = (
        '0% Delivered (Strict)' if fulfillment == 'undelivered_strict'
        else 'Partial' if fulfillment == 'partial'
        else 'Delivered'
    )

    metrics = [
        {
            'label': 'Target Customers',
            'value': str(matching_customers_count),
            'sub': f"Village: {village or 'All Locations'}"
        },
        {
            'label': 'Starved Units',
            'value': f"{starved_units_total} Units",
            'sub': f"{product or 'Target Item'} Shortfall"
        },
        {
            'label': 'Unfulfilled Value',
            'value': f"₹{unfulfilled_value:,.2f}",
            'sub': 'Starved Revenue Exposure'
        },
        {
            'label': 'Line Fulfillment',
            'value': fulfillment_label,
            'sub': 'Decoupled Line Reconciliation'
        }
    ]

    exec_ms = round((time.perf_counter() - start_time) * 1000, 2)

    return {
        'engine': 'adhoc',
        'query_interpretation': query_interpretation,
        'tokens': {
            'entity': entity,
            'village': village,
            'product': product,
            'price': price,
            'fulfillment': fulfillment,
        },
        'summary': {
            'matching_customer_count': matching_customers_count,
            'matching_customers_count': matching_customers_count,
            'starved_unit_total': starved_units_total,
            'starved_units_total': starved_units_total,
            'unfulfilled_value': unfulfilled_value,
            'query_interpretation': query_interpretation,
        },
        'metrics': metrics,
        'items': items,
        'execution_ms': exec_ms,
        'is_fallback': False,
    }
