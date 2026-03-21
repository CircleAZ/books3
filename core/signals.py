"""
Audit log signals for automatic RBAC change tracking.
Fires on RolePermission and UserRole create/delete events.
"""

import logging
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.conf import settings

from settings_app.models import RolePermission, UserRole, RoleAuditLog

logger = logging.getLogger(__name__)


@receiver(post_save, sender=RolePermission)
def log_permission_grant(sender, instance, created, **kwargs):
    """Log when a permission is granted to a role."""
    if created:
        RoleAuditLog.objects.create(
            action='GRANT',
            permission_code=instance.permission.codename,
            role_name=instance.role.name,
            metadata={
                'role_id': str(instance.role.id),
                'permission_id': str(instance.permission.id),
            }
        )
        logger.info(
            f"RBAC Audit: GRANT '{instance.permission.codename}' to role '{instance.role.name}'"
        )


@receiver(post_delete, sender=RolePermission)
def log_permission_revoke(sender, instance, **kwargs):
    """Log when a permission is revoked from a role."""
    # Check PROTECTED_PERMISSIONS before allowing the delete
    protected = getattr(settings, 'PROTECTED_PERMISSIONS', [])
    role_name = instance.role.name
    perm_code = instance.permission.codename

    if (role_name, perm_code) in protected:
        logger.critical(
            f"RBAC ALERT: Attempted revocation of PROTECTED permission "
            f"'{perm_code}' from role '{role_name}'! This should have been blocked."
        )

    RoleAuditLog.objects.create(
        action='REVOKE',
        permission_code=perm_code,
        role_name=role_name,
        metadata={
            'role_id': str(instance.role.id),
            'permission_id': str(instance.permission.id),
        }
    )
    logger.info(
        f"RBAC Audit: REVOKE '{perm_code}' from role '{role_name}'"
    )


@receiver(post_save, sender=UserRole)
def log_role_assign(sender, instance, created, **kwargs):
    """Log when a role is assigned to a user."""
    if created:
        RoleAuditLog.objects.create(
            action='ROLE_ASSIGN',
            target_user=instance.user,
            role_name=instance.role.name,
            metadata={
                'role_id': str(instance.role.id),
                'user_id': str(instance.user.id),
            }
        )
        logger.info(
            f"RBAC Audit: ROLE_ASSIGN '{instance.role.name}' to user '{instance.user.username}'"
        )


@receiver(post_delete, sender=UserRole)
def log_role_remove(sender, instance, **kwargs):
    """Log when a role is removed from a user."""
    RoleAuditLog.objects.create(
        action='ROLE_REMOVE',
        target_user=instance.user,
        role_name=instance.role.name,
        metadata={
            'role_id': str(instance.role.id),
            'user_id': str(instance.user.id),
        }
    )
    logger.info(
        f"RBAC Audit: ROLE_REMOVE '{instance.role.name}' from user '{instance.user.username}'"
    )
