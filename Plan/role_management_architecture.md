# AZ Books: Role Management System Architecture

This document details the architecture for the Role-Based Access Control (RBAC) system for the AZ Books ERP platform. It is based on an analysis of the existing codebase (`settings_app/models.py`, `finance/permissions.py`) and the comprehensive project requirements defined in `P4.md`.

---

## 1. Current State Assessment

A foundational RBAC data schema already exists in the project backend via the core `settings_app`:

### Existing Database Entities (`settings_app/models.py`)
1.  **`Role` Model**: Defines user roles (e.g., `Admin`, `Manager`, `Cashier`). Includes fields `name`, `description`, `is_default`, `is_system`.
2.  **`Permission` Model**: Defines granular permissions categorized by app. Includes `codename` (e.g., `finance.view_dashboard`), `name`, and `category` (Choices: `inventory`, `customers`, `orders`, `reports`, `settings`, `finance`).
3.  **`RolePermission` (M2M)**: Maps which Roles possess which specific Permissions.
4.  **`UserRole`**: Associates Django's `AUTH_USER_MODEL` with a `Role`.

### Existing Backend Authorization (`finance/permissions.py`)
There is currently a hardcoded `FinancePermission` class that authorizes requests based purely on the `Role.name` property mapping (e.g., `if request.user.role.name in ['Admin', 'Manager', 'Accountant']`).

**Critical Limitation**: This approach is rigid. If an Administrator creates a new custom role called "Auditor" via the UI, it will hard fail because "Auditor" is not explicitly listed in the `finance/permissions.py` array. 

---

## 2. Target Backend Architecture: Granular Permissions

To support dynamic custom roles created by administrators through the UI, authorization must shift from checking **Role Names** to checking **Granular Permission Codenames**.

### 2.1 Custom DRF Permission Class
We will implement a `HasRequiredPermission` class in `core/permissions.py` that validates the request against the M2M `RolePermission` table.

```python
from rest_framework import permissions

class HasRequiredPermission(permissions.BasePermission):
    """
    Validates if the user's assigned role contains the specific
    permission code required by the ViewSet.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
            
        # 1. Staff / Superuser Override
        if request.user.is_staff or getattr(request.user, 'is_superuser', False):
            return True
            
        # 2. Get required permission from the ViewSet
        required_permission = getattr(view, 'required_permission', None)
        if not required_permission:
            return True # Open to all authenticated users if no requirement exists
            
        # 3. Check Role assigned to User
        # Requires User model to pre-fetch 'user_roles' or related Role model
        user_role_assignment = getattr(request.user, 'user_roles', None)
        if not user_role_assignment or not user_role_assignment.exists():
            return False
            
        role = user_role_assignment.first().role
        
        # 4. Check if Role owns the specific Permission Code
        return role.role_permissions.filter(permission__codename=required_permission).exists()
```

### 2.2 ViewSet Application Example
Instead of hardcoded roles, the ViewSets will enforce the granular permission codename:

```python
# inventory/views.py
class ProductViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, HasRequiredPermission]
    required_permission = 'inventory.manage_products'
    
    # Optional Custom per-action rules
    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            self.required_permission = 'inventory.view_products'
        return super().get_permissions()
```

---

## 3. Target Frontend Architecture (React/Vite)

The frontend requires two core mechanisms: **Navigation Hiding** (removing restricted buttons/links) blockages, and **Route Protection** (preventing URL access).

### 3.1 Initializing AuthContext
When a user logs in, the `AuthContext` must fetch not just the profile, but the user's `role` and an array of `permission_codenames` from the `/api/settings/users/me/` endpoint.

```javascript
// Data payload required from Backend Auth API
{
  "id": 101,
  "username": "mukun",
  "role": "Cashier",
  "permissions": [
    "orders.create_order",
    "orders.view_own_orders",
    "dashboard.view_dashboard",
    "inventory.search_products"
  ]
}
```

### 3.2 The `usePermissions` Hook
This hook evaluates if the current authenticated user has a specific permission code.

```javascript
import { useAuth } from '../contexts/AuthContext';

export const usePermissions = () => {
    const { user } = useAuth();
    
    // Superusers automatically bypass checks
    const hasPermission = (permissionCode) => {
        if (user?.is_superuser) return true;
        return user?.permissions?.includes(permissionCode) || false;
    };
    
    return { hasPermission };
};
```

### 3.3 UI Component Rendering
Instead of checking "is this user a manager", the UI checks if the user possesses the *action*.

```javascript
// Inside Inventory List Component
import { usePermissions } from '../hooks/usePermissions';

function ProductList() {
    const { hasPermission } = usePermissions();

    return (
        <div>
            {hasPermission('inventory.delete_products') && (
                <button color="red">Delete Product</button>
            )}
            
            {hasPermission('inventory.manage_stock') && (
                <button color="blue">Adjust Stock</button>
            )}
        </div>
    );
}
```

### 3.4 Protected Route Wrapper
The React Router Dom setup should block entire URL paths from being loaded.

```javascript
// ProtectedRoute.jsx
function ProtectedRoute({ children, requiredPermission }) {
    const { user } = useAuth();
    const { hasPermission } = usePermissions();
    
    if (!user) return <Navigate to="/login" />;
    
    if (requiredPermission && !hasPermission(requiredPermission)) {
        return <AccessDenied403 />;
    }
    
    return children;
}

// App.jsx
<Route 
    path="/finance/expenses" 
    element={
        <ProtectedRoute requiredPermission="finance.view_expenses">
            <ExpenseList />
        </ProtectedRoute>
    } 
/>
```

---

## 4. UI: Admin Configuration Dashboard

To unlock the full potential of RBAC, the existing `Settings` > `User Management` UI must be expanded to include a **Roles & Permissions Builder**.

1.  **Roles Grid**: Table displaying Active Roles, number of assigned users, and boolean indicator if it is a default/immutable `is_system` role.
2.  **Role Builder UI**: A comprehensive matrix displaying the 6 permission categories (`Inventory`, `Customers`, `Orders`, `Reports`, `Settings`, `Finance`) in collapsible accordions. Within each accordion, admins can check off explicit Permission Codenames to assign to the Role.
3.  **User Assignment**: Standard UI mapping the `django.contrib.auth.models.User` to the custom `Role`.
