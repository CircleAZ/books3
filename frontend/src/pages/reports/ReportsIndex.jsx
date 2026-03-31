import { Link } from 'react-router-dom';
import { useCurrency } from '../../context/CurrencyContext';
import './ReportsIndex.css';

const reportSections = [
    {
        title: 'Sales Reports',
        description: 'Detailed analysis of sales performance, revenue, and trends.',
        icon: '📈',
        path: '/reports/sales',
        color: 'cyan'
    },
    {
        title: 'Inventory Reports',
        description: 'Track stock levels, valuation, and movement history.',
        icon: '📦',
        path: '/reports/inventory',
        color: 'blue'
    },
    {
        title: 'Customer Reports',
        description: 'Insights into customer behavior, top buyers, and demographics.',
        icon: '👥',
        path: '/reports/customers',
        color: 'purple'
    },
    {
        title: 'Activity Log',
        description: 'Monitor system events, user actions, and audit trails.',
        icon: '📜',
        path: '/reports/activity',
        color: 'orange'
    },
    {
        title: 'Data Export',
        description: 'Export your data to CSV or Excel for external analysis.',
        icon: '📥',
        path: '/reports/export',
        color: 'green'
    }
];

export default function ReportsIndex() {
    const { currency } = useCurrency();
    return (
        <div className="reports-index-page animate-fade-in">
            <header className="reports-header">
                <p>Gain insights and monitor your business performance.</p>
            </header>

            <div className="summary-stats">
                <div className="summary-card">
                    <span className="summary-label">Monthly Revenue</span>
                    <span className="summary-value">{currency}45,230.00</span>
                    <span className="summary-trend up">+12.5%</span>
                </div>
                <div className="summary-card">
                    <span className="summary-label">Active Orders</span>
                    <span className="summary-value">128</span>
                    <span className="summary-trend up">+5.2%</span>
                </div>
                <div className="summary-card">
                    <span className="summary-label">New Customers</span>
                    <span className="summary-value">42</span>
                    <span className="summary-trend down">-2.1%</span>
                </div>
                <div className="summary-card">
                    <span className="summary-label">Inventory Value</span>
                    <span className="summary-value">{currency}1,24,000</span>
                    <span className="summary-trend">Stable</span>
                </div>
            </div>

            <div className="reports-grid">
                {reportSections.map((section, index) => (
                    <Link to={section.path} key={index} className={`report-card ${section.color}`}>
                        <div className="report-card-icon">{section.icon}</div>
                        <div className="report-card-content">
                            <h3>{section.title}</h3>
                            <p>{section.description}</p>
                        </div>
                        <div className="report-card-arrow">→</div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
