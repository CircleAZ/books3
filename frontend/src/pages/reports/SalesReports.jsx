import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar
} from 'recharts';
import './SalesReports.css';

export default function SalesReports() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState('week');
    const [summary, setSummary] = useState(null);
    const [topProducts, setTopProducts] = useState([]);
    const [trends, setTrends] = useState([]);
    const [salesByCustomer, setSalesByCustomer] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);

    useEffect(() => {
        fetchData();
    }, [dateRange]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = `?period=${dateRange}`;
            const [summaryRes, productsRes, trendsRes, customerRes, paymentRes] = await Promise.all([
                fetchWithAuth(`${ENDPOINTS.REPORTS_SALES}summary/${params}`),
                fetchWithAuth(`${ENDPOINTS.REPORTS_SALES}top_products/${params}`),
                fetchWithAuth(`${ENDPOINTS.REPORTS_SALES}trends/${params}`),
                fetchWithAuth(`${ENDPOINTS.REPORTS_SALES}by_customer/${params}`),
                fetchWithAuth(`${ENDPOINTS.REPORTS_SALES}by_payment_method/${params}`)
            ]);

            if (summaryRes.ok) setSummary(await summaryRes.json());
            if (productsRes.ok) setTopProducts(await productsRes.json());
            if (trendsRes.ok) setTrends(await trendsRes.json());
            if (customerRes.ok) setSalesByCustomer(await customerRes.json());
            if (paymentRes.ok) setPaymentMethods(await paymentRes.json());
        } catch (error) {
            console.error('Error fetching sales data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async (fmt = 'csv') => {
        try {
            const formatParam = fmt === 'xlsx' ? '&file_format=xlsx' : '';
// fallow-ignore-next-line code-duplication
            const res = await fetchWithAuth(`${ENDPOINTS.REPORTS_SALES}export/?period=${dateRange}${formatParam}`);
            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
// fallow-ignore-next-line code-duplication
                a.download = `sales_report_${dateRange}.${fmt}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Export failed:', error);
        }
    };

    if (loading) {
        return <div className="reports-loading">Loading sales reports...</div>;
    }

    return (
        <div className="sales-reports-page">
            <header className="reports-header">
                <div className="header-actions">
                    <div className="date-filter">
                        <button
                            className={dateRange === 'today' ? 'active' : ''}
                            onClick={() => setDateRange('today')}
                        >Today</button>
                        <button
                            className={dateRange === 'week' ? 'active' : ''}
                            onClick={() => setDateRange('week')}
                        >This Week</button>
                        <button
                            className={dateRange === 'month' ? 'active' : ''}
                            onClick={() => setDateRange('month')}
                        >This Month</button>
                    </div>
                    <div className="export-buttons">
                        <button className="export-btn" onClick={() => handleExport('csv')}>
                            📥 Export CSV
                        </button>
                        <button className="export-btn excel" onClick={() => handleExport('xlsx')}>
                            📊 Export Excel
                        </button>
                    </div>
                </div>
            </header>

            {/* Summary Cards */}
            <div className="summary-grid">
                <div className="summary-card">
                    <div className="card-icon">💰</div>
                    <div className="card-content">
                        <span className="card-value">{currency}{summary?.total_sales?.toLocaleString() || '0'}</span>
                        <span className="card-label">Total Sales</span>
                    </div>
                </div>
                <div className="summary-card">
                    <div className="card-icon">📦</div>
                    <div className="card-content">
                        <span className="card-value">{summary?.order_count || 0}</span>
                        <span className="card-label">Orders</span>
                    </div>
                </div>
                <div className="summary-card">
                    <div className="card-icon">📊</div>
                    <div className="card-content">
                        <span className="card-value">{currency}{summary?.average_order_value?.toFixed(2) || '0'}</span>
                        <span className="card-label">Avg Order Value</span>
                    </div>
                </div>
                <div className="summary-card">
                    <div className="card-icon">👥</div>
                    <div className="card-content">
                        <span className="card-value">{summary?.unique_customers || 0}</span>
                        <span className="card-label">Unique Customers</span>
                    </div>
                </div>
            </div>

            {/* Charts Row */}
            <div className="charts-row">
                <div className="chart-card">
                    <h3>Sales Trend</h3>
                    <div
                        className="chart-container"
                        role="img"
                        aria-label="Line chart showing sales trend over time. Total sales displayed by date."
                    >
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={trends}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis dataKey="date" stroke="#888" />
                                <YAxis stroke="#888" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e2332', borderColor: '#333' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Line type="monotone" dataKey="total" stroke="#40cdba" strokeWidth={2} dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="chart-card">
                    <h3>Top Products</h3>
                    <div
                        className="chart-container"
                        role="img"
                        aria-label="Bar chart showing top selling products by quantity sold."
                    >
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={topProducts.slice(0, 5)} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis type="number" stroke="#888" />
                                <YAxis dataKey="name" type="category" width={100} stroke="#888" style={{ fontSize: '11px' }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e2332', borderColor: '#333' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Bar dataKey="quantity" fill="#388bfd" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Tables Row */}
{/* fallow-ignore-next-line code-duplication */}
            <div className="tables-row">
                <div className="table-card">
                    <h3>Top Selling Products</h3>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Qty Sold</th>
                                <th>Revenue</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topProducts.map((product, idx) => (
                                <tr key={idx}>
                                    <td>{product.name}</td>
                                    <td>{product.quantity}</td>
                                    <td>{currency}{product.revenue?.toLocaleString()}</td>
                                </tr>
                            ))}
                            {topProducts.length === 0 && (
                                <tr><td colSpan="3">No data available</td></tr>
                            )}
                        </tbody>
                    </table>
{/* fallow-ignore-next-line code-duplication */}
                </div>

                <div className="table-card">
                    <h3>Sales by Customer</h3>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th>Orders</th>
                                <th>Total Spent</th>
                            </tr>
                        </thead>
                        <tbody>
                            {salesByCustomer.slice(0, 10).map((customer, idx) => (
                                <tr key={idx}>
                                    <td>{customer.name}</td>
                                    <td>{customer.order_count}</td>
                                    <td>{currency}{customer.total?.toLocaleString()}</td>
                                </tr>
                            ))}
                            {salesByCustomer.length === 0 && (
                                <tr><td colSpan="3">No data available</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Sales by Payment Method */}
            <div className="table-card payment-method-card">
                <h3>💳 Sales by Payment Method</h3>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Method</th>
                            <th>Transactions</th>
                            <th>Total Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paymentMethods.map((pm, idx) => (
                            <tr key={idx}>
                                <td style={{ textTransform: 'capitalize' }}>{pm.method}</td>
                                <td>{pm.count}</td>
                                <td>{currency}{Number(pm.total_amount).toLocaleString()}</td>
                            </tr>
                        ))}
                        {paymentMethods.length === 0 && (
                            <tr><td colSpan="3">No payment data available</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
