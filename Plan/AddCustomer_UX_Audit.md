# 🔍 The Lens — Add Customer Form Audit Report

**Page:** `/customers/add` — [AddCustomer.jsx](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx) + [AddCustomer.css](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.css)
**Date:** 2026-02-25
**Auditor:** The Lens (Hell Mode — UX Perfectionist)
**Audit Type:** Page Audit (Heuristic Analysis + Accessibility)

---

## Executive Summary

The Add Customer form is a **functional but friction-heavy** multi-section form with collapsible panels, cascading dropdowns, an embedded map, and a tag chip selector. The information architecture is reasonable, but there are **12 actionable findings** — 3 Critical, 5 Major, 4 Minor — primarily around error handling, accessibility, system feedback, and mobile ergonomics.

---

## Findings by Heuristic

### H1: Visibility of System Status

#### 🔴 CRITICAL — No loading indicator during initial data fetch
**Location:** [Lines 59–85](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L59-L85)
**Problem:** The form fires 3 parallel API calls on mount (`schools`, `groups`, `location-tags`). During this fetch, the user sees empty dropdowns and an empty tag container with no indication that data is loading. A user may assume there are no schools or tags, and proceed to submit incomplete data.
**Heuristic:** Nielsen H1 — The system should always keep users informed about what is going on.
**Fix:**
```jsx
const [initialLoading, setInitialLoading] = useState(true);
// In fetchOptions: setInitialLoading(false) in finally block
// In render: show skeleton/spinner while initialLoading is true
```

#### 🟡 MAJOR — No feedback on tag creation success
**Location:** [Lines 212–237](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L212-L237)
**Problem:** When a tag is created, the input simply disappears and the new chip appears in the list. There is no toast, flash, or visual confirmation. The user must visually scan the chip list to confirm success. This is fast but **invisible**.
**Fix:** Add a brief visual pulse animation on the newly created chip (e.g., `@keyframes chipAppear { 0% { transform: scale(0.8); } 100% { transform: scale(1); } }`) or a subtle toast: "Tag 'X' created."

---

### H2: Match Between System and Real World

#### 🔵 MINOR — "Faliya" field label may confuse non-Gujarati users
**Location:** [Line 449](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L449)
**Problem:** "Faliya" is a Gujarati-specific term (a neighborhood or lane within a village). While appropriate for the target user base, there is no tooltip or helper text explaining the term.
**Decision:** If the app is exclusively used by Gujarati shopkeepers, this is acceptable. If multi-regional, add an `ⓘ` info icon beside the label with a tooltip: "Neighbourhood / Lane".

---

### H3: User Control & Freedom

#### 🟡 MAJOR — No unsaved changes warning on navigation
**Location:** [Lines 312–315](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L312-L315)
**Problem:** The `handleCancel` function calls `navigate()` without checking if the form has been modified. If a user fills 15 fields and accidentally hits Cancel or the browser back button, all data is lost irreversibly. This is a **data loss vector**.
**Fix:**
```jsx
const isDirty = JSON.stringify(formData) !== JSON.stringify(initialFormData);
const handleCancel = () => {
    if (isDirty && !confirm('You have unsaved changes. Discard?')) return;
    if (onCancel) onCancel();
    else navigate(isEditMode ? `/customers/${id}` : '/customers');
};
```
Also consider `useBeforeUnload` from react-router for browser-level protection.

---

### H4: Consistency & Standards

#### 🟡 MAJOR — Required field indicators are inconsistent
**Location:** [Lines 342, 354](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L342-L355)
**Problem:** Required fields use `*` appended directly to label text: `First Name *`, `Phone *`. But the CSS defines a `.required-star` class (line 198 in CSS) that is **never used in the JSX**. The `*` character uses the same font weight and color as the label, making it easy to miss on the dark background.
**Fix:** Use semantically styled required indicators:
```jsx
<label>First Name <span className="required-star">*</span></label>
```

#### 🔵 MINOR — Class name mismatch: CSS has `.add-customer-form` but JSX uses `customer-form`
**Location:** CSS [line 27](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.css#L27) vs JSX [line 319](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L319)
**Problem:** The CSS defines `.add-customer-form` with `border-radius`, `box-shadow`, and `margin-bottom: 6rem`. The JSX applies `className="customer-form"` to the `<form>`. **These do not match.** The `.add-customer-form` styles are not being applied. This means the `margin-bottom: 6rem` intended to fix the bottom-nav overlap is **dead code**.
**Impact:** This may explain why the bottom-of-page clearance fix was unreliable — the `margin-bottom` rule never took effect.
**Fix:** Either rename the CSS class to `.customer-form` or change the JSX class to `add-customer-form`:
```jsx
<form onSubmit={handleSubmit} className="add-customer-form">
```

#### 🔵 MINOR — CSS `.collapsible-section` defined but JSX uses `.form-section`
**Location:** CSS [lines 43–49](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.css#L43-L49) vs JSX [lines 333, 367, 402, 427](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L333)
**Problem:** CSS defines `.collapsible-section` and `.collapsible-section:last-child` but the JSX uses `className="form-section"`. These border-bottom styles are not applied.
**Fix:** Align the class names. Either update JSX to use `collapsible-section` or update CSS to target `.form-section`.

---

### H5: Error Prevention

#### 🟡 MAJOR — Phone validation only fires on submit
**Location:** [Lines 244–248](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L244-L248)
**Problem:** The phone field enforces 10-digit numeric input via `handleInputChange` (good), but the validation error "Phone number must be exactly 10 digits" only appears after the user clicks Save. By that point, the user has potentially filled out 20+ fields and scrolled away from the phone field. The error message appears at the top of the form, and the user must scroll back to find the phone field to fix it.
**Fix:** Show inline validation feedback as the user types. Display a red border and helper text like "3/10 digits" beneath the phone input in real-time.

#### 🔴 CRITICAL — `alert()` used for tag creation errors
**Location:** [Lines 229, 233](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L229-L233)
**Problem:** `alert('Failed to create tag: ...')` and `alert('Error creating location tag')` use the browser's native `alert()` dialog, which:
- Blocks the main thread
- Is not styled or branded
- Cannot be dismissed on mobile without explicit tap
- Breaks the visual flow entirely
**Fix:** Use the same inline `setError()` pattern used elsewhere, or a toast notification system. Example:
```jsx
setTagError('Failed: ' + (err.name?.[0] || 'Unknown error'));
// Render inline: {tagError && <small className="text-error">{tagError}</small>}
```

---

### H6: Recognition over Recall

#### 🟡 MAJOR — "Group & Notes" section defaults to collapsed
**Location:** [Line 54](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L54)
**Problem:** `groupNotes: false` means this section is collapsed by default. If the shopkeeper doesn't remember that this section exists, they will never assign a customer group or add notes. For a **Create** form, all sections should be visible by default to prevent data omission. Collapsed sections are appropriate for **view/detail** pages, not creation flows.
**Fix:** Set `groupNotes: true` as the default, or at minimum show a visual badge on the collapsed header: "0 fields filled".

---

### H8: Aesthetic & Minimalist Design

#### 🔵 MINOR — Map takes 350px of vertical space on all viewports
**Location:** [Line 435](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L435)
**Problem:** `style={{ height: '350px' }}` is a fixed height. On mobile (375px viewport), the map consumes nearly the entire screen, pushing the address fields far below the fold. On desktop with a sidebar, it has ample space. The map's visual weight is disproportionate to its informational value in a form context.
**Fix:** Use a responsive height: `height: min(350px, 40vh)`. On mobile, cap at ~325px. Consider making the map collapsible or toggled with "📍 Pick on Map" button.

---

### H9: Error Recovery

#### 🔴 CRITICAL — Error message scrolls out of view
**Location:** [Line 330](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L330)
**Problem:** `{error && <div className="error-message">{error}</div>}` renders immediately below the header. On long forms, when the user scrolls to the bottom and submits, the error appears at the top — **completely invisible.** The user sees the "Save" button re-enable but has no idea what went wrong.
**Fix:** Either:
1. Scroll to the error on submit failure: `window.scrollTo({ top: 0, behavior: 'smooth' })`
2. Or make the error sticky/floating
3. Or show errors inline next to the offending field

---

### Accessibility (WCAG 2.1 AA)

#### 🟡 MAJOR — Tag chips lack `aria-pressed` state
**Location:** [Lines 494–501](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L494-L501)
**Problem:** The `.tag-chip` buttons toggle between selected/unselected states visually, but there is no `aria-pressed` attribute. Screen readers cannot distinguish a selected tag from an unselected one — they all read as generic buttons.
**Fix:**
```jsx
<button
    type="button"
    className={`tag-chip ${isSelected ? 'selected' : ''}`}
    onClick={() => handleTagToggle(t.id)}
    aria-pressed={isSelected}
    role="switch"
>
```

#### 🔵 MINOR — Section headers lack `aria-expanded`
**Location:** [Lines 334–337](file:///z:/Projects/books2/frontend/src/pages/customers/AddCustomer.jsx#L334-L337)
**Problem:** The collapsible section headers are clickable `<div>` elements with no `role`, `aria-expanded`, or `tabIndex`. They are invisible to keyboard navigation and screen readers.
**Fix:**
```jsx
<div
    className="section-header"
    onClick={() => toggleSection('details')}
    role="button"
    tabIndex={0}
    aria-expanded={sections.details}
    onKeyDown={e => e.key === 'Enter' && toggleSection('details')}
>
```

---

## Summary Table

| # | Severity | Heuristic | Issue | Impact |
|---|----------|-----------|-------|--------|
| 1 | 🔴 Critical | H1 | No loading state for initial data fetch | Users submit incomplete forms |
| 2 | 🔴 Critical | H5 | `alert()` for tag errors | Thread-blocking, breaks flow |
| 3 | 🔴 Critical | H9 | Error message scrolls out of view | Users don't see errors after submit |
| 4 | 🟡 Major | H1 | No tag creation feedback | Users unsure if tag was created |
| 5 | 🟡 Major | H3 | No unsaved changes warning | Silent data loss on Cancel |
| 6 | 🟡 Major | H4 | Required `*` not styled with `.required-star` | Easy to miss required fields |
| 7 | 🟡 Major | H5 | Phone validation only on submit | Late error discovery |
| 8 | 🟡 Major | H6 | Group & Notes collapsed by default | Users miss optional fields |
| 9 | 🟡 Major | A11y | Tag chips missing `aria-pressed` | Screen reader inaccessible |
| 10 | 🔵 Minor | H2 | "Faliya" has no tooltip | May confuse non-Gujarati users |
| 11 | 🔵 Minor | H4 | **CSS class `.add-customer-form` ≠ JSX `customer-form`** | Styles not applied, dead code |
| 12 | 🔵 Minor | H4 | CSS `.collapsible-section` ≠ JSX `.form-section` | Border styles not applied |
| 13 | 🔵 Minor | H8 | Map fixed at 350px on mobile | Disproportionate vertical weight |
| 14 | 🔵 Minor | A11y | Section headers lack `aria-expanded` / keyboard nav | Keyboard inaccessible |

---

> **The Lens Verdict:** The form's information architecture is sound — collapsible sections, cascading dropdowns, and inline tag creation are good patterns. But the execution has **3 critical bugs** (CSS class mismatch silently disabling styles, invisible error messages, and `alert()` dialogs) that must be fixed before this page can be considered production-ready. The class name mismatch (#11) is particularly insidious — it explains the persistent scroll/padding bugs.
