# Finance Module Security Audit - AZ Books
**Auditor:** The Ironclad (Security Specialist)
**Date:** Monday, 9 March 2026

## Executive Summary
The finance module implements a robust set of features for expense tracking, banking, and employee reimbursements. However, several security vulnerabilities were identified that could lead to Cross-Site Scripting (XSS), CSV Injection, and exposure of sensitive financial data (PII). The permission model, while centralized, has logic gaps that may prevent legitimate users from performing their duties or allow unauthorized actions.

---

## Findings

### 1. Insufficient XSS Prevention (strip_tags)
- **Location:** serializers.py -> _sanitize() helper.
- **Issue:** The module uses Django's strip_tags to sanitize text inputs. strip_tags is a simple regex-based tool that removes anything between < and >.
- **Vulnerability:** It does not protect against malformed HTML, attribute-based XSS (e.g., <img src=x onerror=...> might be stripped, but <<script>... bypasses it in some versions), or context-specific injections. It also aggressively removes legitimate data (e.g., "Amount < 100").
- **Recommendation:** Replace strip_tags with leach or DOMPurify (on the frontend). For the backend, use a proper HTML sanitizer that allows a safe whitelist of tags and attributes if HTML is needed, or stick to plain text and rely on template auto-escaping.

### 2. CSV Injection (Formula Injection)
- **Location:** iews.py -> ExpenseViewSet.export_csv.
- **Issue:** The CSV export writes user-supplied fields like payee_name, description, and 
otes directly to the CSV file without prefix checking.
- **Vulnerability:** If an attacker creates an expense with a payee name like =SUM(1+1)*cmd|' /C calc'!A0, many spreadsheet applications (Excel, LibreOffice) will execute the command when the CSV is opened.
- **Recommendation:** Prepend a single quote (') to any field starting with =, +, -, or @ before writing to the CSV.

### 3. Sensitive Data Exposure in Django Admin
- **Location:** dmin.py -> BankAccountAdmin.
- **Issue:** While the BankAccountSerializer correctly masks the account number for the API, the BankAccountAdmin includes ccount_number in search_fields and does not mask it in the list or detail views.
- **Vulnerability:** Any staff member with access to the Django Admin can view the full bank account numbers of all company accounts.
- **Recommendation:** Use a custom get_readonly_fields or a field override in dmin.py to mask the account number, similar to the API implementation.

### 4. IDOR & Logic Gaps in Employee Expenses
- **Location:** iews.py -> EmployeeExpenseViewSet.get_queryset.
- **Issue:** The queryset is filtered to show only the user's own expenses if they are not is_staff.
- **Logic Gap:** If an "Accountant" or "Manager" (as defined in FinancePermission) is NOT is_staff=True, they will be unable to see other employees' expenses to approve them, even though FinancePermission grants them access to the endpoint.
- **Risk:** Conversely, the pprove, eject, and eimburse actions rely on self.get_object(). While get_object respects the filtered queryset, a staff member (even if not an Accountant) can see and modify everything.
- **Recommendation:** Refine get_queryset to allow users with specific roles (Accountant/Manager) to see all expenses regardless of is_staff status, and implement stricter object-level checks in actions.

### 5. Potential Overpayment Race Condition
- **Location:** serializers.py -> ExpensePaymentSerializer.validate.
- **Issue:** The validation for overpayment calculates the sum of existing payments.
- **Vulnerability:** While ExpensePayment.save() uses 	ransaction.atomic() and select_for_update(), the *validation* in the serializer happens before the transaction starts. Two simultaneous requests could both pass validation and lead to a total paid amount exceeding the expense total.
- **Recommendation:** Move the overpayment validation into the model's save() method within the atomic transaction or use F expressions for validation.

### 6. Rate Limiting Gaps
- **Location:** iews.py -> FinanceActionThrottle.
- **Issue:** Throttling (30/min) is only applied to specific write actions (dd_payment, pprove_expense, etc.).
- **Vulnerability:** The standard CRUD operations (POST, PUT, PATCH, DELETE) and heavy GET operations (like the dashboard) are not explicitly throttled by this class, leaving them vulnerable to automated scraping or DoS.
- **Recommendation:** Apply FinanceActionThrottle to the entire ViewSet or define a global UserRateThrottle in settings.

### 7. File Upload Risks
- **Location:** models.py -> ExpensePayment.receipt, EmployeeExpense.receipt.
- **Issue:** ImageField is used for receipts.
- **Vulnerability:** While ImageField validates that the file is an image, it doesn't prevent "ImageTragick" style exploits or large file DoS if the storage backend (local disk) is not protected.
- **Recommendation:** Implement file size limits in the serializer and consider using a library like django-cleanup or scanning files for malware if possible.

### 8. Permission Model - Hardcoded Roles
- **Location:** permissions.py -> FinancePermission.
- **Issue:** Roles are hardcoded as strings: ['Admin', 'Manager', 'Accountant', 'Store Manager'].
- **Risk:** Brittle logic. If a role is renamed or a new equivalent role is added in the database, the finance module will silently block them.
- **Recommendation:** Use a more flexible permission system (e.g., django-guardian or a flag on the Role model like can_access_finance).
