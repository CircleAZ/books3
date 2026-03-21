"""
Core views for AZ Books RBAC System.
Includes the Manager Override endpoint for POS bypass authorization.
"""

import logging
from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from settings_app.models import Role, RolePermission, RoleAuditLog

logger = logging.getLogger(__name__)


class ManagerOverrideThrottle(UserRateThrottle):
    """Rate limit: 10 override attempts per minute per user."""
    rate = '10/min'


class ManagerOverrideView(APIView):
    """
    Manager Override API for POS cashier-restricted actions.

    When a cashier encounters a restricted action, the frontend opens
    a modal requesting a manager's username + password. This endpoint:
    1. Authenticates the manager via Django's authenticate()
    2. Verifies the manager is active and not soft-deleted
    3. Verifies the manager's role has the required permission
    4. Logs the override to RoleAuditLog
    5. Returns 200 OK with authorization token for the specific action

    POST /api/core/manager-override/
    {
        "manager_username": "rajesh",
        "manager_password": "***",
        "required_permission": "inventory.create_products",
        "action_description": "Create custom item at POS"
    }
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ManagerOverrideThrottle]

    def post(self, request):
        manager_username = request.data.get('manager_username', '').strip()
        manager_password = request.data.get('manager_password', '')
        required_permission = request.data.get('required_permission', '').strip()
        action_description = request.data.get('action_description', '')

        # Validate required fields
        if not manager_username or not manager_password or not required_permission:
            return Response(
                {'error': 'manager_username, manager_password, and required_permission are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 1. Authenticate the manager
        manager = authenticate(username=manager_username, password=manager_password)
        if manager is None:
            logger.warning(
                f"RBAC Override FAILED: Bad credentials for '{manager_username}' "
                f"by cashier '{request.user.username}'"
            )
            return Response(
                {'error': 'Invalid manager credentials.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # 2. Verify manager is active and not soft-deleted
        if not manager.is_active:
            return Response(
                {'error': 'Manager account is deactivated.'},
                status=status.HTTP_403_FORBIDDEN
            )
        if getattr(manager, 'is_deleted', False):
            return Response(
                {'error': 'Manager account no longer exists.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # 3. Verify manager's role has the required permission
        manager_roles = Role.objects.filter(role_users__user=manager)
        has_permission = RolePermission.objects.filter(
            role__in=manager_roles,
            permission__codename=required_permission
        ).exists()

        # Superuser/staff bypass
        if not has_permission and not manager.is_superuser:
            return Response(
                {'error': 'Manager does not have the required authorization for this action.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # 4. Log the override to RoleAuditLog
        RoleAuditLog.objects.create(
            action='OVERRIDE',
            target_user=request.user,  # The cashier
            permission_code=required_permission,
            role_name=manager_roles.first().name if manager_roles.exists() else 'Superuser',
            executed_by=manager,
            ip_address=self._get_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={
                'cashier_username': request.user.username,
                'action_description': action_description,
            }
        )

        logger.info(
            f"RBAC Override APPROVED: Manager '{manager_username}' authorized "
            f"'{required_permission}' for cashier '{request.user.username}'"
        )

        # 5. Return authorization confirmation
        return Response({
            'authorized': True,
            'permission': required_permission,
            'authorized_by': manager_username,
            'message': f'Manager {manager_username} authorized this action.'
        }, status=status.HTTP_200_OK)

    @staticmethod
    def _get_client_ip(request):
        """Extract client IP from request headers."""
        x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded:
            return x_forwarded.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')
