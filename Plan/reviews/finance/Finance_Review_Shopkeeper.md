# Critical Business Logic Review: Finance Module
**Reviewer:** The Shopkeeper (Business Logic Expert)
**Date:** Monday, 9 March 2026

## Executive Summary
The finance module provides a broad foundation for business accounting but contains several critical "business logic holes" that could lead to financial leakage, incorrect reporting, and operational friction. The most severe issues are in the **Financial Dashboard (incorrect net profit)** and **Salary/Expense control workflows**.

---

## 1. Expenditure & Approval Workflow
### 1.1 Hardcoded Approval Threshold (Critical)
*   **Finding:** The expense approval threshold is hardcoded to `5000.00` in `Expense.save()`.
*   **Business Impact:** Small businesses might want approval for everything above 500, while larger ones might only care about 50,000. Hardcoding this makes the software rigid and potentially useless for different business scales.
*   **Logic:** `if self.total_amount >= Decimal('5000.00'): self.approval_status = self.ApprovalStatus.PENDING`

### 1.2 Payment Before Approval (High)
*   **Finding:** An expense can be fully paid even if its approval status is `PENDING` or `REJECTED`. 
*   **Business Impact:** This defeats the purpose of an approval workflow. A junior accountant could record and "pay" an unapproved expense, and the system would mark it as "Fully Paid" despite being rejected.
*   **Gap:** No check in `ExpenseViewSet.add_payment` or `Expense.save` to block payments on unapproved expenses.

### 1.3 Employee Reimbursement Gaps (Medium)
*   **Finding:** No receipt validation for employee expenses regardless of amount.
*   **Business Impact:** Tax compliance risk. Most tax authorities require receipts for expenses over a certain small threshold. The system allows submitting any amount without an attachment.

---

## 2. Payroll & Salary Management
### 2.1 Duplicate Salary Payments (High)
*   **Finding:** There is no check to prevent paying an employee's salary multiple times for the same period (e.g., paying "Jan 2026" twice).
*   **Business Impact:** Significant risk of overpayment and fraud.
*   **Gap:** `EmployeeSalaryViewSet.pay` does not validate `period_start` and `period_end` against existing `SalaryPayment` records.

### 2.2 Accrual Tracking (Medium)
*   **Finding:** The dashboard shows "Accrued Salaries" as `0.00` (hardcoded).
*   **Business Impact:** Misleading liability reporting. The system knows the base salary and frequency but doesn't calculate what is owed but not yet paid.

---

## 3. Financial Reporting & Accuracy
### 3.1 Incorrect Net Profit Calculation (Critical)
*   **Finding:** `FinancialDashboardView` calculates net profit as: `(Revenue - COGS) - Expenses + OtherIncome`.
*   **Business Impact:** **Highly Dangerous.** This formula ignores:
    1.  **Employee Reimbursements:** (EmployeeExpense records are not deducted).
    2.  **Salaries:** (SalaryPayment records are not deducted).
    3.  **Loan Interest:** (The interest portion of LoanRepayment is a business expense but ignored).
*   **Result:** Business owners will see a much higher "Net Profit" than reality, leading to bad dividend/investment decisions.

### 3.2 Fiscal Year Rigidity (Medium)
*   **Finding:** The 'Year' period in reports is hardcoded to April–March.
*   **Business Impact:** Useless for businesses in regions with Jan–Dec or July–June fiscal years.

### 3.3 Overlapping Budgets (Medium)
*   **Finding:** `CategoryBudget` only enforces uniqueness on `period_start`.
*   **Business Impact:** A user can create overlapping periods (e.g., Jan 1–Jan 31 and Jan 15–Feb 15). Expenses in the overlap are double-counted in both budgets, making "Remaining Budget" calculations nonsensical.

---

## 4. Banking & Loans
### 4.1 Reconciliation is a "Placebo" (Medium)
*   **Finding:** `BankTransaction.is_reconciled` is just a manual checkbox.
*   **Business Impact:** No real security. True reconciliation requires matching against a bank statement (upload/import). Here, a user can just "check the box" without any verification.

### 4.2 Loan EMI Inflexibility (Low)
*   **Finding:** `Loan.emi` calculates based on the original principal.
*   **Business Impact:** If a business makes a large principal-only payment, the system doesn't automatically recalculate the remaining EMI or term, leading to "shadow" calculations outside the system.

---

## 5. Architectural & Feature Gaps
### 5.1 Recurring Expense Linkage (Low)
*   **Finding:** Generated expenses have no foreign key link back to the `RecurringExpense` template.
*   **Business Impact:** If a recurring amount changes (e.g., rent increase), you cannot easily audit which past expenses came from that specific template.

### 5.2 Multi-Currency Support (High)
*   **Finding:** No currency fields. 
*   **Business Impact:** The system is limited to single-region businesses. Any business with international vendors or customers cannot use this module accurately.

### 5.3 Tax Compliance (High)
*   **Finding:** No tracking for TDS (Tax Deducted at Source) or GST Input Credit.
*   **Business Impact:** In many regions (like India), businesses MUST deduct tax before paying certain vendors/employees. Ignoring this makes the software non-compliant with standard accounting laws.
