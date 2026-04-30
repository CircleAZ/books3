# Order Duplicate Prevention — Architecture Reference

> **Document Status:** Live source of truth.
> **Date:** April 2026
> **Commit:** `4be87d4` — `fix: eliminate duplicate orders with 3-layer defense`

This document describes the multi-layered defense system that prevents duplicate order creation in AZ Books. The system uses three independent layers, each designed to fail-open so that order creation is never blocked by infrastructure failures.

---

## 1. Root Cause Analysis

Duplicate orders were caused by three independent failure modes converging:

| # | Failure Mode | Impact |
|---|---|---|
| 1 | **Missing Redis in production** — The cache-based idempotency key relied on `django.core.cache`, which defaulted to `LocMemCache` (process-local, non-shared) when `REDIS_URL` was absent. Each Render instance maintained its own cache, so the same idempotency key was never found across failover replays. | Cache layer silently useless |
| 2 | **Legacy Service Worker replay** — `frontend/public/service-worker.js` used Workbox `BackgroundSync` to queue failed POST requests in IndexedDB and replay them on reconnect. These replays had no idempotency headers, so the backend treated each as a new order. | Silent order duplication on reconnect |
| 3 | **Cloudflare Worker failover replay** — The CF Worker API Gateway buffers POST bodies and retries them against backup Render instances on timeout. Without server-side dedup, each retry created a new order. | Silent order duplication on failover |

---

## 2. Defense Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ORDER CREATION REQUEST                   │
│                  POST /api/orders/  + X-Idempotency-Key         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                   ┌───────────▼───────────┐
                   │   LAYER 1: Cache      │
                   │   Idempotency Key     │
                   │   (Fast Path)         │
                   │                       │
                   │   cache.get(key)      │
                   │   Hit? → return 200   │
                   │   Miss? → continue    │
                   │   Error? → continue   │
                   │      (fail-open)      │
                   └───────────┬───────────┘
                               │
                   ┌───────────▼───────────┐
                   │   LAYER 2: DB         │
                   │   Fingerprint Guard   │
                   │   (Definitive)        │
                   │                       │
                   │   select_for_update   │
                   │   on Customer row     │
                   │   Query fingerprint   │
                   │   Match? → return 409 │
                   │   No match? → create  │
                   │   Error? → continue   │
                   │      (fail-open)      │
                   └───────────┬───────────┘
                               │
                   ┌───────────▼───────────┐
                   │   LAYER 3: Store      │
                   │   Fingerprint on      │
                   │   Created Order       │
                   │                       │
                   │   order_fingerprint   │
                   │   = SHA-256 hash      │
                   │   (indexed column)    │
                   └───────────────────────┘
```

### Layer 1: Cache-Based Idempotency Key (Fast Path)

**Location:** `orders/views.py` → `OrderViewSet.create()`

The frontend sends an `X-Idempotency-Key` header with every order creation request. The backend checks if this key has been seen before.

- **Key derivation (frontend):** `djb2(customerID + sorted(productID:quantity) + timeBucket)`
- **Cache key format:** `order_idempotency_{user_id}_{idempotency_key}`
- **TTL:** 600 seconds (10 minutes, 2× the 5-minute time bucket)
- **On cache hit:** Returns the existing order with `200 OK`
- **On cache miss/error:** Proceeds to Layer 2 (fail-open)

> **Limitation:** This layer is ineffective when `REDIS_URL` is not configured (defaults to `LocMemCache`, which is process-local and not shared across Render instances). The DB guard (Layer 2) is the definitive backstop.

### Layer 2: Database Fingerprint Guard (Definitive Backstop)

**Location:** `orders/views.py` → `OrderViewSet.create()`

A server-side SHA-256 fingerprint is computed from the order contents and checked against recent orders in the database. The check and creation run inside a single `transaction.atomic()` block with a `select_for_update()` row lock on the customer to prevent TOCTOU races.

- **Fingerprint derivation (backend):** `SHA-256(customer_id | sorted(product:quantity) | floor(time/300))`
- **Duplicate window:** 10 minutes (2× the 5-minute time bucket, covers bucket-boundary edge cases)
- **On duplicate found:** Returns `409 Conflict` with `detail`, `existing_order_id`, and `existing_display_id`
- **On guard failure (DB error):** Falls through to create without the guard (fail-open)
- **Guest orders (no `customer_id`):** Skip this layer entirely (no row to lock)

#### Atomicity Guarantee

```python
with transaction.atomic():
    Customer.objects.select_for_update().filter(pk=customer_id).first()  # Lock
    recent_dup = Order.objects.filter(order_fingerprint=fingerprint, ...).first()  # Check
    if recent_dup:
        return Response(..., status=409)  # Block
    response = super().create(request, *args, **kwargs)  # Create (under lock)
    return response  # Lock released on commit
```

The `select_for_update()` on the customer row serializes concurrent order requests for the same customer. Request B blocks at the lock until Request A's transaction commits, at which point Request B sees Request A's fingerprint and returns `409`.

### Layer 3: Fingerprint Storage

**Location:** `orders/models.py` → `Order.order_fingerprint`

The computed fingerprint is stored on the created order via `perform_create()`, which passes it as an extra kwarg to `serializer.save()`.

- **Field:** `CharField(max_length=64, db_index=True, default='')`
- **Migration:** `orders/migrations/0010_add_order_fingerprint.py`

---

## 3. Frontend Changes

### Idempotency Key Lifecycle (`NewOrder.jsx`)

The idempotency key is **deterministic**, not random. It's derived from the cart contents so that retries of the same order automatically reuse the same key.

```javascript
// Recomputed whenever cart or customer changes
useEffect(() => {
    const timeBucket = Math.floor(Date.now() / 300000); // 5-minute windows
    const itemFingerprint = cartItems
        .map(i => `${i.id}:${i.quantity}`)
        .sort()
        .join(',');
    const raw = `${selectedCustomer.id}|${itemFingerprint}|${timeBucket}`;
    idempotencyKeyRef.current = djb2Hash(raw);
}, [cartItems, selectedCustomer]);
```

**Key cleared:** When cart is empty or no customer is selected → `null`
**Fallback:** If somehow `null` at submit time, regenerated inline before the request.

### 409 Conflict Handling

When the backend returns `409 Conflict`, the frontend shows a **warning toast** (not an error) with the `detail` message from the response body:

```
"A similar order (#1093) was created recently. Please verify before resubmitting."
```

The cart is **not cleared** on 409, allowing the operator to review and decide.

---

## 4. Infrastructure Cleanup

### Legacy Service Worker Removal

| What | Why |
|---|---|
| **Deleted** `frontend/public/service-worker.js` | Static SW with `BackgroundSync` that replayed failed POSTs without idempotency headers — root cause #2 |
| **Updated** `frontend/src/main.jsx` | Replaced manual `register('/service-worker.js')` with auto-cleanup routine that unregisters non-Workbox SWs |
| **Simplified** `OfflineSyncBadge.jsx` | Removed BackgroundSync queue monitoring (IndexedDB polling, pending count, sync badges). Now shows only online/offline banner. |

### PWA Architecture (Post-Fix)

The app now uses a **single** Workbox-generated service worker (`sw.js`), auto-registered by `vite-plugin-pwa` with `registerType: 'autoUpdate'`.

- **GET requests:** `NetworkFirst` with 5s timeout, cached in `api-cache` (24h expiration)
- **Mutating requests (POST/PUT/DELETE):** `NetworkOnly` — **no caching, no replay**. Failed mutations surface errors to the user for manual retry with full context.

> **Rationale for removing BackgroundSync:** Non-idempotent operations (order creation, payments, stock deductions) cannot be safely replayed. BackgroundSync replays requests on reconnect without knowing if the server already processed the original — causing duplicate orders, double payments, and phantom stock deductions. The only safe approach is to surface failures to the user.

---

## 5. Deployment Checklist

- [ ] Run `python manage.py migrate` on production to apply migration `0010_add_order_fingerprint`
- [ ] Verify `order_fingerprint` column exists: `SELECT column_name FROM information_schema.columns WHERE table_name = 'orders_order' AND column_name = 'order_fingerprint';`
- [ ] Confirm Workbox SW is the only registered SW in production browsers (DevTools → Application → Service Workers)
- [ ] Monitor logs for `DB duplicate guard triggered` entries (confirms the guard is working)
- [ ] (Optional) Configure `REDIS_URL` on all Render instances to enable cross-instance cache idempotency

---

## 6. Edge Cases & Known Limitations

| Scenario | Behavior | Risk Level |
|---|---|---|
| **Same order at time-bucket boundary** | Two submissions 1 second apart could land in different 5-minute buckets, producing different fingerprints | Low — idempotency key (same bucket) + 10-min duplicate window mitigates |
| **Guest orders (no customer)** | DB guard skipped (no customer row to lock). Only cache idempotency protects. | Medium — guests are rare in this POS system |
| **Redis unavailable** | Cache layer is a no-op (fail-open). DB guard remains active. | Low |
| **Database connection error during guard** | Guard check fails, `guard_failed=True`, order created without duplicate protection (fail-open) | Low — extremely rare |
| **Same customer, genuinely identical order** | 409 Conflict returned. Operator must wait 5 minutes or change the order contents. | Acceptable trade-off |
| **`ValidationError` during order creation** | Propagates naturally to DRF exception handler (400 response). Does NOT trigger duplicate creation. | None |
