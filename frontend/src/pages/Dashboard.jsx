import './Dashboard.css';

export default function Dashboard() {
    return (
        <div className="dashboard-page">
            <section className="welcome-section">
                <h2>Welcome back, John! 👋</h2>
                <p>Here's what's happening with your store today.</p>
            </section>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon sales">📈</div>
                    <div className="stat-info">
                        <p className="stat-value">₹24,500</p>
                        <p className="stat-label">Today's Sales</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon orders">📦</div>
                    <div className="stat-info">
                        <p className="stat-value">12</p>
                        <p className="stat-label">New Orders</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon customers">👥</div>
                    <div className="stat-info">
                        <p className="stat-value">5</p>
                        <p className="stat-label">New Customers</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon inventory">📊</div>
                    <div className="stat-info">
                        <p className="stat-value">8</p>
                        <p className="stat-label">Low Stock Items</p>
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
