import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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
    '/account/profile': 'My Profile',
};

export default function MainLayout({ children }) {
    const location = useLocation();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);

    // Get title from route
    const pageTitle = routeTitles[location.pathname] || 'AZ Books';

    // Handle Ctrl+K globally
    useEffect(() => {
        function handleKeyDown(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setSearchOpen(prev => !prev);
            }
        }
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Close drawer on route change (mobile)
    useEffect(() => {
        setDrawerOpen(false);
        setProfileOpen(false);
    }, [location.pathname]);

    // Mock user data
    const user = {
        name: 'John Doe',
        email: 'john@azbooks.com',
        initials: 'JD',
    };

    return (
        <div className="app-layout">
            <TopBar
                title={pageTitle}
                onMenuClick={() => setDrawerOpen(prev => !prev)}
                onSearchClick={() => setSearchOpen(true)}
                onProfileClick={() => setProfileOpen(prev => !prev)}
                notificationCount={3}
            />

            <NavigationDrawer
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
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

            <main className="main-content">
                {children}
            </main>

            <BottomNavBar />
        </div>
    );
}
