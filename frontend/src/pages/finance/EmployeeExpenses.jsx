import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import { secureStorage } from '../../utils/secureStorage';
import './EmployeeExpenses.css';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import GuardedAction from '../../components/GuardedAction';

export default function EmployeeExpenses() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('');
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [categories, setCategories] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        category: '',
        amount: '',
        description: '',
        receipt: null
    });

    // Reimbursement State
    const [showReimburseModal, setShowReimburseModal] = useState(false);
    const [reimburseExpenseId, setReimburseExpenseId] = useState(null);
    const [availableBankAccounts, setAvailableBankAccounts] = useState([]);
    const [availableCashWallets, setAvailableCashWallets] = useState([]);
    const [reimburseForm, setReimburseForm] = useState({
        method: '',
        source_bank: '',
        source_wallet: ''
    });

    const [availablePaymentMethods, setAvailablePaymentMethods] = useState([]);
    const isCashMethod = (method) => {
        if (!method) return false;
        return method.toLowerCase().includes('cash');
    };

    const profileData = secureStorage.getItem('profile');
    const profile = profileData ? JSON.parse(profileData) : null;

    const fetchExpenses = useCallback(async () => {
        setLoading(true);
        try {
            const url = filterStatus
                ? `${ENDPOINTS.FINANCE_EMPLOYEE_EXPENSES}?status=${filterStatus}`
                : ENDPOINTS.FINANCE_EMPLOYEE_EXPENSES;

            const response = await fetchWithAuth(url);
            if (response.ok) {
                const data = await response.json();
                setExpenses(data.results || data || []);
            } else {
                console.error('Failed to fetch employee expenses');
            }
        } catch (error) {
            console.error('Error fetching employee expenses:', error);
        } finally {
            setLoading(false);
        }
// fallow-ignore-next-line code-duplication
    }, [fetchWithAuth, filterStatus]);

// fallow-ignore-next-line code-duplication
    const fetchCategories = useCallback(async () => {
        try {
            const response = await fetchWithAuth(ENDPOINTS.FINANCE_EXPENSE_CATEGORIES);
            if (response.ok) {
                const data = await response.json();
                setCategories(data.results || data || []);
            }
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    }, [fetchWithAuth]);

    const fetchLedgers = useCallback(async () => {
        try {
// fallow-ignore-next-line code-duplication
            const bankRes = await fetchWithAuth(ENDPOINTS.FINANCE_BANK_ACCOUNTS + '?active_only=true');
            if (bankRes.ok) {
                const bankData = await bankRes.json();
                setAvailableBankAccounts(bankData.results || bankData);
            }
            const walletRes = await fetchWithAuth(ENDPOINTS.FINANCE_CASH_WALLETS + '?active_only=true');
            if (walletRes.ok) {
                const walletData = await walletRes.json();
// fallow-ignore-next-line code-duplication
                setAvailableCashWallets(walletData.results || walletData);
            }
            const methodRes = await fetchWithAuth(ENDPOINTS.SETTINGS_PAYMENT_METHODS);
            if (methodRes.ok) {
                const methodData = await methodRes.json();
                setAvailablePaymentMethods((methodData.results || methodData).filter(m => m.is_enabled));
            }
        } catch (err) {
            console.error('Error fetching ledgers:', err);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchExpenses();
        fetchLedgers();
    }, [fetchExpenses, fetchLedgers]);

    const handleAction = async (id, action) => {
        if (action === 'reimburse') {
            setReimburseExpenseId(id);
            setShowReimburseModal(true);
            return;
        }
        
        if (!window.confirm(`Are you sure you want to ${action} this expense?`)) return;

        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_EMPLOYEE_EXPENSES}${id}/${action}/`, {
                method: 'POST'
            });
            if (response.ok) {
                fetchExpenses();
            } else {
                showToast(`Failed to ${action} expense`, 'error');
            }
        } catch (error) {
            console.error(`Error during ${action}:`, error);
        }
    };

    const handleReimburseSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            let payload = {};
            if (isCashMethod(reimburseForm.method)) {
                payload.source_wallet = reimburseForm.source_wallet || (availableCashWallets.length > 0 ? availableCashWallets[0].id : null);
            } else {
                payload.source_bank = reimburseForm.source_bank || (availableBankAccounts.length > 0 ? availableBankAccounts[0].id : null);
            }
            
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_EMPLOYEE_EXPENSES}${reimburseExpenseId}/reimburse/`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                setShowReimburseModal(false);
                fetchExpenses();
                showToast('Expense Reimbursed successfully!', 'success');
            } else {
                const err = await response.json();
                showToast(`Failed to reimburse: ${JSON.stringify(err)}`, 'error');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleOpenSubmitModal = () => {
        fetchCategories();
        setFormData({
            date: new Date().toISOString().split('T')[0],
            category: '',
            amount: '',
            description: '',
            receipt: null
        });
        setShowSubmitModal(true);
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmitExpense = async (e) => {
        e.preventDefault();
        if (!formData.category || !formData.amount) {
            showToast('Please fill in all required fields', 'warning');
            return;
        }
        setSubmitting(true);
        try {
            const payload = {
                date: formData.date,
                category: formData.category,
                amount: formData.amount,
                description: formData.description
            };
            const response = await fetchWithAuth(ENDPOINTS.FINANCE_EMPLOYEE_EXPENSES, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                setShowSubmitModal(false);
                fetchExpenses();
                showToast('Expense claim submitted successfully!', 'success');
            } else {
                const err = await response.json();
                showToast(`Failed to submit: ${JSON.stringify(err)}`, 'error');
            }
        } catch (error) {
            console.error('Error submitting expense:', error);
            showToast('An error occurred while submitting', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusClass = (status) => {
        switch (status?.toLowerCase()) {
            case 'pending': return 'status-pending';
            case 'approved': return 'status-approved';
            case 'rejected': return 'status-rejected';
            case 'reimbursed': return 'status-reimbursed';
            default: return '';
        }
    };

    return (
        <div className="employee-expenses-container fade-in">
            <div className="page-header">
                <div>
                    <p className="page-subtitle">Track and manage employee expense claims</p>
                </div>
                <div className="page-actions">
                    <button className="btn btn-primary" onClick={handleOpenSubmitModal} id="submit-expense-btn">
                        <span className="icon">➕</span> Submit New Expense
                    </button>
                </div>
            </div>

            <div className="expenses-controls glass-card">
                <div className="filter-group">
                    <label>Filter by Status</label>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="filter-select"
                    >
                        <option value="">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="reimbursed">Reimbursed</option>
                    </select>
                </div>
            </div>

            <div className="expenses-table-container glass-card">
                {loading ? (
                    <LoadingSpinner />
                ) : (
// fallow-ignore-next-line code-duplication
                    <table className="expenses-table">
                        <thead>
// fallow-ignore-next-line code-duplication
                            <tr>
                                <th>Date</th>
                                <th>Employee</th>
                                <th>Category</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {expenses.length > 0 ? (
                                expenses.map(expense => (
                                    <tr key={expense.id}>
                                        <td>{new Date(expense.date).toLocaleDateString()}</td>
                                        <td>{expense.employee_name}</td>
                                        <td>
                                            {expense.category_name}
                                            {expense.description?.startsWith('Trip:') && (
                                                <span style={{
                                                    marginLeft: 8, padding: '2px 8px', borderRadius: 10,
                                                    fontSize: 11, fontWeight: 600,
                                                    background: '#0ea5e922', color: '#0ea5e9'
                                                }}>🧳 Trip</span>
                                            )}
                                        </td>
                                        <td className="amount">{currency}{Number(expense.amount).toLocaleString()}</td>
                                        <td>
                                            <span className={`status-badge ${getStatusClass(expense.status)}`}>
                                                {expense.status}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="action-buttons">
                                                {expense.status === 'pending' && !expense.description?.startsWith('Trip:') && (
                                                    <>
                                                        <GuardedAction permission="finance.manage_expenses">
                                                            <button
                                                                className="btn-icon approve"
                                                                onClick={() => handleAction(expense.id, 'approve')}
                                                                title="Approve"
                                                            >
                                                                ✅
                                                            </button>
                                                        </GuardedAction>
                                                        <GuardedAction permission="finance.manage_expenses">
                                                            <button
                                                                className="btn-icon reject"
                                                                onClick={() => handleAction(expense.id, 'reject')}
                                                                title="Reject"
                                                            >
                                                                ❌
                                                            </button>
                                                        </GuardedAction>
                                                    </>
                                                )}
                                                {expense.status === 'approved' && (
                                                    <GuardedAction permission="finance.manage_expenses">
                                                        <button
                                                            className="btn btn-sm btn-success"
                                                            onClick={() => handleAction(expense.id, 'reimburse')}
                                                        >
                                                            Reimburse
                                                        </button>
                                                    </GuardedAction>
                                                )}
                                                <button 
                                                    className="btn-icon" 
                                                    title="View Details"
                                                    onClick={() => navigate(`/finance/employee-expenses/${expense.id}`)}
                                                >👁️</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" className="no-data">No expense claims found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Submit Expense Modal */}
            {showSubmitModal && (
                <div className="modal-overlay" onClick={() => setShowSubmitModal(false)}>
                    <div className="modal-content glass-card fade-in" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Submit Expense Claim</h2>
                            <button className="close-btn" onClick={() => setShowSubmitModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleSubmitExpense}>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Date *</label>
                                    <input
                                        type="date"
                                        name="date"
                                        value={formData.date}
                                        onChange={handleFormChange}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Category *</label>
                                    <select
                                        name="category"
                                        value={formData.category}
                                        onChange={handleFormChange}
                                        required
                                        id="expense-category-select"
                                    >
                                        <option value="">Select category...</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Amount ({currency}) *</label>
                                    <input
                                        type="number"
                                        name="amount"
                                        step="0.01"
                                        min="0.01"
                                        value={formData.amount}
                                        onChange={handleFormChange}
                                        placeholder="0.00"
                                        required
                                        id="expense-amount-input"
                                    />
                                </div>
                                <div className="form-group full-width">
                                    <label>Description</label>
                                    <textarea
                                        name="description"
                                        rows="3"
                                        value={formData.description}
                                        onChange={handleFormChange}
                                        placeholder="Describe the expense (e.g. client dinner at restaurant X)"
                                        id="expense-description"
                                    ></textarea>
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowSubmitModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting} id="submit-expense-confirm">
                                    {submitting ? 'Submitting...' : 'Submit Claim'}
                                </button>
                            </div>
// fallow-ignore-next-line code-duplication
                        </form>
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
                        <form onSubmit={handleReimburseSubmit}>
                            <div className="form-group">
                                <label>Payment Method</label>
                                <select
                                    className="form-control"
                                    value={reimburseForm.method}
                                    onChange={e => setReimburseForm({...reimburseForm, method: e.target.value})}
                                >
                                    <option value="">-- Select Method --</option>
                                    {availablePaymentMethods.length > 0 ? (
                                        availablePaymentMethods.map(method => (
                                            <option key={method.id} value={method.type}>{method.type}</option>
                                        ))
                                    ) : (
                                        <>
                                            <option value="Cash">Cash</option>
                                            <option value="Bank Transfer">Bank Transfer</option>
                                        </>
                                    )}
                                </select>
                            </div>
// fallow-ignore-next-line code-duplication
                            <div className="form-group">
                                <label>Source Ledger</label>
                                <select
                                    className="form-control"
                                    value={isCashMethod(reimburseForm.method) ? reimburseForm.source_wallet : reimburseForm.source_bank}
                                    onChange={e => setReimburseForm({
                                        ...reimburseForm, 
                                        [isCashMethod(reimburseForm.method) ? 'source_wallet' : 'source_bank']: e.target.value
                                    })}
                                >
                                    {isCashMethod(reimburseForm.method) ? (
                                        availableCashWallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)
                                    ) : (
// fallow-ignore-next-line code-duplication
                                        availableBankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)
                                    )}
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowReimburseModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-success" disabled={submitting}>
                                    {submitting ? 'Processing...' : 'Reimburse'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
