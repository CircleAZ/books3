"""
Core Permissions for AZ Books RBAC System.
All API authorization flows through this module.

Designed with a FAIL-CLOSED posture:
- Missing `required_permission` on a ViewSet → 403 (prod) / ImproperlyConfigured (debug)
- Multi-role aggregation: checks ALL roles assigned to a user
- Superuser bypass
- Action-level `permission_map` for read/write permission splits

Usage:
    # Single permission for all actions:
    permission_classes = [HasRequiredPermission]
    required_permission = 'finance.manage_expenses'

    # Action-level permissions (read/write split):
    permission_classes = [HasRequiredPermission]
    required_permission = 'inventory.manage_products'  # default fallback
    permission_map = {
        'list': 'inventory.view_products',
        'retrieve': 'inventory.view_products',
        'create': 'inventory.manage_products',
        'approve': None,  # None = any authenticated user
    }
"""

import logging
from django.conf import settings
from rest_framework import permissions

logger = logging.getLogger(__name__)


class HasRequiredPermission(permissions.BasePermission):
    """
    Validates if the user's assigned role(s) contain the specific
    permission codename required by the ViewSet or action.

    Resolution order:
      1. permission_map[action] — if the ViewSet defines a permission_map dict
         and the current action is a key in it.
         • If the value is None → authenticated is sufficient (skip RBAC)
         • If the value is a string → check that permission codename
      2. required_permission — flat string, checked for all actions
      3. FAIL-CLOSED — no permission defined → 403

    Superusers bypass all checks.
    """

    def has_permission(self, request, view):
        # 0. Must be authenticated
        if not request.user or not request.user.is_authenticated:
            return False

        # 1. Superuser bypass (ICE-03/P-06: is_staff should NOT bypass RBAC)
        if request.user.is_superuser:
            return True

        # 2. Resolve the required permission for this specific action
        required_permission = self._resolve_permission(view)

        # 2a. None means "any authenticated user is allowed" (explicit opt-out)
        if required_permission is None:
            return True

        # 2b. Empty string means no permission was configured → FAIL-CLOSED
        if required_permission == '':
            view_name = view.__class__.__name__
            action = getattr(view, 'action', 'unknown')
            logger.critical(
                f"SECURITY: ViewSet '{view_name}' action '{action}' has no "
                f"required_permission defined! All non-superuser requests DENIED."
            )
            if settings.DEBUG:
                from django.core.exceptions import ImproperlyConfigured
                raise ImproperlyConfigured(
                    f"ViewSet '{view_name}' must define a 'required_permission' "
                    f"or 'permission_map' attribute. This is a security requirement."
                )
            return False

        # 3. Multi-role aggregation — check ALL roles assigned to the user
        return self._check_rbac(request.user, required_permission)

    def _resolve_permission(self, view):
        """
        Resolve the permission codename for the current action.

        Returns:
            str: permission codename to check
            None: action explicitly allows any authenticated user
            '': no permission configured (fail-closed)
        """
        action = getattr(view, 'action', None)

        # 1. Check action-level permission_map first
        permission_map = getattr(view, 'permission_map', None)
        if permission_map and action in permission_map:
            return permission_map[action]  # Can be None or a codename string

        # 2. Fall back to ViewSet-level required_permission
        required = getattr(view, 'required_permission', None)
        if required:
            return required

        # 3. Nothing defined → return empty string to trigger fail-closed
        return ''

    @staticmethod
    def _check_rbac(user, permission_codename):
        """Check if any of the user's roles possess the required permission."""
        try:
            from settings_app.models import Role, RolePermission

            user_roles = Role.objects.filter(role_users__user=user)
            if not user_roles.exists():
                return False

            return RolePermission.objects.filter(
                role__in=user_roles,
                permission__codename=permission_codename
            ).select_related('permission').exists()

        except Exception as e:
            logger.error(
                f"RBAC check failed for user '{user}' on "
                f"permission '{permission_codename}': {e}"
            )
            return False

