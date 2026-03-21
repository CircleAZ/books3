# 🧭 Navigation System — 6-Persona Review

## Scope

| Layer | Files Reviewed |
|-------|---------------|
| **Layout** | [MainLayout.jsx/css](file:///z:/books2/frontend/src/components/layout/MainLayout.jsx) |
| **Sidebar** | [NavigationDrawer.jsx/css](file:///z:/books2/frontend/src/components/layout/NavigationDrawer.jsx) |
| **Bottom Nav** | [BottomNavBar.jsx/css](file:///z:/books2/frontend/src/components/layout/BottomNavBar.jsx) |
| **Top Bar** | [TopBar.jsx/css](file:///z:/books2/frontend/src/components/layout/TopBar.jsx) |
| **Profile** | [UserProfileDropdown.jsx/css](file:///z:/books2/frontend/src/components/layout/UserProfileDropdown.jsx) |
| **Search** | [OmniSearch.jsx/css](file:///z:/books2/frontend/src/components/common/OmniSearch.jsx) |

## Responsive Test Results

````carousel
![Desktop 1920px — full sidebar with labels](C:/Users/mukun/.gemini/antigravity/brain/452f1d8f-34da-4396-ab94-c13a0e7dd0b6/desktop_full_sidebar_1772776886907.png)
<!-- slide -->
![Desktop mini sidebar — icon-only rail](C:/Users/mukun/.gemini/antigravity/brain/452f1d8f-34da-4396-ab94-c13a0e7dd0b6/desktop_mini_sidebar_1772776909076.png)
<!-- slide -->
![Breakpoint 1200px — auto-collapsed to mini](C:/Users/mukun/.gemini/antigravity/brain/452f1d8f-34da-4396-ab94-c13a0e7dd0b6/breakpoint_view_1200_1772776951512.png)
<!-- slide -->
![Mobile 375px — bottom nav + hamburger](C:/Users/mukun/.gemini/antigravity/brain/452f1d8f-34da-4396-ab94-c13a0e7dd0b6/mobile_dashboard_375_1772777150770.png)
<!-- slide -->
![Mobile drawer overlay](C:/Users/mukun/.gemini/antigravity/brain/452f1d8f-34da-4396-ab94-c13a0e7dd0b6/mobile_drawer_open_1772777169189.png)
<!-- slide -->
![iPhone SE 320px — New Order page](C:/Users/mukun/.gemini/antigravity/brain/452f1d8f-34da-4396-ab94-c13a0e7dd0b6/iphone_se_view_1772777233059.png)
````

| Viewport | Sidebar | Bottom Nav | Status |
|----------|---------|------------|--------|
| 1920px (Desktop) | Full (labels + icons) | Hidden | ✅ |
| 1366px (Laptop) | Full | Hidden | ✅ |
| 1200px (Breakpoint) | Auto → Mini | Hidden | ✅ |
| 768px (Tablet) | Hidden | Shown | ✅ |
| 375px (Mobile) | Hidden + overlay drawer | Shown | ✅ |
| 320px (iPhone SE) | Hidden + overlay drawer | Shown | ✅ |

---

## 🔴 Chaos Architect — Security

| ID | Issue | Severity | Location |
|----|-------|----------|----------|
| NAV-S1 | **OmniSearch uses `window.location.href`** for navigation — triggers full page reload instead of React Router, bypasses SPA behavior | 🟡 Medium | [OmniSearch.jsx:76](file:///z:/books2/frontend/src/components/common/OmniSearch.jsx#L76) |
| NAV-S2 | **UserProfileDropdown position is `absolute`** — no escape/contain on parent. Could render off-screen on small viewports | 🟠 Minor | [UserProfileDropdown.css:2](file:///z:/books2/frontend/src/components/layout/UserProfileDropdown.css#L2) |
| NAV-S3 | **Notification count hardcoded to `3`** — `notificationCount={3}` is static, not from any API | 🟠 Info | [MainLayout.jsx:184](file:///z:/books2/frontend/src/components/layout/MainLayout.jsx#L184) |

---

## 🔵 Ironclad — QA Edge Cases

| ID | Issue | Repro Steps |
|----|-------|-------------|
| NAV-Q1 | **`routeTitles` map incomplete** — dynamic routes like `/customers/:id`, `/orders/:id`, `/inventory/:id/edit` won't match, showing fallback "AZ Books" | Navigate to customer detail → title shows "AZ Books" instead of customer name |
| NAV-Q2 | **TopBar avatar hardcoded to "JD"** — doesn't use actual user initials from AuthContext | [TopBar.jsx:54](file:///z:/books2/frontend/src/components/layout/TopBar.jsx#L54) — says `<span>JD</span>` regardless of logged-in user |
| NAV-Q3 | **Cart badge on bottom nav uses `position: relative` + `absolute`** — the badge can clip outside the `nav-icon` container on very small screens | Narrow viewport + 3+ digit cart count |
| NAV-Q4 | **NavigationDrawer mini-mode links don't highlight sub-pages** — clicking "Product List" (/inventory) then navigating to `/inventory/add` loses the active indicator on the inventory icon | Navigate to sub-page in mini mode |
| NAV-Q5 | **OmniSearch categories are non-functional** — category chips render but do nothing when clicked | Click "Products" chip → nothing happens |
| NAV-Q6 | **Overlay drawer doesn't close on navigation** — the `onClose` passed to `MenuItem` as `onNavigate` works, but only for leaf NavLink items, not group headers | Click group header in overlay → drawer stays open |

---

## 🟢 The Lens — UX Audit

| ID | Severity | Issue | Heuristic |
|----|----------|-------|-----------|
| NAV-U1 | 🔴 Critical | **No active state persistence in sidebar** — when page loads, all menu groups start collapsed. User must re-expand the group containing the current page | Recognition, not recall |
| NAV-U2 | 🟡 Major | **Bottom nav "New Order" label changes to "Cart" on /orders/new** — but the icon also changes to a cart. This is clever but may confuse users who want to create ANOTHER order | Consistency |
| NAV-U3 | 🟡 Major | **No breadcrumbs** — on deep pages like `/customers/:id` or `/inventory/:id/edit`, user has no way to know where they are in the hierarchy | Navigation context |
| NAV-U4 | 🟠 Minor | **TopBar title truncates at 140px on mobile** — some titles like "Receipt Customization" get cut | Visibility |
| NAV-U5 | 🟠 Minor | **Notification bell is clickable but does nothing** — no notification panel opens, no navigation occurs | User expectation |
| NAV-U6 | ✅ Good | Skip-to-content link works ✅ | |
| NAV-U7 | ✅ Good | Focus trap in overlay drawer works ✅ | |
| NAV-U8 | ✅ Good | 44px minimum touch targets on all buttons ✅ | |
| NAV-U9 | ✅ Good | Ctrl+K search shortcut works ✅ | |

---

## 🟡 The Prism — Architecture

### Good Decisions ✅
- **3-mode responsive system** (full → mini → hidden) is well-designed
- **CSS custom properties** for all dimensions (easily tweak-able)
- **Spring animation curve** for drawer UX
- **Grid-based submenu animation** (no max-height hack)
- **`prefers-reduced-motion`** respected across all components
- **Focus-visible indicators** everywhere

### Concerns

| ID | Issue | Recommendation |
|----|-------|---------------|
| NAV-A1 | **Duplicate icon definitions** — `NavigationDrawer.jsx` and `BottomNavBar.jsx` both define their own icon SVGs for the same icons (home, package, users, etc.) | Extract shared `icons.js` module |
| NAV-A2 | **`menuSections` is hardcoded in NavigationDrawer** — should be a config/constant that components import, enabling role filtering later | Extract to `config/navigation.js` |
| NAV-A3 | **`routeTitles` map in MainLayout is redundant with `menuSections`** — both define route labels independently | Derive titles from the menu config |
| NAV-A4 | **OmniSearch navigation uses `window.location.href`** instead of `useNavigate` — loses React state on every search action | Use React Router's `useNavigate` |
| NAV-A5 | **Bottom nav hides at 768px** but sidebar mini-rail appears at 768px — the browser **CSS breakpoints** (768px for both) do match, but the JS `matchMedia` uses `min-width: 768px` for sidebar mini | The breakpoints align ✓ but should be verified on iPad |

---

## 🟣 The Scalpel — Code Review

| ID | Severity | Bug | Location |
|----|----------|-----|----------|
| NAV-B1 | 🔴 Critical | **TopBar avatar "JD" is hardcoded** — should use `user` prop or `useAuth()` to show actual initials | [TopBar.jsx:54](file:///z:/books2/frontend/src/components/layout/TopBar.jsx#L54) |
| NAV-B2 | 🟡 Major | **`OmniSearch.handleSelect` uses `window.location.href`** — full page reload, loses entire React state/context | [OmniSearch.jsx:76](file:///z:/books2/frontend/src/components/common/OmniSearch.jsx#L76) |
| NAV-B3 | 🟡 Major | **Notification count hardcoded** — `notificationCount={3}` never changes | [MainLayout.jsx:184](file:///z:/books2/frontend/src/components/layout/MainLayout.jsx#L184) |
| NAV-B4 | 🟠 Minor | **`userProfileDropdown.jsx` receives `user` prop but also calls `useAuth()`** — inconsistent data sourcing (component gets user from both parent and context) | [UserProfileDropdown.jsx:6,9](file:///z:/books2/frontend/src/components/layout/UserProfileDropdown.jsx#L6-L9) |
| NAV-B5 | 🟠 Minor | **`useState` import unused in `TopBar.jsx`** — line 1 imports `useState` but never uses it | [TopBar.jsx:1](file:///z:/books2/frontend/src/components/layout/TopBar.jsx#L1) |
| NAV-B6 | 🟠 Minor | **Duplicate `aria-label="Main navigation"`** — both BottomNavBar and NavigationDrawer use this label, confusing screen readers | [BottomNavBar.jsx:69](file:///z:/books2/frontend/src/components/layout/BottomNavBar.jsx#L69) vs [NavigationDrawer.jsx:300](file:///z:/books2/frontend/src/components/layout/NavigationDrawer.jsx#L300) |

---

## 🟠 The Shopkeeper — Usability Report

### The "Where Am I?" Problem
> "I opened a customer's details page. The sidebar showed no highlighting because all groups were collapsed. I couldn't tell which section of the app I was in. Then I refreshed and all my expanded menu groups collapsed. The title bar just said 'AZ Books'. I was lost."

### Shopkeeper's Scorecard

| Aspect | Score | Note |
|--------|-------|------|
| **Desktop navigation** | 9/10 | Excellent — full sidebar with smooth expand/collapse |
| **Tablet navigation** | 7/10 | Fine — mini rail works, but no labels |
| **Mobile navigation** | 8/10 | Good — bottom nav is smart, cart swap is clever |
| **Wayfinding** | 5/10 | Poor — no breadcrumbs, no active group auto-expand, generic titles on detail pages |
| **Search** | 4/10 | Broken — category chips don't filter, search results only quick actions, full reload |

**Overall: 7/10** — "Navigation works mechanically, but I feel lost on deep pages."

---

## 📋 Prioritized Action Items

### 🔴 P0 — Fix Now
1. **NAV-B1**: Replace hardcoded "JD" in TopBar with actual user initials from `useAuth()`
2. **NAV-B2**: Fix OmniSearch to use `useNavigate` instead of `window.location.href`
3. **NAV-U1**: Auto-expand sidebar group containing the currently active route on load

### 🟡 P1 — Next Sprint
4. **NAV-B3**: Wire notification count to actual API (or remove badge if no notifications feature)
5. **NAV-Q1**: Handle dynamic route titles (pattern match `/customers/:id` etc.)
6. **NAV-A1**: Extract shared icon components
7. **NAV-A2**: Extract `menuSections` to `config/navigation.js`
8. **NAV-B5**: Remove unused `useState` import from TopBar
9. **NAV-B6**: Fix duplicate `aria-label` (BottomNavBar → "Bottom navigation")
10. **NAV-B4**: Remove redundant `user` prop from UserProfileDropdown

### 🟢 P2 — Backlog
11. **NAV-U3**: Add breadcrumb component for deep pages
12. **NAV-U5**: Implement notification panel or remove bell icon
13. **NAV-Q5**: Make OmniSearch category chips functional
14. **NAV-A3**: Derive `routeTitles` from `menuSections` config
