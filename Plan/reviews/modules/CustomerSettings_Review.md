# Customer Settings — 6-Persona Review

> **Scope:** `CustomerSettings.jsx` + 7 Manage* sub-components + `CustomerSettings.css`
> **Files:** 8 files, ~1,255 LOC total

---

## 🔴 The Chaos Architect — Security Review

<VULNERABILITY_REPORT>

| ID | Vector | Impact | Description |
|----|--------|--------|-------------|
| **VULN-CS-1** | IDOR via UUID enumeration | HIGH | All 7 Manage* components construct DELETE/PUT URLs with `${ENDPOINT}${id}/`. No frontend guard ensures the user owns or has permission to modify the entity. If backend lacks object-level permissions, any authenticated user can delete another's data |
| **VULN-CS-2** | No CSRF token in manual fetch | MEDIUM | `fetchWithAuth` sends `Content-Type: application/json` but relies on cookie/token auth. If JWT is stored in localStorage, XSS can exfiltrate it. Verify `httpOnly` cookie usage |
| **VULN-CS-3** | `alert(JSON.stringify(errData))` | LOW | [ManageSchools.jsx:55](file:///z:/books2/frontend/src/pages/settings/ManageSchools.jsx#L55) — dumps raw server error data into an alert. Could leak internal field names, DB constraints, or stack traces to the user |
| **VULN-CS-4** | No rate limiting on CRUD | MEDIUM | All 7 endpoints accept unlimited POST/PUT/DELETE. An attacker could flood the system with thousands of schools/classes/tags via scripted requests |
| **VULN-CS-5** | `window.confirm()` as auth gate | LOW | Delete operations use only `window.confirm()` — trivially bypassable. No re-authentication or soft-delete with cooldown period |
| **VULN-CS-6** | No input sanitization | MEDIUM | All name/description fields accept raw untrimmed input. XSS payload in school name (e.g. `<img onerror=alert(1)>`) could persist if rendered unescaped elsewhere |

</VULNERABILITY_REPORT>

---

## 🔵 The Ironclad — QA Edge Cases

<QA_FAILURES>

| ID | Severity | Failure Condition | Expected State |
|----|----------|-------------------|----------------|
| **QA-CS-1** | ABSOLUTE | ManageClasses: `parseInt(e.target.value)` on empty string returns `NaN` (line 139) | Should default to `0` or use `parseInt(v) \|\| 0` |
| **QA-CS-2** | ABSOLUTE | ManageGroups: `discount_percent` stored as string from input, not parsed to float | Backend may reject non-numeric value, or worse, store "10.5" as string |
| **QA-CS-3** | ABSOLUTE | Loading guard `loading && !isEditing && items.length === 0` is wrong — if fetch returns empty array, `loading` becomes `false` and guard never triggers. But if fetch *fails*, `loading` is `false` and `items` stays `[]`, showing empty table with no error message |
| **QA-CS-4** | ABSOLUTE | ManageTags merge: no optimistic guard against merging a tag into itself via stale state (filter is `t.id !== mergeSource.id` but `mergeSource` could theoretically be stale after concurrent edit) |
| **QA-CS-5** | ABSOLUTE | Duplicate name creation: no client-side duplicate check. Two "Class 1" entries for the same school are silently accepted if backend allows it |
| **QA-CS-6** | ABSOLUTE | DELETE response not checked — `handleDelete` does not verify `res.ok`, silently accepts 403/404/500 as success and refreshes the list |
| **QA-CS-7** | ABSOLUTE | ManageSchools uses `currentItem` as edit flag but `isEditing` separately — creating race: click Edit on item A, then click "+ Add" before state settles. `currentItem` could be stale |

</QA_FAILURES>

---

## 🟢 The Lens — UX Heuristic Audit

<UX_AUDIT_REPORT>

| Severity | Heuristic | Observation | Fix |
|----------|-----------|-------------|-----|
| **Critical** | Error Prevention (H5) | DELETE has only `window.confirm()` — no information about impact. "Are you sure?" gives zero context about how many customers/items are affected | Show: "Delete 'ABC School'? 12 customers are linked to this school." Requires backend count API |
| **Critical** | Visibility of System Status (H1) | Save button has no loading state — no spinner, no disabled state during POST/PUT. User can double-click and create duplicates | Add `saving` state, disable button, show spinner during submission |
| **Major** | User Control & Freedom (H3) | No undo for delete. Destructive action is permanent with only a confirm dialog | Implement soft-delete with 5s undo toast (like we did for cart removal) |
| **Major** | Consistency (H4) | ManageSchools shows `alert()` on error, other 6 components silently swallow errors. Inconsistent feedback patterns | Use toast system consistently across all 7 components |
| **Major** | Recognition over Recall (H6) | No search/filter in any table. With 50+ schools, user must scroll the entire table | Add search input above table, filter in real-time |
| **Minor** | Match System/Real World (H2) | Tab labels "Divisions" and "Subdivisions" are abstract. No helper text explains the hierarchy (School → Class → Division → Subdivision) | Add small descriptive subtitle under each tab heading |
| **Minor** | Aesthetic & Minimalist (H8) | Inline styles (`style={{ marginBottom: '1rem' }}`) pollute JSX when CSS classes exist. ~40 inline style occurrences across 7 files | Extract to CSS classes |

</UX_AUDIT_REPORT>

---

## 🟡 The Prism — Architecture Review

<ARCHITECTURE_PROPOSAL>

### First Principles Deconstruction
All 7 Manage* components are **95% identical**. They share:
- Fetch list → display table → inline form → create/edit/delete
- Same state pattern: `items`, `loading`, `isEditing`, `currentItem`, `formData`
- Same CRUD handlers: `handleSubmit`, `handleEdit`, `handleDelete`
- Same JSX structure: header + form card + table

Only differences: field names, endpoint URLs, and foreign key dropdowns.

### Negative Code Opportunities

| Current | Proposed | Lines Saved |
|---------|----------|-------------|
| 7 separate CRUD components (~175 LOC each) | 1 generic `ManageCRUD` component with config object | ~1,050 lines (84% reduction) |
| 7 copies of `handleSubmit`/`handleDelete` | Shared `useCRUD(endpoint)` hook | ~350 lines |
| Inline styles across all 7 files | 3 CSS utility classes | ~40 inline style removals |

### The Walking Skeleton

```jsx
// Config-driven approach
const SETTINGS_CONFIG = {
  schools: {
    endpoint: ENDPOINTS.SCHOOLS,
    title: 'Schools',
    fields: [
      { name: 'name', label: 'School Name', type: 'text', required: true },
      { name: 'address', label: 'Address', type: 'textarea' }
    ],
    columns: ['name', 'address']
  },
};

<ManageCRUD config={SETTINGS_CONFIG[activeTab]} />
```

> **Recommendation:** Defer refactoring to a dedicated sprint. Current code works but violates DRY at scale.

</ARCHITECTURE_PROPOSAL>

---

## 🟣 The Scalpel — Code Review

<CODE_REVIEW>

| File:Line | Severity | Trigger | Failure |
|-----------|----------|---------|---------|
| [ManageSchools.jsx:55](file:///z:/books2/frontend/src/pages/settings/ManageSchools.jsx#L55) | BUG | Server returns 4xx/5xx | `alert('Failed to save: ' + JSON.stringify(errData))` — raw JSON dumped to user |
| [ManageClasses.jsx:139](file:///z:/books2/frontend/src/pages/settings/ManageClasses.jsx#L139) | BUG | User clears Order field | `parseInt('')` → `NaN` stored in state, sent to API |
| [ManageGroups.jsx:117](file:///z:/books2/frontend/src/pages/settings/ManageGroups.jsx#L117) | FRAGILE | `discount_percent` onChange | Value not parsed — `e.target.value` is always string |
| [ManageClasses.jsx:169](file:///z:/books2/frontend/src/pages/settings/ManageClasses.jsx#L169) | FRAGILE | School deleted after class created | O(n) lookup per row, shows `-` for orphaned classes |
| [ManageDivisions.jsx:159](file:///z:/books2/frontend/src/pages/settings/ManageDivisions.jsx#L159) | FRAGILE | Same orphan display issue | Division renders `-` if parent class deleted |
| [ManageSubdivisions.jsx:159](file:///z:/books2/frontend/src/pages/settings/ManageSubdivisions.jsx#L159) | FRAGILE | Same orphan display issue | Subdivision renders `-` if parent division deleted |
| All 7 files | SMELL | `handleDelete` | DELETE response never checked — silently refreshes even on 403/500 |
| [CustomerSettings.jsx:44](file:///z:/books2/frontend/src/pages/settings/CustomerSettings.jsx#L44) | SMELL | Default switch case | `default: return <ManageSchools />` duplicates `case 'schools'` — should be `return null` |

[VERDICT: ⚠️ CONDITIONAL — Functional but fragile. Multiple silent failure paths and data type issues need fixing before production scaling]

</CODE_REVIEW>

---

## 🟠 The Shopkeeper (Priya) — Usability Test

<USER_TEST_REPORT>

| Action | Result | Frustration | Quote |
|--------|--------|-------------|-------|
| Open Customer Settings | Page loads with Schools tab. No search. 47 schools. | 3/10 | "Where's the search? I'm scrolling forever" |
| Click "+ Add School" | Form appears above table. Good — immediate | 2/10 | "OK, this part is simple" |
| Type school name, hit Save | No "Saved!" message. Did it work? | 5/10 | "Did it save? I'll click again... now there are two" |
| Try to delete a school | "Are you sure? This may affect linked customers." No count | 6/10 | "How MANY customers?! I'm scared to click OK" |
| Switch to "Classes" tab | 47 schools in dropdown, no search | 7/10 | "I have to scroll through 47 schools in a tiny dropdown?!" [ABANDONED_TASK] |
| Go to "Location Tags" | Color picker is nice. But fixing a typo = Edit → fix → Save (3 steps) | 5/10 | "Why can't I just click the name and type?" |
| Try "Merge" button | Confirm message is a paragraph in browser popup | 6/10 | "This is important and you're showing it in a tiny popup?!" |
| Switch back to Schools | Scroll position gone, back to top | 4/10 | "I was at the bottom. Now I'm at the top again" |

**Overall Frustration: 5.8/10** — "It works but feels like a spreadsheet with extra steps."

</USER_TEST_REPORT>

---

## Summary: Prioritized Issues

| Priority | Category | Count | Key Items |
|----------|----------|-------|-----------|
| 🔴 High | Security | 2 | IDOR protection, input sanitization |
| 🔴 High | Bugs | 3 | `parseInt(NaN)`, silent error swallowing, delete response unchecked |
| 🟡 Medium | UX | 4 | Save loading state, delete impact count, search/filter, toast notifications |
| 🟢 Low | Architecture | 1 | DRY refactor (7 components → 1 generic) |
| 🟢 Low | Polish | 3 | Inline styles cleanup, confirm → modal, scroll position |
