import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import { FileText, FileSpreadsheet } from 'lucide-react';
import './ProfitLossReport.css';

const ProfitLossReport = () => {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
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
            const response = await fetchWithAuth(`${ENDPOINTS.REPORTS_FINANCE}pnl/?period=${period}`);
            if (response.ok) {
                const data = await response.json();
                setReportData(data);
            } else {
                throw new Error('Failed to fetch report data');
            }
        } catch (err) {
            console.error('Error fetching P&L report:', err);
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
        // Mock export functionality
        showToast(`Exporting as ${type.toUpperCase()}...`, 'success');
    };

    if (loading && !reportData) {
        return <div className="report-loading">Generating Profit & Loss Statement...</div>;
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
                <div className="report-section">
                    <h2 className="section-title">Revenue</h2>
                    <div className="report-row">
                        <span>Sales Revenue</span>
                        <span className="amount">{formatCurrency(data.revenue?.sales)}</span>
                    </div>
                    <div className="report-row">
                        <span>Other Income</span>
                        <span className="amount">{formatCurrency(data.revenue?.other_income)}</span>
                    </div>
                    <div className="report-row total">
                        <span>Total Revenue</span>
                        <span className="amount">{formatCurrency(data.revenue?.total)}</span>
                    </div>
                </div>

                <div className="report-section">
                    <h2 className="section-title">Cost of Goods Sold</h2>
                    <div className="report-row">
                        <span>Product Costs</span>
                        <span className="amount">{formatCurrency(data.cogs)}</span>
                    </div>
                    <div className="report-row total">
                        <span>Total COGS</span>
                        <span className="amount negative">({formatCurrency(data.cogs)})</span>
                    </div>
                </div>

                <div className="report-section highlight">
                    <div className="report-row summary">
                        <span>Gross Profit</span>
                        <span className="amount positive">{formatCurrency(data.gross_profit)}</span>
                    </div>
                </div>

                <div className="report-section">
                    <h2 className="section-title">Operating Expenses</h2>
                    {/* If backend provides categorical breakdown, map it here */}
                    {data.expenses_breakdown ? (
                        data.expenses_breakdown.map((exp, idx) => (
                            <div key={idx} className="report-row">
                                <span>{exp.category}</span>
                                <span className="amount">{formatCurrency(exp.amount)}</span>
                            </div>
                        ))
                    ) : (
                        <>
                            <div className="report-row">
                                <span>Operational Expenses</span>
                                <span className="amount">{formatCurrency(data.expenses?.operational)}</span>
                            </div>
                            <div className="report-row">
                                <span>Salaries</span>
                                <span className="amount">{formatCurrency(data.expenses?.salaries)}</span>
                            </div>
                            <div className="report-row">
                                <span>Loan Interest</span>
                                <span className="amount">{formatCurrency(data.expenses?.loan_interest)}</span>
                            </div>
                        </>
                    )}

                    <div className="report-row total">
                        <span>Total Operating Expenses</span>
                        <span className="amount negative">({formatCurrency(data.expenses?.total)})</span>
                    </div>
                </div>

                <div className="report-section final">
                    <div className="report-row net-profit">
                        <span>Net Profit / Loss</span>
                        <span className={`amount ${parseFloat(data.net_profit) >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(data.net_profit)}
                        </span>
                    </div>
                </div>
            </div>

            <div className="report-footer-actions">
                <button onClick={() => handleExport('pdf')} className="btn-export pdf">
                    <FileText size={18} /> Export PDF
                </button>
                <button onClick={() => handleExport('csv')} className="btn-export csv">
                    <FileSpreadsheet size={18} /> Export CSV
                </button>
            </div>
        </div>
    );
};

export default ProfitLossReport;
