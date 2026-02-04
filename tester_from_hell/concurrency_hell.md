# ⚡ Concurrency Nightmare Hell Tests

## 1. Race Condition Classic Attacks

### TEST-CONC-001: Stock Update Race
**Goal**: Buy more stock than exists
```
Setup: Product A, Stock = 1

Concurrent requests:
- Thread 1: Buy 1x Product A
- Thread 2: Buy 1x Product A
- Thread 3: Buy 1x Product A

All at exact same millisecond

Expected: 1 success, 2 failures (out of stock)
Evil Expected: 3 successes, Stock = -2 (or worse)
```

### TEST-CONC-002: Double Wallet Spend
**Goal**: Spend same wallet credit twice
```
Setup: Customer wallet = ₹500

Concurrent requests:
- Thread 1: Pay ₹500 from wallet
- Thread 2: Pay ₹500 from wallet

Expected: 1 success, wallet = ₹0
Evil Expected: Both succeed, wallet = -₹500
```

### TEST-CONC-003: Coupon Double Use
**Goal**: Use one-time coupon multiple times
```
Setup: Coupon "SAVE50" (single use)

Concurrent requests:
- Thread 1: Apply coupon to order 1
- Thread 2: Apply coupon to order 2

Expected: 1 success, 1 rejection
Evil Expected: Both orders get discount
```

---

## 2. Database Locking Issues

### TEST-CONC-004: Deadlock Creation
**Goal**: Create circular wait
```
Thread 1:
1. Lock Product A
2. Wait 100ms
3. Try to lock Product B

Thread 2:
1. Lock Product B
2. Wait 100ms
3. Try to lock Product A

Expected: Deadlock detection and recovery
Evil Expected: Permanent hang
```

### TEST-CONC-005: Long Transaction Starvation
**Goal**: Starve quick transactions
```
Thread 1: Start transaction, lock Products table, sleep 60 seconds
Thread 2-100: Try to read Products table

Expected: Read queries don't wait for write
Evil Expected: All reads blocked for 60 seconds
```

### TEST-CONC-006: Lock Escalation Attack
**Goal**: Cause excessive locking
```
Steps:
1. Run 1000 concurrent row updates
2. Force lock escalation to table lock
3. All other transactions blocked

Expected: Row-level locking maintained
Evil Expected: Table lock, DoS
```

---

## 3. Counter/Sequence Issues

### TEST-CONC-007: Display ID Gap Creation
**Goal**: Create gaps in sequential IDs
```
Steps:
1. Start creating order (gets ID 5001)
2. Cancel before commit
3. Create another order (gets ID 5002)
4. ID 5001 never used

Expected: Gaps handled gracefully
Evil Expected: Reports assume IDs sequential
```

### TEST-CONC-008: ID Reuse Attack
**Goal**: Reuse deleted record's ID
```
Steps:
1. Order 5001 created
2. Order 5001 permanently deleted
3. New order created
4. Check: Does it get 5001 again?

Expected: IDs never reused
Evil Expected: ID collision with history
```

### TEST-CONC-009: Counter Overflow
**Goal**: Force counter past MAX_INT
```
Steps:
1. Set display_id sequence to 2147483640
2. Create 10 orders
3. Check: What happens at 2147483647?

Expected: Graceful handling (bigint or error)
Evil Expected: Overflow to negative or crash
```

---

## 4. Cache Consistency

### TEST-CONC-010: Cache vs DB Mismatch
**Goal**: Read stale cache data
```
Steps:
1. Read product price: ₹100 (cached)
2. Admin updates price to ₹150
3. Complete order using cached ₹100 price
4. Check: Which price recorded?

Expected: Cache invalidated on update
Evil Expected: Stale prices used
```

### TEST-CONC-011: Cache Stampede
**Goal**: Overwhelm server when cache expires
```
Steps:
1. Cache entry expires
2. 1000 concurrent requests hit
3. All 1000 query database (cache miss)
4. All 1000 write to cache

Expected: Lock/coalesce pattern prevents stampede
Evil Expected: Database overwhelmed
```

### TEST-CONC-012: Distributed Cache Split Brain
**Goal**: Different caches have different values
```
Setup: 2 cache servers, no sync

Steps:
1. Update product on Server A: price ₹100
2. Request goes to Server B cache: still ₹80
3. User sees inconsistent prices

Expected: Cache sync or single cache
Evil Expected: Random prices based on which server hit
```

---

## 5. Transaction Isolation

### TEST-CONC-013: Dirty Read
**Goal**: Read uncommitted transaction data
```
Thread 1:
1. Start transaction
2. Update price to ₹9999
3. Wait (don't commit)

Thread 2:
1. Read price
2. Show user ₹9999

Thread 1:
3. Rollback

Thread 2:
3. User sees price that never existed

Expected: Read committed isolation
Evil Expected: Dirty reads possible
```

### TEST-CONC-014: Non-Repeatable Read
**Goal**: Value changes during transaction
```
Thread 1:
1. Start transaction
2. Read product stock: 10
3. Calculate something
4. Read product stock: 5 (someone else sold)
5. Calculation now invalid

Expected: Repeatable read in critical sections
Evil Expected: Inconsistent reads in same transaction
```

### TEST-CONC-015: Phantom Read Attack
**Goal**: New rows appear during transaction
```
Thread 1:
1. Count products in category: 10
2. Process those 10 products
3. Count again: 15 (new products added)
4. Report incorrect

Expected: Serializable isolation for reports
Evil Expected: Report misses or double-counts
```

---

## 6. Message Queue Chaos

### TEST-CONC-016: Message Duplication
**Goal**: Process same message twice
```
Steps:
1. Queue message: Send SMS receipt
2. Consumer 1 picks up, crashes during processing
3. Message requeued
4. Consumer 2 picks up, succeeds
5. Consumer 1 recovers, reprocesses same message

Expected: Idempotent processing
Evil Expected: Customer gets receipt twice
```

### TEST-CONC-017: Message Order Inversion
**Goal**: Process messages out of order
```
Messages queued:
1. Create Order #5001
2. Add item to Order #5001
3. Complete Order #5001

Processed as:
1. Add item to Order #5001 (doesn't exist!)
2. Complete Order #5001 (doesn't exist!)
3. Create Order #5001

Expected: Order dependencies enforced
Evil Expected: Orphan operations, errors
```

### TEST-CONC-018: Dead Letter Exploitation
**Goal**: Messages that never process
```
Steps:
1. Queue 1000 messages
2. 10 messages always fail (poison messages)
3. Check: Do poison messages block queue?

Expected: Dead letter queue for failures
Evil Expected: Retry loop blocks entire queue
```

---

## 7. Webhook/Callback Races

### TEST-CONC-019: Payment Webhook Race
**Goal**: Payment callback before order completion
```
Timeline:
0ms: User clicks "Complete Order"
10ms: Payment gateway starts processing
20ms: Webhook callback: "Payment success!"
30ms: Order creation fails (validation error)

Expected: Payment refunded, order not created
Evil Expected: Orphan payment, no order
```

### TEST-CONC-020: Duplicate Webhook Delivery
**Goal**: Process same webhook twice
```
Steps:
1. Payment gateway sends webhook
2. Our server slow to respond (5 seconds)
3. Gateway times out, retries webhook
4. Now processing both

Expected: Idempotency key prevents double processing
Evil Expected: Double credit, double action
```

---

## 8. Session Concurrency

### TEST-CONC-021: Multi-Device Session Conflict
**Goal**: Same user on multiple devices
```
Device A: Views cart (3 items)
Device B: Removes 2 items
Device A: Clicks checkout
Check: 3 items or 1 item charged?

Expected: Current cart state checked at checkout
Evil Expected: Stale cart processed
```

### TEST-CONC-022: Session Fixation During Password Change
**Goal**: Old session valid after password change
```
Steps:
1. Session A: Active
2. Session B: Changes password
3. Session A: Tries accessing app

Expected: All sessions invalidated on password change
Evil Expected: Session A still works
```

---

## 🌐 BROWSER TEST SCENARIOS

### BROWSER-CONC-001: Double-Click Submit
```javascript
Test Steps:
1. Fill out order form
2. Double-click "Submit" quickly
Question: Is one order or two orders created?

// Protection test:
document.querySelector('form').addEventListener('submit', (e) => {
  // Note if button is disabled after first click
});
```

### BROWSER-CONC-002: Tab Synchronization
```javascript
Test Steps:
1. Open app in Tab A and Tab B
2. In Tab A: Add item to cart
3. In Tab B: Check cart
Question: Is cart synchronized in real-time?
```

### BROWSER-CONC-003: Rapid Navigation
```javascript
Test Steps:
1. Click link to Page A
2. Before load completes, click link to Page B
3. Before load completes, click link to Page C
Question: Final state correct? Any zombie requests?
```

### BROWSER-CONC-004: Concurrent API Calls
```javascript
// Fire 100 concurrent requests:
const promises = [];
for (let i = 0; i < 100; i++) {
  promises.push(fetch('/api/products/').then(r => r.json()));
}
Promise.all(promises).then(results => {
  // Check all results are identical
});
```

### BROWSER-CONC-005: Stale Data Warning
```javascript
Test Steps:
1. User A opens product edit page
2. User B edits same product and saves
3. User A saves their version
Question: Is User A warned about conflict? Whose version wins?
```

---

## Python Test Script
```python
import asyncio
import aiohttp
import time

async def race_condition_test():
    """Test stock race condition"""
    async with aiohttp.ClientSession() as session:
        tasks = []
        for i in range(100):
            task = session.post(
                'http://localhost:8000/api/orders/',
                json={
                    'product_id': 'uuid-here',
                    'quantity': 1
                },
                headers={'Authorization': 'Bearer token'}
            )
            tasks.append(task)
        
        # Fire all at once
        start = time.time()
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        elapsed = time.time() - start
        
        successes = sum(1 for r in responses if not isinstance(r, Exception) and r.status == 201)
        print(f"Time: {elapsed:.2f}s, Successes: {successes}/100")
        
        # If successes > stock, race condition exists!

if __name__ == '__main__':
    asyncio.run(race_condition_test())
```

---

## Test Execution Checklist

| Test ID | Status | Bug Found? | Severity |
|---------|--------|------------|----------|
| TEST-CONC-001 | ⬜ | | |
| TEST-CONC-002 | ⬜ | | |
| TEST-CONC-003 | ⬜ | | |
| TEST-CONC-004 | ⬜ | | |
| TEST-CONC-005 | ⬜ | | |
| TEST-CONC-006 | ⬜ | | |
| TEST-CONC-007 | ⬜ | | |
| TEST-CONC-008 | ⬜ | | |
| TEST-CONC-009 | ⬜ | | |
| TEST-CONC-010 | ⬜ | | |
| TEST-CONC-011 | ⬜ | | |
| TEST-CONC-012 | ⬜ | | |
| TEST-CONC-013 | ⬜ | | |
| TEST-CONC-014 | ⬜ | | |
| TEST-CONC-015 | ⬜ | | |
| TEST-CONC-016 | ⬜ | | |
| TEST-CONC-017 | ⬜ | | |
| TEST-CONC-018 | ⬜ | | |
| TEST-CONC-019 | ⬜ | | |
| TEST-CONC-020 | ⬜ | | |
| TEST-CONC-021 | ⬜ | | |
| TEST-CONC-022 | ⬜ | | |
