"""
Database extraction helper for analytical engines.
Enforces read-only transactions, statement timeouts, and memory-safe Polars conversions.
"""

import logging
from typing import Optional, List, Dict, Any
import polars as pl
import psycopg2
from psycopg2.extras import RealDictCursor
from .config import settings

logger = logging.getLogger("azbooks.analytics.db")


def get_db_connection():
    """
    Returns a connection to the PostgreSQL database with read-only and statement timeout protections.
    """
    if not settings.database_url:
        raise ValueError("DATABASE_URL is not configured in analytics settings.")

    conn = psycopg2.connect(settings.database_url)
    conn.set_session(readonly=True, autocommit=True)

    with conn.cursor() as cur:
        # Enforce analytical statement timeout (default: 6000ms)
        cur.execute(f"SET statement_timeout = {settings.statement_timeout_ms};")

    return conn


def fetch_order_transactions(
    limit: Optional[int] = 50000,
    min_order_date: Optional[str] = None,
) -> pl.DataFrame:
    """
    Extracts order item transactions across valid sales for market basket and customer analysis.
    """
    query = """
        SELECT 
            oi.order_id::text AS order_id,
            oi.product_id::text AS product_id,
            p.name AS product_name,
            'organic' AS attribution_source,
            o.customer_id::text AS customer_id,
            COALESCE(c.full_name, 'Guest Customer') AS customer_name,
            oi.line_total::float AS line_total,
            oi.unit_price::float AS unit_price
        FROM orders_orderitem oi
        JOIN orders_order o ON oi.order_id = o.id
        JOIN inventory_product p ON oi.product_id = p.id
        LEFT JOIN customers_customer c ON o.customer_id = c.id
        WHERE o.order_status IN ('confirmed', 'completed')
          AND o.is_deleted = false
    """
    params = []
    if min_order_date:
        query += " AND o.created_at >= %s"
        params.append(min_order_date)

    query += " ORDER BY o.created_at DESC"

    if limit:
        query += f" LIMIT {int(limit)}"

    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

        if not rows:
            return pl.DataFrame(schema={
                "order_id": pl.Utf8,
                "product_id": pl.Utf8,
                "product_name": pl.Utf8,
                "attribution_source": pl.Utf8,
                "customer_id": pl.Utf8,
                "customer_name": pl.Utf8,
                "line_total": pl.Float64,
                "unit_price": pl.Float64,
            })

        return pl.DataFrame(rows)
    finally:
        conn.close()


def fetch_village_order_data(
    limit: Optional[int] = 50000,
    min_order_date: Optional[str] = None,
) -> pl.DataFrame:
    """
    Extracts orders mapped through customer primary addresses and geographic regions.
    Extracts coordinates via ST_X/ST_Y if available, with resilient fallback if spatial functions fail.
    """
    base_query = """
        SELECT 
            COALESCE(r.id::text, 'unmapped') AS village_id,
            COALESCE(r.name, 'Unmapped Area') AS village_name,
            COALESCE(a.taluka, '') AS taluka,
            COALESCE(a.district, '') AS district,
            c.id::text AS customer_id,
            COALESCE(TRIM(c.first_name || ' ' || c.last_name), 'Customer') AS customer_name,
            COALESCE(c.phone, '') AS phone,
            o.id::text AS order_id,
            o.total::float AS order_total,
            CASE 
                WHEN o.created_at >= NOW() - INTERVAL '180 days' THEN 'current'
                ELSE 'prior'
            END AS season,
            CASE 
                WHEN a.location IS NOT NULL THEN ST_Y(a.location::geometry)
                ELSE NULL
            END AS latitude,
            CASE 
                WHEN a.location IS NOT NULL THEN ST_X(a.location::geometry)
                ELSE NULL
            END AS longitude,
            100 AS estimated_capacity
        FROM orders_order o
        JOIN customers_customer c ON o.customer_id = c.id
        LEFT JOIN customers_address a ON a.customer_id = c.id AND a.is_primary = true
        LEFT JOIN customers_geographicregion r ON a.region_id = r.id
        WHERE o.order_status IN ('confirmed', 'completed')
          AND o.is_deleted = false
    """
    params = []
    if min_order_date:
        base_query += " AND o.created_at >= %s"
        params.append(min_order_date)

    base_query += " ORDER BY o.created_at DESC"
    if limit:
        base_query += f" LIMIT {int(limit)}"

    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            try:
                cur.execute(base_query, params)
                rows = cur.fetchall()
            except Exception as spatial_err:
                logger.warning(
                    f"Spatial query failed or ST_X/ST_Y unavailable ({spatial_err}), falling back to non-spatial projection."
                )
                conn.rollback()
                fallback_query = """
                    SELECT 
                        COALESCE(r.id::text, 'unmapped') AS village_id,
                        COALESCE(r.name, 'Unmapped Area') AS village_name,
                        COALESCE(a.taluka, '') AS taluka,
                        COALESCE(a.district, '') AS district,
                        c.id::text AS customer_id,
                        COALESCE(TRIM(c.first_name || ' ' || c.last_name), 'Customer') AS customer_name,
                        COALESCE(c.phone, '') AS phone,
                        o.id::text AS order_id,
                        o.total::float AS order_total,
                        CASE 
                            WHEN o.created_at >= NOW() - INTERVAL '180 days' THEN 'current'
                            ELSE 'prior'
                        END AS season,
                        NULL::float AS latitude,
                        NULL::float AS longitude,
                        100 AS estimated_capacity
                    FROM orders_order o
                    JOIN customers_customer c ON o.customer_id = c.id
                    LEFT JOIN customers_address a ON a.customer_id = c.id AND a.is_primary = true
                    LEFT JOIN customers_geographicregion r ON a.region_id = r.id
                    WHERE o.order_status IN ('confirmed', 'completed')
                      AND o.is_deleted = false
                    ORDER BY o.created_at DESC
                """
                if limit:
                    fallback_query += f" LIMIT {int(limit)}"
                cur.execute(fallback_query)
                rows = cur.fetchall()

        if not rows:
            return pl.DataFrame(schema={
                "village_id": pl.Utf8,
                "village_name": pl.Utf8,
                "taluka": pl.Utf8,
                "district": pl.Utf8,
                "customer_id": pl.Utf8,
                "customer_name": pl.Utf8,
                "phone": pl.Utf8,
                "order_id": pl.Utf8,
                "order_total": pl.Float64,
                "season": pl.Utf8,
                "latitude": pl.Float64,
                "longitude": pl.Float64,
                "estimated_capacity": pl.Int64,
            })

        return pl.DataFrame(rows)
    finally:
        conn.close()


def fetch_product_pricing_history(
    product_id: Optional[str] = None,
    limit: Optional[int] = 50000,
) -> pl.DataFrame:
    """
    Extracts historical order item transactions with unit_price, quantity, line_total, and product cost.
    """
    query = """
        SELECT 
            oi.product_id::text AS product_id,
            p.name AS product_name,
            COALESCE(cat.name, 'General') AS category_name,
            oi.quantity::float AS quantity,
            oi.unit_price::float AS unit_price,
            COALESCE(p.cost_price, 0.0)::float AS unit_cost,
            COALESCE(p.selling_price, oi.unit_price)::float AS current_price
        FROM orders_orderitem oi
        JOIN orders_order o ON oi.order_id = o.id
        JOIN inventory_product p ON oi.product_id = p.id
        LEFT JOIN inventory_category cat ON p.category_id = cat.id
        WHERE o.order_status IN ('confirmed', 'completed')
          AND o.is_deleted = false
          AND oi.unit_price > 0
          AND oi.quantity > 0
    """
    params = []
    if product_id:
        query += " AND oi.product_id = %s"
        params.append(product_id)

    query += " ORDER BY o.created_at DESC"
    if limit:
        query += f" LIMIT {int(limit)}"

    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

        if not rows:
            return pl.DataFrame(schema={
                "product_id": pl.Utf8,
                "product_name": pl.Utf8,
                "category_name": pl.Utf8,
                "quantity": pl.Float64,
                "unit_price": pl.Float64,
                "unit_cost": pl.Float64,
                "current_price": pl.Float64,
            })

        return pl.DataFrame(rows)
    finally:
        conn.close()


def fetch_return_records(
    limit: Optional[int] = 50000,
    min_date: Optional[str] = None,
) -> pl.DataFrame:
    """
    Extracts return items joined with reason, product, vendor, and customer details.
    """
    query = """
        SELECT 
            ri.id::text AS return_item_id,
            r.id::text AS return_id,
            r.order_id::text AS order_id,
            p.id::text AS product_id,
            p.name AS product_name,
            COALESCE(cat.name, 'General') AS category_name,
            COALESCE(v.id::text, 'unassigned') AS vendor_id,
            COALESCE(v.name, 'Unassigned Vendor') AS vendor_name,
            COALESCE(rr.name, 'Damaged') AS reason,
            ri.quantity AS quantity,
            COALESCE(ri.stock_action, 'return_to_stock') AS stock_action,
            o.customer_id::text AS customer_id,
            COALESCE(TRIM(c.first_name || ' ' || c.last_name), 'Valued Customer') AS customer_name,
            COALESCE(c.phone, '') AS phone,
            COALESCE(reg.name, 'Unmapped') AS village_name,
            COALESCE((oi.line_total / NULLIF(oi.quantity, 0)) * ri.quantity, 0.0)::float AS refund_amount,
            ri.created_at::text AS created_at
        FROM orders_returnitem ri
        JOIN orders_return r ON ri.return_request_id = r.id
        JOIN orders_order o ON r.order_id = o.id
        JOIN orders_orderitem oi ON ri.order_item_id = oi.id
        JOIN inventory_product p ON oi.product_id = p.id
        LEFT JOIN inventory_category cat ON p.category_id = cat.id
        LEFT JOIN inventory_vendor v ON p.vendor_id = v.id
        LEFT JOIN orders_returnreason rr ON ri.reason_id = rr.id
        LEFT JOIN customers_customer c ON o.customer_id = c.id
        LEFT JOIN customers_address a ON a.customer_id = c.id AND a.is_primary = true
        LEFT JOIN customers_geographicregion reg ON a.region_id = reg.id
        WHERE r.status != 'cancelled'
          AND r.is_deleted = false
    """
    params = []
    if min_date:
        query += " AND ri.created_at >= %s"
        params.append(min_date)

    query += " ORDER BY ri.created_at DESC"
    if limit:
        query += f" LIMIT {int(limit)}"

    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

        if not rows:
            return pl.DataFrame(schema={
                "return_item_id": pl.Utf8,
                "return_id": pl.Utf8,
                "order_id": pl.Utf8,
                "product_id": pl.Utf8,
                "product_name": pl.Utf8,
                "category_name": pl.Utf8,
                "vendor_id": pl.Utf8,
                "vendor_name": pl.Utf8,
                "reason": pl.Utf8,
                "quantity": pl.Int64,
                "stock_action": pl.Utf8,
                "customer_id": pl.Utf8,
                "customer_name": pl.Utf8,
                "phone": pl.Utf8,
                "village_name": pl.Utf8,
                "refund_amount": pl.Float64,
                "created_at": pl.Utf8,
            })

        return pl.DataFrame(rows)
    finally:
        conn.close()


def fetch_product_sales_volume(
    limit: Optional[int] = 50000,
) -> pl.DataFrame:
    """
    Extracts sales volume grouped by product, vendor, and customer.
    """
    query = """
        SELECT 
            oi.product_id::text AS product_id,
            p.name AS product_name,
            COALESCE(cat.name, 'General') AS category_name,
            COALESCE(v.id::text, 'unassigned') AS vendor_id,
            COALESCE(v.name, 'Unassigned Vendor') AS vendor_name,
            o.customer_id::text AS customer_id,
            oi.quantity AS quantity,
            oi.line_total::float AS line_total
        FROM orders_orderitem oi
        JOIN orders_order o ON oi.order_id = o.id
        JOIN inventory_product p ON oi.product_id = p.id
        LEFT JOIN inventory_category cat ON p.category_id = cat.id
        LEFT JOIN inventory_vendor v ON p.vendor_id = v.id
        WHERE o.order_status IN ('confirmed', 'completed')
          AND o.is_deleted = false
        ORDER BY o.created_at DESC
    """
    if limit:
        query += f" LIMIT {int(limit)}"

    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query)
            rows = cur.fetchall()

        if not rows:
            return pl.DataFrame(schema={
                "product_id": pl.Utf8,
                "product_name": pl.Utf8,
                "category_name": pl.Utf8,
                "vendor_id": pl.Utf8,
                "vendor_name": pl.Utf8,
                "customer_id": pl.Utf8,
                "quantity": pl.Int64,
                "line_total": pl.Float64,
            })

        return pl.DataFrame(rows)
    finally:
        conn.close()



