<QA_FAILURES>
[TC-RBAC-001] | [SEVERITY: ABSOLUTE] | [Role Unassignment Edge Case] | [Expected: 403 Forbidden]
Failure Condition: The `HasRequiredPermission` logic relies on `request.user.user_roles.exists()`. If an administrator revokes a user's *only* role, the query returns False, which is handled correctly. However, if the underlying `Role` object itself is deleted directly in the database (bypassing the ORM's `is_system` check), the `user_role_assignment.first().role` will throw a `RelatedObjectDoesNotExist` 500 Fatal Exception instead of a clean 403 Forbidden.

[TC-RBAC-002] | [SEVERITY: ABSOLUTE] | [Regex/Wildcard Permission Overflow] | [Expected: Explicit Exact Match]
Failure Condition: The proposed backend logic checks `permission__codename=required_permission`. If the system later introduces hierarchical permissions (e.g., `finance.*`), the `.filter()` explicitly looks for an exact string match. A super-manager granted `finance.*` will be denied `finance.approve_expenses` because the exact literal string does not exist in their M2M map.

[TC-RBAC-003] | [SEVERITY: ABSOLUTE] | [Empty String Evaluates False] | [Expected: State Consistency]
Failure Condition: The documentation states `if not required_permission: return True`. In Python, an empty string `""` evaluates to False. If a developer accidentally types `required_permission = ""` instead of `None`, the ViewSet will silently fail-open and allow all traffic, bypassing all security.
</QA_FAILURES>
