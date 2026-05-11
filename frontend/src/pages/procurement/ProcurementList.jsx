import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PROCUREMENT_ENDPOINTS } from '../../services/procurementService';

export default function ProcurementList() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const { fetchWithAuth } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        fetchOrders();
    }, [location.key]);

    const fetchOrders = async () => {
        try {
            const response = await fetchWithAuth(PROCUREMENT_ENDPOINTS.PURCHASE_ORDERS);
            if (response.ok) {
                const data = await response.json();
                setOrders(Array.isArray(data) ? data : data.results || []);
            }
        } catch (error) {
            console.error("Failed to load purchase orders", error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status) => {
        const map = {
            draft: '#6b7280',
            ordered: '#3b82f6',
            partially_received: '#f59e0b',
            received: '#10b981',
            cancelled: '#ef4444',
        };
        return map[status] || '#6b7280';
    };

    return (
        <div className="page-container">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Purchase Orders</h1>
                    <p style={{ color: 'var(--color-text-secondary)', margin: '4px 0 0', fontSize: '0.85rem' }}>
                        Manage procurement &amp; receiving
                    </p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => navigate('/procurement/new')}
                >
                    + Create PO
                </button>
            </div>

            <div className="content-area">
                {loading ? (
                    <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '3rem 0' }}>Loading purchase orders...</p>
                ) : orders.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--color-text-secondary)' }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4, marginBottom: '1rem' }}>
                            <rect x="1" y="3" width="15" height="13"></rect>
                            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                            <circle cx="5.5" cy="18.5" r="2.5"></circle>
                            <circle cx="18.5" cy="18.5" r="2.5"></circle>
                        </svg>
                        <h3 style={{ margin: '0 0 8px', color: 'var(--color-text-primary)' }}>No Purchase Orders</h3>
                        <p style={{ margin: 0 }}>Create your first purchase order to start tracking procurement.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {orders.map(order => (
                            <div
                                key={order.id}
                                onClick={() => navigate(`/procurement/${order.id}`)}
                                className="card"
                                style={{ cursor: 'pointer', padding: '1rem 1.25rem' }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <h4 style={{ margin: 0, fontSize: '1rem' }}>{order.display_id || `PO #${order.id}`}</h4>
                                    <span style={{
                                        fontSize: '0.75rem', fontWeight: 600,
                                        padding: '2px 10px', borderRadius: '12px',
                                        background: getStatusColor(order.status) + '22',
                                        color: getStatusColor(order.status),
                                    }}>
                                        {order.status?.replace(/_/g, ' ')}
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                    <p style={{ margin: '2px 0' }}><strong>Vendor:</strong> {order.vendor_name || '—'}</p>
                                    <p style={{ margin: '2px 0' }}><strong>Total:</strong> ₹{order.total_amount}</p>
                                    <p style={{ margin: '2px 0' }}><strong>Payment:</strong> {order.payment_status}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
