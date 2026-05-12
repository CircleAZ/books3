import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PROCUREMENT_ENDPOINTS } from '../../services/procurementService';

const DATE_PRESETS = [
    { label: 'This Week', value: 'week' },
    { label: 'This Month', value: 'month' },
    { label: 'Quarter', value: 'quarter' },
    { label: 'Year', value: 'year' },
    { label: 'All Time', value: 'all' },
];

export default function ProcurementList() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('orders');
    const [analytics, setAnalytics] = useState(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [period, setPeriod] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const { fetchWithAuth } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => { fetchOrders(); }, [location.key]);
    useEffect(() => { if (activeTab === 'analytics') fetchAnalytics(); }, [activeTab, period, startDate, endDate]);

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

    const fetchAnalytics = useCallback(async () => {
        setAnalyticsLoading(true);
        try {
            let url = PROCUREMENT_ENDPOINTS.ANALYTICS;
            if (startDate && endDate) {
                url += `?start_date=${startDate}&end_date=${endDate}`;
            } else {
                url += `?period=${period}`;
            }
            const res = await fetchWithAuth(url);
            if (res.ok) setAnalytics(await res.json());
        } catch (e) {
            console.error("Failed to load analytics", e);
        } finally {
            setAnalyticsLoading(false);
        }
    }, [period, startDate, endDate]);

    const getStatusColor = (status) => {
        const map = {
            draft: '#6b7280', ordered: '#3b82f6',
            partially_received: '#f59e0b', received: '#10b981',
            cancelled: '#ef4444',
        };
        return map[status] || '#6b7280';
    };

    const fmt = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <div className="page-container">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Procurement Engine</h1>
                    <p style={{ color: 'var(--color-text-secondary)', margin: '4px 0 0', fontSize: '0.85rem' }}>
                        Purchase orders, receiving &amp; cost analytics
                    </p>
                </div>
                <button className="btn btn-primary" onClick={() => navigate('/procurement/new')}>+ Create PO</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '2px solid var(--color-border)' }}>
                {['orders', 'analytics'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{
                        padding: '10px 20px', fontSize: '0.9rem', fontWeight: 600,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
                        marginBottom: '-2px', transition: 'all 0.2s',
                    }}>
                        {tab === 'orders' ? 'Purchase Orders' : 'Cost Analytics'}
                    </button>
                ))}
            </div>

            {/* Orders Tab */}
            {activeTab === 'orders' && (
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
                                <div key={order.id} onClick={() => navigate(`/procurement/${order.id}`)} className="card"
                                    style={{ cursor: 'pointer', padding: '1rem 1.25rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <h4 style={{ margin: 0, fontSize: '1rem' }}>{order.display_id || `PO #${order.id}`}</h4>
                                        <span style={{
                                            fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: '12px',
                                            background: getStatusColor(order.status) + '22', color: getStatusColor(order.status),
                                        }}>{order.status?.replace(/_/g, ' ')}</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                        <p style={{ margin: '2px 0' }}><strong>Vendor:</strong> {order.vendor_name || '—'}</p>
                                        <p style={{ margin: '2px 0' }}><strong>Total:</strong> {fmt(order.total_amount)}</p>
                                        <p style={{ margin: '2px 0' }}><strong>Payment:</strong> {order.payment_status}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Analytics Tab */}
            {activeTab === 'analytics' && (
                <div>
                    {/* Date Filter Row */}
                    <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center',
                        marginBottom: '1.5rem', padding: '1rem', borderRadius: '12px',
                        background: 'var(--color-surface-raised, var(--color-surface))',
                        border: '1px solid var(--color-border)',
                    }}>
                        {DATE_PRESETS.map(p => (
                            <button key={p.value} onClick={() => { setPeriod(p.value); setStartDate(''); setEndDate(''); }}
                                style={{
                                    padding: '6px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600,
                                    border: period === p.value && !startDate ? '1.5px solid var(--color-primary)' : '1.5px solid var(--color-border)',
                                    background: period === p.value && !startDate ? 'var(--color-primary-bg, rgba(59,130,246,0.1))' : 'transparent',
                                    color: period === p.value && !startDate ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                }}>
                                {p.label}
                            </button>
                        ))}
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', margin: '0 4px' }}>or</span>
                        <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPeriod('custom'); }}
                            style={{ padding: '6px 10px', borderRadius: '8px', border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', fontSize: '0.8rem' }} />
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>to</span>
                        <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPeriod('custom'); }}
                            style={{ padding: '6px 10px', borderRadius: '8px', border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', fontSize: '0.8rem' }} />
                    </div>

                    {analyticsLoading ? (
                        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '3rem 0' }}>Loading analytics...</p>
                    ) : analytics ? (
                        <>
                            {/* Metric Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                                <MetricCard label="Total Spend" value={fmt(analytics.global.total_spend)} />
                                <MetricCard label="Goods Value" value={fmt(analytics.global.total_goods)} />
                                <MetricCard label="Total Charges" value={fmt(analytics.global.total_charges)}
                                    accent={analytics.global.total_charges > 0 ? '#f59e0b' : undefined} />
                                <MetricCard label="Avg Charge Inflation" value={`+${analytics.global.charge_ratio_pct}%`}
                                    accent={analytics.global.charge_ratio_pct > 10 ? '#ef4444' : analytics.global.charge_ratio_pct > 5 ? '#f59e0b' : '#10b981'} />
                            </div>

                            {/* Vendor Performance */}
                            {analytics.vendors?.length > 0 && (
                                <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
                                    <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>Vendor Hidden Costs</h3>
                                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                                        {analytics.vendors.map((v, i) => (
                                            <div key={v.id} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '8px 12px', borderRadius: '8px',
                                                background: i === 0 ? 'rgba(239,68,68,0.06)' : 'transparent',
                                            }}>
                                                <div>
                                                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{v.name}</span>
                                                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', marginLeft: '8px' }}>
                                                        {fmt(v.goods_value)} goods + {fmt(v.charges)} charges
                                                    </span>
                                                </div>
                                                <span style={{
                                                    fontWeight: 700, fontSize: '0.85rem',
                                                    color: v.inflation_pct > 10 ? '#ef4444' : v.inflation_pct > 5 ? '#f59e0b' : '#10b981',
                                                }}>
                                                    +{v.inflation_pct}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Item Cost Variance Table */}
                            {analytics.items?.length > 0 && (
                                <div className="card" style={{ padding: '1.25rem' }}>
                                    <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>Cost Variance (Quote vs Landed)</h3>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                                                    <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Product</th>
                                                    <th style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Quote</th>
                                                    <th style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Landed</th>
                                                    <th style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Variance</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {analytics.items.map((item, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                        <td style={{ padding: '8px 4px' }}>
                                                            {item.product_name}
                                                            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', marginLeft: '6px' }}>PO #{item.po_display_id}</span>
                                                        </td>
                                                        <td style={{ textAlign: 'right', padding: '8px 4px' }}>₹{item.vendor_quote}</td>
                                                        <td style={{ textAlign: 'right', padding: '8px 4px', fontWeight: 600 }}>₹{item.landed_cost}</td>
                                                        <td style={{
                                                            textAlign: 'right', padding: '8px 4px', fontWeight: 700,
                                                            color: item.variance_pct > 10 ? '#ef4444' : item.variance_pct > 5 ? '#f59e0b' : '#10b981',
                                                        }}>
                                                            {item.variance_pct > 0 ? '+' : ''}{item.variance_pct}%
                                                            {item.variance_pct > 10 ? ' 🔴' : item.variance_pct > 5 ? ' 🟡' : ' 🟢'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '3rem 0' }}>No analytics data available.</p>
                    )}
                </div>
            )}
        </div>
    );
}

function MetricCard({ label, value, accent }) {
    return (
        <div className="card" style={{ padding: '1.25rem', textAlign: 'center' }}>
            <p style={{ margin: '0 0 6px', fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
            <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: accent || 'var(--color-text-primary)' }}>{value}</p>
        </div>
    );
}
