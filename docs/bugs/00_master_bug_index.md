# Master Bug Tracking Index & Triage Dashboard

> **Repository:** CircleAZ / Books3  
> **Classification:** Sovereign Enterprise Invariant & Bug Registry  
> **Status:** Active Operational Registry — Living Documents  
> **Standard:** Poka-Yoke Forensic Verification (Rule 07)  

---

## 1. Executive Summary & Registry Architecture

This directory (`docs/bugs/`) serves as the permanent, single source of truth for all architectural bugs, security vulnerabilities, concurrency race conditions, data reconciliation vectors, and infrastructure failure modes discovered across the Books3 project.

Every logged bug in this registry has been physically verified against the production codebase, with exact line citations, root cause analyses (RCA), and active development tracking logs.

```
docs/bugs/
├── 00_master_bug_index.md                         <-- Master Triage Cockpit (This File)
├── 01_financial_and_ledger_bugs.md               <-- Double-Entry Ledger, Financial Invariants (9 Bugs)
├── 02_concurrency_locking_and_transactions.md     <-- Threading, Row Locks & Transactions (6 Bugs)
├── 03_inventory_procurement_and_stock_bugs.md     <-- AVCO, Packs, Stock Adjustments (7 Bugs)
├── 04_frontend_state_and_react_lifecycle_bugs.md <-- POS Latches, Leaflet Closures, DOM Focus (8 Bugs)
├── 05_security_rbac_and_data_integrity_bugs.md   <-- RBAC Lockout, Maintenance Mode, Scripts (6 Bugs)
├── 06_database_data_reconciliation_crucibles.md  <-- Track 2: Neon DB 5 Data Crucibles (5 Crucibles)
└── 07_infrastructure_cloud_and_deployment_bugs.md <-- Render 512MB RAM, Cloudflare R2 TLS, CNAME (6 Bugs)
```

---

## 2. Global Metric Rollup

| Category File | P0 Critical | P1 High | P2 Medium | P3 Low | Total Items |
|---|:---:|:---:|:---:|:---:|:---:|
| [01. Financial & Ledger Invariants](file:///z:/books3/docs/bugs/01_financial_and_ledger_bugs.md) | 4 | 4 | 1 | 0 | **9** |
| [02. Concurrency, Locking & Transactions](file:///z:/books3/docs/bugs/02_concurrency_locking_and_transactions.md) | 2 | 4 | 0 | 0 | **6** |
| [03. Inventory, Procurement & Stock Invariants](file:///z:/books3/docs/bugs/03_inventory_procurement_and_stock_bugs.md) | 2 | 4 | 1 | 0 | **7** |
| [04. Frontend State & React Lifecycle](file:///z:/books3/docs/bugs/04_frontend_state_and_react_lifecycle_bugs.md) | 2 | 4 | 2 | 1 | **9** |
| [05. Security, RBAC & Data Integrity](file:///z:/books3/docs/bugs/05_security_rbac_and_data_integrity_bugs.md) | 2 | 4 | 0 | 0 | **6** |
| [06. Database Data Reconciliation Crucibles](file:///z:/books3/docs/bugs/06_database_data_reconciliation_crucibles.md) | 3 | 2 | 0 | 0 | **5** |
| [07. Infrastructure, Cloud & Deployment](file:///z:/books3/docs/bugs/07_infrastructure_cloud_and_deployment_bugs.md) | 2 | 4 | 1 | 0 | **7** |
| **TOTALS** | **17** | **26** | **5** | **1** | **49 Items** |

---

## 3. Comprehensive Master Bug Registry

### Category 01: Financial & Ledger Invariants
Detailed Dossiers: [`01_financial_and_ledger_bugs.md`](file:///z:/books3/docs/bugs/01_financial_and_ledger_bugs.md)

| Bug ID | Title | Severity | Status | Affected Files |
|---|---|---|---|---|
| `BUG-FIN-001` | Soft-Delete Double Balance Reversal Cascade | P0 | **RESOLVED / PATCHED** | [`finance/models.py:L481-L521`](file:///z:/books3/finance/models.py#L481-L521) |
| `BUG-FIN-002` | Cash Drawer Transfer Self-Approval Exploit | P0 | **RESOLVED / PATCHED** | [`finance/models.py:L330-L331`](file:///z:/books3/finance/models.py#L330-L331), [`finance/views.py:L1578-L1579`](file:///z:/books3/finance/views.py#L1578-L1579) |
| `BUG-FIN-003` | CashTransfer Double-Approval Concurrency Race | P0 | **RESOLVED / PATCHED** | [`finance/views.py:L1570-L1574`](file:///z:/books3/finance/views.py#L1570-L1574) |
| `BUG-FIN-004` | UPE Loan Repayment Legacy Key Desync (`method` vs `payment_method`) | P1 | **RESOLVED / PATCHED** | [`LoanDetails.jsx:L150-L165`](file:///z:/books3/frontend/src/pages/finance/LoanDetails.jsx#L150-L165) |
| `BUG-FIN-005` | Premature High-Value Outlay ($> \text{₹}5,000$) Without Step-Up Review | P1 | **RESOLVED / RULE-ENFORCED** | [`ExpenseDetails.jsx:L455`](file:///z:/books3/frontend/src/pages/finance/ExpenseDetails.jsx#L455) |
| `BUG-FIN-006` | Trip Attribution Void (Ghost Reimbursement Liabilities) | P1 | **RESOLVED / PATCHED** | [`CreateTrip.jsx:L80-L110`](file:///z:/books3/frontend/src/pages/finance/CreateTrip.jsx#L80-L110) |
| `BUG-FIN-007` | IEEE 754 Floating-Point Dust in Financial KPI Aggregations | P2 | **RESOLVED / PATCHED** | [`FinanceIndex.jsx`](file:///z:/books3/frontend/src/pages/finance/FinanceIndex.jsx), [`reports/views.py`](file:///z:/books3/reports/views.py) |
| `BUG-FIN-008` | Restitution Over-Refund & Over-Return Exploitation | P0 | **RESOLVED / PATCHED** | [`orders/serializers.py:L862-L870`](file:///z:/books3/orders/serializers.py#L862-L870), [`orders/models.py:L974-L987`](file:///z:/books3/orders/models.py#L974-L987) |
| `BUG-FIN-009` | Off-Ledger Non-Sales Revenue Floating Deposits | P1 | **RESOLVED / RULE-ENFORCED** | [`AddOtherIncome.jsx`](file:///z:/books3/frontend/src/pages/finance/AddOtherIncome.jsx), [`finance/models.py`](file:///z:/books3/finance/models.py) |

---

### Category 02: Concurrency, Locking & Transactions
Detailed Dossiers: [`02_concurrency_locking_and_transactions.md`](file:///z:/books3/docs/bugs/02_concurrency_locking_and_transactions.md)

| Bug ID | Title | Severity | Status | Affected Files |
|---|---|---|---|---|
| `BUG-CONC-001` | Table-Level Serialization Lock Contention (`LOCK TABLE`) | P0 | **RESOLVED / PATCHED** | [`Macro_Architecture.md:L85`](file:///z:/books3/docs/architecture/Macro_Architecture.md#L85) |
| `BUG-CONC-002` | Asynchronous Network I/O Premature Execution Inside Atomic Transactions | P0 | **RESOLVED / PATCHED** | [`orders/models.py:L820-L852`](file:///z:/books3/orders/models.py#L820-L852) |
| `BUG-CONC-003` | Neon PgBouncer Server-Side Cursor Incompatibility | P1 | **RESOLVED / PATCHED** | [`azbooks/settings.py:L181`](file:///z:/books3/azbooks/settings.py#L181) |
| `BUG-CONC-004` | Management Script Connection Exhaustion on Pooled Neon Endpoints | P1 | **RESOLVED / PATCHED** | [`azbooks/settings.py:L211-L220`](file:///z:/books3/azbooks/settings.py#L211-L220) |
| `BUG-CONC-005` | Phantom Read Vulnerability Under Postgres Read Committed Isolation | P1 | **RESOLVED / PATCHED** | [`orders/models.py:L822-L832`](file:///z:/books3/orders/models.py#L822-L832) |
| `BUG-CONC-006` | Daemon Thread Connection Leak in Long-Running Background Workers | P1 | **RESOLVED / PATCHED** | [`orders/models.py:L835-L846`](file:///z:/books3/orders/models.py#L835-L846) |

---

### Category 03: Inventory, Procurement & Stock Invariants
Detailed Dossiers: [`03_inventory_procurement_and_stock_bugs.md`](file:///z:/books3/docs/bugs/03_inventory_procurement_and_stock_bugs.md)

| Bug ID | Title | Severity | Status | Affected Files |
|---|---|---|---|---|
| `BUG-INV-001` | SQLite Database Locking & Concurrency Contention in Stock Adjustment | P1 | **RESOLVED / PATCHED** | [`inventory/services.py:L16-L26`](file:///z:/books3/inventory/services.py#L16-L26) |
| `BUG-INV-002` | Negative Stock AVCO Asset Valuation Collapse | P0 | **RESOLVED / PATCHED** | [`inventory/services.py:L106-L124`](file:///z:/books3/inventory/services.py#L106-L124) |
| `BUG-INV-003` | Base-Unit Pack Integer Floor Division Truncation | P2 | **RESOLVED / ARCHITECTED** | [`inventory/models.py:L138-L143`](file:///z:/books3/inventory/models.py#L138-L143) |
| `BUG-INV-004` | Cartesian Product Multiplier in Inventory View Owed Stock Aggregations | P0 | **RESOLVED / PATCHED** | [`inventory/views.py:L196-L245`](file:///z:/books3/inventory/views.py#L196-L245) |
| `BUG-INV-005` | Vendor Pack Multiplier Paradox in Procurement Goods Receipt | P1 | **RESOLVED / PATCHED** | [`procurement/services.py:L75-L93`](file:///z:/books3/procurement/services.py#L75-L93) |
| `BUG-INV-006` | Outlet Consignment Cost Drift & FIFO Commission Desynchronization | P1 | **RESOLVED / PATCHED** | [`outlets/models.py:L162-L218`](file:///z:/books3/outlets/models.py#L162-L218) |
| `BUG-INV-007` | Audit Correction Zero-Cost Asset Dilution Exploit | P1 | **RESOLVED / PATCHED** | [`inventory/services.py:L34-L36`](file:///z:/books3/inventory/services.py#L34-L36) |

---

### Category 04: Frontend State & React Lifecycle Invariants
Detailed Dossiers: [`04_frontend_state_and_react_lifecycle_bugs.md`](file:///z:/books3/docs/bugs/04_frontend_state_and_react_lifecycle_bugs.md)

| Bug ID | Title | Severity | Status | Affected Files |
|---|---|---|---|---|
| `BUG-FE-001` | Asynchronous State Setter Latch Leak on POS Order Submission | P0 | **RESOLVED / PATCHED** | [`frontend/src/pages/orders/NewOrder.jsx:L728-L745`](file:///z:/books3/frontend/src/pages/orders/NewOrder.jsx#L728-L745) |
| `BUG-FE-002` | Native Leaflet Event Stale React Closure Capture | P1 | **RESOLVED / PATCHED** | [`frontend/src/pages/settings/GeographicBoundaries.jsx:L380-L450`](file:///z:/books3/frontend/src/pages/settings/GeographicBoundaries.jsx#L380-L450) |
| `BUG-FE-003` | GIS Coordinate Inversion Flip (`[lat, lng]` $\leftrightarrow$ `[lng, lat]`) | P1 | **RESOLVED / PATCHED** | [`frontend/src/pages/settings/GeographicBoundaries.jsx:L399`](file:///z:/books3/frontend/src/pages/settings/GeographicBoundaries.jsx#L399) |
| `BUG-FE-004` | Empty String Foreign Key Payload Trap (`""` vs `null`) on DRF Deserialization | P1 | **RESOLVED / PATCHED** | [`frontend/src/utils/payloadSanitizer.js:L24-L35`](file:///z:/books3/frontend/src/utils/payloadSanitizer.js#L24-L35) |
| `BUG-FE-005` | DOM Focus Dropping on High-Speed Keyboard Accounting Entry | P2 | **RESOLVED / PATCHED** | [`frontend/src/pages/finance/LegacyDebtEntry.jsx:L79-L83`](file:///z:/books3/frontend/src/pages/finance/LegacyDebtEntry.jsx#L79-L83) |
| `BUG-FE-006` | Browser Tab Heap Bloat via Unrevoked Blob URL Retention in File Exports | P2 | **RESOLVED / PATCHED** | [`frontend/src/pages/reports/DataExport.jsx:L47-L55`](file:///z:/books3/frontend/src/pages/reports/DataExport.jsx#L47-L55) |
| `BUG-FE-007` | UPE Key Mismatch (`payment_method` vs `method`) on Legacy Financial Endpoints | P1 | **RESOLVED / PATCHED** | [`frontend/src/pages/finance/LoanDetails.jsx:L85-L87`](file:///z:/books3/frontend/src/pages/finance/LoanDetails.jsx#L85-L87) |
| `BUG-FE-008` | Lexicographical Sort Inversion in Academic Class Trees | P3 | **RESOLVED / PATCHED** | [`frontend/src/pages/settings/ManageClasses.jsx:L99`](file:///z:/books3/frontend/src/pages/settings/ManageClasses.jsx#L99) |
| `BUG-FE-009` | Unmemoized Hook Options Causing Infinite React Re-Render & Abort Loop in `useServerList` | P0 | **RESOLVED / PATCHED** | [`frontend/src/hooks/useServerList.js:L38-L134`](file:///z:/books3/frontend/src/hooks/useServerList.js#L38-L134), [`frontend/src/pages/orders/OrderList.jsx:L7-L35`](file:///z:/books3/frontend/src/pages/orders/OrderList.jsx#L7-L35) |

---

### Category 05: Security, RBAC & Data Integrity Invariants
Detailed Dossiers: [`05_security_rbac_and_data_integrity_bugs.md`](file:///z:/books3/docs/bugs/05_security_rbac_and_data_integrity_bugs.md)

| Bug ID | Title | Severity | Status | Affected Files |
|---|---|---|---|---|
| `BUG-SEC-001` | Administrative Self-Lockout Vulnerability in System Roles | P1 | **RESOLVED / PATCHED** | [`frontend/src/pages/settings/RolesPermissions.jsx:L84`](file:///z:/books3/frontend/src/pages/settings/RolesPermissions.jsx#L84) |
| `BUG-SEC-002` | Destructive Database Restoration Without Maintenance Mode Gate | P0 | **RESOLVED / PATCHED** | [`frontend/src/pages/settings/DataManagement.jsx:L65-L68`](file:///z:/books3/frontend/src/pages/settings/DataManagement.jsx#L65-L68) |
| `BUG-SEC-003` | Dangling Location Tag Deletion Corrupting Customer Addresses | P1 | **RESOLVED / PATCHED** | [`frontend/src/pages/settings/ManageTags.jsx:L120-L126`](file:///z:/books3/frontend/src/pages/settings/ManageTags.jsx#L120-L126), [`customers/views.py:L1410-L1419`](file:///z:/books3/customers/views.py#L1410-L1419) |
| `BUG-SEC-004` | Hardcoded Cross-Workspace Path Injection in CLI Utility Scripts | P1 | **OPEN / ACTION REQUIRED** | [`scripts/reverse_ghost_refund.py:L5`](file:///z:/books3/scripts/reverse_ghost_refund.py#L5) |
| `BUG-SEC-005` | Direct Off-Ledger Wallet Balance Mutation in Remediation Scripts | P0 | **OPEN / AUDIT ACTIVE** | [`scripts/reverse_ghost_refund.py:L20-L27`](file:///z:/books3/scripts/reverse_ghost_refund.py#L20-L27) |
| `BUG-SEC-006` | Orphaned Outlet Financial Inflows Missing Ledger Postings | P1 | **RESOLVED / SCRIPTED** | [`scripts/fix_orphaned_payments.py:L15-L35`](file:///z:/books3/scripts/fix_orphaned_payments.py#L15-L35) |

---

### Category 06: Database Data Reconciliation Crucibles (Track 2)
Detailed Dossiers: [`06_database_data_reconciliation_crucibles.md`](file:///z:/books3/docs/bugs/06_database_data_reconciliation_crucibles.md)

| Crucible ID | Vector / Subsystem | Severity | Status | Target Scope |
|---|---|---|---|---|
| `CRUC-001` | 46 Products with Negative Stock Quantities | P0 | **AUDIT READY / PENDING REPAIR** | 46 `Product` rows in Neon DB |
| `CRUC-002` | 34 Delivered Unsettled Ghost Orders | P0 | **AUDIT READY / PENDING REPAIR** | 34 `Order` rows in Neon DB |
| `CRUC-003` | 25 Ghost Fee Orders with Ad-Hoc Charges | P1 | **AUDIT READY / PENDING REPAIR** | 25 `Order` rows in Neon DB |
| `CRUC-004` | Axis Bank Statement CSV Drift (`921010029562089.csv`) | P0 | **AUDIT READY / PENDING REPAIR** | Axis Bank Account (`...2089`) |
| `CRUC-005` | Legacy Debt Isolation into Segregated Audit Sub-Ledger | P1 | **IN PROGRESS / UI DEPLOYED** | Customer Legacy Debts |

---

### Category 07: Infrastructure, Cloud & Deployment Invariants
Detailed Dossiers: [`07_infrastructure_cloud_and_deployment_bugs.md`](file:///z:/books3/docs/bugs/07_infrastructure_cloud_and_deployment_bugs.md)

| Bug ID | Title | Severity | Status | Affected Files |
|---|---|---|---|---|
| `BUG-INF-001` | Render 512MB RAM Exhaustion & Container OOM Termination | P0 | **RESOLVED / PATCHED** | [`Dockerfile:L36`](file:///z:/books3/Dockerfile#L36) |
| `BUG-INF-002` | Cloudflare R2 Multi-Subdomain SNI TLS Certificate Failure | P0 | **RESOLVED / PATCHED** | [`azbooks/settings.py:L300-L322`](file:///z:/books3/azbooks/settings.py#L300-L322) |
| `BUG-INF-003` | `S3Boto3Storage` `media/` Location Prefix Path Divergence | P1 | **RESOLVED / ARCHITECTED** | [`azbooks/custom_storages.py:L4`](file:///z:/books3/azbooks/custom_storages.py#L4) |
| `BUG-INF-004` | Cloudflare Pages vs Render CNAME Domain Name Collision | P1 | **RESOLVED / CONFIGURED** | [`render.yaml:L22-L27`](file:///z:/books3/render.yaml#L22-L27) |
| `BUG-INF-005` | Render Ephemeral Deploy Secret Rotation Invalidating Active JWTs | P1 | **RESOLVED / ENFORCED** | [`render.yaml:L18-L19`](file:///z:/books3/render.yaml#L18-L19) |
| `BUG-INF-006` | Container Boot R2 Media Hydration Race Condition | P2 | **RESOLVED / PATCHED** | [`docker-entrypoint.sh:L10-L11`](file:///z:/books3/docker-entrypoint.sh#L10-L11) |
| `BUG-INF-007` | Cloudflare Pages Build Pipeline Stall & Node Runtime Version Mismatch | P1 | **RESOLVED / PATCHED** | [`.node-version`](file:///z:/books3/.node-version), [`frontend/.node-version`](file:///z:/books3/frontend/.node-version) |

---

## 4. Standard Operating Procedure (SOP) for Logging & Updating Bugs

To preserve the absolute mathematical integrity of this registry, all updates must strictly adhere to the following 5-step operational protocol:

### Step 1: Physical Verification (No Ghost Bugs)
Before drafting or updating any entry:
1. Locate and inspect the exact file and lines referenced.
2. Confirm the exact failure condition or proof of patch.
3. If logging a database anomaly, run the deterministic SQL query and record the row count.

### Step 2: Assign Canonical Bug ID
- Use domain prefixes:
  - `BUG-FIN-###` (Finance, Ledger, Invoicing, Taxes)
  - `BUG-CONC-###` (Locks, Transactions, Celery, Threading)
  - `BUG-INV-###` (Stock, Warehousing, Packs, Procurement)
  - `BUG-FE-###` (React, State, Leaflet, DOM, Caching)
  - `BUG-SEC-###` (RBAC, Authentication, Data Integrity, Scripts)
  - `CRUC-###` (Track 2 Neon Database Data Reconciliation)
  - `BUG-INF-###` (Docker, Cloudflare, Render, R2, DNS)

### Step 3: Populate the Dossier Template
Every dossier entry MUST provide:
- **Severity**: P0 (Critical - Data Loss / Financial Distortion), P1 (High - Workflow Breaking / Security), P2 (Medium - Performance / Memory / Usability), P3 (Low - Cosmetic / Sorting).
- **Status Badge**: `RESOLVED / PATCHED`, `OPEN / ACTION REQUIRED`, `AUDIT READY / PENDING REPAIR`, `IN PROGRESS / UI DEPLOYED`.
- **Affected File(s)**: Full markdown file links with line ranges.
- **Mechanism & Root Cause (RCA)**: Deep technical explanation of the failure mode.
- **Verification Evidence**: Verifiable code snippet extracted directly from the file.
- **Active Developments**: Real-time status update, regression tests, and invariants to uphold.

### Step 4: Update the Master Index
Add the new bug or update the status badge in both the category file and this master index (`00_master_bug_index.md`).

### Step 5: Atomic Git Commit
Commit the bug updates alongside the relevant code fixes in a single atomic commit:
```bash
git add docs/bugs/ <relevant_code_files>
git commit -m "fix(<domain>): resolve BUG-XYZ-001 and update bug registry"
```
