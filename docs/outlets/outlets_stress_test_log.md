# Outlets Module: Hellish Simulation Log

**Status:** ACTIVE
**Objective:** Comprehensive structural destruction testing of the B2B Consignment (Outlets) Module.
**Testing Personnel:** Lloyd (Taskmaster), Murphy (Architect), Vance (QA/Inventory), Jasper (React).

---

## Phase 1: The Double-Dispatch Race Condition

**Target:** `OutletStockTransfer.dispatch()`
**Hypothesis:** If two managers dispatch the exact same Draft transfer concurrently, the lack of `select_for_update()` on the `OutletStockTransfer` row will allow both threads to bypass the `status != DRAFT` check, resulting in a double-deduction from the Main Warehouse stock.

**Status:** FAILED (Vulnerability Confirmed)
**Execution Result:** Fired 3 concurrent dispatch requests on a single Draft transfer of 5 units. All 3 requests returned SUCCESS. The Main Warehouse was drained of 15 units (instead of 5), and the Outlet received 15 units. 
**Root Cause:** The `dispatch()` method checks `if self.status != self.Status.DRAFT:`, but does NOT lock the `OutletStockTransfer` row via `select_for_update()`. All threads read the 'draft' status simultaneously and proceed to deduct stock.

---

## Phase 2: The Orphaned Ledger Vulnerability

**Target:** `OutletPayment` and `finance.BankTransaction` linkage.
**Hypothesis:** Soft-deleting an `OutletPayment` safely hard-deletes the linked `BankTransaction`. However, if a user manually deletes the `BankTransaction` from the Finance app directly, the `OutletPayment` will remain, showing the Outlet's balance as paid while the actual bank ledger is empty.

**Status:** FAILED (Vulnerability Confirmed)
**Execution Result:** A payment of 5000.00 was recorded, increasing both Outlet Paid and Bank Balance. The underlying `BankTransaction` was then forcefully deleted. The Bank Balance correctly reverted to 0.00, but the `OutletPayment` remained active, keeping the Outlet Total Paid at 5000.00.
**Root Cause:** `BankTransaction` lacks a reciprocal signal or cascading soft-delete logic back to `OutletPayment`. If the financial record is destroyed, the Outlet ledger blindly trusts the orphaned payment.

---

## Phase 3: Consignment Return AVCO Skew

**Target:** `OutletStockReturn.receive()`
**Hypothesis:** The system attempts AVCO (Average Cost) protection by injecting `frozen_cost_price` when stock is returned. We will test if returning stock from an old transfer *after* the warehouse has received new, cheaper stock successfully protects the AVCO, or if the calculation breaks under edge cases.

**Status:** PASSED (Resilient)
**Execution Result:** A transfer was dispatched, freezing the unit cost at 100.00. The Main Warehouse AVCO was then artificially dumped to 10.00. When the Outlet returned the stock, the system successfully found the `frozen_cost_price` (100.00) from the transfer and injected it into `StockService.adjust_stock()`. The Warehouse AVCO was recalculated to 28.37, proving the AVCO protection successfully prevented the return from being evaluated at the new 10.00 rate.
**Verdict:** The system handles Consignment Returns flawlessly under AVCO fluctuations.

---

## Phase 4: Daily Sale Concurrency

**Target:** `OutletDailySaleItem.save()`
**Hypothesis:** Selling the exact same item concurrently from the same outlet will test the `select_for_update()` lock on `OutletStock`. We will verify if it accurately throws a ValueError or if it allows the outlet's physical stock to drop below zero despite the CheckConstraint.

**Status:** PASSED (Resilient)
**Execution Result:** Fired 2 concurrent threads attempting to sell 4 units of a product that only had 5 units in Outlet Stock. Thread 1 succeeded. Thread 0 waited for the lock, re-evaluated the stock (now 1 unit), and properly raised `ValueError: Outlet does not have enough [Product] to sell.` 
**Verdict:** The `select_for_update()` implementation in `OutletDailySaleItem.save()` successfully prevents negative consignment stock without throwing a database-level integrity error.
