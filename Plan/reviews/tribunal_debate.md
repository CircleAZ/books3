# The Tribunal: Chaos Architect × Ironclad × Prism

A structured, multi-round debate between three specialist sub-agents to resolve all issues raised in the compiled RBAC reviews. Each agent argues from their core philosophy, and a **CONSENSUS** is reached at the end of each topic.

---

## TOPIC 1: Fail-Open vs Fail-Closed Permission Default

> **Issue**: Chaos Architect found that if a developer forgets `required_permission` on a ViewSet, the system silently allows all authenticated traffic. Ironclad added that `required_permission = ""` (empty string) also evaluates to falsy, creating the same hole.

**🔴 CHAOS ARCHITECT:**
This is non-negotiable. We fail-closed. If `required_permission` is `None`, `""`, or missing entirely, the permission class returns `False`. Period. In DEBUG mode, we additionally raise a loud `ImproperlyConfigured` exception so the developer sees it immediately during local testing. In production, we return 403 and log a `CRITICAL` to Sentry/Django logging. No endpoint ships unprotected.

**🔵 IRONCLAD:**
Agreed on fail-closed. But I want explicit type validation. The check must not be `if not required_permission` — that's the exact Python truthiness trap I flagged. It must be:
```python
if required_permission is None or required_permission == "":
    logger.critical(f"SECURITY: {view.__class__.__name__} has no required_permission!")
    return False
```
Two explicit checks. No implicit Python casting. No ambiguity.

**🟢 PRISM:**
Agreed. But let's go further with Negative Coding. Instead of relying on developers remembering to add `required_permission` to every ViewSet, we make it structurally impossible to forget. Create a `SecuredModelViewSet` base class that raises `NotImplementedError` if `required_permission` is not overridden. Every ViewSet in the project inherits from this instead of `ModelViewSet`. The bug becomes a compile-time error, not a runtime vulnerability.

### ✅ CONSENSUS 1:
1. Create `SecuredModelViewSet(viewsets.ModelViewSet)` that raises `NotImplementedError` if `required_permission` is not defined.
2. Inside `HasRequiredPermission`, use explicit `is None or == ""` checks (no truthiness).
3. Return `False` in production, raise `ImproperlyConfigured` in DEBUG.

---

## TOPIC 2: Multi-Role Aggregation (`.first()` Bug)

> **Issue**: Scalpel found that `.first()` arbitrarily picks one role, blocking multi-role users from accessing permissions granted by their secondary role.

**🟢 PRISM:**
Scalpel's fix is correct and minimal:
```python
roles = Role.objects.filter(role_users__user=request.user)
return RolePermission.objects.filter(role__in=roles, permission__codename=required_permission).exists()
```
Two queries, clean aggregation. No `.first()`, no ambiguity.

**🔵 IRONCLAD:**
I accept the logic, but I want an edge case handled: What if the `Role` object itself has been hard-deleted from the database while the `UserRole` FK still exists? The `.filter()` approach handles this gracefully because it simply returns an empty queryset — no `RelatedObjectDoesNotExist` exception. This is a significant improvement over `.first().role`.

**🔴 CHAOS ARCHITECT:**
Accepted. But I want the query wrapped in a `try/except` regardless, because database corruption is not theoretical. Also, add `.select_related()` for performance so we're not firing N+1 queries on every single API hit.

### ✅ CONSENSUS 2:
1. Use `Role.objects.filter(role_users__user=request.user)` — aggregates all roles.
2. Wrap in `try/except` for database-level resilience.
3. Use `.select_related('permission')` on `RolePermission` to optimize query count.

---

## TOPIC 3: JWT vs API Fetch for Frontend Permissions

> **Issue**: Prism proposed injecting permissions into JWT. Shopkeeper complained about blank screens on slow networks. Scalpel warned about stale frontend state after role revocation.

**🟢 PRISM:**
I stand by JWT injection. The login endpoint already returns a token. Inject `permissions[]` into the payload. Frontend decodes it synchronously with `jwt-decode`. Zero network dependency. Offline-capable. Done.

**🔴 CHAOS ARCHITECT:**
I have a problem. If you put permissions in the JWT, and an admin revokes a user's role, the JWT still contains the old permissions until it expires. The user retains *apparent* access. How long are your tokens?

**🟢 PRISM:**
That's the token lifetime question, not a JWT architecture question. Keep Access Tokens short.

**🔵 IRONCLAD:**
Exactly. Here is the precise configuration:
- **Access Token**: 5 minutes. After 5 min, the frontend must silently refresh.
- **Refresh Token**: 24 hours. On each refresh, the backend re-evaluates the user's *current* roles, generates a *new* JWT with *fresh* permissions, and blocklists the old Refresh Token.
- **Result**: Maximum privilege staleness = 5 minutes. Acceptable for a retail POS. Not acceptable for a nuclear facility, but we are selling books.

**🔴 CHAOS ARCHITECT:**
5 minutes is acceptable if we also add Scalpel's Axios 403 interceptor on the frontend. If the backend rejects a request mid-session, the frontend immediately triggers a silent token refresh, pulling fresh permissions. This closes the 5-minute gap to near-zero for active users.

### ✅ CONSENSUS 3:
1. Inject `role` + `permissions[]` into JWT via custom `TokenObtainPairSerializer`.
2. Access Token lifetime = 5 minutes. Refresh Token = 24 hours, rotating + blocklisted.
3. Frontend decodes JWT synchronously via `jwt-decode`. No `/api/users/me/` fetch.
4. Axios 403 interceptor forces immediate silent token refresh on rejection.

---

## TOPIC 4: Manager Override for Cashier-Restricted Actions

> **Issue**: Store Manager demanded a way for cashiers to perform restricted actions (ring up a custom item, add a new school) without logging out. The previous plan proposed a 4-digit PIN, which Chaos Architect destroyed.

**🔴 CHAOS ARCHITECT:**
No PINs. 10,000 combinations is brute-forceable in seconds. The override mechanism must use full authentication credentials — the manager's actual username and password — piped through `django.contrib.auth.authenticate()`. This gives us Django's built-in password hashing, account lockout (via django-axes or similar), and zero new attack surface.

**🟢 PRISM:**
Agreed. Negative Coding: delete the `manager_pos_pin` DB column before it's even created. The override endpoint takes `{manager_username, manager_password, action_payload, required_permission_code}`. It authenticates the manager, verifies `is_active=True`, verifies the manager's role has the required permission, executes the payload, and returns 200.

**🔵 IRONCLAD:**
I need three additional guards:
1. The manager account used for override must have `is_active=True` AND must not be soft-deleted.
2. The override must be rate-limited (e.g., 10 overrides per minute) to prevent abuse.
3. Every override must be logged to the `RoleAuditLog` with `action='MANAGER_OVERRIDE'`, including the cashier's ID, manager's ID, permission overridden, and the exact payload.

### ✅ CONSENSUS 4:
1. No PIN. Use `authenticate(username, password)` with the manager's real credentials.
2. Verify `is_active=True` + not soft-deleted + role has the required permission.
3. Rate-limit: 10 overrides/minute/cashier.
4. Log every override to `RoleAuditLog`.

---

## TOPIC 5: Horizontal Privilege Escalation (`settings.manage_users`)

> **Issue**: Chaos Architect found that a "Junior IT" user with `settings.manage_users` could edit their own role or create a new Admin account.

**🔴 CHAOS ARCHITECT:**
`settings.manage_users` and `settings.manage_roles` must be treated as separate, nuclear-grade permissions. `manage_users` allows password resets & profile edits. `manage_roles` allows role assignment changes. A "Junior IT" gets `manage_users` only. But even then, we need object-level checks:
1. A user CANNOT edit their own role assignment.
2. A user CANNOT assign a role that has MORE permissions than their own role possesses.

**🟢 PRISM:**
Simpler: split the permissions into three:
- `settings.manage_users` — Edit profiles, reset passwords.
- `settings.assign_roles` — Change which role a user has (but not edit what roles contain).
- `settings.manage_roles` — Edit what permissions a role contains (Admin only).

Three permissions instead of trying to build complex object-level field restrictions.

**🔵 IRONCLAD:**
Both. Split the permissions AND add the self-edit guard. Belt and suspenders.

### ✅ CONSENSUS 5:
1. Split into 3 permissions: `settings.manage_users`, `settings.assign_roles`, `settings.manage_roles`.
2. Backend guard: users cannot modify their own role assignment.
3. Backend guard: users cannot assign a role with higher privilege than their own.

---

## TOPIC 6: Audit Trail for Privilege Changes

> **Issue**: The Accountant identified zero audit logging for RBAC mutations.

**🔴 CHAOS ARCHITECT:**
Non-negotiable. Every `GRANT`, `REVOKE`, and `MANAGER_OVERRIDE` must be immutable. The audit log must not be deletable by anyone, including the Admin, through the UI. Only a superuser with direct database access can purge it.

**🟢 PRISM:**
Agreed. Minimal schema:
```python
class RoleAuditLog(models.Model):
    ACTION_CHOICES = [('GRANT', 'Grant'), ('REVOKE', 'Revoke'), ('OVERRIDE', 'Manager Override')]
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    target_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    permission_code = models.CharField(max_length=100)
    executed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='executed_audits')
    timestamp = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(default=dict, blank=True)  # For override payloads
```
Note: `on_delete=models.SET_NULL` — even if the users are deleted, the audit row persists with a null FK. The record is never lost.

**🔵 IRONCLAD:**
Add `ip_address` and `user_agent` to the log for forensic tracing.

### ✅ CONSENSUS 6:
1. Create `RoleAuditLog` with `SET_NULL` on FKs (records persist after user deletion).
2. Log: `action`, `target_user`, `permission_code`, `executed_by`, `timestamp`, `ip_address`, `user_agent`, `metadata` (JSON).
3. No UI delete capability. Read-only for Admin, invisible to all others.

---

## TOPIC 7: UX — Guarded Actions & Disabled Buttons

> **Issue**: Lens said hiding buttons causes jumping UI. Shopkeeper said offline mode breaks authorization.

**🟢 PRISM:**
This is solved by Consensus 3 (JWT decode). Permissions are available synchronously, even offline. For the UI, Lens's `<GuardedAction>` component is elegant and correct: render disabled + tooltip, never hide.

**🔵 IRONCLAD:**
The disabled button must never be the *only* security layer. Even if a user hacks the DOM and removes `disabled`, the backend must still reject the request with 403. This is already guaranteed by `HasRequiredPermission`.

**🔴 CHAOS ARCHITECT:**
Agreed. Frontend guards are cosmetic. Backend guards are law. Both must exist independently.

### ✅ CONSENSUS 7:
1. `<GuardedAction>` renders `disabled` + padlock icon + tooltip. Never hides elements.
2. Backend `HasRequiredPermission` is the actual enforcement. Frontend is just UX polish.
3. Offline mode works because permissions come from the JWT, not a network call.

---

## TOPIC 8: Cashier Inline Taxonomy Creation

> **Issue**: Store Manager found that cashiers can't add a new School during customer creation because they lack `customers.manage_tags`.

**🟢 PRISM:**
Create a micro-permission: `customers.inline_create_taxonomy`. This allows creating new Schools/Classes/Divisions *only through* the inline popup during customer creation. It does NOT grant access to the full Manage Schools/Classes settings page.

**🔴 CHAOS ARCHITECT:**
Acceptable, but the backend endpoint for inline creation must be separate from the bulk management endpoint. Different URL, different ViewSet, different permission.

**🔵 IRONCLAD:**
Agreed. `/api/customers/inline-school/` with `required_permission = 'customers.inline_create_taxonomy'` is isolated from `/api/settings/schools/` with `required_permission = 'customers.manage_tags'`.

### ✅ CONSENSUS 8:
1. New permission: `customers.inline_create_taxonomy` — granted to Cashiers by default.
2. Separate API endpoint (`/api/customers/inline-school/`) from the bulk settings endpoint.
3. Cashiers can create taxonomy inline during customer creation, but cannot access the full settings page.

---

## TOPIC 9: Admin Self-Brick Prevention

> **Issue**: QA Strategist identified that an Admin could strip `settings.manage_roles` from the Admin role, permanently bricking the system.

**🔵 IRONCLAD:**
The backend must enforce an invariant: the `Admin` system role (`is_system=True, name='Admin'`) must ALWAYS possess `settings.manage_roles`. Any attempt to revoke this specific permission from this specific role returns 400 Bad Request with a clear error message.

**🔴 CHAOS ARCHITECT:**
Expand this. Create a `PROTECTED_PERMISSIONS` constant — a list of `(role_name, permission_code)` tuples that can never be revoked. Hardcoded in Django settings.

**🟢 PRISM:**
Clean and correct. Minimal code:
```python
PROTECTED_PERMISSIONS = [
    ('Admin', 'settings.manage_roles'),
    ('Admin', 'settings.manage_users'),
]
```
Check this list in the `RolePermission` delete/update logic. If a match is found, reject.

### ✅ CONSENSUS 9:
1. Define `PROTECTED_PERMISSIONS` in Django settings.
2. Backend blocks any attempt to revoke these specific role-permission pairs.
3. Frontend disables the checkbox for protected permissions with an explanation tooltip.

---

## TOPIC 10: Role Editor UX

> **Issue**: Shopkeeper found that assigning permissions to 5 cashiers requires 200+ clicks. Lens demanded search filters.

**🟢 PRISM:**
Three features:
1. **Clone Role**: "Create new role from existing" — copies all permissions to a new role.
2. **Bulk User Assignment**: Select multiple users → assign a role in one action.
3. **Permission Search**: Text filter above the checkbox matrix.

**🔵 IRONCLAD:**
Add "Select All / Deselect All" per category.

**🔴 CHAOS ARCHITECT:**
Add the system role warning banner (Lens's suggestion). Red banner for `is_system=True`.

### ✅ CONSENSUS 10:
1. Clone Role, Bulk User Assignment, Permission Search filter.
2. "Select All / Deselect All" per permission category.
3. Red warning banner for system roles.
