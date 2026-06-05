import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import GuardedAction from '../../components/GuardedAction';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import './ExpenseDetails.css';

export default function EmployeeExpenseDetail() {
// fallow-ignore-next-line code-duplication
    const { id } = useParams();
    const navigate = useNavigate();
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { showToast } = useToast();

    const [expense, setExpense] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [processing, setProcessing] = useState(false);

    // Reimbursement
    const [showReimburseModal, setShowReimburseModal] = useState(false);
    const [banks, setBanks] = useState([]);
    const [wallets, setWallets] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [reimburseForm, setReimburseForm] = useState({ method: '', source_bank: '', source_wallet: '' });

    // Rejection
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectReason, setRejectReason] = useState('');

    const isCashMethod = (method) => method && method.toLowerCase().includes('cash');

    const fetchExpense = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_EMPLOYEE_EXPENSES}${id}/`);
            if (res.ok) {
                setExpense(await res.json());
            } else if (res.status === 404) {
                setError('Employee expense not found.');
            } else {
                setError('Failed to load expense details.');
            }
        } catch (err) {
            console.error(err);
            setError('An error occurred while fetching data.');
        } finally {
            setLoading(false);
        }
// fallow-ignore-next-line code-duplication
    }, [id, fetchWithAuth]);

    const fetchLedgers = useCallback(async () => {
        try {
            const [bRes, wRes, mRes] = await Promise.allSettled([
                fetchWithAuth(ENDPOINTS.FINANCE_BANK_ACCOUNTS + '?active_only=true'),
                fetchWithAuth(ENDPOINTS.FINANCE_CASH_WALLETS + '?active_only=true'),
                fetchWithAuth(ENDPOINTS.SETTINGS_PAYMENT_METHODS),
            ]);
            if (bRes.status === 'fulfilled' && bRes.value.ok) {
                const d = await bRes.value.json(); setBanks(d.results || d);
            }
            if (wRes.status === 'fulfilled' && wRes.value.ok) {
                const d = await wRes.value.json(); setWallets(d.results || d);
            }
            if (mRes.status === 'fulfilled' && mRes.value.ok) {
                const d = await mRes.value.json(); setPaymentMethods((d.results || d).filter(m => m.is_enabled));
            }
        } catch (_) {}
    }, [fetchWithAuth]);

    useEffect(() => { fetchExpense(); }, [fetchExpense]);

    const handleApprove = async () => {
        if (!window.confirm('Approve this expense claim?')) return;
        setProcessing(true);
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_EMPLOYEE_EXPENSES}${id}/approve/`, { method: 'POST' });
            if (res.ok) {
                showToast('Expense approved', 'success');
                fetchExpense();
            } else {
                const err = await res.json();
                showToast(err.error || 'Failed to approve', 'error');
            }
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        } finally {
            setProcessing(false);
        }
    };

// fallow-ignore-next-line code-duplication
    const handleReject = async () => {
        setProcessing(true);
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_EMPLOYEE_EXPENSES}${id}/reject/`, {
                method: 'POST',
                body: JSON.stringify({ reason: rejectReason })
            });
            if (res.ok) {
                showToast('Expense rejected', 'success');
                setShowRejectModal(false);
                setRejectReason('');
                fetchExpense();
            } else {
                const err = await res.json();
                showToast(err.error || 'Failed to reject', 'error');
            }
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        } finally {
            setProcessing(false);
        }
    };

    const handleMethodChange = (method) => {
        const isCash = isCashMethod(method);
        setReimburseForm({
            method,
            source_bank: !isCash && (banks || []).length > 0 ? String(banks[0].id) : '',
            source_wallet: isCash && (wallets || []).length > 0 ? String(wallets[0].id) : '',
        });
    };

// fallow-ignore-next-line code-duplication
    const handleReimburse = async (e) => {
        e.preventDefault();
        if (!reimburseForm.method) {
            showToast('Please select a payment method', 'error');
            return;
        }
        const isCash = isCashMethod(reimburseForm.method);
        const source_bank = isCash ? null : reimburseForm.source_bank;
        const source_wallet = isCash ? reimburseForm.source_wallet : null;

        if (!isCash && !source_bank) {
            showToast('Please select a source bank account', 'error');
            return;
        }
        if (isCash && !source_wallet) {
            showToast('Please select a source cash wallet', 'error');
            return;
        }

        setProcessing(true);
        try {
            const payload = {
                method: reimburseForm.method,
                source_bank: source_bank ? Number(source_bank) : null,
                source_wallet: source_wallet ? Number(source_wallet) : null
            };
            const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_EMPLOYEE_EXPENSES}${id}/reimburse/`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showToast('Expense reimbursed', 'success');
                setShowReimburseModal(false);
                fetchExpense();
            } else {
                const err = await res.json();
                showToast(err.error || JSON.stringify(err), 'error');
            }
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        } finally {
            setProcessing(false);
        }
    };

    const openReimburseModal = async () => {
        await fetchLedgers();
        setReimburseForm({ method: '', source_bank: '', source_wallet: '' });
        setShowReimburseModal(true);
    };

    const getStatusBadge = (status) => {
        const map = {
            pending: { cls: 'approval-pending', label: '⏳ Pending' },
            approved: { cls: 'approval-approved', label: '✅ Approved' },
            rejected: { cls: 'approval-rejected', label: '❌ Rejected' },
            reimbursed: { cls: 'status-paid', label: '💰 Reimbursed' },
        };
        const s = map[status] || { cls: '', label: status };
        return <span className={`status-badge ${s.cls}`}>{s.label}</span>;
    };

    if (loading) return <div className="loading-container"><LoadingSpinner /><p>Loading expense details...</p></div>;

    if (error || !expense) {
        return (
            <div className="error-container glass-card">
                <div className="error-icon">⚠️</div>
                <h2>Oops!</h2>
                <p>{error || 'Expense not found'}</p>
                <button className="btn btn-primary" onClick={() => navigate('/finance/employee-expenses')} style={{ marginTop: 16 }}>
                    ← Back to Employee Expenses
                </button>
            </div>
        );
    }

    return (
        <div className="expense-details-container fade-in">
            {/* Header */}
            <div className="details-header">
                <div className="header-left">
                    <div className="header-title-row">
                        <h1>{expense.employee_name}'s Expense</h1>
                        {getStatusBadge(expense.status)}
                    </div>
                    <div className="header-meta">
                        <span>📅 {new Date(expense.date).toLocaleDateString()}</span>
                        <span className="separator">•</span>
                        <span>📁 {expense.category_name}</span>
                        {expense.description?.startsWith('Reimbursement for') && (
                            <>
                                <span className="separator">•</span>
                                <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#6366f122', color: '#818cf8' }}>🛒 Procurement</span>
                            </>
                        )}
                        {expense.description?.startsWith('Trip:') && (
                            <>
                                <span className="separator">•</span>
                                <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: '#0ea5e922', color: '#0ea5e9' }}>🧳 Trip</span>
                            </>
                        )}
                    </div>
                </div>
                <div className="header-right">
// fallow-ignore-next-line code-duplication
                    <button className="btn btn-outline" onClick={() => navigate('/finance/employee-expenses')}>
                        ← Back to List
                    </button>
                </div>
            </div>

            <div className="details-grid">
                {/* Main Details Card */}
                <div className="details-main">
                    <div className="glass-card info-card">
                        <div className="card-header"><h3>Expense Information</h3></div>
                        <div className="info-grid">
                            <div className="info-item">
                                <label>Employee</label>
                                <span>{expense.employee_name}</span>
                            </div>
                            <div className="info-item">
                                <label>Category</label>
                                <span>{expense.category_name}</span>
                            </div>
                            <div className="info-item highlight">
                                <label>Amount</label>
                                <span className="amount total">{currency}{Number(expense.amount).toLocaleString()}</span>
                            </div>
                            <div className="info-item">
                                <label>Date</label>
                                <span>{new Date(expense.date).toLocaleDateString()}</span>
                            </div>
                            <div className="info-item">
                                <label>Status</label>
                                {getStatusBadge(expense.status)}
                            </div>
                            <div className="info-item">
                                <label>Created</label>
                                <span>{new Date(expense.created_at).toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="description-section">
                            <label>Description</label>
                            <p>{expense.description || 'No description provided.'}</p>
                        </div>

                        {/* Review / Reimbursement Info */}
                        {expense.reviewed_by_name && (
                            <div className="meta-footer">
                                <div className="meta-item">
                                    <label>Reviewed By</label>
                                    <span>{expense.reviewed_by_name}</span>
                                </div>
                                {expense.reviewed_at && (
                                    <div className="meta-item">
                                        <label>Reviewed At</label>
                                        <span>{new Date(expense.reviewed_at).toLocaleString()}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {expense.rejection_reason && (
                            <div style={{ margin: '16px 0 0', padding: 16, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                <label style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginBottom: 4, display: 'block' }}>Rejection Reason</label>
                                <p style={{ margin: 0, color: '#f1f5f9' }}>{expense.rejection_reason}</p>
                            </div>
                        )}
                        {expense.reimbursed_at && (
                            <div className="meta-footer" style={{ marginTop: 16 }}>
                                <div className="meta-item">
                                    <label>Reimbursed At</label>
                                    <span>{new Date(expense.reimbursed_at).toLocaleString()}</span>
                                </div>
                                {expense.reimbursement_method && (
                                    <div className="meta-item">
                                        <label>Reimbursement Method</label>
                                        <span>{expense.reimbursement_method}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar — Actions */}
                <div className="details-sidebar">
                    {expense.status === 'pending' && (
// fallow-ignore-next-line code-duplication
                        <div className="glass-card approval-card" id="approval-section">
                            <div className="card-header"><h3>⚖️ Approval Required</h3></div>
                            <p className="approval-notice">
                                This expense of <strong>{currency}{Number(expense.amount).toLocaleString()}</strong> from <strong>{expense.employee_name}</strong> requires review.
                            </p>
                            <div className="approval-actions">
                                <GuardedAction permission="finance.manage_expenses">
                                    <button className="btn btn-success full-width" onClick={handleApprove} disabled={processing} id="approve-button">
                                        {processing ? 'Processing...' : '✅ Approve'}
                                    </button>
                                </GuardedAction>
                                <GuardedAction permission="finance.manage_expenses">
                                    <button className="btn btn-danger full-width" onClick={() => setShowRejectModal(true)} disabled={processing} id="reject-button">
                                        ❌ Reject
                                    </button>
                                </GuardedAction>
                            </div>
                        </div>
                    )}

                    {expense.status === 'approved' && (
// fallow-ignore-next-line code-duplication
                        <div className="glass-card approval-card">
                            <div className="card-header"><h3>💰 Ready for Reimbursement</h3></div>
                            <p className="approval-notice">
                                This approved expense of <strong>{currency}{Number(expense.amount).toLocaleString()}</strong> is awaiting reimbursement to <strong>{expense.employee_name}</strong>.
                            </p>
                            <GuardedAction permission="finance.manage_expenses">
                                <button className="btn btn-success full-width" onClick={openReimburseModal} disabled={processing}>
                                    💸 Process Reimbursement
                                </button>
                            </GuardedAction>
                        </div>
                    )}

                    {expense.status === 'rejected' && (
                        <div className="glass-card rejection-card">
                            <div className="card-header"><h3>❌ Rejected</h3></div>
                            <p>This expense was rejected{expense.reviewed_by_name ? ` by ${expense.reviewed_by_name}` : ''}.</p>
                            {expense.reviewed_at && <p className="rejection-date">On {new Date(expense.reviewed_at).toLocaleString()}</p>}
                        </div>
                    )}

                    {expense.status === 'reimbursed' && (
                        <div className="glass-card paid-confirmation-card">
                            <div className="success-icon">✅</div>
                            <h3>Reimbursed</h3>
                            <p>This expense has been fully reimbursed to {expense.employee_name}.</p>
                        </div>
                    )}

                    {/* Summary Card */}
                    <div className="glass-card info-card" style={{ marginTop: 16 }}>
                        <div className="card-header"><h3>Summary</h3></div>
                        <div style={{ display: 'grid', gap: 12, padding: '0 4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                <span style={{ color: 'var(--color-text-secondary)' }}>Claim Amount</span>
                                <span style={{ fontWeight: 700 }}>{currency}{Number(expense.amount).toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                <span style={{ color: 'var(--color-text-secondary)' }}>Status</span>
                                {getStatusBadge(expense.status)}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                <span style={{ color: 'var(--color-text-secondary)' }}>Owed to Employee</span>
                                <span style={{ fontWeight: 700, color: expense.status === 'reimbursed' ? '#10b981' : '#f59e0b' }}>
                                    {expense.status === 'reimbursed' ? `${currency}0` : `${currency}${Number(expense.amount).toLocaleString()}`}
                                </span>
                            </div>
// fallow-ignore-next-line code-duplication
                        </div>
                    </div>
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
                                id="reject-reason" rows="3"
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                placeholder="Explain why this expense is being rejected..."
                            />
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowRejectModal(false)}>Cancel</button>
                            <button className="btn btn-danger" onClick={handleReject} disabled={processing}>
                                {processing ? 'Rejecting...' : 'Confirm Rejection'}
                            </button>
// fallow-ignore-next-line code-duplication
                        </div>
// fallow-ignore-next-line code-duplication
                    </div>
                </div>
            )}

            {/* Reimburse Modal */}
            {showReimburseModal && (
                <div className="modal-overlay" onClick={() => setShowReimburseModal(false)}>
                    <div className="modal-content glass-card fade-in" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Process Reimbursement</h2>
                            <button className="close-btn" onClick={() => setShowReimburseModal(false)}>&times;</button>
                        </div>
                        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 16, fontSize: '0.9rem' }}>
                            Reimburse <strong>{currency}{Number(expense.amount).toLocaleString()}</strong> to <strong>{expense.employee_name}</strong>.
                        </p>
// fallow-ignore-next-line code-duplication
                        <form onSubmit={handleReimburse}>
                            <div className="form-group">
                                <label>Payment Method</label>
                                <select className="form-control" value={reimburseForm.method}
                                    onChange={e => handleMethodChange(e.target.value)}>
                                    <option value="">-- Select Method --</option>
                                    {(paymentMethods || []).length > 0 ? (
                                        paymentMethods.map(m => <option key={m.id} value={m.type}>{m.type}</option>)
                                    ) : (
                                        <>
                                            <option value="Cash">Cash</option>
                                            <option value="Bank Transfer">Bank Transfer</option>
                                        </>
                                    )}
                                </select>
                            </div>
                            {reimburseForm.method && (
// fallow-ignore-next-line code-duplication
                                <div className="form-group">
                                    <label>Source Ledger</label>
                                    <select className="form-control"
                                        value={isCashMethod(reimburseForm.method) ? reimburseForm.source_wallet : reimburseForm.source_bank}
                                        onChange={e => setReimburseForm({
                                            ...reimburseForm,
                                            [isCashMethod(reimburseForm.method) ? 'source_wallet' : 'source_bank']: e.target.value
                                        })}>
                                        <option value="">-- Select Source Ledger --</option>
                                        {isCashMethod(reimburseForm.method) ? (
                                            (wallets || []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)
                                        ) : (
                                            (banks || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)
                                        )}
                                    </select>
                                </div>
                            )}
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowReimburseModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-success" disabled={processing}>
                                    {processing ? 'Processing...' : '💸 Reimburse'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
