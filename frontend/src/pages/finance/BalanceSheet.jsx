import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import { FileSpreadsheet } from 'lucide-react';
import './ProfitLossReport.css'; // Reusing similar styles for now

const BalanceSheet = () => {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reportData, setReportData] = useState(null);

    useEffect(() => {
        fetchReportData();
    }, []);

    const fetchReportData = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.REPORTS_FINANCE}balance_sheet/`);
            if (response.ok) {
                const data = await response.json();
                setReportData(data);
            } else {
                throw new Error('Failed to fetch balance sheet data');
            }
        } catch (err) {
            console.error('Error fetching Balance Sheet:', err);
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

    const handleExport = async (fmt = 'csv') => {
        try {
            const formatParam = fmt === 'xlsx' ? '&file_format=xlsx' : '';
            const response = await fetchWithAuth(`${ENDPOINTS.REPORTS_FINANCE}export/?type=balance_sheet${formatParam}`);
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `balance_sheet_${new Date().toISOString().split('T')[0]}.${fmt}`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Export failed:', error);
            showToast('Failed to export Balance Sheet', 'error');
        }
    };

    if (loading && !reportData) {
        return <div className="report-loading">Generating Balance Sheet...</div>;
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
    const assets = data.assets || {};
    const liabilities = data.liabilities || {};

    return (
        <div className="profit-loss-report"> {/* Reusing class for layout */}
            <header className="report-header">
                <div className="header-title">
                    <p className="subtitle">As of: {new Date().toLocaleDateString()}</p>
                </div>
                <div className="header-actions">
                </div>
            </header>

            <div className="report-container">
                <div className="report-section">
                    <h2 className="section-title">Assets</h2>
                    <div className="report-row">
                        <span>Cash & Bank Balances</span>
                        <span className="amount">{formatCurrency(assets.cash_bank)}</span>
                    </div>
                    <div className="report-row">
                        <span>Inventory Value</span>
                        <span className="amount">{formatCurrency(assets.inventory)}</span>
                    </div>
                    <div className="report-row">
                        <span>Accounts Receivable</span>
                        <span className="amount">{formatCurrency(assets.receivables)}</span>
                    </div>
                    <div className="report-row">
                        <span>Fixed Assets</span>
                        <span className="amount">{formatCurrency(assets.fixed_assets)}</span>
                    </div>
                    <div className="report-row total positive-bg">
                        <span>Total Assets</span>
                        <span className="amount positive">{formatCurrency(assets.total)}</span>
                    </div>
                </div>

                <div className="report-section">
                    <h2 className="section-title">Liabilities</h2>
                    <div className="report-row">
                        <span>Accounts Payable</span>
                        <span className="amount">{formatCurrency(liabilities.payables)}</span>
                    </div>
                    <div className="report-row">
                        <span>Loans Outstanding</span>
                        <span className="amount">{formatCurrency(liabilities.loans)}</span>
                    </div>
                    <div className="report-row total negative-bg">
                        <span>Total Liabilities</span>
                        <span className="amount">{formatCurrency(liabilities.total)}</span>
                    </div>
                </div>

                <div className="report-section final">
                    <div className="report-row summary">
                        <span>Equity (Net Assets)</span>
                        <span className="amount positive">{formatCurrency(data.equity)}</span>
                    </div>
                </div>
            </div>

            <div className="report-footer-actions">
                <button onClick={() => handleExport('csv')} className="btn-export csv">
                    <FileSpreadsheet size={18} /> Export CSV
                </button>
                <button onClick={() => handleExport('xlsx')} className="btn-export xlsx">
                    <FileSpreadsheet size={18} /> Export Excel
                </button>
            </div>
        </div>
    );
};

export default BalanceSheet;
