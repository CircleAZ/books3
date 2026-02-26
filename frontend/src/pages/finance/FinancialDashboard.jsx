import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';
import './FinancialDashboard.css';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function FinancialDashboard() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const [period, setPeriod] = useState('month');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [showAPPopup, setShowAPPopup] = useState(false);

    useEffect(() => {
        fetchDashboardData();
    }, [period]);

    const fetchDashboardData = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_DASHBOARD}?period=${period}`);
            if (response.ok) {
                const result = await response.json();
                setData(result);
            } else {
                throw new Error('Failed to fetch financial data');
            }
        } catch (err) {
            console.error('Error fetching financial dashboard:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading && !data) {
        return <div className="finance-loading">Loading Financial Data...</div>;
    }

    if (error) {
        return (
            <div className="finance-error">
                <p>Error: {error}</p>
                <button onClick={fetchDashboardData}>Retry</button>
            </div>
        );
    }

    const kpis = data || {};

    // Generate some chart data if backend doesn't provide it
    const charts = data?.charts || {
        revenue_vs_expenses: [
            { period: 'Week 1', revenue: parseFloat(kpis.revenue || 0) * 0.2, expenses: parseFloat(kpis.expenses || 0) * 0.25 },
            { period: 'Week 2', revenue: parseFloat(kpis.revenue || 0) * 0.3, expenses: parseFloat(kpis.expenses || 0) * 0.2 },
            { period: 'Week 3', revenue: parseFloat(kpis.revenue || 0) * 0.25, expenses: parseFloat(kpis.expenses || 0) * 0.3 },
            { period: 'Week 4', revenue: parseFloat(kpis.revenue || 0) * 0.25, expenses: parseFloat(kpis.expenses || 0) * 0.25 },
        ],
        profit_trend: [
            { period: 'Week 1', profit: (parseFloat(kpis.revenue || 0) - parseFloat(kpis.expenses || 0)) * 0.2 },
            { period: 'Week 2', profit: (parseFloat(kpis.revenue || 0) - parseFloat(kpis.expenses || 0)) * 0.3 },
            { period: 'Week 3', profit: (parseFloat(kpis.revenue || 0) - parseFloat(kpis.expenses || 0)) * 0.1 },
            { period: 'Week 4', profit: (parseFloat(kpis.revenue || 0) - parseFloat(kpis.expenses || 0)) * 0.4 },
        ],
        expense_breakdown: [
            { category: 'Expenses', amount: parseFloat(kpis.expenses || 0) },
            { category: 'COGS', amount: parseFloat(kpis.cogs || 0) },
            { category: 'Other', amount: parseFloat(kpis.other_income || 0) },
        ]
    };

    return (
        <div className="financial-dashboard">
            <header className="dashboard-header">
                <h1>Financial Dashboard</h1>
                <div className="period-selector">
                    <button
                        className={period === 'today' ? 'active' : ''}
                        onClick={() => setPeriod('today')}
                    >Today</button>
                    <button
                        className={period === 'week' ? 'active' : ''}
                        onClick={() => setPeriod('week')}
                    >Week</button>
                    <button
                        className={period === 'month' ? 'active' : ''}
                        onClick={() => setPeriod('month')}
                    >Month</button>
                    <button
                        className={period === 'custom' ? 'active' : ''}
                        onClick={() => setPeriod('custom')}
                    >Custom</button>
                </div>
            </header>

            {/* KPI Cards */}
            <div className="kpi-grid">
                <div className="kpi-card revenue">
                    <h3>Revenue</h3>
                    <p className="value positive">{currency}{parseFloat(kpis?.revenue || 0).toLocaleString()}</p>
                </div>
                <div className="kpi-card cogs">
                    <h3>COGS</h3>
                    <p className="value">{currency}{parseFloat(kpis?.cogs || 0).toLocaleString()}</p>
                </div>
                <div className="kpi-card gross-profit">
                    <h3>Gross Profit</h3>
                    <p className="value positive">{currency}{parseFloat(kpis?.gross_profit || 0).toLocaleString()}</p>
                </div>
                <div className="kpi-card expenses">
                    <h3>Expenses</h3>
                    <p className="value negative">{currency}{parseFloat(kpis?.expenses || 0).toLocaleString()}</p>
                </div>
                <div className="kpi-card net-profit">
                    <h3>Net Profit</h3>
                    <p className="value positive">{currency}{parseFloat(kpis?.net_profit || 0).toLocaleString()}</p>
                </div>
                <div className="kpi-card cash-balance">
                    <h3>Cash Balance</h3>
                    <p className="value">{currency}{parseFloat(kpis?.cash_balance || 0).toLocaleString()}</p>
                </div>
                <div className="kpi-card receivable">
                    <h3>Accounts Receivable</h3>
                    <p className="value">{currency}{parseFloat(kpis?.accounts_receivable || 0).toLocaleString()}</p>
                </div>
                <div className="kpi-card payable clickable" onClick={() => setShowAPPopup(true)}>
                    <h3>Accounts Payable ⓘ</h3>
                    <p className="value">{currency}{parseFloat(kpis?.accounts_payable?.total || 0).toLocaleString()}</p>
                </div>
            </div>

            {/* Charts Section */}
            <div className="finance-charts-grid">
                <div className="chart-container large">
                    <h3>Revenue vs Expenses</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={charts.revenue_vs_expenses}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="period" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9' }}
                            />
                            <Legend />
                            <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
                            <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="chart-container">
                    <h3>Profit Trend</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={charts.profit_trend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="period" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9' }}
                            />
                            <Line type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <div className="chart-container">
                    <h3>Expense Breakdown</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={charts.expense_breakdown}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="amount"
                                nameKey="category"
                            >
                                {charts.expense_breakdown.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9' }}
                            />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* AP Breakdown Popup */}
            {showAPPopup && (
                <div className="modal-overlay" onClick={() => setShowAPPopup(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <header>
                            <h2>Accounts Payable Breakdown</h2>
                            <button className="close-btn" onClick={() => setShowAPPopup(false)}>&times;</button>
                        </header>
                        <div className="ap-breakdown-list">
                            <div className="ap-item">
                                <span className="vendor">Company Expenses</span>
                                <span className="amount">{currency}{parseFloat(kpis?.accounts_payable?.company_expenses || 0).toLocaleString()}</span>
                            </div>
                            <div className="ap-item">
                                <span className="vendor">Employee Reimbursements</span>
                                <span className="amount">{currency}{parseFloat(kpis?.accounts_payable?.employee_reimbursements || 0).toLocaleString()}</span>
                            </div>
                            <div className="ap-item">
                                <span className="vendor">Lender Payments</span>
                                <span className="amount">{currency}{parseFloat(kpis?.accounts_payable?.lender_payments || 0).toLocaleString()}</span>
                            </div>
                            <div className="ap-item total">
                                <span className="vendor">Total Payable</span>
                                <span className="amount">{currency}{parseFloat(kpis?.accounts_payable?.total || 0).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
