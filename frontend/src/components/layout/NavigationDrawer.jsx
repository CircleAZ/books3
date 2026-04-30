import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { menuSections } from '../../config/navigation';
import usePermissions from '../../utils/usePermissions';
import { useStoreSettings } from '../../context/StoreContext';
import './NavigationDrawer.css';

const icons = {
    'home': <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
    'shopping-cart': <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>,
    'package': <><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27,6.96 12,12.01 20.73,6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>,
    'users': <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    'bar-chart': <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
    'rotate-ccw': <><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></>,
    'settings': <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
    'dollar-sign': <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
    'mail': <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>,
    'store': <><path d="M3 9l1-4h16l1 4" /><path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" /><path d="M9 21V13h6v8" /><path d="M3 9h18" /><path d="M5 1h14" /></>,
};

// F6: SVGs are decorative — mark them aria-hidden
function Icon({ name }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            {icons[name]}
        </svg>
    );
}

function MenuItem({ item, onNavigate, isMini, currentPath }) {
    // NAV-U1: Auto-expand if current path matches any child route
    const isChildActive = item.children?.some(child =>
        currentPath === child.path || currentPath.startsWith(child.path + '/')
    );
    const [expanded, setExpanded] = useState(isChildActive);

    // Re-expand when navigating to a child route (e.g. via direct URL)
    useEffect(() => {
        if (isChildActive && !expanded) {
            setExpanded(true);
        }
    }, [currentPath]); // eslint-disable-line react-hooks/exhaustive-deps

    if (item.type === 'separator') {
        return <div className="menu-separator" role="separator" />;
    }

    if (item.children) {
        // Mini mode: render as a NavLink that navigates to the group's primary page
        if (isMini && item.path) {
            return (
                <NavLink
                    to={item.path}
                    className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
                    onClick={onNavigate}
                    aria-label={item.label}
                >
                    <Icon name={item.icon} />
                </NavLink>
            );
        }

        return (
            <div className={`menu-group ${expanded ? 'expanded' : ''}`}>
                <button
                    className="menu-group-header"
                    onClick={() => setExpanded(!expanded)}
                    aria-expanded={expanded}
                >
                    <Icon name={item.icon} />
                    <span className="menu-label">{item.label}</span>
                    <svg className="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
                        <polyline points="6,9 12,15 18,9" />
                    </svg>
                </button>
                <div className="menu-children" role="region" aria-label={`${item.label} submenu`}>
                    <div className="menu-children-inner">
                        {item.children.map(child => (
                            <NavLink
                                key={child.path}
                                to={child.path}
                                className={({ isActive }) => `menu-child ${isActive ? 'active' : ''}`}
                                onClick={onNavigate}
                            >
                                {child.label}
                            </NavLink>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <NavLink
            to={item.path}
            className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
            onClick={onNavigate}
            end
            aria-label={isMini ? item.label : undefined}
        >
            <Icon name={item.icon} />
            {!isMini && <span className="menu-label">{item.label}</span>}
        </NavLink>
    );
}

export default function NavigationDrawer({ drawerMode, overlayOpen, onClose, onMenuClick, hamburgerRef, hamburgerLabel }) {
    const drawerRef = useRef(null);
    const location = useLocation();
    const { hasPermission } = usePermissions();
    const { storeSettings } = useStoreSettings();

    // Filter menu sections based on RBAC permissions
    const filteredMenu = menuSections.map(section => {
        if (section.type === 'separator') return section;
        if (section.permission && !hasPermission(section.permission)) return null;

        if (section.children) {
            const allowedChildren = section.children.filter(child => {
                if (child.permission && !hasPermission(child.permission)) return false;
                return true;
            });
            if (allowedChildren.length === 0) return null; // Hide parent if all children are hidden
            return { ...section, children: allowedChildren };
        }
        return section;
    }).filter(Boolean);

    // Determine the CSS classes for the drawer
    const isPersistent = drawerMode === 'full' || drawerMode === 'mini';
    const isMini = drawerMode === 'mini' && !overlayOpen;

    let drawerClasses = 'navigation-drawer';
    if (isPersistent) drawerClasses += ' persistent';
    if (isMini) drawerClasses += ' mini';
    if (isPersistent || overlayOpen) drawerClasses += ' open';

    // F4: Focus trap for overlay mode
    useEffect(() => {
        if (!overlayOpen || !drawerRef.current) return;

        const drawer = drawerRef.current;
        const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

        // Move focus into the drawer when overlay opens
        const firstFocusable = drawer.querySelector(focusableSelector);
        if (firstFocusable) {
            // Small delay for CSS transition to complete
            requestAnimationFrame(() => firstFocusable.focus());
        }

        function trapFocus(e) {
            if (e.key !== 'Tab') return;

            const focusables = drawer.querySelectorAll(focusableSelector);
            if (focusables.length === 0) return;

            const first = focusables[0];
            const last = focusables[focusables.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }

        drawer.addEventListener('keydown', trapFocus);
        return () => drawer.removeEventListener('keydown', trapFocus);
    }, [overlayOpen]);

    return (
        <>
            {/* Overlay backdrop — click to close */}
            {overlayOpen && (
                <div
                    className="drawer-overlay"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}

            {/* F1: aria-label on <aside> landmark */}
            <aside
                ref={drawerRef}
                className={drawerClasses}
                aria-label="Main navigation sidebar"
                aria-hidden={!isPersistent && !overlayOpen ? true : undefined}
            >
                <div className="drawer-header">
                    {/* Hamburger lives in sidebar — stays fixed like YouTube Music */}
                    <button
                        ref={hamburgerRef}
                        className="icon-btn hamburger-btn"
                        onClick={onMenuClick}
                        aria-label={hamburgerLabel}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
                            <path d="M3 12h18M3 6h18M3 18h18" />
                        </svg>
                    </button>
                    {!isMini && (
                        <NavLink to="/" className="drawer-logo" onClick={onClose}>
                            {storeSettings?.logo ? (
                                <img src={storeSettings.logo} alt="Store Logo" className="logo-img" />
                            ) : (
                                <div className="logo-icon" aria-hidden="true">AZ</div>
                            )}
                            <span className="logo-text">{storeSettings?.name || 'AZ Books'}</span>
                        </NavLink>
                    )}
                </div>

                {/* F2: aria-label on <nav> to distinguish from BottomNavBar */}
                <nav className="drawer-nav" aria-label="Sidebar navigation">
                    {filteredMenu.map((item, idx) => (
                        <MenuItem key={item.id || idx} item={item} onNavigate={onClose} isMini={isMini} currentPath={location.pathname} />
                    ))}
                </nav>

                {!isMini && (
                    <div className="drawer-footer">
                        <p className="version-text">v1.0.0</p>
                    </div>
                )}
            </aside>
        </>
    );
}
