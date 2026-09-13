# Books3 Living Documentation & Atomic Execution Units Checklist

**Status**: `[APPROVED_FOR_EXECUTION]`  
**Tracking Metric**: 45 Atomic Execution Units | 432 Total Source Files (173 Backend + 259 Frontend) | 0 Orphans | 0 Duplicates  
**Target Bounding**: Strictly 8–10 files per unit  

---

## Executive Summary

This document is the authoritative, living tracking registry for the Books3 fractal documentation lifecycle. It registers **100% of production source files** across the repository, partitioned into **45 tightly bounded, atomic Execution Units (8–10 files each)** with **zero orphaned files**.

| Partition Scope | Execution Units | Total Files | Unit Bounding Range | Orphan Count |
|---|---|---|---|---|
| **Backend (Django, DRF, Worker, Scripts, DevOps)** | 18 (EU-01 – EU-18) | 173 | 9–10 files / unit | 0 |
| **Frontend (React 18 SPA, PWA, Styles, Services)** | 27 (FE-01 – FE-27) | 259 | 8–10 files / unit | 0 |
| **Total Sovereign Codebase** | **45 Execution Units** | **432 Files** | **8–10 files / unit** | **0** |

---

## Section 1: Backend Execution Units (EU-01 through EU-18)

### EU-01: Core Architecture & Sovereign Latch
- **Unit ID**: `EU-01`
- **Domain**: Core & Infrastructure
- **Target Documentation**: `docs/architecture/backend/EU-01_core_architecture_latch.md`
- **File Count**: 9 files
- **Status**: - [x] **Complete** (`docs/architecture/backend/EU-01_core_architecture_latch.md`)
- **Member Files**:
  1. `azbooks/__init__.py`
  2. `azbooks/settings.py`
  3. `azbooks/urls.py`
  4. `azbooks/wsgi.py`
  5. `azbooks/asgi.py`
  6. `azbooks/custom_storages.py`
  7. `azbooks/middleware/__init__.py`
  8. `azbooks/middleware/cache_headers.py`
  9. `worker/src/index.js`

### EU-02: Core Permissions, DB Routing & AZQL Engine
- **Unit ID**: `EU-02`
- **Domain**: Core Framework
- **Target Documentation**: `docs/architecture/backend/EU-02_core_permissions_azql.md`
- **File Count**: 10 files
- **Status**: - [x] **Complete** (`docs/architecture/backend/EU-02_core_permissions_azql.md`)
- **Member Files**:
  1. `core/__init__.py`
  2. `core/apps.py`
  3. `core/models.py`
  4. `core/permissions.py`
  5. `core/signals.py`
  6. `core/db_routers.py`
  7. `core/views.py`
  8. `core/viewsets.py`
  9. `core/azql.py`
  10. `core/urls.py`

### EU-03: Account Identity, Authentication & OTP
- **Unit ID**: `EU-03`
- **Domain**: Account & Auth
- **Target Documentation**: `docs/architecture/backend/EU-03_account_identity_otp.md`
- **File Count**: 10 files
- **Status**: - [x] **Complete** (`docs/architecture/backend/EU-03_account_identity_otp.md`)
- **Member Files**:
  1. `account/__init__.py`
  2. `account/apps.py`
  3. `account/admin.py`
  4. `account/models.py`
  5. `account/serializers.py`
  6. `account/views.py`
  7. `account/urls.py`
  8. `account/management/__init__.py`
  9. `account/management/commands/__init__.py`
  10. `account/management/commands/cleanup_expired_otps.py`

### EU-04: Inventory Master Models, Pack Atomization & StockService
- **Unit ID**: `EU-04`
- **Domain**: Inventory
- **Target Documentation**: `docs/architecture/backend/EU-04_inventory_master_stockservice.md`
- **File Count**: 10 files
- **Status**: - [x] **Complete** (`docs/architecture/backend/EU-04_inventory_master_stockservice.md`)
- **Member Files**:
  1. `inventory/__init__.py`
  2. `inventory/apps.py`
  3. `inventory/admin.py`
  4. `inventory/models.py`
  5. `inventory/services.py`
  6. `inventory/signals.py`
  7. `inventory/management/__init__.py`
  8. `inventory/management/commands/__init__.py`
  9. `inventory/management/commands/run_option_c_migration.py`
  10. `inventory/management/commands/migrate_packs.py`

### EU-05: Inventory API, Serializers & Catalog Ingestion
- **Unit ID**: `EU-05`
- **Domain**: Inventory & Catalog
- **Target Documentation**: `docs/architecture/backend/EU-05_inventory_api_catalog.md`
- **File Count**: 10 files
- **Status**: - [x] **Complete** (`docs/architecture/backend/EU-05_inventory_api_catalog.md`)
- **Member Files**:
  1. `inventory/serializers.py`
  2. `inventory/views.py`
  3. `inventory/urls.py`
  4. `inventory/management/commands/bulk_import_products.py`
  5. `inventory/management/commands/generate_thumbnails.py`
  6. `catalog/optimize.py`
  7. `scripts/generate_category_report.py`
  8. `scripts/generate_owed_report.py`
  9. `core/management/commands/sync_media_to_r2.py`
  10. `scripts/calc_transport.py`

### EU-06: Customer Aggregate, PostGIS Geodata & Wallets
- **Unit ID**: `EU-06`
- **Domain**: Customers
- **Target Documentation**: `docs/architecture/backend/EU-06_customer_aggregate_geodata.md`
- **File Count**: 9 files
- **Status**: - [x] **Complete** (`docs/architecture/backend/EU-06_customer_aggregate_geodata.md`)
- **Member Files**:
  1. `customers/__init__.py`
  2. `customers/apps.py`
  3. `customers/admin.py`
  4. `customers/models.py`
  5. `customers/serializers.py`
  6. `customers/urls.py`
  7. `customers/tests.py`
  8. `customers/management/__init__.py`
  9. `customers/management/commands/assign_regions.py`

### EU-07: Customer Views, Spatial Boundaries & Prospecting
- **Unit ID**: `EU-07`
- **Domain**: Customers & GIS
- **Target Documentation**: `docs/architecture/backend/EU-07_customer_views_spatial.md`
- **File Count**: 9 files
- **Status**: - [x] **Complete** (`docs/architecture/backend/EU-07_customer_views_spatial.md`)
- **Member Files**:
  1. `customers/views.py`
  2. `customers/management/commands/__init__.py`
  3. `customers/management/commands/load_geodata.py`
  4. `scripts/audit_regions.py`
  5. `scripts/clean_json.py`
  6. `scripts/rename_regions.py`
  7. `scripts/test_reverse_geocode.py`
  8. `scripts/extract_machhiwad.py`
  9. `scripts/extract_movasa.py`

### EU-08: Order Aggregate, Receipts & Cloud Storage Integration
- **Unit ID**: `EU-08`
- **Domain**: Orders & Storage
- **Target Documentation**: `docs/architecture/backend/EU-08_order_aggregate_receipts.md`
- **File Count**: 10 files
- **Status**: - [x] **Complete** (`docs/architecture/backend/EU-08_order_aggregate_receipts.md`)
- **Member Files**:
  1. `orders/__init__.py`
  2. `orders/apps.py`
  3. `orders/admin.py`
  4. `orders/constants.py`
  5. `orders/models.py`
  6. `orders/serializers.py`
  7. `orders/signals.py`
  8. `orders/receipt_serializers.py`
  9. `orders/receipt_views.py`
  10. `messaging/r2.py`

### EU-09: Order Views, Reminders & Lifecycle Tests
- **Unit ID**: `EU-09`
- **Domain**: Orders
- **Target Documentation**: `docs/architecture/backend/EU-09_order_views_lifecycle.md`
- **File Count**: 9 files
- **Status**: - [x] **Complete** (`docs/architecture/backend/EU-09_order_views_lifecycle.md`)
- **Member Files**:
  1. `orders/views.py`
  2. `orders/urls.py`
  3. `orders/tests.py`
  4. `orders/management/__init__.py`
  5. `orders/management/commands/__init__.py`
  6. `orders/management/commands/fix_duplicate_orders.py`
  7. `orders/management/commands/send_overdue_reminders.py`
  8. `scripts/reverse_ghost_refund.py`
  9. `scripts/extract_sql.py`

### EU-10: Financial Ledger, Bank Transactions & LedgerService
- **Unit ID**: `EU-10`
- **Domain**: Finance
- **Target Documentation**: `docs/architecture/backend/EU-10_financial_ledger_ledgerservice.md`
- **File Count**: 9 files
- **Status**: - [x] **Complete** (`docs/architecture/backend/EU-10_financial_ledger_ledgerservice.md`)
- **Member Files**:
  1. `finance/__init__.py`
  2. `finance/apps.py`
  3. `finance/admin.py`
  4. `finance/models.py`
  5. `finance/services.py`
  6. `finance/signals.py`
  7. `finance/urls.py`
  8. `finance/tests.py`
  9. `scripts/test_all_tx.py`

### EU-11: Financial Operations, Multi-DB & Cluster Maintenance
- **Unit ID**: `EU-11`
- **Domain**: Finance & Operations
- **Target Documentation**: `docs/architecture/backend/EU-11_financial_ops_maintenance.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `finance/serializers.py`
  2. `finance/views.py`
  3. `scripts/fix_orphaned_payments.py`
  4. `scripts/extract_machhiwad_aggregated.py`
  5. `scripts/extract_machhiwad_links.py`
  6. `scripts/extract_machhiwad_specific.py`
  7. `core/management/__init__.py`
  8. `core/management/commands/__init__.py`
  9. `core/management/commands/cluster_migrate.py`
  10. `core/management/commands/wipe_test_data.py`

### EU-12: Procurement, Landed Cost & Freight Calculations
- **Unit ID**: `EU-12`
- **Domain**: Procurement
- **Target Documentation**: `docs/architecture/backend/EU-12_procurement_landed_cost.md`
- **File Count**: 9 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `procurement/__init__.py`
  2. `procurement/apps.py`
  3. `procurement/admin.py`
  4. `procurement/models.py`
  5. `procurement/serializers.py`
  6. `procurement/services.py`
  7. `procurement/views.py`
  8. `procurement/urls.py`
  9. `procurement/tests.py`

### EU-13: Outlet Consignment, Stock Transfers & Sales
- **Unit ID**: `EU-13`
- **Domain**: Outlets
- **Target Documentation**: `docs/architecture/backend/EU-13_outlet_consignment_transfers.md`
- **File Count**: 9 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `outlets/__init__.py`
  2. `outlets/apps.py`
  3. `outlets/admin.py`
  4. `outlets/models.py`
  5. `outlets/serializers.py`
  6. `outlets/signals.py`
  7. `outlets/views.py`
  8. `outlets/urls.py`
  9. `outlets/tests.py`

### EU-14: Messaging Engine, WhatsApp API & Dispatch Gateway
- **Unit ID**: `EU-14`
- **Domain**: Messaging
- **Target Documentation**: `docs/architecture/backend/EU-14_messaging_whatsapp_dispatch.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `messaging/__init__.py`
  2. `messaging/apps.py`
  3. `messaging/admin.py`
  4. `messaging/models.py`
  5. `messaging/serializers.py`
  6. `messaging/dispatch.py`
  7. `messaging/whatsapp.py`
  8. `messaging/views.py`
  9. `messaging/urls.py`
  10. `messaging/tests.py`

### EU-15: Settings, RBAC & Store Configurations
- **Unit ID**: `EU-15`
- **Domain**: Settings & RBAC
- **Target Documentation**: `docs/architecture/backend/EU-15_settings_rbac_store.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `settings_app/__init__.py`
  2. `settings_app/apps.py`
  3. `settings_app/admin.py`
  4. `settings_app/models.py`
  5. `settings_app/serializers.py`
  6. `settings_app/views.py`
  7. `settings_app/urls.py`
  8. `settings_app/tests.py`
  9. `settings_app/management/commands/seed_rbac.py`
  10. `settings_app/management/commands/seed_all.py`

### EU-16: Dashboard KPIs & Reports Routing Engine
- **Unit ID**: `EU-16`
- **Domain**: Analytics & Reporting
- **Target Documentation**: `docs/architecture/backend/EU-16_dashboard_reports_routing.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `dashboard/__init__.py`
  2. `dashboard/apps.py`
  3. `dashboard/admin.py`
  4. `dashboard/models.py`
  5. `dashboard/serializers.py`
  6. `dashboard/views.py`
  7. `dashboard/urls.py`
  8. `reports/__init__.py`
  9. `reports/apps.py`
  10. `reports/urls.py`

### EU-17: Reporting Deep Analytics & AZQL Test Suite
- **Unit ID**: `EU-17`
- **Domain**: Analytics & Reporting
- **Target Documentation**: `docs/architecture/backend/EU-17_reporting_azql_analytics.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `reports/models.py`
  2. `reports/serializers.py`
  3. `reports/signals.py`
  4. `reports/views.py`
  5. `reports/tests.py`
  6. `reports/tests_azql.py`
  7. `reports/admin.py`
  8. `scripts/get_securecoder_findings.py`
  9. `settings_app/management/__init__.py`
  10. `settings_app/management/commands/__init__.py`

### EU-18: Operational Tooling, Environment Hydration & Deployment
- **Unit ID**: `EU-18`
- **Domain**: DevOps & Tooling
- **Target Documentation**: `docs/architecture/backend/EU-18_deployment_tooling_hydration.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `manage.py`
  2. `Dockerfile`
  3. `docker-compose.yml`
  4. `docker-entrypoint.sh`
  5. `render.yaml`
  6. `requirements.txt`
  7. `tools/run_local_tests_fast.py`
  8. `scratch/hydrate_books3_db.py`
  9. `settings_app/pwa_icons.py`
  10. `settings_app/management/commands/generate_pwa_icons.py`

---

## Section 2: Frontend Execution Units (FE-01 through FE-27)

### FE-01: Core SPA Shell & Build Configuration
- **Unit ID**: `FE-01`
- **Domain**: Core Architecture
- **Target Documentation**: `docs/architecture/frontend/FE-01_core_spa_shell_build_configuration.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/App.jsx`
  2. `frontend/src/main.jsx`
  3. `frontend/src/index.css`
  4. `frontend/src/config/api.js`
  5. `frontend/src/config/navigation.js`
  6. `frontend/src/assets/react.svg`
  7. `frontend/src/styles/components/page-layout.css`
  8. `frontend/src/styles/components/form-layout.css`
  9. `frontend/src/styles/components/modal-system.css`
  10. `frontend/src/styles/components/data-table.css`

### FE-02: State, Auth & Security Foundations
- **Unit ID**: `FE-02`
- **Domain**: Authentication & Security
- **Target Documentation**: `docs/architecture/frontend/FE-02_state_auth_security_foundations.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/context/AuthContext.jsx`
  2. `frontend/src/context/CurrencyContext.jsx`
  3. `frontend/src/context/StoreContext.jsx`
  4. `frontend/src/context/CartContext.jsx`
  5. `frontend/src/context/ToastContext.jsx`
  6. `frontend/src/utils/secureStorage.js`
  7. `frontend/src/utils/usePermissions.js`
  8. `frontend/src/components/PermissionRoute.jsx`
  9. `frontend/src/components/ElevatedAuthModal.jsx`
  10. `frontend/src/components/ElevatedAuthModal.css`

### FE-03: Application Layout & Navigation Infrastructure
- **Unit ID**: `FE-03`
- **Domain**: Layout & Navigation
- **Target Documentation**: `docs/architecture/frontend/FE-03_application_layout_navigation_infrastructure.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/components/layout/MainLayout.jsx`
  2. `frontend/src/components/layout/MainLayout.css`
  3. `frontend/src/components/layout/TopBar.jsx`
  4. `frontend/src/components/layout/TopBar.css`
  5. `frontend/src/components/layout/NavigationDrawer.jsx`
  6. `frontend/src/components/layout/NavigationDrawer.css`
  7. `frontend/src/components/layout/BottomNavBar.jsx`
  8. `frontend/src/components/layout/BottomNavBar.css`
  9. `frontend/src/components/layout/Breadcrumbs.jsx`
  10. `frontend/src/components/layout/Breadcrumbs.css`

### FE-04: OmniSearch, Notifications & Common Utilities
- **Unit ID**: `FE-04`
- **Domain**: Common UI & Utilities
- **Target Documentation**: `docs/architecture/frontend/FE-04_omnisearch_notifications_common_utilities.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/components/layout/UserProfileDropdown.jsx`
  2. `frontend/src/components/layout/UserProfileDropdown.css`
  3. `frontend/src/components/layout/NotificationPanel.jsx`
  4. `frontend/src/components/layout/NotificationPanel.css`
  5. `frontend/src/components/common/OmniSearch.jsx`
  6. `frontend/src/components/common/OmniSearch.css`
  7. `frontend/src/utils/payloadSanitizer.js`
  8. `frontend/src/utils/test_payloadSanitizer.js`
  9. `frontend/src/utils/financeUtils.js`
  10. `frontend/src/utils/statusUtils.js`

### FE-05: PWA, Offline, Diagnostics & UI Primitives
- **Unit ID**: `FE-05`
- **Domain**: PWA & Offline Services
- **Target Documentation**: `docs/architecture/frontend/FE-05_pwa_offline_diagnostics_ui_primitives.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/components/common/ErrorBoundary.jsx`
  2. `frontend/src/components/common/PageSkeleton.jsx`
  3. `frontend/src/components/common/PageSkeleton.css`
  4. `frontend/src/components/common/LoadingSpinner.jsx`
  5. `frontend/src/components/common/LoadingSpinner.css`
  6. `frontend/src/components/common/OfflineSyncBadge.jsx`
  7. `frontend/src/components/common/OfflineSyncBadge.css`
  8. `frontend/src/components/common/PWAPrompt.jsx`
  9. `frontend/src/components/common/PWAPrompt.css`
  10. `frontend/src/components/common/PWAInstallPrompt.jsx`

### FE-06: Common UI Widgets, Feedback & Shared Controls
- **Unit ID**: `FE-06`
- **Domain**: Common UI Components
- **Target Documentation**: `docs/architecture/frontend/FE-06_common_ui_widgets_feedback_shared_controls.md`
- **File Count**: 9 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/components/common/PWAInstallPrompt.css`
  2. `frontend/src/components/common/Pagination.jsx`
  3. `frontend/src/components/common/Pagination.css`
  4. `frontend/src/components/common/Toast.jsx`
  5. `frontend/src/components/common/Toast.css`
  6. `frontend/src/components/GuardedAction.jsx`
  7. `frontend/src/components/ManagerOverrideModal.jsx`
  8. `frontend/src/hooks/useServerList.js`
  9. `frontend/src/utils/imageCompression.js`

### FE-07: Universal Payment Engine & Core POS Checkout
- **Unit ID**: `FE-07`
- **Domain**: POS & Orders
- **Target Documentation**: `docs/architecture/frontend/FE-07_universal_payment_engine_core_pos_checkout.md`
- **File Count**: 8 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/components/common/UniversalPaymentEngine.jsx`
  2. `frontend/src/pages/orders/NewOrder.jsx`
  3. `frontend/src/pages/NewOrder.css`
  4. `frontend/src/pages/orders/OrderReceipt.jsx`
  5. `frontend/src/pages/orders/OrderReceipt.css`
  6. `frontend/src/pages/public/PublicReceipt.jsx`
  7. `frontend/src/pages/public/PublicReceipt.css`
  8. `frontend/src/pages/orders/EditOrder.jsx`

### FE-08: Order Management, Receipts & Order History
- **Unit ID**: `FE-08`
- **Domain**: POS & Orders
- **Target Documentation**: `docs/architecture/frontend/FE-08_order_management_receipts_order_history.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/orders/OrderList.jsx`
  2. `frontend/src/pages/OrderList.css`
  3. `frontend/src/pages/orders/OrderDetails.jsx`
  4. `frontend/src/pages/orders/OrderDetails.css`
  5. `frontend/src/pages/returns/InitiateReturn.jsx`
  6. `frontend/src/pages/returns/InitiateReturn.css`
  7. `frontend/src/pages/returns/ReturnDetails.jsx`
  8. `frontend/src/pages/returns/ReturnDetails.css`
  9. `frontend/src/pages/returns/ReturnsList.jsx`
  10. `frontend/src/pages/returns/ReturnsList.css`

### FE-09: Returns, Refunds & Outlets Consignment Engine
- **Unit ID**: `FE-09`
- **Domain**: Orders & Outlets
- **Target Documentation**: `docs/architecture/frontend/FE-09_returns_refunds_outlets_consignment_engine.md`
- **File Count**: 9 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/returns/modals/RefundModal.jsx`
  2. `frontend/src/pages/outlets/OutletsList.jsx`
  3. `frontend/src/pages/outlets/OutletsList.css`
  4. `frontend/src/pages/outlets/AddOutlet.jsx`
  5. `frontend/src/pages/outlets/EditOutlet.jsx`
  6. `frontend/src/pages/outlets/OutletDetails.jsx`
  7. `frontend/src/pages/outlets/OutletDetails.css`
  8. `frontend/src/pages/outlets/OutletForm.css`
  9. `frontend/src/pages/outlets/modals/PaymentModal.jsx`

### FE-10: Outlets Modals & Stock Movement Transactions
- **Unit ID**: `FE-10`
- **Domain**: Outlets & Procurement
- **Target Documentation**: `docs/architecture/frontend/FE-10_outlets_modals_stock_movement_transactions.md`
- **File Count**: 9 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/outlets/modals/ReturnDetailsModal.jsx`
  2. `frontend/src/pages/outlets/modals/ReturnModal.jsx`
  3. `frontend/src/pages/outlets/modals/SaleDetailsModal.jsx`
  4. `frontend/src/pages/outlets/modals/SaleModal.jsx`
  5. `frontend/src/pages/outlets/modals/TransferDetailsModal.jsx`
  6. `frontend/src/pages/outlets/modals/TransferModal.jsx`
  7. `frontend/src/pages/procurement/ProcurementList.jsx`
  8. `frontend/src/pages/procurement/CreatePO.jsx`
  9. `frontend/src/pages/procurement/PODetail.jsx`

### FE-11: Procurement Services & Inventory Catalog
- **Unit ID**: `FE-11`
- **Domain**: Procurement & Inventory
- **Target Documentation**: `docs/architecture/frontend/FE-11_procurement_services_inventory_catalog.md`
- **File Count**: 9 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/procurement/Transporters.jsx`
  2. `frontend/src/services/procurementService.js`
  3. `frontend/src/pages/inventory/ProductList.jsx`
  4. `frontend/src/pages/inventory/ProductList.css`
  5. `frontend/src/pages/inventory/ProductDetails.jsx`
  6. `frontend/src/pages/inventory/ProductDetails.css`
  7. `frontend/src/pages/inventory/AddProduct.jsx`
  8. `frontend/src/pages/inventory/AddProduct.css`
  9. `frontend/src/pages/inventory/EditProduct.jsx`

### FE-12: Inventory Stock Control & Product Components
- **Unit ID**: `FE-12`
- **Domain**: Inventory Domain
- **Target Documentation**: `docs/architecture/frontend/FE-12_inventory_stock_control_product_components.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/inventory/StockControl.jsx`
  2. `frontend/src/pages/inventory/StockControl.css`
  3. `frontend/src/pages/inventory/Categories.jsx`
  4. `frontend/src/pages/inventory/Vendors.jsx`
  5. `frontend/src/pages/inventory/DeletedProducts.jsx`
  6. `frontend/src/pages/inventory/DeletedProducts.css`
  7. `frontend/src/components/inventory/ProductForm.jsx`
  8. `frontend/src/components/inventory/ProductForm.css`
  9. `frontend/src/components/inventory/CategoryModal.jsx`
  10. `frontend/src/components/inventory/VendorModal.jsx`

### FE-13: Customer Directory, Profiling & Registration
- **Unit ID**: `FE-13`
- **Domain**: Customer Domain
- **Target Documentation**: `docs/architecture/frontend/FE-13_customer_directory_profiling_registration.md`
- **File Count**: 9 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/customers/CustomerList.jsx`
  2. `frontend/src/pages/customers/CustomerList.css`
  3. `frontend/src/pages/customers/CustomerDetails.jsx`
  4. `frontend/src/pages/customers/CustomerDetails.css`
  5. `frontend/src/pages/customers/AddCustomer.jsx`
  6. `frontend/src/pages/customers/AddCustomer.css`
  7. `frontend/src/components/StudentEducationBlock.jsx`
  8. `frontend/src/components/common/SchoolStructureTree.jsx`
  9. `frontend/src/components/common/SchoolStructureTree.css`

### FE-14: Customer GIS, Mapping & Geographic Demographics
- **Unit ID**: `FE-14`
- **Domain**: Customer Domain
- **Target Documentation**: `docs/architecture/frontend/FE-14_customer_gis_mapping_geographic_demographics.md`
- **File Count**: 9 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/customers/CustomerMap.jsx`
  2. `frontend/src/pages/customers/CustomerMap.css`
  3. `frontend/src/pages/customers/mapUtils.js`
  4. `frontend/src/components/MapComponent.jsx`
  5. `frontend/src/components/MapComponent.css`
  6. `frontend/src/pages/customers/CoverageList.jsx`
  7. `frontend/src/pages/customers/CoverageList.css`
  8. `frontend/src/pages/customers/SeasonReport.jsx`
  9. `frontend/src/pages/customers/SeasonReport.css`

### FE-15: Dashboard Hub, Analytics & Executive Metrics
- **Unit ID**: `FE-15`
- **Domain**: Dashboard & Auth Pages
- **Target Documentation**: `docs/architecture/frontend/FE-15_dashboard_hub_analytics_executive_metrics.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/Dashboard.jsx`
  2. `frontend/src/pages/Dashboard.css`
  3. `frontend/src/pages/Login.jsx`
  4. `frontend/src/pages/Login.css`
  5. `frontend/src/pages/OTPVerification.jsx`
  6. `frontend/src/pages/OTPVerification.css`
  7. `frontend/src/pages/Profile.jsx`
  8. `frontend/src/pages/Profile.css`
  9. `frontend/src/components/dashboard/Charts.css`
  10. `frontend/src/components/dashboard/StatCard.jsx`

### FE-16: Dashboard Performance Widgets & Sales Visualizations
- **Unit ID**: `FE-16`
- **Domain**: Dashboard & Reports
- **Target Documentation**: `docs/architecture/frontend/FE-16_dashboard_performance_widgets_sales_visualizations.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/components/dashboard/StatCard.css`
  2. `frontend/src/components/dashboard/SalesTrendChart.jsx`
  3. `frontend/src/components/dashboard/TopProductsChart.jsx`
  4. `frontend/src/components/dashboard/RecentOrdersWidget.jsx`
  5. `frontend/src/components/dashboard/RecentOrdersWidget.css`
  6. `frontend/src/components/dashboard/LowStockWidget.jsx`
  7. `frontend/src/components/dashboard/LowStockWidget.css`
  8. `frontend/src/components/dashboard/CoverageWidget.jsx`
  9. `frontend/src/pages/reports/ReportsIndex.jsx`
  10. `frontend/src/pages/reports/ReportsIndex.css`

### FE-17: Reports Hub, Sales Analytics & Data Export
- **Unit ID**: `FE-17`
- **Domain**: Reports Domain
- **Target Documentation**: `docs/architecture/frontend/FE-17_reports_hub_sales_analytics_data_export.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/reports/SalesReports.jsx`
  2. `frontend/src/pages/reports/SalesReports.css`
  3. `frontend/src/pages/reports/InventoryReports.jsx`
  4. `frontend/src/pages/reports/InventoryReports.css`
  5. `frontend/src/pages/reports/CustomerReports.jsx`
  6. `frontend/src/pages/reports/CustomerReports.css`
  7. `frontend/src/pages/reports/DataExport.jsx`
  8. `frontend/src/pages/reports/DataExport.css`
  9. `frontend/src/pages/reports/ActivityLog.jsx`
  10. `frontend/src/pages/reports/ActivityLog.css`

### FE-18: AZQL Query Playground & Visual Blockly Workspace
- **Unit ID**: `FE-18`
- **Domain**: Reports & Messaging
- **Target Documentation**: `docs/architecture/frontend/FE-18_azql_query_playground_visual_blockly_workspace.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/queries/QueryBuilder.jsx`
  2. `frontend/src/pages/queries/QueryBuilder.css`
  3. `frontend/src/pages/queries/BlocklyEditor.jsx`
  4. `frontend/src/pages/queries/AggregateColumnModal.jsx`
  5. `frontend/src/pages/queries/azql_blocks.js`
  6. `frontend/src/pages/queries/azql_generator.js`
  7. `frontend/src/pages/messaging/MessagingIndex.jsx`
  8. `frontend/src/pages/messaging/MessagingIndex.css`
  9. `frontend/src/pages/messaging/GatewayManagement.jsx`
  10. `frontend/src/pages/messaging/GatewayManagement.css`

### FE-19: Messaging Center & Core Finance Overview
- **Unit ID**: `FE-19`
- **Domain**: Messaging & Finance
- **Target Documentation**: `docs/architecture/frontend/FE-19_messaging_center_core_finance_overview.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/messaging/MessageQueue.jsx`
  2. `frontend/src/pages/messaging/MessageQueue.css`
  3. `frontend/src/pages/messaging/MessageTemplates.jsx`
  4. `frontend/src/pages/messaging/MessageTemplates.css`
  5. `frontend/src/pages/finance/FinanceIndex.jsx`
  6. `frontend/src/pages/finance/FinanceIndex.css`
  7. `frontend/src/pages/finance/CashManagement.jsx`
  8. `frontend/src/pages/finance/CashManagement.css`
  9. `frontend/src/pages/finance/OpeningBalance.jsx`
  10. `frontend/src/pages/finance/OpeningBalance.css`

### FE-20: Banking Ledgers, Cash Wallets & Transactions
- **Unit ID**: `FE-20`
- **Domain**: Finance Domain
- **Target Documentation**: `docs/architecture/frontend/FE-20_banking_ledgers_cash_wallets_transactions.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/finance/BankAccounts.jsx`
  2. `frontend/src/pages/finance/BankAccounts.css`
  3. `frontend/src/pages/finance/BankTransactions.jsx`
  4. `frontend/src/pages/finance/BankTransactions.css`
  5. `frontend/src/pages/finance/AllTransactions.jsx`
  6. `frontend/src/pages/finance/AllTransactions.css`
  7. `frontend/src/pages/finance/RecordTransaction.jsx`
  8. `frontend/src/pages/finance/RecordTransaction.css`
  9. `frontend/src/pages/finance/OtherIncomeList.jsx`
  10. `frontend/src/pages/finance/AddOtherIncome.jsx`

### FE-21: Expense Tracking, Category Allocation & Trips
- **Unit ID**: `FE-21`
- **Domain**: Finance Domain
- **Target Documentation**: `docs/architecture/frontend/FE-21_expense_tracking_category_allocation_trips.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/finance/ExpenseList.jsx`
  2. `frontend/src/pages/finance/ExpenseList.css`
  3. `frontend/src/pages/finance/AddExpense.jsx`
  4. `frontend/src/pages/finance/AddExpense.css`
  5. `frontend/src/pages/finance/ExpenseDetails.jsx`
  6. `frontend/src/pages/finance/ExpenseDetails.css`
  7. `frontend/src/pages/finance/ExpenseCategories.jsx`
  8. `frontend/src/pages/finance/ExpenseCategories.css`
  9. `frontend/src/pages/finance/TripList.jsx`
  10. `frontend/src/pages/finance/TripDetails.jsx`

### FE-22: Trip Management, Budgets & Recurring Expenses
- **Unit ID**: `FE-22`
- **Domain**: Finance Domain
- **Target Documentation**: `docs/architecture/frontend/FE-22_trip_management_budgets_recurring_expenses.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/finance/CreateTrip.jsx`
  2. `frontend/src/pages/finance/RecurringExpenses.jsx`
  3. `frontend/src/pages/finance/CategoryBudgets.jsx`
  4. `frontend/src/pages/finance/IncomeCategories.jsx`
  5. `frontend/src/pages/finance/ExpenseReport.jsx`
  6. `frontend/src/pages/finance/ProfitLossReport.jsx`
  7. `frontend/src/pages/finance/ProfitLossReport.css`
  8. `frontend/src/pages/finance/BalanceSheet.jsx`
  9. `frontend/src/pages/finance/CashFlowReport.jsx`
  10. `frontend/src/pages/finance/CashFlowReport.css`

### FE-23: Financial Statement Reports & Payroll Ledger
- **Unit ID**: `FE-23`
- **Domain**: Finance Domain
- **Target Documentation**: `docs/architecture/frontend/FE-23_financial_statement_reports_payroll_ledger.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/finance/TaxReport.jsx`
  2. `frontend/src/pages/finance/EmployeeExpenses.jsx`
  3. `frontend/src/pages/finance/EmployeeExpenses.css`
  4. `frontend/src/pages/finance/EmployeeExpenseDetail.jsx`
  5. `frontend/src/pages/finance/EmployeeSalaries.jsx`
  6. `frontend/src/pages/finance/EmployeeSalaries.css`
  7. `frontend/src/pages/finance/LenderList.jsx`
  8. `frontend/src/pages/finance/LenderList.css`
  9. `frontend/src/pages/finance/LenderDetails.jsx`
  10. `frontend/src/pages/finance/LenderDetails.css`

### FE-24: Loans, Debt Recovery & Legacy Ledger
- **Unit ID**: `FE-24`
- **Domain**: Finance & Settings
- **Target Documentation**: `docs/architecture/frontend/FE-24_loans_debt_recovery_legacy_ledger.md`
- **File Count**: 9 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/finance/LoanDetails.jsx`
  2. `frontend/src/pages/finance/LoanDetails.css`
  3. `frontend/src/pages/finance/LegacyDebtEntry.jsx`
  4. `frontend/src/pages/finance/LegacyDebtEntry.css`
  5. `frontend/src/pages/finance/LegacyDebtDashboard.jsx`
  6. `frontend/src/pages/finance/LegacyDebtDashboard.css`
  7. `frontend/src/pages/settings/SettingsIndex.jsx`
  8. `frontend/src/pages/settings/SettingsIndex.css`
  9. `frontend/src/pages/settings/shared.css`

### FE-25: Store Settings, System Info & Tax Configuration
- **Unit ID**: `FE-25`
- **Domain**: Settings Domain
- **Target Documentation**: `docs/architecture/frontend/FE-25_store_settings_system_info_tax_configuration.md`
- **File Count**: 9 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/settings/StoreSettings.jsx`
  2. `frontend/src/pages/settings/StoreSettings.css`
  3. `frontend/src/pages/settings/FinancialSettings.jsx`
  4. `frontend/src/pages/settings/FinancialSettings.css`
  5. `frontend/src/pages/settings/PaymentSettings.jsx`
  6. `frontend/src/pages/settings/ReceiptSettings.jsx`
  7. `frontend/src/pages/settings/ReceiptSettings.css`
  8. `frontend/src/pages/settings/NotificationSettings.jsx`
  9. `frontend/src/pages/settings/IntegrationSettings.jsx`

### FE-26: RBAC Administration & Data Management
- **Unit ID**: `FE-26`
- **Domain**: Settings Domain
- **Target Documentation**: `docs/architecture/frontend/FE-26_rbac_administration_data_management.md`
- **File Count**: 10 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/settings/EmployeeManagement.jsx`
  2. `frontend/src/pages/settings/EmployeeManagement.css`
  3. `frontend/src/pages/settings/RolesPermissions.jsx`
  4. `frontend/src/pages/settings/RolesPermissions.css`
  5. `frontend/src/pages/settings/DataManagement.jsx`
  6. `frontend/src/pages/settings/DataManagement.css`
  7. `frontend/src/pages/settings/SystemInfo.jsx`
  8. `frontend/src/pages/settings/SystemInfo.css`
  9. `frontend/src/pages/settings/GeographicBoundaries.jsx`
  10. `frontend/src/pages/settings/GeographicBoundaries.css`

### FE-27: Academic & Customer Hierarchy Settings
- **Unit ID**: `FE-27`
- **Domain**: Settings Domain
- **Target Documentation**: `docs/architecture/frontend/FE-27_academic_customer_hierarchy_settings.md`
- **File Count**: 9 files
- **Status**: - [ ] Unassigned / Ready for Documentation
- **Member Files**:
  1. `frontend/src/pages/settings/CustomerSettings.jsx`
  2. `frontend/src/pages/settings/CustomerSettings.css`
  3. `frontend/src/pages/settings/ManageSchools.jsx`
  4. `frontend/src/pages/settings/ManageClasses.jsx`
  5. `frontend/src/pages/settings/ManageDivisions.jsx`
  6. `frontend/src/pages/settings/ManageSubdivisions.jsx`
  7. `frontend/src/pages/settings/ManageGroups.jsx`
  8. `frontend/src/pages/settings/ManageTags.jsx`
  9. `frontend/src/pages/settings/ManageLinkTypes.jsx`

---

## Section 3: Summary Progress Dashboard

| Unit ID | Title | Domain | File Count | Target Documentation | Status |
|---|---|---|---|---|---|
| `EU-01` | Core Architecture & Sovereign Latch | Core & Infrastructure | 9 | `docs/architecture/backend/EU-01_core_architecture_latch.md` | - [ ] Pending |
| `EU-02` | Core Permissions, DB Routing & AZQL Engine | Core Framework | 10 | `docs/architecture/backend/EU-02_core_permissions_azql.md` | - [ ] Pending |
| `EU-03` | Account Identity, Authentication & OTP | Account & Auth | 10 | `docs/architecture/backend/EU-03_account_identity_otp.md` | - [ ] Pending |
| `EU-04` | Inventory Master Models, Pack Atomization & StockService | Inventory | 10 | `docs/architecture/backend/EU-04_inventory_master_stockservice.md` | - [ ] Pending |
| `EU-05` | Inventory API, Serializers & Catalog Ingestion | Inventory & Catalog | 10 | `docs/architecture/backend/EU-05_inventory_api_catalog.md` | - [ ] Pending |
| `EU-06` | Customer Aggregate, PostGIS Geodata & Wallets | Customers | 9 | `docs/architecture/backend/EU-06_customer_aggregate_geodata.md` | - [ ] Pending |
| `EU-07` | Customer Views, Spatial Boundaries & Prospecting | Customers & GIS | 9 | `docs/architecture/backend/EU-07_customer_views_spatial.md` | - [ ] Pending |
| `EU-08` | Order Aggregate, Receipts & Cloud Storage Integration | Orders & Storage | 10 | `docs/architecture/backend/EU-08_order_aggregate_receipts.md` | - [ ] Pending |
| `EU-09` | Order Views, Reminders & Lifecycle Tests | Orders | 9 | `docs/architecture/backend/EU-09_order_views_lifecycle.md` | - [ ] Pending |
| `EU-10` | Financial Ledger, Bank Transactions & LedgerService | Finance | 9 | `docs/architecture/backend/EU-10_financial_ledger_ledgerservice.md` | - [ ] Pending |
| `EU-11` | Financial Operations, Multi-DB & Cluster Maintenance | Finance & Operations | 10 | `docs/architecture/backend/EU-11_financial_ops_maintenance.md` | - [ ] Pending |
| `EU-12` | Procurement, Landed Cost & Freight Calculations | Procurement | 9 | `docs/architecture/backend/EU-12_procurement_landed_cost.md` | - [ ] Pending |
| `EU-13` | Outlet Consignment, Stock Transfers & Sales | Outlets | 9 | `docs/architecture/backend/EU-13_outlet_consignment_transfers.md` | - [ ] Pending |
| `EU-14` | Messaging Engine, WhatsApp API & Dispatch Gateway | Messaging | 10 | `docs/architecture/backend/EU-14_messaging_whatsapp_dispatch.md` | - [ ] Pending |
| `EU-15` | Settings, RBAC & Store Configurations | Settings & RBAC | 10 | `docs/architecture/backend/EU-15_settings_rbac_store.md` | - [ ] Pending |
| `EU-16` | Dashboard KPIs & Reports Routing Engine | Analytics & Reporting | 10 | `docs/architecture/backend/EU-16_dashboard_reports_routing.md` | - [ ] Pending |
| `EU-17` | Reporting Deep Analytics & AZQL Test Suite | Analytics & Reporting | 10 | `docs/architecture/backend/EU-17_reporting_azql_analytics.md` | - [ ] Pending |
| `EU-18` | Operational Tooling, Environment Hydration & Deployment | DevOps & Tooling | 10 | `docs/architecture/backend/EU-18_deployment_tooling_hydration.md` | - [ ] Pending |
| `FE-01` | Core SPA Shell & Build Configuration | Core Architecture | 10 | `docs/architecture/frontend/FE-01_core_spa_shell_build_configuration.md` | - [ ] Pending |
| `FE-02` | State, Auth & Security Foundations | Authentication & Security | 10 | `docs/architecture/frontend/FE-02_state_auth_security_foundations.md` | - [ ] Pending |
| `FE-03` | Application Layout & Navigation Infrastructure | Layout & Navigation | 10 | `docs/architecture/frontend/FE-03_application_layout_navigation_infrastructure.md` | - [ ] Pending |
| `FE-04` | OmniSearch, Notifications & Common Utilities | Common UI & Utilities | 10 | `docs/architecture/frontend/FE-04_omnisearch_notifications_common_utilities.md` | - [ ] Pending |
| `FE-05` | PWA, Offline, Diagnostics & UI Primitives | PWA & Offline Services | 10 | `docs/architecture/frontend/FE-05_pwa_offline_diagnostics_ui_primitives.md` | - [ ] Pending |
| `FE-06` | Common UI Widgets, Feedback & Shared Controls | Common UI Components | 9 | `docs/architecture/frontend/FE-06_common_ui_widgets_feedback_shared_controls.md` | - [ ] Pending |
| `FE-07` | Universal Payment Engine & Core POS Checkout | POS & Orders | 8 | `docs/architecture/frontend/FE-07_universal_payment_engine_core_pos_checkout.md` | - [ ] Pending |
| `FE-08` | Order Management, Receipts & Order History | POS & Orders | 10 | `docs/architecture/frontend/FE-08_order_management_receipts_order_history.md` | - [ ] Pending |
| `FE-09` | Returns, Refunds & Outlets Consignment Engine | Orders & Outlets | 9 | `docs/architecture/frontend/FE-09_returns_refunds_outlets_consignment_engine.md` | - [ ] Pending |
| `FE-10` | Outlets Modals & Stock Movement Transactions | Outlets & Procurement | 9 | `docs/architecture/frontend/FE-10_outlets_modals_stock_movement_transactions.md` | - [ ] Pending |
| `FE-11` | Procurement Services & Inventory Catalog | Procurement & Inventory | 9 | `docs/architecture/frontend/FE-11_procurement_services_inventory_catalog.md` | - [ ] Pending |
| `FE-12` | Inventory Stock Control & Product Components | Inventory Domain | 10 | `docs/architecture/frontend/FE-12_inventory_stock_control_product_components.md` | - [ ] Pending |
| `FE-13` | Customer Directory, Profiling & Registration | Customer Domain | 9 | `docs/architecture/frontend/FE-13_customer_directory_profiling_registration.md` | - [ ] Pending |
| `FE-14` | Customer GIS, Mapping & Geographic Demographics | Customer Domain | 9 | `docs/architecture/frontend/FE-14_customer_gis_mapping_geographic_demographics.md` | - [ ] Pending |
| `FE-15` | Dashboard Hub, Analytics & Executive Metrics | Dashboard & Auth Pages | 10 | `docs/architecture/frontend/FE-15_dashboard_hub_analytics_executive_metrics.md` | - [ ] Pending |
| `FE-16` | Dashboard Performance Widgets & Sales Visualizations | Dashboard & Reports | 10 | `docs/architecture/frontend/FE-16_dashboard_performance_widgets_sales_visualizations.md` | - [ ] Pending |
| `FE-17` | Reports Hub, Sales Analytics & Data Export | Reports Domain | 10 | `docs/architecture/frontend/FE-17_reports_hub_sales_analytics_data_export.md` | - [ ] Pending |
| `FE-18` | AZQL Query Playground & Visual Blockly Workspace | Reports & Messaging | 10 | `docs/architecture/frontend/FE-18_azql_query_playground_visual_blockly_workspace.md` | - [ ] Pending |
| `FE-19` | Messaging Center & Core Finance Overview | Messaging & Finance | 10 | `docs/architecture/frontend/FE-19_messaging_center_core_finance_overview.md` | - [ ] Pending |
| `FE-20` | Banking Ledgers, Cash Wallets & Transactions | Finance Domain | 10 | `docs/architecture/frontend/FE-20_banking_ledgers_cash_wallets_transactions.md` | - [ ] Pending |
| `FE-21` | Expense Tracking, Category Allocation & Trips | Finance Domain | 10 | `docs/architecture/frontend/FE-21_expense_tracking_category_allocation_trips.md` | - [ ] Pending |
| `FE-22` | Trip Management, Budgets & Recurring Expenses | Finance Domain | 10 | `docs/architecture/frontend/FE-22_trip_management_budgets_recurring_expenses.md` | - [ ] Pending |
| `FE-23` | Financial Statement Reports & Payroll Ledger | Finance Domain | 10 | `docs/architecture/frontend/FE-23_financial_statement_reports_payroll_ledger.md` | - [ ] Pending |
| `FE-24` | Loans, Debt Recovery & Legacy Ledger | Finance & Settings | 9 | `docs/architecture/frontend/FE-24_loans_debt_recovery_legacy_ledger.md` | - [ ] Pending |
| `FE-25` | Store Settings, System Info & Tax Configuration | Settings Domain | 9 | `docs/architecture/frontend/FE-25_store_settings_system_info_tax_configuration.md` | - [ ] Pending |
| `FE-26` | RBAC Administration & Data Management | Settings Domain | 10 | `docs/architecture/frontend/FE-26_rbac_administration_data_management.md` | - [ ] Pending |
| `FE-27` | Academic & Customer Hierarchy Settings | Settings Domain | 9 | `docs/architecture/frontend/FE-27_academic_customer_hierarchy_settings.md` | - [ ] Pending |

---
*Autogenerated and mathematically verified by Worker M1 against Neon DB & Sovereign Codebase manifests.*
