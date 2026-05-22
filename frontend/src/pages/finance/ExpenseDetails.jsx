import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import './ExpenseDetails.css';

export default function ExpenseDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { showToast } = useToast();

    const [expense, setExpense] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [approving, setApproving] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectReason, setRejectReason] = useState('');

    // Payment Form State
    const [paymentForm, setPaymentForm] = useState({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        method: '',
        source_bank: '',
        source_wallet: '',
        reference: '',
        notes: ''
    });

    const [availableBankAccounts, setAvailableBankAccounts] = useState([]);
    const [availableCashWallets, setAvailableCashWallets] = useState([]);
    const [availablePaymentMethods, setAvailablePaymentMethods] = useState([]);

    const isCashMethod = (method) => {
        if (!method) return false;
        return method.toLowerCase().includes('cash');
    };

    const fetchExpenseDetails = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_EXPENSES}${id}/`);
            if (response.ok) {
                const data = await response.json();
                setExpense(data);
                // Pre-fill amount with remaining balance
                setPaymentForm(prev => ({
                    ...prev,
                    amount: (data.total_amount - data.paid_amount).toFixed(2)
                }));
            } else {
                setError('Failed to fetch expense details');
            }

            // Fetch Bank Accounts
            const bankRes = await fetchWithAuth(ENDPOINTS.FINANCE_BANK_ACCOUNTS + '?active_only=true');
            if (bankRes.ok) {
                const bankData = await bankRes.json();
                setAvailableBankAccounts(bankData.results || bankData);
            }

            // Fetch Cash Wallets
            const walletRes = await fetchWithAuth(ENDPOINTS.FINANCE_CASH_WALLETS + '?active_only=true');
            if (walletRes.ok) {
                const walletData = await walletRes.json();
                setAvailableCashWallets(walletData.results || walletData);
            }

            // Fetch Payment Methods
            const methodRes = await fetchWithAuth(ENDPOINTS.SETTINGS_PAYMENT_METHODS);
            if (methodRes.ok) {
                const methodData = await methodRes.json();
                setAvailablePaymentMethods((methodData.results || methodData).filter(m => m.is_enabled));
            }

        } catch (err) {
            console.error('Error:', err);
            setError('An error occurred while fetching data');
        } finally {
            setLoading(false);
        }
    }, [id, fetchWithAuth]);

    useEffect(() => {
        fetchExpenseDetails();
    }, [fetchExpenseDetails]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setPaymentForm(prev => ({ ...prev, [name]: value }));
    };

    const handleMethodChange = (e) => {
        const method = e.target.value;
        const isCash = isCashMethod(method);
        setPaymentForm(prev => ({
            ...prev,
            method,
            source_bank: !isCash && (availableBankAccounts || []).length > 0 ? String(availableBankAccounts[0].id) : '',
            source_wallet: isCash && (availableCashWallets || []).length > 0 ? String(availableCashWallets[0].id) : '',
        }));
    };

    const handlePaymentSubmit = async (e) => {
        e.preventDefault();
        if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
            showToast('Please enter a valid payment amount', 'error');
            return;
        }
        if (!paymentForm.method) {
            showToast('Please select a payment method', 'error');
            return;
        }

        const isCash = isCashMethod(paymentForm.method);
        const source_bank = isCash ? null : paymentForm.source_bank;
        const source_wallet = isCash ? paymentForm.source_wallet : null;

        if (!isCash && !source_bank) {
            showToast('Please select a bank account ledger', 'error');
            return;
        }
        if (isCash && !source_wallet) {
            showToast('Please select a cash wallet ledger', 'error');
            return;
        }

        const payload = {
            ...paymentForm,
            source_bank: source_bank ? Number(source_bank) : null,
            source_wallet: source_wallet ? Number(source_wallet) : null
        };

        setSubmitting(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_EXPENSES}${id}/add_payment/`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                // Refresh data
                await fetchExpenseDetails();
                // Reset form but keep the date
                setPaymentForm(prev => ({
                    ...prev,
                    amount: '',
                    reference: '',
                    notes: ''
                }));
                showToast('Payment added successfully!', 'success');
            } else {
                const errorData = await response.json();
                showToast(`Failed to add payment: ${errorData.detail || 'Unknown error'}`, 'error');
            }
        } catch (err) {
            console.error('Error submitting payment:', err);
            showToast('An error occurred while processing the payment', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleApprove = async () => {
        if (!window.confirm('Are you sure you want to approve this expense?')) return;
        setApproving(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_EXPENSES}${id}/approve_expense/`, {
                method: 'POST'
            });
            if (response.ok) {
                await fetchExpenseDetails();
            } else {
                const err = await response.json();
                showToast(`Failed to approve: ${err.error || 'Unknown error'}`, 'error');
            }
        } catch (err) {
            console.error('Error approving:', err);
        } finally {
            setApproving(false);
        }
    };

    const handleReject = async () => {
        setApproving(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_EXPENSES}${id}/reject_expense/`, {
                method: 'POST',
                body: JSON.stringify({ reason: rejectReason })
            });
            if (response.ok) {
                setShowRejectModal(false);
                setRejectReason('');
                await fetchExpenseDetails();
            } else {
                const err = await response.json();
                showToast(`Failed to reject: ${err.error || 'Unknown error'}`, 'error');
            }
        } catch (err) {
            console.error('Error rejecting:', err);
        } finally {
            setApproving(false);
        }
    };

    const getStatusClass = (status) => {
        switch (status?.toLowerCase()) {
            case 'paid': return 'status-paid';
            case 'partial': return 'status-partial';
            case 'unpaid': return 'status-unpaid';
            default: return '';
        }
    };

    const getApprovalBadgeClass = (status) => {
        switch (status?.toLowerCase()) {
            case 'approved': case 'auto_approved': return 'approval-approved';
            case 'pending': return 'approval-pending';
            case 'rejected': return 'approval-rejected';
            default: return '';
        }
    };

    const getApprovalLabel = (status) => {
        switch (status?.toLowerCase()) {
            case 'auto_approved': return '✅ Auto-Approved';
            case 'approved': return '✅ Approved';
            case 'pending': return '⏳ Pending Approval';
            case 'rejected': return '❌ Rejected';
            default: return status;
        }
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner-large"></div>
                <p>Loading expense details...</p>
            </div>
        );
    }

    if (error || !expense) {
        return (
            <div className="error-container glass-card">
                <div className="error-icon">⚠️</div>
                <h2>Oops!</h2>
                <p>{error || 'Expense not found'}</p>
            </div>
        );
    }

    const remainingBalance = expense.total_amount - expense.paid_amount;

    return (
        <div className="expense-details-container fade-in">
            {/* Header Section */}
            <div className="details-header">
                <div className="header-left">


                    <div className="header-title-row">
                        <h1>{expense.payee_name}</h1>
                        <span className={`status-badge ${getStatusClass(expense.payment_status)}`}>
                            {expense.payment_status}
                        </span>
                        <span className={`status-badge ${getApprovalBadgeClass(expense.approval_status)}`}>
                            {getApprovalLabel(expense.approval_status)}
                        </span>
                    </div>
                    <div className="header-meta">
                        <span>📅 {new Date(expense.date).toLocaleDateString()}</span>
                        <span className="separator">•</span>
                        <span>📁 {expense.category_name}</span>
                    </div>
                </div>
                <div className="header-right">
                    <button className="btn btn-outline" onClick={() => navigate(`/finance/expenses/${id}/edit`)}>
                        ✏️ Edit Expense
                    </button>
                </div>
            </div>

            <div className="details-grid">
                {/* Main Details Card */}
                <div className="details-main">
                    <div className="glass-card info-card">
                        <div className="card-header">
                            <h3>Expense Information</h3>
                        </div>
                        <div className="info-grid">
                            <div className="info-item">
                                <label>Base Amount</label>
                                <span className="amount">{currency}{Number(expense.amount).toLocaleString()}</span>
                            </div>
                            <div className="info-item">
                                <label>Tax Amount</label>
                                <span className="amount">{currency}{Number(expense.tax_amount || 0).toLocaleString()}</span>
                            </div>
                            <div className="info-item highlight">
                                <label>Total Amount</label>
                                <span className="amount total">{currency}{Number(expense.total_amount).toLocaleString()}</span>
                            </div>
                            <div className="info-item">
                                <label>Paid Amount</label>
                                <span className="amount paid">{currency}{Number(expense.paid_amount).toLocaleString()}</span>
                            </div>
                            <div className="info-item">
                                <label>Balance Due</label>
                                <span className={`amount due ${remainingBalance > 0 ? 'warning' : ''}`}>
                                    {currency}{Number(remainingBalance).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        <div className="description-section">
                            <label>Description</label>
                            <p>{expense.description || 'No description provided.'}</p>
                        </div>

                        <div className="meta-footer">
                            <div className="meta-item">
                                <label>Created By</label>
                                <span>{expense.created_by_name || 'System'}</span>
                            </div>
                            <div className="meta-item">
                                <label>Created At</label>
                                <span>{new Date(expense.created_at).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Payment History Section */}
                    <div className="glass-card history-card">
                        <div className="card-header">
                            <h3>Payment History</h3>
                        </div>
                        <div className="table-responsive">
                            <table className="payment-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Method</th>
                                        <th>Reference</th>
                                        <th>Amount</th>
                                        <th>Balance</th>
                                        <th>Payer</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {expense.payments && expense.payments.length > 0 ? (
                                        expense.payments.map((payment, index) => {
                                            // Calculate running balance
                                            // We assume payments are in chronological order
                                            let cumulativePaid = 0;
                                            for (let i = 0; i <= index; i++) {
                                                cumulativePaid += parseFloat(expense.payments[i].amount);
                                            }
                                            const balanceAfter = expense.total_amount - cumulativePaid;

                                            return (
                                                <tr key={payment.id || index}>
                                                    <td>{new Date(payment.date).toLocaleDateString()}</td>
                                                    <td>
                                                        <span className="payment-method">{payment.method}</span>
                                                    </td>
                                                    <td>{payment.reference || '-'}</td>
                                                    <td className="amount">{currency}{Number(payment.amount).toLocaleString()}</td>
                                                    <td className="amount balance">{currency}{Number(balanceAfter).toLocaleString()}</td>
                                                    <td>{payment.paid_by_name || 'Admin'}</td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan="6" className="empty-row">No payments recorded yet.</td>
                                        </tr>
                                    )}
                                </tbody>
                                {expense.payments && expense.payments.length > 0 && (
                                    <tfoot>
                                        <tr className="summary-row">
                                            <td colSpan="3">Total Paid</td>
                                            <td className="amount total-paid">{currency}{Number(expense.paid_amount).toLocaleString()}</td>
                                            <td className="amount total-due">{currency}{Number(remainingBalance).toLocaleString()} due</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>
                </div>

                {/* Sidebar: Approval + Payment */}
                <div className="details-sidebar">
                    {/* Approval Section */}
                    {expense.approval_status === 'pending' && (
                        <div className="glass-card approval-card" id="approval-section">
                            <div className="card-header">
                                <h3>⚖️ Approval Required</h3>
                            </div>
                            <p className="approval-notice">
                                This expense of <strong>{currency}{Number(expense.total_amount).toLocaleString()}</strong> requires manager approval before payment can be processed.
                            </p>
                            <div className="approval-actions">
                                <button
                                    className="btn btn-success full-width"
                                    onClick={handleApprove}
                                    disabled={approving}
                                    id="approve-button"
                                >
                                    {approving ? 'Processing...' : '✅ Approve Expense'}
                                </button>
                                <button
                                    className="btn btn-danger full-width"
                                    onClick={() => setShowRejectModal(true)}
                                    disabled={approving}
                                    id="reject-button"
                                >
                                    ❌ Reject Expense
                                </button>
                            </div>
                        </div>
                    )}

                    {expense.approval_status === 'rejected' && (
                        <div className="glass-card rejection-card">
                            <div className="card-header">
                                <h3>❌ Rejected</h3>
                            </div>
                            <p>This expense was rejected{expense.approved_by_name ? ` by ${expense.approved_by_name}` : ''}.</p>
                            {expense.approved_at && <p className="rejection-date">On {new Date(expense.approved_at).toLocaleString()}</p>}
                        </div>
                    )}

                    {/* Payment Form Section */}
                    {remainingBalance > 0 ? (
                        <div className="glass-card payment-form-card">
                            <div className="card-header">
                                <h3>Record Payment</h3>
                            </div>
                            {expense.approval_status === 'pending' ? (
                                <p className="payment-blocked-notice">⚠️ Payment blocked until expense is approved.</p>
                            ) : expense.approval_status === 'rejected' ? (
                                <p className="payment-blocked-notice">❌ Cannot pay a rejected expense.</p>
                            ) : (
                                <form onSubmit={handlePaymentSubmit}>
                                    <div className="form-group">
                                        <label>Payment Date</label>
                                        <input
                                            type="date"
                                            name="date"
                                            value={paymentForm.date}
                                            onChange={handleInputChange}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Amount ({currency})</label>
                                        <input
                                            type="number"
                                            name="amount"
                                            step="0.01"
                                            max={remainingBalance}
                                            value={paymentForm.amount}
                                            onChange={handleInputChange}
                                            placeholder="0.00"
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Payment Method</label>
                                        <select
                                            name="method"
                                            value={paymentForm.method}
                                            onChange={handleMethodChange}
                                            required
                                        >
                                            <option value="">-- Select Method --</option>
                                            {(availablePaymentMethods || []).length > 0 ? (
                                                availablePaymentMethods.map(method => (
                                                    <option key={method.id} value={method.type}>{method.type}</option>
                                                ))
                                            ) : (
                                                <>
                                                    <option value="Cash">Cash</option>
                                                    <option value="UPI">UPI</option>
                                                    <option value="Bank Transfer">Bank Transfer</option>
                                                    <option value="Cheque">Cheque</option>
                                                    <option value="Card">Card</option>
                                                </>
                                            )}
                                        </select>
                                    </div>
                                    {paymentForm.method && (
                                        <div className="form-group">
                                            <label>Select Ledger</label>
                                            <select
                                                name={isCashMethod(paymentForm.method) ? "source_wallet" : "source_bank"}
                                                value={isCashMethod(paymentForm.method) ? paymentForm.source_wallet : paymentForm.source_bank}
                                                onChange={handleInputChange}
                                                required
                                            >
                                                <option value="">-- Select Source Ledger --</option>
                                                {isCashMethod(paymentForm.method) ? (
                                                    (availableCashWallets || []).map(w => (
                                                        <option key={w.id} value={w.id}>{w.name}</option>
                                                    ))
                                                ) : (
                                                    (availableBankAccounts || []).map(b => (
                                                        <option key={b.id} value={b.id}>{b.name}</option>
                                                    ))
                                                )}
                                            </select>
                                        </div>
                                    )}
                                    <div className="form-group">
                                        <label>Reference #</label>
                                        <input
                                            type="text"
                                            name="reference"
                                            value={paymentForm.reference}
                                            onChange={handleInputChange}
                                            placeholder="TXN ID, Cheque #, etc."
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Notes</label>
                                        <textarea
                                            name="notes"
                                            rows="2"
                                            value={paymentForm.notes}
                                            onChange={handleInputChange}
                                            placeholder="Optional payment notes..."
                                        ></textarea>
                                    </div>
                                    <button type="submit" className="btn btn-primary full-width" disabled={submitting}>
                                        {submitting ? 'Processing...' : 'Submit Payment'}
                                    </button>
                                </form>
                            )}
                        </div>
                    ) : (
                        <div className="glass-card paid-confirmation-card">
                            <div className="success-icon">✅</div>
                            <h3>Fully Paid</h3>
                            <p>This expense has been completely settled. No further payments are due.</p>
                        </div>
                    )}
                </div>
            </div>
            {/* Reject Modal */}
            {showRejectModal && (
                <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
                    <div className="modal-content glass-card fade-in" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Reject Expense</h2>
                            <button className="close-btn" onClick={() => setShowRejectModal(false)}>&times;</button>
                        </div>
                        <div className="form-group">
                            <label>Reason for Rejection (optional)</label>
                            <textarea
                                id="reject-reason"
                                rows="3"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Explain why this expense is being rejected..."
                            ></textarea>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowRejectModal(false)}>Cancel</button>
                            <button className="btn btn-danger" onClick={handleReject} disabled={approving}>
                                {approving ? 'Rejecting...' : 'Confirm Rejection'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
