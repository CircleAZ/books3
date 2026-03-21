# AZ Books — Finance & Accounting Module (Detailed Specification)

**Status**: Fully Implemented
**App Name**: `finance`

---

## 1. Finance Hub (Landing Page)

The main entry point for the Finance module. Shows clickable cards to every section and a quick overview of key numbers.

*   1.1. Navigation Cards (Clickable tiles, each links to a sub-section):
    *   1.1.1. Expenses
    *   1.1.2. Expense Categories
    *   1.1.3. Employee Expenses
    *   1.1.4. Employee Salaries
    *   1.1.5. Banking
    *   1.1.6. Lenders & Loans
    *   1.1.7. Income Categories
    *   1.1.8. Category Budgets
    *   1.1.9. Recurring Expenses
    *   1.1.10. Financial Reports
    *   1.1.11. Trip / Expense Groups
*   1.2. Quick Overview Section:
    *   1.2.1. Total Revenue (from Orders app)
    *   1.2.2. Total Expenses
    *   1.2.3. Net Profit
    *   1.2.4. Accounts Payable
    *   **Note**: If the overview data fails to load, shows an error message with retry button instead of crashing.

---

## 2. Financial Dashboard

A full dashboard page with all Key Performance Indicators (KPIs). Period selectable: Today, Week, Month, Quarter, Year, Custom.

*   2.1. KPI Metric Cards:
    *   2.1.1. Total Revenue (Sum of completed/confirmed orders in the selected period)
    *   2.1.2. Cost of Goods Sold (COGS) (Cost price × quantity for all order items in the period)
    *   2.1.3. Gross Profit (Revenue - COGS)
    *   2.1.4. Total Expenses (Sum of all company expenses in the period)
    *   2.1.5. Other Income (Non-sales income like interest, consulting fees)
    *   2.1.6. Net Profit (Gross Profit - Expenses - Salaries - Reimbursements - Loan Interest + Other Income)
    *   2.1.7. Cash Balance (Sum of all active bank account balances)
    *   2.1.8. Accounts Receivable (Unpaid customer orders — total due minus total paid)
    *   2.1.9. Accounts Payable:
        *   2.1.9.1. Total Accounts Payable (Sum of all amounts the business owes)
            *   **Description**: Money owed to vendors, employees (reimbursements, salaries), and lenders.
        *   2.1.9.2. **Calculation Breakdown**:
            *   2.1.9.2.1. **Outstanding Company Expenses**: Expenses where payment status is "Unpaid" or "Partial". Calculated as total amount minus paid amount.
            *   2.1.9.2.2. **Unpaid Employee Reimbursements**: Employee expenses approved but not yet reimbursed.
            *   2.1.9.2.3. **Accrued Salaries Payable**: Salaries earned but not yet paid out.
            *   2.1.9.2.4. **Due Payments to Lenders**: Active loan balances (principal minus total repaid).
*   2.2. Period Selector:
    *   2.2.1. Options: Today, This Week, This Month, This Quarter, This Year, Custom Range
    *   2.2.2. Custom Range: Start Date and End Date pickers
    *   **Note**: Dashboard results are cached for 5 minutes (1 minute for "Today") to keep page loads fast.

---

## 3. Expense Management

### 3.1. Expense Categories

Categories for organizing expenses (e.g., "Office Supplies", "Travel", "Utilities").

*   3.1.1. Category List (Card grid view)
    *   3.1.1.1. Each card shows: Category Name, Description, Number of expenses using it, Active/Inactive toggle
    *   3.1.1.2. Toggle switch to activate or deactivate a category
        *   **Note**: Inactive categories do not appear in the expense creation dropdown.
*   3.1.2. Create New Category
    *   3.1.2.1. Name (Required, must be unique)
    *   3.1.2.2. Description (Can be left blank)
    *   3.1.2.3. Save / Cancel buttons
*   3.1.3. Edit Category (Same form as Create, pre-filled with existing data)
*   3.1.4. Delete Category
    *   **Note**: Cannot delete a category that has expenses linked to it. Must reassign expenses first.

### 3.2. Log Company Expense

The main form for recording a business expense.

*   3.2.1. Date (Required, date picker)
*   3.2.2. Expense Category (Select from dropdown, only active categories shown)
*   3.2.3. Payee Type (Select: Vendor, Employee, Lender, Other)
*   3.2.4. Payee Name (Type the name, Required)
*   3.2.5. Amount (Required, must be greater than 0)
*   3.2.6. Tax Amount (Default: ₹0)
*   3.2.7. Total Amount (Auto-calculated: Amount + Tax)
*   3.2.8. Description (Can be left blank)
*   3.2.9. Notes (Can be left blank)
*   3.2.10. Save / Cancel buttons
*   **After Save**: Redirects to Expense List. The system auto-sets:
    *   Payment Status = "Unpaid"
    *   If total < ₹5,000 → Approval Status = "Auto-Approved" (payment allowed immediately)
    *   If total ≥ ₹5,000 → Approval Status = "Pending Approval" (payment blocked until approved)

### 3.3. View Expense List

*   3.3.1. Table Columns: Payee Name, Category, Amount, Tax, Total, Payment Status, Approval Status, Date, Actions
*   3.3.2. Filters:
    *   3.3.2.1. Search bar (searches payee name, description, notes)
    *   3.3.2.2. Category dropdown
    *   3.3.2.3. Payment Status dropdown (Unpaid, Partial, Paid)
    *   3.3.2.4. Approval Status dropdown (Auto-Approved, Pending, Approved, Rejected)
    *   3.3.2.5. Date range (From Date, To Date)
    *   3.3.2.6. Payee Type dropdown (Vendor, Employee, Lender, Other)
*   3.3.3. Sortable columns
*   3.3.4. Pagination (25 per page)
*   3.3.5. Actions per row:
    *   3.3.5.1. View Details (Eye icon, opens Expense Detail page - 3.4)
    *   3.3.5.2. Edit (Pencil icon, opens Edit form)
    *   3.3.5.3. Delete (Trash icon, soft delete with confirmation)
*   3.3.6. CSV Export button (Downloads all expenses as CSV file)
    *   **Security**: CSV fields are sanitized — characters like `=`, `+`, `-`, `@` are prefixed with `'` to prevent formula injection attacks.

### 3.4. View Expense Details

Shows full information about a single expense.

*   3.4.1. Expense Information Card:
    *   3.4.1.1. Date, Category, Payee Type, Payee Name
    *   3.4.1.2. Amount, Tax, Total Amount
    *   3.4.1.3. Balance Due (Total - Paid, highlighted in red if > 0)
    *   3.4.1.4. Description, Notes
    *   3.4.1.5. Created By, Created At
*   3.4.2. Approval Section:
    *   3.4.2.1. If "Auto-Approved" → Green badge
    *   3.4.2.2. If "Pending Approval" → Yellow badge + Approve and Reject buttons
    *   3.4.2.3. If "Approved" → Green badge with approver name and date
    *   3.4.2.4. If "Rejected" → Red badge with rejection reason
*   3.4.3. Approval Workflow:
    *   3.4.3.1. **Approve Expense** (Button): Changes status to "Approved". Payment form becomes visible.
        *   **Rule**: A user cannot approve an expense they created (self-approval blocked).
    *   3.4.3.2. **Reject Expense** (Button): Opens prompt for rejection reason. Status changes to "Rejected". Payment blocked.
*   3.4.4. Record Payment Section (Only visible if expense is approved or auto-approved AND not fully paid):
    *   3.4.4.1. Payment Date (Date picker, defaults to today)
    *   3.4.4.2. Amount (Pre-filled with balance due, editable for partial payments)
    *   3.4.4.3. Payment Method (Dropdown: Cash, UPI, Bank Transfer, Cheque, Card)
    *   3.4.4.4. Reference (Transaction number, cheque number, etc. Can be left blank)
    *   3.4.4.5. Notes (Can be left blank)
    *   3.4.4.6. Submit Payment button
    *   **Rules**:
        *   Cannot overpay — amount cannot exceed balance due.
        *   If expense status is "Pending Approval" → shows message: "Payment blocked until expense is approved"
        *   If expense status is "Rejected" → shows message: "Cannot pay a rejected expense"
        *   Partial payments are supported — pay ₹3,000 on a ₹10,000 expense, status becomes "Partially Paid"
*   3.4.5. Payment History Table:
    *   3.4.5.1. Columns: Date, Method, Reference, Amount, Running Balance, Payer
    *   3.4.5.2. Shows total paid and total remaining

### 3.5. Approval Threshold Rules

*   3.5.1. Expenses below ₹5,000 → Auto-approved on creation
*   3.5.2. Expenses at or above ₹5,000 → Requires manual approval
*   3.5.3. If an auto-approved expense is edited and the new total goes to ₹5,000 or above → approval resets to "Pending"
*   3.5.4. The threshold amount (₹5,000) is configurable in settings

---

## 4. Trip / Expense Group

A trip groups multiple expenses under one event. Useful when a trip has mixed expenses — some paid by the company, some paid by employees from their own pocket. Instead of creating 6 separate records, you enter everything in one form.

**Real-World Example:**
```
TRIP: "Ahmedabad — To place order"
├── Parking       ₹30    → Emp-1 paid (needs reimbursement)
├── Nvs-Adi Ticket ₹210  → Company budget
├── Lunch          ₹170  → Emp-2 paid (needs reimbursement)
├── Bike repair    ₹200  → Company budget
├── Adi-Nvs Ticket ₹210  → Emp-1 paid (needs reimbursement)
└── Petrol         ₹100  → Emp-2 paid (needs reimbursement)

Total: ₹920
Company paid: ₹410
Emp-1 to reimburse: ₹240
Emp-2 to reimburse: ₹270
```

### 4.1. Trip List

*   4.1.1. Table of all trips/expense groups
    *   4.1.1.1. Columns: Trip Name, Date, Purpose, Total Amount, Company Paid, Reimbursement Due, Settlement Status, Actions
    *   4.1.1.2. Settlement Status: Fully Settled (green), Partial (yellow), Unsettled (red)
    *   4.1.1.3. Clicking on Trip Name → opens Trip Details (4.4)
*   4.1.2. Search bar (search by trip name, purpose, or line item description)
*   4.1.3. Filter by: Date Range, Settlement Status, Employee
*   4.1.4. Sortable columns
*   4.1.5. Pagination (25 per page)

### 4.2. Create New Trip / Expense Group

One form to enter the trip details and all its line items at once.

*   4.2.1. **Trip Header:**
    *   4.2.1.1. Trip Name (Required, e.g., "Ahmedabad — To place order")
    *   4.2.1.2. Date (Date picker, defaults to today)
    *   4.2.1.3. Purpose / Reason (e.g., "To place order with supplier", can be left blank)
    *   4.2.1.4. Notes (General notes about the trip, can be left blank)
*   4.2.2. **Line Items Section** (Add as many items as needed):
    *   4.2.2.1. "+ Add Line Item" button (adds a new row)
    *   4.2.2.2. Each line item has:
        *   4.2.2.2.1. Description (Required, e.g., "Parking", "Nvs-Adi Ticket", "Lunch")
        *   4.2.2.2.2. Category (Select from expense categories dropdown, e.g., Travel, Food, Vehicle)
        *   4.2.2.2.3. Amount (Required, must be > 0)
        *   4.2.2.2.4. Paid By (Dropdown):
            *   **Company Budget** → This becomes a Company Expense (Section 3)
            *   **Employee Name** → This becomes an Employee Expense claim (Section 5) needing reimbursement
            *   The dropdown lists all employees + a "Company Budget" option
        *   4.2.2.2.5. Receipt (Upload image/PDF, can be left blank)
        *   4.2.2.2.6. Remove button (× icon to delete a line item)
    *   4.2.2.3. User can add, remove, and reorder line items before saving
*   4.2.3. **Running Totals** (Shown live as line items are added):
    *   4.2.3.1. Trip Total: Sum of all line items
    *   4.2.3.2. Company Paid: Sum of items where Paid By = "Company Budget"
    *   4.2.3.3. Per-Employee Breakdown:
        *   Emp-1: ₹240 (needs reimbursement)
        *   Emp-2: ₹270 (needs reimbursement)
        *   (Shows each employee who paid something, with their total)
*   4.2.4. Save / Cancel buttons
*   4.2.5. **What Happens on Save** (Behind the scenes, the system auto-generates):
    *   4.2.5.1. For each line item where Paid By = "Company Budget":
        *   Creates a **Company Expense** record (Section 3.2) with category, amount, and description
        *   Links the expense back to this trip
    *   4.2.5.2. For each line item where Paid By = an employee:
        *   Creates an **Employee Expense** claim (Section 5) on that employee's behalf
        *   Status = "Approved" (since the admin is creating it, no need for re-approval)
        *   Links the claim back to this trip
    *   4.2.5.3. All generated records carry a `trip_id` linking them to the parent trip
    *   **Note**: The user fills ONE form. The system creates the right records in the right places.

### 4.3. Edit Trip

*   4.3.1. Same form as Create Trip, pre-filled with existing data
*   4.3.2. Can add or remove line items
*   4.3.3. Can change "Paid By" (which updates the underlying expense/claim records)
*   4.3.4. **Rule**: Cannot edit line items that have already been reimbursed or paid

### 4.4. View Trip Details

*   4.4.1. Trip Header: Name, Date, Purpose, Notes
*   4.4.2. Summary Cards:
    *   4.4.2.1. Trip Total (sum of all items)
    *   4.4.2.2. Company Paid (sum of company-budget items)
    *   4.4.2.3. Total Reimbursement Due (sum of employee-paid items not yet reimbursed)
    *   4.4.2.4. Fully Settled (Yes/No)
*   4.4.3. Line Items Table:
    *   4.4.3.1. Columns: Description, Category, Amount, Paid By, Reimbursement Status, Receipt
    *   4.4.3.2. Status per line:
        *   Company items → shows Expense payment status (Unpaid/Partial/Paid)
        *   Employee items → shows Reimbursement status (Pending/Approved/Reimbursed)
    *   4.4.3.3. Clicking a line item opens the underlying Expense or Employee Expense detail
*   4.4.4. Reimbursement Summary Section:
    *   4.4.4.1. Per-employee breakdown table:
        | Employee | Items Count | Total Amount | Reimbursed | Remaining | Action |
        |----------|------------|-------------|------------|-----------|--------|
        | Emp-1    | 2          | ₹240        | ₹0         | ₹240      | Reimburse |
        | Emp-2    | 2          | ₹270        | ₹0         | ₹270      | Reimburse |
    *   4.4.4.2. "Reimburse" button per employee → marks all that employee's items for this trip as "Reimbursed"
    *   4.4.4.3. "Reimburse All" button → settles all pending reimbursements for this trip in one click
*   4.4.5. Delete Trip (soft delete, also soft-deletes all linked expenses/claims)

### 4.5. Trip Settlement Statuses

*   4.5.1. **Unsettled**: One or more employee-paid items are not yet reimbursed
*   4.5.2. **Partially Settled**: Some employees are reimbursed, others are not
*   4.5.3. **Fully Settled**: All employee-paid items are reimbursed AND all company-paid items are paid

### 4.6. How Trips Connect to Other Sections

*   4.6.1. Company-budget items appear in **Expense List** (Section 3.3) with a "Trip" badge and trip name
*   4.6.2. Employee-paid items appear in **Employee Expenses** (Section 5) with a "Trip" badge and trip name
*   4.6.3. Trip totals are included in **Dashboard** calculations (Section 2)
*   4.6.4. Trip expenses count toward **Category Budgets** (Section 12)
*   4.6.5. Individual trip expenses appear in **Financial Reports** (Section 13) under their respective categories

---

## 5. Employee Expenses (Reimbursements)

For tracking expenses that employees paid from their own pocket on behalf of the company. Employee expenses can be created directly here or generated automatically from a Trip (Section 4).

*   5.1. Employee Expenses List
    *   5.1.1. Shows all submitted expense claims
    *   5.1.2. Columns: Employee Name, Date, Category, Amount, Description, Status, Trip (if linked)
    *   5.1.3. Status badges: Pending (yellow), Approved (blue), Rejected (red), Reimbursed (green)
    *   5.1.4. Filter by: Employee, Date, Category, Status
    *   5.1.5. Items linked to a trip show a "Trip" badge with the trip name (clickable → Trip Details 4.4)
*   5.2. Submit New Expense (Modal popup)
    *   5.2.1. Category (Select from dropdown)
    *   5.2.2. Amount (Required, must be > 0)
    *   5.2.3. Description (Required)
    *   5.2.4. Receipt upload (Image/PDF, can be left blank)
    *   5.2.5. Submit / Cancel buttons
    *   **After submission**: Status defaults to "Pending Review"
*   5.3. Review Employee Expense (Admin/Manager action)
    *   5.3.1. Approve → Status changes to "Approved"
    *   5.3.2. Reject → Status changes to "Rejected", with reason
    *   5.3.3. Reimburse → Status changes to "Reimbursed", records reimbursement date and method

---

## 6. Employee Salary Management

### 6.1. Salary Configuration

One salary record per employee. Defines their pay structure.

*   6.1.1. Employee (One-to-one, each employee gets one salary config)
*   6.1.2. Base Amount (Monthly/weekly base salary)
*   6.1.3. Frequency (Monthly, Weekly, Bi-Weekly)
*   6.1.4. Payment Day (e.g., 1st of month for monthly salaries)
*   6.1.5. Bank Details (Account number, Bank name, IFSC code — for reference)
*   6.1.6. Active/Inactive toggle

### 6.2. Salary List View

*   6.2.1. Table showing all employee salary configurations
*   6.2.2. Columns: Employee, Base Amount, Frequency, Payment Day, Status
*   6.2.3. Actions: Edit, View Payments

### 6.3. Record Salary Payment

*   6.3.1. Employee/Salary (Pre-selected)
*   6.3.2. Period Start Date
*   6.3.3. Period End Date
*   6.3.4. Payment Date
*   6.3.5. Base Amount (Pre-filled from salary config)
*   6.3.6. Deductions (Default: ₹0)
*   6.3.7. Bonuses (Default: ₹0)
*   6.3.8. Net Amount (Auto-calculated: Base - Deductions + Bonuses)
*   6.3.9. Payment Method
*   6.3.10. Reference (Transaction number, can be left blank)
*   6.3.11. Notes (Can be left blank)
*   6.3.12. Save / Cancel buttons
*   **Rule**: Duplicate salary payment for the same employee and same period is blocked.

---

## 7. Banking & Transactions

### 7.1. Manage Bank Accounts

*   7.1.1. Bank Account List (Card grid)
    *   7.1.1.1. Each card shows: Account Name, Bank Name, Account Type (Current/Savings/Cash), Current Balance, Active/Inactive status
    *   7.1.1.2. Only one account can be set as "Default"
*   7.1.2. Add Bank Account
    *   7.1.2.1. Account Name (e.g., "SBI Main Account")
    *   7.1.2.2. Account Type (Current, Savings, Cash)
    *   7.1.2.3. Bank Name
    *   7.1.2.4. Account Number
    *   7.1.2.5. IFSC Code
    *   7.1.2.6. Branch
    *   7.1.2.7. Opening Balance (Default: ₹0)
    *   7.1.2.8. Save / Cancel buttons
    *   **After Save**: Current Balance is automatically set to Opening Balance.
*   7.1.3. Edit Bank Account
*   7.1.4. View Account Balance
    *   **Note**: Account Number is masked in the admin panel (e.g., shows "XXXX1234" instead of full number).

### 7.2. Record Transaction

*   7.2.1. Account (Select from dropdown of active accounts)
*   7.2.2. Transaction Type:
    *   7.2.2.1. Deposit (Money coming in → balance increases)
    *   7.2.2.2. Withdrawal (Money going out → balance decreases)
    *   7.2.2.3. Transfer In (From another account → balance increases)
    *   7.2.2.4. Transfer Out (To another account → balance decreases)
*   7.2.3. Date (Date picker)
*   7.2.4. Amount (Required, must be > 0)
*   7.2.5. Description (Required)
*   7.2.6. Reference (Can be left blank)
*   7.2.7. Transfer Account (Only shown for transfers — select the other account)
*   7.2.8. Save / Cancel buttons
*   **After Save**: The selected bank account's Current Balance is updated automatically.
*   **On Delete**: If a transaction is deleted (soft delete), the balance change is reversed.
    *   Deleting a ₹10,000 deposit → balance decreases by ₹10,000.
    *   Deleting a ₹5,000 withdrawal → balance increases by ₹5,000.

### 7.3. View Transaction List

*   7.3.1. Table of all transactions across all accounts
*   7.3.2. Columns: Date, Type (Deposit/Withdrawal/Transfer), Account, Amount, Description, Reference, Reconciled (Yes/No)
*   7.3.3. Sortable columns
*   7.3.4. Pagination (25 per page)

---

## 8. Income Categories

Categories for organizing non-sales income (e.g., "Consulting", "Interest", "Commission", "Professional Services").

*   8.1. Income Category List (Card grid)
    *   8.1.1. Each card shows: Name, Description, Active/Inactive toggle
*   8.2. Create Income Category
    *   8.2.1. Name (Required, must be unique)
    *   8.2.2. Description (Can be left blank)
    *   8.2.3. Save / Cancel buttons
*   8.3. Edit Income Category
*   8.4. Toggle Active/Inactive
*   8.5. Delete Income Category

---

## 9. Other Income (Non-Sales Revenue)

For recording income that does not come from product sales (e.g., interest earned, rent received, consulting fees).

*   9.1. Log Other Income
    *   9.1.1. Date
    *   9.1.2. Source (Who it came from)
    *   9.1.3. Description (Can be left blank)
    *   9.1.4. Amount (Required, must be > 0)
    *   9.1.5. Save / Cancel buttons
*   9.2. View Other Income List
    *   9.2.1. Table with: Date, Source, Amount, Description
    *   9.2.2. Sortable, Paginated

---

## 10. Lenders & Loans

### 10.1. Lender Management

*   10.1.1. Lender List (Card grid)
    *   10.1.1.1. Each card shows: Lender Name, Contact Person, Phone, Email, Total Outstanding Balance, Number of Active Loans
    *   10.1.1.2. Lender Name is clickable → opens Lender Details (10.1.3)
*   10.1.2. Add New Lender
    *   10.1.2.1. Name (Required)
    *   10.1.2.2. Contact Person
    *   10.1.2.3. Phone
    *   10.1.2.4. Email
    *   10.1.2.5. Address
    *   10.1.2.6. Notes
    *   10.1.2.7. Save / Cancel buttons
*   10.1.3. View Lender Details (Detail page for a specific lender)
    *   10.1.3.1. Lender Information: Name, Contact, Phone, Email, Address, Notes (Editable)
    *   10.1.3.2. Summary Cards:
        *   10.1.3.2.1. Total Principal Borrowed (Sum of all loan principal amounts from this lender)
        *   10.1.3.2.2. Total Repaid (Sum of all repayments across all loans)
        *   10.1.3.2.3. Current Outstanding Balance (Total Principal + Interest - Total Repaid)
    *   10.1.3.3. Loans List (Table of all loans from THIS lender)
        *   10.1.3.3.1. Columns: Start Date, Principal Amount, Interest Rate, Term, Amount Repaid, Remaining Balance, Status
        *   10.1.3.3.2. Clicking on a loan → opens Loan Details (10.2.3)
        *   10.1.3.3.3. Sortable columns
    *   10.1.3.4. Button: "Add New Loan from this Lender" (Links to 10.2.1)

### 10.2. Loan Management

*   10.2.1. Add New Loan
    *   10.2.1.1. Lender (Pre-filled if coming from Lender Details, otherwise select from dropdown)
    *   10.2.1.2. Loan Number/Reference (Can be left blank)
    *   10.2.1.3. Principal Amount (Required, must be > 0)
    *   10.2.1.4. Interest Rate (Annual percentage, can be 0 for interest-free loans)
    *   10.2.1.5. Interest Type (Simple Interest, Compound Interest, Flat Rate)
    *   10.2.1.6. Term in Months (Required, must be at least 1)
    *   10.2.1.7. Start Date
    *   10.2.1.8. End Date (Can be left blank)
    *   10.2.1.9. Notes/Terms (Text area for conditions)
    *   10.2.1.10. Save / Cancel buttons
*   10.2.2. EMI Calculation (Shown on loan detail page)
    *   **Formula**: Reducing balance method using pure decimal math (no rounding errors)
    *   If interest rate is 0 → EMI = Principal ÷ Term Months
    *   If interest rate > 0 → Standard EMI formula: P × r × (1+r)^n / ((1+r)^n - 1)
    *   **Rule**: Term months cannot be 0 (would cause division by zero).
*   10.2.3. View Loan Details
    *   10.2.3.1. Loan Information:
        *   10.2.3.1.1. Loan Number/Reference
        *   10.2.3.1.2. Lender Name (Clickable → Lender Details)
        *   10.2.3.1.3. Start Date, End Date
        *   10.2.3.1.4. Principal Amount
        *   10.2.3.1.5. Interest Rate & Type
        *   10.2.3.1.6. Term (in months)
        *   10.2.3.1.7. Calculated EMI
        *   10.2.3.1.8. Status: Active / Paid Off
        *   10.2.3.1.9. Notes
    *   10.2.3.2. Financial Summary:
        *   10.2.3.2.1. Total Interest (Calculated based on interest type)
        *   10.2.3.2.2. Total Repaid
        *   10.2.3.2.3. Remaining Balance (Principal + Interest - Repaid)
    *   10.2.3.3. Repayment History (Table of all payments for THIS loan)
        *   10.2.3.3.1. Columns: Date, Total Amount, Principal Portion, Interest Portion, Payment Method, Reference, Notes
        *   10.2.3.3.2. Sortable columns
    *   10.2.3.4. Button: "Record Repayment" (Links to 10.2.4)
*   10.2.4. Record Loan Repayment
    *   10.2.4.1. Loan (Pre-filled)
    *   10.2.4.2. Date
    *   10.2.4.3. Total Amount
    *   10.2.4.4. Principal Portion
    *   10.2.4.5. Interest Portion
    *   10.2.4.6. Payment Method
    *   10.2.4.7. Reference (Can be left blank)
    *   10.2.4.8. Notes (Can be left blank)
    *   10.2.4.9. Save / Cancel buttons
    *   **After Save**: Loan's Total Repaid is updated automatically.

---

## 11. Recurring Expenses

Templates for expenses that repeat on a schedule (e.g., monthly rent, internet bill). These are NOT expenses themselves — they generate real expenses on demand.

*   11.1. Recurring Expense List (Card grid)
    *   11.1.1. Each card shows: Name, Category, Payee, Amount, Frequency, Next Due Date, Active/Inactive
    *   11.1.2. "Generate" button on each card → Creates a real expense from the template and advances the next date
*   11.2. Create Recurring Expense
    *   11.2.1. Name (e.g., "Monthly Internet Bill")
    *   11.2.2. Category (Select from dropdown)
    *   11.2.3. Payee Name
    *   11.2.4. Payee Type (Vendor, Employee, Lender, Other)
    *   11.2.5. Amount
    *   11.2.6. Tax Amount (Default: ₹0)
    *   11.2.7. Frequency (Daily, Weekly, Monthly, Quarterly, Yearly)
    *   11.2.8. Start Date (This becomes the first "Next Due Date")
    *   11.2.9. End Date (Can be left blank for indefinite)
    *   11.2.10. Description (Can be left blank)
    *   11.2.11. Save / Cancel buttons
*   11.3. Edit Recurring Expense
*   11.4. Delete Recurring Expense
*   11.5. Generate Expense (Action button)
    *   11.5.1. Creates a new Expense record using the template's values
    *   11.5.2. Advances the next_date by the frequency:
        *   Daily → +1 day
        *   Weekly → +7 days
        *   Monthly → +1 month
        *   Quarterly → +3 months
        *   Yearly → +1 year
    *   11.5.3. If the template is inactive → blocked
    *   11.5.4. If the next date is past the end date → blocked
    *   **Security**: Uses database locking to prevent duplicate generation if the button is clicked twice quickly.

---

## 12. Category Budgets

Set spending limits per expense category per time period. Track how much you're actually spending vs. how much you planned.

*   12.1. Budget List (Card grid)
    *   12.1.1. Each card shows:
        *   12.1.1.1. Category Name
        *   12.1.1.2. Budget Amount (How much was allocated)
        *   12.1.1.3. Spent Amount (Sum of expenses in that category within the period)
        *   12.1.1.4. Remaining (Budget - Spent, can be negative)
        *   12.1.1.5. Utilization Bar (Visual progress bar):
            *   Green: Under 80% spent
            *   Yellow: 80% to 100% spent
            *   Red: Over 100% spent (overspending)
        *   12.1.1.6. Utilization Percentage (e.g., "490% over budget")
*   12.2. Create Budget
    *   12.2.1. Category (Select from dropdown)
    *   12.2.2. Budget Amount (Required, must be > 0)
    *   12.2.3. Period Start Date
    *   12.2.4. Period End Date
    *   12.2.5. Save / Cancel buttons
    *   **Rule**: Only one budget per category per period start date.
*   12.3. Edit Budget
*   12.4. Delete Budget

---

## 13. Financial Reports

Five report pages accessible from a Reports Hub page. Each report has a period selector.

### 13.1. Reports Hub

*   13.1.1. Five clickable cards linking to each report:
    *   13.1.1.1. Profit & Loss Statement
    *   13.1.1.2. Cash Flow Statement
    *   13.1.1.3. Balance Sheet
    *   13.1.1.4. Expense Report
    *   13.1.1.5. Sales Tax Report

### 13.2. Profit & Loss Statement

*   13.2.1. Period Selector: This Month, This Quarter, This Year, Custom
*   13.2.2. Sections:
    *   13.2.2.1. Revenue (Total sales from completed orders)
    *   13.2.2.2. Cost of Goods Sold (COGS)
    *   13.2.2.3. Gross Profit (Revenue - COGS)
    *   13.2.2.4. Operating Expenses (Company expenses + Salaries + Reimbursements + Loan Interest)
    *   13.2.2.5. Other Income
    *   13.2.2.6. **Net Profit** (Gross Profit - Operating Expenses + Other Income)

### 13.3. Cash Flow Statement

*   13.3.1. Period Selector
*   13.3.2. Sections:
    *   13.3.2.1. Operating Activities (Sales receipts, expense payments, salary payments)
    *   13.3.2.2. Investing Activities
    *   13.3.2.3. Financing Activities (Loans received, loan repayments)
    *   13.3.2.4. Net Cash Flow

### 13.4. Balance Sheet

*   13.4.1. Assets:
    *   13.4.1.1. Cash & Bank Balances (Sum of all active bank accounts)
    *   13.4.1.2. Accounts Receivable (Unpaid customer orders)
*   13.4.2. Liabilities:
    *   13.4.2.1. Accounts Payable (Outstanding expenses, reimbursements)
    *   13.4.2.2. Loans Outstanding (Active loan balances)
*   13.4.3. Equity

### 13.5. Expense Report

*   13.5.1. Summary Cards:
    *   13.5.1.1. Total Expenses (in period)
    *   13.5.1.2. Average Expense Amount
    *   13.5.1.3. Number of Expenses
*   13.5.2. Breakdown Tables:
    *   13.5.2.1. By Category (Category name, Total amount, Percentage of total)
    *   13.5.2.2. By Payment Status (Unpaid, Partial, Paid — counts and totals)
    *   13.5.2.3. By Approval Status (Auto-Approved, Pending, Approved, Rejected)

### 13.6. Sales Tax Report

*   13.6.1. Output Tax (Sales): Tax collected from customer orders
*   13.6.2. Input Tax Credit (Expenses): Tax paid on company purchases
*   13.6.3. Net Tax Liability (Output Tax - Input Tax Credit)
*   13.6.4. Period Selector

---

## 14. Audit Trail

Every important financial action is automatically logged for accountability.

*   14.1. Logged Actions:
    *   14.1.1. Expense created
    *   14.1.2. Payment added to expense
    *   14.1.3. Expense approved
    *   14.1.4. Expense rejected
    *   14.1.5. Recurring expense generated
    *   14.1.6. Loan repayment recorded
    *   14.1.7. Trip created / settled
*   14.2. Audit Log View (Admin only, Read-only)
    *   14.2.1. Columns: Timestamp, User, Action, Model, Details
    *   14.2.2. Filter by: Model type, Action type
    *   14.2.3. Paginated (25 per page)

---

## 15. Permissions & Security

*   15.1. **Role-Based Access**:
    | Role | Access Level |
    |------|-------------|
    | Admin | Full access to all finance features |
    | Manager | Can manage expenses, view reports |
    | Cashier | No access to finance module |
*   15.2. **Self-Approval Guard**: A user cannot approve their own expense (prevents fraud).
*   15.3. **Payment Blocking**: Cannot pay expenses that are "Pending Approval" or "Rejected".
*   15.4. **CSV Injection Protection**: All exported CSV fields are sanitized (dangerous characters prefixed with `'`).
*   15.5. **Rate Limiting**: Financial actions (approve, reject, add payment) limited to 30 per minute per user.
*   15.6. **Soft Delete**: Most records are soft-deleted (marked as deleted, not actually removed). Can be recovered if needed.
*   15.7. **Thread Safety**: Bank transactions and payment updates use database locks to prevent race conditions.
*   15.8. **Account Number Masking**: Bank account numbers are masked in the admin panel.

---

## 16. Performance & Technical Notes

*   16.1. **Caching**: Dashboard results cached for 5 minutes (1 minute for "today" queries).
*   16.2. **Database Indexes**: On date, payment_status, approval_status, is_deleted, and status fields for fast queries.
*   16.3. **N+1 Prevention**: Budget utilization calculations use a single annotated query instead of one query per budget.
*   16.4. **Streaming CSV**: Large CSV exports use streaming responses so they don't consume all server memory.
*   16.5. **Atomic Updates**: Payment amounts and loan repayments use database-level increments (not read-modify-write) to prevent data corruption.
*   16.6. **Pagination**: All list views paginated at 25 items per page (max 100 with `?page_size=100`).

---

## 17. Trip / Expense Groups

Group multiple expenses from a single trip into one record. Handles mixed payments — some by the company, some by employees who need reimbursement.

*   17.1. **Trip List** (`/finance/trips`):
    *   17.1.1. Table of all trips (name, date, purpose, item count, total, settlement status).
    *   17.1.2. Search by name or purpose.
    *   17.1.3. Filter by settlement status (Unsettled / Partial / Settled).
    *   17.1.4. Click a row to open Trip Details. "New Trip" button at top.

*   17.2. **Create Trip** (`/finance/trips/new`):
    *   17.2.1. Header fields: Trip Name, Date, Purpose, Notes.
    *   17.2.2. Dynamic line items — each has: Description, Category, Amount, Paid By.
    *   17.2.3. "Paid By" can be "Company Budget" or an employee name from the team.
    *   17.2.4. "+ Add Item" and "✕ Remove" buttons for line items.
    *   17.2.5. Live Summary section showing: Trip Total, Company Paid, and per-employee reimbursement amounts.
    *   17.2.6. On submit, backend auto-creates linked records (see 17.5).

*   17.3. **Trip Details** (`/finance/trips/:id`):
    *   17.3.1. Summary cards: Trip Total, Company Paid, Reimbursement Due.
    *   17.3.2. Line Items table with: Description, Category, Amount, Paid By (🏢 Company or 👤 Employee), Status badge.
    *   17.3.3. Reimbursement Summary table (per employee): Total owed, Already reimbursed, Remaining due.
    *   17.3.4. "Reimburse" button per employee (settles all that employee's items).
    *   17.3.5. "Reimburse All" button (settles every employee in one go).
    *   17.3.6. Settlement status badge auto-updates: Unsettled → Partial → Settled.
    *   17.3.7. Delete button (with confirmation) removes trip and all linked records.

*   17.4. **Settlement Status** (tracked on the `ExpenseTrip` model):
    *   17.4.1. `unsettled` — at least one employee item is not yet reimbursed.
    *   17.4.2. `partial` — some employee items reimbursed, some not.
    *   17.4.3. `settled` — all employee items reimbursed (or no employee items exist).

*   17.5. **How It Works Behind the Scenes**:
    *   17.5.1. When a trip is created, the backend auto-generates real records:
        *   For "Company Budget" items → creates an `Expense` record (marked as **paid**, payee = "Trip: {name}").
        *   For employee items → creates an `EmployeeExpense` claim (auto-approved, status = "approved").
    *   17.5.2. These auto-created records appear in:
        *   **Expenses list** — trip company expenses show as paid with "Trip: ..." payee name.
        *   **Employee Expenses list** — trip claims show with a 🧳 Trip badge. Approve/reject buttons are disabled for these.
        *   **Financial Dashboard** — company trip expenses are included in total expenses; employee claims in reimbursement totals.
        *   **Category Budgets** — trip expenses count toward budget utilization.
        *   **Financial Reports** — trip expenses included in P&L, Cash Flow, and Expense reports.
    *   17.5.3. When "Reimburse" is clicked, the linked `EmployeeExpense` status changes to "reimbursed" and the reimbursement method records the trip name.
    *   17.5.4. When a trip is **deleted**, all linked `Expense` and `EmployeeExpense` records are also soft-deleted.
    *   17.5.5. All trip actions (create, update, delete, reimburse) are recorded in the Finance Audit Log.
