import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import TopBar from './TopBar';
import BottomNavBar from './BottomNavBar';
import NavigationDrawer from './NavigationDrawer';
import UserProfileDropdown from './UserProfileDropdown';
import OmniSearch from '../common/OmniSearch';
import './MainLayout.css';

// Map routes to page titles
const routeTitles = {
    '/': 'Dashboard',
    '/inventory': 'Products',
    '/inventory/add': 'Add Product',
    '/inventory/categories': 'Categories',
    '/inventory/vendors': 'Vendors',
    '/inventory/stock': 'Stock Adjustments',
    '/inventory/deleted': 'Deleted Products',
    '/customers': 'Customers',
    '/customers/add': 'Add Customer',
    '/customers/settings': 'Customer Settings',
    '/orders': 'Orders',
    '/orders/new': 'New Order',
    '/orders/returns': 'Returns & Refunds',
    '/reports': 'Reports',
    '/reports/sales': 'Sales Reports',
    '/reports/inventory': 'Inventory Reports',
    '/reports/customers': 'Customer Reports',
    '/reports/profit-loss': 'Profit & Loss',
    '/reports/export': 'Export Data',
    '/settings': 'Settings',
    '/settings/store': 'Store Details',
    '/settings/users': 'User Management',
    '/settings/payments': 'Payment Methods',
    '/settings/receipts': 'Receipt Customization',
    '/settings/notifications': 'Notifications',
    '/settings/integrations': 'Integrations',
    '/settings/data': 'Data Management',
    '/settings/system': 'System Information',
    '/account/profile': 'My Profile',
    '/finance': 'Finance',
    '/finance/expenses': 'Expenses',
    '/finance/expenses/add': 'Add Expense',
};

export default function MainLayout({ children }) {
    const location = useLocation();
    const [profileOpen, setProfileOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);

    // Responsive sidebar states:
    // 'full'    – full sidebar always visible (≥1200px)
    // 'mini'    – icon-only rail always visible (768–1199px)
    // 'hidden'  – no sidebar visible (<768px)
    const [sidebarMode, setSidebarMode] = useState('hidden');
    // Whether the sidebar is collapsed (desktop: full→mini toggle) or overlay is open
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [overlayOpen, setOverlayOpen] = useState(false);

    // Ref for returning focus to hamburger when overlay closes (F4)
    const hamburgerRef = useRef(null);

    // Store logo
    const [storeLogo, setStoreLogo] = useState(null);

    // Get title from route
    const pageTitle = routeTitles[location.pathname] || 'AZ Books';

    // Compute sidebar mode from screen width
    useEffect(() => {
        const mqDesktop = window.matchMedia('(min-width: 1200px)');
        const mqTablet = window.matchMedia('(min-width: 768px) and (max-width: 1199px)');

        function updateMode() {
            if (mqDesktop.matches) {
                setSidebarMode('full');
                setOverlayOpen(false);
            } else if (mqTablet.matches) {
                setSidebarMode('mini');
                setOverlayOpen(false);
            } else {
                setSidebarMode('hidden');
                setSidebarCollapsed(false);
            }
        }

        updateMode();
        mqDesktop.addEventListener('change', updateMode);
        mqTablet.addEventListener('change', updateMode);
        return () => {
            mqDesktop.removeEventListener('change', updateMode);
            mqTablet.removeEventListener('change', updateMode);
        };
    }, []);

    // Fetch store logo once on mount
    useEffect(() => {
        const fetchStoreLogo = async () => {
            try {
                const res = await fetchWithAuth(ENDPOINTS.SETTINGS_STORE);
                if (res.ok) {
                    const data = await res.json();
                    if (data.logo) setStoreLogo(data.logo);
                }
            } catch (err) {
                console.error('Error fetching store logo:', err);
            }
        };
        fetchStoreLogo();
    }, [fetchWithAuth]);

    // Handle Ctrl+K and Escape key globally (F3: Escape dismiss)
    useEffect(() => {
        function handleKeyDown(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setSearchOpen(prev => !prev);
            }
            if (e.key === 'Escape' && overlayOpen) {
                e.preventDefault();
                setOverlayOpen(false);
                // F4: Return focus to hamburger button on close
                hamburgerRef.current?.focus();
            }
        }
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [overlayOpen]);

    // Close overlay on route change
    useEffect(() => {
        setOverlayOpen(false);
        setProfileOpen(false);
    }, [location.pathname]);

    // Hamburger click handler
    const handleMenuClick = useCallback(() => {
        if (sidebarMode === 'full') {
            // Desktop: toggle between full ↔ mini
            setSidebarCollapsed(prev => !prev);
        } else {
            // Tablet & mobile: toggle overlay drawer
            setOverlayOpen(prev => !prev);
        }
    }, [sidebarMode]);

    // F8: Dynamic hamburger label based on state
    const hamburgerLabel = overlayOpen
        ? 'Close navigation menu'
        : sidebarMode === 'full' && !sidebarCollapsed
            ? 'Collapse sidebar'
            : 'Open navigation menu';

    // Determine render state for NavigationDrawer
    let drawerMode;
    if (sidebarMode === 'full') {
        drawerMode = sidebarCollapsed ? 'mini' : 'full';
    } else if (sidebarMode === 'mini') {
        drawerMode = 'mini'; // always show mini rail
    } else {
        drawerMode = 'hidden';
    }

    // Determine main-content margin class
    const sidebarClass = drawerMode === 'full' ? 'sidebar-full' : drawerMode === 'mini' ? 'sidebar-mini' : '';

    // Usage of AuthContext to get real user data
    const { user } = useAuth();

    return (
        <div className="app-layout">
            {/* UX1: Skip-to-content link for keyboard users */}
            <a href="#main-content" className="skip-to-content">Skip to main content</a>

            <TopBar
                title={pageTitle}
                storeLogo={storeLogo}
                onMenuClick={handleMenuClick}
                onSearchClick={() => setSearchOpen(true)}
                onProfileClick={() => setProfileOpen(prev => !prev)}
                notificationCount={3}
                sidebarClass={sidebarClass}
                showHamburger={sidebarMode === 'hidden'}
                hamburgerLabel={hamburgerLabel}
                hamburgerRef={sidebarMode === 'hidden' ? hamburgerRef : undefined}
            />

            <NavigationDrawer
                drawerMode={drawerMode}
                overlayOpen={overlayOpen}
                onClose={() => setOverlayOpen(false)}
                onMenuClick={handleMenuClick}
                hamburgerRef={sidebarMode !== 'hidden' ? hamburgerRef : undefined}
                hamburgerLabel={hamburgerLabel}
            />

            <UserProfileDropdown
                isOpen={profileOpen}
                onClose={() => setProfileOpen(false)}
                user={user}
            />

            <OmniSearch
                isOpen={searchOpen}
                onClose={() => setSearchOpen(false)}
            />

            <main id="main-content" className={`main-content ${sidebarClass}`}>
                {children}
            </main>

            <BottomNavBar />
        </div>
    );
}
