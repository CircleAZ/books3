# Active Bug Tracking: Database Data Reconciliation Crucibles (Track 2)

> **Domain:** Production Database Reconciliation & Neon PostgreSQL 18.6 Forensic Recovery  
> **Classification:** Negative Stock, Ghost Orders, Bank Drift, Legacy Debt & Referential Integrity  
> **Target Database:** Neon PostgreSQL (`ep-raspy-lake-b39hlekz`)  
> **Status Registry:** Living Document — Active Operational Tracking  

---

## 1. Category Summary & Health Metrics

The Data Reconciliation Crucibles represent the five high-priority historical database drift vectors inherited from the legacy Books2 architecture and initial data migration. While the Books3 application code enforces strict invariants, existing dirty rows in the live PostgreSQL database must be surgically audited, isolated, and remediated under the **6-Stage Forensic Data Repair Gate (Rule 07)**.

| Crucible ID | Vector / Subsystem | Severity | Status | Target Scope |
|---|---|---|---|---|
| **`CRUC-001`** | 46 Products with Negative Stock Quantities | **CRITICAL** | **AUDIT READY / PENDING REPAIR** | 46 `Product` rows in Neon DB |
| **`CRUC-002`** | 34 Delivered Unsettled Ghost Orders | **CRITICAL** | **AUDIT READY / PENDING REPAIR** | 34 `Order` rows in Neon DB |
| **`CRUC-003`** | 25 Ghost Fee Orders with Ad-Hoc Charges | **HIGH** | **AUDIT READY / PENDING REPAIR** | 25 `Order` rows in Neon DB |
| **`CRUC-004`** | Axis Bank Statement CSV Drift (`921010029562089.csv`) | **CRITICAL** | **AUDIT READY / PENDING REPAIR** | Axis Bank Account (`...2089`) |
| **`CRUC-005`** | Legacy Debt Isolation into Segregated Audit Sub-Ledger | **HIGH** | **IN PROGRESS / UI DEPLOYED** | Customer Legacy Debts |

---

## 2. Granular Crucible Dossiers

### `CRUC-001`: 46 Products with Negative Stock Quantities
- **Severity:** Critical (P0)
- **Status:** **AUDIT READY / PENDING REPAIR**
- **Affected Table:** `inventory_product` (PostgreSQL / SQLite)
- **1. Forensic Problem Statement:**
  46 distinct product rows exist with `stock_quantity < 0` or `physical_stock < 0`. This causes distorted inventory valuation on the balance sheet, triggers division-by-zero or negative-cost anomalies in naive AVCO calculations, and causes warehouse inventory stocktake discrepancies.
- **2. Deterministic SQL Audit Query:**
  ```sql
  SELECT 
      id, 
      display_id, 
      name, 
      stock_quantity, 
      physical_stock, 
      cost_price, 
      selling_price
  FROM inventory_product
  WHERE stock_quantity < 0 OR physical_stock < 0
  ORDER BY stock_quantity ASC;
  ```
- **3. Root Cause Analysis (RCA):**
  Legacy POS terminals permitted cashiers to confirm and dispatch sales for items that had physically arrived on the shop floor but had not yet been formally booked in as Purchase Orders / Goods Received Notes (GRN).
- **4. Surgical Repair Specification:**
  - Execute a physical stock count audit for the 46 products.
  - Apply corrections using `StockService.adjust_stock(reason='audit_correction', target_ledger='both')`.
  - Mandate non-null `unit_cost` basis to establish proper asset valuation and prevent zero-cost dilution (`BUG-INV-007`).
- **5. Ledger Immutability Proof:**
  Creates audit rows in `inventory_stockadjustment` and `inventory_stockhistory`, retaining full traceability without direct unlogged SQL updates.

---

### `CRUC-002`: 34 Delivered Unsettled Ghost Orders
- **Severity:** Critical (P0)
- **Status:** **AUDIT READY / PENDING REPAIR**
- **Affected Table:** `orders_order`
- **1. Forensic Problem Statement:**
  34 order records in the live database have an `order_status = 'delivered'`, but `payment_status != 'paid'` and `amount_paid < total_amount`. These orders represent uncollected revenue or delivered goods without corresponding payment records, inflating Accounts Receivable indefinitely.
- **2. Deterministic SQL Audit Query:**
  ```sql
  SELECT 
      id, 
      display_id, 
      customer_id, 
      total_amount, 
      amount_paid, 
      (total_amount - amount_paid) AS outstanding_balance,
      order_status, 
      payment_status,
      created_at
  FROM orders_order
  WHERE order_status = 'delivered' 
    AND payment_status IN ('pending', 'partial')
    AND is_deleted = FALSE
  ORDER BY outstanding_balance DESC;
  ```
- **3. Root Cause Analysis (RCA):**
  Orders delivered via field couriers were updated to `delivered` in the logistics module, but cash collected on delivery was either handed over off-system or logged into legacy notebooks without recording an `OrderPayment` in the POS.
- **4. Surgical Repair Specification:**
  - Match each order against delivery run-sheets and historical cash receipts.
  - If cash was collected: generate `OrderPayment` via `LedgerService.process_deposit()` into the assigned cashier's `CashWallet`.
  - If credit was approved: formally bind outstanding balance to customer credit terms with an audit note.
  - If delivery failed or order was abandoned: execute `Order.cancel()` with return items to restore physical stock.
- **5. Ledger Immutability Proof:**
  Eliminates floating receivables and synchronizes order status with double-entry cash/bank ledgers.

---

### `CRUC-003`: 25 Ghost Fee Orders with Ad-Hoc Charges
- **Severity:** High (P1)
- **Status:** **AUDIT READY / PENDING REPAIR**
- **Affected Table:** `orders_order`, `orders_orderitem`
- **1. Forensic Problem Statement:**
  25 historical orders have custom fee charges (shipping, urgent delivery, or special packaging) stored as ad-hoc modifications to `total_amount` rather than registered fee lines or linked `DeliveryFee` records, creating accounting variance between `subtotal + fees - discounts` and `total_amount`.
- **2. Deterministic SQL Audit Query:**
  ```sql
  SELECT 
      id, 
      display_id, 
      subtotal, 
      total_amount, 
      discount_value, 
      delivery_fee,
      (subtotal + COALESCE(delivery_fee, 0) - COALESCE(discount_amount, 0) - total_amount) AS calculation_drift
  FROM orders_order
  WHERE ABS(subtotal + COALESCE(delivery_fee, 0) - COALESCE(discount_amount, 0) - total_amount) > 0.01
    AND is_deleted = FALSE;
  ```
- **3. Root Cause Analysis (RCA):**
  Legacy checkout allowed arbitrary price overrides without itemizing whether the override was a line discount, overall order discount, or delivery surcharge.
- **4. Surgical Repair Specification:**
  - Re-itemize each of the 25 orders to allocate drift into formal `delivery_fee` or `discount_amount` fields.
  - Recalculate order totals and ensure tax line breakdowns reconcile to the paisa.
- **5. Ledger Immutability Proof:**
  Guarantees $\text{Total Amount} \equiv \text{Subtotal} + \text{Delivery Fee} - \text{Discounts}$ across 100% of historical rows.

---

### `CRUC-004`: Axis Bank Statement CSV Drift (`921010029562089.csv`)
- **Severity:** Critical (P0)
- **Status:** **AUDIT READY / PENDING REPAIR**
- **Affected File / Table:** `921010029562089.csv` / `finance_banktransaction`, `finance_bankaccount`
- **1. Forensic Problem Statement:**
  The closing balance in `finance_bankaccount` for the primary Axis Bank account (`...2089`) diverges from the audited statement balance extracted from `921010029562089.csv`. Unreconciled transactions distort cash flow statements and tax returns.
- **2. Deterministic SQL Audit Query:**
  ```sql
  SELECT 
      b.id, 
      b.account_number, 
      b.current_balance, 
      COALESCE(SUM(CASE WHEN t.transaction_type IN ('deposit', 'transfer_in') THEN t.amount ELSE -t.amount END), 0) AS ledger_sum,
      (b.current_balance - COALESCE(SUM(CASE WHEN t.transaction_type IN ('deposit', 'transfer_in') THEN t.amount ELSE -t.amount END), 0)) AS balance_delta
  FROM finance_bankaccount b
  LEFT JOIN finance_banktransaction t ON b.id = t.account_id AND t.is_deleted = FALSE
  WHERE b.account_number LIKE '%2089%'
  GROUP BY b.id, b.account_number, b.current_balance;
  ```
- **3. Root Cause Analysis (RCA):**
  Bank charges (SMS alert charges, GST on charges), interest credits, and POS gateway auto-settlement fees were never entered into Books3. Additionally, certain direct vendor payments made via net banking were not entered into procurement.
- **4. Surgical Repair Specification:**
  - Ingest `921010029562089.csv` via automated bank reconciliation parser.
  - Automatically match transactions by UTR / Reference ID and transaction date.
  - Generate missing `BankTransaction` entries for bank fees (Expense: "Bank Charges") and interest credits (Income: "Interest Received") through `LedgerService`.
- **5. Ledger Immutability Proof:**
  System bank balance will mathematically equal the verified bank statement closing balance to 2 decimal places.

---

### `CRUC-005`: Legacy Debt Isolation into Segregated Audit Sub-Ledger
- **Severity:** High (P1)
- **Status:** **IN PROGRESS / UI DEPLOYED**
- **Affected Tables:** `customers_customer`, `finance_legacydebt`
- **1. Forensic Problem Statement:**
  Historical credit balances from customers carried over from Books2 were initially lumped into standard trade receivables. Mixing multi-year delinquent debt with active, healthy revolving customer accounts obscured current collection rates and inflated current-year receivable aging.
- **2. Deterministic SQL Audit Query:**
  ```sql
  SELECT 
      c.id, 
      c.full_name, 
      c.phone, 
      COALESCE(c.legacy_debt_balance, 0) AS legacy_debt,
      COALESCE(c.wallet_balance, 0) AS active_wallet
  FROM customers_customer c
  WHERE c.legacy_debt_balance > 0 OR c.has_legacy_debt = TRUE
  ORDER BY c.legacy_debt_balance DESC;
  ```
- **3. Root Cause Analysis (RCA):**
  Books2 did not maintain a separate sub-ledger for legacy bad debts versus active customer wallet balances.
- **4. Surgical Repair Specification:**
  - Materialize dedicated `finance_legacydebt` sub-ledger.
  - Deploy rapid data recovery cockpit (`LegacyDebtEntry.jsx`, `LegacyDebtDashboard.jsx`).
  - Route recovered debt payments directly into the legacy recovery revenue account rather than mixing them with new order sales.
- **5. Ledger Immutability Proof:**
  Active accounts receivable accurately reflects current business operations, while historical legacy recovery is isolated with its own circular collection rate gauge and KPI metrics.
