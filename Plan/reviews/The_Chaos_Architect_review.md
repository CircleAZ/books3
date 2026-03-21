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
