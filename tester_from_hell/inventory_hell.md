# 📦 Inventory Mayhem Hell Tests

## 1. Stock Manipulation

### TEST-INV-001: Negative Stock Abuse
**Goal**: Exploit negative stock allowance
```
Steps:
1. Product A: Stock = 10
2. Create orders selling 50 units (stock = -40)
3. Check: Are all sales recorded at estimated cost?
4. Check: Can infinite negative stock be created?
5. Add stock: 5 units
6. Check: Stock should be -35, not reset to 5

Expected: Negative stock allowed but tracked
Evil Expected: Stock counter breaks or resets
```

### TEST-INV-002: Stock Adjustment Without Reason
**Goal**: Modify stock without audit trail
```
Steps:
1. Stock = 100
2. Make adjustment: -50, reason: ""
3. Stock = 50
4. Check audit log

Expected: Reason required for adjustments
Evil Expected: Reason optional → Theft undetectable
```

### TEST-INV-003: Parallel Stock Modification
**Goal**: Race condition in stock updates
```
Steps:
1. Stock = 10
2. Cashier A: Sell 8 units
3. Cashier B: Sell 8 units (simultaneously)
4. Both orders should total 16 units sold
5. Check: Stock = -6 correctly?

Expected: Proper locking, both sales succeed, stock = -6
Evil Expected: Lost update, stock = 2 (only one sale counted)
```

---

## 2. Product Data Corruption

### TEST-INV-004: Product Edit During Sale
**Goal**: Change price while order is being processed
```
Steps:
1. Add Product A (₹100) to cart
2. In another tab, edit Product A price to ₹50
3. Complete order in first tab
4. Check: Which price was charged?

Expected: Cart price locked at time of addition
Evil Expected: Price changes mid-transaction
```

### TEST-INV-005: Delete Product In Cart
**Goal**: Delete product while it's in someone's cart
```
Steps:
1. Cashier A: Add Product X to cart
2. Admin: Delete Product X (soft delete)
3. Cashier A: Complete order
4. Check: Does order succeed? With what product data?

Expected: Graceful handling (warn or prevent)
Evil Expected: Crash or orphan order line items
```

### TEST-INV-006: Circular Category Creation
**Goal**: Create infinite loop in categories
```
Steps:
1. Create Category A, parent = None
2. Create Category B, parent = A
3. Edit Category A, set parent = B

Expected: Circular reference rejected
Evil Expected: Infinite loop when traversing hierarchy
```

---

## 3. Bulk Operations Attacks

### TEST-INV-007: Bulk Delete All Products
**Goal**: Accidentally or maliciously delete everything
```
Steps:
1. Select all products (checkbox)
2. Click "Delete"
3. Confirm without reading

Expected: Additional confirmation for bulk operations
Evil Expected: One click wipes inventory
```

### TEST-INV-008: Bulk Category Change Overwrite
**Goal**: Bulk operation destroys specific assignments
```
Steps:
1. Products 1-100 have various categories
2. Select all, change category to "Uncategorized"
3. Check: Previous category info preserved anywhere?

Expected: History maintained
Evil Expected: Previous categorization lost forever
```

### TEST-INV-009: CSV Import Bomb
**Goal**: Crash system with malformed import
```
CSV Payloads:
- 1 million rows
- Rows with 1000 columns
- Binary data in CSV
- Circular references in product names
- XSS/SQL payloads in every field

Expected: Validation, size limits, sanitization
Evil Expected: System crash or data injection
```

---

## 4. Image Upload Attacks

### TEST-INV-010: Image With Same Name Overwrite
**Goal**: Replace another product's image
```
Steps:
1. Product A: Upload image "product.jpg"
2. Product B: Upload different image named "product.jpg"
3. Check: Does Product A's image change?

Expected: Unique filenames generated
Evil Expected: File overwrite, wrong images shown
```

### TEST-INV-011: Missing Image Handling
**Goal**: Break display when image deleted
```
Steps:
1. Product with image
2. Delete image file from storage (via FTP/direct access)
3. View product page

Expected: Placeholder image shown
Evil Expected: Crash or broken page
```

### TEST-INV-012: Excessively Large Image
**Goal**: Slow down entire system
```
Steps:
1. Upload 100MB image (photo from professional camera)
2. No compression
3. View product list with 50 such images

Expected: Images resized/compressed on upload
Evil Expected: Page takes 5 minutes to load
```

---

## 5. Vendor & Category Integrity

### TEST-INV-013: Delete Vendor With Products
**Goal**: Orphan products when vendor deleted
```
Steps:
1. Create Vendor X with 100 products
2. Delete Vendor X
3. Check those 100 products' vendor field

Expected: Products updated to "No Vendor" or deletion blocked
Evil Expected: Orphan foreign key, queries fail
```

### TEST-INV-014: Ghost Vendor Reference
**Goal**: Reference non-existent vendor
```
Steps:
1. Create product via API
2. Set vendor_id to UUID that doesn't exist
3. Submit

Expected: Foreign key constraint violation
Evil Expected: Product created with invalid vendor
```

### TEST-INV-015: Category With No Products Flag
**Goal**: Show empty categories incorrectly
```
Steps:
1. Category X has 10 products
2. Delete all 10 products (soft delete)
3. Check: Category X product count = 10 or 0?
4. Check: "View Products" link for Category X

Expected: Count only active products
Evil Expected: Shows 10, but clicking shows 0
```

---

## 6. Tags & Search Manipulation

### TEST-INV-016: Tag Name Collision
**Goal**: Create duplicate tags with different meanings
```
Steps:
1. Create tag "Special" (for special offers)
2. Create tag "SPECIAL" (for special needs students)
3. Create tag "special " (trailing space)
4. Search for products with tag "special"

Expected: Case-insensitive, whitespace-normalized
Evil Expected: Duplicate tags cause confusion
```

### TEST-INV-017: Tag With Special Characters
**Goal**: Break search/filtering with tags
```
Payloads for tag names:
- <script>alert(1)</script>
- tag' OR '1'='1
- tag/subtag (path confusion)
- tag#anchor (URL confusion)
- tag?query=1 (URL confusion)

Expected: Special chars escaped/stripped
Evil Expected: XSS, SQLi, or URL breaking
```

---

## 7. Soft Delete & Restore Abuse

### TEST-INV-018: Restore Already Sold Items
**Goal**: Confuse inventory after undelete
```
Steps:
1. Product X: Stock 10
2. Sell 5 (Stock 5)
3. Soft delete Product X
4. Restore Product X
5. Check: Stock = 5 or 0 or 10?

Expected: Stock preserved through delete/restore
Evil Expected: Stock reset or incorrect
```

### TEST-INV-019: Edit Soft-Deleted Product
**Goal**: Modify deleted products via API
```
Steps:
1. Soft delete Product X
2. Send API request: PATCH /api/products/X/
3. Change price, name, stock

Expected: 404 or operation blocked
Evil Expected: Can edit deleted products
```

### TEST-INV-020: Permanent Delete With Order History
**Goal**: Delete product that has been sold
```
Steps:
1. Product X sold in 100 orders
2. Soft delete Product X
3. Permanent delete Product X
4. View those 100 orders

Expected: Permanent delete blocked or order data preserved
Evil Expected: Orders have broken references
```

---

## 🌐 BROWSER TEST SCENARIOS

### BROWSER-INV-001: Slow Upload Progress Manipulation
```javascript
Test Steps:
1. Start uploading large image
2. Change product price in another tab while uploading
3. Upload completes
Question: Is latest price reflected, or version at upload start?
```

### BROWSER-INV-002: Autocomplete Product Selection
```javascript
Test Steps:
1. Search for "Harry" in product search
2. Results show: "Harry Potter Vol 1", "Harry Potter Vol 2"
3. While results loading, type "2"
4. Click first visible result immediately
Question: Did click register on correct item, or shifted item?
```

### BROWSER-INV-003: Product List Pagination During Edit
```javascript
Test Steps:
1. View product page 5 (items 41-50)
2. In another tab, delete items 1-10
3. Refresh page 5
Question: Are you now viewing items 31-40 (shifted) or 41-50 (correct)?
```

### BROWSER-INV-004: Form Data Persistence
```javascript
Test Steps:
1. Fill "Add New Product" form
2. Accidentally navigate away
3. Click back button
Question: Is form data preserved?
```

---

## Test Execution Checklist

| Test ID | Status | Bug Found? | Severity |
|---------|--------|------------|----------|
| TEST-INV-001 | ⬜ | | |
| TEST-INV-002 | ⬜ | | |
| TEST-INV-003 | ⬜ | | |
| TEST-INV-004 | ⬜ | | |
| TEST-INV-005 | ⬜ | | |
| TEST-INV-006 | ⬜ | | |
| TEST-INV-007 | ⬜ | | |
| TEST-INV-008 | ⬜ | | |
| TEST-INV-009 | ⬜ | | |
| TEST-INV-010 | ⬜ | | |
| TEST-INV-011 | ⬜ | | |
| TEST-INV-012 | ⬜ | | |
| TEST-INV-013 | ⬜ | | |
| TEST-INV-014 | ⬜ | | |
| TEST-INV-015 | ⬜ | | |
| TEST-INV-016 | ⬜ | | |
| TEST-INV-017 | ⬜ | | |
| TEST-INV-018 | ⬜ | | |
| TEST-INV-019 | ⬜ | | |
| TEST-INV-020 | ⬜ | | |
