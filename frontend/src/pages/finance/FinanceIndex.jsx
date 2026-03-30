import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import { formatINR } from '../../utils/financeUtils';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';
import './FinanceIndex.css';
import './FinancialDashboard.css';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const FinanceIndex = () => {
    const { currency } = useCurrency();
    const { fetchWithAuth } = useAuth();
    const [period, setPeriod] = useState('month');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [showAPPopup, setShowAPPopup] = useState(false);

    useEffect(() => {
        const fetchDashboardData = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_DASHBOARD}?period=${period}`);
                if (res.ok) setData(await res.json());
                else setError('Failed to load dashboard data');
            } catch (e) {
                console.error('Dashboard fetch failed:', e);
                setError('Could not connect to server');
            } finally {
                setLoading(false);
            }
        };
        fetchDashboardData();
    }, [fetchWithAuth, period]);

    const fmt = formatINR;
    const kpis = data || {};

    // Chart data — from backend or derived from KPIs
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

    // Navigation shortcuts — NO separate "Financial Dashboard" card since this IS the dashboard
    const sections = [
        { title: 'Expenses', icon: '💳', path: '/finance/expenses', color: '#dc2626' },
        { title: 'Income', icon: '💰', path: '/finance/income', color: '#16a34a' },
        { title: 'Employee Expenses', icon: '🧾', path: '/finance/employee-expenses', color: '#2563eb' },
        { title: 'Employee Salaries', icon: '💸', path: '/finance/salaries', color: '#0d9488' },
        { title: 'Banking', icon: '🏦', path: '/finance/banking', color: '#7c3aed' },
        { title: 'Reports', icon: '📈', path: '/finance/reports', color: '#0891b2' },
        { title: 'Lenders & Loans', icon: '🤝', path: '/finance/lenders', color: '#ea580c' },
        { title: 'Recurring', icon: '🔄', path: '/finance/recurring', color: '#8b5cf6' },
        { title: 'Budgets', icon: '📊', path: '/finance/budgets', color: '#06b6d4' },
        { title: 'Income Categories', icon: '💰', path: '/finance/income-categories', color: '#d97706' },
        { title: 'Trips', icon: '🧳', path: '/finance/trips', color: '#0ea5e9' },
    ];

    return (
        <div className="finance-index">
            {/* Header with period selector */}
            <div className="finance-header">
                <div>
                    <p>Dashboard, KPIs, and financial management</p>
                </div>
                <div className="period-selector">
                    {['today', 'week', 'month', 'custom'].map(p => (
                        <button
                            key={p}
                            className={period === p ? 'active' : ''}
                            onClick={() => setPeriod(p)}
                        >
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI Cards */}
            {loading && !data ? (
                <div className="finance-loading">Loading Financial Data...</div>
            ) : error ? (
                <div className="finance-error">
                    <p>⚠️ {error}</p>
                    <button onClick={() => setPeriod(period)}>Retry</button>
                </div>
            ) : (
                <>
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

                    {/* Charts */}
                    <div className="finance-charts-grid">
                        <div className="chart-container large">
                            <h3>Revenue vs Expenses</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={charts.revenue_vs_expenses}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                    <XAxis dataKey="period" stroke="#94a3b8" />
                                    <YAxis stroke="#94a3b8" />
                                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9' }} />
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
                                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9' }} />
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
                                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f1f5f9' }} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>
            )}

            {/* Quick Navigation Shortcuts */}
            <div className="finance-nav-section">
                <h2>Manage</h2>
                <div className="finance-nav-grid">
                    {sections.map((section, index) => (
                        <Link
                            key={index}
                            to={section.path}
                            className="finance-nav-card"
                            style={{ '--accent-color': section.color }}
                        >
                            <span className="nav-icon">{section.icon}</span>
                            <span className="nav-title">{section.title}</span>
                            <span className="nav-arrow">→</span>
                        </Link>
                    ))}
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
};

export default FinanceIndex;
