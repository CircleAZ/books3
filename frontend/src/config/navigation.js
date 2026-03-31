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
            { label: 'Product Sets', title: 'Product Sets', path: '/inventory/product-sets' },
            { label: 'Deleted Products', title: 'Deleted Products', path: '/inventory/deleted' },
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
            { label: 'Customer Map', title: 'Customer Map', path: '/customers/map' },
            { label: 'Coverage List', title: 'Coverage List', path: '/customers/coverage' },
            { label: 'Season Report', title: 'Season Report', path: '/customers/report' },
            { label: 'Add New Customer', title: 'Add Customer', path: '/customers/add' },
            { label: 'Customer Settings', title: 'Customer Settings', path: '/customers/settings' },
            { label: 'Product Sets', title: 'Product Sets', path: '/inventory/product-sets' },
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
            { label: 'Employee Expenses', title: 'Employee Expenses', path: '/finance/employee-expenses' },
            { label: 'Employee Salaries', title: 'Salaries', path: '/finance/salaries' },
            { label: 'Financial Reports', title: 'Financial Reports', path: '/finance/reports' },
            { label: 'Profit & Loss', title: 'Profit & Loss', path: '/finance/reports/profit-loss' },
            { label: 'Balance Sheet', title: 'Balance Sheet', path: '/finance/reports/balance-sheet' },
            { label: 'Cash Flow', title: 'Cash Flow', path: '/finance/reports/cash-flow' },
            { label: 'Expense Report', title: 'Expense Report', path: '/finance/reports/expenses' },
            { label: 'Tax Report', title: 'Tax Report', path: '/finance/reports/sales-tax' },
            { label: 'Bank Accounts', title: 'Banking', path: '/finance/banking' },
            { label: 'Bank Transactions', title: 'Transactions', path: '/finance/banking/transactions' },
            { label: 'Record Transaction', title: 'Record Transaction', path: '/finance/banking/record' },
            { label: 'Recurring Expenses', title: 'Recurring Expenses', path: '/finance/recurring' },
            { label: 'Category Budgets', title: 'Budgets', path: '/finance/budgets' },
            { label: 'Income Categories', title: 'Income Categories', path: '/finance/income-categories' },
            { label: 'Lenders', title: 'Lenders', path: '/finance/lenders' },
            { label: 'Trips', title: 'Trips', path: '/finance/trips' },
            { label: 'New Trip', title: 'New Trip', path: '/finance/trips/new' },
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
        path: '/reports',
        icon: 'bar-chart',
        children: [
            { label: 'Reports Hub', title: 'Reports', path: '/reports' },
            { label: 'Sales Reports', title: 'Sales Reports', path: '/reports/sales' },
            { label: 'Inventory Reports', title: 'Inventory Reports', path: '/reports/inventory' },
            { label: 'Customer Reports', title: 'Customer Reports', path: '/reports/customers' },
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
            { label: 'Customer Settings', title: 'Customer Settings', path: '/settings/customers' },
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
// ORDER MATTERS: more specific patterns (with /edit, /receipt) must come FIRST
export const dynamicPatterns = [
    { pattern: /^\/customers\/\d+\/edit/, title: 'Edit Customer' },
    { pattern: /^\/customers\/\d+/, title: 'Customer Details' },
    { pattern: /^\/orders\/\d+\/edit/, title: 'Edit Order' },
    { pattern: /^\/orders\/\d+\/receipt/, title: 'Order Receipt' },
    { pattern: /^\/orders\/\d+/, title: 'Order Details' },
    { pattern: /^\/inventory\/edit\/\d+/, title: 'Edit Product' },
    { pattern: /^\/inventory\/product\/\d+/, title: 'Product Details' },
    { pattern: /^\/finance\/expenses\/\d+/, title: 'Expense Details' },
    { pattern: /^\/finance\/lenders\/\d+/, title: 'Lender Details' },
    { pattern: /^\/finance\/loans\/\d+/, title: 'Loan Details' },
    { pattern: /^\/finance\/trips\/\d+/, title: 'Trip Details' },
    { pattern: /^\/returns\/\d+/, title: 'Return Details' },
    { pattern: /^\/inventory\/product-sets\/[\w-]+\/edit/, title: 'Edit Product Set' },
    { pattern: /^\/inventory\/product-sets\/[\w-]+/, title: 'Product Set Details' },
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
            // Add section as parent crumb (with children for dropdown nav)
            crumbs.push({
                label: section.title || section.label,
                path: section.path,
                children: section.children || null,
            });

            // FIX #1: Sort children by path length DESC before find()
            // This ensures '/inventory/categories' matches before '/inventory'
            if (section.children) {
                const sortedChildren = [...section.children].sort(
                    (a, b) => b.path.length - a.path.length
                );
                const matchedChild = sortedChildren.find(
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
