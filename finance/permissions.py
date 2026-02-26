from rest_framework import permissions

class FinancePermission(permissions.BasePermission):
    """
    Custom permission for Finance module.
    Only Admin, Manager, and Accountant roles can access.
    """
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
            
        # 1. Staff can always access (Admin)
        if request.user.is_staff:
            return True
            
        # 2. Check for Role-based access
        # Assuming user.role is a ForeignKey to Role model in settings_app
        # This requires the User model to have 'role' attribute pre-fetched or accessible
        if hasattr(request.user, 'role') and request.user.role:
            allowed_roles = ['Admin', 'Manager', 'Accountant', 'Store Manager']
            return request.user.role.name in allowed_roles
            
        return False
