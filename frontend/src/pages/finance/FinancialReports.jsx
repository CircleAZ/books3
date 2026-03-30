import React from 'react';
import { Link } from 'react-router-dom';
import './FinancialReports.css';

const FinancialReports = () => {
    const reports = [
        {
            title: 'Profit & Loss Statement',
            description: 'Summary of revenues, costs, and expenses incurred during a specific period.',
            icon: '📊',
            path: '/finance/reports/profit-loss',
            color: '#10b981'
        },
        {
            title: 'Cash Flow Statement',
            description: 'Tracking the flow of cash in and out of your business.',
            icon: '💸',
            path: '/finance/reports/cash-flow',
            color: '#3b82f6'
        },
        {
            title: 'Expense Report',
            description: 'Detailed breakdown of company expenditures by category and department.',
            icon: '🧾',
            path: '/finance/reports/expenses',
            color: '#ef4444'
        },
        {
            title: 'Sales Tax Report',
            description: 'Summary of taxes collected and payable for tax compliance.',
            icon: '🏛️',
            path: '/finance/reports/sales-tax',
            color: '#f59e0b'
        }
    ];

    return (
        <div className="financial-reports-page">
            <header className="reports-header">
                <div>
                    <p>Comprehensive insights into your business's financial health</p>
                </div>
            </header>

            <div className="reports-grid">
                {reports.map((report, index) => (
                    <Link
                        key={index}
                        to={report.path}
                        className="report-card"
                        style={{ '--accent-color': report.color }}
                    >
                        <div className="report-icon">{report.icon}</div>
                        <div className="report-content">
                            <h3>{report.title}</h3>
                            <p>{report.description}</p>
                        </div>
                        <div className="report-arrow">→</div>
                    </Link>
                ))}
            </div>
        </div>
    );
};

export default FinancialReports;
