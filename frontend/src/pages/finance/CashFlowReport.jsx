import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './CashFlowReport.css';

const CashFlowReport = () => {
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
            const response = await fetchWithAuth(`${ENDPOINTS.REPORTS_FINANCE}cash_flow/?period=${period}`);
            if (response.ok) {
                const data = await response.json();
                setReportData(data);
            } else {
                throw new Error('Failed to fetch report data');
            }
        } catch (err) {
            console.error('Error fetching Cash Flow report:', err);
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

    const handleExport = (type) => {
        alert(`Exporting as ${type.toUpperCase()}...`);
    };

    if (loading && !reportData) {
        return <div className="report-loading">Generating Cash Flow Statement...</div>;
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
    const netCashFlow = data.net_change;

    return (
        <div className="cash-flow-report">
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
                    <div className="export-buttons">
                        <button onClick={() => handleExport('pdf')} className="btn-export pdf">PDF</button>
                        <button onClick={() => handleExport('csv')} className="btn-export csv">CSV</button>
                    </div>
                </div>
            </header>

            <div className="report-container">
                <div className="report-section">
                    <h2 className="section-title">Operating Activities</h2>
                    <div className="report-row">
                        <span>Customer Payments (Sales)</span>
                        <span className="amount positive">{formatCurrency(data.operating?.inflow?.sales)}</span>
                    </div>
                    <div className="report-row">
                        <span>Other Income</span>
                        <span className="amount positive">{formatCurrency(data.operating?.inflow?.other)}</span>
                    </div>
                    <div className="report-row">
                        <span>Expenses Paid</span>
                        <span className="amount negative">({formatCurrency(data.operating?.outflow?.expenses)})</span>
                    </div>
                    <div className="report-row">
                        <span>Salaries Paid</span>
                        <span className="amount negative">({formatCurrency(data.operating?.outflow?.salaries)})</span>
                    </div>
                    <div className="report-row total">
                        <span>Net Cash from Operating</span>
                        <span className={`amount ${parseFloat(data.operating?.net || 0) >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(data.operating?.net)}
                        </span>
                    </div>
                </div>

                <div className="report-section">
                    <h2 className="section-title">Investing Activities</h2>
                    <div className="report-row">
                        <span>Net Cash from Investing</span>
                        <span className={`amount ${parseFloat(data.investing?.net || 0) >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(data.investing?.net)}
                        </span>
                    </div>
                </div>

                <div className="report-section">
                    <h2 className="section-title">Financing Activities</h2>
                    <div className="report-row">
                        <span>Loans Received</span>
                        <span className="amount positive">{formatCurrency(data.financing?.loans_received)}</span>
                    </div>
                    <div className="report-row">
                        <span>Loan Repayments</span>
                        <span className="amount negative">({formatCurrency(data.financing?.repayments)})</span>
                    </div>
                    <div className="report-row total">
                        <span>Net Cash from Financing</span>
                        <span className={`amount ${parseFloat(data.financing?.net || 0) >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(data.financing?.net)}
                        </span>
                    </div>
                </div>

                <div className="report-section final">
                    <div className="report-row summary">
                        <span>Net Cash Flow</span>
                        <span className={`amount ${parseFloat(netCashFlow || 0) >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(netCashFlow)}
                        </span>
                    </div>
                    <div className="report-row balance">
                        <span>Opening Cash Balance</span>
                        <span className="amount">{formatCurrency(data.opening_balance)}</span>
                    </div>
                    <div className="report-row balance">
                        <span>Closing Cash Balance</span>
                        <span className="amount">{formatCurrency(data.closing_balance)}</span>
                    </div>
                </div>
            </div>

            <div className="report-footer">
                <p>* This report is generated based on recorded transactions and may not reflect unrecorded bank adjustments.</p>
            </div>
        </div>
    );
};

export default CashFlowReport;
