/**
 * GuardedAction Component
 * 
 * Wraps interactive elements (buttons, links) with RBAC-aware rendering.
 * If the user lacks the required permission:
 *   - The element is rendered as DISABLED (not hidden — prevents jumping UI)
 *   - A padlock icon overlay is shown
 *   - A tooltip explains why the action is restricted
 * 
 * If `allowOverride` is true, clicking a disabled action opens the
 * ManagerOverrideModal instead of doing nothing.
 * 
 * Usage:
 *   <GuardedAction permission="finance.approve_expenses">
 *       <Button onClick={handleApprove}>Approve</Button>
 *   </GuardedAction>
 * 
 *   <GuardedAction permission="inventory.create_products" allowOverride>
 *       <Button onClick={handleCreate}>Add Custom Item</Button>
 *   </GuardedAction>
 */
import React, { useState, cloneElement } from 'react';
import usePermissions from '../utils/usePermissions';
import ManagerOverrideModal from './ManagerOverrideModal';

export function GuardedAction({ 
    permission, 
    children, 
    allowOverride = false,
    tooltipText,
    onOverrideSuccess 
}) {
    const { hasPermission } = usePermissions();
    const [showOverride, setShowOverride] = useState(false);
    const allowed = hasPermission(permission);

    // If user has permission, render children normally
    if (allowed) {
        return children;
    }

    const defaultTooltip = tooltipText || `Requires permission: ${permission}`;

    // If override is allowed, clicking opens the modal
    const handleDisabledClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (allowOverride) {
            setShowOverride(true);
        }
    };

    return (
        <>
            <div 
                style={{ 
                    position: 'relative', 
                    display: 'inline-block',
                    opacity: 0.5, 
                    cursor: allowOverride ? 'pointer' : 'not-allowed' 
                }}
                title={allowOverride ? 'Click for Manager Override' : defaultTooltip}
                onClick={handleDisabledClick}
            >
                {/* Render the child element as disabled */}
                {cloneElement(children, { 
                    disabled: true, 
                    onClick: handleDisabledClick,
                    style: { 
                        ...children.props?.style, 
                        pointerEvents: 'none' 
                    }
                })}
                {/* Padlock icon overlay */}
                <span 
                    style={{ 
                        position: 'absolute', 
                        top: '50%', 
                        right: '8px', 
                        transform: 'translateY(-50%)',
                        fontSize: '14px',
                        opacity: 0.8,
                    }}
                    aria-label="Locked"
                >
                    🔒
                </span>
            </div>

            {/* Manager Override Modal */}
            {allowOverride && showOverride && (
                <ManagerOverrideModal
                    permission={permission}
                    onClose={() => setShowOverride(false)}
                    onSuccess={() => {
                        setShowOverride(false);
                        if (onOverrideSuccess) onOverrideSuccess();
                    }}
                />
            )}
        </>
    );
}

export default GuardedAction;
