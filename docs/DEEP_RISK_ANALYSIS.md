# DEEP RISK ANALYSIS: The Hidden Catastrophes

**Date:** 2026-05-01
**Author:** The Internal Expert Panel (Extracted under Threat of Termination)
**Status:** CRITICAL VULNERABILITIES IDENTIFIED

## 1. The Threading/Transaction Race Condition (FATAL)
**The Flaw:** We wrapped `update_receipt_snapshot(self.order)` in a daemon thread inside `Payment.save()` and `OrderCreateSerializer.create()`.
**The Catastrophe:** 
- `Payment.save()` executes *inside* an active database transaction.
- The daemon thread starts instantly and runs on a *separate database connection*.
- Because PostgreSQL defaults to `Read Committed` isolation, the background thread **cannot see uncommitted data**. 
- If the thread reaches `order.items.all()` or queries the newly created `Payment` before the main HTTP thread commits the transaction, the query will return nothing. 
- **Impact:** Receipts uploaded to Cloudflare R2 will be missing line items, missing payments, or the thread will crash entirely due to `Order.DoesNotExist` if the order itself hasn't committed.

## 2. The Advisory Lock Illusion (SEVERE)
**The Flaw:** We replaced `LOCK TABLE` with `pg_advisory_xact_lock` to stop blocking concurrent reads.
**The Catastrophe:**
- `pg_advisory_xact_lock` releases at the end of the *transaction*, not the block.
- DRF's `OrderCreateSerializer.create` and the subsequent `StockService.adjust_stock` loops all run within a single transaction.
- Therefore, the advisory lock is held for the *entire duration* of the stock deduction loop and the payment processing.
- **Impact:** Order creation is **STILL serialized system-wide**. If two cashiers hit "Confirm" at the exact same millisecond, Cashier B must wait for Cashier A's entire stock adjustment loop to finish before they can even get a `display_id`. We cured the symptom (reads being blocked), but the core disease (write serialization) remains.

## 3. The Thread Memory / DB Connection Leak (MODERATE)
**The Flaw:** Spawning raw `threading.Thread` instances inside a Django web request.
**The Catastrophe:**
- Django automatically cleans up database connections at the end of an HTTP request. It *does not* do this for manually spawned daemon threads.
- Every time a receipt is uploaded, the thread opens a PostgreSQL connection (to lazy-load items) and then dies without calling `django.db.close_old_connections()`.
- **Impact:** Under heavy POS load, the database connection pool (PgBouncer/Neon) will exhaust, resulting in `FATAL: remaining connection slots are reserved` errors, crashing the entire backend.

## 4. The Pagination Count Avalanche (MODERATE)
**The Flaw:** The `order_count` annotation is now conditionally bound to `?ordering=-order_count` (which the New Order page uses for "Popular Products").
**The Catastrophe:**
- When the POS requests popular products, it still triggers the `LEFT JOIN` on `order_items`. 
- Django's `PageNumberPagination` executes a `SELECT COUNT(*)` on the *entire annotated query* before slicing it. 
- **Impact:** Even though we saved the standard search, the "Popular Products" pane will progressively degrade the database CPU as the `order_items` table grows into the millions, eventually timing out the request.
