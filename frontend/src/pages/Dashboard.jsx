import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ENDPOINTS } from '../config/api';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    LineChart, Line
} from 'recharts';
import './Dashboard.css';

export default function Dashboard() {
    const { fetchWithAuth, user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [topProducts, setTopProducts] = useState([]);
    const [salesTrend, setSalesTrend] = useState([]);
    const [recentOrders, setRecentOrders] = useState([]);
    const [alerts, setAlerts] = useState([]);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const [statsRes, productsRes, trendRes, ordersRes, alertsRes] = await Promise.all([
                    fetchWithAuth(ENDPOINTS.DASHBOARD_STATS),
                    fetchWithAuth(ENDPOINTS.DASHBOARD_TOP_PRODUCTS),
                    fetchWithAuth(ENDPOINTS.DASHBOARD_SALES_TREND),
                    fetchWithAuth(ENDPOINTS.DASHBOARD_RECENT_ORDERS),
                    fetchWithAuth(ENDPOINTS.DASHBOARD_ALERTS)
                ]);

                if (statsRes.ok) setStats(await statsRes.json());
                if (productsRes.ok) setTopProducts(await productsRes.json());
                if (trendRes.ok) setSalesTrend(await trendRes.json());
                if (ordersRes.ok) setRecentOrders(await ordersRes.json());
                if (alertsRes.ok) setAlerts(await alertsRes.json());

            } catch (error) {
                console.error('Error fetching dashboard data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, [fetchWithAuth]);

    if (loading) {
        return <div className="dashboard-loading">Loading dashboard...</div>;
    }

    return (
        <div className="dashboard-page">
            <section className="welcome-section">
                <h2>Welcome back, {user?.first_name || 'User'}! 👋</h2>
                <p>Here's what's happening with your store today.</p>
            </section>

            {/* Stats Grid */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon sales">📈</div>
                    <div className="stat-info">
                        <p className="stat-value">₹{stats?.today_sales_value || '0.00'}</p>
                        <p className="stat-label">Today's Sales ({stats?.today_sales_count || 0})</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon orders">📦</div>
                    <div className="stat-info">
                        <p className="stat-value">{stats?.pending_orders_count || 0}</p>
                        <p className="stat-label">Pending Orders (₹{stats?.pending_orders_value || '0.00'})</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon customers">👥</div>
                    <div className="stat-info">
                        <p className="stat-value">{stats?.recent_customers_count || 0}</p>
                        <p className="stat-label">Recent Customers</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon inventory">📊</div>
                    <div className="stat-info">
                        <p className="stat-value">{stats?.low_stock_count || 0}</p>
                        <p className="stat-label">Low Stock Items</p>
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <div className="charts-grid">
                <div className="chart-card">
                    <h3>Sales Trend (Last 7 Days)</h3>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={salesTrend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis dataKey="date" stroke="#888" tickFormatter={(str) => new Date(str).toLocaleDateString()} />
                                <YAxis stroke="#888" />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#1e2332', borderColor: '#333' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Line type="monotone" dataKey="value" stroke="#40cdba" strokeWidth={2} dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="chart-card">
                    <h3>Top Products</h3>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topProducts} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis type="number" stroke="#888" />
                                <YAxis dataKey="name" type="category" width={100} stroke="#888" style={{ fontSize: '12px' }} />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#1e2332', borderColor: '#333' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Bar dataKey="quantity_sold" fill="#388bfd" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="dashboard-bottom-grid">
                {/* Recent Orders */}
                <div className="recent-orders-section">
                    <h3>Recent Orders</h3>
                    <div className="table-container">
                        <table className="orders-table">
                            <thead>
                                <tr>
                                    <th>Order ID</th>
                                    <th>Customer</th>
                                    <th>Total</th>
                                    <th>Status</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentOrders.map(order => (
                                    <tr key={order.id}>
                                        <td>{order.id}</td>
                                        <td>{order.customer_name}</td>
                                        <td>₹{order.total}</td>
                                        <td>
                                            <span className={`status-badge ${order.status.toLowerCase()}`}>
                                                {order.status}
                                            </span>
                                        </td>
                                        <td>{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Alerts Section */}
                <div className="alerts-section">
                    <h3>Alerts & Notifications</h3>
                    <div className="alerts-list">
                        {alerts.map((alert, index) => (
                            <a href={alert.link} key={index} className={`alert-item ${alert.severity}`}>
                                <div className="alert-content">
                                    <span className="alert-message">{alert.message}</span>
                                    <span className="alert-type">{alert.type}</span>
                                </div>
                                <span className="alert-arrow">→</span>
                            </a>
                        ))}
                        {alerts.length === 0 && <p className="no-alerts">No active alerts</p>}
                    </div>
                </div>
            </div>

            <section className="quick-actions-section">
                <h3>Quick Actions</h3>
                <div className="quick-actions-grid">
                    <a href="/orders/new" className="quick-action-card">
                        <span className="action-icon">➕</span>
                        <span>New Order</span>
                    </a>
                    <a href="/inventory/add" className="quick-action-card">
                        <span className="action-icon">📦</span>
                        <span>Add Product</span>
                    </a>
                    <a href="/customers/add" className="quick-action-card">
                        <span className="action-icon">👤</span>
                        <span>Add Customer</span>
                    </a>
                    <a href="/reports/sales" className="quick-action-card">
                        <span className="action-icon">📊</span>
                        <span>View Reports</span>
                    </a>
                </div>
            </section>
        </div>
    );
}
