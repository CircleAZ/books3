import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';
import {
    CreditCard, Wallet, Receipt, Banknote, Landmark,
    TrendingUp, Handshake, RefreshCw, PieChart as PieChartIcon,
    Coins, Briefcase, ArrowRight, Info
} from 'lucide-react';
import './FinanceIndex.css';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
const MAX_CHART_ITEMS = 20; // DoS guard — cap rendered chart elements

/* ── Helpers ── */

/** Round to 2 decimals to fix floating-point dust */
const round2 = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;

/** Format value with currency, 2-decimal rounding, and locale separators */
const fmtVal = (currency, v) => {
    const n = round2(v);
    return `${currency}${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

/** Determine semantic CSS class based on value sign */
const valueClass = (v) => {
    const n = parseFloat(v) || 0;
    if (n > 0) return 'value positive';
    if (n < 0) return 'value negative';
    return 'value neutral';
};

/** Semantic KPI border class based on value */
const kpiSemantic = (v) => {
    const n = parseFloat(v) || 0;
    if (n > 0) return 'kpi-positive';
    if (n < 0) return 'kpi-negative';
    return 'kpi-neutral';
};

/* ── Navigation sections with Lucide icons ── */
const sections = [
    { title: 'Expenses',           icon: CreditCard,    path: '/finance/expenses',             color: '#dc2626' },
    { title: 'Income',             icon: Wallet,        path: '/finance/income',                color: '#16a34a' },
    { title: 'Employee Expenses',  icon: Receipt,       path: '/finance/employee-expenses',     color: '#2563eb' },
    { title: 'Employee Salaries',  icon: Banknote,      path: '/finance/salaries',              color: '#0d9488' },
    { title: 'Banking',            icon: Landmark,      path: '/finance/banking',               color: '#7c3aed' },
    { title: 'Profit & Loss',     icon: TrendingUp,    path: '/finance/reports/profit-loss',   color: '#0891b2' },
    { title: 'Lenders & Loans',   icon: Handshake,     path: '/finance/lenders',               color: '#ea580c' },
    { title: 'Recurring',          icon: RefreshCw,     path: '/finance/recurring',             color: '#8b5cf6' },
    { title: 'Budgets',            icon: PieChartIcon,  path: '/finance/budgets',               color: '#06b6d4' },
    { title: 'Income Categories',  icon: Coins,         path: '/finance/income-categories',     color: '#d97706' },
    { title: 'Trips',              icon: Briefcase,     path: '/finance/trips',                 color: '#0ea5e9' },
    { title: 'Cash Management',    icon: Wallet,        path: '/finance/cash-management',       color: '#10b981' },
];

const FinanceIndex = () => {
    const { currency } = useCurrency();
    const { fetchWithAuth } = useAuth();
    const [period, setPeriod] = useState('month');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [showAPPopup, setShowAPPopup] = useState(false);

    // ── Data fetching ──
    const fetchDashboardData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_DASHBOARD}?period=${period}`);
            if (res.ok) setData(await res.json());
            else setError('Failed to load dashboard data');
        } catch (e) {
            console.error('Dashboard fetch failed:', e.message);
            setError('Could not connect to server');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, [fetchWithAuth, period]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Escape key handler for AP modal ──
    useEffect(() => {
        if (!showAPPopup) return;
        const handler = (e) => e.key === 'Escape' && setShowAPPopup(false);
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [showAPPopup]);

    const kpis = data || {};

    // ── Derived KPIs with correct math (use raw values for fallback to avoid compounding rounding) ──
    const revenue    = round2(kpis.revenue);
    const cogs       = round2(kpis.cogs);
    const grossProfit = round2(kpis.gross_profit ?? (parseFloat(kpis.revenue || 0) - parseFloat(kpis.cogs || 0)));
    const expenses   = round2(kpis.expenses);
    const netProfit  = round2(kpis.net_profit ?? (parseFloat(kpis.revenue || 0) - parseFloat(kpis.cogs || 0) - parseFloat(kpis.expenses || 0)));
    const cashBal    = round2(kpis.cash_balance);
    const ar         = round2(kpis.accounts_receivable);
    const apTotal    = round2(kpis.accounts_payable?.total);

    // ── Chart data — ONLY from backend. No fake data. ──
    const charts = data?.charts || null;
    const hasCharts = charts && (
        (charts.revenue_vs_expenses?.length > 0) ||
        (charts.profit_trend?.length > 0) ||
        (charts.expense_breakdown?.length > 0)
    );

    // ── Tooltip with currency ──
    const tooltipStyle = {
        backgroundColor: '#1e293b',
        border: '1px solid rgba(148,163,184,0.15)',
        borderRadius: '10px',
        color: '#f1f5f9',
        fontSize: '0.85rem',
    };
    const tooltipFormatter = (value) => fmtVal(currency, value);

    return (
        <div className="finance-index">
            {/* Header with period selector */}
            <div className="finance-header">
                <div>
                    <p>Dashboard, KPIs, and financial management</p>
                </div>
                <div className="period-selector" role="group" aria-label="Time period">
                    {['today', 'week', 'month'].map(p => (
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
                    <button onClick={() => fetchDashboardData()}>Retry</button>
                </div>
            ) : (
                <>
                    <div className="kpi-grid">
                        <div className={`kpi-card ${kpiSemantic(revenue)}`}>
                            <h3>Revenue</h3>
                            <p className={valueClass(revenue)}>{fmtVal(currency, revenue)}</p>
                        </div>
                        <div className={`kpi-card ${kpiSemantic(-cogs)}`}>
                            <h3>COGS</h3>
                            <p className="value">{fmtVal(currency, cogs)}</p>
                        </div>
                        <div className={`kpi-card ${kpiSemantic(grossProfit)}`}>
                            <h3>Gross Profit</h3>
                            <p className={valueClass(grossProfit)}>{fmtVal(currency, grossProfit)}</p>
                        </div>
                        <div className={`kpi-card ${kpiSemantic(-expenses)}`}>
                            <h3>Expenses</h3>
                            <p className="value negative">{fmtVal(currency, expenses)}</p>
                        </div>
                        <div className={`kpi-card ${kpiSemantic(netProfit)}`}>
                            <h3>Net Profit</h3>
                            <p className={valueClass(netProfit)}>{fmtVal(currency, netProfit)}</p>
                        </div>
                        <div className={`kpi-card ${kpiSemantic(cashBal)}`}>
                            <h3>Cash Balance</h3>
                            <p className={valueClass(cashBal)}>{fmtVal(currency, cashBal)}</p>
                        </div>
                        <div className="kpi-card kpi-neutral">
                            <h3>Accounts Receivable</h3>
                            <p className="value">{fmtVal(currency, ar)}</p>
                        </div>
                        <div className="kpi-card kpi-neutral clickable" onClick={() => setShowAPPopup(true)}>
                            <h3>Accounts Payable <Info size={16} style={{ verticalAlign: 'middle', opacity: 0.6 }} /></h3>
                            <p className="value">{fmtVal(currency, apTotal)}</p>
                        </div>
                    </div>

                    {/* Charts — only rendered if backend provides real data */}
                    {hasCharts ? (
                        <div className="finance-charts-grid">
                            {charts.revenue_vs_expenses?.length > 0 && (
                                <div className="chart-container large" role="img" aria-label="Revenue vs Expenses bar chart">
                                    <h3>Revenue vs Expenses</h3>
                                    <ResponsiveContainer width="100%" height={250}>
// fallow-ignore-next-line code-duplication
                                        <BarChart data={charts.revenue_vs_expenses.slice(0, MAX_CHART_ITEMS)} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                            <XAxis dataKey="period" stroke="#94a3b8" fontSize={12} tickLine={false} />
                                            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
                                            <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                                            <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '0.8rem' }} />
                                            <Bar dataKey="revenue" fill="#10b981" name="Revenue" radius={[4,4,0,0]} />
                                            <Bar dataKey="expenses" fill="#ef4444" name="Expenses" radius={[4,4,0,0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                            {charts.profit_trend?.length > 0 && (
                                <div className="chart-container" role="img" aria-label="Net Profit trend line chart">
                                    <h3>Profit Trend</h3>
                                    <ResponsiveContainer width="100%" height={250}>
// fallow-ignore-next-line code-duplication
                                        <LineChart data={charts.profit_trend.slice(0, MAX_CHART_ITEMS)} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                            <XAxis dataKey="period" stroke="#94a3b8" fontSize={12} tickLine={false} />
                                            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
                                            <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                                            <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '0.8rem' }} />
                                            <Line type="monotone" dataKey="profit" stroke="#8b5cf6" strokeWidth={2.5} dot={{ fill: '#8b5cf6', r: 4 }} name="Net Profit" />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                            {charts.expense_breakdown?.length > 0 && (
                                <div className="chart-container" role="img" aria-label="Expense breakdown donut chart">
                                    <h3>Expense Breakdown</h3>
                                    <ResponsiveContainer width="100%" height={250}>
                                        <PieChart>
                                            <Pie
                                                data={charts.expense_breakdown.filter(d => d.amount > 0).slice(0, MAX_CHART_ITEMS)}
                                                cx="50%"
                                                cy="45%"
                                                innerRadius={55}
                                                outerRadius={75}
                                                paddingAngle={4}
                                                dataKey="amount"
                                                nameKey="category"
                                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                                labelLine={false}
                                            >
                                                {charts.expense_breakdown.filter(d => d.amount > 0).slice(0, MAX_CHART_ITEMS).map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                                            <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '0.8rem', paddingTop: '4px' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="charts-empty-state">
                            <p>No chart data available for this period.</p>
                        </div>
                    )}
                </>
            )}

            {/* Quick Navigation Shortcuts */}
            <div className="finance-nav-section">
                <h2>Manage</h2>
                <div className="finance-nav-grid">
                    {sections.map((section) => {
                        const Icon = section.icon;
                        return (
                            <Link
                                key={section.path}
                                to={section.path}
                                className="finance-nav-card"
                                style={{ '--accent-color': section.color }}
                            >
                                <span className="nav-icon">
                                    <Icon size={20} color={section.color} />
                                </span>
                                <span className="nav-title">{section.title}</span>
                                <ArrowRight size={16} className="nav-arrow" />
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* AP Breakdown Popup */}
            {showAPPopup && (
                <div className="modal-overlay" onClick={() => setShowAPPopup(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} role="dialog" aria-label="Accounts Payable Breakdown">
                        <header>
                            <h2>Accounts Payable Breakdown</h2>
                            <button className="close-btn" onClick={() => setShowAPPopup(false)} aria-label="Close">&times;</button>
                        </header>
                        <div className="ap-breakdown-list">
                            <div className="ap-item">
                                <span className="vendor">Company Expenses</span>
                                <span className="amount">{fmtVal(currency, kpis?.accounts_payable?.company_expenses)}</span>
                            </div>
                            <div className="ap-item">
                                <span className="vendor">Employee Reimbursements</span>
                                <span className="amount">{fmtVal(currency, kpis?.accounts_payable?.employee_reimbursements)}</span>
                            </div>
                            <div className="ap-item">
                                <span className="vendor">Lender Payments</span>
                                <span className="amount">{fmtVal(currency, kpis?.accounts_payable?.lender_payments)}</span>
                            </div>
                            <div className="ap-item total">
                                <span className="vendor">Total Payable</span>
                                <span className="amount">{fmtVal(currency, apTotal)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinanceIndex;
