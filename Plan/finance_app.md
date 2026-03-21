# AZ Books — Finance & Accounting Module (Complete Documentation)

**Status**: Fully Implemented  
**Django App**: `finance`  
**Frontend**: 23 React pages under `frontend/src/pages/finance/`

---

## 1. What This Module Does

The Finance app handles **all money-related tracking** for the business. Think of it as the bookkeeper that knows:
- Where money is going (expenses)
- Where money is coming from (sales revenue + other income)
- How much is in the bank (banking)
- Who you owe (lenders/loans)
- What employees are owed (salaries, reimbursements)
- Monthly bills that repeat automatically (recurring expenses)
- Whether you're spending too much per category (budgets)
- The full financial picture (5 reports: P&L, Cash Flow, Balance Sheet, Expense Report, Tax Report)

---

## 2. Database Models (16 Total)

All models use UUID primary keys. Most use `SoftDeleteModel` (records are marked deleted, not actually removed). Timestamps (`created_at`, `updated_at`) are auto-managed.

### 2.1 ExpenseCategory
*Where: `finance/models.py` line 14*

Organizes expenses into named groups (e.g. "Office Supplies", "Travel", "Utilities").

| Field | Type | Notes |
|-------|------|-------|
| `name` | CharField(100) | Unique, required |
| `icon` | CharField(50) | Emoji/icon name, default `'receipt'` |
| `description` | TextField | Optional |
| `is_active` | Boolean | Can be toggled on/off, default True |

### 2.2 Expense
*Where: `finance/models.py` line 31*

The main record for any company spending. This is the **central model** of the finance app.

| Field | Type | Notes |
|-------|------|-------|
| `date` | DateField | When the expense happened, indexed |
| `category` | FK → ExpenseCategory | Required, protected from deletion |
| `payee_type` | Choices | `vendor`, `employee`, `lender`, `other` |
| `payee_name` | CharField(200) | Name of who you're paying |
| `payee_id` | UUID | Optional link to actual vendor/employee/lender record |
| `description` | TextField | Optional details |
| `amount` | Decimal(12,2) | Base amount, must be > 0 |
| `tax_amount` | Decimal(12,2) | Tax on top, default 0 |
| `total_amount` | Decimal(12,2) | Auto-calculated: `amount + tax_amount` |
| `payment_status` | Choices | `unpaid` (default), `partial`, `paid` |
| `approval_status` | Choices | `auto_approved` (default), `pending`, `approved`, `rejected` |
| `approved_by` | FK → User | Who approved it |
| `approved_at` | DateTime | When it was approved |
| `paid_amount` | Decimal(12,2) | Running total of payments made, default 0 |
| `notes` | TextField | Optional |
| `created_by` | FK → User | Who created this expense |

**Smart Behaviors in `save()`:**
1. Auto-calculates `total_amount = amount + tax_amount` if not set
2. Auto-updates `payment_status` based on `paid_amount` vs `total_amount`
3. Re-checks approval threshold: if total ≥ ₹5,000, status changes from `auto_approved` to `pending`

**Approval Threshold Logic:**
- If `total_amount < ₹5,000` → automatically approved, payment form visible immediately
- If `total_amount ≥ ₹5,000` → needs manual approval by someone who didn't create it
- If approved expense is edited and new total ≥ ₹5,000 → approval resets to `pending`

### 2.3 ExpensePayment
*Where: `finance/models.py` line 138*

Each individual payment made against an expense. One expense can have many payments (partial pay support).

| Field | Type | Notes |
|-------|------|-------|
| `expense` | FK → Expense | Which expense this pays |
| `date` | DateField | Payment date |
| `amount` | Decimal(12,2) | How much was paid |
| `method` | Choices | `cash`, `upi`, `bank`, `cheque`, `card` |
| `reference` | CharField(100) | Transaction/cheque number |
| `payer` | FK → User | Who made the payment |
| `receipt` | ImageField | Upload photo of receipt |
| `notes` | TextField | Optional |

**Smart Behaviors in `save()`:**
- Uses atomic `F()` expressions to safely increment `Expense.paid_amount`
- Then calls `refresh_from_db()` to get the real Decimal value
- Finally calls `expense.save()` which recalculates `payment_status`

### 2.4 OtherIncome
*Where: `finance/models.py` line 200*

Non-sales revenue like interest earned, rent received, consulting fees, etc.

| Field | Type | Notes |
|-------|------|-------|
| `date` | DateField | When income was received |
| `source` | CharField(200) | Where it came from |
| `description` | TextField | Optional details |
| `amount` | Decimal(12,2) | Must be > 0 |
| `received_by` | FK → User | Who received/recorded it |

### 2.5 BankAccount
*Where: `finance/models.py` line 229*

Company bank accounts for tracking cash flow.

| Field | Type | Notes |
|-------|------|-------|
| `name` | CharField(100) | Account nickname (e.g. "SBI Main") |
| `account_type` | Choices | `current`, `savings`, `cash` |
| `bank_name` | CharField(100) | Bank name |
| `account_number` | CharField(50) | Masked in admin panel |
| `ifsc_code` | CharField(15) | IFSC code |
| `branch` | CharField(100) | Branch name |
| `opening_balance` | Decimal(14,2) | Starting balance |
| `current_balance` | Decimal(14,2) | Auto-updated from transactions |
| `is_active` | Boolean | Default True |
| `is_default` | Boolean | Only one account can be default |

**Smart Behaviors:**
- On create: `current_balance` is set to `opening_balance`
- Only one account can be `is_default` at a time

### 2.6 BankTransaction
*Where: `finance/models.py` line 273*

Records of money moving in/out of bank accounts.

| Field | Type | Notes |
|-------|------|-------|
| `account` | FK → BankAccount | Which account |
| `transaction_type` | Choices | `deposit`, `withdrawal`, `transfer_in`, `transfer_out` |
| `date` | DateField | Transaction date |
| `amount` | Decimal(14,2) | Amount, must be > 0 |
| `description` | TextField | Required |
| `reference` | CharField(100) | Reference number |
| `transfer_account` | FK → BankAccount | For transfers: the other account |
| `related_expense` | FK → Expense | Optional link to an expense |
| `recorded_by` | FK → User | Who entered this |
| `is_reconciled` | Boolean | For bank reconciliation |

**Smart Behaviors in `save()`:**
- Deposits/Transfer In → increases `current_balance`
- Withdrawals/Transfer Out → decreases `current_balance`
- On update: reverses old amount first, then applies new amount
- Uses `select_for_update()` for thread safety

**Smart Behaviors in `delete()` (soft delete):**
- Reverses the balance effect (deposit deletion reduces balance, withdrawal deletion increases it)
- Sets `_skip_balance` flag so the SoftDeleteModel's internal `save()` doesn't re-trigger balance logic

### 2.7 EmployeeExpense
*Where: `finance/models.py` line 372*

Expenses submitted by employees for reimbursement (staff bought something for the company).

| Field | Type | Notes |
|-------|------|-------|
| `employee` | FK → User | Who submitted |
| `date` | DateField | When expense happened |
| `category` | FK → ExpenseCategory | What kind of expense |
| `description` | TextField | What was purchased |
| `amount` | Decimal(12,2) | How much |
| `receipt` | ImageField | Photo of receipt |
| `status` | Choices | `pending` → `approved` → `reimbursed` (or `rejected`) |
| `reviewed_by` | FK → User | Manager who reviewed |
| `reviewed_at` | DateTime | When reviewed |
| `rejection_reason` | TextField | Why rejected |
| `reimbursed_at` | DateTime | When money was given back |
| `reimbursement_method` | CharField(50) | How they were paid back |

### 2.8 EmployeeSalary
*Where: `finance/models.py` line 420*

Salary configuration for each employee. One-to-one with User.

| Field | Type | Notes |
|-------|------|-------|
| `employee` | OneToOne → User | One salary config per employee |
| `base_amount` | Decimal(12,2) | Monthly/weekly base salary |
| `frequency` | Choices | `monthly`, `weekly`, `biweekly` |
| `payment_day` | PositiveSmallInt | Day of month (for monthly) or day of week |
| `bank_account` | CharField(50) | Employee's bank account |
| `bank_name` | CharField(100) | Employee's bank |
| `ifsc_code` | CharField(15) | IFSC code |
| `is_active` | Boolean | Currently employed? |

### 2.9 SalaryPayment
*Where: `finance/models.py` line 456*

Individual salary payments made to employees.

| Field | Type | Notes |
|-------|------|-------|
| `salary` | FK → EmployeeSalary | Which employee's salary config |
| `period_start` | DateField | Pay period start |
| `period_end` | DateField | Pay period end |
| `payment_date` | DateField | When paid |
| `base_amount` | Decimal(12,2) | Base salary for this period |
| `deductions` | Decimal(12,2) | Any deductions |
| `bonuses` | Decimal(12,2) | Any bonuses |
| `net_amount` | Decimal(12,2) | Auto-calculated: `base - deductions + bonuses` |
| `payment_method` | CharField(50) | How paid |
| `reference` | CharField(100) | Transaction reference |
| `notes` | TextField | Optional |
| `paid_by` | FK → User | Admin who processed |

### 2.10 Lender
*Where: `finance/models.py` line 496*

People or institutions who lend money to the business.

| Field | Type | Notes |
|-------|------|-------|
| `name` | CharField(200) | Lender name (e.g. "ICICI Bank") |
| `contact_person` | CharField(200) | Contact name |
| `phone` | CharField(20) | Phone number |
| `email` | EmailField | Email |
| `address` | TextField | Address |
| `notes` | TextField | Additional notes |

**Properties:**
- `total_loans` → count of active loans from this lender
- `total_outstanding` → sum of balance due across all active loans

### 2.11 Loan
*Where: `finance/models.py` line 522*

Individual loans taken from a lender.

| Field | Type | Notes |
|-------|------|-------|
| `lender` | FK → Lender | Who gave the loan |
| `loan_number` | CharField(50) | Reference number |
| `principal_amount` | Decimal(14,2) | Original amount borrowed, must be > 0 |
| `interest_rate` | Decimal(5,2) | Annual interest %, can be 0 |
| `term_months` | PositiveInteger | Duration in months, must be ≥ 1 |
| `start_date` | DateField | When loan started |
| `end_date` | DateField | When loan ends |
| `monthly_payment` | Decimal(12,2) | Fixed monthly payment |
| `total_paid` | Decimal(14,2) | Running total of principal repaid |
| `interest_type` | Choices | `simple`, `compound`, `flat` |
| `is_active` | Boolean | Loan still active? |
| `notes` | TextField | Terms, conditions |

**Properties (calculated, not stored):**
- `balance_due` → `principal + total_interest - total_paid`
- `total_interest` → calculated using simple or compound formula
- `emi` → EMI using reducing balance method, pure Decimal math (no floats)

### 2.12 LoanRepayment
*Where: `finance/models.py` line 606*

Individual payments made toward a loan.

| Field | Type | Notes |
|-------|------|-------|
| `loan` | FK → Loan | Which loan |
| `date` | DateField | Payment date |
| `amount` | Decimal(12,2) | Total payment |
| `principal_portion` | Decimal(12,2) | How much goes to principal |
| `interest_portion` | Decimal(12,2) | How much goes to interest |
| `payment_method` | CharField(50) | How paid |
| `reference` | CharField(100) | Transaction reference |
| `notes` | TextField | Optional |
| `recorded_by` | FK → User | Who recorded |

**Smart Behaviors in `save()`:**
- Uses F() expression for atomic increment of `Loan.total_paid`
- Falls back to re-aggregation on updates

### 2.13 IncomeCategory
*Where: `finance/models.py` line 671*

Categories for organizing non-sales income (e.g. "Consulting", "Interest", "Commission").

| Field | Type | Notes |
|-------|------|-------|
| `name` | CharField(100) | Unique |
| `description` | TextField | Optional |
| `is_active` | Boolean | Default True |

### 2.14 RecurringExpense
*Where: `finance/models.py` line 687*

Templates for expenses that repeat on a schedule. Not expenses themselves — they generate real Expense records on demand.

| Field | Type | Notes |
|-------|------|-------|
| `name` | CharField(200) | Template name (e.g. "Monthly Internet Bill") |
| `category` | FK → ExpenseCategory | Category for generated expenses |
| `payee_name` | CharField(200) | Payee for generated expenses |
| `payee_type` | Choices | vendor/employee/lender/other |
| `amount` | Decimal(12,2) | Amount per occurrence |
| `tax_amount` | Decimal(12,2) | Tax per occurrence |
| `frequency` | Choices | `daily`, `weekly`, `monthly`, `quarterly`, `yearly` |
| `next_date` | DateField | Next due date, indexed |
| `end_date` | DateField | Optional end date |
| `is_active` | Boolean | Can be paused |
| `description` | TextField | Description for generated expenses |
| `created_by` | FK → User | Creator |

### 2.15 CategoryBudget
*Where: `finance/models.py` line 727*

Budget limits per expense category per time period. Tracks how much you're spending vs. how much you planned.

| Field | Type | Notes |
|-------|------|-------|
| `category` | FK → ExpenseCategory | Which category |
| `period_start` | DateField | Budget period start |
| `period_end` | DateField | Budget period end |
| `budget_amount` | Decimal(12,2) | How much allocated |

**Unique constraint:** One budget per category per period start date.

**Properties:**
- `spent` → sum of expenses in that category within the period (uses annotated queryset value for performance)
- `remaining` → `budget_amount - spent`
- `utilization_pct` → `(spent / budget) × 100` — shows as a bar (green < 80%, yellow 80-100%, red > 100%)

### 2.16 FinanceAuditLog
*Where: `finance/models.py` line 770*

Every important financial action is logged here for accountability.

| Field | Type | Notes |
|-------|------|-------|
| `action` | CharField(50) | What happened (e.g. "create", "approve_expense", "add_payment") |
| `model_name` | CharField(50) | Which model was affected |
| `object_id` | CharField(50) | ID of the affected record |
| `user` | FK → User | Who did it |
| `timestamp` | DateTime | Auto-set on creation |
| `details` | JSONField | Extra info (amount, payee, reason, etc.) |

---

## 3. API Endpoints (18 Registered Routes)

All endpoints are under `/api/finance/`. Authentication is required for all.

### 3.1 Base URL: `/api/finance/`

| Endpoint | ViewSet | Methods | Notes |
|----------|---------|---------|-------|
| `expense-categories/` | ExpenseCategoryViewSet | GET, POST, PUT, DELETE | Filter: `?active_only=true` |
| `expenses/` | ExpenseViewSet | GET, POST, PUT, DELETE | Filters below |
| `expense-payments/` | ExpensePaymentViewSet | GET, POST, PUT, DELETE | Individual payments |
| `other-income/` | OtherIncomeViewSet | GET, POST, PUT, DELETE | Non-sales income |
| `bank-accounts/` | BankAccountViewSet | GET, POST, PUT, DELETE | Company accounts |
| `bank-transactions/` | BankTransactionViewSet | GET, POST, PUT, DELETE | Deposits/withdrawals |
| `employee-expenses/` | EmployeeExpenseViewSet | GET, POST, PUT, DELETE | Staff reimbursements |
| `salaries/` | EmployeeSalaryViewSet | GET, POST, PUT, DELETE | Salary configs |
| `salary-payments/` | SalaryPaymentViewSet | GET, POST, PUT, DELETE | Salary payments |
| `lenders/` | LenderViewSet | GET, POST, PUT, DELETE | Lender CRUD |
| `loans/` | LoanViewSet | GET, POST, PUT, DELETE | Loan records |
| `loan-repayments/` | LoanRepaymentViewSet | GET, POST, PUT, DELETE | Loan payments |
| `income-categories/` | IncomeCategoryViewSet | GET, POST, PUT, DELETE | Income category CRUD |
| `recurring-expenses/` | RecurringExpenseViewSet | GET, POST, PUT, DELETE | Recurring templates |
| `category-budgets/` | CategoryBudgetViewSet | GET, POST, PUT, DELETE | Budget tracking |
| `audit-logs/` | FinanceAuditLogViewSet | GET only | Admin only, read-only |
| `dashboard/` | FinancialDashboardView | GET only | Admin only, KPI aggregation |

### 3.2 Expense Filters

The expense list supports these query parameters:

| Parameter | Example | What It Does |
|-----------|---------|--------------|
| `?search=vendor` | Text search | Searches payee_name, description, notes |
| `?status=unpaid` | Payment status | `unpaid`, `partial`, `paid` |
| `?approval=pending` | Approval status | `auto_approved`, `pending`, `approved`, `rejected` |
| `?category=<uuid>` | Category filter | Filter by category ID |
| `?payee_type=vendor` | Payee type | `vendor`, `employee`, `lender`, `other` |
| `?date_from=2026-01-01` | Date range start | Expenses on or after this date |
| `?date_to=2026-03-31` | Date range end | Expenses on or before this date |

### 3.3 Custom Actions (Beyond Standard CRUD)

#### Expense Actions
| Action | URL | Method | What It Does |
|--------|-----|--------|--------------|
| Add Payment | `expenses/{id}/add_payment/` | POST | Records a payment against an expense. Blocks if expense is `pending` or `rejected` |
| Approve | `expenses/{id}/approve_expense/` | POST | Approves a pending expense. Cannot approve your own (self-approval guard) |
| Reject | `expenses/{id}/reject_expense/` | POST | Rejects a pending expense |
| CSV Export | `expenses/export_csv/` | GET | Streams a CSV file of all expenses (formula-injection safe) |

#### Recurring Expense Actions
| Action | URL | Method | What It Does |
|--------|-----|--------|--------------|
| Generate | `recurring-expenses/{id}/generate/` | POST | Creates a real Expense from the template and advances `next_date` |

#### Loan Actions
| Action | URL | Method | What It Does |
|--------|-----|--------|--------------|
| Add Repayment | `loans/{id}/add_repayment/` | POST | Records a repayment and updates `total_paid` |

### 3.4 Financial Dashboard API

**URL:** `GET /api/finance/dashboard/?period=month`

**Period Options:** `today`, `week`, `month`, `quarter`, `year`, `custom`  
**Custom Range:** `?period=custom&start_date=2026-01-01&end_date=2026-03-31`

**Response Fields:**

| Field | Source | Description |
|-------|--------|-------------|
| `revenue` | Orders app | Total sales from completed orders |
| `cogs` | Orders app | Cost of goods (cost_price × quantity) |
| `gross_profit` | Calculated | Revenue - COGS |
| `expenses` | Expense model | Sum of all expenses in period |
| `other_income` | OtherIncome model | Non-sales income |
| `net_profit` | Calculated | Gross profit - Expenses - Salaries - Reimbursements - Loan Interest + Other Income |
| `cash_balance` | BankAccount model | Sum of all active account balances |
| `accounts_receivable` | Orders app | Unpaid customer orders |
| `accounts_payable` | Multiple sources | Outstanding expenses + Unpaid reimbursements + Accrued salaries + Lender obligations |

**Caching:** Results are cached for 5 minutes (1 minute for "today" period).

---

## 4. Frontend Pages (23 React Components)

All under `frontend/src/pages/finance/`. Every page uses the app's dark-themed design system with glass morphism cards.

### 4.1 Navigation Hub

#### FinanceIndex.jsx
- The landing page for Finance & Accounting
- Shows clickable cards linking to each sub-section
- Cards: Expenses, Categories, Employee Expenses, Salaries, Banking, Lenders & Loans, Income, Reports, Budgets, Recurring, Settings
- Quick Overview section fetches dashboard KPIs (Revenue, Expenses, Net Profit, Accounts Payable)

### 4.2 Expense Pages

#### ExpenseList.jsx
- Table of all expenses with columns: Payee, Category, Amount, Tax, Total, Payment Status, Approval Status
- Filter dropdowns: Category, Payment Status, Date Range
- Search bar for text search
- Create button opens AddExpense page
- View button (eye icon) opens ExpenseDetails page
- Pagination with 25 per page

#### AddExpense.jsx
- Form to create a new expense
- Fields: Date, Category (dropdown), Payee Type (dropdown), Payee Name, Amount, Tax, Description, Notes
- Validates: amount > 0, required fields
- After save → navigates back to ExpenseList

#### ExpenseDetails.jsx
- Shows all expense information in a detail card
- **Approval Section:**
    - If `pending` → shows "Approve" and "Reject" buttons
    - If `auto_approved` or `approved` → shows green badge
    - If `rejected` → shows red badge with reason
- **Payment Section:**
    - If approved and not fully paid → shows Record Payment form (Date, Amount, Method dropdown with `cash`/`upi`/`bank`/`cheque`/`card`, Reference, Notes)
    - If pending → shows "Payment blocked until approved"
    - If rejected → shows "Cannot pay a rejected expense"
- **Payment History Table:** Date, Method, Reference, Amount, Running Balance, Payer
- **Balance Due:** highlighted in red when > 0

### 4.3 Category Pages

#### ExpenseCategories.jsx
- Card grid of all expense categories
- Each card shows: name, description, expense count, active/inactive toggle
- Create modal: Name + Description
- Edit modal: same fields
- Toggle switch to activate/deactivate categories

### 4.4 Employee Expense Pages

#### EmployeeExpenses.jsx
- List of employee-submitted expense claims
- "Submit New Expense" button opens a modal
- Modal fields: Category, Amount, Description
- Shows: Employee name, Date, Amount, Category, Status badge (Pending/Approved/Rejected/Reimbursed)

### 4.5 Salary Pages

#### EmployeeSalaries.jsx
- Table showing salary configurations and payment history
- Columns: Employee, Base Amount, Frequency, Payment Day
- Supports creating salary records

### 4.6 Banking Pages

#### BankAccounts.jsx
- Card grid of company bank accounts
- Each card: Account name, Bank name, Account type, Current balance, Active/Inactive
- Create form: Name, Type, Bank Name, Account Number, IFSC, Opening Balance
- Balances auto-update from transactions

#### RecordTransaction.jsx
- Form to record a deposit or withdrawal
- Fields: Account (dropdown), Type (Deposit/Withdrawal), Amount, Date, Description, Reference
- Deposits increase balance, Withdrawals decrease it

#### BankTransactions.jsx
- Full list of all transactions across all accounts
- Columns: Date, Type, Account, Amount, Description, Reconciled status

### 4.7 Lender & Loan Pages

#### LenderList.jsx
- Card grid of lenders
- Each card: Lender name, Contact, Total outstanding, Number of loans
- Create form: Name, Contact Person, Phone, Email, Address

#### LenderDetails.jsx
- Full lender information card
- Summary: Total borrowed, Total repaid, Outstanding balance
- Loans list: each loan with principal, amount repaid, remaining, status
- "Add New Loan" button

#### LoanDetails.jsx
- Loan information: Principal, Interest Rate, Term, EMI (calculated), Interest Type
- Financial summary: Total repaid, Balance due
- Repayment history table with Add Repayment button
- Repayment form: Amount, Principal Portion, Interest Portion, Payment Method, Reference

### 4.8 Income Pages

#### IncomeCategories.jsx
- Card grid of income categories (for non-sales revenue)
- Each card: Name, Description, Active toggle
- CRUD operations via modals

### 4.9 Budget Pages

#### CategoryBudgets.jsx
- Cards showing budget allocation per expense category
- Each card: Category name, Budget amount, Spent amount, Remaining
- **Utilization bar:** Green (< 80%), Yellow (80-100%), Red (> 100%)
- Shows percentage like "490% over budget" when overspent
- Create: select Category, enter Amount, Period Start/End

### 4.10 Recurring Expense Pages

#### RecurringExpenses.jsx
- Cards for recurring expense templates
- Each card: Name, Category, Amount, Frequency, Next Due Date, Active status
- "Generate" button → creates a real expense from the template
- Create form: Name, Category, Payee, Amount, Tax, Frequency, Start Date, End Date
- Edit and Delete supported

### 4.11 Report Pages

#### FinancialReports.jsx
- Hub page with cards linking to each report type
- 5 report cards: P&L, Cash Flow, Balance Sheet, Expense Report, Tax Report

#### ProfitLossReport.jsx
- Sections: Revenue, Cost of Goods Sold, Gross Profit, Operating Expenses, Net Profit
- Period selector: This Month, This Quarter, This Year, Custom
- Data pulled from Dashboard API

#### CashFlowReport.jsx
- Sections: Operating Activities (Sales receipts, Expense payments), Investing Activities, Financing Activities (Loans, Repayments)
- Net Cash Flow calculation
- Period selector

#### BalanceSheet.jsx
- Sections: Assets (Cash & Bank accounts), Liabilities (Accounts Payable, Loans Outstanding), Equity
- Shows current snapshot of financial position

#### ExpenseReport.jsx
- Summary cards: Total Expenses, Average per expense, Number of expenses
- Breakdown tables: By Category, By Payment Status, By Approval Status
- Period selector

#### TaxReport.jsx
- Output Tax (Sales Tax collected from orders)
- Input Tax Credit (Tax paid on expenses)
- Net Tax Liability
- Period selector

---

## 5. Security & Permissions

### 5.1 Permission Class: `FinancePermission`
*Where: `finance/permissions.py`*

- **Admin**: Full access to everything
- **Manager**: Can manage expenses, view reports
- **Cashier**: No access to finance module
- Audit logs: Admin only (`IsAdminUser`)
- Dashboard: Admin only (`IsAdminUser`)

### 5.2 Approval Guards
- Self-approval blocked: Users cannot approve expenses they created
- Payment blocked: Cannot pay expenses with `pending` or `rejected` approval status

### 5.3 Data Safety
- CSV export sanitizes fields — prefixes `=`, `+`, `-`, `@` with `'` to prevent formula injection
- Soft delete on most models — data is never truly lost
- Bank transactions use `select_for_update()` for thread safety
- Rate limiting: 30 requests/minute on financial actions (approve, reject, add payment)

### 5.4 Bank Account Number Masking
- In Django admin panel, account numbers are masked (e.g. "XXXX1234")
- Full numbers stored in DB but not exposed carelessly

---

## 6. Performance Optimizations

### 6.1 Database
- Indexed fields: `date`, `payment_status`, `approval_status`, `is_deleted`, `status`
- Budget queries use `Subquery` + `annotate` to calculate `spent` in one query (no N+1)
- Expenses use `select_related('category', 'created_by', 'approved_by')` and `prefetch_related('payments')`

### 6.2 Caching
- Dashboard results cached for 5 minutes (1 minute for "today" period)
- Cache key includes period + date range

### 6.3 Streaming
- CSV export uses `StreamingHttpResponse` so large exports don't consume memory

### 6.4 Atomic Updates
- `ExpensePayment.save()` and `LoanRepayment.save()` use `F()` expressions for atomic increment
- `BankTransaction.save()` uses `select_for_update()` + atomic block

---

## 7. Business Rules Summary

| Rule | Where | What Happens |
|------|-------|--------------|
| Expense < ₹5,000 | `Expense.save()` | Auto-approved, payment allowed immediately |
| Expense ≥ ₹5,000 | `Expense.save()` | Needs manual approval before payment |
| Edit approved → over threshold | `Expense.save()` | Approval resets to pending |
| Self-approval | `approve_expense()` view | Blocked — returns 403 |
| Payment on pending/rejected | `add_payment()` view | Blocked — returns 400 |
| Overpayment | `ExpensePaymentSerializer` | Validates payment ≤ balance due |
| Deposit | `BankTransaction.save()` | Balance increases |
| Withdrawal | `BankTransaction.save()` | Balance decreases |
| Soft-delete transaction | `BankTransaction.delete()` | Balance reverses |
| EMI term = 0 | `Loan.term_months` | Blocked by `MinValueValidator(1)` |
| Salary net | `SalaryPayment.save()` | `net = base - deductions + bonuses` |
| Recurring generate | `generate()` action | Creates Expense + advances `next_date` |
| Budget overspend | `CategoryBudget.utilization_pct` | Bar turns red, shows > 100% |
| Net Profit formula | Dashboard view | `Revenue - COGS - Expenses - Salaries - Reimbursements - Loan Interest + Other Income` |
| Duplicate salary period | `SalaryPayment` validation | Blocked — unique per employee per period |

---

## 8. File Map

| File | Lines | What's Inside |
|------|-------|---------------|
| `finance/models.py` | 787 | 16 models with all business logic |
| `finance/views.py` | 884 | 18 ViewSets, Dashboard API, CSV export, approval actions |
| `finance/serializers.py` | ~600 | Serializers for all models + validation |
| `finance/urls.py` | 39 | Router registration for all endpoints |
| `finance/permissions.py` | ~40 | `FinancePermission` class |
| `finance/admin.py` | ~200 | Django admin configuration with masked fields |

### Frontend Pages (23 files)

| File | What It Shows |
|------|---------------|
| `FinanceIndex.jsx` | Hub page with navigation cards and KPI overview |
| `FinancialDashboard.jsx` | Full dashboard with KPI metric cards |
| `ExpenseList.jsx` | Filterable, paginated expense table |
| `AddExpense.jsx` | Create expense form |
| `ExpenseDetails.jsx` | Detail view + approval + payment + history |
| `ExpenseCategories.jsx` | Category card grid with toggle |
| `EmployeeExpenses.jsx` | Employee claim list + submit modal |
| `EmployeeSalaries.jsx` | Salary config table |
| `BankAccounts.jsx` | Bank account card grid |
| `RecordTransaction.jsx` | Deposit/withdrawal form |
| `BankTransactions.jsx` | Transaction history table |
| `LenderList.jsx` | Lender card grid |
| `LenderDetails.jsx` | Lender info + loan list |
| `LoanDetails.jsx` | Loan info + repayment history |
| `IncomeCategories.jsx` | Income category card grid |
| `CategoryBudgets.jsx` | Budget cards with utilization bars |
| `RecurringExpenses.jsx` | Recurring template cards + generate |
| `FinancialReports.jsx` | Report hub with 5 report cards |
| `ProfitLossReport.jsx` | P&L statement |
| `CashFlowReport.jsx` | Cash flow statement |
| `BalanceSheet.jsx` | Balance sheet |
| `ExpenseReport.jsx` | Expense breakdown report |
| `TaxReport.jsx` | Sales tax report |

---

## 9. How Everything Connects

```
Sales Orders ──→ Revenue ──→ Dashboard (Revenue, COGS, Gross Profit)
                              │
Expenses ──→ Payments ──→ Payment Status ──→ Dashboard (Expenses, AP)
    │                                           │
    ├── Approval Flow (< ₹5K auto, ≥ ₹5K manual)      
    ├── Categories ──→ Budgets (utilization tracking)
    ├── Recurring Templates ──→ Auto-generate expenses
    │
Employee Expenses ──→ Reimbursements ──→ Dashboard (AP)
Employee Salaries ──→ Salary Payments ──→ Dashboard (Net Profit)
    │
Bank Accounts ──→ Transactions ──→ Dashboard (Cash Balance)
    │
Lenders ──→ Loans ──→ Repayments ──→ Dashboard (AP, Net Profit)
    │
Other Income ──→ Dashboard (Net Profit)
    │
All Actions ──→ Audit Log
    │
Reports: P&L, Cash Flow, Balance Sheet, Expense, Tax
```
