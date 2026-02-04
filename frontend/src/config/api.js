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

    // Dashboard
    DASHBOARD_STATS: `${API_BASE}/dashboard/stats/`,
    DASHBOARD_TOP_PRODUCTS: `${API_BASE}/dashboard/top-products/`,
    DASHBOARD_SALES_TREND: `${API_BASE}/dashboard/sales-trend/`,
    DASHBOARD_RECENT_ORDERS: `${API_BASE}/dashboard/recent-orders/`,
    DASHBOARD_ALERTS: `${API_BASE}/dashboard/alerts/`,

    // Token
    TOKEN_REFRESH: `${API_BASE}/token/refresh/`,
};

export default API_BASE;
