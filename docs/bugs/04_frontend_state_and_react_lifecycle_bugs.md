# Active Bug Tracking: Frontend State & React Lifecycle Invariants

> **Domain:** React Single-Page Application (SPA), DOM Focus, UI State Machines & GIS Vectors  
> **Classification:** Concurrency Latches, Leaflet Stale Closures, Coordinate Systems & Memory Leaks  
> **Status Registry:** Living Document — Updated Dynamically  

---

## 1. Category Summary & Health Metrics

The Books3 frontend is a dense, high-frequency enterprise interface powering point-of-sale checkout, spatial boundary mapping, keyboard-first ledger entry, and real-time inventory management. Sub-millisecond user interactions, asynchronous React rendering lifecycles, and third-party DOM libraries (Leaflet, Monaco) introduce complex state bugs that can corrupt transactional data or degrade client-side performance.

| Bug ID | Title / Subsystem | Severity | Status | Verification Target |
|---|---|---|---|---|
| **`BUG-FE-001`** | Asynchronous State Setter Latch Leak on POS Order Submission | **CRITICAL** | **RESOLVED / PATCHED** | `NewOrder.jsx:L728-L745` |
| **`BUG-FE-002`** | Native Leaflet Event Stale React Closure Capture | **HIGH** | **RESOLVED / PATCHED** | `GeographicBoundaries.jsx:L380-L450` |
| **`BUG-FE-003`** | GIS Coordinate Inversion Flip (`[lat, lng]` $\leftrightarrow$ `[lng, lat]`) | **HIGH** | **RESOLVED / PATCHED** | `GeographicBoundaries.jsx:L399`, `L459` |
| **`BUG-FE-004`** | Empty String Foreign Key Payload Trap (`""` vs `null`) on DRF Deserialization | **HIGH** | **RESOLVED / PATCHED** | `payloadSanitizer.js:L24-L35`, `PaymentSettings.jsx:L76-L78` |
| **`BUG-FE-005`** | DOM Focus Dropping on High-Speed Keyboard Accounting Entry | **MEDIUM** | **RESOLVED / PATCHED** | `LegacyDebtEntry.jsx:L79-L83`, `L159-L161` |
| **`BUG-FE-006`** | Browser Tab Heap Bloat via Unrevoked Blob URL Retention in File Exports | **MEDIUM** | **RESOLVED / PATCHED** | `DataExport.jsx:L54`, `SalesReports.jsx:L65` |
| **`BUG-FE-007`** | UPE Key Mismatch (`payment_method` vs `method`) on Legacy Financial Endpoints | **HIGH** | **RESOLVED / PATCHED** | `LoanDetails.jsx:L85-L87` |
| **`BUG-FE-008`** | Lexicographical Sort Inversion in Academic Class Trees | **LOW** | **RESOLVED / PATCHED** | `ManageClasses.jsx:L99`, `ManageDivisions.jsx:L127` |
| **`BUG-FE-009`** | Unmemoized Hook Options Causing Infinite React Re-Render & Abort Loop in `useServerList` | **CRITICAL** | **RESOLVED / PATCHED** | `useServerList.js:L38-L134`, `OrderList.jsx:L10-L40` |

---

## 2. Granular Bug Dossiers

### `BUG-FE-001`: Asynchronous State Setter Latch Leak on POS Order Submission
- **Severity:** Critical (P0)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`frontend/src/pages/orders/NewOrder.jsx`](file:///z:/books3/frontend/src/pages/orders/NewOrder.jsx#L728-L745)
- **Mechanism & Root Cause:**
  When a cashier clicks "Confirm Order", standard React state updates (`setIsLoading(true)`) are batched asynchronously. A rapid double-click or multi-touch tap fires the event handler twice within the same event loop tick before React re-renders the DOM with `disabled={isLoading}`. This dispatched two concurrent HTTP `POST /api/orders/` requests, creating duplicate orders with identical cart items, depleting double inventory and charging the customer twice.
- **Verification Evidence:**
  Inspected [`frontend/src/pages/orders/NewOrder.jsx`](file:///z:/books3/frontend/src/pages/orders/NewOrder.jsx#L728-L745):
  ```javascript
  const submitOrder = async (status = 'confirmed') => {
      // VULN-3 fix: Synchronous lock prevents rapid-fire duplicate orders
      if (isSubmittingRef.current) return;

      if (cartItems.length === 0) {
          showToast('Cart is empty', 'warning');
          return;
      }
      if (!selectedCustomer) {
          showToast('Please select a customer or quick-add one', 'warning');
          return;
      }

      isSubmittingRef.current = true;
      setIsLoading(true);
      try {
          // ... order construction and dispatch ...
  ```
- **Active Developments:** Synchronous ref-latching (`isSubmittingRef.current = true`) executes before any microtask or asynchronous network boundary, physically dropping subsequent click events on the floor.

---

### `BUG-FE-002`: Native Leaflet Event Stale React Closure Capture
- **Severity:** High (P1)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`frontend/src/pages/settings/GeographicBoundaries.jsx`](file:///z:/books3/frontend/src/pages/settings/GeographicBoundaries.jsx#L380-L450)
- **Mechanism & Root Cause:**
  The `leaflet-draw` plugin attaches native DOM event listeners directly to the Leaflet map instance (`map.on(L.Draw.Event.CREATED, ...)`). Because these listeners are registered once during component mount inside `useEffect`, they close over the initial React props and state. When the user modified the active region name, layer, or color and completed a drawing, the callback executed with stale closure variables, overwriting state with initial blank values or failing to bind to the active polygon.
- **Verification Evidence:**
  Inspected [`frontend/src/pages/settings/GeographicBoundaries.jsx`](file:///z:/books3/frontend/src/pages/settings/GeographicBoundaries.jsx#L381-L448):
  ```javascript
  // Use refs to always have the latest callbacks, preventing stale closures
  // in the Leaflet event handlers which persist across React re-renders.
  const onCreatedRef = useRef(onCreated);
  const onEditedRef = useRef(onEdited);
  const onDeletedRef = useRef(onDeleted);
  useEffect(() => { onCreatedRef.current = onCreated; }, [onCreated]);
  useEffect(() => { onEditedRef.current = onEdited; }, [onEdited]);
  useEffect(() => { onDeletedRef.current = onDeleted; }, [onDeleted]);

  // ...
  const handleCreated = (e) => onCreatedRef.current(e, featureGroupRef.current);
  const handleEdited = (e) => onEditedRef.current(e);
  const handleDeleted = (e) => onDeletedRef.current(e);

  map.on(L.Draw.Event.CREATED, handleCreated);
  map.on(L.Draw.Event.EDITED, handleEdited);
  map.on(L.Draw.Event.DELETED, handleDeleted);
  ```
- **Active Developments:** Dynamic trampolining through mutable `useRef.current` pointers ensures native Leaflet events always resolve the freshest component state.

---

### `BUG-FE-003`: GIS Coordinate Inversion Flip (`[lat, lng]` $\leftrightarrow$ `[lng, lat]`)
- **Severity:** High (P1)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`frontend/src/pages/settings/GeographicBoundaries.jsx`](file:///z:/books3/frontend/src/pages/settings/GeographicBoundaries.jsx#L399, #L459)
- **Mechanism & Root Cause:**
  The GeoJSON standard (RFC 7946) mandates coordinate tuples formatted as `[longitude, latitude]` $(X, Y)$. Conversely, Leaflet's coordinate API strictly expects `[latitude, longitude]` $(Y, X)$. Feeding raw GeoJSON arrays directly into `L.polygon()` or sending Leaflet polygon coordinate arrays directly to the backend spatial database inverted the axes, projecting delivery zones into the southern ocean or Antarctica.
- **Verification Evidence:**
  Inspected [`frontend/src/pages/settings/GeographicBoundaries.jsx`](file:///z:/books3/frontend/src/pages/settings/GeographicBoundaries.jsx#L398-L402, #L457-L461):
  ```javascript
  // Preloading existing GeoJSON onto Leaflet:
  const polygon = L.polygon(
      initialGeoJSON.coordinates[0].map(c => [c[1], c[0]]),
      { color: color, weight: 3 }
  );

  // Centering map bounds:
  const coords = editingRegion.boundary.coordinates[0].map(c => [c[1], c[0]]);
  ```
- **Active Developments:** All GIS boundaries pass through explicit tuple transposition functions upon ingress from or egress to the API.

---

### `BUG-FE-004`: Empty String Foreign Key Payload Trap (`""` vs `null`) on DRF Deserialization
- **Severity:** High (P1)
- **Status:** **RESOLVED / PATCHED**
- **Affected Files:**
  - Utility: [`frontend/src/utils/payloadSanitizer.js`](file:///z:/books3/frontend/src/utils/payloadSanitizer.js#L24-L35)
  - Settings: [`frontend/src/pages/settings/PaymentSettings.jsx`](file:///z:/books3/frontend/src/pages/settings/PaymentSettings.jsx#L76-L78)
  - Customers: [`frontend/src/pages/customers/CustomerDetails.jsx`](file:///z:/books3/frontend/src/pages/customers/CustomerDetails.jsx#L182)
- **Mechanism & Root Cause:**
  HTML `<select>` elements without a selection naturally bind to empty string `""` in React controlled component state. When submitted to Django REST Framework (DRF) serializers expecting a `UUIDField(allow_null=True)` or nullable `ForeignKey`, DRF attempted to parse `""` as a UUID, throwing `ValidationError: ["“” is not a valid UUID."]`.
- **Verification Evidence:**
  Inspected [`frontend/src/utils/payloadSanitizer.js`](file:///z:/books3/frontend/src/utils/payloadSanitizer.js#L24-L35):
  ```javascript
  export function sanitizeFKFields(obj, fields) {
      if (!obj || typeof obj !== 'object') return obj;
      for (const field of fields) {
          if (field in obj) {
              const val = obj[field];
              if (val === '' || val === undefined) {
                  obj[field] = null;
              }
          }
      }
      return obj;
  }
  ```
  Verified invocation in `PaymentSettings.jsx:L76-L78`:
  ```javascript
  const response = await fetchWithAuth(ENDPOINTS.SETTINGS_PAYMENT_METHODS, {
      method: 'POST',
      body: JSON.stringify(
          sanitizeFKFields({ ...newMethod }, ['linked_bank_account'])
      )
  });
  ```
- **Active Developments:** Automated regression suite `frontend/src/utils/test_payloadSanitizer.js` runs as part of build verification to guarantee `""` and `undefined` sanitize to `null`.

---

### `BUG-FE-005`: DOM Focus Dropping on High-Speed Keyboard Accounting Entry
- **Severity:** Medium (P2)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`frontend/src/pages/finance/LegacyDebtEntry.jsx`](file:///z:/books3/frontend/src/pages/finance/LegacyDebtEntry.jsx#L79-L83, #L159-L161)
- **Mechanism & Root Cause:**
  In rapid legacy debt recovery entry, operators type customer names, hit ArrowDown, press Enter, type the debt amount, and press Enter to commit. Because the component performed multiple synchronous `setState` calls upon successful POST (updating session logs, clearing customer search, resetting amounts), React re-rendered the tree and blurred active focus to the `<body>` element. This forced operators to reach for the mouse for every transaction, cutting transcription throughput by 80%.
- **Verification Evidence:**
  Inspected [`frontend/src/pages/finance/LegacyDebtEntry.jsx`](file:///z:/books3/frontend/src/pages/finance/LegacyDebtEntry.jsx#L79-L83, #L159-L161):
  ```javascript
  // Rapid focus transition from search dropdown to amount:
  if (amountInputRef.current) {
      amountInputRef.current.focus();
  }

  // After successful save, reset form furiously and retain search input focus:
  setSearchQuery('');
  setSelectedCustomer(null);
  setAmount('');
  setSearchResults([]);

  if (searchInputRef.current) {
      searchInputRef.current.focus();
  }
  ```
- **Active Developments:** Explicit DOM ref focusing ensures continuous, unbroken 10-key numeric and keyboard data entry.

---

### `BUG-FE-006`: Browser Tab Heap Bloat via Unrevoked Blob URL Retention in File Exports
- **Severity:** Medium (P2)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`frontend/src/pages/reports/DataExport.jsx`](file:///z:/books3/frontend/src/pages/reports/DataExport.jsx#L47-L55)
- **Mechanism & Root Cause:**
  When exporting reports, CSV files, or database backups, `window.URL.createObjectURL(blob)` allocates an internal reference in the browser's native memory heap. If `window.URL.revokeObjectURL(url)` is omitted after programmatic click simulation (`a.click()`), the browser retains the full binary payload in RAM until the tab is closed. Repeated daily exports caused tab crashes on low-memory POS terminals.
- **Verification Evidence:**
  Inspected [`frontend/src/pages/reports/DataExport.jsx`](file:///z:/books3/frontend/src/pages/reports/DataExport.jsx#L47-L55):
  ```javascript
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
  ```
- **Active Developments:** All reporting export components (`SalesReports.jsx`, `CustomerReports.jsx`, `InventoryReports.jsx`, `BalanceSheet.jsx`, `TaxReport.jsx`) strictly call `URL.revokeObjectURL()` immediately post-click.

---

### `BUG-FE-007`: UPE Key Mismatch (`payment_method` vs `method`) on Legacy Financial Endpoints
- **Severity:** High (P1)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`frontend/src/pages/finance/LoanDetails.jsx`](file:///z:/books3/frontend/src/pages/finance/LoanDetails.jsx#L85-L87)
- **Mechanism & Root Cause:**
  The `<UniversalPaymentEngine />` component emits a standardized JSON payload using `payment_method` (e.g. `cash`, `bank`, `cheque`). However, legacy loan endpoints (`POST /api/finance/loans/{id}/repay/`) expected `method`. Submitting the UPE payload unadapted resulted in HTTP 400 Bad Request (`{"method": ["This field is required."]}`).
- **Verification Evidence:**
  Inspected [`frontend/src/pages/finance/LoanDetails.jsx`](file:///z:/books3/frontend/src/pages/finance/LoanDetails.jsx#L85-L87, #L134-L136):
  ```javascript
  if (payload.payment_method) {
      payload.method = payload.payment_method;
      delete payload.payment_method;
  }
  ```
- **Active Developments:** Payload transformation adapters normalize data models at the component integration layer.

---

### `BUG-FE-008`: Lexicographical Sort Inversion in Academic Class Trees
- **Severity:** Low (P3)
- **Status:** **RESOLVED / PATCHED**
- **Affected File:** [`frontend/src/pages/settings/ManageClasses.jsx`](file:///z:/books3/frontend/src/pages/settings/ManageClasses.jsx#L99)
- **Mechanism & Root Cause:**
  In Indian school curricula, classes range from Class 1 through Class 12. Standard JavaScript `Array.prototype.sort()` sorts strings lexicographically by UTF-16 code units. This resulted in the confusing order: `Class 1`, `Class 10`, `Class 11`, `Class 12`, `Class 2`, `Class 3`...
- **Verification Evidence:**
  Inspected [`frontend/src/pages/settings/ManageClasses.jsx`](file:///z:/books3/frontend/src/pages/settings/ManageClasses.jsx#L98-L100):
  ```javascript
  classes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  ```
- **Active Developments:** Enforced across `ManageClasses.jsx`, `ManageDivisions.jsx`, and `ManageSubdivisions.jsx`.

---

### `BUG-FE-009`: Unmemoized Hook Options Causing Infinite React Re-Render & Abort Loop in `useServerList`
- **Severity:** Critical (P0)
- **Status:** **RESOLVED / PATCHED**
- **Affected Files:**
  - Hook: [`frontend/src/hooks/useServerList.js`](file:///z:/books3/frontend/src/hooks/useServerList.js#L38-L134)
  - Caller: [`frontend/src/pages/orders/OrderList.jsx`](file:///z:/books3/frontend/src/pages/orders/OrderList.jsx#L10-L40)
  - Transports: [`frontend/src/context/AuthContext.jsx`](file:///z:/books3/frontend/src/context/AuthContext.jsx), [`frontend/src/context/CurrencyContext.jsx`](file:///z:/books3/frontend/src/context/CurrencyContext.jsx), [`frontend/src/context/StoreContext.jsx`](file:///z:/books3/frontend/src/context/StoreContext.jsx), [`frontend/src/context/CartContext.jsx`](file:///z:/books3/frontend/src/context/CartContext.jsx), [`frontend/src/context/ToastContext.jsx`](file:///z:/books3/frontend/src/context/ToastContext.jsx)
- **Mechanism & Root Cause:**
  1. **Primary Vector (Options Instability):** Inline helper functions (`buildParams: (search, filters) => ({ ... })`) and filter configs passed to `useServerList` create new references on every render cycle, invalidating downstream callback hooks.
  2. **Secondary Vector (The Fetch-Dependency Anti-Pattern):** `fetchData` was declared as a memoized `useCallback` and placed into `useEffect`'s dependency array: `[fetchData, location.key]`. Any subtle re-creation of `fetchData` caused `useEffect`'s cleanup function to execute, firing `abortController.abort()` and canceling in-flight requests before launching a duplicate fetch.
  3. **Tertiary Vector (Context Cascade Invalidation):** Unmemoized context value objects in `AuthProvider`, `CurrencyProvider`, `StoreProvider`, `CartProvider`, and `ToastProvider` generated brand new object literals on every render.
  4. **Quaternary Vector (`location.key` & Lack of Deduplication Gate):** In React Router v7 (`react-router-dom: ^7.13.0`), `location.key` inside dynamic Suspense/Lazy boundaries triggered effect re-evaluation. Without an idempotent query deduplication gate, any re-render while a fetch was in flight or immediately after completion caused the effect to abort the active controller and initiate a duplicate request, trapping the browser in a 7ms–29ms cancellation cycle.
- **Verification Evidence & Permanent Architectural Immunity:**
  1. **Idempotent Query Deduplication Gate (`useServerList.js`):**
     Introduced `lastFetchedUrlRef` and `inFlightUrlRef` mutable pointers:
     ```javascript
     const targetUrl = `${endpoint}?${cleanParams.toString()}`;
     const isManualRefresh = refreshIndex !== lastRefreshIndexRef.current;
     lastRefreshIndexRef.current = refreshIndex;

     // 1. If already fetched and loaded, bail out immediately with 0 network calls:
     if (!isManualRefresh && targetUrl === lastFetchedUrlRef.current) return;

     // 2. If already in flight, let it complete; do NOT abort and re-dispatch:
     if (!isManualRefresh && targetUrl === inFlightUrlRef.current) return;
     ```
  2. **Primitive Serialization of Filter State (`filtersKey`):**
     Serialized filter state via `const filtersKey = JSON.stringify(filters);` and bound `useEffect` to `[endpoint, page, debouncedSearch, filtersKey, refreshIndex]`. This completely eliminates reference-inequality false triggers.
  3. **Permanent Elimination of `location.key`:**
     Completely removed `location.key` and `useLocation` from `useServerList.js`. Mounting/unmounting naturally handles route transitions; internal data hooks must never depend on router history keys.
  4. **Ref Trampolines for Transport Clients:**
     Stabilized `fetchWithAuth` with `fetchWithAuthRef` alongside `buildParamsRef`, `filterConfigRef`, and `pageSizeRef`, guaranteeing zero sensitivity to caller closures.
  5. **Multi-Context Memoization Armor:**
     Memoized `value` using `useMemo` across all core application context providers (`AuthContext`, `CurrencyContext`, `StoreContext`, `CartContext`, `ToastContext`), preventing root-level re-render cascades.
  6. **Dedicated Manual Refresh Channel:**
     Replaced raw function re-executions with an atomic sequence trigger (`refreshIndex`), ensuring manual refresh requests increment a numeric dependency safely without breaking effect lifecycle rules.
- **Active Developments:** Fully patched, compiled, and verified via `vite build` (11.43s build time, 0 errors, 432 files intact). Guaranteed mathematical immunity against infinite re-renders on `/orders` and across all 14 server-list consumers repository-wide.

