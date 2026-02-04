# 🛒 Order/POS Destruction Hell Tests

## 1. Cart Manipulation

### TEST-ORD-001: Cart Item ID Tampering
**Goal**: Add any product at any price
```
Steps:
1. Add legitimate product to cart
2. Intercept API request
3. Change product_id to expensive product
4. Change price to ₹1
5. Complete checkout

Expected: Price calculated server-side from product ID
Evil Expected: Client-supplied price accepted
```

### TEST-ORD-002: Phantom Cart Items
**Goal**: Add items that don't exist
```
Steps:
1. Create order with product_id = non-existent UUID
2. Submit order

Expected: Validation error
Evil Expected: Order created with null product reference
```

### TEST-ORD-003: Cart Maximum Abuse
**Goal**: Crash with enormous cart
```
Steps:
1. Add 10,000 unique products to cart
2. Try to view cart
3. Try to calculate total

Expected: Cart item limit enforced
Evil Expected: Memory exhaustion, timeout
```

### TEST-ORD-004: Remove Item Below Zero
**Goal**: Negative quantity in cart
```
Steps:
1. Add 1x Product A
2. API request: decrement quantity twice
3. Check: quantity = 0 or -1?

Expected: Remove item when quantity reaches 0
Evil Expected: Negative quantity (credit?)
```

---

## 2. Guest Checkout Exploitation

### TEST-ORD-005: Guest Customer Pollution
**Goal**: Pollute guest record with personal data
```
Steps:
1. Guest checkout with name "DROP TABLE customers;"
2. Check: Is this stored in permanent guest record or order?

Expected: Guest data in order record only
Evil Expected: Guest customer record modified
```

### TEST-ORD-006: Guest → Registered Conversion Abuse
**Goal**: Claim guest purchases for new account
```
Steps:
1. Guest purchases: 10 orders, ₹50,000 total
2. Create account with same email
3. Check: Are guest purchases linked to new account?

Expected: Not automatic (require verification)
Evil Expected: Automatic linking → Steal purchase history
```

---

## 3. Order Status State Machine Attacks

### TEST-ORD-007: Status Bypass Attack
**Goal**: Skip required status transitions
```
Steps:
1. New order: Status = "Processing"
2. Direct API: Set status = "Order Complete"
3. Skip "Delivered" status entirely

Expected: State machine enforces transitions
Evil Expected: Any status settable directly
```

### TEST-ORD-008: Delivered Order Edit
**Goal**: Modify delivered order items
```
Steps:
1. Order: 5x Product A, delivered, paid
2. Edit order: Change to 1x Product A
3. Check: Inventory updated? Payment adjusted?

Expected: Edit blocked for delivered orders
Evil Expected: Order modifiable, inconsistent state
```

### TEST-ORD-009: Cancel Delivered Order
**Goal**: Cancel after customer has goods
```
Steps:
1. Order delivered, payment received
2. Cancel order
3. Check: Payment status? Refund created? Inventory?

Expected: Cancellation blocked or creates return
Evil Expected: Order cancelled, goods kept, payment... ?
```

### TEST-ORD-010: Parallel Status Changes
**Goal**: Race condition in status updates
```
Steps:
1. Order in "Processing"
2. Cashier A: Mark as "Delivered" 
3. Cashier B: Mark as "Cancelled" (simultaneously)
4. Check: Which status wins? Is it consistent?

Expected: Locking prevents conflict
Evil Expected: State corruption
```

---

## 4. Payment Flow Attacks

### TEST-ORD-011: Multiple Payment Methods Exploitation
**Goal**: Confuse payment total with splits
```
Steps:
1. Order total: ₹1000
2. Pay ₹600 cash
3. Pay ₹600 UPI (total = ₹1200)
4. Check: System handles overpayment?

Expected: Payment sum validated against order total
Evil Expected: ₹200 refund/credit created
```

### TEST-ORD-012: Pay After Cancel
**Goal**: Record payment for cancelled order
```
Steps:
1. Create order
2. Cancel order
3. Record payment for that order

Expected: Payment blocked for cancelled orders
Evil Expected: Payment recorded, money disappears
```

### TEST-ORD-013: UPI Without QR Scan
**Goal**: Claim UPI payment without proof
```
Steps:
1. Select UPI payment method
2. Don't actually scan QR / complete payment
3. Mark as "Paid" anyway

Expected: UPI payments require transaction ID
Evil Expected: Unverified UPI payments accepted
```

### TEST-ORD-014: Change Due Manipulation
**Goal**: Record incorrect change
```
Steps:
1. Order: ₹800
2. Record: Paid ₹1000 cash
3. Change due: ₹200
4. Modify change amount to ₹500

Expected: Change calculated, not entered
Evil Expected: Arbitrary change recordable
```

---

## 5. Order Hold/Draft Abuse

### TEST-ORD-015: Held Order Price Lock
**Goal**: Hold order, change prices, complete
```
Steps:
1. Create order with Product A at ₹100
2. Hold order
3. Admin changes Product A price to ₹150
4. Resume held order
5. Complete order

Expected: Price from hold time preserved
Evil Expected: New price applied (customer advantage or dispute)
```

### TEST-ORD-016: Infinite Held Orders
**Goal**: Create unlimited drafts to lock resources
```
Steps:
1. Create 1000 held orders
2. Each with 100 items
3. Check: Server memory usage? Database size?

Expected: Held order limit per user
Evil Expected: Resource exhaustion
```

### TEST-ORD-017: Held Order Customer Switch
**Goal**: Change customer after order started
```
Steps:
1. Start order for Customer A (has wallet credit)
2. Apply wallet credit
3. Hold order
4. Resume, change customer to B
5. Complete

Expected: Wallet credit removed when customer changes
Evil Expected: Customer A's credit used for B's order
```

---

## 6. Quick Add / Inline Product Creation

### TEST-ORD-018: Inline Product Infinite Loop
**Goal**: Create product that creates order that creates product
```
Steps:
1. Use "+" button to create product
2. In product name, somehow trigger another "+" action
3. Check for recursive creation

Expected: Inline creation is simple modal
Evil Expected: UI recursion possible
```

### TEST-ORD-019: Inline Product Without Category
**Goal**: Create incomplete product via shortcut
```
Steps:
1. Quick create during order
2. Skip category (required field)
3. Complete

Expected: Required fields enforced
Evil Expected: Invalid product created
```

---

## 7. Return Attack Chains

### TEST-ORD-020: Return More Than Purchased
**Goal**: Return 10 items when only 5 bought
```
Steps:
1. Order: 5x Product A
2. Return: 10x Product A
3. Check: Inventory? Refund amount?

Expected: Return quantity capped at order quantity
Evil Expected: Extra items added to inventory for free
```

### TEST-ORD-021: Return Items From Other Order
**Goal**: Return Product A, claim it was from Order B
```
Steps:
1. Order X: 5x Product A
2. Order Y: 5x Product B
3. Return request for Order Y: Return Product A

Expected: Only products from that order returnable
Evil Expected: Cross-order product mixing
```

### TEST-ORD-022: Return Damaged, Restore to Inventory
**Goal**: Mark as damaged but restore as sellable
```
Steps:
1. Return Product A, reason: Damaged
2. Select: Mark as damaged/unsellable
3. Modify API request to add to inventory instead
4. Check: Damaged product added to sellable stock?

Expected: Server-side enforcement
Evil Expected: Client controls inventory action
```

---

## 🌐 BROWSER TEST SCENARIOS

### BROWSER-ORD-001: POS Multi-Tab Chaos
```javascript
Test Steps:
1. Open 3 tabs, all at "New Order"
2. In each tab, add same customer, same products
3. Complete all 3 orders simultaneously
Question: Are 3 distinct orders created? Is inventory correct?
```

### BROWSER-ORD-002: Barcode Scanner Speed Test
```javascript
Test Steps:
1. Simulate barcode scanner (rapid keystrokes + Enter)
2. Scan 50 items in 10 seconds
Question: Are all 50 items captured correctly?
```

### BROWSER-ORD-003: Receipt Print Failure Recovery
```javascript
Test Steps:
1. Complete order
2. Print receipt
3. Printer offline/error
4. Retry print
Question: Can receipt be reprinted? Is it same data?
```

### BROWSER-ORD-004: Browser Crash Mid-Order
```javascript
Test Steps:
1. Create order with 10 items
2. Kill browser process
3. Reopen browser, navigate to POS
Question: Is draft order recoverable?
```

### BROWSER-ORD-005: Slow Network Payment
```javascript
Test Steps:
1. Complete order, click "Process Payment"
2. Throttle network to 2G
3. Wait 60 seconds for response
4. Meanwhile, click button again
Question: Is payment processed once or twice?
```

---

## Test Execution Checklist

| Test ID | Status | Bug Found? | Severity |
|---------|--------|------------|----------|
| TEST-ORD-001 | ⬜ | | |
| TEST-ORD-002 | ⬜ | | |
| TEST-ORD-003 | ⬜ | | |
| TEST-ORD-004 | ⬜ | | |
| TEST-ORD-005 | ⬜ | | |
| TEST-ORD-006 | ⬜ | | |
| TEST-ORD-007 | ⬜ | | |
| TEST-ORD-008 | ⬜ | | |
| TEST-ORD-009 | ⬜ | | |
| TEST-ORD-010 | ⬜ | | |
| TEST-ORD-011 | ⬜ | | |
| TEST-ORD-012 | ⬜ | | |
| TEST-ORD-013 | ⬜ | | |
| TEST-ORD-014 | ⬜ | | |
| TEST-ORD-015 | ⬜ | | |
| TEST-ORD-016 | ⬜ | | |
| TEST-ORD-017 | ⬜ | | |
| TEST-ORD-018 | ⬜ | | |
| TEST-ORD-019 | ⬜ | | |
| TEST-ORD-020 | ⬜ | | |
| TEST-ORD-021 | ⬜ | | |
| TEST-ORD-022 | ⬜ | | |
