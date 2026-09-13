# Active Bug Tracking: Financial & Ledger Invariants

> **Domain:** Finance, Orders & Commercial Settlement  
> **Classification:** Double-Entry Ledger, State Machines & Precision Mathematics  
> **Status Registry:** Living Document — Updated Dynamically  

---

## 1. Category Summary & Health Metrics

The financial engine in Books3 is the critical operational core. Flaws in this domain result in direct monetary loss, phantom cash inflation, tax audit liabilities, or ledger corruption. Every financial mutation must strictly pass through `LedgerService` within a `@transaction.atomic` block backed by row-level locking (`select_for_update()`).

| Bug ID | Title / Subsystem | Severity | Status | Verification Target |
|---|---|---|---|---|
| **`BUG-FIN-001`** | Soft-Delete Double Balance Reversal Cascade | **CRITICAL** | **RESOLVED / PATCHED** | `finance/models.py:L481-L521` |
| **`BUG-FIN-002`** | Cash Drawer Transfer Self-Approval Exploit | **CRITICAL** | **RESOLVED / PATCHED** | `finance/models.py:L330-L331`, `finance/views.py:L1578-L1579`, `CashManagement.jsx:L289` |
| **`BUG-FIN-003`** | CashTransfer Double-Approval Concurrency Race | **CRITICAL** | **RESOLVED / PATCHED** | `finance/views.py:L1570-L1574` |
| **`BUG-FIN-004`** | UPE Loan Repayment Legacy Key Desync (`method` vs `payment_method`) | **HIGH** | **RESOLVED / PATCHED** | `LoanDetails.jsx:L150-L165` |
| **`BUG-FIN-005`** | Premature High-Value Outlay ($> \text{₹}5,000$) Without Step-Up Review | **HIGH** | **RESOLVED / RULE-ENFORCED** | `ExpenseDetails.jsx:L455`, `finance/views.py` |
| **`BUG-FIN-006`** | Trip Attribution Void (Ghost Reimbursement Liabilities) | **HIGH** | **RESOLVED / PATCHED** | `CreateTrip.jsx:L80-L110`, `TripDetails.jsx` |
| **`BUG-FIN-007`** | IEEE 754 Floating-Point Dust in Financial KPI Aggregations | **MEDIUM** | **RESOLVED / PATCHED** | `FinanceIndex.jsx`, `reports/views.py` |
| **`BUG-FIN-008`** | Restitution Over-Refund & Over-Return Exploitation | **CRITICAL** | **RESOLVED / PATCHED** | `orders/serializers.py:L862-L870`, `orders/models.py:L974-L987` |
| **`BUG-FIN-009`** | Off-Ledger Non-Sales Revenue Floating Deposits | **HIGH** | **RESOLVED / RULE-ENFORCED** | `AddOtherIncome.jsx`, `finance/models.py:L600+` |

---

## 2. Granular Bug Dossiers

### `BUG-FIN-001`: Soft-Delete Double Balance Reversal Cascade
- **Severity:** Critical (P0)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`finance/models.py`](file:///z:/books3/finance/models.py#L481-L521)
- **Mechanism & Root Cause:**
  When a `BankTransaction` record is deleted, `BankTransaction.delete()` reverses the bank balance (`account.current_balance -= self.amount`) and calls `super().delete()`. Because `BankTransaction` inherits from `SoftDeleteModel`, `super().delete()` does not issue an SQL `DELETE`; instead, it sets `self.is_deleted = True` and calls `self.save()`. In `BankTransaction.save()`, the model checks `if not self._state.adding:`, fetches the pre-deletion row (`old`), and executes balance delta calculations a second time, resulting in a catastrophic $2\times$ reversal of the deleted transaction.
- **Verification Evidence:**
  Inspected [`finance/models.py`](file:///z:/books3/finance/models.py#L482-L520):
  ```python
  def save(self, *args, **kwargs):
      # P1 Fix: Skip balance logic when called from delete (via _skip_balance flag)
      if getattr(self, '_skip_balance', False):
          super().save(*args, **kwargs)
          return
      # ... standard balance update ...

  def delete(self, *args, **kwargs):
      with transaction.atomic():
          account = BankAccount.objects.select_for_update().get(pk=self.account_id)
          if self.transaction_type in ['deposit', 'transfer_in']:
              account.current_balance -= self.amount
          else:
              account.current_balance += self.amount
          account.save()
          # P1 Fix: Set flag so SoftDeleteModel's internal save() skips balance logic
          self._skip_balance = True
          super().delete(*args, **kwargs)
  ```
- **Active Developments:** Fully protected. Any new soft-deleting financial model (`CashWalletTransaction`, `CustomerWalletTransaction`) must maintain the `_skip_balance` guard.

---

### `BUG-FIN-002`: Cash Drawer Transfer Self-Approval Exploit
- **Severity:** Critical (P0)
- **Status:** **RESOLVED / PATCHED**
- **Affected Files:**
  - Model: [`finance/models.py`](file:///z:/books3/finance/models.py#L330-L331)
  - View: [`finance/views.py`](file:///z:/books3/finance/views.py#L1578-L1579)
  - UI: [`frontend/src/pages/finance/CashManagement.jsx`](file:///z:/books3/frontend/src/pages/finance/CashManagement.jsx#L289-L290)
- **Mechanism & Root Cause:**
  In retail cash drawer operations, cashiers transfer funds between their physical cash wallet and the central company safe. If a cashier can initiate a transfer and immediately approve it themselves, funds can be drained without oversight.
- **Verification Evidence:**
  1. `CashTransfer.clean()` in `finance/models.py`:
     ```python
     if self.initiated_by == self.approved_by:
         raise ValidationError("A user cannot approve their own cash transfer.")
     ```
  2. `CashTransferViewSet.approve()` in `finance/views.py`:
     ```python
     if transfer.initiated_by == request.user and not request.user.is_superuser:
         return Response({'error': 'Cannot approve your own transfer. Requires peer manager review.'}, status=status.HTTP_403_FORBIDDEN)
     ```
  3. `CashManagement.jsx` button disabled latch:
     ```jsx
     disabled={(t.initiated_by === user?.id && !user?.is_superuser) || approvingId === t.id}
     title={t.initiated_by === user?.id && !user?.is_superuser ? "Cannot approve your own transfer" : ""}
     ```
- **Active Developments:** Verified triple-lock defense active across UI, DRF view, and model constraint.

---

### `BUG-FIN-003`: CashTransfer Double-Approval Concurrency Race
- **Severity:** Critical (P0)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`finance/views.py`](file:///z:/books3/finance/views.py#L1570-L1574)
- **Mechanism & Root Cause:**
  When two managers or a rapid double-click submitted approval for a pending `CashTransfer`, both concurrent requests read `status == 'pending'` before either committed. Both proceeded to execute `LedgerService.process_withdrawal()` and `LedgerService.process_deposit()`, moving double the intended funds.
- **Verification Evidence:**
  Line 1571 of `finance/views.py`:
  ```python
  with transaction.atomic():
      # P0 Fix: Lock the transfer row to prevent double-approval race condition.
      transfer = CashTransfer.objects.select_for_update().get(pk=pk)
      if transfer.status != 'pending':
          return Response({'error': 'Transfer is not pending.'}, status=status.HTTP_400_BAD_REQUEST)
  ```
- **Active Developments:** Protected by pessimistic row locking and atomic state transition.

---

### `BUG-FIN-004`: UPE Loan Repayment Legacy Key Desync (`method` vs `payment_method`)
- **Severity:** High (P1)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`frontend/src/pages/finance/LoanDetails.jsx`](file:///z:/books3/frontend/src/pages/finance/LoanDetails.jsx)
- **Mechanism & Root Cause:**
  The centralized `<UniversalPaymentEngine />` component standardized its emitted payload to `{ payment_method, ... }`. However, `LoanDetails.jsx` dispatches repayment requests to legacy endpoints expecting `{ method: 'cash'|'bank'|'wallet' }`. Dispatched repayments failed with `400 Bad Request: method is required`.
- **Verification Evidence:**
  In `LoanDetails.jsx`, an interceptor normalizes the payload before the HTTP request:
  ```javascript
  const payload = { ...upePayload };
  payload.method = payload.payment_method;
  delete payload.payment_method;
  ```
- **Active Developments:** Documented in `FE-24`. Target for eventual backend parameter harmonization in DRF serializer.

---

### `BUG-FIN-005`: Premature High-Value Outlay ($> \text{₹}5,000$) Without Step-Up Review
- **Severity:** High (P1)
- **Status:** **RESOLVED / RULE-ENFORCED**
- **Affected Files:**
  - Frontend: [`frontend/src/pages/finance/ExpenseDetails.jsx`](file:///z:/books3/frontend/src/pages/finance/ExpenseDetails.jsx#L455)
  - Backend: `finance/views.py` (ExpenseViewSet)
- **Mechanism & Root Cause:**
  Expenses $\le \text{₹}5,000$ are permitted for auto-approval. Expenses exceeding $\text{₹}5,000$ mandate manager step-up justification. If checkout cashiers could trigger cash disbursements while an expense was in `pending` approval, the audit boundary was breached.
- **Verification Evidence:**
  In `ExpenseDetails.jsx`:
  ```jsx
  {expense.approval_status !== 'approved' && (
      <p className="payment-blocked-notice">⚠️ Payment blocked until expense is approved.</p>
  )}
  ```
  The payment trigger button is strictly disabled unless `approval_status === 'approved'`.
- **Active Developments:** Codified into Rule 04.

---

### `BUG-FIN-006`: Trip Attribution Void (Ghost Reimbursement Liabilities)
- **Severity:** High (P1)
- **Status:** **RESOLVED / PATCHED**
- **Affected Files:** [`frontend/src/pages/finance/CreateTrip.jsx`](file:///z:/books3/frontend/src/pages/finance/CreateTrip.jsx), [`TripDetails.jsx`](file:///z:/books3/frontend/src/pages/finance/TripDetails.jsx)
- **Mechanism & Root Cause:**
  When creating a multi-item business trip, expenses attributed to `company` must immediately specify a payment source (`source_bank` or `source_wallet`). If omitted, the company was charged without an offsetting credit entry, creating unverified floating liabilities.
- **Verification Evidence:**
  In `CreateTrip.jsx`:
  The line-item submission validator asserts:
  ```javascript
  if (item.paid_by === 'company' && !item.source_bank && !item.source_wallet) {
      showToast('Select a funding account for company-paid trip expenses', 'error');
      return false;
  }
  ```
- **Active Developments:** Codified into `FE-22`.

---

### `BUG-FIN-007`: IEEE 754 Floating-Point Dust in Financial KPI Aggregations
- **Severity:** Medium (P2)
- **Status:** **RESOLVED / PATCHED**
- **Affected Files:** [`frontend/src/pages/finance/FinanceIndex.jsx`](file:///z:/books3/frontend/src/pages/finance/FinanceIndex.jsx), `frontend/src/pages/reports/`
- **Mechanism & Root Cause:**
  JavaScript binary floating-point representation causes fractional penny creep (`₹100.00000000004`) when summing thousands of ledger rows. This distorted dashboard balance gauges and triggered false mismatch warnings.
- **Verification Evidence:**
  All frontend finance modules import and enforce `round2`:
  ```javascript
  const round2 = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;
  ```
- **Active Developments:** All backend fields use PostgreSQL `numeric(14, 2)` / Django `DecimalField`. Frontend sanitizes all raw numeric display values.

---

### `BUG-FIN-008`: Restitution Over-Refund & Over-Return Exploitation
- **Severity:** Critical (P0)
- **Status:** **RESOLVED / PATCHED**
- **Affected Files:**
  - Validation: [`orders/serializers.py`](file:///z:/books3/orders/serializers.py#L862-L870)
  - Cost Basis: [`orders/models.py`](file:///z:/books3/orders/models.py#L974-L987)
- **Mechanism & Root Cause:**
  1. A dishonest operator could issue multiple partial refunds against an order until the sum exceeded the customer's total payments.
  2. In `ReturnItem.restore_stock()`, returning items to physical stock at the *current* market or WAC cost price inflated inventory asset valuation if prices had risen since the original sale.
- **Verification Evidence:**
  1. In `orders/serializers.py`:
     ```python
     existing_refunds = sum(r.amount for r in order.refunds.filter(status='completed'))
     if existing_refunds + amount > order.max_refundable:
         raise serializers.ValidationError({'amount': 'Total refunds would exceed maximum refundable limit.'})
     ```
  2. In `orders/models.py`:
     ```python
     StockService.adjust_stock(
         product_id=self.order_item.product.id,
         adjustment_type='increase',
         quantity=self.quantity,
         reason='return',
         unit_cost=self.order_item.cost_price, # Frozen historical sale cost
         target_ledger='both'
     )
     ```
- **Active Developments:** Double-checked and confirmed active.
