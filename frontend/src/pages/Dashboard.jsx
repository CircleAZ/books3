import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import usePermissions from '../utils/usePermissions';
import { useCurrency } from '../context/CurrencyContext';
import { ENDPOINTS } from '../config/api';
import StatCard from '../components/dashboard/StatCard';
import RecentOrdersWidget from '../components/dashboard/RecentOrdersWidget';
import LowStockWidget from '../components/dashboard/LowStockWidget';
import SalesTrendChart from '../components/dashboard/SalesTrendChart';
import TopProductsChart from '../components/dashboard/TopProductsChart';
import CoverageWidget from '../components/dashboard/CoverageWidget';
import './Dashboard.css';

export default function Dashboard() {
    const { fetchWithAuth, user } = useAuth();
    const { hasPermission } = usePermissions();
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
                const promises = [];
                const keys = [];

                if (hasPermission('orders.view_orders') || hasPermission('reports.view_sales_reports')) {
                    promises.push(fetchWithAuth(ENDPOINTS.DASHBOARD_STATS));
                    keys.push('stats');
                    promises.push(fetchWithAuth(ENDPOINTS.DASHBOARD_SALES_TREND));
                    keys.push('trend');
                    promises.push(fetchWithAuth(ENDPOINTS.DASHBOARD_RECENT_ORDERS));
                    keys.push('orders');
                }

                if (hasPermission('inventory.view_products')) {
                    promises.push(fetchWithAuth(ENDPOINTS.DASHBOARD_TOP_PRODUCTS));
                    keys.push('products');
                    promises.push(fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}low_stock/`));
                    keys.push('lowStock');
                }

                // Alerts can be basic or require specific perms
                promises.push(fetchWithAuth(ENDPOINTS.DASHBOARD_ALERTS));
                keys.push('alerts');

                const results = await Promise.all(promises);

                for (let i = 0; i < results.length; i++) {
                    const res = results[i];
                    const key = keys[i];
                    if (res.ok) {
                        const data = await res.json();
                        if (key === 'stats') setStats(data);
                        if (key === 'trend') setSalesTrend(data);
                        if (key === 'orders') setRecentOrders(data);
                        if (key === 'products') setTopProducts(data);
                        if (key === 'lowStock') setLowStockItems(data.results || data);
                        if (key === 'alerts') setAlerts(data);
                    }
                }
            } catch (error) {
                console.error('Error fetching dashboard data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, [fetchWithAuth, hasPermission]);

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
            {(hasPermission('orders.view_orders') || hasPermission('reports.view_sales_reports') || hasPermission('inventory.view_products')) && (
                <div className="stats-grid">
                    {(hasPermission('orders.view_orders') || hasPermission('reports.view_sales_reports')) && (
                        <>
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
                        </>
                    )}
                    {hasPermission('inventory.view_products') && (
                        <StatCard
                            title="Low Stock Items"
                            value={stats?.low_stock_count || 0}
                            subtext="Action required"
                            icon="📊"
                            type="inventory"
                        />
                    )}
                </div>
            )}

            {/* Charts Section */}
            {(hasPermission('orders.view_orders') || hasPermission('reports.view_sales_reports')) && (
                <div className="charts-grid">
                    <SalesTrendChart data={salesTrend} />
                    {hasPermission('inventory.view_products') && <TopProductsChart data={topProducts} />}
                </div>
            )}

            <div className="dashboard-bottom-grid">
                {hasPermission('orders.view_orders') && <RecentOrdersWidget orders={recentOrders} />}

                {/*  Mixed Alerts & Low Stock - For now using LowStockWidget if we have data, else Alerts */}
                {hasPermission('inventory.view_products') && lowStockItems.length > 0 ? (
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

                {hasPermission('reports.view_sales_reports') && <CoverageWidget />}
            </div>

            <section className="quick-actions-section">
                <h3>Quick Actions</h3>
                <div className="quick-actions-grid">
                    {hasPermission('orders.create_orders') && (
                        <a href="/orders/new" className="quick-action-card">
                            <span className="action-icon">➕</span>
                            <span>New Order</span>
                        </a>
                    )}
                    {hasPermission('inventory.manage_products') && (
                        <a href="/inventory/add" className="quick-action-card">
                            <span className="action-icon">📦</span>
                            <span>Add Product</span>
                        </a>
                    )}
                    {hasPermission('customers.manage_customers') && (
                        <a href="/customers/add" className="quick-action-card">
                            <span className="action-icon">👤</span>
                            <span>Add Customer</span>
                        </a>
                    )}
                    {hasPermission('reports.view_sales_reports') && (
                        <a href="/reports" className="quick-action-card">
                            <span className="action-icon">📊</span>
                            <span>View Reports</span>
                        </a>
                    )}
                </div>
            </section>
        </div>
    );
}