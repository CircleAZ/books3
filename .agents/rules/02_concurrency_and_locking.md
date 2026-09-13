# Rule 02: Concurrency, Locking & Race Condition Prevention

## 1. Permanent Ban on Table-Level Locks (`LOCK TABLE`)
- **The Catastrophe:** In legacy `books2`, `DisplayIDMixin.generate_display_id()` executed `LOCK TABLE "orders_order" IN EXCLUSIVE MODE`. This serialized all order, customer, and product creation system-wide. Cashiers were blocked at the database level whenever another cashier submitted an order.
- **Strict Rule:** `LOCK TABLE` is strictly forbidden in all application code, migrations, and service layers.
- **Display ID Generation:** Human-readable display IDs (e.g. Order #1001) must strictly use native PostgreSQL sequences (`CREATE SEQUENCE`) with `SELECT nextval(...)`. Sequences are O(1), lock-free, atomic, and completely immune to transaction abort serialization.

## 2. Mandatory Row-Level Locking (`select_for_update()`)
- **The Vulnerability:** Checking a record's state in memory without a database lock creates a Time-of-Check to Time-of-Use (TOCTOU) vulnerability.
- **The Double-Dispatch Catastrophe:** `OutletStockTransfer.dispatch()` previously verified `if status == DRAFT:` without locking the transfer row. Concurrent clicks passed the check simultaneously, dispatching the transfer multiple times and draining the warehouse 3× for a single shipment.
- **Strict Rule:** Before mutating state, adjusting inventory, or validating financial balances, the target entity MUST be locked via `select_for_update()` inside a `transaction.atomic()` block:
  ```python
  with transaction.atomic():
      transfer = OutletStockTransfer.objects.select_for_update().get(pk=transfer_id)
      if transfer.status != OutletStockTransfer.Status.DRAFT:
          raise ValidationError("Transfer already processed.")
      # Proceed with atomic deduction...
  ```
- **Applicability:** Mandatory on Orders, Deliveries, Returns, Refunds, Transfers, CashWallets, BankAccounts, and Products during deduction/restoration.

## 3. Lock Late, Release Early (Decoupling Serialization)
- **The 8-Second Lock Catastrophe:** Telemetry on Neon revealed row locks on `customers_customer` held for up to 8 seconds. The root cause: the `@transaction.atomic()` block acquired the customer lock, performed the write, and then invoked DRF's `super().create()`. DRF executed slow, nested Python serialization and N+1 queries while holding the PostgreSQL lock hostage.
- **Strict Rule:**
  1. Minimize the lifespan of any `select_for_update()` lock.
  2. Never perform heavy Python computation, string formatting, or serializer response construction inside an open row-locked transaction.
  3. Commit the database transaction immediately after the atomic data mutation, and perform serialization OUTSIDE the atomic block before returning the HTTP response.

## 4. Advisory Lock Scoping (`pg_advisory_xact_lock`)
- **Behavior:** `pg_advisory_xact_lock` holds until the entire database transaction completes, not when an internal Python block exits.
- **Strict Rule:** Do not use transaction-level advisory locks inside loops or bulk ingestion pipelines. If advisory locking is required, ensure the transaction is scoped strictly to the critical operation and immediately committed.
