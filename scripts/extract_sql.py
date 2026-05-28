import os
import pandas as pd
import psycopg2

DB_URL = "postgresql://neondb_owner:npg_VJEC5jtzp1Pu@ep-autumn-star-ao5bwuz1-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

def extract():
    conn = psycopg2.connect(DB_URL)
    
    query = """
    WITH owed_data AS (
        SELECT
            p.id as product_id,
            p.name as product_name,
            p.physical_stock,
            p.stock_quantity as available_stock,
            SUM(
                COALESCE(oi.confirmed_quantity, oi.quantity) - 
                (SELECT COALESCE(SUM(di.quantity), 0) FROM orders_deliveryitem di WHERE di.order_item_id = oi.id)
            ) as owed_qty
        FROM orders_order o
        JOIN customers_customer c ON o.customer_id = c.id
        JOIN customers_address a ON a.customer_id = c.id
        JOIN customers_geographicregion r ON a.region_id = r.id
        JOIN orders_orderitem oi ON oi.order_id = o.id
        JOIN inventory_product p ON oi.product_id = p.id
        WHERE LOWER(r.name) = 'machhiwad'
          AND o.delivery_status IN ('pending', 'partial')
        GROUP BY p.id, p.name, p.physical_stock, p.stock_quantity
    ),
    delivered_data AS (
        SELECT
            p.id as product_id,
            p.name as product_name,
            p.physical_stock,
            p.stock_quantity as available_stock,
            SUM(di.quantity) as recently_delivered
        FROM orders_delivery d
        JOIN orders_order o ON d.order_id = o.id
        JOIN customers_customer c ON o.customer_id = c.id
        JOIN customers_address a ON a.customer_id = c.id
        JOIN customers_geographicregion r ON a.region_id = r.id
        JOIN orders_deliveryitem di ON di.delivery_id = d.id
        JOIN orders_orderitem oi ON di.order_item_id = oi.id
        JOIN inventory_product p ON oi.product_id = p.id
        WHERE LOWER(r.name) = 'machhiwad'
          AND d.created_at >= '2026-05-10 00:00:00+05:30'
        GROUP BY p.id, p.name, p.physical_stock, p.stock_quantity
    )
    SELECT 
        COALESCE(o.product_name, d.product_name) as "Product",
        COALESCE(o.owed_qty, 0) as "Owed Quantity",
        COALESCE(d.recently_delivered, 0) as "Recently Delivered",
        COALESCE(o.physical_stock, d.physical_stock) as "Physical Stock",
        COALESCE(o.available_stock, d.available_stock) as "Available Stock"
    FROM owed_data o
    FULL OUTER JOIN delivered_data d ON o.product_id = d.product_id;
    """
    
    df = pd.read_sql(query, conn)
    conn.close()
    
    output_path = r'Z:\books2\Plan\Delivery_transport\Machhiwad_Extraction.xlsx'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # We rename "Recently Delivered" back or just include it
    df.to_excel(output_path, index=False, sheet_name='Machhiwad')
    print(f"Extraction complete. File saved to: {output_path}")

if __name__ == '__main__':
    extract()
