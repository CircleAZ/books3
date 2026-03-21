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
