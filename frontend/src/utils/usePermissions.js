/**
 * usePermissions Hook
 * 
 * Provides permission-checking utilities derived from the JWT RBAC claims.
 * Zero network dependency — all data comes from the decoded JWT in AuthContext.
 * 
 * Usage:
 *   const { hasPermission, hasAnyPermission, role } = usePermissions();
 *   if (hasPermission('finance.approve_expenses')) { ... }
 */
import { useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export function usePermissions() {
    const { rbac } = useAuth();

    // P-05: Memoize the permissions set for O(1) lookups instead of O(n) .includes()
    const permissionSet = useMemo(
        () => new Set(rbac?.permissions || []),
        [rbac?.permissions]
    );

    /**
     * Check if the current user has a specific permission codename.
     * ICE-03/P-06: Only superuser bypasses, NOT is_staff.
     */
    const hasPermission = useCallback((permissionCode) => {
        if (!rbac) return false;
        if (rbac.is_superuser) return true;
        return permissionSet.has(permissionCode);
    }, [rbac, permissionSet]);

    /**
     * Check if the current user has ANY of the given permissions.
     */
    const hasAnyPermission = useCallback((...permissionCodes) => {
        if (!rbac) return false;
        if (rbac.is_superuser) return true;
        return permissionCodes.some(code => permissionSet.has(code));
    }, [rbac, permissionSet]);

    /**
     * Check if the current user has ALL of the given permissions.
     */
    const hasAllPermissions = useCallback((...permissionCodes) => {
        if (!rbac) return false;
        if (rbac.is_superuser) return true;
        return permissionCodes.every(code => permissionSet.has(code));
    }, [rbac, permissionSet]);

    return {
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        role: rbac?.role || null,
        roles: rbac?.roles || [],
        permissions: rbac?.permissions || [],
        isStaff: rbac?.is_staff || false,
        isSuperuser: rbac?.is_superuser || false,
    };
}

export default usePermissions;
