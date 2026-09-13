# Rule 06: Frontend, Idempotency & API Client Contracts

## 1. Zero Stale Caching on Financial Endpoints (`NetworkOnly`)
- **The 24-Hour Cache Catastrophe:** In legacy `books2`, Workbox service worker `runtimeCaching` cached all `/api/` GET requests with a 24-hour TTL under `NetworkFirst`. When a price changed from ₹25 to ₹20, salesmen devices continued showing ₹25 for a full day.
- **Strict Rule:** Workbox runtime caching is **STRICTLY PROHIBITED** on all `/api/` endpoints.
- **Transport Policy:** All financial endpoints (orders, payments, products, stock quantities, balances, ledger views) must strictly use `NetworkOnly`. Edge caching is managed exclusively via Cloudflare CDN headers.

## 2. Multi-Layered Idempotency Defense (`X-Idempotency-Key`)
- **The Duplicate Order Catastrophe:** Salesmen clicking "Confirm" rapidly or service workers retrying failed POST requests created duplicate orders (#1014/#1012, #1023/#1020).
- **The 3-Layer Defense:**
  1. **Frontend Fast-Lock:** Submit buttons must disable immediately upon click and render a loading spinner.
  2. **Cache Idempotency Header:** All mutating requests (POST/PUT) must send an `X-Idempotency-Key` header derived from payload content + time bucket (`djb2(payload + bucket)`).
  3. **Server-Side DB Fingerprint Guard:** In `OrderViewSet.create()`, a server-side `SHA-256` fingerprint is computed from order items and customer ID inside a `transaction.atomic()` block with `select_for_update()` on the Customer row. Duplicate requests within a 10-minute window return `409 Conflict`.

## 3. Live Search Debouncing & Out-of-Order Cancellation (`AbortController`)
- **The Search Flash Catastrophe:** Salesmen typing in the customer search input saw accurate results for a split second before random out-of-order results overwrote the screen.
- **Root Cause:** Fast keystrokes fired concurrent HTTP requests. The earlier, broader search query completed *after* the later, specific query, overwriting the UI with stale data.
- **Strict Rule:**
  1. All live search inputs must debounce keystrokes by 300ms–500ms.
  2. Every API request initiated by a search input MUST use an `AbortController`. The previous in-flight request must be aborted immediately before firing the next request:
     ```javascript
     if (abortControllerRef.current) {
         abortControllerRef.current.abort();
     }
     abortControllerRef.current = new AbortController();
     fetch(url, { signal: abortControllerRef.current.signal });
     ```

## 4. Server-Side Pagination Invariant
- **The 20-Item Blindness Trap:** Modals and lists that fetch `GET /api/.../` without pagination parameters receive the default page (20 items). Filtering or searching client-side hides 95% of available records from users.
- **Strict Rule:** Frontends must never perform client-side filtering on paginated datasets. Search and filter parameters must pass directly to backend query parameters (`?search=`, `?category=`, `?page=`).

## 5. Universal Payment Engine Centralization
- **Component Standard:** All 7 payment interfaces in the frontend (POS, Outlets, Customer Invoices, Legacy Debt, Employee Expenses, Procurement) MUST use the shared `<UniversalPaymentEngine />` component.
- **Infinite Render Guard:** Serialized dependency arrays passed to the engine must be stringified (e.g. `allowedMethods.join(',')`) to prevent infinite React re-render loops.
