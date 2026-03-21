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
[VERDICT: ❌ REJECTED]
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
[VERDICT: ❌ REJECTED]
</CODE_REVIEW>
