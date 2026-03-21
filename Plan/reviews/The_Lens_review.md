<UX_AUDIT_REPORT>
## Heuristic Assessment: Role Management Architecture

| Severity | Heuristic Violated | Observation | Mandatory Fix |
| :--- | :--- | :--- | :--- |
| **Major** | Visibility of System Status | The `usePermissions` hook proposes entirely hiding UI elements: `{hasPermission('finance.approve') && <Button>Approve</Button>}`. This results in unpredictable UI layouts (jumping UI) and leaves users confused as to why they can't perform an action their peer can. | Do not completely remove the element from the DOM unless it is an entire page link. For actions, render the button in a `disabled` state with a padlock icon and a tooltip indicating the required permission. |
| **Minor** | Flexibility and Efficiency of Use | "Massive checklist UI grouping permissions in collapsible accordions." A dense matrix of 100+ checkboxes across 6 accordions forces massive scroll fatigue and cognitive overload on Administrators trying to configure roles. | Implement a search filter above the checkboxes ("Find permission..."). Add "Select All / Deselect All in Category" macro-toggles. |
| **Critical**| Error Prevention | The matrix does not explicitly mention warning the user when modifying a "System Default" role. Given that core apps expect `cashier` to behave safely, allowing massive edits to defaults without a catastrophic warning is a mistake. | The UI must display a red warning banner `role.is_system && "Warning: Modifying system-critical roles can lock users out of core functionality."` |

### CSS/Component Implementation Fix:
```javascript
// UI Fix for Visibility of System Status
function GuardedAction({ permissionCode, children }) {
    const { hasPermission } = usePermissions();
    if (!hasPermission(permissionCode)) {
        return (
            <Tooltip content="You lack the required security clearance for this action.">
                <div style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                    {React.cloneElement(children, { disabled: true })}
                </div>
            </Tooltip>
        );
    }
    return children;
}
```
</UX_AUDIT_REPORT>
