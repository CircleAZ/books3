/**
 * GuardedAction Component
 * 
 * Wraps interactive elements (buttons, links) with RBAC-aware rendering.
 * If the user lacks the required permission:
 *   - The element is rendered as DISABLED (not hidden — prevents jumping UI)
 *   - A padlock icon overlay is shown
 *   - A tooltip explains why the action is restricted
 * 
 * Usage:
 *   <GuardedAction permission="finance.approve_expenses">
 *       <Button onClick={handleApprove}>Approve</Button>
 *   </GuardedAction>
 */
import React, { cloneElement } from 'react';
import usePermissions from '../utils/usePermissions';

export function GuardedAction({ 
    permission, 
    children, 
    tooltipText 
}) {
    const { hasPermission } = usePermissions();
    const allowed = hasPermission(permission);

    // If user has permission, render children normally
    if (allowed) {
        return children;
    }

    const defaultTooltip = tooltipText || `Requires permission: ${permission}`;

    const handleDisabledClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <div 
            style={{ 
                position: 'relative', 
                display: 'inline-block',
                opacity: 0.5, 
                cursor: 'not-allowed' 
            }}
            title={defaultTooltip}
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
    );
}

export default GuardedAction;
