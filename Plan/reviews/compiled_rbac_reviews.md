# Comprehensive Sub-Agent RBAC Reviews



---
## REVIEW BY: ACCOUNTANT


<ACCOUNTANT_VERDICT status="UNBALANCED">
  <RECONCILIATION_NOTES>
      * Missing Audit Loop: The RBAC matrix dictates *who* can manage roles (`settings.manage_roles`). However, no system is designed without an immutable audit trail for privilege escalation. 
      * Chronological Discrepancy: If User A (Manager) grants User B (Cashier) the `finance.pay_expenses` permission, User B pays themselves, and User A immediately revokes the permission, the standard Django history will not cleanly capture this event mapping.
      * The matrix does not account for a segregation of duties inside the settings app (e.g., Maker-Checker flow for changing financial permissions).
  </RECONCILIATION_NOTES>
  <FINAL_OUTPUT>
      [MANDATORY_ARCHITECTURE_UPDATE]
      You must introduce an `AuditLog` wrapper specifically for the `RolePermission` and `UserRole` endpoints. 
      ```python
      # The ledger must track the exact timestamp, admin_id, and delta of all permission changes.
      class RoleAuditLog(models.Model):
          action = models.CharField(choices=[('GRANT', 'GRANT'), ('REVOKE', 'REVOKE')])
          target_user = models.ForeignKey(User, on_delete=models.CASCADE)
          permission_code = models.CharField(max_length=100)
          executed_by = models.ForeignKey(User, related_name='rbac_audits')
          timestamp = models.DateTimeField(auto_now_add=True)
      ```
      This guarantees financial and security audits can reconcile *why* an unauthorized user was briefly authorized.
  </FINAL_OUTPUT>
</ACCOUNTANT_VERDICT>

---
## REVIEW BY: THE CHAOS ARCHITECT


<VULNERABILITY_REPORT>

[EXPLOIT_VECTOR]: IDOR Privilege Escalation via Missing ViewSet Constraints
[IMPACT_LEVEL]: CRITICAL (Root/Admin Takeover)
[PROOF_OF_CONCEPT]:
The `HasRequiredPermission` class evaluates `getattr(view, 'required_permission', None)`. 
If a developer creates the `SettingsViewSet` but forgets to assign the `required_permission = 'settings.manage_roles'` attribute, the code falls back to:
```python
if not required_permission:
    return True # Open to all authenticated users if no requirement exists
```
This fails-open. A low-level cashier authenticates, sends a POST request to `/api/settings/user-roles/`, and modifies their own `user_id` to include the `admin` role. Total system compromise in a single cURL request.
**Fix: Fail-Closed Design.** If `required_permission` is missing, return `False` and throw a 500 error in development so developers are forced to define the permission boundary.

[EXPLOIT_VECTOR]: Token Replay & Stale Claims
[IMPACT_LEVEL]: HIGH
[PROOF_OF_CONCEPT]:
If a malicious user expects their employee privileges to be revoked, they simply log in, retrieve their JWT containing the `permissions` payload, and disconnect. The frontend uses the JWT claims. No backend token blocklist is mentioned. If the JWT expiration is long (e.g., 7 days), they retain local access to the UI endpoints until the token expires, potentially executing cached destructive actions.

[EXPLOIT_VECTOR]: Horizontal Privilege Escalation in `settings.manage_users`
[IMPACT_LEVEL]: HIGH
[PROOF_OF_CONCEPT]:
An Admin creates a "Junior IT" role with `settings.manage_users` so they can reset passwords. The Junior IT user can escalate themselves horizontally by editing their own role record or creating a new Admin account, because `HasRequiredPermission` does not restrict *who* can be edited by *whom*. 

</VULNERABILITY_REPORT>

---
## REVIEW BY: THE IRONCLAD


<QA_FAILURES>
[TC-RBAC-001] | [SEVERITY: ABSOLUTE] | [Role Unassignment Edge Case] | [Expected: 403 Forbidden]
Failure Condition: The `HasRequiredPermission` logic relies on `request.user.user_roles.exists()`. If an administrator revokes a user's *only* role, the query returns False, which is handled correctly. However, if the underlying `Role` object itself is deleted directly in the database (bypassing the ORM's `is_system` check), the `user_role_assignment.first().role` will throw a `RelatedObjectDoesNotExist` 500 Fatal Exception instead of a clean 403 Forbidden.

[TC-RBAC-002] | [SEVERITY: ABSOLUTE] | [Regex/Wildcard Permission Overflow] | [Expected: Explicit Exact Match]
Failure Condition: The proposed backend logic checks `permission__codename=required_permission`. If the system later introduces hierarchical permissions (e.g., `finance.*`), the `.filter()` explicitly looks for an exact string match. A super-manager granted `finance.*` will be denied `finance.approve_expenses` because the exact literal string does not exist in their M2M map.

[TC-RBAC-003] | [SEVERITY: ABSOLUTE] | [Empty String Evaluates False] | [Expected: State Consistency]
Failure Condition: The documentation states `if not required_permission: return True`. In Python, an empty string `""` evaluates to False. If a developer accidentally types `required_permission = ""` instead of `None`, the ViewSet will silently fail-open and allow all traffic, bypassing all security.
</QA_FAILURES>

---
## REVIEW BY: THE LENS


<UX_AUDIT_REPORT>
## Heuristic Assessment: Role Management Architecture

| Severity | Heuristic Violated | Observation | Mandatory Fix |
| :--- | :--- | :--- | :--- |
| **Major** | Visibility of System Status | The `usePermissions` hook proposes entirely hiding UI elements: `{hasPermission('finance.approve') && <Button>Approve</Button>}`. This results in unpredictable UI layouts (jumping UI) and leaves users confused as to why they can't perform an action their peer can. | Do not completely remove the element from the DOM unless it is an entire page link. For actions, render the button in a `disabled` state with a padlock icon and a tooltip indicating the required permission. |
| **Minor** | Flexibility and Efficiency of Use | "Massive checklist UI grouping permissions in collapsible accordions." A dense matrix of 100+ checkboxes across 6 accordions forces massive scroll fatigue and cognitive overload on Administrators trying to configure roles. | Implement a search filter above the checkboxes ("Find permission..."). Add "Select All / Deselect All in Category" macro-toggles. |
| **Critical**| Error Prevention | The matrix does not explicitly mention warning the user when modifying a "System Default" role. Given that core apps expect `cashier` to behave safely, allowing massive edits to defaults without a catastrophic warning is a mistake. | The UI must display a red warning banner `role.is_system && "Warning: Modifying system-critical roles can lock users out of core functionality."` |

### CSS/Component Implementation Fix:
```javascript
// UI Fix for Visibility of System Status
function GuardedAction({ permissionCode, children }) {
    const { hasPermission } = usePermissions();
    if (!hasPermission(permissionCode)) {
        return (
            <Tooltip content="You lack the required security clearance for this action.">
                <div style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                    {React.cloneElement(children, { disabled: true })}
                </div>
            </Tooltip>
        );
    }
    return children;
}
```
</UX_AUDIT_REPORT>

---
## REVIEW BY: THE PRISM


<ARCHITECTURE_PROPOSAL>
# First Principles Deconstruction
The proposed React architecture requires fetching `/api/settings/users/me/` on initialization to retrieve the `permissions: []` array. This adds a critical rendering blocker to the application's Very First Paint (VFP). If the network is slow, the entire UI is trapped in a loading state just to figure out what buttons to draw. 

# Negative Code Opportunities
Delete the `/api/settings/users/me/` network request on initialization entirely.
Since the application already relies on Django REST Framework JWTs (SimpleJWT) for authentication, the user's role and permission codenames should be injected directly into the JWT payload during token generation (`TokenObtainPairView`). 

# The Walking Skeleton Implementation
```python
# settings_app/serializers.py
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Inject custom claims
        token['username'] = user.username
        role_map = getattr(user, 'user_roles', None)
        if role_map and role_map.exists():
            role = role_map.first().role
            token['role'] = role.name
            token['permissions'] = list(role.role_permissions.values_list('permission__codename', flat=True))
        return token
```
By placing this in the JWT, the React frontend can instantly decode the token via `jwt-decode` on load. Zero network latency. Zero rendering delay. Pragmatic, negative coding.
</ARCHITECTURE_PROPOSAL>

---
## REVIEW BY: THE QA STRATEGIST


# QA Strategy & Test Coverage: RBAC System

## 1. Scope & Test Objectives
**Objective:** Validate that the granular Custom DRF `HasRequiredPermission` class and the React `usePermissions` hook accurately enforce the Matrix (`roles_and_permissions_matrix.md`), preventing unauthorized transactions while maintaining system usability.

## 2. Risk-Based Coverage Matrix

| Scenario | Condition | Expected Result | Priority |
| :--- | :--- | :--- | :--- |
| **Auth-01** | Unauthenticated user hits `required_permission` endpoint | 401 Unauthorized | Critical |
| **Auth-02** | Authenticated Cashier hits `finance.approve_expenses` endpoint | 403 Forbidden | Critical |
| **Auth-03** | Authenticated Manager hits `finance.approve_expenses` (Not Own) | 200 OK / Success | Critical |
| **Auth-04** | Authenticated Manager hits `finance.approve_expenses` (Is Own) | 403 Forbidden (Business Logic Guard overrides RBAC) | Critical |
| **Auth-05** | Superuser hits an endpoint without an assigned `Role` | 200 OK (`is_superuser` bypass) | High |

## 3. Boundary & Negative Test Scenarios
*   **Role Deletion Simulation:** Attempt to soft-delete a role while 5 active users currently possess that JWT. Verify token blacklist behavior or backend rejection of the stale token.
*   **Matrix Boundary - Self Escapement:** An Admin edits the `Admin` role to remove `settings.manage_roles`. Verify the system blocks them from saving this, which would permanently brick the system (No one could ever edit roles again).

## 4. Automation Recommendations (Cypress/Playwright)
The UI `disabled` button guards must be tested using automated DOM interaction:
1.  Login as Cashier.
2.  Assert `[data-testid="btn-delete-product"]` has attribute `disabled=true`.
3.  Attempt forced DOM removal of `disabled` flag and click.
4.  Assert API responds with 403 Forbidden.

---
## REVIEW BY: THE SCALPEL


<CODE_REVIEW>
[roles_and_permissions_matrix.md:L71] | [SEVERITY: FATAL] | [Multiple Role Assignment Condition] | [Spurious 403 Rejection Guarantee]
Observation: The architectural document `role_management_architecture.md` proposes fetching the user's role using `user_role_assignment.first().role`. 
Code context:
```python
user_role_assignment = getattr(request.user, 'user_roles', None)
role = user_role_assignment.first().role
```
This is a terrifying code smell. The `UserRole` model explicitly allows a user to have multiple roles. Using `.first()` guarantees unpredictable behavior depending on database sorting order. If a user is promoted to `Manager` but retains the `Cashier` role, and the query returns `Cashier` first, they will be instantly blocked from Manager-level endpoints.
```python
# FIX
roles = Role.objects.filter(role_users__user=request.user)
return RolePermission.objects.filter(role__in=roles, permission__codename=required_permission).exists()
```
[VERDICT: âŒ REJECTED]
</CODE_REVIEW>

<CODE_REVIEW>
[role_management_architecture.md:L38] | [SEVERITY: BUG] | [Frontend Context Desync] | [Stale Permission Guarantee]
Observation: The React `AuthContext` fetches permissions upon login (`/api/settings/users/me/`). If an admin changes a user's role while they have an active JWT session, the frontend will blindly allow/hide UI components based on stale data until the token expires or the user manually refreshes. This creates a state mismatch where the UI allows the click, but the backend rejects it.
```javascript
// FIX Context polling or Websocket invalidation
// Minimally, catch 403s in the Axios interceptor and force a permission re-fetch:
axiosInstance.interceptors.response.use(res => res, async (error) => {
   if (error.response.status === 403) {
       await fetchUserPermissions(); // Sync with backend reality
   }
   return Promise.reject(error);
});
```
[VERDICT: âŒ REJECTED]
</CODE_REVIEW>

---
## REVIEW BY: THE SHOPKEEPER


<USER_TEST_REPORT>
[ACTION_ATTEMPTED: Logging in with slow internet] -> [RESULT_EXPERIENCED: Blank screen while `AuthContext` waits for permissions to download] -> [FRUSTRATION_LEVEL: 10] -> [SHOPKEEPER_QUOTE: "Why is the screen white? I have customers waiting to buy a book and the billing screen isn't opening!"]

[ACTION_ATTEMPTED: Cashier trying to bill a customer while internet is offline] -> [RESULT_EXPERIENCED: Because the RBAC hook relies on an API fetch, the PWA offline mode fails to authorize the Cashier to open the draft order screen.] -> [FRUSTRATION_LEVEL: 9] -> [SHOPKEEPER_QUOTE: "You specifically promised me this system works offline! Now it's saying 'Access Denied' because it can't check my permissions without Wi-Fi!"]

[ACTION_ATTEMPTED: Admin giving permissions to 5 cashiers] -> [RESULT_EXPERIENCED: Admin has to open 5 different profiles and click 12 different accordions and 40 checkboxes per person.] -> [FRUSTRATION_LEVEL: 8] -> [SHOPKEEPER_QUOTE: "This is a nightmare. Can't I just say 'Make Rahul have the exact same screens as Amit'?"]
[ABANDONED_TASK]
</USER_TEST_REPORT>

---
## REVIEW BY: THE STORE MANAGER


<STORE_MANAGER_REVIEW>
[WORKFLOW_SCENARIO: First week of June, peak admission season. A cashier is billing 400 parents a day.] -> [CURRENT_PAIN_POINT: The matrix strictly denies `cashier` the `inventory.create_products` and `settings.tax_config` permissions. But sometimes a publisher drops off standard notebooks with no barcode in the middle of a rush. Cashiers need to quickly ring it up using an "Open Item" or "Custom Amount" product.] -> [PROPOSED_SOLUTION_RATING: 2] -> [MISSING_CAPABILITY: The rigid RBAC model ignores the reality of retail overrides. There is no concept of a "Manager Override PIN" for a single transaction.]

[WORKFLOW_SCENARIO: Onboarding a new customer from a brand-new school.] -> [CURRENT_PAIN_POINT: The cashier has `customers.create_customers`, but to add a new school, they need `customers.manage_tags` (Wait, the Matrix denies Cashiers tag management). The cashier asks the parent to wait, runs to track me (Rajesh) down, I log in, add the School to the database, log out, and then she creates the customer.] -> [PROPOSED_SOLUTION_RATING: 1] -> [MISSING_CAPABILITY: Granular permissions look clean on paper but destroy retail speed. Cashiers must be able to create taxonomy data (Schools/Divisions) *inline* during customer creation without needing global taxonomy management permissions.]

[SEASON_READINESS_VERDICT]
FAILED. The permissions matrix is heavily designed for a corporate office, not a high-velocity retail counter. We need either a "Manager Override PIN" feature built into the UI, or specific "Inline Creation" exceptions for cashiers.
</STORE_MANAGER_REVIEW>
