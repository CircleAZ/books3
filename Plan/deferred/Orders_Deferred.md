# Orders Module — Deferred / Missing Items

> Items identified in the 6-persona review that are **not included** in the current implementation plan. These should be addressed in future sprints.

## Feature Gaps (Not Bugs)
- [ ] **B-03**: No UI for draft/held orders — backend `drafts()` endpoint exists but no frontend page to view, resume, or delete held orders
- [ ] **B-04**: No daily sales summary on OrderList — no totals row, no "Today: X orders, ₹Y revenue" dashboard widget
- [ ] **B-06**: WhatsApp/Email sharing has no send-tracking — no notification history per order
- [x] **Shopkeeper**: No category browsing for products in POS — only search and "Popular Products"
- [x] **Shopkeeper**: No "Today's Orders" quick-filter preset on OrderList
- [x] **Shopkeeper**: No "Undo" for cart item removal — instant and irreversible
- [x] **B-01**: Stock quantity warning on POS (soft validation only — backend allows negative stock intentionally for reorder tracking)

## Code Quality / Refactoring
- [ ] **Scalpel**: Extract shared hooks from NewOrder/EditOrder — `useSearch()`, `useCart()`, `usePayments()` (NewOrder is 1103-line god component with 52 state variables)
- [ ] **Scalpel**: EditOrder search logic is copy-pasted from NewOrder (line 101 comment says "Duplicated from NewOrder for now")
- [x] **Lens**: OrderList empty state should have "Clear Filters" button and "Create New Order" link
- [x] **Lens**: NewOrder Enter-key submission risk (no `type="button"` on all action buttons)
- [x] Replace all remaining `alert()` calls with proper toast/snackbar system (14 occurrences identified, current sprint addresses the most critical ones)

## Architecture Considerations
- [x] EditOrder `stock_quantity: 9999` hardcoded (line 83) — should fetch actual stock per product
- [ ] Payment editing — can only remove+re-add, not edit amount in-place
- [x] OrderCreateSerializer does not validate product existence gracefully — `Product.objects.get()` will throw 500 if UUID is invalid
