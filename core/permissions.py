"""
Core Permissions for AZ Books RBAC System.
All API authorization flows through this module.

Designed with a FAIL-CLOSED posture:
- Missing `required_permission` on a ViewSet → 403 (prod) / ImproperlyConfigured (debug)
- Multi-role aggregation: checks ALL roles assigned to a user
- Superuser/staff bypass
"""

import logging
from django.conf import settings
from rest_framework import permissions

logger = logging.getLogger(__name__)


class HasRequiredPermission(permissions.BasePermission):
    """
    Validates if the user's assigned role(s) contain the specific
    permission codename required by the ViewSet.

    Usage on ViewSets:
        permission_classes = [HasRequiredPermission]
        required_permission = 'finance.manage_expenses'

    For per-action permissions, override get_permissions() and set
    self.required_permission dynamically.
    """

    def has_permission(self, request, view):
        # 0. Must be authenticated
        if not request.user or not request.user.is_authenticated:
            return False

        # 1. Superuser bypass only (ICE-03/P-06: is_staff should NOT bypass RBAC)
        if request.user.is_superuser:
            return True

        # 2. Get required permission from the ViewSet (FAIL-CLOSED)
        required_permission = getattr(view, 'required_permission', None)

        if required_permission is None or required_permission == "":
            # FAIL-CLOSED: No permission declared = blocked
            view_name = view.__class__.__name__
            logger.critical(
                f"SECURITY: ViewSet '{view_name}' has no required_permission defined! "
                f"All non-staff requests are being DENIED. Fix immediately."
            )
            if settings.DEBUG:
                from django.core.exceptions import ImproperlyConfigured
                raise ImproperlyConfigured(
                    f"ViewSet '{view_name}' must define a 'required_permission' attribute. "
                    f"This is a security requirement enforced by HasRequiredPermission."
                )
            return False

        # 3. Multi-role aggregation — check ALL roles assigned to the user
        try:
            from settings_app.models import Role, RolePermission

            # Get all roles for this user (handles multi-role assignment)
            user_roles = Role.objects.filter(role_users__user=request.user)

            if not user_roles.exists():
                return False

            # Check if ANY of the user's roles possess the required permission
            return RolePermission.objects.filter(
                role__in=user_roles,
                permission__codename=required_permission
            ).select_related('permission').exists()

        except Exception as e:
            logger.error(
                f"RBAC check failed for user '{request.user}' on "
                f"permission '{required_permission}': {e}"
            )
            return False
