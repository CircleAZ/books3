import { useCurrency } from '../../context/CurrencyContext';
import './RecentOrdersWidget.css';

export default function RecentOrdersWidget({ orders }) {
    const { currency } = useCurrency();
    return (
// fallow-ignore-next-line code-duplication
        <div className="recent-orders-widget">
            <div className="widget-header">
                <h3>Recent Orders</h3>
            </div>
            <div className="table-container">
                <table className="widget-table">
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
                        {Array.isArray(orders) && orders.map(order => (
                            <tr key={order.id}>
                                <td>#{order.id}</td>
                                <td>{order.customer_name}</td>
                                <td>{currency}{order.total}</td>
                                <td>
                                    <span className={`status-badge ${(order.status || '').toLowerCase()}`}>
                                        {order.status}
                                    </span>
                                </td>
                                <td>{order.created_at ? new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                            </tr>
                        ))}
                        {(!Array.isArray(orders) || orders.length === 0) && (
                            <tr><td colSpan="5" className="empty-state">No recent orders</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
