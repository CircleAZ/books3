/**
 * Navigation Configuration — Single source of truth
 * Used by: NavigationDrawer, MainLayout (titles), Breadcrumbs, OmniSearch
 */

// ============ Menu Structure ============
export const menuSections = [
    {
        id: 'dashboard',
        label: 'Dashboard',
        title: 'Dashboard',
        path: '/',
        icon: 'home',
    },
    {
        id: 'orders',
        label: 'Orders',
        title: 'Orders',
        path: '/orders',
        icon: 'shopping-cart',
        children: [
            { label: 'Create New Order', title: 'New Order', path: '/orders/new' },
            { label: 'View Orders', title: 'Orders', path: '/orders' },
            { label: 'Sales Reports', title: 'Sales Reports', path: '/reports/sales' },
        ],
    },
    {
        id: 'returns',
        label: 'Returns & Refunds',
        title: 'Returns & Refunds',
        path: '/returns',
        icon: 'rotate-ccw',
        children: [
            { label: 'All Returns', title: 'Returns', path: '/returns' },
            { label: 'New Return', title: 'New Return', path: '/returns/new' },
        ],
    },
    {
        id: 'inventory',
        label: 'Inventory Management',
        title: 'Inventory',
        path: '/inventory',
        icon: 'package',
        children: [
            { label: 'Product List', title: 'Products', path: '/inventory' },
            { label: 'Add New Product', title: 'Add Product', path: '/inventory/add' },
            { label: 'Manage Categories', title: 'Categories', path: '/inventory/categories' },
            { label: 'Manage Vendors', title: 'Vendors', path: '/inventory/vendors' },
            { label: 'Stock Adjustments', title: 'Stock Adjustments', path: '/inventory/stock' },
            { label: 'Deleted Products', title: 'Deleted Products', path: '/inventory/deleted' },
            { label: 'Inventory Reports', title: 'Inventory Reports', path: '/reports/inventory' },
        ],
    },
    {
        id: 'customers',
        label: 'Customer Management',
        title: 'Customers',
        path: '/customers',
        icon: 'users',
        children: [
            { label: 'Customer List', title: 'Customers', path: '/customers' },
            { label: 'Add New Customer', title: 'Add Customer', path: '/customers/add' },
            { label: 'Customer Settings', title: 'Customer Settings', path: '/customers/settings' },
            { label: 'Customer Reports', title: 'Customer Reports', path: '/reports/customers' },
        ],
    },
    {
        id: 'finance',
        label: 'Finance & Accounting',
        title: 'Finance',
        path: '/finance',
        icon: 'dollar-sign',
        children: [
            { label: 'Finance Overview', title: 'Finance', path: '/finance' },
            { label: 'Expense List', title: 'Expenses', path: '/finance/expenses' },
            { label: 'Add Expense', title: 'Add Expense', path: '/finance/expenses/add' },
            { label: 'Expense Categories', title: 'Expense Categories', path: '/finance/categories' },
            { label: 'Profit & Loss', title: 'Profit & Loss', path: '/reports/profit-loss' },
        ],
    },
    {
        id: 'messaging',
        label: 'Messaging & Notifications',
        title: 'Messaging',
        path: '/messaging',
        icon: 'mail',
        children: [
            { label: 'Messaging Overview', title: 'Messaging', path: '/messaging' },
            { label: 'Gateway Management', title: 'Gateway Management', path: '/messaging/gateways' },
            { label: 'Message Queue', title: 'Message Queue', path: '/messaging/queue' },
            { label: 'Message Templates', title: 'Message Templates', path: '/messaging/templates' },
        ],
    },
    {
        id: 'reports',
        label: 'Reporting & Analytics',
        title: 'Reports',
        path: '/reports/sales',
        icon: 'bar-chart',
        children: [
            { label: 'Sales Reports', title: 'Sales Reports', path: '/reports/sales' },
            { label: 'Inventory Reports', title: 'Inventory Reports', path: '/reports/inventory' },
            { label: 'Customer Reports', title: 'Customer Reports', path: '/reports/customers' },
            { label: 'Profit & Loss', title: 'Profit & Loss', path: '/reports/profit-loss' },
            { label: 'Activity Log', title: 'Activity Log', path: '/reports/activity' },
            { label: 'Export Data', title: 'Export Data', path: '/reports/export' },
        ],
    },
    { type: 'separator' },
    {
        id: 'settings',
        label: 'Settings & Configuration',
        title: 'Settings',
        path: '/settings',
        icon: 'settings',
        children: [
            { label: 'Store Details', title: 'Store Details', path: '/settings/store' },
            { label: 'Employee Management', title: 'Employee Management', path: '/settings/employees' },
            { label: 'Roles & Permissions', title: 'Roles & Permissions', path: '/settings/roles' },
            { label: 'Financial Settings', title: 'Financial Settings', path: '/settings/finance' },
            { label: 'Payment Methods', title: 'Payment Methods', path: '/settings/payments' },
            { label: 'Receipt Customization', title: 'Receipt Customization', path: '/settings/receipt' },
            { label: 'Notification Preferences', title: 'Notification Preferences', path: '/settings/notifications' },
            { label: 'Integrations', title: 'Integrations', path: '/settings/integrations' },
            { label: 'Data Management', title: 'Data Management', path: '/settings/data' },
            { label: 'System Information', title: 'System Information', path: '/settings/system' },
        ],
    },
];


// ============ Derived: Route Titles ============
// Auto-generated from menuSections — no manual sync needed
const extraTitles = {
    '/account/profile': 'My Profile',
};

export function buildRouteTitles() {
    const titles = { ...extraTitles };
    for (const section of menuSections) {
        if (section.type === 'separator') continue;
        if (section.path) titles[section.path] = section.title || section.label;
        if (section.children) {
            for (const child of section.children) {
                titles[child.path] = child.title || child.label;
            }
        }
    }
    return titles;
}

export const routeTitles = buildRouteTitles();


// ============ Derived: Dynamic Route Patterns ============
export const dynamicPatterns = [
    { pattern: /^\/customers\/\d+/, title: 'Customer Details' },
    { pattern: /^\/orders\/\d+/, title: 'Order Details' },
    { pattern: /^\/inventory\/\d+\/edit/, title: 'Edit Product' },
    { pattern: /^\/inventory\/\d+/, title: 'Product Details' },
    { pattern: /^\/finance\/expenses\/\d+/, title: 'Expense Details' },
    { pattern: /^\/returns\/\d+/, title: 'Return Details' },
];

export function getPageTitle(pathname) {
    if (routeTitles[pathname]) return routeTitles[pathname];
    for (const { pattern, title } of dynamicPatterns) {
        if (pattern.test(pathname)) return title;
    }
    return 'AZ Books';
}


// ============ Derived: Breadcrumbs ============
export function getBreadcrumbs(pathname) {
    const crumbs = [{ label: 'Home', path: '/' }];

    if (pathname === '/') return crumbs;

    // Find the parent section
    for (const section of menuSections) {
        if (section.type === 'separator') continue;

        // Check if this section owns the path
        const isChildMatch = section.children?.some(
            child => pathname === child.path || pathname.startsWith(child.path + '/')
        );
        const isSectionMatch = pathname === section.path || pathname.startsWith(section.path + '/');

        if (isChildMatch || isSectionMatch) {
            // Add section as parent crumb
            crumbs.push({ label: section.title || section.label, path: section.path });

            // Find matching child
            if (section.children) {
                const matchedChild = section.children.find(
                    c => pathname === c.path || pathname.startsWith(c.path + '/')
                );
                if (matchedChild && matchedChild.path !== section.path) {
                    crumbs.push({ label: matchedChild.title || matchedChild.label, path: matchedChild.path });
                }
            }

            // Dynamic page title for detail pages
            for (const { pattern, title } of dynamicPatterns) {
                if (pattern.test(pathname)) {
                    crumbs.push({ label: title, path: pathname });
                    break;
                }
            }

            return crumbs;
        }
    }

    // Special routes not in menu
    if (pathname === '/account/profile') {
        crumbs.push({ label: 'My Profile', path: '/account/profile' });
    } else {
        crumbs.push({ label: getPageTitle(pathname), path: pathname });
    }

    return crumbs;
}


// ============ Derived: Searchable Items for OmniSearch ============
export function getSearchableItems() {
    const items = [];
    for (const section of menuSections) {
        if (section.type === 'separator') continue;
        if (section.children) {
            for (const child of section.children) {
                items.push({
                    id: child.path,
                    label: child.label,
                    path: child.path,
                    category: section.id,
                    sectionLabel: section.label,
                });
            }
        } else {
            items.push({
                id: section.path,
                label: section.label,
                path: section.path,
                category: section.id,
                sectionLabel: section.label,
            });
        }
    }
    return items;
}

export const searchableItems = getSearchableItems();
