# 🔐 Authentication & Authorization Hell Tests

## 1. JWT Token Abuse

### TEST-AUTH-001: Token Hijacking
**Goal**: Steal/reuse tokens from another user session
```
Steps:
1. Login as User A, capture JWT token
2. Login as User A on different device
3. Logout from device 1
4. Try using the captured token from step 1
Expected: Token should be invalidated
Evil Expected: Token still works → SESSION HIJACKING POSSIBLE
```

### TEST-AUTH-002: Token Tampering
**Goal**: Modify JWT payload without detection
```
Steps:
1. Capture valid JWT token
2. Decode payload (base64)
3. Change user_id to admin user_id
4. Re-encode (don't change signature)
5. Send modified token with API request
Expected: Server rejects invalid signature
Evil Expected: Server accepts modified token → PRIVILEGE ESCALATION
```

### TEST-AUTH-003: Expired Token Extension
**Goal**: Use tokens beyond expiry
```
Steps:
1. Capture token with exp claim
2. Wait until token expires
3. Modify exp claim to future date
4. Attempt API request
Expected: Token rejected
Evil Expected: Extended token accepted
```

### TEST-AUTH-004: Token-less Access
**Goal**: Access protected endpoints without auth
```
Endpoints to test:
- GET /api/customers/
- GET /api/inventory/products/
- GET /api/orders/
- GET /api/finance/expenses/
- POST /api/orders/create/
- DELETE /api/products/{id}/

Expected: 401 Unauthorized
Evil Expected: Data returned without auth
```

---

## 2. Role-Based Access Bypass

### TEST-AUTH-005: Cashier → Admin Escalation
**Goal**: Access admin-only features as cashier
```
Steps:
1. Login as Cashier
2. Try accessing:
   - DELETE /api/products/{id}/ (should be Admin only)
   - GET /api/finance/reports/ (should be Admin only)
   - POST /api/settings/users/ (should be Admin only)
   - POST /api/settings/backup/
Expected: 403 Forbidden
Evil Expected: Operation succeeds
```

### TEST-AUTH-006: Horizontal Privilege Escalation
**Goal**: Access other cashier's orders
```
Steps:
1. Login as Cashier A
2. Create order #1234
3. Login as Cashier B
4. Try to:
   - View order #1234
   - Edit order #1234
   - Cancel order #1234
Expected: Access denied (Cashier can only see own orders)
Evil Expected: Full access to other cashier's orders
```

### TEST-AUTH-007: Role Manipulation via API
**Goal**: Self-assign admin role
```
Steps:
1. Login as regular user
2. Inspect API requests during role changes
3. Send PUT/PATCH to /api/users/{self.id}/
   with body: {"role": "admin"}
Expected: 403 Forbidden
Evil Expected: User becomes admin
```

---

## 3. Login Abuse

### TEST-AUTH-008: Brute Force Attack
**Goal**: Guess password through repeated attempts
```
Steps:
1. Target known username
2. Send 1000 login requests with common passwords
3. Check if any succeed or if rate limiting kicks in
Expected: Account lockout after 5-10 attempts
Evil Expected: No rate limiting → Account compromised
```

### TEST-AUTH-009: Username Enumeration
**Goal**: Discover valid usernames
```
Steps:
1. Try login with invalid username: "definitely_not_a_user"
2. Try login with valid username, wrong password
3. Compare error messages
Expected: Same generic error for both
Evil Expected: Different errors reveal valid usernames
```

### TEST-AUTH-010: SQL Injection in Login
**Goal**: Bypass authentication
```
Payloads:
- Username: admin'--
- Username: admin' OR '1'='1'--
- Username: ' UNION SELECT * FROM auth_user--
- Password: ' OR '1'='1

Expected: Login fails, input sanitized
Evil Expected: Authentication bypassed or SQL error
```

### TEST-AUTH-011: Remember Me Forever
**Goal**: Test "Remember Me" token expiry
```
Steps:
1. Login with "Remember Me" checked
2. Note session/token
3. Wait 30 days (or manipulate system clock)
4. Attempt to access protected page
Expected: Re-authentication required
Evil Expected: Session still valid after months
```

---

## 4. Password Reset Exploitation

### TEST-AUTH-012: Password Reset Token Reuse
**Goal**: Use same reset token multiple times
```
Steps:
1. Request password reset for user
2. Use token to reset password to "password1"
3. Use SAME token to reset password to "password2"
Expected: Token invalidated after first use
Evil Expected: Token reusable → Account takeover
```

### TEST-AUTH-013: Password Reset for Other Users
**Goal**: Reset another user's password
```
Steps:
1. Request password reset for victim@email.com
2. Intercept reset request
3. Change email to attacker@email.com in request body
4. Check if token sent to attacker
Expected: Token only sent to original email
Evil Expected: Email parameter manipulation works
```

---

## 5. Session Management Attacks

### TEST-AUTH-014: Concurrent Session Limit Bypass
**Goal**: Login from unlimited devices
```
Steps:
1. Login from 10 different browsers/devices simultaneously
2. Check if any sessions are invalidated
Expected: Max 3-5 concurrent sessions
Evil Expected: Unlimited sessions allowed
```

### TEST-AUTH-015: Session Fixation
**Goal**: Force victim to use attacker's session
```
Steps:
1. Get session ID (as attacker)
2. Send link to victim with session ID in URL
3. Victim logs in
4. Attacker uses same session ID to impersonate
Expected: New session ID generated on login
Evil Expected: Session ID retained → Account hijacked
```

---

## 🌐 BROWSER TEST SCENARIOS

### BROWSER-AUTH-001: Multi-Tab Session Confusion
```javascript
// Open multiple tabs and test session state
Test Steps:
1. Open Tab A - Login as Admin
2. Open Tab B - Login as Cashier (same browser)
3. Perform action in Tab A
Question: Which user's permissions apply?
```

### BROWSER-AUTH-002: Back Button Post-Logout
```javascript
Test Steps:
1. Login and navigate to sensitive page (finance, settings)
2. Click Logout
3. Click browser Back button
Question: Is cached sensitive data visible?
```

### BROWSER-AUTH-003: DevTools Token Extraction
```javascript
// In browser console
localStorage.getItem('token')
sessionStorage.getItem('token')
document.cookie
// Can tokens be extracted and reused?
```

---

## Test Execution Checklist

| Test ID | Status | Bug Found? | Severity |
|---------|--------|------------|----------|
| TEST-AUTH-001 | ⬜ | | |
| TEST-AUTH-002 | ⬜ | | |
| TEST-AUTH-003 | ⬜ | | |
| TEST-AUTH-004 | ⬜ | | |
| TEST-AUTH-005 | ⬜ | | |
| TEST-AUTH-006 | ⬜ | | |
| TEST-AUTH-007 | ⬜ | | |
| TEST-AUTH-008 | ⬜ | | |
| TEST-AUTH-009 | ⬜ | | |
| TEST-AUTH-010 | ⬜ | | |
| TEST-AUTH-011 | ⬜ | | |
| TEST-AUTH-012 | ⬜ | | |
| TEST-AUTH-013 | ⬜ | | |
| TEST-AUTH-014 | ⬜ | | |
| TEST-AUTH-015 | ⬜ | | |
