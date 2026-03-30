import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import './LoanDetails.css';

export default function LoanDetails() {
    const { id } = useParams();
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();

    const [loan, setLoan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showRepayModal, setShowRepayModal] = useState(false);
    const [repayFormData, setRepayFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        principal_portion: '',
        interest_portion: '',
        method: 'Bank Transfer',
        reference: '',
        notes: ''
    });
    const [submitting, setSubmitting] = useState(false);

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
        setRepayFormData(prev => {
            const newData = { ...prev, [name]: value };

            // Auto-calculate portions if amount is changed and they are empty
            if (name === 'amount' && value && !newData.principal_portion && !newData.interest_portion) {
                // Just a helper, user can override
            }

            return newData;
        });
    };

    const handleRepayment = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_LOANS}${id}/repay/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(repayFormData)
            });

            if (response.ok) {
                setShowRepayModal(false);
                setRepayFormData({
                    date: new Date().toISOString().split('T')[0],
                    amount: '',
                    principal_portion: '',
                    interest_portion: '',
                    method: 'Bank Transfer',
                    reference: '',
                    notes: ''
                });
                fetchLoanDetails();
            } else {
                const errorData = await response.json();
                alert(`Error: ${JSON.stringify(errorData)}`);
            }
        } catch (error) {
            console.error('Error adding repayment:', error);
        } finally {
            setSubmitting(false);
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

    const progress = Math.min(100, (loan.total_paid / (loan.principal_amount + (loan.total_interest || 0))) * 100) || 0;

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
                    <button className="btn btn-primary" onClick={() => setShowRepayModal(true)}>+ Add Repayment</button>
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
                <div className="summary-progress">
                    <div className="progress-info">
                        <span>Repayment Progress</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${progress}%` }}></div>
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
                                    <input
                                        type="date"
                                        name="date"
                                        value={repayFormData.date}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Total Amount ({currency}) *</label>
                                    <input
                                        type="number"
                                        name="amount"
                                        value={repayFormData.amount}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Principal Portion ({currency})</label>
                                    <input
                                        type="number"
                                        name="principal_portion"
                                        value={repayFormData.principal_portion}
                                        onChange={handleInputChange}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Interest Portion ({currency})</label>
                                    <input
                                        type="number"
                                        name="interest_portion"
                                        value={repayFormData.interest_portion}
                                        onChange={handleInputChange}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Payment Method</label>
                                    <select
                                        name="method"
                                        value={repayFormData.method}
                                        onChange={handleInputChange}
                                    >
                                        <option value="Bank Transfer">Bank Transfer</option>
                                        <option value="Cheque">Cheque</option>
                                        <option value="Cash">Cash</option>
                                        <option value="Online">Online</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Reference #</label>
                                    <input
                                        type="text"
                                        name="reference"
                                        value={repayFormData.reference}
                                        onChange={handleInputChange}
                                        placeholder="TXN ID, Cheque #"
                                    />
                                </div>
                                <div className="form-group full-width">
                                    <label>Notes</label>
                                    <textarea
                                        name="notes"
                                        value={repayFormData.notes}
                                        onChange={handleInputChange}
                                        rows="2"
                                    ></textarea>
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowRepayModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Submitting...' : 'Record Repayment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
