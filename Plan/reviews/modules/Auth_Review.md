# 🔐 Auth System — 6-Persona Review

## Scope

| Layer | Files Reviewed |
|-------|---------------|
| **Frontend** | [AuthContext.jsx](file:///z:/books2/frontend/src/context/AuthContext.jsx), [Login.jsx](file:///z:/books2/frontend/src/pages/Login.jsx), [Login.css](file:///z:/books2/frontend/src/pages/Login.css), [App.jsx:71-85](file:///z:/books2/frontend/src/App.jsx#L71-L85) (ProtectedRoute) |
| **Backend** | [views.py](file:///z:/books2/account/views.py), [models.py](file:///z:/books2/account/models.py), [serializers.py](file:///z:/books2/account/serializers.py), [urls.py](file:///z:/books2/account/urls.py) |
| **Config** | [settings.py:190-201](file:///z:/books2/azbooks/settings.py#L190-L201) (SIMPLE_JWT) |

---

## 🔴 Chaos Architect — Security Audit

### CRITICAL

| ID | Vulnerability | Location | Impact |
|----|--------------|----------|--------|
| SEC-1 | **Tokens stored in `localStorage`** — vulnerable to XSS. Any injected script reads all tokens instantly. | [AuthContext.jsx:42-44](file:///z:/books2/frontend/src/context/AuthContext.jsx#L42-L44) | **Full account takeover** if XSS exists anywhere in the app |
| SEC-2 | **Demo credentials visible on login page** — `"Demo: admin / admin"` shown to every visitor | [Login.jsx:105](file:///z:/books2/frontend/src/pages/Login.jsx#L105) | Anyone gets admin access in production |
| SEC-3 | **No rate limiting on login endpoint** — `AllowAny` with no throttle | [views.py:27](file:///z:/books2/account/views.py#L27) | Brute-force attacks are trivial |
| SEC-4 | **No account lockout** after failed attempts | [views.py:39](file:///z:/books2/account/views.py#L39) | Unlimited attempts allowed |
| SEC-5 | **Password change doesn't invalidate existing tokens** — old tokens still work after password change | [views.py:204-205](file:///z:/books2/account/views.py#L204-L205) | Compromised sessions stay active |

### HIGH

| ID | Vulnerability | Location | Impact |
|----|--------------|----------|--------|
| SEC-6 | **No RBAC enforcement in `ProtectedRoute`** — only checks `isAuthenticated`, not `user.role` | [App.jsx:83](file:///z:/books2/frontend/src/App.jsx#L83) | Cashier can navigate to owner-only pages |
| SEC-7 | **Refresh token not cleared on logout failure** — `finally` block clears localStorage even if blacklist call fails silently | [AuthContext.jsx:73-84](file:///z:/books2/frontend/src/context/AuthContext.jsx#L73-L84) | Old refresh token stays valid on server |
| SEC-8 | **`remember_me` extends access token to 7 DAYS** — excessive for an access token | [views.py:58](file:///z:/books2/account/views.py#L58) | 7-day window for stolen access tokens |
| SEC-9 | **User enumeration** possible — different error for "invalid password" vs "account disabled" | [views.py:40-48](file:///z:/books2/account/views.py#L40-L48) | Attacker knows which usernames exist |
| SEC-10 | **Profile picture upload no content-type validation** — only size check (5MB), no MIME/extension check | [serializers.py:82-85](file:///z:/books2/account/serializers.py#L82-L85) | Possible to upload malicious files |

### MEDIUM

| ID | Vulnerability | Location |
|----|--------------|----------|
| SEC-11 | **`X-Forwarded-For` spoofable** for IP logging — no trusted proxy validation | [views.py:64-68](file:///z:/books2/account/views.py#L64-L68) |
| SEC-12 | **Activity log not tamper-proof** — `CASCADE` delete means deleting user destroys audit trail | [models.py:80-84](file:///z:/books2/account/models.py#L80-L84) |
| SEC-13 | **No CSRF token on login form** — while JWT-based, login itself is unprotected | Login.jsx form |

---

## 🔵 Ironclad — QA Edge Cases

| ID | Failure | Repro Steps | Expected vs Actual |
|----|---------|-------------|-------------------|
| QA-1 | **Stale user data after profile update** — localStorage `user` object never refreshed until re-login | 1. Login 2. Admin changes your role 3. You still see old role | Expected: role updates; Actual: stale data in `localStorage.user` |
| QA-2 | **`JSON.parse` crash on corrupted localStorage** | 1. Manually set `user` key to `"{"` in localStorage 2. Refresh page | Expected: graceful fallback; Actual: [AuthContext.jsx:22](file:///z:/books2/frontend/src/context/AuthContext.jsx#L22) throws `SyntaxError`, app crashes |
| QA-3 | **Remember Me has no backend effect if checked AFTER token generation** | The `remember_me` flag is server-side only. Frontend has no concept of different token durations — it just stores what comes back | Works correctly but no frontend indicator |
| QA-4 | **Logout succeeds even when server denies blacklist** — `catch` block returns `{message: 'Logged out'}` regardless | 1. Logout while server is offline 2. Refresh token still valid | Expected: user warned; Actual: silent |
| QA-5 | **Double-click on login button during slow connection** — `loading` prevents submit, but no debounce guard | 1. Click Sign In 2. Rapidly click again before `loading` state updates | Race condition window depends on React render timing |
| QA-6 | **`from` state redirect after login** — if user navigates to `/orders/new` → redirect to login → login → navigates to `/orders/new` | This works correctly ✅ | Edge case: deep links with query params may lose params |
| QA-7 | **Token refresh returns new access but token state gets stale** — `setToken(data.access)` updates state, but the original `fetchWithAuth` closure may still hold old `token` | [AuthContext.jsx:110](file:///z:/books2/frontend/src/context/AuthContext.jsx#L110) reads from localStorage instead of state ✅ | Mitigated by localStorage read |

---

## 🟢 The Lens — UX Audit

| ID | Severity | Issue | Heuristic Violated |
|----|----------|-------|-------------------|
| UX-1 | 🔴 Critical | **No session expiry warning** — user is force-logged out mid-work with no save opportunity | Error prevention |
| UX-2 | 🔴 Critical | **No "Forgot Password" link** on login page | User control |
| UX-3 | 🟡 Major | **No password strength indicator** on change-password | Visibility of system status |
| UX-4 | 🟡 Major | **Login error is generic** — "Invalid username or password" doesn't help users who forgot which credential is wrong | Error message quality |
| UX-5 | 🟠 Minor | **"Remember me" effect is invisible** — no UI indicator of how long the session lasts | System visibility |
| UX-6 | 🟠 Minor | **No "session active on another device" warning** — multiple sessions allowed silently | Awareness |
| UX-7 | 🟢 Good | Login spinner state is well-implemented ✅ | |
| UX-8 | 🟢 Good | Redirect back to original page after login works ✅ | |
| UX-9 | 🟢 Good | Loading screen during auth check prevents flash of content ✅ | |

---

## 🟡 The Prism — Architecture Review

### Good Decisions ✅
- **Single responsibility**: `AuthContext` handles all auth state, components only consume
- **LENS-17 refresh dedup**: `refreshPromiseRef` prevents thundering herd on 401s
- **Activity logging**: centralized `log_action()` classmethod
- **`fetchWithAuth` wrapper**: transparent token injection and auto-refresh

### Architectural Concerns

| ID | Issue | Recommendation |
|----|-------|---------------|
| ARCH-1 | **No role-based access control layer** — every route has the same protection level. ProtectedRoute is auth-only, not authorization. | Create `RoleGuard` component: `<RoleGuard allowed={['owner','manager']}>` |
| ARCH-2 | **Token storage is coupled to localStorage** — no abstraction layer. Moving to httpOnly cookies requires rewriting AuthContext | Extract `TokenStorage` interface (save/load/clear) that can swap localStorage for cookies |
| ARCH-3 | **No proactive token refresh** — tokens only refresh on 401 (reactive). This means the first request after 60 min always fails → retry | Add a `setInterval` that refreshes access token at `lifetime - 5 min` (proactive) |
| ARCH-4 | **User state is duplicated** — stored in both `useState` AND `localStorage`. These can drift if another tab logs out. | Use `window.addEventListener('storage')` to sync across tabs |
| ARCH-5 | **Backend login view does too much** — authentication, token generation, remember-me, IP tracking, activity logging, profile serialization all in one 40-line method | Extract into `AuthService` class with `authenticate()`, `generate_tokens()`, `log_login()` |

---

## 🟣 The Scalpel — Code Review

### Bugs

| ID | Severity | Bug | Location |
|----|----------|-----|----------|
| BUG-1 | 🔴 Critical | **`JSON.parse(storedUser)` will crash on corruption** — no try/catch | [AuthContext.jsx:22](file:///z:/books2/frontend/src/context/AuthContext.jsx#L22) |
| BUG-2 | 🟡 Major | **Logout API call uses `token` from React state** — but if token is already expired, the Authorization header sends an expired token, causing the blacklist call to fail with 401 | [AuthContext.jsx:63-71](file:///z:/books2/frontend/src/context/AuthContext.jsx#L63-L71) |
| BUG-3 | 🟡 Major | **`LoginSerializer.password` has `max_length=128`** but Django's default hasher accepts longer, could silently truncate | [serializers.py:41](file:///z:/books2/account/serializers.py#L41) |
| BUG-4 | 🟠 Minor | **`ActivityLogSerializer.read_only_fields = ['__all__']`** — this is NOT valid DRF syntax. It should be `fields = '__all__'` + `read_only_fields` as a list of actual field names | [serializers.py:75](file:///z:/books2/account/serializers.py#L75) |
| BUG-5 | 🟠 Minor | **`user_agent` truncated at 255 chars** silently — modern browsers can have longer UA strings | [models.py:112](file:///z:/books2/account/models.py#L112) |

### Code Smells

| ID | Smell | Location |
|----|-------|----------|
| SMELL-1 | **Hardcoded API base URL** — `const API_BASE = 'http://localhost:8000/api'` — should use env variable | [AuthContext.jsx:5](file:///z:/books2/frontend/src/context/AuthContext.jsx#L5) |
| SMELL-2 | **Two different content-type defaults** — `fetchWithAuth` sets `application/json` default, but callers also set it manually (redundant) | [AuthContext.jsx:95](file:///z:/books2/frontend/src/context/AuthContext.jsx#L95) |
| SMELL-3 | **Logout `catch` swallows ALL errors** — even network errors that mean the blacklist didn't happen | [views.py:120-121](file:///z:/books2/account/views.py#L120-L121) |

---

## 🟠 The Shopkeeper — Usability Report

### User Journey Test: "I open the app Monday morning"

| Step | Experience | Frustration |
|------|-----------|-------------|
| 1. Open app | If last login was Friday → 401 → abrupt redirect to /login. No message explaining why. | 😤 "What happened? Did it crash?" |
| 2. Login | Type credentials, click Sign In. Spinner shows. Redirects to dashboard. | 😌 Fine |
| 3. Work for 2 hours | Everything works. | ✅ |
| 4. Leave for lunch (90 min) | Come back, click "Save" on an order → 401 → token refreshes silently → retry succeeds | 😌 Seamless (if refresh token alive) |
| 5. Leave for weekend | Come back Monday → refresh token expired → forced logout | 😤 Unsaved work lost |

### Frustration Points

| Points | Issue | Impact |
|--------|-------|--------|
| ⭐⭐⭐ | **No session timeout warning** — I could be mid-order, walk away, come back, click Save, and all my data is gone with an abrupt redirect | Data loss |
| ⭐⭐ | **Can't see who I'm logged in as on the login page** — if someone else used this computer | Identity confusion |
| ⭐⭐ | **"Demo: admin / admin" feels unprofessional** — even if internal-only | Trust erosion |
| ⭐ | **No "Log out all other sessions" ability** | Security concern |

### Shopkeeper's Verdict: **7.2/10**
> "Login works. Logout works. But the silent expiry is a ticking time bomb. The first time I lose an unsaved order because I went to get chai, I'm filing a complaint."

---

## 📋 Prioritized Action Items

### 🔴 P0 — Fix Immediately
1. **SEC-2**: Remove "Demo: admin / admin" from Login.jsx (or env-gate it)
2. **BUG-1**: Wrap `JSON.parse(storedUser)` in try/catch
3. **SEC-3**: Add throttle to login endpoint (`rest_framework.throttling.AnonRateThrottle`)
4. **SEC-5**: Invalidate tokens on password change (`RefreshToken.for_user(user).blacklist()` existing tokens)

### 🟡 P1 — Next Sprint
5. **ARCH-3**: Proactive token refresh (setInterval at T-5min)
6. **UX-1**: Session expiry warning modal ("Your session expires in 5 minutes")
7. **ARCH-1**: Add role-based route guards
8. **SEC-8**: Reduce remember-me access token from 7 days → 4 hours
9. **SEC-10**: Add MIME-type validation on profile picture upload
10. **BUG-2**: Logout should try refresh-then-blacklist if token expired

### 🟢 P2 — Backlog
11. **ARCH-4**: Multi-tab sync via `storage` event listener
12. **ARCH-2**: Abstract token storage (prep for httpOnly cookies)
13. **UX-2**: Add "Forgot Password" flow
14. **SEC-4**: Account lockout after N failed attempts
15. **SMELL-1**: Move API base URL to env variable
