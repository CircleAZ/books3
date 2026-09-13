# Books3 Project Blueprint & Technical Specification

**Status**: `[APPROVED_FOR_EXECUTION]`  
**Target Repository**: `Z:\books3`  
**Sovereign Environment**: 2026–2027 Production Operating Session  
**Database Cluster**: Neon PostgreSQL 18.6 (`ep-raspy-lake-b39hlekz`, AWS Singapore `ap-southeast-1`)  
**Sovereign Edge**: Cloudflare Global Edge (`circleaz.in`, `books3.circleaz.in`, `api3.circleaz.in`, `media3.circleaz.in`)  
**Compute Host**: Render Free-Tier Container (`books3-mo5o.onrender.com`, 512MB RAM Ceiling)  

---

## 1. Project Architecture Summary

Books3 is an enterprise ERP, POS, inventory distribution, and double-entry financial ledger platform architected specifically for multi-channel schoolbook publishing, wholesale distribution, and retail consignment networks.

Books3 establishes a **Total Sovereignty Clean-Break** from the legacy Books2 codebase. Legacy `books2` remains a frozen, immutable archive of the 2025–2026 operating session. Books3 is the sole production platform for the 2026–2027 operating cycle, backed by 40,625 hydrated rows across 95 materialized models in Neon PostgreSQL 18.6, 367 verified media assets in Cloudflare R2, an adaptive version-aware Cloudflare Worker API gateway, and a single-page React 18 PWA on Cloudflare Pages.

### Sovereign Cloud Topology Overview

```
                               ┌─────────────────────────────────────────────────────────────┐
                               │                Cloudflare Global Edge CDN                   │
                               │   - books3.circleaz.in (Cloudflare Pages - React 18 SPA)   │
                               │   - api3.circleaz.in (Cloudflare Worker API Gateway)        │
                               │   - media3.circleaz.in (Cloudflare R2 Public Media Bucket)   │
                               └──────────────────────────────┬──────────────────────────────┘
                                                              │ HTTPS / SWR Cache Control
                                                              ▼
                               ┌─────────────────────────────────────────────────────────────┐
                               │                 Render Web Service (Books3)                 │
                               │   - books3-mo5o.onrender.com (Gunicorn 1 Worker / 4 Threads)│
                               │   - Python 3.12 / Django 6.0.1 / DRF 3.15                   │
                               │   - SWRCacheMiddleware + SimpleJWT + Anymail (Resend)       │
                               └──────────────┬───────────────────────────────┬──────────────┘
                                              │ Direct DDL (Migration)        │ Pooled Queries (App)
                                              ▼                               ▼
                   ┌─────────────────────────────────────────┐  ┌─────────────────────────────┐
                   │   Distributed Cluster Migration Lock   │  │   Neon PostgreSQL 18.6      │
                   │   - Upstash Redis                       │  │   - ep-raspy-lake-b39hlekz  │
                   │   - azbooks_cluster_migration_lock      │  │   - PgBouncer Pooled Conn   │
                   │   - PostGIS 3.4 Spatial Extensions      │  │   - Read Replica Routing    │
                   └─────────────────────────────────────────┘  └─────────────────────────────┘
```

---

## 2. Complete Feature Inventory Table

The following table indexes every core feature, operational mechanism, and architectural guard across the sovereign platform, mapped to its corresponding domain and development milestone.

| # | Domain / Module | Feature Name | Description | Inputs | Outputs | Milestone / Target |
|---|---|---|---|---|---|---|
| 1 | `core` | Zero-Contamination Startup Latch | Hard startup assertion halting process if legacy `ep-autumn-star` connection is detected | `DATABASE_URL` | Fatal `RuntimeError` or boot success | Phase 1 / Rule 01 |
| 2 | `core` | Cluster Migration Distributed Lock | Upstash Redis distributed lock (`azbooks_cluster_migration_lock`) ensuring single-node DDL migration across concurrent nodes | CLI boot execution | Serialized migration execution | Phase 1 / Rule 01 |
| 3 | `core` | Neon PgBouncer Pooler Bypass | Dynamic hostname rewrite stripping `-pooler` during DDL migrations and CLI commands | Hostname config | Direct Neon connection | Phase 1 / Rule 01 |
| 4 | `core` | PostgreSQL Sequence Synchronization | Auto-increment sequence realignment to `MAX(id)` post-hydration and bulk inserts | Table name, PK | Synchronized sequence | Phase 1 / Rule 01 |
| 5 | `core` | PostgreSQL Sequence Display IDs | Lock-free human-readable display ID generation via PostgreSQL native sequences | Model instance save | O(1) Unique Display ID (e.g. #1001) | Phase 1 / Rule 02 |
| 6 | `core` | AZQL Reporting Query Engine | Safe, grammar-compiled AST query language allowing custom report generation without raw SQL risks | AST query tokens | Whitelisted ORM QuerySet | Phase 1 / EU-02 |
| 7 | `core` | Multi-DB Read Replica Routing | `ReportReplicaRouter` directing heavy analytics queries to read replicas | Thread-local context | Routed database alias | Phase 1 / EU-02 |
| 8 | `account` | OTP-Based Passwordless Authentication | Email OTP generation, verification, and rate limiting with Resend transactional email backend | User email | JWT Access & Refresh Tokens | Phase 1 / EU-03 |
| 9 | `account` | Role-Based Access Control (RBAC) | Fail-closed permission checking with immutable administrative permissions | User, Resource, Action | Boolean permission grant | Phase 1 / EU-02 |
| 10 | `inventory` | Option C Pack Atomization | Base-unit stock accounting breaking multipacks into discrete sellable units | Pack definition, quantity | Base inventory allocation | Phase 1 / EU-04 |
| 11 | `inventory` | StockService Gateway | Atomic inventory mutations using `select_for_update()` row locking | Product ID, quantity, movement type | Updated stock quantity & log | Phase 1 / EU-04 |
| 12 | `inventory` | Bulk Product Import Engine | High-throughput spreadsheet / CSV catalog ingestion with deduplication | CSV file | Bulk product catalog records | Phase 1 / EU-05 |
| 13 | `inventory` | WebP Thumbnail Pipeline | Automated image optimization converting assets to compressed WebP | Source image | Optimized WebP asset | Phase 1 / EU-05 |
| 14 | `customers` | PostGIS Spatial Demographics | GIS-indexed customer locations, polygon territory boundaries, and spatial proximity queries | GeoJSON polygon / Point | Spatial queryset match | Phase 1 / EU-06 |
| 15 | `customers` | Customer Store Wallet & Ledger | Prepaid store credit wallet supporting atomic deposits, deductions, and refunds | Customer ID, amount | Updated wallet balance & audit log | Phase 1 / EU-06 |
| 16 | `customers` | Legacy Debt Segregation | Dedicated tracking and recovery ledger for historical debts accrued in prior operating sessions | Customer ID, debt record | Recovery transaction record | Phase 1 / EU-06 |
| 17 | `orders` | Multi-Status State Machine | Coordinated tracking of order, payment, delivery, return, and cancellation statuses | Event trigger, target state | State transition & history entry | Phase 1 / EU-08 |
| 18 | `orders` | 3-Layer Idempotency Guard | Fast-lock button + `X-Idempotency-Key` + Server-side SHA-256 cart fingerprint guard | Cart payload, time bucket | HTTP 200 or HTTP 409 Conflict | Phase 1 / EU-08 |
| 19 | `orders` | Cloudflare R2 Public Receipt Snapshot | Asynchronous PDF/HTML receipt generation uploaded to private R2 bucket via `transaction.on_commit()` | Order ID, receipt UUID | Secure R2 public URL | Phase 1 / EU-08 |
| 20 | `orders` | Partial Fulfillment & Deliveries | Independent delivery aggregate tracking partial dispatches against confirmed order items | Order items, dispatch qty | Delivery record & status update | Phase 1 / EU-08 |
| 21 | `orders` | Customer Returns & AVCO Restock | Returns processing freezing original landed unit cost (`frozen_cost_price`) | Return items, original cost | Restocked inventory & Refund | Phase 1 / EU-08 |
| 22 | `finance` | Mandatory LedgerService Gateway | Double-entry financial gateway with strict kwargs whitelist and row-level locking | Amount, source/dest, ref, user | Verified transaction record | Phase 1 / EU-10 |
| 23 | `finance` | Zero-Floor Serializer Lockdown | Enforced `min_value=0` across all POS serializer decimal inputs | Price, discount, payment inputs | Sanitized decimal input | Phase 1 / EU-10 |
| 24 | `finance` | Reciprocal Deletion Cascades | Atomic balance reversal when deleting or voiding payments or transactions | Delete trigger | Balanced ledger & soft-delete | Phase 1 / EU-10 |
| 25 | `finance` | Expense Approval Threshold | Auto-sets `approval_status = 'pending'` for expenses $\ge ₹5,000$ | Expense amount $\ge 5000$ | Manager approval requirement | Phase 1 / EU-11 |
| 26 | `finance` | Multi-Source Unified Ledger | Consolidated ledger unifying Bank, Cash, Outlet, and Customer balances | Date range, account filters | Unified transaction statement | Phase 1 / EU-11 |
| 27 | `procurement` | Weighted Average Costing (WAC) | Dynamic recalculation of stock inventory valuation upon purchase order receiving | Received PO items, cost | Updated product average cost | Phase 1 / EU-12 |
| 28 | `procurement` | Freight Cost Apportionment | Proportional allocation of shipping and transport charges across PO line items | Transport fee, PO lines | Landed unit cost per item | Phase 1 / EU-12 |
| 29 | `outlets` | Consignment Stock Transfers | Inter-warehouse inventory dispatch with TOCTOU lock protection | Source outlet, destination, items | Transferred consignment stock | Phase 1 / EU-13 |
| 30 | `outlets` | Outlet Commission Engine | Tiered and FIFO commission calculation for consignment retail outlets | Outlet sales, commission rates | Commission ledger & payout | Phase 1 / EU-13 |
| 31 | `messaging` | Meta Graph WhatsApp Dispatch | Asynchronous transactional notification delivery for receipts and reminders | Recipient phone, template ID | WhatsApp message dispatch | Phase 1 / EU-14 |
| 32 | `settings_app`| Store Global Settings & RBAC Seed | Centralized business configuration and default role hierarchy bootstrap | Seed parameters | Initialized roles & settings | Phase 1 / EU-15 |
| 33 | `dashboard` | Executive KPIs & Trend Analytics | Real-time sales, inventory, and revenue analytics using annotated SQL queries | Time period filter | Aggregated KPI dashboard | Phase 1 / EU-16 |
| 34 | `frontend` | Universal Payment Engine | Centralized `<UniversalPaymentEngine />` component shared across all 7 checkout flows | Allowed methods, total | Sanitized payment callback | Phase 1 / FE-07 |
| 35 | `frontend` | Live Search Keystroke Debounce | 300ms–500ms debounce with `AbortController` cancellation for all live search inputs | Keystrokes | Aborted stale request, fresh UI | Phase 1 / FE-04 |
| 36 | `frontend` | Server-Side Pagination Invariant | Complete elimination of client-side filtering on paginated datasets | Query params (`?search=`) | Server-paginated slice | Phase 1 / FE-01 |
| 37 | `worker` | Version-Aware Gateway Routing | Cloudflare Worker edge proxy with automated health-check probing and failover | Inbound client HTTP | Proxied healthy backend | Phase 1 / EU-01 |
| 38 | `worker` | Edge SWR Cache Layer | Stale-while-revalidate edge caching with strict financial prefix exclusion | Safe GET endpoints | Cloudflare edge cache response | Phase 1 / EU-01 |
| 39 | `devops` | Dockerized Multi-Stage Container | Lightweight production container enforcing GDAL, GEOS, and Cairo dependencies | Source repository | Production Docker image | Phase 1 / EU-18 |
| 40 | `devops` | Media Bucket Auto-Hydration | Startup sync script uploading 367 verified media assets with fast sentinel bypass | Container boot | Hydrated Cloudflare R2 bucket | Phase 1 / EU-18 |
| 41 | `crucible` | Negative Stock Reconciliation | Surgical reconciliation of 46 products with negative stock balances | Orphaned negative balances | Audited zero/positive stock | Track 2 Crucible |
| 42 | `crucible` | Delivered Unsettled Order Closure| Audit and reconciliation of 34 delivered orders lacking payment settlement | Unsettled orders | Reconciled payment / debt | Track 2 Crucible |
| 43 | `crucible` | Ghost Fee Order Purge | Forensic cleanup of 25 orders corrupted by ghost transport/handling fees | Corrupted fee rows | Sanitized order totals | Track 2 Crucible |
| 44 | `crucible` | Axis Bank Ledger Alignment | Synchronization of Axis bank ledger balance against verified statement CSVs | Statement transactions | Reconciled bank current balance| Track 2 Crucible |
| 45 | `crucible` | Legacy Debt Ledger Segregation | Mathematical partitioning of legacy debts into dedicated audit accounts | Historical balances | Segregated legacy balance | Track 2 Crucible |

---

## 3. Milestone Breakdown

The Books3 engineering roadmap is divided into structured, sequentially verified phases:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       BOOKS3 ENGINEERING ROADMAP                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 1: Macro Architecture Map (docs/architecture/Macro_Architecture.md)  │
│  ├── Master blueprint of 11 Django domains, React SPA & Sovereign Cloud     │
│  └── Codified architectural invariants, Mermaid state machines, data flows  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 2: Micro-Chunking Triage & Tracking Checklist (Doc_Checklist.md)     │
│  ├── 45 Atomic Execution Units (18 Backend EU-01..18, 27 Frontend FE-01..27)│
│  └── 432 Total Source Files strictly bounded (8–10 files/unit), 0 Orphans   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 3: Atomic Technical Wiki Documentation (docs/architecture/units/)    │
│  ├── Modular wiki technical specification generated for each execution unit │
│  └── Deep source inspection, parameter schemas, failure states, KaTeX math  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 4: Domain Synthesis & Milestone Review                               │
│  ├── Domain-by-domain rollups into cohesive master overviews                │
│  └── Tribunal review and formal stakeholder sign-off checkpoints            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Track 2: Data Cleaning & Reconciliation Crucible                           │
│  ├── Vector 1: Reconcile 46 products with negative stock quantities        │
│  ├── Vector 2: Audit and close 34 delivered/unsettled ghost orders          │
│  ├── Vector 3: Clean 25 ghost fee orders                                    │
│  ├── Vector 4: Reconcile Axis bank ledger drift against statements          │
│  └── Vector 5: Isolate legacy debt balances into segregated audit ledger     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Interface Contracts Between Modules

To maintain architectural integrity, prevent circular imports, and enforce sovereign invariants, all inter-module communication is governed by ironclad interface contracts.

### 4.1 Financial Ledger Gateway Contract (`LedgerService`)
- **Direct Balance Mutation Ban**: Code outside `finance/services.py` must NEVER perform `wallet.balance += amount` or `bank.current_balance -= amount`.
- **Sanctioned Methods**:
  - `LedgerService.process_deposit(amount, destination_bank=None, destination_wallet=None, reference, description, user, date=None, **kwargs)`
  - `LedgerService.process_withdrawal(amount, source_bank=None, source_wallet=None, reference, description, user, date=None, allow_overdraft=False, **kwargs)`
- **Kwargs Whitelist (Ironclad)**: Strictly `{'related_loan', 'related_expense', 'recorded_by', 'created_by'}`. Any unwhitelisted argument triggers an immediate `ValidationError`.
- **Locking**: Acquires `select_for_update()` on the target bank account or cash wallet inside a `transaction.atomic()` block.

### 4.2 Inventory Stock Gateway Contract (`StockService`)
- **Direct Stock Mutation Ban**: Code must NEVER modify `Product.stock_quantity` directly.
- **Sanctioned Method**:
  - `StockService.adjust_stock(product, quantity_delta, movement_type, reference, user, unit_cost=None, notes=None)`
- **Locking & Deadlock Prevention**: Target product row must be locked using `select_for_update()`. When locking multiple products in batch, product IDs must be sorted in ascending order to prevent deadlocks.
- **AVCO Cost Invariant**: Consignment returns and customer returns MUST pass the frozen historical unit cost (`frozen_cost_price`) into `adjust_stock()` to preserve weighted average costing integrity.

### 4.3 Order-to-Payment-to-Receipt Contract
- **Idempotency Fingerprint**: `OrderViewSet.create()` computes `SHA-256(customer_id | sorted_items | time_bucket)` while holding a `select_for_update()` lock on the Customer. Duplicate submissions within 10 minutes return `409 Conflict`.
- **Asynchronous External I/O**: External network calls (Cloudflare R2 PDF uploads, Meta WhatsApp dispatches, Resend emails) are **PERMANENTLY PROHIBITED** inside database transactions. All dispatches must be deferred using `transaction.on_commit()`.
- **Thread Connection Hygiene**: Any background worker thread must wrap execution in `try ... finally: django.db.close_old_connections()` to prevent Neon connection pool exhaustion.

### 4.4 Frontend-to-Backend API Transport Contract
- **Zero Stale Caching on Financial APIs**: All endpoints under `/api/orders/`, `/api/finance/`, `/api/inventory/`, and `/api/customers/` must strictly use `NetworkOnly` transport. Workbox runtime caching is banned.
- **Mutating Request Idempotency**: Mutating requests (POST/PUT/PATCH) must send an `X-Idempotency-Key` header computed from payload contents and time bucket.
- **Live Search Debounce**: All search inputs must debounce keystrokes by 300ms–500ms and use an `AbortController` to abort in-flight requests before firing new queries.
- **Payment Centralization**: All frontend payment flows must instantiate `<UniversalPaymentEngine />` with stringified dependency props to prevent infinite render loops.

### 4.5 Edge Gateway & DNS Contract
- **Edge Routing**: Cloudflare Worker at `api3.circleaz.in` proxies all `/api/*` traffic to `books3-mo5o.onrender.com`.
- **Health Probe & Self-Healing**: Automated cron pings `/api/health/` every 5 minutes to prevent cold-starts, rank instances by latency, and execute automatic failover on HTTP 403/502/503/504.
- **Edge SWR Cache**: `SWRCacheMiddleware` injects `Cloudflare-CDN-Cache-Control` for non-financial endpoints while serving `Cache-Control: private, no-cache` to client browsers.

### 4.6 Database & Multi-Node Migration Contract
- **Zero Contamination**: Startup latch in `azbooks/settings.py` raises fatal `RuntimeError` if `ep-autumn-star` is in `DATABASE_URL`.
- **Cluster Migration**: `docker-entrypoint.sh` executes `python manage.py cluster_migrate`, which acquires Upstash Redis lock `azbooks_cluster_migration_lock` (180s TTL). Only the leader runs migrations; followers wait up to 120s.
- **PgBouncer Bypass**: CLI management commands dynamically strip `-pooler` from `DATABASES['default']['HOST']` to establish direct DDL connections.
- **Cursor Invariant**: `DATABASES['default']['DISABLE_SERVER_SIDE_CURSORS'] = True` is permanently enabled for PgBouncer transaction pooling mode.

---

## 5. Code Layout

```
Z:\books3\
├── .agents\                          # Agent metadata, rules, and survey documentation
│   ├── rules\                        # The 7 Workspace Rule specifications (01 through 07)
│   ├── explorer_survey_1\            # Backend survey (173 files catalogued)
│   ├── explorer_survey_2\            # Frontend survey & units JSON (259 files catalogued)
│   ├── explorer_survey_3\            # Cloud invariants survey (33 features, 28 edge cases)
│   ├── orchestrator_1\               # Orchestrator plans and progress
│   └── worker_m1\                    # Worker M1 working memory, progress, and handoff
├── account\                          # User authentication, profiles, OTP, and session management
├── azbooks\                          # Django root configuration, settings, WSGI/ASGI, custom storage
├── catalog\                          # Catalog image processing and optimization scripts
├── core\                             # Shared models, permissions, DB routers, AZQL query engine
├── customers\                        # Customer directory, PostGIS geodata, region assignment, wallets
├── dashboard\                        # KPI aggregation endpoints and executive metrics
├── finance\                          # Double-entry ledger, bank accounts, cash wallets, expenses, loans
├── frontend\                         # React 18 SPA (Cloudflare Pages)
│   ├── public\                       # Static web assets, PWA manifest, service worker
│   └── src\                          # React components, contexts, hooks, styles, utilities
├── inventory\                        # Products, stock adjustments, Option C packs, StockService
├── media\                            # Staged WebP and image assets for Cloudflare R2 synchronization
├── messaging\                        # WhatsApp Cloud API integration, message dispatch, R2 receipt upload
├── orders\                           # Order processing, line items, deliveries, returns, refunds, receipts
├── outlets\                          # Consignment stores, stock transfers, commissions, settlements
├── procurement\                      # Purchase orders, suppliers, weighted average costing (WAC), freight
├── reports\                          # Analytics queries, activity logging, AZQL execution endpoints
├── scratch\                          # Operational maintenance scripts and test verification runners
├── scripts\                          # Historical forensic data extraction and migration scripts
├── settings_app\                     # System configuration, RBAC roles/permissions, PWA icon generation
├── tools\                            # Fast test runners and mock environments
├── worker\                           # Cloudflare Worker API gateway (src/index.js, wrangler.toml)
├── Doc_Checklist.md                  # 45 Execution Units living tracking registry (432 files)
├── PROJECT.md                        # Master project blueprint, feature inventory & interface contracts
├── Dockerfile                        # Multi-stage production container definition
├── docker-compose.yml                # Local development orchestration with PostGIS and Redis
├── docker-entrypoint.sh              # Container startup chain with cluster migrate and media sync
├── render.yaml                       # Render PaaS deployment blueprint
├── requirements.txt                  # Pinned Python dependencies
└── manage.py                         # Django management entrypoint
```

---

*Authored and verified by Worker M1 for the Books3 Sovereign Infrastructure.*
