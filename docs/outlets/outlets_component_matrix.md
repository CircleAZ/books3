# Outlets Module: Component Architecture Matrix

**Objective:** A granular breakdown of every Frontend and Backend component governing the B2B Consignment system. This matrix defines the exact surface area we need to audit, harden, and stress-test.

## 1. Backend Architecture (Django / Django Rest Framework)

**Location:** `z:\books2\outlets\`
**Owner:** Murphy (Systems Architect)

### 1.1 Core Data Models (`models.py`)
*   **`Outlet`**: The physical B2B location entity. Tracks name, contact info, and aggregate financials.
    *   **🔴 VULNERABILITY (N+4 Query Trap):** The financial properties (`total_net_sales`, `total_paid`, `total_commission`, `outstanding_balance`) iterate over `self.sales.all()` and `self.payments.all()` in Python memory. Rendering 100 outlets triggers 401 individual SQL queries, strangling the database connection pool.
    *   **🟢 THE FIX:** Refactor the `Outlet` model/serializer. Remove Python-level `sum()` iterations. Implement a custom `OutletManager` that overrides `get_queryset()` to append `.annotate(total_net=Sum('sales__net_total'), total_paid=Sum('payments__amount'))`. The Serializer must read from these annotations directly.
*   **`OutletProductCommission`**: Overrides the default product commission rate for a specific outlet.
*   **`OutletStock`**: The live, physical ledger of inventory currently residing at the consignment location. Uses a `CheckConstraint` to prevent negative values.

### 1.2 Logistics & Transfer Models (`models.py`)
*   **`OutletStockTransfer` & `Item`**: Moves stock from the Main Warehouse to the Outlet.
    *   **🔴 VULNERABILITY (Double-Dispatch Race Condition):** The `dispatch()` method checks `self.status != self.Status.DRAFT` but lacks a row-level lock. Concurrent dispatch requests can bypass the check, resulting in multiple deductions from the Main Warehouse.
    *   **🟢 THE FIX:** Wrap the status check inside a `transaction.atomic()` block and fetch the transfer using `select_for_update()`.
    *   **🔴 VULNERABILITY (Post-Dispatch Ledger Desync):** `OutletStockTransferItem` does not override `save()`. An item's quantity can be modified *after* the transfer is dispatched, breaking the physical `OutletStock` ledger from the document's reality.
    *   **🟢 THE FIX:** Override `save()` in `OutletStockTransferItem` and `OutletStockReturnItem` to raise a `ValueError` if the parent transfer/return is not in the `DRAFT` status.
*   **`OutletStockReturn` & `Item`**: Returns unsold or damaged stock back to the Main Warehouse. Features AVCO protection via `frozen_cost_price` injection.

### 1.3 Financial Models (`models.py`)
*   **`OutletDailySale` & `Item`**: Captures sales made by the Outlet. Deducts from `OutletStock`, freezes temporal unit pricing, and calculates commission cuts.
    *   **🔴 VULNERABILITY (Post-Sale Ledger Desync):** The `save()` method in `OutletDailySaleItem` only deducts stock `if is_new`. If a sale item's quantity is edited later, the financial totals update but the physical stock does not adjust, causing a desync.
    *   **🟢 THE FIX:** Override `__init__` to cache the original quantity. During `save()`, if not new, calculate the delta (`new_qty - old_qty`) and apply the difference to `OutletStock` via a `select_for_update()` lock.
*   **`OutletPayment`**: Money collected from the Outlet. Hard-linked to `finance.BankTransaction` or `finance.CashWalletTransaction`.
    *   **🔴 VULNERABILITY (Orphaned Ledger Vulnerability):** Deleting the hard-linked `BankTransaction` manually from the Finance module leaves the `OutletPayment` intact, meaning the Outlet is still credited for a payment that no longer exists in the bank.
    *   **🟢 THE FIX:** Implement a `post_delete` signal on `BankTransaction` and `CashWalletTransaction` that cascadingly soft-deletes any associated `OutletPayment` to guarantee ledger parity.

### 1.4 API Layer (`views.py` & `serializers.py`)
*   **`OutletProductCommissionViewSet`**: Handles CRUD for per-product commission overrides.
    *   **🔴 VULNERABILITY (Negative Commission Bypass):** The `bulk_upsert` action uses raw `request.data` directly in `update_or_create`, bypassing all DRF validation. An attacker can inject a negative commission percentage (e.g., `-50%`). This forces the system to add money to the `net_total`, effectively making the business owe the outlet for selling a product.
    *   **🟢 THE FIX:** Incoming `bulk_upsert` data must be passed through `OutletProductCommissionSerializer(many=True)` and explicitly validated (`is_valid()`) before touching the database.
*   **`OutletStockTransferViewSet` & `OutletStockReturnViewSet`**: Exposes the `dispatch` and `receive` action endpoints.
    *   **🔴 VULNERABILITY (State Machine Bypass):** The DRF Serializers do not mark the `status` field as `read_only`. An attacker can simply send a `PATCH /api/outlets/transfers/1/` with `{"status": "dispatched"}`. This changes the status instantly, entirely bypassing the backend `dispatch()` logic and preventing stock deduction.
    *   **🟢 THE FIX:** Add `'status'` to `read_only_fields` in all relevant serializers (`OutletStockTransferSerializer`, `OutletStockReturnSerializer`). Status transitions must exclusively occur through the `@action` endpoints.
*   **`OutletDailySaleViewSet`**: Handles the creation of daily sales reports.
*   **`OutletPaymentViewSet`**: Processes incoming payments and triggers the cross-app finance ledger updates.

---

## 2. Frontend Architecture (React / Vite)

**Location:** `z:\books2\frontend\src\pages\outlets\`
**Owner:** Jasper (React Engineer)

### 2.1 Core Views
*   **`OutletsList.jsx`**: The primary dashboard for viewing all consignment locations.
    *   **🔴 VULNERABILITY (Unbounded Data Fetching / Pagination Trap):** The frontend requests `ENDPOINTS.OUTLETS` without query parameters. If the backend paginates, the UI only renders page 1 (the first 10-20 outlets) and offers no pagination controls to see the rest. If the backend does not paginate, rendering 5,000 outlets simultaneously will crash the browser.
    *   **🟢 THE FIX:** Implement the standard `<Pagination />` component and pass `?page=N` query parameters to the fetch call.
*   **`OutletDetails.jsx`**: The deep-dive view for a specific outlet. Renders the live stock table, transfer history, sales ledger, and payment records.
    *   **🔴 VULNERABILITY (The 'N+5' API Barrage):** Every time a modal (Sale, Transfer, Payment) closes, `fetchOutletData()` fires `Promise.all()` to reload the outlet, stock, sales, payments, and transfers simultaneously. Logging a single payment triggers 5 unnecessary API calls. Furthermore, the sales, payments, and transfers tabs suffer from the exact same Pagination Trap as `OutletsList.jsx`.
    *   **🟢 THE FIX:** Decouple the tab fetching. Only fetch `sales` data when the `sales` tab is active. Implement `<Pagination />` across all tabs. Refetch only the necessary aggregate data when a modal closes.
*   **`AddOutlet.jsx`**: The form component for onboarding a new consignment location.

### 2.2 Operational Modals (The Danger Zones)
These are the interaction points where race conditions and temporal bugs are triggered by the end-user:
*   **`TransferModal.jsx`**: UI for drafting and dispatching stock to the outlet.
    *   **🔴 VULNERABILITY (Client-Side Search / Pagination Trap):** It fetches `INVENTORY_PRODUCTS` without pagination limits. If the API paginates to 20, it only holds 20 products in memory. The search bar filters *client-side* against those 20 products, making the rest of the warehouse inventory permanently inaccessible to the user.
    *   **🟢 THE FIX:** Implement an async debounced search that passes `?search=term` directly to the DRF backend endpoint.
*   **`SaleModal.jsx`**: UI for reporting daily sales.
    *   **🔴 VULNERABILITY (Stale Stock Caching):** `fetchOutletStock()` runs once when the modal opens. If left open, the stock array stales. The frontend's quantity validator checks against this stale array instead of a live backend check, leading to unhandled 500 errors or rejected requests if someone else sells the same stock.
    *   **🟢 THE FIX:** Move the `quantity <= available` check to the backend API (`OutletDailySaleSerializer`). The frontend should gracefully handle and display the 400 Bad Request error if stock is insufficient.
*   **`PaymentModal.jsx`**: UI for collecting money from the outlet.
    *   **🔴 VULNERABILITY (Hidden Financial Accounts):** Similar to the Transfer Modal, it loads `BankAccounts` and `CashWallets` without paginating. Any finance accounts beyond the first page are hidden from the user, making it impossible to log payments to them.
    *   **🟢 THE FIX:** Implement a paginated, search-enabled async dropdown (e.g., `react-select` with Async loading) for destination accounts.
