# Outlets Module: Risk Analysis Matrix

**Objective:** To quantify the business impact, exploitability, and system degradation caused by the vulnerabilities exposed during the Hellish Simulation.

## Step 1: High-Severity Financial & State Bypass Vulnerabilities

This section details the critical vulnerabilities that allow direct manipulation of financial ledgers or bypass core operational constraints.

| Vulnerability | Component | Exploitability | Business Impact | Risk Level |
| :--- | :--- | :--- | :--- | :--- |
| **Negative Commission Bypass** | `OutletProductCommissionViewSet` | **HIGH** (Raw API POST) | **CATASTROPHIC** - An attacker or malicious user can inject negative commission rates, forcing the business to owe the outlet money on every sale. Direct financial loss. | 🔴 CRITICAL |
| **State Machine Bypass** | `OutletStockTransferViewSet` | **HIGH** (Raw API PATCH) | **SEVERE** - Users can force transfers into 'dispatched' or 'received' statuses without triggering the backend logic. Warehouse stock is not deducted, but the outlet believes they received the items. Inventory loss. | 🔴 CRITICAL |
| **Orphaned Ledger Vulnerability** | `OutletPayment` | **MEDIUM** (Requires Finance Module Access) | **SEVERE** - If a Finance Manager manually deletes a bank transaction, the Outlet's ledger still shows the payment as valid. The Outlet's outstanding balance drops artificially. | 🔴 CRITICAL |
| **Post-Sale Ledger Desync** | `OutletDailySaleItem` | **MEDIUM** (Requires Sale Edit Access) | **HIGH** - Editing a sale quantity post-creation updates the financial debt but fails to deduct the physical stock from the Outlet. Stock levels slowly decouple from reality over time. | 🟠 HIGH |

## Step 2: Concurrency & Race Conditions

This section evaluates vulnerabilities that emerge when multiple users or processes interact with the system simultaneously. These flaws often bypass standard validation checks because the checks occur on stale data before the database transaction commits.

| Vulnerability | Component | Exploitability | Business Impact | Risk Level |
| :--- | :--- | :--- | :--- | :--- |
| **Double-Dispatch Race Condition** | `OutletStockTransfer` | **MEDIUM** (Requires rapid concurrent requests) | **HIGH** - If two administrators click 'Dispatch' simultaneously, or if an API script fires concurrent requests, the system dispatches the transfer twice. The Main Warehouse stock is deducted twice, but the Outlet only receives one shipment. Leads to missing inventory that is incredibly difficult to trace. | 🟠 HIGH |
| **Stale Stock Caching (Frontend)** | `SaleModal.jsx` | **HIGH** (Occurs naturally during normal use) | **MEDIUM** - The frontend modal fetches stock once upon opening. If an operator leaves the screen open, the data stales. While the backend's `select_for_update()` lock prevents actual negative stock, the frontend fails to validate against the live count, resulting in abrupt 500 errors or rejected requests that disrupt the user experience and halt operations. | 🟡 MODERATE |

## Step 3: Structural Performance & UI Failures

This section targets architectural bottlenecks that, while not causing direct financial desyncs, will inevitably result in system crashes, browser freezing, or operational paralysis as the dataset grows.

| Vulnerability | Component | Exploitability | Business Impact | Risk Level |
| :--- | :--- | :--- | :--- | :--- |
| **N+4 Query Trap** | `Outlet` Properties | **GUARANTEED** (Triggered on every list load) | **SEVERE** - The `Outlet` model relies on Python-level iterations over related sets for its financial properties (`total_net_sales`, etc.). Rendering a single page of 100 outlets fires 401 separate SQL queries. As the ledger grows, the API response time will degrade exponentially until the server times out. | 🔴 CRITICAL |
| **Client-Side Pagination Trap** | `OutletsList`, `TransferModal`, `PaymentModal` | **GUARANTEED** (Triggered when data exceeds page 1) | **SEVERE** - The frontend requests data without pagination parameters but filters client-side. The user can only ever access or search the first 20 records returned by the API. 99% of inventory and bank accounts become permanently inaccessible for operations. | 🔴 CRITICAL |
| **The 'N+5' API Barrage** | `OutletDetails.jsx` | **HIGH** (Triggered on every modal close) | **HIGH** - Closing a modal triggers a simultaneous re-fetch of the outlet, all stock, all sales, all payments, and all transfers. Logging a single $10 payment forces the frontend to download the entire history of the outlet, congesting the network and freezing the UI. | 🟠 HIGH |
