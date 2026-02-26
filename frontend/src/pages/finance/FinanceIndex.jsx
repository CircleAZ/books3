import { Link } from 'react-router-dom';
import { useCurrency } from '../../context/CurrencyContext';
import './FinanceIndex.css';

const FinanceIndex = () => {
    const { currency } = useCurrency();
    const sections = [
        {
            title: 'Financial Dashboard',
            description: 'View KPIs, revenue, expenses, and profit trends',
            icon: '📊',
            path: '/finance/dashboard',
            color: '#4f46e5'
        },
        {
            title: 'Expenses',
            description: 'Manage company expenses and payments',
            icon: '💳',
            path: '/finance/expenses',
            color: '#dc2626'
        },
        {
            title: 'Income',
            description: 'Track sales revenue and other income',
            icon: '💰',
            path: '/finance/income',
            color: '#16a34a'
        },
        {
            title: 'Employee Expenses',
            description: 'Manage employee expense claims and reimbursements',
            icon: '🧾',
            path: '/finance/employee-expenses',
            color: '#2563eb'
        },
        {
            title: 'Employee Salaries',
            description: 'Manage payroll and salary information',
            icon: '💸',
            path: '/finance/salaries',
            color: '#0d9488'
        },
        {
            title: 'Banking',
            description: 'Bank accounts and transactions',
            icon: '🏦',
            path: '/finance/banking',
            color: '#7c3aed'
        },
        {
            title: 'Financial Reports',
            description: 'P&L, Cash Flow, and expense reports',
            icon: '📈',
            path: '/finance/reports',
            color: '#0891b2'
        },
        {
            title: 'Lenders & Loans',
            description: 'Manage lenders, loans, and repayments',
            icon: '🤝',
            path: '/finance/lenders',
            color: '#ea580c'
        }
    ];

    return (
        <div className="finance-index">
            <div className="finance-header">
                <h1>Finance & Accounting</h1>
                <p>Comprehensive financial management for your business</p>
            </div>

            <div className="finance-grid">
                {sections.map((section, index) => (
                    <Link
                        key={index}
                        to={section.path}
                        className="finance-card"
                        style={{ '--accent-color': section.color }}
                    >
                        <div className="card-icon">{section.icon}</div>
                        <div className="card-content">
                            <h3>{section.title}</h3>
                            <p>{section.description}</p>
                        </div>
                        <div className="card-arrow">→</div>
                    </Link>
                ))}
            </div>

            <div className="quick-stats">
                <h2>Quick Overview</h2>
                <div className="stats-row">
                    <div className="stat-card positive">
                        <span className="stat-label">Today's Revenue</span>
                        <span className="stat-value">{currency}0</span>
                    </div>
                    <div className="stat-card negative">
                        <span className="stat-label">Today's Expenses</span>
                        <span className="stat-value">{currency}0</span>
                    </div>
                    <div className="stat-card neutral">
                        <span className="stat-label">Cash Balance</span>
                        <span className="stat-value">{currency}0</span>
                    </div>
                    <div className="stat-card warning">
                        <span className="stat-label">Pending Payments</span>
                        <span className="stat-value">{currency}0</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FinanceIndex;
