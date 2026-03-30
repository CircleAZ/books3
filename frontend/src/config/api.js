// API Configuration
// This file centralizes API endpoint configuration

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Endpoint paths
export const ENDPOINTS = {
    // Auth
    LOGIN: `${API_BASE}/account/login/`,
    LOGOUT: `${API_BASE}/account/logout/`,
    PROFILE: `${API_BASE}/account/profile/`,
    PROFILE_PICTURE: `${API_BASE}/account/profile/picture/`,
    CHANGE_PASSWORD: `${API_BASE}/account/change-password/`,
    ACTIVITY: `${API_BASE}/account/activity/`,
    NOTIFICATIONS: `${API_BASE}/account/notifications/`,
    NOTIFICATIONS_COUNT: `${API_BASE}/account/notifications/count/`,

    // Dashboard
    DASHBOARD_STATS: `${API_BASE}/dashboard/stats/`,
    DASHBOARD_TOP_PRODUCTS: `${API_BASE}/dashboard/top-products/`,
    DASHBOARD_SALES_TREND: `${API_BASE}/dashboard/sales-trend/`,
    DASHBOARD_RECENT_ORDERS: `${API_BASE}/dashboard/recent-orders/`,
    DASHBOARD_ALERTS: `${API_BASE}/dashboard/alerts/`,

    // Inventory
    INVENTORY_PRODUCTS: `${API_BASE}/inventory/products/`,
    INVENTORY_CATEGORIES: `${API_BASE}/inventory/categories/`,
    INVENTORY_VENDORS: `${API_BASE}/inventory/vendors/`,
    INVENTORY_STOCK_HISTORY: `${API_BASE}/inventory/stock-history/`,
    INVENTORY_STOCK_ADJUSTMENTS: `${API_BASE}/inventory/stock-adjustments/`,
    PRODUCT_SETS: `${API_BASE}/inventory/product-sets/`,
    PRODUCT_SETS_RESOLVE: `${API_BASE}/inventory/product-sets/resolve/`,

    // Customers
    CUSTOMERS: `${API_BASE}/customers/customers/`,
    SCHOOLS: `${API_BASE}/customers/schools/`,
    CLASSES: `${API_BASE}/customers/classes/`,
    CUSTOMERS_GROUPS: `${API_BASE}/customers/customer-groups/`,
    CUSTOMERS_DIVISIONS: `${API_BASE}/customers/divisions/`,
    CUSTOMERS_LOCATION_TAGS: `${API_BASE}/customers/location-tags/`,
    CUSTOMERS_LINK_TYPES: `${API_BASE}/customers/link-types/`,
    CUSTOMERS_SUBDIVISIONS: `${API_BASE}/customers/subdivisions/`,
    CUSTOMERS_MAP: `${API_BASE}/customers/customers/map_data/`,
    TARGET_VILLAGES: `${API_BASE}/customers/customers/target-villages/`,
    SEASON_REPORT: `${API_BASE}/customers/customers/season_report/`,
    COVERAGE_PDF: `${API_BASE}/customers/customers/coverage_pdf/`,

    // Template Catalogs (reusable name pools)
    CLASS_TEMPLATES: `${API_BASE}/customers/class-templates/`,
    DIVISION_TEMPLATES: `${API_BASE}/customers/division-templates/`,
    SUBDIVISION_TEMPLATES: `${API_BASE}/customers/subdivision-templates/`,

    // School Structure Actions
    SCHOOL_STRUCTURE: (id) => `${API_BASE}/customers/schools/${id}/structure/`,
    SCHOOL_ASSIGN_STRUCTURE: (id) => `${API_BASE}/customers/schools/${id}/assign-structure/`,
    SCHOOL_DELETE_WITH_STRUCTURE: (id) => `${API_BASE}/customers/schools/${id}/delete-with-structure/`,

    // Orders
    ORDERS: `${API_BASE}/orders/orders/`,
    RETURNS: `${API_BASE}/orders/returns/`,
    RETURN_REASONS: `${API_BASE}/orders/return-reasons/`,

    // Finance
    FINANCE_DASHBOARD: `${API_BASE}/finance/dashboard/`,
    FINANCE_EXPENSES: `${API_BASE}/finance/expenses/`,
    FINANCE_EXPENSE_CATEGORIES: `${API_BASE}/finance/expense-categories/`,
    FINANCE_EMPLOYEE_EXPENSES: `${API_BASE}/finance/employee-expenses/`,
    FINANCE_SALARIES: `${API_BASE}/finance/salaries/`,
    FINANCE_BANK_ACCOUNTS: `${API_BASE}/finance/bank-accounts/`,
    FINANCE_BANK_TRANSACTIONS: `${API_BASE}/finance/bank-transactions/`,
    FINANCE_LENDERS: `${API_BASE}/finance/lenders/`,
    FINANCE_LOANS: `${API_BASE}/finance/loans/`,
    FINANCE_INCOME_CATEGORIES: `${API_BASE}/finance/income-categories/`,
    FINANCE_RECURRING_EXPENSES: `${API_BASE}/finance/recurring-expenses/`,
    FINANCE_CATEGORY_BUDGETS: `${API_BASE}/finance/category-budgets/`,
    FINANCE_AUDIT_LOGS: `${API_BASE}/finance/audit-logs/`,
    FINANCE_EXPENSE_TRIPS: `${API_BASE}/finance/expense-trips/`,

    // Reports
    REPORTS_SALES: `${API_BASE}/reports/sales/`,
    REPORTS_INVENTORY: `${API_BASE}/reports/inventory/`,
    REPORTS_CUSTOMERS: `${API_BASE}/reports/customers/`,
    REPORTS_ACTIVITY: `${API_BASE}/reports/activity/`,
    REPORTS_EXPORT: `${API_BASE}/reports/export/`,
    REPORTS_FINANCE: `${API_BASE}/reports/finance/`,

    // Settings
    SETTINGS_STORE: `${API_BASE}/settings/store/`,
    SETTINGS_USERS: `${API_BASE}/settings/users/`,
    SETTINGS_ROLES: `${API_BASE}/settings/roles/`,
    SETTINGS_TAXES: `${API_BASE}/settings/taxes/`,
    SETTINGS_NOTIFICATIONS: `${API_BASE}/settings/notifications/`,
    SETTINGS_RECEIPT: `${API_BASE}/settings/receipts/`,
    SETTINGS_PAYMENT_METHODS: `${API_BASE}/settings/payment-methods/`,
    SETTINGS_UPI_ACCOUNTS: `${API_BASE}/settings/upi-accounts/`,

    // Messaging
    MESSAGING_GATEWAYS: `${API_BASE}/messaging/gateways/`,
    MESSAGING_TEMPLATES: `${API_BASE}/messaging/templates/`,
    MESSAGING_QUEUE: `${API_BASE}/messaging/queue/`,

    // Token
    TOKEN_REFRESH: `${API_BASE}/token/refresh/`,
};

export default API_BASE;
