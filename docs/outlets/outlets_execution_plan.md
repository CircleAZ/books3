# Outlets Remediation: Execution Plan

**Objective:** Systematically eradicate all vulnerabilities identified in the Risk Analysis (`outlets_risk_analysis.md`) and Component Matrix (`outlets_component_matrix.md`), validated by the Stress Test Log (`outlets_stress_test_log.md`).

## Phase 1: API Security & Financial Integrity
**Focus:** Stopping the bleeding. Fix the endpoints that allow direct capital extraction and state machine bypassing.
**Engineer:** Murphy (Backend)

1.  **Patch Negative Commission Bypass (`outlets/views.py`)**
    *   **Action:** Refactor `OutletProductCommissionViewSet.bulk_upsert`.
    *   **Detail:** Instead of raw `update_or_create`, pass `request.data` through `OutletProductCommissionSerializer(many=True)`. Call `is_valid(raise_exception=True)` to enforce `DecimalField` validation, then manually perform the atomic `update_or_create` loop using the `validated_data`.
2.  **Patch State Machine Bypass (`outlets/serializers.py`)**
    *   **Action:** Update `OutletStockTransferSerializer` and `OutletStockReturnSerializer`.
    *   **Detail:** Add `'status'` to the `read_only_fields` tuple in both serializers. This guarantees status can only be mutated via the dedicated `dispatch_transfer` and `receive_return` action endpoints.
3.  **Patch Orphaned Ledger Vulnerability (`outlets/models.py` & `finance/models.py`)**
    *   **Action:** Implement cascading safety nets.
    *   **Detail:** Create a `post_delete` signal handler for `BankTransaction` and `CashWalletTransaction` that checks for a related `OutletPayment` and deletes it (or zeroes it out with a note) to ensure ledger parity.

## Phase 2: Race Conditions & State Integrity
**Focus:** Enforcing strict locking and preventing temporal desyncs.
**Engineer:** Murphy (Backend)

1.  **Fix Double-Dispatch Race Condition (`outlets/models.py`)**
    *   **Action:** Harden `OutletStockTransfer.dispatch()`.
    *   **Detail:** Wrap the method in `transaction.atomic()`. Use `OutletStockTransfer.objects.select_for_update().get(id=self.id)` to acquire a row lock *before* checking `if self.status != self.Status.DRAFT`.
2.  **Fix Post-Dispatch Ledger Desync (`outlets/models.py`)**
    *   **Action:** Override `save()` on `OutletStockTransferItem`.
    *   **Detail:** If `self.transfer.status != 'draft'`, raise a `ValueError("Cannot modify items of a dispatched transfer.")`. Apply identical logic to `OutletStockReturnItem`.
3.  **Fix Post-Sale Ledger Desync (`outlets/models.py`)**
    *   **Action:** Override `__init__` and `save()` on `OutletDailySaleItem`.
    *   **Detail:** Cache the original quantity in `__init__`. In `save()`, if not `is_new`, calculate the delta. Deduct the delta from `OutletStock` using a `select_for_update()` lock.

## Phase 3: Structural Backend Performance
**Focus:** Eliminating the N+4 Query Trap before it crashes the server.
**Engineer:** Murphy (Backend)

1.  **Refactor Outlet Financial Properties (`outlets/models.py` & `outlets/views.py`)**
    *   **Action:** Replace Python-level iteration with DB-level aggregation.
    *   **Detail:** Create an `OutletManager` with a `with_financials()` method. Use `.annotate(Sum('sales__gross_total'))`, etc., to calculate totals natively in PostgreSQL. Update `OutletSerializer` to read these annotated fields instead of calling the expensive `@property` methods.

## Phase 4: Frontend Re-Architecture
**Focus:** Fixing Pagination Traps and API Barrages.
**Engineer:** Jasper (Frontend)

1.  **Eliminate the 'N+5' API Barrage (`OutletDetails.jsx`)**
    *   **Action:** Decouple tab rendering and fetching.
    *   **Detail:** Move the Stock, Sales, Payments, and Transfers tables into their own sub-components. Have them fetch their own data *only* when their specific tab is active. When a modal closes, only `fetchOutlet()` (the metadata) should trigger, not the entire ledger history.
2.  **Fix Client-Side Pagination Traps (`TransferModal.jsx`, `PaymentModal.jsx`, `OutletsList.jsx`)**
    *   **Action:** Replace static fetching with async search components.
    *   **Detail:** Use a library like `react-select/async` or implement debounced search that passes `?search=term` to the backend for `INVENTORY_PRODUCTS` and Finance Accounts. Implement standard `<Pagination />` on `OutletsList.jsx`.
3.  **Fix Stale Stock Caching (`SaleModal.jsx`)**
    *   **Action:** Defer validation to the backend.
    *   **Detail:** Remove frontend hard-blocks on quantity vs available stock. Submit the payload, and gracefully catch the 400 Bad Request error returned by the backend's strict locks, displaying the specific "Insufficient Stock" message to the user.
