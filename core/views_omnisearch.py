"""
Dedicated Unified OmniSearch Engine for Books3.
Phase 4: High-performance Global OmniSearch (Ctrl+K) Endpoint.
Replaces client-side multi-endpoint polling with a single, prioritized,
sub-80ms query execution pipeline returning raw projected dictionaries.
"""

import logging
import operator
import re
from decimal import Decimal
from functools import reduce
from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from orders.models import Order
from customers.models import Customer
from inventory.models import Product
from procurement.models import PurchaseOrder
from finance.models import BankTransaction

logger = logging.getLogger(__name__)


class OmniSearchThrottle(UserRateThrottle):
    """Rate limit: 120 searches per minute per user."""
    rate = '120/min'


class OmniSearchView(APIView):
    """
    Unified OmniSearch API View.
    GET /api/core/omnisearch/?q=<term>
    Returns:
    {
        "orders": [ { id, title, subtitle, badge, badgeColor, url, category }, ... ],
        "customers": [ ... ],
        "products": [ ... ],
        "purchase_orders": [ ... ],
        "finance": [ ... ]
    }
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [OmniSearchThrottle]

    def get(self, request):
        raw_q = request.query_params.get('q', '')
        if not raw_q:
            return Response(self._empty_payload(), status=status.HTTP_200_OK)

        # 1. Sanitization: clamp to 40 characters and strip SQL wildcards
        sanitized_q = raw_q.strip()[:40].replace('%', '').replace('_', '')
        if not sanitized_q:
            return Response(self._empty_payload(), status=status.HTTP_200_OK)

        # 2. Heuristic extraction of display ID / clean ID prefix
        clean_id = re.sub(
            r'^(?:po|ord|ret|exp|txn|prd|prod|cust)[#\-_]?',
            '',
            sanitized_q.lstrip('#').strip(),
            flags=re.IGNORECASE
        ).lstrip('#').strip()

        # Strict ASCII digit checks to prevent Unicode digit ValueError (e.g. superscript 1 '\u00b9')
        is_numeric = bool(re.fullmatch(r'\d+', clean_id))
        is_hash_numeric = bool(re.fullmatch(r'#\d+', sanitized_q))
        is_pure_digit = bool(re.fullmatch(r'\d+', sanitized_q))

        # 3. Short-circuit: if length < 2 and NOT a numeric display ID, return empty dict immediately
        if len(sanitized_q) < 2 and not (is_numeric or is_hash_numeric or is_pure_digit):
            return Response(self._empty_payload(), status=status.HTTP_200_OK)

        # 4. Domain scope isolation (if user explicitly typed domain prefix like ORD-101 or #ORD-101 or PO-5)
        # CRITICAL FIX: strip leading '#' and whitespace before checking prefix to cleanly support '#ORD-101'
        clean_lower = sanitized_q.lstrip('#').strip().lower()
        search_domains = {'orders', 'customers', 'products', 'purchase_orders', 'finance'}
        if clean_lower.startswith('ord'):
            search_domains = {'orders'}
        elif clean_lower.startswith('po'):
            search_domains = {'purchase_orders'}
        elif clean_lower.startswith(('prd', 'prod')):
            search_domains = {'products'}
        elif clean_lower.startswith('cust'):
            search_domains = {'customers'}
        elif clean_lower.startswith(('txn', 'ref')):
            search_domains = {'finance'}

        results = self._empty_payload()

        # 5. Priority Heuristic Execution
        num = None
        if is_numeric or is_hash_numeric or is_pure_digit:
            try:
                num = int(clean_id) if is_numeric else (int(sanitized_q.lstrip('#')) if is_hash_numeric else int(sanitized_q))
            except (ValueError, OverflowError):
                num = None

        if num is not None:
            self._search_numeric(sanitized_q, clean_id, num, search_domains, results)
        else:
            self._search_text(sanitized_q, search_domains, results)

        return Response(results, status=status.HTTP_200_OK)

    def _empty_payload(self):
        return {
            'orders': [],
            'customers': [],
            'products': [],
            'purchase_orders': [],
            'finance': [],
        }

    def _search_numeric(self, q, clean_id, num, domains, results):
        # 32-bit positive integer ceiling to prevent EmptyResultSet/Postgres integer out of range
        num_for_id = num if num <= 2147483647 else None
        digits_only = re.sub(r'\D', '', q)

        # 1. Orders
        if 'orders' in domains:
            try:
                order_q = Q()
                if num_for_id is not None:
                    order_q |= Q(display_id=num_for_id)
                if digits_only and len(digits_only) >= 3:
                    order_q |= Q(customer__phone__contains=digits_only) | Q(guest_phone__contains=digits_only)
                elif q.isdigit():
                    order_q |= Q(customer__phone__startswith=q) | Q(guest_phone__startswith=q)

                if order_q:
                    qs = Order.objects.filter(is_deleted=False).filter(order_q).values(
                        'id', 'display_id', 'total', 'order_status', 'payment_status',
                        'customer__first_name', 'customer__middle_name', 'customer__last_name', 'guest_name',
                        'customer__phone', 'guest_phone'
                    )[:5]

                    for o in qs:
                        full_name = " ".join(filter(None, [
                            o['customer__first_name'],
                            o['customer__middle_name'],
                            o['customer__last_name']
                        ])).strip()
                        cust_name = full_name or o['guest_name'] or 'Customer'
                        phone = o['customer__phone'] or o['guest_phone'] or ''
                        status_val = (o['order_status'] or 'pending').lower()
                        if status_val in ('completed', 'delivered'):
                            b_color = 'success'
                        elif status_val in ('cancelled', 'refunded'):
                            b_color = 'danger'
                        else:
                            b_color = 'warning'

                        disp_id = o['display_id'] if o['display_id'] is not None else str(o['id'])[:8]
                        total_val = f"₹{o['total']:.2f}" if o['total'] is not None else "₹0.00"
                        subtitle = f"{cust_name} • {phone} • {total_val}" if phone else f"{cust_name} • {total_val}"

                        results['orders'].append({
                            'id': f"order-{o['id']}",
                            'title': f"Order #{disp_id}",
                            'subtitle': subtitle,
                            'badge': status_val.replace('_', ' ').upper(),
                            'badgeColor': b_color,
                            'url': f"/orders/{o['id']}",
                            'category': 'orders'
                        })
            except Exception as e:
                logger.exception(f"OmniSearch numeric orders error: {e}")

        # 2. Customers
        if 'customers' in domains:
            try:
                cust_q = Q()
                if num_for_id is not None:
                    cust_q |= Q(display_id=num_for_id)
                if digits_only and len(digits_only) >= 3:
                    cust_q |= Q(phone__contains=digits_only)
                elif q.isdigit():
                    cust_q |= Q(phone__startswith=q)

                if cust_q:
                    qs = Customer.objects.filter(is_deleted=False).filter(cust_q).values(
                        'id', 'display_id', 'first_name', 'middle_name', 'last_name', 'phone'
                    )[:5]

                    for c in qs:
                        name = " ".join(filter(None, [
                            c['first_name'],
                            c['middle_name'],
                            c['last_name']
                        ])).strip() or 'Unnamed Customer'
                        disp_id = c['display_id'] if c['display_id'] is not None else str(c['id'])[:8]
                        phone_str = f"📞 {c['phone']}" if c['phone'] else 'No phone'

                        results['customers'].append({
                            'id': f"customer-{c['id']}",
                            'title': name,
                            'subtitle': f"#{disp_id} • {phone_str}",
                            'badge': 'CUSTOMER',
                            'badgeColor': 'info',
                            'url': f"/customers/{c['id']}",
                            'category': 'customers'
                        })
            except Exception as e:
                logger.exception(f"OmniSearch numeric customers error: {e}")

        # 3. Products
        if 'products' in domains and num_for_id is not None:
            try:
                qs = Product.objects.filter(is_deleted=False).filter(display_id=num_for_id).values(
                    'id', 'display_id', 'name', 'selling_price', 'stock_quantity', 'low_stock_threshold'
                )[:5]

                for p in qs:
                    disp_id = p['display_id'] if p['display_id'] is not None else str(p['id'])[:8]
                    stock = p['stock_quantity'] or 0
                    threshold = p['low_stock_threshold'] if p['low_stock_threshold'] is not None else 10
                    if stock <= 0:
                        badge = 'OUT OF STOCK'
                        b_color = 'danger'
                    elif stock <= threshold:
                        badge = 'LOW STOCK'
                        b_color = 'warning'
                    else:
                        badge = 'IN STOCK'
                        b_color = 'success'

                    price = f"₹{p['selling_price']:.2f}" if p['selling_price'] is not None else "₹0.00"

                    results['products'].append({
                        'id': f"product-{p['id']}",
                        'title': p['name'],
                        'subtitle': f"#{disp_id} • {price} • Stock: {stock}",
                        'badge': badge,
                        'badgeColor': b_color,
                        'url': f"/inventory/product/{p['id']}",
                        'category': 'products'
                    })
            except Exception as e:
                logger.exception(f"OmniSearch numeric products error: {e}")

        # 4. Purchase Orders
        if 'purchase_orders' in domains and num_for_id is not None:
            try:
                qs = PurchaseOrder.objects.filter(is_deleted=False).filter(display_id=num_for_id).values(
                    'id', 'display_id', 'vendor__name', 'total_amount', 'status'
                )[:5]

                for po in qs:
                    disp_id = po['display_id'] if po['display_id'] is not None else str(po['id'])[:8]
                    status_val = (po['status'] or 'draft').lower()
                    if status_val in ('received', 'completed'):
                        b_color = 'success'
                    elif status_val in ('cancelled', 'rejected'):
                        b_color = 'danger'
                    else:
                        b_color = 'warning'

                    vendor_name = po['vendor__name'] or 'Vendor'
                    total_val = f"₹{po['total_amount']:.2f}" if po['total_amount'] is not None else "₹0.00"

                    results['purchase_orders'].append({
                        'id': f"po-{po['id']}",
                        'title': f"PO #{disp_id}",
                        'subtitle': f"{vendor_name} • {total_val}",
                        'badge': status_val.replace('_', ' ').upper(),
                        'badgeColor': b_color,
                        'url': f"/procurement/{po['id']}",
                        'category': 'purchase_orders'
                    })
            except Exception as e:
                logger.exception(f"OmniSearch numeric PO error: {e}")

        # 5. Finance
        if 'finance' in domains:
            try:
                term = clean_id or q
                qs = BankTransaction.objects.filter(is_deleted=False).filter(
                    Q(reference__icontains=term) | Q(description__icontains=term)
                ).values(
                    'id', 'reference', 'description', 'amount', 'transaction_type', 'date', 'account__name'
                )[:5]

                for t in qs:
                    ref = t['reference'] or ''
                    title = f"Ref: {ref}" if ref else f"Txn #{str(t['id'])[:8]}"
                    tx_type = (t['transaction_type'] or 'credit').lower()
                    b_color = 'success' if tx_type in ('deposit', 'credit') else 'danger'
                    desc = t['description'] or (f"Bank Transaction ({t['account__name']})" if t['account__name'] else "Bank Transaction")
                    amount = f"₹{t['amount']:.2f}" if t['amount'] is not None else "₹0.00"

                    results['finance'].append({
                        'id': f"txn-{t['id']}",
                        'title': title,
                        'subtitle': f"{desc} • {amount}",
                        'badge': tx_type.upper(),
                        'badgeColor': b_color,
                        'url': f"/finance/transactions?search={ref or str(t['id'])[:8]}",
                        'category': 'finance'
                    })
            except Exception as e:
                logger.exception(f"OmniSearch numeric finance error: {e}")

    def _search_text(self, q, domains, results):
        words = [w for w in q.split() if w]

        # 1. Customers
        if 'customers' in domains:
            try:
                cust_q = (
                    Q(first_name__icontains=q) |
                    Q(middle_name__icontains=q) |
                    Q(last_name__icontains=q) |
                    Q(phone__icontains=q)
                )
                if len(words) >= 2:
                    cust_q |= reduce(
                        operator.and_,
                        [Q(first_name__icontains=w) | Q(middle_name__icontains=w) | Q(last_name__icontains=w) for w in words]
                    )

                qs = Customer.objects.filter(is_deleted=False).filter(cust_q).values(
                    'id', 'display_id', 'first_name', 'middle_name', 'last_name', 'phone'
                )[:5]

                for c in qs:
                    name = " ".join(filter(None, [
                        c['first_name'],
                        c['middle_name'],
                        c['last_name']
                    ])).strip() or 'Unnamed Customer'
                    disp_id = c['display_id'] if c['display_id'] is not None else str(c['id'])[:8]
                    phone_str = f"📞 {c['phone']}" if c['phone'] else 'No phone'

                    results['customers'].append({
                        'id': f"customer-{c['id']}",
                        'title': name,
                        'subtitle': f"#{disp_id} • {phone_str}",
                        'badge': 'CUSTOMER',
                        'badgeColor': 'info',
                        'url': f"/customers/{c['id']}",
                        'category': 'customers'
                    })
            except Exception as e:
                logger.exception(f"OmniSearch text customers error: {e}")

        # 2. Products
        if 'products' in domains:
            try:
                prod_q = (
                    Q(name__icontains=q) |
                    Q(category__name__icontains=q) |
                    Q(description__icontains=q)
                )
                if len(words) >= 2:
                    prod_q |= reduce(
                        operator.and_,
                        [Q(name__icontains=w) | Q(category__name__icontains=w) | Q(description__icontains=w) for w in words]
                    )

                qs = Product.objects.filter(is_deleted=False).filter(prod_q).values(
                    'id', 'display_id', 'name', 'selling_price', 'stock_quantity', 'low_stock_threshold'
                )[:5]

                for p in qs:
                    disp_id = p['display_id'] if p['display_id'] is not None else str(p['id'])[:8]
                    stock = p['stock_quantity'] or 0
                    threshold = p['low_stock_threshold'] if p['low_stock_threshold'] is not None else 10
                    if stock <= 0:
                        badge = 'OUT OF STOCK'
                        b_color = 'danger'
                    elif stock <= threshold:
                        badge = 'LOW STOCK'
                        b_color = 'warning'
                    else:
                        badge = 'IN STOCK'
                        b_color = 'success'

                    price = f"₹{p['selling_price']:.2f}" if p['selling_price'] is not None else "₹0.00"

                    results['products'].append({
                        'id': f"product-{p['id']}",
                        'title': p['name'],
                        'subtitle': f"#{disp_id} • {price} • Stock: {stock}",
                        'badge': badge,
                        'badgeColor': b_color,
                        'url': f"/inventory/product/{p['id']}",
                        'category': 'products'
                    })
            except Exception as e:
                logger.exception(f"OmniSearch text products error: {e}")

        # 3. Orders
        if 'orders' in domains:
            try:
                order_q = (
                    Q(customer__first_name__icontains=q) |
                    Q(customer__middle_name__icontains=q) |
                    Q(customer__last_name__icontains=q) |
                    Q(guest_name__icontains=q) |
                    Q(customer__phone__icontains=q) |
                    Q(guest_phone__icontains=q) |
                    Q(notes__icontains=q)
                )
                if len(words) >= 2:
                    order_q |= reduce(
                        operator.and_,
                        [
                            Q(customer__first_name__icontains=w) |
                            Q(customer__middle_name__icontains=w) |
                            Q(customer__last_name__icontains=w) |
                            Q(guest_name__icontains=w)
                            for w in words
                        ]
                    )

                qs = Order.objects.filter(is_deleted=False).filter(order_q).values(
                    'id', 'display_id', 'total', 'order_status', 'payment_status',
                    'customer__first_name', 'customer__middle_name', 'customer__last_name', 'guest_name',
                    'customer__phone', 'guest_phone'
                )[:5]

                for o in qs:
                    full_name = " ".join(filter(None, [
                        o['customer__first_name'],
                        o['customer__middle_name'],
                        o['customer__last_name']
                    ])).strip()
                    cust_name = full_name or o['guest_name'] or 'Customer'
                    phone = o['customer__phone'] or o['guest_phone'] or ''
                    status_val = (o['order_status'] or 'pending').lower()
                    if status_val in ('completed', 'delivered'):
                        b_color = 'success'
                    elif status_val in ('cancelled', 'refunded'):
                        b_color = 'danger'
                    else:
                        b_color = 'warning'

                    disp_id = o['display_id'] if o['display_id'] is not None else str(o['id'])[:8]
                    total_val = f"₹{o['total']:.2f}" if o['total'] is not None else "₹0.00"
                    subtitle = f"{cust_name} • {phone} • {total_val}" if phone else f"{cust_name} • {total_val}"

                    results['orders'].append({
                        'id': f"order-{o['id']}",
                        'title': f"Order #{disp_id}",
                        'subtitle': subtitle,
                        'badge': status_val.replace('_', ' ').upper(),
                        'badgeColor': b_color,
                        'url': f"/orders/{o['id']}",
                        'category': 'orders'
                    })
            except Exception as e:
                logger.exception(f"OmniSearch text orders error: {e}")

        # 4. Purchase Orders
        if 'purchase_orders' in domains:
            try:
                po_q = Q(vendor__name__icontains=q) | Q(notes__icontains=q)
                if len(words) >= 2:
                    po_q |= reduce(
                        operator.and_,
                        [Q(vendor__name__icontains=w) | Q(notes__icontains=w) for w in words]
                    )

                qs = PurchaseOrder.objects.filter(is_deleted=False).filter(po_q).values(
                    'id', 'display_id', 'vendor__name', 'total_amount', 'status'
                )[:5]

                for po in qs:
                    disp_id = po['display_id'] if po['display_id'] is not None else str(po['id'])[:8]
                    status_val = (po['status'] or 'draft').lower()
                    if status_val in ('received', 'completed'):
                        b_color = 'success'
                    elif status_val in ('cancelled', 'rejected'):
                        b_color = 'danger'
                    else:
                        b_color = 'warning'

                    vendor_name = po['vendor__name'] or 'Vendor'
                    total_val = f"₹{po['total_amount']:.2f}" if po['total_amount'] is not None else "₹0.00"

                    results['purchase_orders'].append({
                        'id': f"po-{po['id']}",
                        'title': f"PO #{disp_id}",
                        'subtitle': f"{vendor_name} • {total_val}",
                        'badge': status_val.replace('_', ' ').upper(),
                        'badgeColor': b_color,
                        'url': f"/procurement/{po['id']}",
                        'category': 'purchase_orders'
                    })
            except Exception as e:
                logger.exception(f"OmniSearch text PO error: {e}")

        # 5. Finance
        if 'finance' in domains:
            try:
                qs = BankTransaction.objects.filter(is_deleted=False).filter(
                    Q(reference__icontains=q) | Q(description__icontains=q)
                ).values(
                    'id', 'reference', 'description', 'amount', 'transaction_type', 'date', 'account__name'
                )[:5]

                for t in qs:
                    ref = t['reference'] or ''
                    title = f"Ref: {ref}" if ref else f"Txn #{str(t['id'])[:8]}"
                    tx_type = (t['transaction_type'] or 'credit').lower()
                    b_color = 'success' if tx_type in ('deposit', 'credit') else 'danger'
                    desc = t['description'] or (f"Bank Transaction ({t['account__name']})" if t['account__name'] else "Bank Transaction")
                    amount = f"₹{t['amount']:.2f}" if t['amount'] is not None else "₹0.00"

                    results['finance'].append({
                        'id': f"txn-{t['id']}",
                        'title': title,
                        'subtitle': f"{desc} • {amount}",
                        'badge': tx_type.upper(),
                        'badgeColor': b_color,
                        'url': f"/finance/transactions?search={ref or str(t['id'])[:8]}",
                        'category': 'finance'
                    })
            except Exception as e:
                logger.exception(f"OmniSearch text finance error: {e}")
