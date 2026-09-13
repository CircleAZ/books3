# Rule 03: Asynchronous Operations, Side Effects & Transaction I/O

## 1. Mandatory `transaction.on_commit()` for External I/O
- **The Catastrophe:** `OrderCreateSerializer.create()` and `Payment.save()` previously executed synchronous HTTP calls to Cloudflare R2 and WhatsApp Cloud API inside active transactions. External API latency froze Gunicorn worker threads for 500ms to 3,000ms per order, causing cascading connection queue spikes and HTTP 504 timeouts.
- **Strict Rule:** External network I/O (Cloudflare R2 snapshot generation, WhatsApp message dispatch, Resend transactional emails, geocoding lookups) is **PERMANENTLY FORBIDDEN** inside an active database transaction.
- **Enforcement:** All external dispatches, message queues, and background notifications must be wrapped in `transaction.on_commit()`:
  ```python
  from django.db import transaction

  def dispatch_post_payment_tasks(payment_id):
      transaction.on_commit(lambda: trigger_receipt_and_whatsapp(payment_id))
  ```

## 2. Uncommitted Data Visibility in Background Threads
- **The Thread Race Catastrophe:** When `Payment.save()` spawned a daemon thread to upload receipt snapshots, the thread executed on a separate database connection before the main HTTP thread committed its transaction.
- **PostgreSQL Isolation Trap:** Under PostgreSQL's default `Read Committed` isolation level, separate connections CANNOT view uncommitted rows. The background thread queried `order.items.all()`, found 0 items, and uploaded blank receipts or crashed with `Order.DoesNotExist`.
- **Strict Rule:** Background tasks or threads must NEVER be launched until the parent transaction is guaranteed committed via `transaction.on_commit()`.

## 3. Database Connection Leak Prevention in Threads
- **The Connection Exhaustion Catastrophe:** Django automatically opens and closes database connections per HTTP request cycle. However, Django DOES NOT manage connections for manually spawned `threading.Thread` instances.
- **The Neon Pool Exhaustion:** Every thread opened a connection to Neon PgBouncer and terminated without cleanup. Under peak load, this exhausted connection slots, triggering fatal database outages: `FATAL: remaining connection slots are reserved for non-replication superuser connections`.
- **Strict Rule:** Any background thread or asynchronous worker that touches Django models or the database MUST wrap its execution in a `try ... finally` block invoking `django.db.close_old_connections()`:
  ```python
  from django.db import close_old_connections

  def background_worker_task(payload_id):
      try:
          # Perform operations...
          process_payload(payload_id)
      except Exception as e:
          logger.error(f"Task failed: {e}")
      finally:
          close_old_connections()
  ```
