import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';

import './CustomerReports.css';

export default function CustomerReports() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState(null);
    const [topCustomers, setTopCustomers] = useState([]);
    const [rfmData, setRfmData] = useState([]);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [summaryRes, topRes, rfmRes] = await Promise.all([
                fetchWithAuth(`${ENDPOINTS.REPORTS_CUSTOMERS}summary/`),
                fetchWithAuth(`${ENDPOINTS.REPORTS_CUSTOMERS}top/`),
                fetchWithAuth(`${ENDPOINTS.REPORTS_CUSTOMERS}rfm/`)
            ]);

            if (summaryRes.ok) setSummary(await summaryRes.json());
            if (topRes.ok) setTopCustomers(await topRes.json());
            if (rfmRes.ok) setRfmData(await rfmRes.json());
        } catch (error) {
            console.error('Error fetching customer data:', error);
        } finally {
            setLoading(false);
        }
    };

    const exportCSV = async () => {
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.REPORTS_CUSTOMERS}export/`);
            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `customer_report.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Export failed:', error);
        }
    };

    const rfmSegments = [
        { name: 'Champions', description: 'Best customers who buy often', color: '#22c55e', icon: '🏆' },
        { name: 'Loyal', description: 'Regular customers with high spend', color: '#40cdba', icon: '💎' },
        { name: 'Potential Loyalists', description: 'Recent buyers who could become loyal', color: '#388bfd', icon: '⭐' },
        { name: 'At Risk', description: 'Used to buy often but not recently', color: '#f59e0b', icon: '⚠️' },
        { name: 'Lost', description: 'Haven\'t purchased in a long time', color: '#ef4444', icon: '💤' }
    ];

    if (loading) {
        return <div className="reports-loading">Loading customer reports...</div>;
    }

    return (
        <div className="customer-reports-page">
            <header className="reports-header">
                <button className="export-btn" onClick={exportCSV}>📥 Export</button>
            </header>

            {/* Summary Cards */}
            <div className="customer-summary-grid">
                <div className="customer-summary-card">
                    <div className="summary-icon">👤</div>
                    <div className="summary-content">
                        <span className="summary-value">{summary?.total_customers || 0}</span>
                        <span className="summary-label">Total Customers</span>
                    </div>
                </div>
                <div className="customer-summary-card">
                    <div className="summary-icon">✅</div>
                    <div className="summary-content">
                        <span className="summary-value">{summary?.active_customers || 0}</span>
                        <span className="summary-label">Active (30 days)</span>
                    </div>
                </div>
                <div className="customer-summary-card">
                    <div className="summary-icon">🆕</div>
                    <div className="summary-content">
                        <span className="summary-value">{summary?.new_customers || 0}</span>
                        <span className="summary-label">New This Month</span>
                    </div>
                </div>
                <div className="customer-summary-card">
                    <div className="summary-icon">🔄</div>
                    <div className="summary-content">
                        <span className="summary-value">{summary?.repeat_customers || 0}</span>
                        <span className="summary-label">Repeat Customers</span>
                    </div>
                </div>
            </div>

            <div className="reports-grid">
                {/* Top Customers */}
                <div className="report-card">
                    <h3>Top Customers by Value</h3>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th>Orders</th>
                                <th>Total Spent</th>
                                <th>CLV</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topCustomers.slice(0, 10).map((customer, idx) => (
                                <tr key={idx}>
                                    <td>
                                        <div className="customer-info">
                                            <span className="customer-rank">#{idx + 1}</span>
                                            <span>{customer.name}</span>
                                        </div>
                                    </td>
                                    <td>{customer.order_count}</td>
                                    <td>{currency}{customer.total_spent?.toLocaleString()}</td>
                                    <td>{currency}{customer.clv?.toLocaleString()}</td>
                                </tr>
                            ))}
                            {topCustomers.length === 0 && (
                                <tr><td colSpan="4">No data available</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* RFM Segmentation */}
                <h3 className="section-title">RFM Segmentation</h3>
                <div className="report-card">
                    <div className="rfm-grid">
                        {rfmSegments.map((segment, idx) => {
                            const count = rfmData.find(r => r.segment === segment.name)?.count || 0;
                            return (
                                <div
                                    key={idx}
                                    className="rfm-segment-card"
                                    style={{ borderColor: segment.color }}
                                >
                                    <div className="rfm-header">
                                        <span className="rfm-icon">{segment.icon}</span>
                                        <span className="rfm-name" style={{ color: segment.color }}>{segment.name}</span>
                                    </div>
                                    <span className="rfm-count">{count}</span>
                                    <span className="rfm-desc">{segment.description}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* CLV Insights */}
            <div className="clv-section">
                <h3>Customer Lifetime Value Insights</h3>
                <div className="clv-grid">
                    <div className="clv-card">
                        <span className="clv-label">Average CLV</span>
                        <span className="clv-value">{currency}{summary?.avg_clv?.toLocaleString() || '0'}</span>
                    </div>
                    <div className="clv-card">
                        <span className="clv-label">Avg Order Value</span>
                        <span className="clv-value">{currency}{summary?.avg_order_value?.toFixed(2) || '0'}</span>
                    </div>
                    <div className="clv-card">
                        <span className="clv-label">Avg Orders/Customer</span>
                        <span className="clv-value">{summary?.avg_orders_per_customer?.toFixed(1) || '0'}</span>
                    </div>
                </div>
            </div>

        </div>
    );
}
