"""
Core ViewSet base classes for AZ Books.
All ViewSets MUST inherit from SecuredModelViewSet to enforce RBAC.
"""

from rest_framework import viewsets
from .permissions import HasRequiredPermission


class SecuredModelViewSet(viewsets.ModelViewSet):
    """
    Base ViewSet that enforces RBAC via HasRequiredPermission.

    Subclasses MUST define `required_permission` as a class attribute.
    Failure to do so will result in:
    - DEBUG: ImproperlyConfigured exception (loud, immediate)
    - PRODUCTION: 403 Forbidden + CRITICAL log entry

    Usage:
        class ExpenseViewSet(SecuredModelViewSet):
            required_permission = 'finance.manage_expenses'
            queryset = Expense.objects.all()
            serializer_class = ExpenseSerializer

    For per-action permissions:
        class ProductViewSet(SecuredModelViewSet):
            required_permission = 'inventory.manage_products'

            def get_required_permission(self):
                if self.action in ['list', 'retrieve']:
                    return 'inventory.view_products'
                return self.required_permission
    """
    permission_classes = [HasRequiredPermission]
    required_permission = None  # MUST be overridden by subclasses


class SecuredReadOnlyModelViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only ViewSet with RBAC enforcement.
    Same fail-closed behavior as SecuredModelViewSet.
    """
    permission_classes = [HasRequiredPermission]
    required_permission = None  # MUST be overridden by subclasses
