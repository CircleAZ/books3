import api from './api';

export const getPurchaseOrders = async () => {
    const response = await api.get('/procurement/purchase-orders/');
    return response.data;
};

export const getPurchaseOrder = async (id) => {
    const response = await api.get(`/procurement/purchase-orders/${id}/`);
    return response.data;
};

export const createPurchaseOrder = async (data) => {
    const response = await api.post('/procurement/purchase-orders/create-po/', data);
    return response.data;
};

export const receivePurchaseOrder = async (id, items) => {
    const response = await api.post(`/procurement/purchase-orders/${id}/receive/`, { items });
    return response.data;
};

export const getTransporters = async () => {
    const response = await api.get('/procurement/transporters/');
    return response.data;
};

export const addCharge = async (data) => {
    const response = await api.post('/procurement/purchase-charges/', data);
    return response.data;
};

export const addPayment = async (data) => {
    const response = await api.post('/procurement/purchase-payments/', data);
    return response.data;
};
