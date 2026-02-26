import { Link } from 'react-router-dom';
import './LowStockWidget.css';

export default function LowStockWidget({ items }) {
    return (
        <div className="low-stock-widget">
            <div className="widget-header">
                <h3>Low Stock Alerts</h3>
            </div>
            <div className="table-container">
                <table className="widget-table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Stock</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.isArray(items) && items.map(item => (
                            <tr key={item.id}>
                                <td>
                                    <Link to={`/inventory/params?id=${item.id}`} className="product-link">
                                        {item.name || 'Unknown'}
                                    </Link>
                                </td>
                                <td>{item.stock_quantity ?? item.stock ?? 0}</td>
                                <td>
                                    <span className="stock-badge low">Low</span>
                                </td>
                            </tr>
                        ))}
                        {(!Array.isArray(items) || items.length === 0) && (
                            <tr><td colSpan="3" className="empty-state">No low stock items</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
