/**
 * Procurement Service
 * 
 * Provides endpoint URLs and helper functions for procurement API calls.
 * Components should use fetchWithAuth() from AuthContext with these endpoints.
 */
import { API_BASE } from '../config/api';

export const PROCUREMENT_ENDPOINTS = {
    PURCHASE_ORDERS: `${API_BASE}/procurement/purchase-orders/`,
    CREATE_PO: `${API_BASE}/procurement/purchase-orders/create-po/`,
    TRANSPORTERS: `${API_BASE}/procurement/transporters/`,
    CHARGES: `${API_BASE}/procurement/purchase-charges/`,
    PAYMENTS: `${API_BASE}/procurement/purchase-payments/`,
};

export const getPurchaseOrderUrl = (id) =>
    `${PROCUREMENT_ENDPOINTS.PURCHASE_ORDERS}${id}/`;

export const getReceiveUrl = (id) =>
    `${PROCUREMENT_ENDPOINTS.PURCHASE_ORDERS}${id}/receive/`;
