import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { ENDPOINTS } from '../config/api';
import StatCard from '../components/dashboard/StatCard';
import RecentOrdersWidget from '../components/dashboard/RecentOrdersWidget';
import LowStockWidget from '../components/dashboard/LowStockWidget';
import SalesTrendChart from '../components/dashboard/SalesTrendChart';
import TopProductsChart from '../components/dashboard/TopProductsChart';
import './Dashboard.css';

export default function Dashboard() {
    const { fetchWithAuth, user } = useAuth();
    const { currency } = useCurrency();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [topProducts, setTopProducts] = useState([]);
    const [salesTrend, setSalesTrend] = useState([]);
    const [recentOrders, setRecentOrders] = useState([]);
    const [lowStockItems, setLowStockItems] = useState([]);
    const [alerts, setAlerts] = useState([]);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                // Fetch basic dashboard data
                const [statsRes, productsRes, trendRes, ordersRes, alertsRes, lowStockRes] = await Promise.all([
                    fetchWithAuth(ENDPOINTS.DASHBOARD_STATS),
                    fetchWithAuth(ENDPOINTS.DASHBOARD_TOP_PRODUCTS),
                    fetchWithAuth(ENDPOINTS.DASHBOARD_SALES_TREND),
                    fetchWithAuth(ENDPOINTS.DASHBOARD_RECENT_ORDERS),
                    fetchWithAuth(ENDPOINTS.DASHBOARD_ALERTS),
                    fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}low_stock/`) // Assuming this endpoint exists or handled by AlertsView logic
                ]);

                if (statsRes.ok) setStats(await statsRes.json());
                if (productsRes.ok) setTopProducts(await productsRes.json());
                if (trendRes.ok) setSalesTrend(await trendRes.json());
                if (ordersRes.ok) setRecentOrders(await ordersRes.json());
                if (alertsRes.ok) setAlerts(await alertsRes.json());

                // Note: Low Stock might be redundant if AlertsView handles it, but keeping for specific widget
                if (lowStockRes.ok) {
                    setLowStockItems(await lowStockRes.json());
                } else if (!lowStockRes.ok && alertsRes.ok) {
                    // Fallback: extract from alerts if specific endpoint fails (or implement endpoint)
                    // keeping simple for now, assuming low_stock endpoint is implemented or we use alerts
                }

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
                <StatCard
                    title="Today's Sales"
                    value={`${currency}${stats?.today_sales_value || '0.00'}`}
                    subtext={`${stats?.today_sales_count || 0} orders`}
                    icon="📈"
                    type="sales"
                />
                <StatCard
                    title="Pending Orders"
                    value={stats?.pending_orders_count || 0}
                    subtext={`Value: ${currency}${stats?.pending_orders_value || '0.00'}`}
                    icon="📦"
                    type="orders"
                />
                <StatCard
                    title="Recent Customers"
                    value={stats?.recent_customers_count || 0}
                    subtext="Last 7 days"
                    icon="👥"
                    type="customers"
                />
                <StatCard
                    title="Low Stock Items"
                    value={stats?.low_stock_count || 0}
                    subtext="Action required"
                    icon="📊"
                    type="inventory"
                />
            </div>

            {/* Charts Section */}
            <div className="charts-grid">
                <SalesTrendChart data={salesTrend} />
                <TopProductsChart data={topProducts} />
            </div>

            <div className="dashboard-bottom-grid">
                <RecentOrdersWidget orders={recentOrders} />

                {/*  Mixed Alerts & Low Stock - For now using LowStockWidget if we have data, else Alerts */}
                {lowStockItems.length > 0 ? (
                    <LowStockWidget items={lowStockItems} />
                ) : (
                    <div className="alerts-section">
                        <h3>Alerts & Notifications</h3>
                        <div className="alerts-list">
                            {Array.isArray(alerts) && alerts.map((alert, index) => (
                                <a href={alert.link || '#'} key={index} className={`alert-item ${alert.severity || ''}`}>
                                    <div className="alert-content">
                                        <span className="alert-message">{alert.message}</span>
                                        <span className="alert-type">{alert.type}</span>
                                    </div>
                                    <span className="alert-arrow">→</span>
                                </a>
                            ))}
                            {(!Array.isArray(alerts) || alerts.length === 0) && <p className="no-alerts">No active alerts</p>}
                        </div>
                    </div>
                )}
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
                    <a href="/reports" className="quick-action-card">
                        <span className="action-icon">📊</span>
                        <span>View Reports</span>
                    </a>
                </div>
            </section>
        </div>
    );
}