# Phase 13: Finance & Accounting Application

## Overview
This phase implements the comprehensive finance and accounting module including financial dashboard, income/expense management, employee salaries, banking, financial reports, and the funds/lenders system.

## P4.md Coverage
- **Section 3.7**: App: `finance` (Lines 526-697)
  - Section 1: Financial Dashboard
  - Section 2: Income/Revenue Management
  - Section 3: Expense Management
  - Section 4: Banking & Transactions
  - Section 5: Financial Reports
  - Section 6: Financial Settings
  - Section 7: Funds (Company Funds & Lenders)

## Objectives
1. Build Financial Dashboard with KPIs
2. Implement Income/Revenue tracking
3. Build complete Expense Management system
4. Implement Employee Expense tracking and reimbursement
5. Build Employee Salary Management
6. Implement Banking & Transactions
7. Build all Financial Reports
8. Implement Company Funds tracking
9. Build Lenders management with loans and repayments

## Deliverables
### Backend (Django)
- [ ] Financial Dashboard APIs
  - Revenue, COGS, Gross Profit, Expenses, Net Profit
  - Cash Balance, Accounts Receivable, Accounts Payable
  - Accounts Payable calculation (from expenses, reimbursements, salaries, lenders)
- [ ] OtherIncome model + API
- [ ] Expense model + API (including payment records)
- [ ] ExpenseCategory model + API
- [ ] EmployeeExpense model + API
- [ ] EmployeeSalary model + API
- [ ] SalaryPayment model + API
- [ ] BankAccount model + API
- [ ] BankTransaction model + API
- [ ] Financial Report APIs (P&L, Cash Flow, Expense Report, Balance Sheet)
- [ ] CompanyFunds tracking APIs
- [ ] Lender model + API
- [ ] Loan model + API
- [ ] LoanRepayment model + API

### Frontend
- [ ] Financial Dashboard page
  - KPIs section (Revenue, COGS, Gross Profit, Expenses, Net Profit)
  - Period selectors (Today, Week, Month, Custom)
  - Cash Balance, Accounts Receivable
  - Accounts Payable with breakdown
    - Outstanding Company Expenses
    - Unpaid Employee Reimbursements
    - Accrued Salaries Payable
    - Due Payments to Lenders
  - Charts (Revenue vs Expenses, Profit Trends, Expense Breakdown)
- [ ] Income/Revenue section
  - Sales Summary (from orders)
  - Other Income logging
- [ ] Expense Management section
  - Log Company Expense
    - Date, Category, Payee (Vendor/Employee/Lender)
    - Amount, Payment Status
    - Payment Processing (Cash/UPI, Payer, Amount, Receipt upload)
    - Payment log view
  - Employee Expenses
    - Log Employee Expense (Date, Employee, Category, Amount, Description, Receipt)
    - Reimbursement status tracking
    - View Employee Expenses list with filters
  - Employee Salary Management
    - Add/Edit Salary (Amount, Frequency, Payment Method)
    - Salary History
    - Generate Salary Slips (PDF)
  - View All Expenses with filters
  - Manage Expense Categories
- [ ] Banking & Transactions section
  - Manage Bank Accounts
  - Record Manual Transactions (Deposits, Withdrawals, Transfers)
  - Bank Reconciliation (advanced)
- [ ] Financial Reports section
  - Profit & Loss Statement
  - Cash Flow Statement
  - Expense Report by Category/Vendor
  - Sales Tax Report
  - Balance Sheet (advanced)
  - Export options (CSV, Excel, PDF)
- [ ] Funds section
  - Company Funds
    - Cash Balance, Bank Balance
    - Transactions list
  - Lenders management
    - Lender List (Name, Contact, Active Loans, Amount Due)
    - Add New Lender
    - View Lender Details (info, summary, loans list)
    - Add New Loan (Lender, Date, Principal, Interest, Terms)
    - View Loan Details (info, financial summary, repayment history)
    - Add Repayment (Date, Amount, Method, Notes)

## Dependencies
- Phase 9-11: Orders (sales/revenue data)
- Phase 5-6: Inventory (COGS data, vendors)
- Phase 14: Settings (employees, tax settings)
- Phase 3: Account (user info)

## Technical Notes
- Accounts Payable aggregates from multiple sources as specified
- P&L Statement sections: Revenue, COGS, Gross Profit, Operating Expenses, Net Profit
- Cash Flow: Inflows (Sales, Other Income), Outflows (COGS, Expenses)
- Salary slips generated as PDF
- Lender system tracks individual loans and repayments

## Success Criteria
- [ ] Financial Dashboard shows all KPIs correctly
- [ ] Accounts Payable calculation is accurate
- [ ] Expenses can be logged with payments
- [ ] Employee expenses track reimbursement
- [ ] Salaries can be managed and slips generated
- [ ] Bank accounts and transactions work
- [ ] All financial reports generate correctly
- [ ] Lenders and loans fully functional
- [ ] Repayments update loan balances
