# Active Bug Tracking: Concurrency, Locking & Transactions

> **Domain:** Core Database, Concurrency Models, Transaction Lifecycles  
> **Classification:** Lock Contention, Deadlocks, Connection Pooling & Async I/O  
> **Status Registry:** Living Document — Updated Dynamically  

---

## 1. Category Summary & Health Metrics

High concurrency in a retail multi-register POS environment exposes race conditions, deadlock vectors, and connection pool starvation. In legacy Books2, table-level locking froze the checkout terminal, and external network I/O inside transactions blocked database threads. In Books3, strict concurrency controls (Rule 02 and Rule 03) govern all write paths.

| Bug ID | Title / Subsystem | Severity | Status | Verification Target |
|---|---|---|---|---|
| **`BUG-CONC-001`** | Table-Level Lock Freeze (`LOCK TABLE "orders_order"`) | **CRITICAL** | **RESOLVED / BANNED** | `Macro_Architecture.md:L85`, `RCA_POS_PERFORMANCE_REPORT.md` |
| **`BUG-CONC-002`** | Synchronous External I/O Inside Open DB Transactions | **CRITICAL** | **RESOLVED / PATCHED** | `orders/models.py:L820-L852`, `orders/views.py:L1165` |
| **`BUG-CONC-003`** | PgBouncer Transaction Mode Server-Side Cursor Crash | **CRITICAL** | **RESOLVED / PATCHED** | `azbooks/settings.py:L181` |
| **`BUG-CONC-004`** | PgBouncer `-pooler` DDL Lockout on Migrations & Management Commands | **HIGH** | **RESOLVED / PATCHED** | `azbooks/settings.py:L211-L221` |
| **`BUG-CONC-005`** | Daemon Thread Connection Leakage & Read-Committed Visibility Stale State | **HIGH** | **RESOLVED / PATCHED** | `orders/models.py:L812-L846` |
| **`BUG-CONC-006`** | POS Idempotency Race Condition (Double-Click Order Placement) | **HIGH** | **RESOLVED / PATCHED** | `orders/views.py` (`X-Idempotency-Key` + Sliding Window) |

---

## 2. Granular Bug Dossiers

### `BUG-CONC-001`: Table-Level Lock Freeze (`LOCK TABLE "orders_order"`)
- **Severity:** Critical (P0)
- **Status:** **RESOLVED / BANNED (Rule 02)**
- **Affected Domain:** Orders POS & DisplayID Generation
- **Mechanism & Root Cause:**
  Legacy Books2 generated human-readable sequential order IDs (e.g. `Order #1001`) by locking the entire `orders_order` table in exclusive mode:
  ```sql
  LOCK TABLE "orders_order" IN EXCLUSIVE MODE;
  ```
  Under concurrent checkouts (multiple cashiers or parallel API syncs), all read and write queries stacked behind the table lock, causing client timeouts, 8-second register freezes, and HTTP 504 Gateway errors.
- **Verification Evidence:**
  Inspected entire codebase: exactly **0 occurrences** of `LOCK TABLE` in active Python code.
  Replaced with native PostgreSQL sequences:
  ```sql
  CREATE SEQUENCE orders_display_id_seq START WITH 1001 INCREMENT BY 1;
  ```
  Display IDs are acquired via lock-free $O(1)$ sequence increments. State mutations use row-level `select_for_update()` only on the specific rows being modified.
- **Active Developments:** Codified in `.agents/rules/02_concurrency_and_locking.md`.

---

### `BUG-CONC-002`: Synchronous External I/O Inside Open DB Transactions
- **Severity:** Critical (P0)
- **Status:** **RESOLVED / PATCHED (Rule 03)**
- **Affected Domain:** Order Confirmation, Payment Recording & Receipt Snapshotting
- **Mechanism & Root Cause:**
  When a payment or order confirmation was saved, the legacy application made synchronous HTTP calls to WhatsApp Business API, Resend Transactional Email, and Cloudflare R2 inside the `@transaction.atomic` block. Network latency or external outages held database row locks open for 500ms to 2,000ms, starving the connection pool and triggering lock timeouts.
- **Verification Evidence:**
  Inspected [`orders/models.py`](file:///z:/books3/orders/models.py#L815-L820):
  ```python
  def trigger_async_tasks():
      import threading
      threading.Thread(target=run_dispatch, args=(self.order.id, self.id), daemon=True).start()
      threading.Thread(target=run_r2, args=(self.order.id,), daemon=True).start()

  transaction.on_commit(trigger_async_tasks)
  ```
  External I/O is physically barred from executing until the database transaction successfully commits. If the transaction rolls back, zero external dispatches are triggered.
- **Active Developments:** All asynchronous task spawners must be wrapped in `transaction.on_commit()`.

---

### `BUG-CONC-003`: PgBouncer Transaction Mode Server-Side Cursor Crash
- **Severity:** Critical (P0)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`azbooks/settings.py`](file:///z:/books3/azbooks/settings.py#L178-L181)
- **Mechanism & Root Cause:**
  Neon PostgreSQL employs PgBouncer operating in **transaction pooling** mode. In transaction pooling, a client connection is bound to a backend database worker only for the duration of a transaction block. Django's `.iterator()` utilizes named PostgreSQL server-side cursors (`DECLARE "name" NO SCROLL CURSOR FOR ...`). When subsequent fetch calls execute, PgBouncer assigns a different backend connection, throwing:
  ```
  django.db.utils.OperationalError: named cursor "cursor_1" does not exist
  ```
- **Verification Evidence:**
  Inspected [`azbooks/settings.py`](file:///z:/books3/azbooks/settings.py#L181):
  ```python
  # Neon uses PgBouncer in transaction mode — server-side cursors
  # (used by Django's .iterator()) are incompatible with transaction pooling.
  # Without this, finance/views.py CSV export will crash.
  DATABASES['default']['DISABLE_SERVER_SIDE_CURSORS'] = True
  ```
- **Active Developments:** Active and verified on Neon project `ep-raspy-lake-b39hlekz`.

---

### `BUG-CONC-004`: PgBouncer `-pooler` DDL Lockout on Migrations & Management Commands
- **Severity:** High (P1)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`azbooks/settings.py`](file:///z:/books3/azbooks/settings.py#L210-L221)
- **Mechanism & Root Cause:**
  DDL migration commands (`manage.py migrate`) and heavy data reconciliation scripts that run through the PgBouncer pooler host (`ep-raspy-lake-b39hlekz-pooler.ap-southeast-1.aws.neon.tech`) frequently fail due to prepared statement limitations and connection timeout resets during schema altering.
- **Verification Evidence:**
  Inspected [`azbooks/settings.py`](file:///z:/books3/azbooks/settings.py#L211-L220):
  ```python
  is_web_server = len(sys.argv) > 1 and sys.argv[1] in ('runserver', 'run_gunicorn', 'wsgi')
  if not is_web_server:
      host = DATABASES['default'].get('HOST', '')
      if 'neon.tech' in host and '-pooler' in host:
          DATABASES['default']['HOST'] = host.replace('-pooler', '')
  ```
  CLI management scripts automatically strip `-pooler`, establishing direct TCP sessions with the PostgreSQL database.
- **Active Developments:** Verified during sovereign database hydration (`scratch/hydrate_books3_db.py`).

---

### `BUG-CONC-005`: Daemon Thread Connection Leakage & Read-Committed Visibility Stale State
- **Severity:** High (P1)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`orders/models.py`](file:///z:/books3/orders/models.py#L812-L846)
- **Mechanism & Root Cause:**
  When background daemon threads are spawned to generate receipt PDF snapshots or dispatch messages, they inherit dead database connections from the thread pool. Furthermore, under PostgreSQL `READ COMMITTED`, a daemon thread query may read stale data if old connections are not recycled.
- **Verification Evidence:**
  Inspected [`orders/models.py`](file:///z:/books3/orders/models.py#L835-L846):
  ```python
  def run_r2(order_id):
      from django.db import close_old_connections
      try:
          close_old_connections()
          order = Order.objects.get(id=order_id)
          update_receipt_snapshot(order)
      finally:
          close_old_connections()
  ```
  Explicitly recycles connections before querying and releases them in `finally` blocks.
- **Active Developments:** Mandatory pattern for all standalone worker threads.
