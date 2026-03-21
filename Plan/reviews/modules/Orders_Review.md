# Orders Module — 6-Persona Review

> Reviewed: `NewOrder.jsx`, `EditOrder.jsx`, `OrderList.jsx`, `OrderDetails.jsx`, `OrderReceipt.jsx`, `models.py`, `serializers.py`, `views.py`

---

## 🛡️ The Ironclad — QA / Edge Cases

| ID | Severity | Issue | File:Line | Expected Behavior |
|----|----------|-------|-----------|-------------------|
| I-01 | **CRITICAL** | **POS `submitOrder()` sends order with `order_status: 'completed'` directly — bypasses `complete()` action, so stock is NEVER deducted** via the POS flow. The `complete()` view deducts stock, but `create()` just calls `serializer.save()`. | [NewOrder.jsx:438](file:///z:/books2/frontend/src/pages/orders/NewOrder.jsx#L438), [views.py:152](file:///z:/books2/orders/views.py#L152) | POS orders must deduct stock on creation when `order_status=completed`. |
| I-02 | **CRITICAL** | **EditOrder.jsx still has `isGuest` / `guestInfo` state** (lines 20-21). NewOrder removed guest checkout, but EditOrder still allows "Switch to Guest". If a previously-Quick-Add customer order is edited, it can be reassigned to a guest — breaking data integrity. | [EditOrder.jsx:20-21](file:///z:/books2/frontend/src/pages/orders/EditOrder.jsx#L20-L21) | Remove guest checkout from EditOrder to match NewOrder. |
| I-03 | **HIGH** | **EditOrder discount has NO clamping**. Line 171: `orderDiscount.type === 'fixed' ? orderDiscount.value : (subtotal * orderDiscount.value / 100)`. NewOrder clamps to `Math.min(value, subtotal)` and 100%, EditOrder allows negative totals. | [EditOrder.jsx:170-172](file:///z:/books2/frontend/src/pages/orders/EditOrder.jsx#L170-L172) | Apply same VULN-4 clamping as NewOrder. |
| I-04 | **HIGH** | **EditOrder has NO submission lock**. No `isSubmittingRef` like NewOrder's VULN-3 fix. Rapid double-clicks on "Save Changes" fire duplicate PUT requests. | [EditOrder.jsx:177](file:///z:/books2/frontend/src/pages/orders/EditOrder.jsx#L177) | Add `isSubmittingRef` guard. |
| I-05 | **MEDIUM** | **OrderList `page_size` is assumed**: `Math.ceil(count / (data.page_size \|\| 10))`. If backend changes page_size to 20, pagination breaks silently. | [OrderList.jsx:64](file:///z:/books2/frontend/src/pages/orders/OrderList.jsx#L64) | Use `next`/`previous` from DRF pagination response instead of computing. |
| I-06 | **MEDIUM** | **`cost_price` not sent in NewOrder POS**: Line 380 sets `cost_price = selling_price` for quick products. Real products added via search have no `cost_price` in the order payload — profit calculations will be wrong if the serializer defaults to 0. | [NewOrder.jsx:380](file:///z:/books2/frontend/src/pages/orders/NewOrder.jsx#L380) | Send `cost_price` from the product object for accurate profit tracking. |
| I-07 | **MEDIUM** | **`stock_quantity: 9999` hardcoded** in EditOrder (line 83). No stock validation is performed — user can increase quantity beyond available stock. | [EditOrder.jsx:83](file:///z:/books2/frontend/src/pages/orders/EditOrder.jsx#L83) | Fetch actual stock per product or validate server-side. |

---

## 🎨 The Lens — UI/UX Audit

| Severity | Heuristic Violated | Observation | Fix |
|----------|-------------------|-------------|-----|
| **Critical** | Visibility of System Status | **14× `alert()` calls** across the Orders module. `alert()` blocks the main thread, offers no styling control, and is jarring on mobile. No toast/snackbar system. | Replace all `alert()` with inline toast notifications. |
| **Critical** | Error Prevention | **NewOrder submits on Enter key** — no `type="button"` on "Complete Order". If user presses Enter in any input, form submits. | Add `type="button"` to all action buttons, or wrap non-form areas. |
| **Major** | Consistency & Standards | **EditOrder uses `alert("Delivered orders cannot be edited")` then `navigate()`** (line 53). User sees a blocking dialog, dismisses it, then gets redirected. Disorienting. | Show inline error message on the details page instead. |
| **Major** | User Control & Freedom | **No "Undo" for cart item removal** in NewOrder or EditOrder. `removeFromCart` is instant and irreversible. | Add undo-snackbar: "Item removed. [Undo]" for 5 seconds. |
| **Major** | Match Between System & Real World | **OrderList shows raw status values**: `payment_status` rendered as "pending" / "partial" / "paid" without capitalization in the pill. `formatStatusLabel` is used in OrderDetails but not in OrderList (line 276). | Use `formatStatusLabel()` in OrderList table cells. |
| **Minor** | Aesthetic / Minimalist Design | **NewOrder has 52 state variables** (lines 14-53). The component is 1103 lines. It's a god component handling customer selection, product search, cart, payments, quick-add, modals, and touch gestures. | Extract into composable hooks: `useCart()`, `useCustomerSelector()`, `usePayments()`. |
| **Minor** | Recognition vs. Recall | **OrderList empty state** just says "No orders found matching your criteria." — no suggestion to clear filters or create new order. | Add a "Clear Filters" button and "Create New Order" link in empty state. |

---

## 🏪 The Shopkeeper / Priya — Usability

| Action Attempted | Result | Frustration (1-10) | Quote |
|-----------------|--------|:---:|-------|
| Tried to create a quick order → typed product, added to cart, clicked "Complete Order" without selecting customer | Got an `alert('Please select a customer or quick-add one')` | **7** | "Why can't I just sell a book without entering all this?" |
| Entered product → cleared search → want to browse what's available | Only "Popular Products" section shown. No category browsing (the category dropdown filter is there but empty without fetching). | **6** | "Where are my books? I can't scroll through them?" |
| Made order, realized I forgot to add a product → went to Order Details → wants to add item | Must click ⋮ → "Edit Order" → wait for page load → search product → add → save. That's 5+ steps. | **8** | [ABANDONED_TASK] "I just got distracted by a customer, I'll do it later." |
| Accidentally clicked "Clear Cart" → confirmed → entire order gone | No way to recover. All items, customer selection, and payments wiped. | **9** | "I just lost 10 minutes of work because I tapped the wrong button!" |
| Wanted to check today's orders quickly | Order List loads with ALL orders, no "Today" quick filter. Must open filters, pick date range manually. | **5** | "Just show me today's orders, I don't care about last month." |
| Tried to change payment amount mid-order | Can remove payments individually but can't edit an existing payment amount. Must remove and re-add. | **4** | "Why can't I just change the number?" |

---

## 👔 Store Manager — Business Logic

| ID | Priority | Business Issue | Impact |
|----|----------|---------------|--------|
| B-01 | **P0** | **No stock check on POS** — `addToCart()` doesn't check `stock_quantity`. User can sell items with 0 stock. Backend `StockService` doesn't validate negative stock either. | Overselling, customer complaints, inventory chaos. |
| B-02 | **P0** | **POS "completed" orders skip stock deduction** (see I-01). Stock never decreases for in-store sales via the POS. Only `complete()` action deducts, which is for draft→completed transitions. | Inventory reports will be permanently inflated. |
| B-03 | **P1** | **No held/draft orders management UI**. Backend has `drafts()` endpoint but no UI to view, resume, or delete them. Orders held via "Hold" go into a black hole. | Staff holds orders and can never find them again. |
| B-04 | **P1** | **No daily sales summary** on Order List. No totals row, no "Today: X orders, ₹Y revenue" at the top. | Manager can't quickly assess daily performance without exporting data. |
| B-05 | **P2** | **Receipt generation only on `complete()` action**. POS orders created as `completed` don't trigger `Receipt.objects.get_or_create()` — customer doesn't get a receipt. | No receipt for in-store POS sales. |
| B-06 | **P2** | **WhatsApp/Email sharing uses raw `window.open()`** — no tracking of whether receipt was actually sent. No notification history on the order. | Manager can't verify if customer received receipt. |

---

## 🔬 The Scalpel — Code Review

| File:Line | Severity | Trigger Condition | Failure |
|-----------|----------|-------------------|---------|
| [NewOrder.jsx:480](file:///z:/books2/frontend/src/pages/orders/NewOrder.jsx#L480) | **SMELL** | `console.log('Submitting order:', JSON.stringify(...))` left in production code. Serializes entire order payload to console on every submission. | PII leakage in devtools, performance hit on large orders. **Fix:** Remove or gate behind `process.env.NODE_ENV === 'development'`. |
| [NewOrder.jsx:458-462](file:///z:/books2/frontend/src/pages/orders/NewOrder.jsx#L458-L462) | **FRAGILE** | `is_guest: false`, `guest_name: ''`, `guest_phone: ''`, `guest_email: ''` are hardcoded dead fields. Guest checkout was removed, but these are still sent on every order. | Backend processes and stores empty guest fields. Wastes bandwidth and confuses future devs. **Fix:** Remove from payload. |
| [EditOrder.jsx:101](file:///z:/books2/frontend/src/pages/orders/EditOrder.jsx#L101) | **SMELL** | Comment says "Duplicated from NewOrder for now" for search logic. 35 lines of identical debounced search code. | Maintenance nightmare — any fix to NewOrder search must also be applied to EditOrder. **Fix:** Extract to shared `useSearch()` hook. |
| [EditOrder.jsx:197-198](file:///z:/books2/frontend/src/pages/orders/EditOrder.jsx#L197-L198) | **FRAGILE** | Comment says `// or PATCH` for PUT method. Uses PUT but doesn't send `client_updated_at` for the V-01 offline sync protection. | Server's conflict detection (V-01) is never triggered by EditOrder. Stale edits will silently overwrite newer data. **Fix:** Send `client_updated_at: originalOrder.updated_at`. |
| [OrderDetails.jsx:291](file:///z:/books2/frontend/src/pages/orders/OrderDetails.jsx#L291) | **BUG** | `navigator.clipboard.writeText()` called without `await` and no catch. On HTTP (non-HTTPS), this throws `DOMException: Clipboard API requires HTTPS`. | "Copy Receipt Link" silently fails on HTTP dev environments and older browsers. **Fix:** `try/catch` with fallback. |
| [views.py:237](file:///z:/books2/orders/views.py#L237) | **SMELL** | `print(f"Failed to queue message: {e}")` — `print()` instead of `logger.error()`. Lost in stdout, no structured logging. | Silent failures in production. **Fix:** Use `logging.getLogger(__name__).error(...)`. |
| [views.py:96-97](file:///z:/books2/orders/views.py#L96-L97) | **FRAGILE** | `is_completed = instance.order_status == 'completed'` then `old_items = list(instance.items.all())`. This fetches all items eagerly even when the order isn't completed (just returns `[]`). The `if is_completed` guard is after the list(), wasting a query. | N+1 and wasted query on every edit. **Fix:** Move `list()` inside the `if` block. |

---

## 🏆 Priority Summary

### P0 — Must Fix Immediately
1. **I-01 / B-02**: POS orders don't deduct stock (critical inventory bug)
2. **B-05**: POS orders don't generate receipts
3. **I-02**: EditOrder still has dead guest checkout code (data integrity risk)

### P1 — Fix This Sprint
4. **I-03**: EditOrder discount not clamped (allows negative totals)
5. **I-04**: EditOrder has no double-submit protection
6. **B-01**: No stock validation on POS (can sell 0-stock items)  
7. **B-03**: No UI for draft/held orders (held orders are lost)
8. **Scalpel: EditOrder V-01**: Missing `client_updated_at` means stale edit protection is dead

### P2 — Next Sprint
9. Replace all `alert()` with toast notifications
10. Add "Today's Orders" quick filter to OrderList
11. Extract shared hooks from NewOrder/EditOrder
12. Add `formatStatusLabel()` to OrderList
13. Remove dead guest fields from NewOrder payload
14. Fix clipboard API for HTTP fallback
15. Replace `print()` with proper `logging` in views
