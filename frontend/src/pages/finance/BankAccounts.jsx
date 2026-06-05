import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import './BankAccounts.css';

export default function BankAccounts() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingAccount, setEditingAccount] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        account_type: 'current',
        bank_name: '',
        account_number: '',
        opening_balance: 0,
        is_default: false
    });

    const fetchAccounts = useCallback(async () => {
        setLoading(true);
// fallow-ignore-next-line code-duplication
        try {
            const response = await fetchWithAuth(ENDPOINTS.FINANCE_BANK_ACCOUNTS);
            if (response.ok) {
                const data = await response.json();
                setAccounts(data.results || data || []);
            }
        } catch (error) {
            console.error('Error fetching bank accounts:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchAccounts();
// fallow-ignore-next-line code-duplication
    }, [fetchAccounts]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const method = editingAccount ? 'PUT' : 'POST';
        const url = editingAccount
            ? `${ENDPOINTS.FINANCE_BANK_ACCOUNTS}${editingAccount.id}/`
            : ENDPOINTS.FINANCE_BANK_ACCOUNTS;

        try {
            const response = await fetchWithAuth(url, {
                method,
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                fetchAccounts();
                closeModal();
            } else {
                const errorData = await response.json();
                showToast(`Error: ${JSON.stringify(errorData)}`, 'error');
            }
        } catch (error) {
            console.error('Error saving account:', error);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this account?')) return;

        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_BANK_ACCOUNTS}${id}/`, {
                method: 'DELETE'
            });

            if (response.ok) {
                fetchAccounts();
            }
        } catch (error) {
            console.error('Error deleting account:', error);
        }
    };

    const handleSetDefault = async (id) => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_BANK_ACCOUNTS}${id}/set_default/`, {
                method: 'POST'
            });

            if (response.ok) {
                fetchAccounts();
            }
        } catch (error) {
            console.error('Error setting default account:', error);
        }
    };

    const openModal = (account = null) => {
        if (account) {
            setEditingAccount(account);
            setFormData({
                name: account.name,
                account_type: account.account_type,
                bank_name: account.bank_name,
                account_number: '',  // write-only field — leave blank to keep existing, or enter new
                opening_balance: account.opening_balance,
                is_default: account.is_default
            });
        } else {
            setEditingAccount(null);
            setFormData({
                name: '',
                account_type: 'current',
                bank_name: '',
                account_number: '',
                opening_balance: 0,
                is_default: false
            });
        }
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingAccount(null);
    };

    const maskAccountNumber = (masked) => {
        if (!masked) return '—';
        return masked;
    };

    return (
        <div className="bank-accounts-container fade-in">
            <div className="bank-accounts-header">
                <div>
                    <p className="bank-accounts-subtitle">Manage your company bank accounts and balances</p>
                </div>
                <div className="bank-accounts-actions">
                    <button className="btn btn-secondary" onClick={() => navigate('/finance/banking/transactions')}>
                        View Transactions
                    </button>
                    <button className="btn btn-primary" onClick={() => openModal()}>
                        + Add Account
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="loading-container">
                    <div className="spinner-large"></div>
                </div>
            ) : (
                <div className="bank-accounts-grid">
                    {accounts.length > 0 ? (
                        accounts.map(account => (
                            <div key={account.id} className={`bank-account-card glass-card ${account.is_default ? 'default-account' : ''}`}>
                                {account.is_default && <span className="default-badge">DEFAULT</span>}
                                <div className="card-header">
                                    <div className="account-icon">🏦</div>
                                    <div className="account-main-info">
                                        <h3>{account.name}</h3>
                                        <p>{account.bank_name}</p>
                                    </div>
                                </div>
                                <div className="account-details">
                                    <div className="detail-item">
                                        <span className="label">Account Number</span>
                                        <span className="value">{maskAccountNumber(account.masked_account_number)}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">Type</span>
                                        <span className="value capitalize">{account.account_type}</span>
                                    </div>
                                </div>
                                <div className="account-balance">
                                    <span className="balance-label">Current Balance</span>
                                    <span className="balance-value">{currency}{Number(account.current_balance).toLocaleString()}</span>
                                </div>
                                <div className="card-actions">
                                    {!account.is_default && (
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => handleSetDefault(account.id)}
                                        >
                                            Set Default
                                        </button>
                                    )}
                                    <div className="action-icons">
                                        <button className="btn-icon" onClick={() => openModal(account)} title="Edit">✏️</button>
                                        <button className="btn-icon delete" onClick={() => handleDelete(account.id)} title="Delete">🗑️</button>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="no-accounts glass-card">
                            <span>🏦</span>
                            <p>No bank accounts found. Add your first account to get started.</p>
                            <button className="btn btn-primary" onClick={() => openModal()}>Add Account</button>
                        </div>
                    )}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content glass-card">
                        <div className="modal-header">
                            <h2>{editingAccount ? 'Edit Account' : 'Add Bank Account'}</h2>
                            <button className="close-button" onClick={closeModal}>&times;</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Account Name</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    placeholder="e.g., Main Business Account"
                                    required
                                />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Bank Name</label>
                                    <input
                                        type="text"
                                        name="bank_name"
                                        value={formData.bank_name}
                                        onChange={handleInputChange}
                                        placeholder="e.g., HDFC Bank"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Account Type</label>
                                    <select name="account_type" value={formData.account_type} onChange={handleInputChange}>
                                        <option value="current">Current</option>
                                        <option value="savings">Savings</option>
                                        <option value="cash">Cash</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Account Number</label>
                                    <input
                                        type="text"
                                        name="account_number"
                                        value={formData.account_number}
                                        onChange={handleInputChange}
                                        placeholder="Last 4 digits or full number"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Initial Balance</label>
                                    <input
                                        type="number"
                                        name="opening_balance"
                                        value={formData.opening_balance}
                                        onChange={handleInputChange}
                                        required
                                        disabled={!!editingAccount}
                                    />
                                </div>
                            </div>
                            <div className="form-group checkbox-group">
                                <label>
                                    <input
                                        type="checkbox"
                                        name="is_default"
                                        checked={formData.is_default}
                                        onChange={handleInputChange}
                                    />
                                    Set as default account
                                </label>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary">
                                    {editingAccount ? 'Update Account' : 'Create Account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
