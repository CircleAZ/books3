# Deep Performance & Data Integrity Review: Finance Module

**Reviewer:** The Scalpel (Database & Query Optimization Specialist)
**Date:** Monday, March 9, 2026
**Scope:** `finance` module models, views, and serializers.

---

## 1. N+1 Query Hazards in Serializers

Several serializers implement `SerializerMethodField` or property lookups that trigger database queries for every item in a list view.

*   **`ExpenseCategorySerializer`**:
    *   `expenses_count`: Calls `obj.expenses.count()`. In a list of 20 categories, this adds 20 `COUNT` queries.
    *   **`budget_info`**: Catastrophic N+1. It filters `obj.budgets` for the current date, then accesses `spent`, `remaining`, and `utilization_pct`. Each of these accesses triggers a full `Sum` aggregation on the `Expense` table for that category and period.
*   **`BankAccountSerializer`**:
    *   `recent_transactions`: Calls `obj.transactions.all()[:5]`. This **bypasses any `prefetch_related`** cache because it adds a slice (`LIMIT 5`), causing a new query for every bank account.
*   **`EmployeeSalarySerializer`**:
    *   `recent_payments`: Similar to bank transactions, calls `obj.payments.all()[:5]`.
*   **`LenderSerializer`**:
    *   `active_loans`: Calls `obj.loans.filter(is_active=True)[:5]`.
*   **`CategoryBudgetSerializer`**:
    *   Exposes `spent`, `remaining`, and `utilization_pct` as fields. These are properties on the model that perform aggregations. In a list view of budgets, this is extremely slow.

**Recommendation**: Use `annotate()` in the ViewSet's `get_queryset()` to pre-calculate counts and sums. For "recent items" lists, consider a separate detail endpoint or accept the N+1 only for single-object retrieves.

---

## 2. Catastrophic Aggregation: `CategoryBudget.spent`

The `spent` property in `CategoryBudget` is a performance "time bomb":

```python
@property
def spent(self):
    return Expense.objects.filter(
        category=self.category,
        date__gte=self.period_start,
        date__lte=self.period_end,
        is_deleted=False
    ).aggregate(total=models.Sum('total_amount'))['total'] or Decimal('0.00')
```

This property is accessed multiple times during serialization of a single `CategoryBudget` object. If a category has thousands of expenses, every page load of the budget list will perform dozens of table scans or index lookups.

**Recommendation**: Denormalize `spent_amount` onto the `CategoryBudget` model and update it via signals or `save()` overrides on the `Expense` model, or use a cached property/annotation.

---

## 3. Missing Database Indexes

The following fields are frequently used in `filter()`, `exclude()`, and `order_by()` but lack `db_index=True`:

*   **`SoftDeleteModel.is_deleted`**: Since the default manager (`objects`) filters on `is_deleted=False` for virtually every query, this field **must** be indexed to avoid full table scans on every request.
*   **`Expense`**: `date`, `payment_status`, `approval_status`, `payee_id`.
*   **`BankTransaction`**: `date`, `transaction_type`.
*   **`EmployeeExpense`**: `date`, `status`.
*   **`Loan`**: `is_active`, `start_date`, `end_date`.
*   **`CategoryBudget`**: `period_start`, `period_end`.
*   **`RecurringExpense`**: `next_date`, `is_active`.

---

## 4. Scalability Issues in Denormalization (O(n) Save)

`LoanRepayment.save()` and `ExpensePayment.save()` both use the following pattern:

```python
total = loan.repayments.aggregate(total=models.Sum('principal_portion'))['total']
loan.total_paid = total
loan.save()
```

This is an **O(n)** operation where `n` is the number of repayments. For a loan with 360 monthly installments, the 360th repayment save will be significantly slower than the 1st. 

**Recommendation**: Use incremental updates:
```python
Loan.objects.filter(pk=self.loan_id).update(total_paid=F('total_paid') + self.principal_portion)
```
*Note: Handle updates and deletions carefully to maintain consistency.*

---

## 5. BankTransaction Data Integrity & Soft Delete

The `BankTransaction.delete()` method is overridden to revert the bank balance before soft-deleting. However:

1.  `BankTransaction.save()` also modifies the balance.
2.  `soft_delete()` calls `self.save(update_fields=...)`.
3.  Inside `save()`, `BankTransaction.objects.get(pk=self.pk)` is called to find the "old" state.
4.  **Crucial Bug**: The `objects` manager excludes deleted records. If `is_deleted` is already `True` in memory when `save()` is called, `objects.get()` will fail to find the record in the DB (or return the wrong one), potentially causing `BankAccount.current_balance` to drift.

**Recommendation**: `BankTransaction.save()` should use `self.all_objects.get()` to fetch the previous state.

---

## 6. Decimal Precision Hazards

`Loan.emi` converts financial data to `float`:

```python
emi_val = float(self.principal_amount) * r * (1 + r)**n / ((1 + r)**n - 1)
return Decimal(str(round(emi_val, 2)))
```

**Floating point math is non-deterministic for currency.** 
**Recommendation**: Use the `decimal` module for all financial calculations to avoid rounding errors that accumulate over time.

---

## 7. Dashboard Performance & Caching

The `FinancialDashboardView` performs 10+ aggregations. 
*   **Double Counting Risk**: `accounts_receivable` joins `Order` to `payments` then aggregates. If an order has 3 payments, the `Sum('total')` might triple the revenue if not handled with `Distinct` or subqueries.
*   **Cache Invalidation**: The dashboard caches for 5 minutes. However, a million-dollar expense created 1 second after cache generation won't show up for 5 minutes. For high-stakes financial data, consider "Russian Doll" caching or signal-based invalidation.

---

## 8. CSV Export Memory Usage

`ExpenseViewSet.export_csv` iterates over `self.get_queryset()[:5000]`.
*   This loads 5,000 Django model instances into memory.
*   It also performs `prefetch_related('payments')`, which will execute a massive `IN` query for all payments of those 5,000 expenses.

**Recommendation**: Use `.iterator()` to stream records from the database and `StreamingHttpResponse` to avoid buffering the entire CSV in memory before sending.

---

## 9. `select_for_update` Scope

The use of `select_for_update` on `BankAccount` is excellent for preventing race conditions on balance updates. However, the `atomic` block in `ExpensePayment.save` is opened **after** the payment is already saved by `super().save()`. While not a data integrity failure for the payment itself, it leaves a small window where the `Expense.paid_amount` is out of sync with the sum of `ExpensePayment` records.

---

## Final Verdict

The module is functionally rich but **not ready for high-volume production**. The combination of N+1 hazards in list views and property-based aggregations will cause significant latency as the database grows. **Prioritize indexing `is_deleted` and refactoring `CategoryBudget.spent` immediately.**
