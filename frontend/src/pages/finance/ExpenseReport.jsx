import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './ProfitLossReport.css'; // Reusing shared report styles

const ExpenseReport = () => {
    const { fetchWithAuth } = useAuth();
    const [period, setPeriod] = useState('month');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reportData, setReportData] = useState(null);

    useEffect(() => {
        fetchReportData();
    }, [period]);

    const fetchReportData = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.REPORTS_FINANCE}expense_report/?period=${period}`);
            if (response.ok) {
                const data = await response.json();
                setReportData(data);
            } else {
                throw new Error('Failed to fetch expense report data');
            }
        } catch (err) {
            console.error('Error fetching Expense Report:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2
        }).format(amount || 0);
    };

    const statusLabel = (status) => {
        const map = {
            unpaid: 'Unpaid', partial: 'Partially Paid', paid: 'Fully Paid',
            auto_approved: 'Auto-Approved', pending: 'Pending Approval',
            approved: 'Approved', rejected: 'Rejected'
        };
        return map[status] || status;
    };

    if (loading && !reportData) {
        return <div className="report-loading">Generating Expense Report...</div>;
    }

    if (error) {
        return (
            <div className="report-error">
                <p>Error: {error}</p>
                <button onClick={fetchReportData}>Retry</button>
            </div>
        );
    }

    const data = reportData || {};
    const summary = data.summary || {};
    const byCategory = data.by_category || [];
    const byPayment = data.by_payment_status || [];
    const byApproval = data.by_approval_status || [];

    return (
        <div className="profit-loss-report">
            <header className="report-header">
                <div className="header-title">
                    <p className="subtitle">For the period: {period.charAt(0).toUpperCase() + period.slice(1)}</p>
                </div>
                <div className="header-actions">
                    <div className="period-selector">
                        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                            <option value="today">Today</option>
                            <option value="week">This Week</option>
                            <option value="month">This Month</option>
                            <option value="quarter">This Quarter</option>
                            <option value="year">This Year</option>
                        </select>
                    </div>
                </div>
            </header>

            <div className="report-container">
                {/* Summary Section */}
                <div className="report-section">
                    <h2 className="section-title">Summary</h2>
                    <div className="report-row">
                        <span>Total Expenses ({summary.count || 0} entries)</span>
                        <span className="amount">{formatCurrency(summary.total_amount)}</span>
                    </div>
                    <div className="report-row">
                        <span>Amount Paid</span>
                        <span className="amount positive">{formatCurrency(summary.total_paid)}</span>
                    </div>
                    <div className="report-row">
                        <span>Tax Component</span>
                        <span className="amount">{formatCurrency(summary.total_tax)}</span>
                    </div>
                    <div className="report-row total">
                        <span>Outstanding Balance</span>
                        <span className={`amount ${parseFloat(summary.total_outstanding || 0) > 0 ? 'negative' : 'positive'}`}>
                            {formatCurrency(summary.total_outstanding)}
                        </span>
                    </div>
                </div>

                {/* By Category */}
                {byCategory.length > 0 && (
                    <div className="report-section">
                        <h2 className="section-title">By Category</h2>
                        {byCategory.map((cat, idx) => (
                            <div key={idx} className="report-row">
                                <span>{cat.category__name} ({cat.count})</span>
                                <span className="amount">{formatCurrency(cat.total)}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* By Payment Status */}
                {byPayment.length > 0 && (
                    <div className="report-section">
                        <h2 className="section-title">By Payment Status</h2>
                        {byPayment.map((item, idx) => (
                            <div key={idx} className="report-row">
                                <span>{statusLabel(item.payment_status)} ({item.count})</span>
                                <span className="amount">{formatCurrency(item.total)}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* By Approval Status */}
                {byApproval.length > 0 && (
                    <div className="report-section">
                        <h2 className="section-title">By Approval Status</h2>
                        {byApproval.map((item, idx) => (
                            <div key={idx} className="report-row">
                                <span>{statusLabel(item.approval_status)} ({item.count})</span>
                                <span className="amount">{formatCurrency(item.total)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExpenseReport;
