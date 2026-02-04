# 📱 PWA & Offline Chaos Hell Tests

## 1. Service Worker Attacks

### TEST-PWA-001: Service Worker Bypassing
**Goal**: Access app without SW for security bypass
```
Steps:
1. Open DevTools → Application → Service Workers
2. Click "Bypass for network"
3. Access sensitive data
4. Check: Is authentication still enforced?

Expected: Auth enforced regardless of SW
Evil Expected: SW handled auth, bypassing exposes data
```

### TEST-PWA-002: Stale Cache Attack
**Goal**: Use outdated cached version to exploit old vulnerabilities
```
Steps:
1. Version 1.0 has vulnerability (fixed in 1.1)
2. Cache still has 1.0 assets
3. Force app to use cached version
4. Exploit old vulnerability

Expected: Version checking forces update
Evil Expected: Old vulnerable code runs from cache
```

### TEST-PWA-003: Cache Poisoning
**Goal**: Inject malicious content into cache
```
Steps:
1. On shared network, MITM attack
2. Inject modified JavaScript into SW cache
3. Victim loads app
4. Malicious code runs from cache even when online

Expected: Cache integrity verification
Evil Expected: Poisoned cache persists
```

---

## 2. Offline Data Storage Attacks

### TEST-PWA-004: IndexedDB Data Theft
**Goal**: Access offline data from another origin
```
Steps:
1. User creates order offline
2. Attacker script on same device
3. Attempt to read IndexedDB from different origin

Expected: Same-origin policy enforced
Evil Expected: Data accessible cross-origin
```

### TEST-PWA-005: Local Storage Token Persistence
**Goal**: Steal tokens from localStorage
```
Steps:
1. User logs in, token stored
2. User closes browser
3. Opens browser on public computer
4. Different user accesses localStorage

Expected: Tokens cleared on logout/browser close
Evil Expected: Persistent tokens accessible
```

### TEST-PWA-006: Offline Data Overflow
**Goal**: Exhaust device storage
```
Steps:
1. Create 10,000 offline orders
2. Each with 100 items
3. Store 1MB of notes per order
4. Check: Device storage quota?

Expected: Storage quota limits enforced
Evil Expected: Device storage exhausted
```

---

## 3. Sync Attacks

### TEST-PWA-007: Sync Conflict Exploitation
**Goal**: Win conflict resolution maliciously
```
Steps:
1. Offline: Create customer "John Doe"
2. Meanwhile online: Someone creates "Jane Doe" with same phone
3. Sync happens
4. Who wins? Last Write Wins...

Expected: Clear conflict notification
Evil Expected: Silent data loss
```

### TEST-PWA-008: Replay Attack
**Goal**: Replay old sync request
```
Steps:
1. Create order offline
2. Sync to server (order created)
3. Capture sync request
4. Replay same request
5. Check: Duplicate order created?

Expected: Idempotency prevents duplicates
Evil Expected: Duplicate orders
```

### TEST-PWA-009: Sync Order Manipulation
**Goal**: Sync operations in wrong order
```
Steps:
1. Offline: Create order #1
2. Offline: Cancel order #1
3. Sync in reverse order: Cancel → Create
4. Check: Order state?

Expected: Timestamp-based ordering
Evil Expected: Order exists but marked cancelled incorrectly
```

### TEST-PWA-010: Partial Sync Corruption
**Goal**: Interrupt sync mid-process
```
Steps:
1. Queue 100 offline orders
2. Start sync
3. Kill connection after 10 synced
4. Check: Clear state of which synced?

Expected: Atomic sync or clear partial state
Evil Expected: 10 synced, 90 stuck in limbo
```

---

## 4. Provisional ID Attacks

### TEST-PWA-011: Provisional ID Collision
**Goal**: Create two records with same TEMP-ID
```
Steps:
1. Device A offline: Create order TEMP-UUID-1
2. Device B offline: Create order TEMP-UUID-1 (same UUID!)
3. Both sync
4. Check: Two orders or collision?

Expected: Server generates unique UUIDs
Evil Expected: Data overwrite
```

### TEST-PWA-012: Provisional ID Reference After Sync
**Goal**: Reference TEMP-ID after real ID assigned
```
Steps:
1. Create order with TEMP-ORDER-1
2. Add payment referencing TEMP-ORDER-1
3. Sync order (becomes ORD-5001)
4. Sync payment (still references TEMP-ORDER-1)
5. Check: Is reference updated?

Expected: References automatically updated
Evil Expected: Orphan payment record
```

### TEST-PWA-013: TEMP-ID Format Manipulation
**Goal**: Create TEMP-ID that looks real
```
Steps:
1. Create order with fake ID: "5001" (looks like real ID)
2. Sync to server
3. Check: ID conflict with existing order 5001?

Expected: TEMP- prefix required
Evil Expected: ID collision
```

---

## 5. Offline-Online Transition

### TEST-PWA-014: Connection Flapping
**Goal**: Rapid online/offline switching
```
Steps:
1. Toggle airplane mode every 2 seconds
2. During this, create orders, sync
3. Check: Data consistency?

Expected: Graceful handling
Evil Expected: Duplicate syncs, lost data
```

### TEST-PWA-015: Online-Only Features Offline
**Goal**: Access features that require server
```
Steps:
1. Go offline
2. Try to:
   - Generate reports (needs server aggregation)
   - Create new user (needs server)
   - Process refund (financial)
3. Check: Are these blocked or queued?

Expected: Clear error messages
Evil Expected: Actions queued that shouldn't be
```

### TEST-PWA-016: Offline Payment Processing
**Goal**: Record payment while offline
```
Steps:
1. Go offline
2. Record UPI payment (needs verification)
3. Sync when online
4. Check: How is unverified payment handled?

Expected: Flagged for manual verification
Evil Expected: Assumed valid
```

---

## 6. PWA Installation Attacks

### TEST-PWA-017: Fake PWA Installation
**Goal**: Phishing via similar PWA
```
Steps:
1. Create fake AZ Books PWA
2. Host on similar domain (azb00ks.com)
3. User installs
4. Credentials harvested

Expected: SSL/Domain verification
Evil Expected: Phishing successful
```

### TEST-PWA-018: Multiple Instance Attack
**Goal**: Run multiple PWA instances
```
Steps:
1. Install PWA
2. Open in browser
3. Open installed app
4. Both with different users logged in
5. Check: Session confusion?

Expected: Separate sessions
Evil Expected: Shared state corruption
```

### TEST-PWA-019: Uninstalled But Cached
**Goal**: Access app after uninstall
```
Steps:
1. Install PWA
2. Use app, cache data
3. Uninstall PWA
4. Access via browser
5. Check: Is cached data still accessible?

Expected: Data cleared on uninstall
Evil Expected: Sensitive data persists
```

---

## 7. Background Sync Abuse

### TEST-PWA-020: Background Sync Denial
**Goal**: Prevent sync from ever completing
```
Steps:
1. Queue large sync operation
2. Phone always on airplane mode
3. Days pass
4. Check: Does queue overflow? Data lost?

Expected: Queue persists, limits enforced
Evil Expected: Memory issues, data loss
```

### TEST-PWA-021: Background Sync Timing
**Goal**: Sync at wrong time
```
Steps:
1. Order created offline at 10 AM
2. Sync happens at 11 AM
3. Check: Timestamp on order?

Expected: Creation timestamp preserved
Evil Expected: Sync timestamp used (wrong audit trail)
```

---

## 🌐 BROWSER TEST SCENARIOS

### BROWSER-PWA-001: Install Prompt Manipulation
```javascript
// Intercept beforeinstallprompt
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  // Never show install prompt
});
// Does app still function without PWA mode?
```

### BROWSER-PWA-002: Offline Mode Testing
```javascript
Test Steps:
1. Open DevTools → Network → Offline
2. Navigate through app
3. Try all CRUD operations
Question: Which features work, fail, or fail gracefully?
```

### BROWSER-PWA-003: Storage Quota Testing
```javascript
// Check storage usage:
navigator.storage.estimate().then(estimate => {
  console.log(`Using ${estimate.usage} of ${estimate.quota}`);
});
// Fill to 90% and test app behavior
```

### BROWSER-PWA-004: Service Worker Update Flow
```javascript
Test Steps:
1. Load app (SW installed)
2. Deploy new SW version
3. Observe: When does new SW activate?
4. During transition, what state is app?
```

### BROWSER-PWA-005: IndexedDB Corruption Simulation
```javascript
// In DevTools, corrupt IndexedDB:
indexedDB.deleteDatabase('azbooks-offline');
// Reload app
// Question: Does app recover, or crash?
```

---

## Test Execution Checklist

| Test ID | Status | Bug Found? | Severity |
|---------|--------|------------|----------|
| TEST-PWA-001 | ⬜ | | |
| TEST-PWA-002 | ⬜ | | |
| TEST-PWA-003 | ⬜ | | |
| TEST-PWA-004 | ⬜ | | |
| TEST-PWA-005 | ⬜ | | |
| TEST-PWA-006 | ⬜ | | |
| TEST-PWA-007 | ⬜ | | |
| TEST-PWA-008 | ⬜ | | |
| TEST-PWA-009 | ⬜ | | |
| TEST-PWA-010 | ⬜ | | |
| TEST-PWA-011 | ⬜ | | |
| TEST-PWA-012 | ⬜ | | |
| TEST-PWA-013 | ⬜ | | |
| TEST-PWA-014 | ⬜ | | |
| TEST-PWA-015 | ⬜ | | |
| TEST-PWA-016 | ⬜ | | |
| TEST-PWA-017 | ⬜ | | |
| TEST-PWA-018 | ⬜ | | |
| TEST-PWA-019 | ⬜ | | |
| TEST-PWA-020 | ⬜ | | |
| TEST-PWA-021 | ⬜ | | |
