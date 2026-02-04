# 👥 Customer Data Abuse Hell Tests

## 1. Customer Link Exploitation

### TEST-CUST-001: Circular Link Creation
**Goal**: Customer linked to self
```
Steps:
1. Create Customer A
2. Add link: Customer A → Customer A (same person)
3. Check: Is self-linking allowed?

Expected: Self-link rejected
Evil Expected: Infinite loop when traversing links
```

### TEST-CUST-002: Asymmetric Link Attack
**Goal**: Break bidirectional sync
```
Steps:
1. Customer A links to Customer B as "Relative"
2. Directly edit database to remove B→A link
3. Delete customer A
4. Check: Does B still show link to deleted A?

Expected: Links always symmetric and consistent
Evil Expected: Orphan links, broken references
```

### TEST-CUST-003: Link Type Injection
**Goal**: Create invalid link types
```
Steps:
1. Inspect link type dropdown
2. Submit with link_type = "<script>alert(1)</script>"
3. Submit with link_type = "'; DROP TABLE links;--"

Expected: Only predefined link types accepted
Evil Expected: Arbitrary link types stored
```

---

## 2. Address & Location Abuse

### TEST-CUST-004: Fake GPS Coordinates
**Goal**: Enter impossible coordinates
```
Payloads:
- Latitude: 91 (max is 90)
- Latitude: -91
- Longitude: 181 (max is 180)
- Coordinates: 0, 0 (Null Island - probably wrong)
- Coordinates: NaN, NaN
- Very precise: 23.123456789012345, 72.123456789012345

Expected: Coordinate validation
Evil Expected: Invalid coordinates stored, map breaks
```

### TEST-CUST-005: Geocoding Denial of Service
**Goal**: Overwhelm geocoding API
```
Steps:
1. Create 1000 addresses with unique strings
2. Each triggers Nominatim geocoding
3. Check: Rate limiting? Caching?

Expected: Geocoding rate limited
Evil Expected: Nominatim blocks AZ Books's IP
```

### TEST-CUST-006: Address XSS via Map
**Goal**: XSS in map popup
```
Steps:
1. Set address to: <script>alert('XSS')</script>
2. View on map
3. Click marker to show popup

Expected: HTML escaped in popup
Evil Expected: Script executes
```

### TEST-CUST-007: Multiple Primary Addresses
**Goal**: Set all addresses as primary
```
Steps:
1. Customer has 5 addresses
2. Mark address 1 as primary
3. API request to mark address 2 as primary without unmarking 1
4. Repeat for all 5

Expected: Only one primary address allowed
Evil Expected: Multiple primaries → confusion in billing
```

---

## 3. School/Class/Division Cascade Issues

### TEST-CUST-008: Delete School With Students
**Goal**: Orphan students when school deleted
```
Steps:
1. School X has 500 customers
2. Delete School X
3. Check: Customer school field = ?

Expected: Blocked or customers updated
Evil Expected: Orphan references, display errors
```

### TEST-CUST-009: Class Without School
**Goal**: Create class not linked to any school
```
Steps:
1. API: Create class with school_id = null
2. Assign to customer
3. Check: Filtering/reporting by school

Expected: Class requires school
Evil Expected: Orphan classes cause filter issues
```

### TEST-CUST-010: Deep Hierarchy Traversal
**Goal**: Performance with deep nesting
```
Steps:
1. School → 100 Classes → 50 Divisions each → 10 Subdivisions each
2. = 50,000 subdivisions
3. Open customer creation form
4. Check: Dropdown performance

Expected: Lazy loading or pagination
Evil Expected: Browser freezes loading 50,000 options
```

---

## 4. Customer Group Manipulation

### TEST-CUST-011: Hidden Group Creation
**Goal**: Create group not visible in UI
```
Steps:
1. API: Create group with name = "" (empty)
2. Create group with name = "​" (zero-width space)
3. Assign customers to these groups
4. Try filtering by group in UI

Expected: Empty names rejected
Evil Expected: Invisible groups exist
```

### TEST-CUST-012: Group Merge Attack
**Goal**: Merge group containing important customers
```
Steps:
1. Group A: VIP customers (100 members)
2. Group B: Banned customers (5 members)
3. Merge A into B
4. Check: Are VIPs now marked as Banned?

Expected: Merge confirmation shows impact
Evil Expected: Data overwritten without warning
```

---

## 5. Wallet Fraud (Customer-side)

### TEST-CUST-013: Wallet Transfer Between Customers
**Goal**: Transfer credit to another customer
```
Steps:
1. Customer A: Wallet ₹1000
2. Transfer ₹500 to Customer B (if feature exists)
3. Create Customer C, claim they're Customer A
4. Transfer A's remaining ₹500 to C

Expected: No wallet-to-wallet transfers or strict verification
Evil Expected: Wallet theft possible
```

### TEST-CUST-014: Wallet History Tampering
**Goal**: Modify wallet transaction history
```
Steps:
1. Customer wallet shows: +₹100 (return credit)
2. API: Delete or modify this transaction
3. Check: Is balance recalculated?

Expected: Wallet transactions immutable
Evil Expected: History deletable, balance not updated
```

---

## 6. Purchase History Exploitation

### TEST-CUST-015: IDOR in Purchase History
**Goal**: View other customer's orders
```
Steps:
1. Login as Customer A's account (if customer login exists)
2. Note API endpoint: GET /api/customers/A/orders/
3. Change to: GET /api/customers/B/orders/
4. Check: Is authorization enforced?

Expected: Only own orders visible
Evil Expected: All customer orders accessible
```

### TEST-CUST-016: Purchase History Modification
**Goal**: Delete embarrassing purchases
```
Steps:
1. Customer bought "Adult Magazine"
2. Request to delete this from purchase history
3. Check: Is transaction history modifiable?

Expected: Transaction history immutable
Evil Expected: Purchases deletable → Accounting mismatch
```

---

## 7. Data Export Issues

### TEST-CUST-017: Export Includes Deleted Data
**Goal**: Extract data that should be deleted
```
Steps:
1. Customer A deleted (GDPR request)
2. Export all customer data
3. Check: Is Customer A in export?

Expected: Deleted data excluded
Evil Expected: Deleted data still exported
```

### TEST-CUST-018: Export Path Traversal
**Goal**: Export to arbitrary location
```
Steps:
1. Request export
2. Intercept request, change filename to: ../../../etc/passwd
3. Check: Where is file created?

Expected: Export location fixed/sanitized
Evil Expected: Arbitrary file write
```

---

## 8. Search & Privacy

### TEST-CUST-019: Phone Number Privacy Leak
**Goal**: Search reveals customer exists
```
Steps:
1. Search for phone: 9876543210
2. Response: "No customers found"
3. Search for phone: 9876543211
4. Response: "Showing 1 result"

Expected: Same response for found/not found
Evil Expected: Can enumerate phone numbers
```

### TEST-CUST-020: Fuzzy Search Leakage
**Goal**: Find private customers via search patterns
```
Steps:
1. Customers marked as "Private" shouldn't appear in search
2. Search with various partial matches
3. Check: Do private customers ever appear?

Expected: Private customers excluded from search
Evil Expected: Privacy flag ignored in some searches
```

---

## 🌐 BROWSER TEST SCENARIOS

### BROWSER-CUST-001: Map Interaction During Form Submit
```javascript
Test Steps:
1. Fill customer form
2. Click map to set location
3. Form submits while map click processing
Question: Is location saved correctly?
```

### BROWSER-CUST-002: Link Creation Modal State
```javascript
Test Steps:
1. Open "Add Link" modal
2. Search for customer B
3. Navigate away, come back
Question: Is modal state preserved? Data leaked?
```

### BROWSER-CUST-003: Customer Autocomplete Injection
```javascript
Test Steps:
1. In customer search, type: <img src=x onerror=alert(1)>
2. Check autocomplete dropdown rendering
Question: Is XSS possible via search suggestions?
```

### BROWSER-CUST-004: Rapid Location Changes
```javascript
Test Steps:
1. Set location on map
2. Quickly click different location
3. Click different location again
4. Save form
Question: Which location is saved? Race condition?
```

### BROWSER-CUST-005: Long Name Display
```javascript
// Customer name: "A" repeated 500 times
// Check: Does it break layouts? Overflow? Truncate?
document.querySelector('.customer-name').textContent = 'A'.repeat(500);
```

---

## Test Execution Checklist

| Test ID | Status | Bug Found? | Severity |
|---------|--------|------------|----------|
| TEST-CUST-001 | ⬜ | | |
| TEST-CUST-002 | ⬜ | | |
| TEST-CUST-003 | ⬜ | | |
| TEST-CUST-004 | ⬜ | | |
| TEST-CUST-005 | ⬜ | | |
| TEST-CUST-006 | ⬜ | | |
| TEST-CUST-007 | ⬜ | | |
| TEST-CUST-008 | ⬜ | | |
| TEST-CUST-009 | ⬜ | | |
| TEST-CUST-010 | ⬜ | | |
| TEST-CUST-011 | ⬜ | | |
| TEST-CUST-012 | ⬜ | | |
| TEST-CUST-013 | ⬜ | | |
| TEST-CUST-014 | ⬜ | | |
| TEST-CUST-015 | ⬜ | | |
| TEST-CUST-016 | ⬜ | | |
| TEST-CUST-017 | ⬜ | | |
| TEST-CUST-018 | ⬜ | | |
| TEST-CUST-019 | ⬜ | | |
| TEST-CUST-020 | ⬜ | | |
