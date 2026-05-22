import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import UniversalPaymentEngine from '../../components/common/UniversalPaymentEngine';
import './LoanDetails.css';

import '../../styles/components/form-layout.css';
import '../../styles/components/modal-system.css';
export default function LoanDetails() {
    const { id } = useParams();
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { showToast } = useToast();
    const navigate = useNavigate();

    const [loan, setLoan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showRepayModal, setShowRepayModal] = useState(false);
    const [showDisburseModal, setShowDisburseModal] = useState(false);
    const [repayFormData, setRepayFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        principal_portion: '',
        interest_portion: '',
        reference: '',
        notes: ''
    });
    const [repayPayload, setRepayPayload] = useState(null);

    const [disburseFormData, setDisburseFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        reference: '',
        notes: ''
    });
    const [disbursePayload, setDisbursePayload] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const fetchLoanDetails = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_LOANS}${id}/`);
            if (response.ok) {
                const data = await response.json();
                setLoan(data);
            } else {
                console.error('Failed to fetch loan details');
            }

            // Removed manual fetching of payment methods, banks, and wallets.
            // UniversalPaymentEngine handles it.
        } catch (error) {
            console.error('Error fetching loan details:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, id]);

    useEffect(() => {
        fetchLoanDetails();
    }, [fetchLoanDetails]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setRepayFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleDisburseInputChange = (e) => {
        const { name, value } = e.target;
        setDisburseFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleRepayment = async (e) => {
        e.preventDefault();
        if (!repayPayload) return;
        setSubmitting(true);
        try {
            const payload = { ...repayFormData, ...repayPayload };
            
            // MAP UPE OUTPUT TO LEGACY ENDPOINT SCHEMA
            if (payload.payment_method) {
                payload.method = payload.payment_method;
                delete payload.payment_method;
            }
            
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_LOANS}${id}/repay/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                showToast('Repayment recorded successfully', 'success');
                setShowRepayModal(false);
                setRepayFormData({
                    date: new Date().toISOString().split('T')[0],
                    amount: '',
                    principal_portion: '',
                    interest_portion: '',
                    reference: '',
                    notes: ''
                });
                setRepayPayload(null);
                fetchLoanDetails();
            } else {
                const errorData = await response.json();
                showToast(errorData.error || JSON.stringify(errorData), 'error');
            }
        } catch (error) {
            console.error('Error adding repayment:', error);
            showToast('Network error recording repayment', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDisbursement = async (e) => {
        e.preventDefault();
        if (!disbursePayload) return;
        setSubmitting(true);
        try {
            const payload = {
                date: disburseFormData.date,
                amount: disburseFormData.amount,
                reference: disburseFormData.reference,
                notes: disburseFormData.notes,
                ...disbursePayload
            };
            
            // Clean up standard UPE fields that this specific endpoint doesn't accept
            delete payload.payment_method;

            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_LOANS}${id}/disburse/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                showToast('Disbursement recorded successfully', 'success');
                setShowDisburseModal(false);
                setDisburseFormData({
                    date: new Date().toISOString().split('T')[0],
                    amount: '',
                    reference: '',
                    notes: ''
                });
                setDisbursePayload(null);
                fetchLoanDetails();
            } else {
                const errorData = await response.json();
                showToast(errorData.error || JSON.stringify(errorData), 'error');
            }
        } catch (error) {
            console.error('Error disbursing loan:', error);
            showToast('Network error recording disbursement', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteLoan = async () => {
        if (!window.confirm(`Delete loan "${loan.loan_number}"? This cannot be undone.`)) return;
        setDeleting(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_LOANS}${id}/`, {
                method: 'DELETE'
            });
            if (response.ok || response.status === 204) {
                showToast('Loan deleted', 'success');
                navigate(`/finance/lenders/${loan.lender}`);
            } else {
                const errorData = await response.json().catch(() => null);
                showToast(errorData?.error || errorData?.detail || 'Failed to delete loan', 'error');
            }
        } catch (error) {
            console.error('Error deleting loan:', error);
            showToast('Network error deleting loan', 'error');
        } finally {
            setDeleting(false);
        }
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner-large"></div>
            </div>
        );
    }

    if (!loan) {
        return <div className="error-message">Loan not found</div>;
    }

    const totalOwed = Number(loan.principal_amount) + Number(loan.total_interest || 0);
    const repayProgress = totalOwed > 0 ? Math.min(100, (Number(loan.total_paid) / totalOwed) * 100) : 0;
    const disburseProgress = Number(loan.principal_amount) > 0
        ? Math.min(100, (Number(loan.disbursed_amount || 0) / Number(loan.principal_amount)) * 100)
        : 0;
    const remainingDisbursement = Number(loan.principal_amount) - Number(loan.disbursed_amount || 0);

    return (
        <div className="loan-details-container fade-in">
            <div className="loan-details-header">
                <div className="header-left">
                    <div>
                        <div className="lender-badge">{loan.lender_name}</div>
                        <h1 className="loan-title">Loan: {loan.loan_number}</h1>
                        <p className="principal-subtitle">Principal: {currency}{Number(loan.principal_amount).toLocaleString()}</p>
                    </div>
                </div>
                <div className="header-actions">
                    <button className="btn btn-primary" onClick={() => setShowDisburseModal(true)}
                        disabled={remainingDisbursement <= 0}>
                        💰 Disburse
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowRepayModal(true)}>+ Add Repayment</button>
                    <button className="btn btn-ghost text-danger" onClick={handleDeleteLoan} disabled={deleting}>
                        {deleting ? 'Deleting...' : '🗑️ Delete'}
                    </button>
                </div>
            </div>

            <div className="loan-summary glass-card">
                <div className="summary-item">
                    <span className="label">Interest Rate</span>
                    <span className="value">{loan.interest_rate}%</span>
                </div>
                <div className="summary-item">
                    <span className="label">Term</span>
                    <span className="value">{loan.term_months} Months</span>
                </div>
                <div className="summary-item">
                    <span className="label">Total Paid</span>
                    <span className="value paid">{currency}{Number(loan.total_paid || 0).toLocaleString()}</span>
                </div>
                <div className="summary-item">
                    <span className="label">Balance Due</span>
                    <span className="value due">{currency}{Number(loan.balance_due || 0).toLocaleString()}</span>
                </div>
                <div className="summary-item">
                    <span className="label">Disbursed</span>
                    <span className="value">{currency}{Number(loan.disbursed_amount || 0).toLocaleString()}</span>
                </div>
                <div className="summary-item">
                    <span className="label">Remaining</span>
                    <span className="value due">{currency}{remainingDisbursement.toLocaleString()}</span>
                </div>

                {/* Disbursement Progress */}
                <div className="summary-progress">
                    <div className="progress-info">
                        <span>Disbursement Progress</span>
                        <span>{Math.round(disburseProgress)}%</span>
                    </div>
                    <div className="progress-track">
                        <div className="progress-fill disbursement-fill" style={{ width: `${disburseProgress}%` }}></div>
                    </div>
                </div>

                {/* Repayment Progress */}
                <div className="summary-progress">
                    <div className="progress-info">
                        <span>Repayment Progress</span>
                        <span>{Math.round(repayProgress)}%</span>
                    </div>
                    <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${repayProgress}%` }}></div>
                    </div>
                </div>
            </div>

            <div className="repayment-history">
                <h2 className="section-title">Repayment History</h2>
                <div className="repayment-table-container glass-card">
                    <table className="repayment-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Amount</th>
                                <th>Principal Portion</th>
                                <th>Interest Portion</th>
                                <th>Method</th>
                                <th>Reference</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loan.repayments && loan.repayments.length > 0 ? (
                                loan.repayments.map(repayment => (
                                    <tr key={repayment.id}>
                                        <td>{new Date(repayment.date).toLocaleDateString()}</td>
                                        <td className="amount-cell">{currency}{Number(repayment.amount).toLocaleString()}</td>
                                        <td>{currency}{Number(repayment.principal_portion).toLocaleString()}</td>
                                        <td>{currency}{Number(repayment.interest_portion).toLocaleString()}</td>
                                        <td>{repayment.method}</td>
                                        <td>{repayment.reference || '-'}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '3rem' }}>
                                        No repayment history found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Repayment Modal */}
            {showRepayModal && (
                <div className="modal-overlay">
                    <div className="modal-content glass-card fade-in">
                        <div className="modal-header">
                            <h2>Add Repayment</h2>
                            <button className="close-btn" onClick={() => setShowRepayModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleRepayment}>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Date *</label>
                                    <input type="date" name="date" value={repayFormData.date} onChange={handleInputChange} required />
                                </div>
                                <div className="form-group">
                                    <label>Total Amount ({currency}) *</label>
                                    <input type="number" name="amount" value={repayFormData.amount} onChange={handleInputChange} required />
                                </div>
                                <div className="form-group">
                                    <label>Principal Portion ({currency})</label>
                                    <input type="number" name="principal_portion" value={repayFormData.principal_portion} onChange={handleInputChange} />
                                </div>
                                <div className="form-group">
                                    <label>Interest Portion ({currency})</label>
                                    <input type="number" name="interest_portion" value={repayFormData.interest_portion} onChange={handleInputChange} />
                                </div>
                            </div>
                            
                            <UniversalPaymentEngine
                                transactionType="outflow"
                                allowedMethods={['cash', 'bank']}
                                hideAmount={true}
                                onValidPayload={setRepayPayload}
                            />
                            
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Reference #</label>
                                    <input type="text" name="reference" value={repayFormData.reference} onChange={handleInputChange} placeholder="TXN ID, Cheque #" />
                                </div>
                                <div className="form-group full-width">
                                    <label>Notes</label>
                                    <textarea name="notes" value={repayFormData.notes} onChange={handleInputChange} rows="2"></textarea>
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowRepayModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting || !repayPayload}>
                                    {submitting ? 'Submitting...' : 'Record Repayment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Disbursement Modal */}
            {showDisburseModal && (
                <div className="modal-overlay">
                    <div className="modal-content glass-card fade-in">
                        <div className="modal-header">
                            <h2>💰 Disburse Loan Funds</h2>
                            <button className="close-btn" onClick={() => setShowDisburseModal(false)}>&times;</button>
                        </div>
                        <div className="disburse-info">
                            <span>Remaining to disburse: <strong>{currency}{remainingDisbursement.toLocaleString()}</strong></span>
                        </div>
                        <form onSubmit={handleDisbursement}>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Date *</label>
                                    <input type="date" name="date" value={disburseFormData.date} onChange={handleDisburseInputChange} required />
                                </div>
                                <div className="form-group">
                                    <label>Amount ({currency}) *</label>
                                    <input
                                        type="number"
                                        name="amount"
                                        value={disburseFormData.amount}
                                        onChange={handleDisburseInputChange}
                                        max={remainingDisbursement}
                                        step="0.01"
                                        required
                                    />
                                </div>
                            </div>
                            
                            <UniversalPaymentEngine
                                transactionType="inflow"
                                allowedMethods={['cash', 'bank']}
                                hideAmount={true}
                                onValidPayload={setDisbursePayload}
                            />

                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Reference #</label>
                                    <input type="text" name="reference" value={disburseFormData.reference} onChange={handleDisburseInputChange} placeholder="TXN ID" />
                                </div>
                                <div className="form-group full-width">
                                    <label>Notes</label>
                                    <textarea name="notes" value={disburseFormData.notes} onChange={handleDisburseInputChange} rows="2"></textarea>
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowDisburseModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting || !disbursePayload}>
                                    {submitting ? 'Processing...' : 'Record Disbursement'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
