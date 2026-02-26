# 🔪 The Scalpel — Code Review: AddCustomer.jsx

**File:** [AddCustomer.jsx](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx) (553 lines)
**Cross-refs:** [serializers.py](file:///z:/Projects/books2/customers/serializers.py), [api.js](file:///z:/Projects/books2/frontend/src/config/api.js)
**Date:** 2026-02-25
**Reviewer:** The Scalpel (Hell Mode)
**Method:** White-Box Execution Tracing, function-by-function

---

## 💀 FATAL — Location tags are silently dropped on every save

**File:** [AddCustomer.jsx:294](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L294) + [serializers.py:90-98](file:///z:/Projects/books2/customers/serializers.py#L90-L98)

**The trace:**
1. Frontend builds payload at line 294: `location_tags: formData.location_tags` — sends `location_tags: [uuid1, uuid2]`
2. This reaches `CustomerCreateUpdateSerializer.create()` which nests `AddressSerializer`
3. `AddressSerializer` defines `location_tags = LocationTagSerializer(many=True, read_only=True)` — **read-only. Stripped during deserialization.**
4. The write field is `location_tag_ids = PrimaryKeyRelatedField(write_only=True, source='location_tags')` — the frontend NEVER sends this key
5. `validated_data` for the address arrives without `location_tags`
6. Line 234 of serializers.py: `addr_data.pop('location_tags', [])` gets `[]`
7. `address.location_tags.set([])` — **all tags wiped**

**What WILL happen:** Every customer create and update operation silently discards all location tags. The user selects tags, clicks Save, customer is created with zero tags. No error, no warning. Data loss.

**Fix:** Frontend must send `location_tag_ids` instead of `location_tags`:
```diff
# AddCustomer.jsx, line ~294
  payload.addresses.push({
      ...
-     location_tags: formData.location_tags
+     location_tag_ids: formData.location_tags
  });
```

---

## 🔴 BUG — `handleCancel` always fires confirm dialog in edit mode

**File:** [Line 333](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L333)

**The trace:**
```js
const hasChanges = formData.first_name || formData.last_name || formData.phone || ...
```
In edit mode, `fetchCustomer` populates these fields from the API. `formData.first_name` is always truthy (e.g., `"John"`). So `hasChanges` is ALWAYS `true` in edit mode — even with zero modifications.

**What WILL happen:** User opens Edit Customer, changes nothing, clicks Cancel. Gets "You have unsaved changes. Discard?" — a lie. The user did not change anything.

**Fix:** Compare against initial state:
```jsx
const [initialFormData, setInitialFormData] = useState(null);
// In fetchCustomer's success path, after setFormData:
setInitialFormData({...newFormData});
// In handleCancel:
const hasChanges = initialFormData
    ? JSON.stringify(formData) !== JSON.stringify(initialFormData)
    : (formData.first_name || formData.phone); // create mode fallback
```

---

## 🔴 BUG — Latitude/longitude `0` treated as falsy

**File:** [Lines 285, 472, 475](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L285)

**The trace:**
- Line 285: `formData.latitude` — if latitude is `0` (equator), this is falsy. Address is NOT sent.
- Line 472: `formData.latitude && formData.longitude ? [lat, lng] : null` — position is null at latitude 0.
- Line 475: `formData.latitude && <p>Selected: ...` — coordinates don't display at latitude 0.

**What WILL happen:** Selecting a location on the equator (latitude 0°, e.g., Pontianak, Indonesia) silently drops the location data. The map shows nothing, coordinates don't render, and the address isn't included in the payload.

**Fix:** Use explicit null checks:
```js
// Line 285
if (formData.village || formData.address_line || formData.pincode || formData.latitude !== null) {
// Line 472
position={formData.latitude !== null && formData.longitude !== null ? [formData.latitude, formData.longitude] : null}
// Line 475
{formData.latitude !== null && <p>...</p>}
```

---

## 🔴 BUG — `.json()` on error responses assumes JSON body

**File:** [Lines 245-246, 316-319](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L245-L246)

**The trace:**
```js
// Line 245 (tag creation error)
const err = await res.json();
// Line 316 (submit error)
const errData = await res.json();
```
If the server returns a `500 Internal Server Error` with an HTML error page (Django's default debug page, or Nginx's error page in production), `res.json()` **throws** `SyntaxError: Unexpected token '<'`. This exception is caught by the outer `catch`, which displays "Network error" — misleading the user into thinking their internet is down when the server actually crashed.

**Fix:** Guard `.json()`:
```js
let errData;
try {
    errData = await res.json();
} catch {
    setError(`Server error (${res.status}). Please try again.`);
    return;
}
```

---

## 🟠 FRAGILE — Divisions endpoint hacked via string replace

**File:** [Line 169](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L169)

```js
const baseUrl = ENDPOINTS.CLASSES.replace('classes/', 'divisions/');
```

`ENDPOINTS.DIVISIONS` does not exist in `api.js`. This line constructs the URL by string-replacing `classes/` with `divisions/` in the classes endpoint. If `ENDPOINTS.CLASSES` ever changes format (e.g., `/api/v2/classes/` → `/api/v2/class-list/`), this silently fails — the replace returns the original string unchanged, and the API call hits the classes endpoint instead of divisions.

**Fix:** Add `DIVISIONS` to the endpoint config:
```js
// api.js
DIVISIONS: `${API_BASE}/customers/divisions/`,
```

---

## 🟠 FRAGILE — Race condition between initial fetch and edit-mode fetch

**File:** [Lines 64-92 vs 95-141](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L64-L141)

**The trace:**
1. `useEffect` at line 64 fires `fetchOptions()` — fetches schools, groups, tags
2. `useEffect` at line 95 fires `fetchCustomer()` — fetches customer, sets `formData.school`
3. `setFormData({school: someId})` triggers the cascading `useEffect` at line 144 which fetches classes for that school
4. BUT `fetchOptions` may not have completed yet — the schools dropdown is empty
5. User sees a school ID selected in a dropdown with no options. A phantom selection.

**What WILL happen:** In edit mode on slow connections, the school dropdown briefly shows the selected value against an empty options list. Once `fetchOptions` completes, the options appear and the selected value matches. This is a cosmetic race, not data loss, but it violates system status visibility.

**Fix:** Chain the fetches — fetch customer data AFTER options are loaded:
```js
useEffect(() => {
    fetchOptions().then(() => {
        if (id && !isEmbedded) fetchCustomer();
    });
}, []);
```

---

## 🟠 FRAGILE — `setTimeout` memory leak on unmount

**File:** [Line 243](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L243)

```js
setTimeout(() => setNewlyCreatedTagId(null), 600);
```

If the component unmounts before 600ms (e.g., user quickly navigates away after creating a tag), this calls `setNewlyCreatedTagId` on an unmounted component. React 18 silently ignores this, but it's a ticking bomb for future React versions and indicates sloppy lifecycle management.

**Fix:** Use a cleanup ref:
```js
const timeoutRef = useRef(null);
// In handleCreateTag:
timeoutRef.current = setTimeout(() => setNewlyCreatedTagId(null), 600);
// Add cleanup useEffect:
useEffect(() => () => clearTimeout(timeoutRef.current), []);
```

---

## 🟡 SMELL — `ENDPOINTS` fallback with `||` is dead code

**File:** [Lines 69-70](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L69-L70)

```js
fetchWithAuth(ENDPOINTS.CUSTOMERS_GROUPS || '/api/customers/customer-groups/')
fetchWithAuth(ENDPOINTS.CUSTOMERS_LOCATION_TAGS || '/api/customers/location-tags/')
```

Both `ENDPOINTS.CUSTOMERS_GROUPS` and `ENDPOINTS.CUSTOMERS_LOCATION_TAGS` are defined in `api.js`. The `||` fallback strings are identical to the actual values. This is dead code that creates a false illusion of safety. If the endpoints were removed from config, the fallback would mask the problem instead of failing loudly.

**Fix:** Remove the fallbacks. If the endpoint is undefined, it should fail explicitly.

---

## 🟡 SMELL — Double `setFormData` batching assumption

**File:** [Lines 195-202](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L195-L202)

```js
setFormData(prev => ({ ...prev, [name]: value }));         // line 195
// then:
if (name === 'school') {
    setFormData(prev => ({ ...prev, class_obj: '', ... })); // line 199
}
```

Two separate `setFormData` calls in the same synchronous block. React 18 batches these correctly, but this is relying on an implicit React internals guarantee. A single `setFormData` call would be explicit and unambiguous:
```js
if (name === 'school') {
    setFormData(prev => ({ ...prev, [name]: value, class_obj: '', division: '', subdivision: '' }));
} else if (name === 'class_obj') {
    setFormData(prev => ({ ...prev, [name]: value, division: '', subdivision: '' }));
} else {
    setFormData(prev => ({ ...prev, [name]: value }));
}
```

---

## Function-by-Function Verification

| Lines | Function | Verdict |
|-------|----------|---------|
| 64–92 | `fetchOptions` | 🟠 Race with edit-mode fetch |
| 95–141 | `fetchCustomer` | ✅ Verified — null checks present, `finally` cleanup correct |
| 144–159 | Cascading: School→Class | ✅ Verified — guard on empty school, cleanup on clear |
| 162–178 | Cascading: Class→Division | 🟠 FRAGILE — endpoint string hack |
| 180–203 | `handleInputChange` | 🟡 Double setState |
| 205–212 | `handleTagToggle` | ✅ Verified — includes/filter logic correct |
| 214–220 | `handleLocationSelect` | ✅ Verified |
| 222–224 | `toggleSection` | ✅ Verified |
| 226–254 | `handleCreateTag` | 🟠 setTimeout leak, ✅ error handling improved |
| 256–330 | `handleSubmit` | 💀 FATAL — sends `location_tags` not `location_tag_ids`, 🔴 `.json()` can throw |
| 332–337 | `handleCancel` | 🔴 BUG — always triggers in edit mode |
| 339–348 | Loading state render | ✅ Verified |
| 350–552 | JSX render tree | 🔴 Latitude 0 falsy, ✅ Accessibility attributes present |

---

## Summary

| # | Severity | Issue | Blocks Merge? |
|---|----------|-------|:---:|
| 1 | 💀 FATAL | `location_tags` sent instead of `location_tag_ids` — tags silently dropped | **YES** |
| 2 | 🔴 BUG | `handleCancel` always fires confirm in edit mode | YES |
| 3 | 🔴 BUG | Latitude 0 treated as falsy — equator locations break | YES |
| 4 | 🔴 BUG | `.json()` on HTML error responses throws | YES |
| 5 | 🟠 FRAGILE | Divisions endpoint hacked via string replace | — |
| 6 | 🟠 FRAGILE | Race condition: edit fetch before options loaded | — |
| 7 | 🟠 FRAGILE | setTimeout memory leak on unmount | — |
| 8 | 🟡 SMELL | Dead `\|\|` fallback on endpoints | — |
| 9 | 🟡 SMELL | Double `setFormData` in same handler | — |

---

> **The Scalpel's Verdict:** ❌ **REJECTED.** One FATAL data loss bug (location tags silently wiped on every save) and three reachable BUGs. Do not ship this. Fix #1 first — it's a one-line change. Then address #2, #3, #4.
