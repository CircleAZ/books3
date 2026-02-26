import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import './InventoryReports.css';

export default function InventoryReports() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const [loading, setLoading] = useState(true);
    const [valuation, setValuation] = useState(null);
    const [lowStock, setLowStock] = useState([]);
    const [deadStock, setDeadStock] = useState([]);
    const [movement, setMovement] = useState(null);
    const [aging, setAging] = useState(null);
    const [turnover, setTurnover] = useState(null);
    const [activeTab, setActiveTab] = useState('valuation');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [valuationRes, lowStockRes, deadStockRes, movementRes, agingRes, turnoverRes] = await Promise.all([
                fetchWithAuth(`${ENDPOINTS.REPORTS_INVENTORY}valuation/`),
                fetchWithAuth(`${ENDPOINTS.REPORTS_INVENTORY}low_stock/`),
                fetchWithAuth(`${ENDPOINTS.REPORTS_INVENTORY}dead_stock/`),
                fetchWithAuth(`${ENDPOINTS.REPORTS_INVENTORY}movement/`),
                fetchWithAuth(`${ENDPOINTS.REPORTS_INVENTORY}aging/`),
                fetchWithAuth(`${ENDPOINTS.REPORTS_INVENTORY}turnover/`)
            ]);

            if (valuationRes.ok) setValuation(await valuationRes.json());
            if (lowStockRes.ok) setLowStock(await lowStockRes.json());
            if (deadStockRes.ok) setDeadStock(await deadStockRes.json());
            if (movementRes.ok) setMovement(await movementRes.json());
            if (agingRes.ok) setAging(await agingRes.json());
            if (turnoverRes.ok) setTurnover(await turnoverRes.json());
        } catch (error) {
            console.error('Error fetching inventory data:', error);
        } finally {
            setLoading(false);
        }
    };

    const exportCSV = async (type) => {
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.REPORTS_INVENTORY}export/?type=${type}`);
            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `inventory_${type}.csv`;
                a.click();
            }
        } catch (error) {
            console.error('Export failed:', error);
        }
    };

    if (loading) {
        return <div className="reports-loading">Loading inventory reports...</div>;
    }

    return (
        <div className="inventory-reports-page">
            <header className="reports-header">
                <h1>📦 Inventory Reports</h1>
                <button className="export-btn" onClick={() => exportCSV('all')}>
                    📥 Export All
                </button>
            </header>

            {/* Valuation Summary */}
            <div className="valuation-grid">
                <div className="valuation-card cost">
                    <div className="valuation-icon">💵</div>
                    <div className="valuation-content">
                        <span className="valuation-value">{currency}{valuation?.total_cost_value?.toLocaleString() || '0'}</span>
                        <span className="valuation-label">Total Cost Value</span>
                    </div>
                </div>
                <div className="valuation-card selling">
                    <div className="valuation-icon">💰</div>
                    <div className="valuation-content">
                        <span className="valuation-value">{currency}{valuation?.total_selling_value?.toLocaleString() || '0'}</span>
                        <span className="valuation-label">Total Selling Value</span>
                    </div>
                </div>
                <div className="valuation-card profit">
                    <div className="valuation-icon">📈</div>
                    <div className="valuation-content">
                        <span className="valuation-value">{currency}{valuation?.potential_profit?.toLocaleString() || '0'}</span>
                        <span className="valuation-label">Potential Profit</span>
                    </div>
                </div>
                <div className="valuation-card items">
                    <div className="valuation-icon">📊</div>
                    <div className="valuation-content">
                        <span className="valuation-value">{valuation?.total_items || 0}</span>
                        <span className="valuation-label">Total SKUs</span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="report-tabs">
                <button
                    className={activeTab === 'valuation' ? 'active' : ''}
                    onClick={() => setActiveTab('valuation')}
                >Stock Valuation</button>
                <button
                    className={activeTab === 'lowstock' ? 'active' : ''}
                    onClick={() => setActiveTab('lowstock')}
                >Low Stock ({lowStock.length})</button>
                <button
                    className={activeTab === 'deadstock' ? 'active' : ''}
                    onClick={() => setActiveTab('deadstock')}
                >Dead Stock ({deadStock.length})</button>
                <button
                    className={activeTab === 'movement' ? 'active' : ''}
                    onClick={() => setActiveTab('movement')}
                >Stock Movement</button>
                <button
                    className={activeTab === 'aging' ? 'active' : ''}
                    onClick={() => setActiveTab('aging')}
                >Aging Stock</button>
                <button
                    className={activeTab === 'turnover' ? 'active' : ''}
                    onClick={() => setActiveTab('turnover')}
                >Turnover Rate</button>
            </div>

            {/* Tab Content */}
            <div className="tab-content">
                {activeTab === 'valuation' && (
                    <div className="table-card">
                        <h3>Stock Valuation by Product</h3>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Stock</th>
                                    <th>Cost Price</th>
                                    <th>Sell Price</th>
                                    <th>Cost Value</th>
                                    <th>Sell Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(valuation?.products || []).slice(0, 20).map((item, idx) => (
                                    <tr key={idx}>
                                        <td>{item.name}</td>
                                        <td>{item.stock}</td>
                                        <td>{currency}{item.cost_price}</td>
                                        <td>{currency}{item.selling_price}</td>
                                        <td>{currency}{item.cost_value?.toLocaleString()}</td>
                                        <td>{currency}{item.sell_value?.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'lowstock' && (
                    <div className="table-card">
                        <h3>Low Stock Items</h3>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Current Stock</th>
                                    <th>Reorder Point</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lowStock.map((item, idx) => (
                                    <tr key={idx}>
                                        <td>{item.name}</td>
                                        <td>{item.stock_quantity}</td>
                                        <td>{item.reorder_point}</td>
                                        <td>
                                            <span className={`status-badge ${item.stock_quantity === 0 ? 'out' : 'low'}`}>
                                                {item.stock_quantity === 0 ? 'Out of Stock' : 'Low Stock'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {lowStock.length === 0 && (
                                    <tr><td colSpan="4">No low stock items</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'deadstock' && (
                    <div className="table-card">
                        <h3>Dead Stock (No sales in 30+ days)</h3>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Stock</th>
                                    <th>Last Sold</th>
                                    <th>Days Since Sale</th>
                                </tr>
                            </thead>
                            <tbody>
                                {deadStock.map((item, idx) => (
                                    <tr key={idx}>
                                        <td>{item.name}</td>
                                        <td>{item.stock_quantity}</td>
                                        <td>{item.last_sold || 'Never'}</td>
                                        <td>{item.days_since_sale || '—'}</td>
                                    </tr>
                                ))}
                                {deadStock.length === 0 && (
                                    <tr><td colSpan="4">No dead stock items</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'movement' && movement && (
                    <div className="table-card">
                        <h3>Stock Movement Summary</h3>
                        <div className="valuation-grid" style={{ marginBottom: '1rem' }}>
                            <div className="valuation-card cost">
                                <div className="valuation-content">
                                    <span className="valuation-value" style={{ color: '#22c55e' }}>+{movement.total_inflows}</span>
                                    <span className="valuation-label">Total Inflows</span>
                                </div>
                            </div>
                            <div className="valuation-card selling">
                                <div className="valuation-content">
                                    <span className="valuation-value" style={{ color: '#ef4444' }}>-{movement.total_outflows}</span>
                                    <span className="valuation-label">Total Outflows</span>
                                </div>
                            </div>
                            <div className="valuation-card profit">
                                <div className="valuation-content">
                                    <span className="valuation-value">{movement.net_change > 0 ? '+' : ''}{movement.net_change}</span>
                                    <span className="valuation-label">Net Change</span>
                                </div>
                            </div>
                        </div>
                        <h4>By Reason</h4>
                        <table className="data-table">
                            <thead>
                                <tr><th>Reason</th><th>Qty Change</th><th>Entries</th></tr>
                            </thead>
                            <tbody>
                                {(movement.summary_by_reason || []).map((r, i) => (
                                    <tr key={i}>
                                        <td style={{ textTransform: 'capitalize' }}>{r.reason}</td>
                                        <td>{r.total_quantity}</td>
                                        <td>{r.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <h4 style={{ marginTop: '1rem' }}>Recent Movements</h4>
                        <table className="data-table">
                            <thead>
                                <tr><th>Product</th><th>Change</th><th>After</th><th>Reason</th><th>By</th><th>Date</th></tr>
                            </thead>
                            <tbody>
                                {(movement.recent_movements || []).map((m, i) => (
                                    <tr key={i}>
                                        <td>{m.product}</td>
                                        <td style={{ color: m.quantity_change > 0 ? '#22c55e' : '#ef4444' }}>
                                            {m.quantity_change > 0 ? '+' : ''}{m.quantity_change}
                                        </td>
                                        <td>{m.quantity_after}</td>
                                        <td style={{ textTransform: 'capitalize' }}>{m.reason}</td>
                                        <td>{m.created_by}</td>
                                        <td>{new Date(m.created_at).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'aging' && aging && (
                    <div className="table-card">
                        <h3>Aging Stock ({aging.days_threshold}+ days without sale)</h3>
                        <div className="valuation-grid" style={{ marginBottom: '1rem' }}>
                            <div className="valuation-card cost">
                                <div className="valuation-content">
                                    <span className="valuation-value">{aging.product_count}</span>
                                    <span className="valuation-label">Products</span>
                                </div>
                            </div>
                            <div className="valuation-card selling">
                                <div className="valuation-content">
                                    <span className="valuation-value">{currency}{Number(aging.total_value).toLocaleString()}</span>
                                    <span className="valuation-label">Tied-up Capital</span>
                                </div>
                            </div>
                        </div>
                        <table className="data-table">
                            <thead>
                                <tr><th>Product</th><th>SKU</th><th>Stock</th><th>Cost Price</th><th>Total Value</th></tr>
                            </thead>
                            <tbody>
                                {(aging.products || []).map((p, i) => (
                                    <tr key={i}>
                                        <td>{p.name}</td>
                                        <td>{p.sku}</td>
                                        <td>{p.stock_quantity}</td>
                                        <td>{currency}{Number(p.cost_price).toLocaleString()}</td>
                                        <td>{currency}{Number(p.inventory_value).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {(aging.products || []).length === 0 && (
                                    <tr><td colSpan="5">No aging stock found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'turnover' && turnover && (
                    <div className="table-card">
                        <h3>Inventory Turnover Rate</h3>
                        <div className="valuation-grid">
                            <div className="valuation-card cost">
                                <div className="valuation-content">
                                    <span className="valuation-value">{turnover.turnover_rate}x</span>
                                    <span className="valuation-label">Period Turnover</span>
                                </div>
                            </div>
                            <div className="valuation-card selling">
                                <div className="valuation-content">
                                    <span className="valuation-value">{turnover.annualized_rate}x</span>
                                    <span className="valuation-label">Annualized Rate</span>
                                </div>
                            </div>
                            <div className="valuation-card profit">
                                <div className="valuation-content">
                                    <span className="valuation-value">{turnover.days_to_sell || '—'}</span>
                                    <span className="valuation-label">Days to Sell</span>
                                </div>
                            </div>
                            <div className="valuation-card items">
                                <div className="valuation-content">
                                    <span className="valuation-value">{currency}{Number(turnover.cogs).toLocaleString()}</span>
                                    <span className="valuation-label">COGS ({turnover.period_days}d)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
