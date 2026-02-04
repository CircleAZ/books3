# 💸 Financial Exploitation Hell Tests

## 1. AVCO (Weighted Average Cost) Manipulation

### TEST-FIN-001: Negative Stock COGS Exploitation
**Goal**: Exploit estimated cost vs actual cost discrepancy
```
Steps:
1. Product A: Initial cost ₹100, stock 10 units
2. Sell 15 units (stock goes to -5)
3. System uses "estimated cost" (₹100)
4. Restock 10 units at cost ₹50
5. Check: Does COGS of old sales retroactively change?
6. Check: Is the ₹250 difference (5 units × ₹50) recorded as adjustment?

Expected: Adjustment recorded in current period
Evil Expected: No tracking → Profit reporting incorrect
```

### TEST-FIN-002: Zero-Cost Stock Injection
**Goal**: Add inventory with ₹0 cost to manipulate AVCO
```
Steps:
1. Product has AVCO of ₹100 with 100 units
2. Add 1000 units at cost ₹0 (gift stock, damaged return)
3. New AVCO = (100*100 + 1000*0) / 1100 = ₹9.09
4. Sell all 1100 units at ₹100 each
5. Check profit calculation

Expected: System flags unusual cost entries
Evil Expected: Inflated fake profits visible in reports
```

### TEST-FIN-003: AVCO Division by Zero
**Goal**: Crash AVCO calculation
```
Steps:
1. Create product with 0 stock, ₹0 cost
2. Add 0 units at ₹0 cost
3. Attempt to calculate AVCO

Expected: Graceful handling
Evil Expected: Division by zero crash
```

---

## 2. Payment Processing Exploits

### TEST-FIN-004: Overpayment Abuse
**Goal**: Generate unlimited store credit
```
Steps:
1. Create order for ₹100
2. Record payment of ₹100,000 (cash)
3. Check: Does ₹99,900 go to customer wallet?
4. Cancel order
5. Check: Is overpayment refunded + wallet credit retained?

Expected: Overpayment capped or flagged
Evil Expected: Infinite money glitch
```

### TEST-FIN-005: Partial Payment Race Condition
**Goal**: Pay more than 100% via race condition
```
Steps:
1. Create order for ₹1000
2. Open 2 browser tabs
3. Simultaneously submit:
   - Tab 1: Pay ₹600 (partial)
   - Tab 2: Pay ₹600 (partial)
4. Check: Total recorded = ₹1200 for ₹1000 order?

Expected: Locking prevents double payment
Evil Expected: Overpayment without proper handling
```

### TEST-FIN-006: Payment Status Manipulation
**Goal**: Mark order as paid without actual payment
```
Steps:
1. Create order
2. Intercept API request when marking paid
3. Modify request to skip payment recording
4. Submit

Expected: Payment status derived from actual payments
Evil Expected: Status editable independently → Order delivered without payment
```

### TEST-FIN-007: Currency Precision Exploit
**Goal**: Exploit rounding errors
```
Steps:
1. Create 1000 orders, each for ₹10.005
2. System rounds each to ₹10.01 or ₹10.00
3. Calculate total difference

Expected: Consistent rounding, bank-style (round half even)
Evil Expected: Accumulating rounding errors in either direction
```

---

## 3. Discount Manipulation

### TEST-FIN-008: Infinite Discount Stacking
**Goal**: Apply multiple discounts to reduce price to zero/negative
```
Steps:
1. Add product ₹100
2. Apply item discount: 50%
3. Apply order discount: 50%
4. Apply coupon: 20%
5. Check final price

Expected: Maximum total discount capped (e.g., 80%)
Evil Expected: Negative total or zero with discounts stacking
```

### TEST-FIN-009: Discount Type Confusion
**Goal**: Confuse percentage vs fixed amount
```
Steps:
1. Apply discount of "50" (no type specified)
2. Check: Is it ₹50 off or 50% off?
3. On ₹1000 order: ₹50 off = ₹950, 50% off = ₹500

Expected: Type always required/validated
Evil Expected: Attacker controls interpretation
```

### TEST-FIN-010: Post-Order Discount Addition
**Goal**: Add discounts after order completed
```
Steps:
1. Complete order, payment received
2. Edit order (if allowed)
3. Add 100% discount
4. Check: Is refund generated? Payment records affected?

Expected: Discount changes restricted for delivered orders
Evil Expected: Can reduce already-paid orders
```

---

## 4. Refund & Returns Exploitation

### TEST-FIN-011: Refund Higher Than Payment
**Goal**: Refund more than was paid
```
Steps:
1. Order ₹100, pay ₹100, status: Complete
2. Initiate return for full order
3. Manually edit refund amount to ₹500
4. Process refund

Expected: Refund capped at payment amount
Evil Expected: Fraudulent refund processed
```

### TEST-FIN-012: Double Refund Attack
**Goal**: Get refund twice for same order
```
Steps:
1. Complete order, receive goods
2. Request refund via web
3. Simultaneously request refund via mobile/API
4. Both approved before system syncs

Expected: Refund status locked during processing
Evil Expected: Double refund issued
```

### TEST-FIN-013: Return Without Refund Track
**Goal**: Return items, manipulate inventory, no financial record
```
Steps:
1. Return item, select "damaged - discard"
2. Actually item never returned
3. Check inventory (should NOT increase)
4. Check refund status

Expected: Clear audit trail
Evil Expected: Inventory/refund mismatch undetected
```

### TEST-FIN-014: Refund to Different Method
**Goal**: Pay with UPI, get cash refund
```
Steps:
1. Pay order with UPI
2. Request refund
3. Request refund paid in cash

Expected: Refund to original payment method
Evil Expected: Cash refund for UPI payment → Money laundering potential
```

---

## 5. Store Credit/Wallet Abuse

### TEST-FIN-015: Wallet Balance Manipulation
**Goal**: Directly edit wallet balance
```
Steps:
1. Check customer wallet: ₹50
2. Intercept API, send PATCH with balance: ₹50,000
3. Use wallet to purchase ₹50,000 in goods

Expected: Wallet balance calculated from transactions, not editable
Evil Expected: Direct balance manipulation possible
```

### TEST-FIN-016: Wallet Credit Without Source
**Goal**: Generate wallet credit from nothing
```
Steps:
1. Create "overpayment" record without corresponding order
2. Create "return credit" without corresponding order
3. Check wallet balance

Expected: Credits require valid source documents
Evil Expected: Orphan credits accepted
```

### TEST-FIN-017: Negative Wallet Balance
**Goal**: Use more credit than available
```
Steps:
1. Wallet balance: ₹100
2. Create order ₹500
3. Apply wallet: ₹100
4. Race condition: Start 5 orders simultaneously
5. All 5 apply ₹100 wallet each

Expected: Wallet debited only once, others fail
Evil Expected: Wallet goes -₹400
```

---

## 6. Expense & Salary Fraud

### TEST-FIN-018: Self-Approved Expense
**Goal**: Employee approves own expenses
```
Steps:
1. Login as employee
2. Submit expense claim for ₹50,000
3. Login as same employee (if they have manager role)
4. Approve own expense

Expected: Self-approval blocked
Evil Expected: Employee can approve own claims
```

### TEST-FIN-019: Retroactive Expense Modification
**Goal**: Change approved expense to higher amount
```
Steps:
1. Submit expense: ₹100
2. Get approved
3. Edit expense to ₹10,000
4. Check if reapproval required

Expected: Edit triggers re-approval
Evil Expected: Silent change, already approved status retained
```

### TEST-FIN-020: Phantom Employee Salary
**Goal**: Create salary for non-existent employee
```
Steps:
1. Create employee record
2. Set up salary payments
3. Delete employee record
4. Check if salary payments continue/are possible

Expected: Salary linked to active employees only
Evil Expected: Orphan salary records processable
```

---

## 7. Loan & Lender Exploitation

### TEST-FIN-021: Negative Loan Amount
**Goal**: Record loan with negative principal
```
Steps:
1. Add new loan: Principal = -₹100,000
2. Check lender balance calculations
3. Record "repayment"

Expected: Negative amounts rejected
Evil Expected: Backwards cash flow logic
```

### TEST-FIN-022: Overpay Loan
**Goal**: Pay more than owed
```
Steps:
1. Loan: ₹10,000 principal
2. Record repayments totaling ₹15,000
3. Check remaining balance (should not be -₹5,000)

Expected: Repayment capped or flagged
Evil Expected: Negative balance → "Lender owes us money"
```

---

## 🌐 BROWSER TEST SCENARIOS

### BROWSER-FIN-001: Calculator Tab Switching
```javascript
Test Steps:
1. Start creating order in Tab A
2. Open Tab B, edit product prices
3. Return to Tab A, complete order
Question: Which prices are used?
```

### BROWSER-FIN-002: Network Disconnect During Payment
```javascript
Test Steps:
1. Fill order, click "Complete & Pay"
2. Disconnect network immediately
3. Wait for timeout
4. Reconnect
Question: Is payment recorded? Is order created? What state?
```

### BROWSER-FIN-003: DevTools Amount Modification
```javascript
// In console:
document.querySelector('[name="amount"]').value = "-1000";
document.querySelector('form').submit();
// Does negative payment get recorded?
```

### BROWSER-FIN-004: Date Manipulation
```javascript
// Change system date to future:
// Process today's order with future date
// Check: Future revenue in reports? Audit trail accurate?
```

---

## Test Execution Checklist

| Test ID | Status | Bug Found? | Severity |
|---------|--------|------------|----------|
| TEST-FIN-001 | ⬜ | | |
| TEST-FIN-002 | ⬜ | | |
| TEST-FIN-003 | ⬜ | | |
| TEST-FIN-004 | ⬜ | | |
| TEST-FIN-005 | ⬜ | | |
| TEST-FIN-006 | ⬜ | | |
| TEST-FIN-007 | ⬜ | | |
| TEST-FIN-008 | ⬜ | | |
| TEST-FIN-009 | ⬜ | | |
| TEST-FIN-010 | ⬜ | | |
| TEST-FIN-011 | ⬜ | | |
| TEST-FIN-012 | ⬜ | | |
| TEST-FIN-013 | ⬜ | | |
| TEST-FIN-014 | ⬜ | | |
| TEST-FIN-015 | ⬜ | | |
| TEST-FIN-016 | ⬜ | | |
| TEST-FIN-017 | ⬜ | | |
| TEST-FIN-018 | ⬜ | | |
| TEST-FIN-019 | ⬜ | | |
| TEST-FIN-020 | ⬜ | | |
| TEST-FIN-021 | ⬜ | | |
| TEST-FIN-022 | ⬜ | | |
