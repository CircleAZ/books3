# Rule 04: Financial Ledger & Domain Invariants

## 1. Mandatory `LedgerService` Gateway (Zero Direct Mutations)
- **Strict Prohibition:** Direct balance updates on `CashWallet.balance` or `BankAccount.current_balance` (e.g. `wallet.balance += amount` or `account.save()`) are **STRICTLY FORBIDDEN**.
- **Sanctioned Gateway:** All financial inflows and outflows MUST route through `finance.services.LedgerService`:
  - `LedgerService.process_deposit(amount, destination_bank=None, destination_wallet=None, reference, description, user, date=None, **kwargs)`
  - `LedgerService.process_withdrawal(amount, source_bank=None, source_wallet=None, reference, description, user, date=None, allow_overdraft=False, **kwargs)`
- **Kwargs Whitelist (Ironclad Contract):** Whitelisted kwargs are strictly `{related_loan, related_expense, recorded_by, created_by}`. Any other kwargs raise a `ValidationError`.
- **Concurrency Protection:** Both methods enforce `select_for_update()` row locking on the target account/wallet inside an atomic block.

## 2. Zero-Floor Input Lockdown (`min_value=0`)
- **The Exploit:** Historical audits revealed salesmen could inject negative unit prices or negative discount values in POS serializers, causing mathematical debt inversions and negative cash drainage.
- **Strict Rule:** Every POS-facing `DecimalField` input MUST enforce `min_value=0`:
  - `OrderItemCreateSerializer.unit_price` (`min_value=0`)
  - `OrderItemCreateSerializer.discount_value` (`min_value=0`)
  - `OrderCreateSerializer.discount_value` (`min_value=0`)
  - `PaymentCreateSerializer.amount` (`min_value=0`)
  - `OutletProductCommission.commission_rate` / `commission_amount` (`min_value=0`)

## 3. Decimal Precision & KaTeX Financial Equilibrium
- **Floating Point Prohibition:** Financial math must NEVER use Python `float`. Floats introduce rounding inaccuracies (e.g. `0.1 + 0.2 = 0.30000000000000004`). All currency and price fields must strictly use Python `decimal.Decimal` with explicit quantizing (`ROUND_HALF_UP`).
- **Mathematical Equilibrium:** Financial mutations must preserve total ledger balance:
  $$\Delta \text{Bank Balance} + \Delta \text{Cash Wallet Balance} = \sum \text{Net Transactions}$$

## 4. Reciprocal Deletion & Reversal Cascades
- **The Orphaned Ledger Catastrophe:** In legacy `books2`, deleting a `BankTransaction` reversed the bank balance but left the linked `OutletPayment` intact, causing the outlet ledger to report ₹5,000 paid while the actual bank ledger showed ₹0.
- **Strict Rule:** Any deletion or soft-delete of a payment or transaction entity (`BankTransaction`, `OutletPayment`, `Payment`, `Refund`) must atomically reverse its associated ledger counterpart.
- **Soft-Delete Query Trap:** In `BankTransaction.save()`, looking up the previous state using the default manager `objects.get(pk=self.pk)` fails if `is_deleted=True` in memory, causing balance calculations to drift. Code MUST use `BankTransaction.all_objects.get(pk=self.pk)`.

## 5. Consignment AVCO (Average Cost) Preservation
- **The AVCO Inflation Skew:** Returning inventory from an outlet or customer at current warehouse rates after new cheaper inventory arrived causes artificial cost inflation.
- **Strict Rule:** Returns (`OutletStockReturn`, `ReturnItem`) must freeze the original landed unit cost (`frozen_cost_price`) from the original shipment/order and pass it into `StockService.adjust_stock()`.

## 6. Overpayment & Legacy Debt Routing
- **POS Atomic Split:** When customer payments exceed an order's total, the excess cash must automatically route to `LegacyDebt.recovered_amount` and customer `Wallet` store credit.
- **Physical Cash Preservation:** The full physical cash amount (not the order-capped total) must be passed to `deferred_deposits` so `LedgerService` logs the complete physical cash intake.

## 7. Expense Approval Threshold
- **Threshold Rule:** Any expense $\ge ₹5,000$ automatically sets `approval_status = 'pending'` and blocks payment creation until explicitly approved by an authorized manager.
