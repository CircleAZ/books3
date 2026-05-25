/**
 * Procurement Service
 * 
 * Provides endpoint URLs for procurement API calls.
 * Components use fetchWithAuth() from AuthContext with these endpoints.
 */
import { API_BASE } from '../config/api';

export const PROCUREMENT_ENDPOINTS = {
    PURCHASE_ORDERS: `${API_BASE}/procurement/purchase-orders/`,
    CREATE_PO: `${API_BASE}/procurement/purchase-orders/create-po/`,
    ANALYTICS: `${API_BASE}/procurement/purchase-orders/analytics/`,
    TRANSPORTERS: `${API_BASE}/procurement/transporters/`,
    CHARGES: `${API_BASE}/procurement/purchase-charges/`,
    PAYMENTS: `${API_BASE}/procurement/purchase-payments/`,
};

export const getPurchaseOrderUrl = (id) =>
    `${PROCUREMENT_ENDPOINTS.PURCHASE_ORDERS}${id}/`;

export const getReceiveUrl = (id) =>
    `${PROCUREMENT_ENDPOINTS.PURCHASE_ORDERS}${id}/receive/`;

export const getReverseUrl = (id) =>
    `${PROCUREMENT_ENDPOINTS.PURCHASE_ORDERS}${id}/reverse/`;
