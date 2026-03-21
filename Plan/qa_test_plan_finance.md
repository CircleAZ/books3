# Finance Module — Regression Test Plan

## Test Strategy Overview

### Scope
Complete manual regression testing of the Finance module within the AZ Books POS/ERP application. Covers 23 routes spanning expense management, banking, lending, budgets, reports, and employee payroll.

### Environment
| Parameter | Value |
|-----------|-------|
| App URL | `http://localhost:5173` |
| Backend | Django REST Framework on port 8000 |
| Frontend | React + Vite |
| Credentials | `admin` / `admin` |
| Browser | Chromium-based (latest) |

### Risk Matrix
| Risk Area | Business Impact | Failure Probability | Priority |
|-----------|----------------|---------------------|----------|
| Expense Approval Workflow | Critical | Medium | P0 |
| Payment Processing | Critical | Medium | P0 |
| Financial Report Accuracy | Critical | Low | P0 |
| Bank Balance Calculations | High | Medium | P1 |
| Loan EMI Calculations | High | Low | P1 |
| Budget Utilization Display | Medium | Low | P2 |
| CRUD Operations (all) | Medium | Low | P2 |
| UI Responsiveness | Low | Medium | P3 |

---

## Section 1: Finance Dashboard

**Scope:** Verify the Financial Dashboard loads with accurate summary metrics from aggregated backend data.

| TC# | Test Case | Preconditions | Steps | Expected Result | Priority |
|-----|-----------|---------------|-------|-----------------|----------|
| 1.1 | Dashboard loads with metrics | Logged in as admin | Navigate to `/finance/dashboard` | Page loads with Revenue, Expenses, Net Profit, Outstanding cards | P1 |
| 1.2 | Metrics reflect real data | At least 1 expense and 1 order exist | Load dashboard; compare displayed totals with expense list totals | Metrics match sum of underlying records | P0 |
| 1.3 | Quick links navigate correctly | On dashboard | Click each quick-link card (Expenses, Banking, Reports, etc.) | Each link navigates to the correct sub-page | P2 |
| 1.4 | Dashboard handles zero data | No expenses/orders in system | Load dashboard | Shows ₹0.00 for all metrics; no errors or NaN | P1 |
| 1.5 | Dashboard after session expiry | Session has expired | Navigate to dashboard | Redirects to login page; no 500 error | P1 |
| 1.6 | Recent activity section | Multiple recent transactions exist | Load dashboard | Shows latest 5-10 transactions in chronological order | P2 |

---

## Section 2: Expense Management (CRUD + Filters)

**Scope:** Full lifecycle of company expenses — create, view, edit, filter, paginate, and delete.

| TC# | Test Case | Preconditions | Steps | Expected Result | Priority |
|-----|-----------|---------------|-------|-----------------|----------|
| 2.1 | Expense list loads | Logged in | Navigate to `/finance/expenses` | Table shows columns: Payee, Category, Amount, Tax, Total, Status, Actions | P1 |
| 2.2 | Create expense (happy path) | Category exists | Click "+ Add Expense"; fill Date, Category, Payee=Vendor, Name="ABC Corp", Amount=2000; Submit | Expense created; redirected to list; new expense visible | P0 |
| 2.3 | Create expense — missing required fields | On Add Expense form | Leave Payee Name blank; click Save | Validation error shown; form not submitted | P1 |
| 2.4 | Create expense — zero amount | On Add Expense form | Enter Amount=0; click Save | Validation error: amount must be > 0 | P1 |
| 2.5 | Create expense — negative amount | On Add Expense form | Enter Amount=-500; click Save | Validation error shown | P1 |
| 2.6 | Edit existing expense | Expense exists | Click Edit icon on expense row; change amount to 3000; Save | Amount updates to ₹3,000; total recalculates | P1 |
| 2.7 | Filter by category | Multiple categories exist | Select "Premium Supplies" from Category dropdown | Only expenses with that category shown | P2 |
| 2.8 | Filter by status | Mix of paid/unpaid expenses | Select "Unpaid" from Status dropdown | Only unpaid expenses shown | P2 |
| 2.9 | Filter by date range | Expenses across multiple dates | Set From Date and To Date; apply | Only expenses within range shown | P2 |
| 2.10 | Pagination | >10 expenses exist | Navigate to page 2 using Next/Previous buttons | Next page of expenses loads; Previous returns to page 1 | P2 |
| 2.11 | View expense detail | Expense exists | Click View icon on expense row | Detail page loads with full expense info, payment form, and approval section | P1 |

---

## Section 3: Expense Approval Workflow

**Scope:** Verify the critical ₹5,000 threshold logic, approval/rejection flow, and payment blocking.

| TC# | Test Case | Preconditions | Steps | Expected Result | Priority |
|-----|-----------|---------------|-------|-----------------|----------|
| 3.1 | Auto-approval below threshold | None | Create expense with Amount=4999 | Status = "Auto-Approved"; payment form is visible | P0 |
| 3.2 | Pending approval at threshold | None | Create expense with Amount=5000 | Status = "Pending Approval"; Approve/Reject buttons visible | P0 |
| 3.3 | Pending approval above threshold | None | Create expense with Amount=10000 | Status = "Pending Approval"; payment blocked message shown | P0 |
| 3.4 | Approve pending expense | Pending expense exists | Click "Approve Expense" on detail page | Status changes to "Approved"; payment form becomes visible | P0 |
| 3.5 | Reject pending expense | Pending expense exists | Click "Reject Expense"; enter reason "Budget exceeded"; Confirm | Status changes to "Rejected"; payment section shows "Cannot pay rejected expense" | P0 |
| 3.6 | Reject without reason | Pending expense exists | Click "Reject"; leave reason blank; Confirm | Validation: rejection reason required | P1 |
| 3.7 | Payment blocked on pending | Pending expense exists | View expense detail | Payment form shows "Payment blocked until expense is approved" | P0 |
| 3.8 | Payment blocked on rejected | Rejected expense exists | View expense detail | Payment section shows "Cannot pay a rejected expense" | P0 |
| 3.9 | Edit expense above threshold | Auto-approved expense at ₹3,000 | Edit amount to ₹6,000; Save | Approval status changes from auto_approved to pending | P0 |
| 3.10 | Record payment on approved | Approved expense (₹7,500) | Fill payment form: Amount=7500, Method=Cash; Submit | Payment recorded; status changes to "Paid"; paid_amount = 7500 | P0 |
| 3.11 | Partial payment | Approved expense (₹10,000) | Record payment of ₹3,000 | Status = "Partially Paid"; balance due = ₹7,000 | P1 |

---

## Section 4: Expense Categories

**Scope:** CRUD operations on expense categories + toggle active/inactive.

| TC# | Test Case | Preconditions | Steps | Expected Result | Priority |
|-----|-----------|---------------|-------|-----------------|----------|
| 4.1 | Categories list loads | Logged in | Navigate to `/finance/categories` | Shows category cards with name, description, expense count, toggle | P1 |
| 4.2 | Create new category | On categories page | Click "+ New Category"; fill Name="Travel", Description="Business travel"; Save | New category card appears | P1 |
| 4.3 | Create duplicate category | Category "Travel" exists | Try to create another "Travel" category | Error: category name must be unique | P1 |
| 4.4 | Edit category | Category exists | Click Edit icon; change name to "Business Travel"; Save | Name updates on the card | P2 |
| 4.5 | Toggle category inactive | Active category exists | Click the toggle switch to OFF | Category shows "Inactive"; not available in expense form dropdown | P1 |
| 4.6 | Toggle category active | Inactive category exists | Click the toggle switch to ON | Category shows "Active"; available again in dropdown | P2 |
| 4.7 | Delete category with no expenses | Category with 0 expenses | Click Delete icon; confirm | Category removed from list | P2 |
| 4.8 | Delete category with expenses | Category linked to expenses | Click Delete icon; confirm | Error: cannot delete category with associated expenses | P1 |

---

## Section 5: Employee Expenses

**Scope:** Employee expense claim submission, listing, and status tracking.

| TC# | Test Case | Preconditions | Steps | Expected Result | Priority |
|-----|-----------|---------------|-------|-----------------|----------|
| 5.1 | Employee expenses list loads | Logged in | Navigate to `/finance/employee-expenses` | Page loads with "Submit New Expense" button and list/empty state | P1 |
| 5.2 | Submit expense via modal | On employee expenses page | Click "Submit New Expense"; fill Category, Amount=750, Description="Lunch"; Submit | Claim appears in list with "Pending" status | P0 |
| 5.3 | Submit with missing fields | Modal is open | Leave amount blank; click Submit | Validation error; modal stays open | P1 |
| 5.4 | Submit with zero amount | Modal is open | Enter Amount=0; Submit | Validation error: must be > 0 | P1 |
| 5.5 | Expense appears with correct status | Claim submitted | Check the list | Shows employee name, amount, date, and "Pending" badge | P1 |
| 5.6 | Multiple submissions | On employee expenses page | Submit 3 different claims | All 3 appear in the list in chronological order | P2 |
| 5.7 | Empty state display | No claims exist | Navigate to page | Shows "No expense claims found" message | P2 |

---

## Section 6: Employee Salaries

**Scope:** Salary record management — list, create, and process salary payments.

| TC# | Test Case | Preconditions | Steps | Expected Result | Priority |
|-----|-----------|---------------|-------|-----------------|----------|
| 6.1 | Salary list loads | Logged in | Navigate to `/finance/salaries` | Shows table with Employee, Month/Year, Base, Net, Status columns | P1 |
| 6.2 | Create salary record | Employees exist | Click "Add Salary"; fill Employee, Month=March, Year=2026, Base=50000, Allowances=5000, Deductions=2000; Save | Record created; net_salary = ₹53,000 | P0 |
| 6.3 | Duplicate salary period | Salary for March 2026 exists | Try creating another for same employee, month, year | Error: duplicate salary record for this period | P1 |
| 6.4 | Edit salary record | Record exists | Click Edit; change base_salary to 55000; Save | Net recalculates; record updates | P2 |
| 6.5 | Process payment | Unpaid salary exists | Click "Pay" action; confirm | Status changes to "Paid" | P1 |
| 6.6 | Net salary calculation | On create form | Enter Base=50000, Allowances=10000, Deductions=5000 | Net = ₹55,000 (base + allowances - deductions) | P0 |

---

## Section 7: Banking

**Scope:** Bank account CRUD, transaction recording, and balance tracking.

| TC# | Test Case | Preconditions | Steps | Expected Result | Priority |
|-----|-----------|---------------|-------|-----------------|----------|
| 7.1 | Bank accounts list loads | Logged in | Navigate to `/finance/banking` | Shows accounts with name, bank, balance, status | P1 |
| 7.2 | Create bank account | On banking page | Click "+ Add Account"; fill Name="SBI Main", Bank="SBI", Account=XXXX1234, Opening Balance=50000; Save | Account created; current_balance = ₹50,000 | P0 |
| 7.3 | Bank balance shows correctly | Account exists with opening_balance | View account in list | Shows correct ₹ amount (no NaN) | P0 |
| 7.4 | Record deposit | Account exists | Navigate to `/finance/banking/record`; select account, Type=Deposit, Amount=10000; Save | Transaction recorded; current_balance increases by ₹10,000 | P0 |
| 7.5 | Record withdrawal | Account with balance | Record Type=Withdrawal, Amount=5000 | Balance decreases by ₹5,000 | P0 |
| 7.6 | Withdrawal exceeding balance | Account with ₹5,000 balance | Try to withdraw ₹6,000 | Error or warning: insufficient balance | P1 |
| 7.7 | Transaction list loads | Transactions recorded | Navigate to `/finance/banking/transactions` | Shows all transactions with Date, Type, Amount, Account, Description | P1 |
| 7.8 | Zero amount transaction | On record form | Enter Amount=0; Submit | Validation error | P1 |
| 7.9 | Negative amount transaction | On record form | Enter Amount=-100; Submit | Validation error | P1 |
| 7.10 | Balance after soft-delete | Transaction exists | Soft-delete a deposit transaction | Balance reverts by the deposit amount | P1 |

---

## Section 8: Lenders & Loans

**Scope:** Lender management, loan creation, EMI calculation, and repayment tracking.

| TC# | Test Case | Preconditions | Steps | Expected Result | Priority |
|-----|-----------|---------------|-------|-----------------|----------|
| 8.1 | Lender list loads | Logged in | Navigate to `/finance/lenders` | Shows lender cards with name, type, contact | P1 |
| 8.2 | Create lender | On lenders page | Click "+ Add Lender"; fill Name="ICICI", Type="Bank"; Save | Lender card appears | P1 |
| 8.3 | View lender detail | Lender exists | Click on lender card | Detail page shows lender info and associated loans | P1 |
| 8.4 | Create loan | Lender exists | On lender detail, click "Add Loan"; fill Principal=100000, Rate=12%, Term=12mo; Save | Loan created; principal shows ₹1,00,000 (not NaN) | P0 |
| 8.5 | Loan EMI calculation | Loan exists | View loan detail | EMI calculated correctly using compound interest formula | P0 |
| 8.6 | Record repayment | Loan exists | Click "Record Repayment"; fill Amount=10000, Principal=8000, Interest=2000; Save | Repayment recorded; outstanding decreases | P0 |
| 8.7 | Loan with zero term | On loan form | Enter term_months=0; Submit | Validation error: term must be ≥ 1 | P1 |
| 8.8 | Overpayment guard | Loan outstanding = ₹5,000 | Try repayment of ₹6,000 | Error: payment exceeds outstanding balance | P1 |
| 8.9 | Loan principal field name | Loan exists | View loan detail page | Shows "Principal Amount" with correct ₹ value (uses principal_amount field) | P0 |
| 8.10 | Multiple loans per lender | Lender with 1 loan | Create a second loan | Both loans visible on lender detail page | P2 |

---

## Section 9: Recurring Expenses

**Scope:** CRUD for recurring expense rules, on-demand generation, and frequency validation.

| TC# | Test Case | Preconditions | Steps | Expected Result | Priority |
|-----|-----------|---------------|-------|-----------------|----------|
| 9.1 | Recurring list loads | Logged in | Navigate to `/finance/recurring` | Shows recurring expense cards with name, amount, frequency, next due | P1 |
| 9.2 | Create recurring expense | Category exists | Click "+ New Recurring"; fill Name="Internet", Category, Amount=999, Frequency=Monthly; Save | Card appears with next_due_date set | P1 |
| 9.3 | Edit recurring expense | Recurring exists | Click Edit; change Amount to 1200; Save | Amount updates on the card | P2 |
| 9.4 | Generate expense on-demand | Recurring with past due date | Click "Generate" button | Expense created in expense list; next_due_date advances by frequency | P0 |
| 9.5 | Delete recurring expense | Recurring exists | Click Delete; confirm | Card removed from list; no validation error | P1 |
| 9.6 | Toggle active/inactive | Active recurring exists | Toggle to inactive | Status changes; generation button disabled | P2 |
| 9.7 | Duplicate name validation | "Internet" recurring exists | Try creating another with same name | Error or allowed (document actual behavior) | P2 |

---

## Section 10: Category Budgets

**Scope:** Budget management, utilization display, and overspend warning indicators.

| TC# | Test Case | Preconditions | Steps | Expected Result | Priority |
|-----|-----------|---------------|-------|-----------------|----------|
| 10.1 | Budget list loads | Logged in | Navigate to `/finance/budgets` | Shows budget cards with category, amount, period, utilization | P1 |
| 10.2 | Create budget | Category exists | Click "+ New Budget"; select Category, Amount=50000, Period=Monthly; Save | Budget card appears with 0% utilization | P1 |
| 10.3 | Utilization updates | Budget exists; expenses in that category | View budget card | Utilization % reflects (actual spend / budget) × 100 | P0 |
| 10.4 | Overspend warning (red) | Expense total > budget amount | View budget card | Utilization bar turns red; shows > 100% | P0 |
| 10.5 | Edit budget amount | Budget exists | Click Edit; change amount to 30000; Save | Amount updates; utilization % recalculates | P2 |
| 10.6 | Delete budget | Budget exists | Click Delete; confirm | Budget removed from list | P2 |
| 10.7 | Zero budget amount | On create form | Enter Amount=0; Save | Validation error | P1 |

---

## Section 11: Income Categories

**Scope:** CRUD for income categories with toggle active/inactive.

| TC# | Test Case | Preconditions | Steps | Expected Result | Priority |
|-----|-----------|---------------|-------|-----------------|----------|
| 11.1 | Income categories list loads | Logged in | Navigate to `/finance/income-categories` | Shows category list with name, description, status | P1 |
| 11.2 | Create income category | On page | Click "+ New Category"; fill Name="Consulting", Description="Service fees"; Save | Category appears in list | P1 |
| 11.3 | Duplicate name | "Consulting" exists | Try creating another "Consulting" | Error: name must be unique | P1 |
| 11.4 | Edit category | Category exists | Click Edit; change description; Save | Description updates | P2 |
| 11.5 | Toggle inactive | Active category | Toggle switch to OFF | Status changes to Inactive | P2 |
| 11.6 | Delete income category | Category exists | Click Delete; confirm | Category removed | P2 |

---

## Section 12: Financial Reports

**Scope:** All 5 report pages load with correct data, period filtering works.

| TC# | Test Case | Preconditions | Steps | Expected Result | Priority |
|-----|-----------|---------------|-------|-----------------|----------|
| 12.1 | Reports index loads | Logged in | Navigate to `/finance/reports` | Shows report cards linking to P&L, Cash Flow, Balance Sheet, Expense, Tax | P1 |
| 12.2 | P&L loads with data | Orders and expenses exist | Navigate to P&L report | Shows Revenue, COGS, Gross Profit, Expenses breakdown, Net Profit | P0 |
| 12.3 | Cash Flow loads | Payments and expenses exist | Navigate to Cash Flow | Shows Operating, Investing, Financing activities | P0 |
| 12.4 | Balance Sheet loads | Asset/liability data exists | Navigate to Balance Sheet | Shows Assets, Liabilities, Equity with correct totals | P0 |
| 12.5 | Expense Report loads | Expenses exist | Navigate to Expense Report | Shows Summary, By Category, By Payment Status, By Approval Status | P0 |
| 12.6 | Tax Report loads | Tax data exists | Navigate to Tax Report | Shows sales tax collected, input credits, net liability | P1 |
| 12.7 | Period selector (Month → Year) | On any report | Change period from "This Month" to "This Year" | Report data refreshes with full year range | P1 |
| 12.8 | Report with no data | No transactions in period | Select a future date period | Shows ₹0.00 values; no errors | P1 |
| 12.9 | P&L accuracy cross-check | Known expense total | Compare P&L operational expenses with expense list sum | Values match | P0 |

---

## Section 13: Cross-Cutting Concerns

**Scope:** Horizontal concerns spanning all Finance pages.

| TC# | Test Case | Preconditions | Steps | Expected Result | Priority |
|-----|-----------|---------------|-------|-----------------|----------|
| 13.1 | Session expiry handling | Session has expired | Attempt any CRUD operation | Redirected to login; no 500 error or broken page | P1 |
| 13.2 | Browser back/forward | On expense detail page | Click browser back button | Returns to expense list (not broken state) | P2 |
| 13.3 | Currency formatting | Amounts exist | Check any amount display | Uses ₹ symbol with Indian numeral grouping (e.g., ₹1,00,000.00) | P2 |
| 13.4 | Toast notifications | Perform any CRUD operation | Create/edit/delete an entity | Success/error toast appears (no alert() popups) | P2 |
| 13.5 | Error boundary | Force an API error (e.g., disconnect server) | Navigate to any finance page | Shows user-friendly error message with retry button; no white screen | P1 |
| 13.6 | NaN guard | View bank balances, loan principals | Check all numeric displays | No NaN, undefined, or null displayed; all show ₹0.00 as fallback | P0 |

---

## Summary

| Section | Test Cases | P0 | P1 | P2 | P3 |
|---------|-----------|----|----|----|----|
| 1. Dashboard | 6 | 1 | 3 | 2 | 0 |
| 2. Expense CRUD | 11 | 1 | 6 | 4 | 0 |
| 3. Approval Workflow | 11 | 8 | 2 | 1 | 0 |
| 4. Categories | 8 | 0 | 4 | 4 | 0 |
| 5. Employee Expenses | 7 | 1 | 3 | 3 | 0 |
| 6. Salaries | 6 | 2 | 2 | 2 | 0 |
| 7. Banking | 10 | 3 | 5 | 2 | 0 |
| 8. Lenders & Loans | 10 | 4 | 3 | 3 | 0 |
| 9. Recurring | 7 | 1 | 3 | 3 | 0 |
| 10. Budgets | 7 | 2 | 2 | 3 | 0 |
| 11. Income Categories | 6 | 0 | 3 | 3 | 0 |
| 12. Reports | 9 | 4 | 4 | 1 | 0 |
| 13. Cross-Cutting | 6 | 1 | 2 | 3 | 0 |
| **TOTAL** | **104** | **28** | **42** | **34** | **0** |
