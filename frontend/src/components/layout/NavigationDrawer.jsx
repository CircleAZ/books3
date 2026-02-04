import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './NavigationDrawer.css';

const menuSections = [
    {
        id: 'dashboard',
        label: 'Dashboard',
        path: '/',
        icon: 'home',
    },
    {
        id: 'orders',
        label: 'Orders',
        icon: 'shopping-cart',
        children: [
            { label: 'Create New Order', path: '/orders/new' },
            { label: 'View Orders', path: '/orders' },
            { label: 'Manage Returns/Refunds', path: '/orders/returns' },
            { label: 'Sales Reports', path: '/reports/sales' },
        ],
    },
    {
        id: 'inventory',
        label: 'Inventory Management',
        icon: 'package',
        children: [
            { label: 'Product List', path: '/inventory' },
            { label: 'Add New Product', path: '/inventory/add' },
            { label: 'Manage Categories', path: '/inventory/categories' },
            { label: 'Manage Vendors', path: '/inventory/vendors' },
            { label: 'Stock Adjustments', path: '/inventory/stock' },
            { label: 'Deleted Products', path: '/inventory/deleted' },
            { label: 'Inventory Reports', path: '/reports/inventory' },
        ],
    },
    {
        id: 'customers',
        label: 'Customer Management',
        icon: 'users',
        children: [
            { label: 'Customer List', path: '/customers' },
            { label: 'Add New Customer', path: '/customers/add' },
            { label: 'Customer Settings', path: '/customers/settings' },
            { label: 'Customer Reports', path: '/reports/customers' },
        ],
    },
    {
        id: 'reports',
        label: 'Reporting & Analytics',
        icon: 'bar-chart',
        children: [
            { label: 'Sales Reports', path: '/reports/sales' },
            { label: 'Inventory Reports', path: '/reports/inventory' },
            { label: 'Customer Reports', path: '/reports/customers' },
            { label: 'Profit & Loss', path: '/reports/profit-loss' },
            { label: 'Export Data', path: '/reports/export' },
        ],
    },
    { type: 'separator' },
    {
        id: 'settings',
        label: 'Settings & Configuration',
        icon: 'settings',
        children: [
            { label: 'Store Details', path: '/settings/store' },
            { label: 'User Management', path: '/settings/users' },
            { label: 'Payment Methods', path: '/settings/payments' },
            { label: 'Receipt Customization', path: '/settings/receipts' },
            { label: 'Notification Preferences', path: '/settings/notifications' },
            { label: 'Integrations', path: '/settings/integrations' },
            { label: 'Data Management', path: '/settings/data' },
        ],
    },
];

const icons = {
    'home': <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
    'shopping-cart': <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>,
    'package': <><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27,6.96 12,12.01 20.73,6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>,
    'users': <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    'bar-chart': <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
    'settings': <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
};

function Icon({ name }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {icons[name]}
        </svg>
    );
}

function MenuItem({ item, onNavigate }) {
    const [expanded, setExpanded] = useState(false);

    if (item.type === 'separator') {
        return <div className="menu-separator" />;
    }

    if (item.children) {
        return (
            <div className={`menu-group ${expanded ? 'expanded' : ''}`}>
                <button className="menu-group-header" onClick={() => setExpanded(!expanded)}>
                    <Icon name={item.icon} />
                    <span className="menu-label">{item.label}</span>
                    <svg className="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6,9 12,15 18,9" />
                    </svg>
                </button>
                <div className="menu-children">
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
        );
    }

    return (
        <NavLink
            to={item.path}
            className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
            onClick={onNavigate}
            end
        >
            <Icon name={item.icon} />
            <span className="menu-label">{item.label}</span>
        </NavLink>
    );
}

export default function NavigationDrawer({ isOpen, onClose }) {
    return (
        <>
            {isOpen && <div className="drawer-overlay" onClick={onClose} />}
            <aside className={`navigation-drawer ${isOpen ? 'open' : ''}`}>
                <div className="drawer-header">
                    <NavLink to="/" className="drawer-logo" onClick={onClose}>
                        <div className="logo-icon">AZ</div>
                        <span className="logo-text">AZ Books</span>
                    </NavLink>
                </div>

                <nav className="drawer-nav">
                    {menuSections.map((item, idx) => (
                        <MenuItem key={item.id || idx} item={item} onNavigate={onClose} />
                    ))}
                </nav>

                <div className="drawer-footer">
                    <p className="version-text">v1.0.0</p>
                </div>
            </aside>
        </>
    );
}
