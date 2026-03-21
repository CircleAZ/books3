# AZ Books: Global Roles & Permissions Matrix

This document defines the comprehensive matrix of permissions spanning the entire AZ Books ERP. It is derived from the requirement specifications detailed in `P4.md` and aligns with the 6 Categories native to the backend `Permission` model (`inventory`, `customers`, `orders`, `reports`, `settings`, `finance`).

---

## 1. System Default Roles

The AZ Books system ships with four core system roles (`is_system=True`). These default roles form the baseline for security and cannot be deleted, but permissions can be adjusted marginally by Super Admins.

1.  **Admin / Store Owner (`admin`)**: Absolute control over all applications, settings, billing, destructive actions, and data exports.
2.  **Store Manager (`manager`)**: Full operational control over inventory, customer relations, employee expense approvals, and daily POS use, but restricted from altering system configurations, deleting users, or viewing total organization-wide profitability reports.
3.  **Accountant / Bookkeeper (`accountant`)**: Full access to the Finance Module, Reports Module, and view-only access to orders and inventory. Cannot change stock or process active POS transactions.
4.  **Cashier / Sales Staff (`cashier`)**: Strictly limited to POS execution (creating orders), maintaining the customer rolodex, and viewing product inventory. No access to reports, settings, or core finance modules.

---

## 2. Granular Permissions Layout

### Module 1: Dashboard (`dashboard.*`)
| Specific Action / Feature | Permission Codename | Admin | Manager | Accountant | Cashier |
| :--- | :--- | :---: | :---: | :---: | :---: |
| View default global KPIs (Sales, Orders) | `dashboard.view_kpi` | ✅ | ✅ | ❌ | ❌ |
| View Low Stock Alert Badges | `dashboard.view_stock_alerts` | ✅ | ✅ | ❌ | ✅ |
| View Financial Health Widgets | `dashboard.view_financial_health`| ✅ | ❌ | ✅ | ❌ |

---

### Module 2: Orders & POS (`orders.*`)
| Specific Action / Feature | Permission Codename | Admin | Manager | Accountant | Cashier |
| :--- | :--- | :---: | :---: | :---: | :---: |
| Launch POS & Create Orders | `orders.create_orders` | ✅ | ✅ | ❌ | ✅ |
| View All Order History | `orders.view_all_orders` | ✅ | ✅ | ✅ | ❌ |
| View Only Own Created Orders | `orders.view_own_orders` | ✅ | ✅ | ❌ | ✅ |
| Edit Active Order Lines | `orders.edit_orders` | ✅ | ✅ | ❌ | ❌ |
| Cancel Draft / Active Orders | `orders.cancel_orders` | ✅ | ✅ | ❌ | ❌ |
| Process Refunds and Returns | `orders.manage_returns` | ✅ | ✅ | ❌ | ❌ |
| Apply Custom Order Discounts | `orders.apply_discounts` | ✅ | ✅ | ❌ | ❌ |

---

### Module 3: Inventory Management (`inventory.*`)
| Specific Action / Feature | Permission Codename | Admin | Manager | Accountant | Cashier |
| :--- | :--- | :---: | :---: | :---: | :---: |
| View Product Catalog & Prices | `inventory.view_products` | ✅ | ✅ | ✅ | ✅ |
| Create New Products | `inventory.create_products` | ✅ | ✅ | ❌ | ❌ |
| Edit Product Details & Prices | `inventory.edit_products` | ✅ | ✅ | ❌ | ❌ |
| Perform Manual Stock Adjustments| `inventory.adjust_stock` | ✅ | ✅ | ❌ | ❌ |
| Add/Edit Categories & Vendors | `inventory.manage_taxonomy` | ✅ | ✅ | ❌ | ❌ |
| View/Restore Deleted Products | `inventory.view_deleted` | ✅ | ✅ | ❌ | ❌ |
| Permanently Delete Products | `inventory.delete_products` | ✅ | ❌ | ❌ | ❌ |

---

### Module 4: Customer Management (`customers.*`)
| Specific Action / Feature | Permission Codename | Admin | Manager | Accountant | Cashier |
| :--- | :--- | :---: | :---: | :---: | :---: |
| View Global Customer Directory | `customers.view_directory` | ✅ | ✅ | ❌ | ✅ |
| Add New Customer Profiles | `customers.create_customers`| ✅ | ✅ | ❌ | ✅ |
| Edit Customer Information | `customers.edit_customers` | ✅ | ✅ | ❌ | ✅ |
| Manage Customer Groups & Tags | `customers.manage_tags` | ✅ | ✅ | ❌ | ❌ |
| View Customer Financial History | `customers.view_history` | ✅ | ✅ | ✅ | ❌ |
| Delete Customer Data | `customers.delete_customers`| ✅ | ❌ | ❌ | ❌ |

---

### Module 5: Finance & Accounting (`finance.*`)
| Specific Action / Feature | Permission Codename | Admin | Manager | Accountant | Cashier |
| :--- | :--- | :---: | :---: | :---: | :---: |
| View Finance Dashboard / Ledgers| `finance.view_overview` | ✅ | ✅ | ✅ | ❌ |
| Log & Edit General Expenses | `finance.manage_expenses` | ✅ | ✅ | ✅ | ❌ |
| Approve Org Expenses | `finance.approve_expenses`| ✅ | ✅ | ❌ | ❌ |
| Process Outgoing Payments | `finance.pay_expenses` | ✅ | ✅ | ✅ | ❌ |
| Submit Own Staff Reimbursements | `finance.submit_own_claims`| ✅ | ✅ | ✅ | ✅ |
| Review/Approve Staff Claims | `finance.review_staff_claims`| ✅ | ✅ | ❌ | ❌ |
| Manage Bank Account Balances | `finance.manage_banking` | ✅ | ❌ | ✅ | ❌ |
| Manage Lenders and Loans | `finance.manage_loans` | ✅ | ❌ | ✅ | ❌ |
| View / Disburse Staff Salaries | `finance.manage_salaries` | ✅ | ✅ | ❌ | ❌ |
| Define Global Company Budgets | `finance.manage_budgets` | ✅ | ✅ | ❌ | ❌ |
| Audit Trip Finance Data | `finance.manage_trips` | ✅ | ✅ | ✅ | ❌ |

---

### Module 6: Reports & Analytics (`reports.*`)
| Specific Action / Feature | Permission Codename | Admin | Manager | Accountant | Cashier |
| :--- | :--- | :---: | :---: | :---: | :---: |
| View Sales Summaries | `reports.view_sales` | ✅ | ✅ | ❌ | ❌ |
| View Inventory Valuation | `reports.view_inventory` | ✅ | ✅ | ✅ | ❌ |
| View Customer Analytics (CLV) | `reports.view_customers` | ✅ | ✅ | ❌ | ❌ |
| View Profit/Loss Statements | `reports.view_financials` | ✅ | ❌ | ✅ | ❌ |
| Export Data (CSV/Excel/PDF) | `reports.export_data` | ✅ | ✅ | ✅ | ❌ |

---

### Module 7: Settings & Configuration (`settings.*`)
| Specific Action / Feature | Permission Codename | Admin | Manager | Accountant | Cashier |
| :--- | :--- | :---: | :---: | :---: | :---: |
| Edit Store Name, Logo, Address | `settings.store_config` | ✅ | ❌ | ❌ | ❌ |
| Manage Payment Methods (UPI/Cash)| `settings.payment_config` | ✅ | ❌ | ❌ | ❌ |
| Manage Tax Percentage Rules | `settings.tax_config` | ✅ | ❌ | ✅ | ❌ |
| Create User / Change Password | `settings.manage_users` | ✅ | ❌ | ❌ | ❌ |
| Configure Role/Permission Matrix| `settings.manage_roles` | ✅ | ❌ | ❌ | ❌ |
| Backup to Cloud / Restore DB | `settings.data_management` | ✅ | ❌ | ❌ | ❌ |

---

## 3. Dynamic Override Rules (Business Logic Gates)

Permissions alone are insufficient; explicit business logic guards must remain at the API Model level in Django regardless of `Permission` possession:

1. **Anti-Fraud Override**: A user with `finance.approve_expenses` CANNOT approve an expense request if `created_by == self.user`. Returns `403 Forbidden`.
2. **Isolation Override**: A user with `finance.submit_own_claims` calling `/api/finance/employee-expenses/` will ONLY have their queryset filtered down to `employee=self.user`. Trying to view ID's not belonging to them returns `404 Not Found`.
3. **Draft Safety Override**: A user with `orders.edit_orders` CANNOT edit an Order that possesses the status `Completed` or `Delivered`. They must exclusively use the Returns/Refund engine.
