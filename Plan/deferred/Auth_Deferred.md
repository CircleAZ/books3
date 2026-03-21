# Auth System — Deferred Items (Roles Sprint)

## Items left out deliberately — to be tackled in the Roles sprint

### 1. Role-Based Route Guards (ARCH-1 + SEC-6)
**What:** `ProtectedRoute` in `App.jsx:71-85` currently only checks `isAuthenticated` — it does NOT check `user.role`. Any logged-in user (cashier, staff) can navigate to any URL.

**Action needed:**
- Create a `RoleGuard` or `RoleProtectedRoute` component:
  ```jsx
  <RoleGuard allowed={['owner', 'manager']}>
    <SettingsPage />
  </RoleGuard>
  ```
- Define which routes require which roles (owner-only, manager+, etc.)
- Add backend `permission_classes` per-view for matching enforcement
- Consider a `usePermissions()` hook for conditional UI rendering (hide buttons, menu items)

**Files to modify:**
- `frontend/src/App.jsx` — wrap routes with RoleGuard
- `frontend/src/context/AuthContext.jsx` — expose `user.role` checking helpers
- Backend views across all apps — add role-based permission classes

### 2. Forgot Password Flow (UX-2)
**What:** No "Forgot Password" link exists on the login page.

**Action needed:**
- Backend: Password reset via email (Django's built-in `PasswordResetView` or custom)
- Frontend: "Forgot Password" page with email input
- Email template configuration
- This requires SMTP/email service setup

### 3. Multi-Session Management
**What:** No "Log out all other sessions" button. Users can't see active sessions.

**Action needed:**
- Backend: Track active refresh tokens per user
- Frontend: "Active Sessions" list in profile settings
- "Log out everywhere" button that blacklists all tokens
