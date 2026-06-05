import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import './RecordTransaction.css';

export default function RecordTransaction() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        account: '',
        target_account: '',
        transaction_type: 'withdrawal',
        date: new Date().toISOString().split('T')[0],
        amount: '',
        description: '',
        reference: ''
    });

    const fetchAccounts = useCallback(async () => {
        try {
            const response = await fetchWithAuth(ENDPOINTS.FINANCE_BANK_ACCOUNTS);
            if (response.ok) {
                const data = await response.json();
                const accountList = data.results || data || [];
                setAccounts(accountList);

                // Set default account if available
                const defaultAcc = accountList.find(acc => acc.is_default);
                if (defaultAcc) {
                    setFormData(prev => ({ ...prev, account: defaultAcc.id }));
                } else if (accountList.length > 0) {
                    setFormData(prev => ({ ...prev, account: accountList[0].id }));
                }
            }
        } catch (error) {
            console.error('Error fetching accounts:', error);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchAccounts();
// fallow-ignore-next-line code-duplication
    }, [fetchAccounts]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const payload = { ...formData };
            if (formData.transaction_type !== 'transfer') {
                delete payload.target_account;
            }

            const response = await fetchWithAuth(ENDPOINTS.FINANCE_BANK_TRANSACTIONS, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                navigate('/finance/banking/transactions');
            } else {
                const errorData = await response.json();
                showToast(`Error: ${JSON.stringify(errorData)}`, 'error');
            }
        } catch (error) {
            console.error('Error recording transaction:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="record-tx-container fade-in">
            <div className="record-tx-header">
                <p>Manually record deposits, withdrawals, or transfers</p>
            </div>

            <div className="record-tx-card glass-card">
                <form onSubmit={handleSubmit}>
                    <div className="form-section">
                        <h3>Basic Information</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Transaction Type</label>
                                <select
                                    name="transaction_type"
                                    value={formData.transaction_type}
                                    onChange={handleInputChange}
                                    required
                                >
                                    <option value="withdrawal">Withdrawal (Payment)</option>
                                    <option value="deposit">Deposit (Receipt)</option>
                                    <option value="transfer">Internal Transfer</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Date</label>
                                <input
                                    type="date"
                                    name="date"
                                    value={formData.date}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>{formData.transaction_type === 'transfer' ? 'Source Account' : 'Bank Account'}</label>
                                <select
                                    name="account"
                                    value={formData.account}
                                    onChange={handleInputChange}
                                    required
                                >
                                    <option value="">Select Account</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name} ({currency}{Number(acc.balance || 0).toLocaleString()})</option>
                                    ))}
                                </select>
                            </div>

                            {formData.transaction_type === 'transfer' && (
                                <div className="form-group">
                                    <label>Target Account</label>
                                    <select
                                        name="target_account"
                                        value={formData.target_account}
                                        onChange={handleInputChange}
                                        required
                                    >
                                        <option value="">Select Target Account</option>
                                        {accounts.filter(acc => String(acc.id) !== String(formData.account)).map(acc => (
                                            <option key={acc.id} value={acc.id}>{acc.name} ({currency}{Number(acc.balance || 0).toLocaleString()})</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="form-group">
                                <label>Amount</label>
                                <input
                                    type="number"
                                    name="amount"
                                    value={formData.amount}
                                    onChange={handleInputChange}
                                    placeholder="0.00"
                                    step="0.01"
                                    min="0.01"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <div className="form-section">
                        <h3>Details</h3>
                        <div className="form-group">
                            <label>Description</label>
                            <input
                                type="text"
                                name="description"
                                value={formData.description}
                                onChange={handleInputChange}
                                placeholder="What was this transaction for?"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Reference / Check # / TX ID</label>
                            <input
                                type="text"
                                name="reference"
                                value={formData.reference}
                                onChange={handleInputChange}
                                placeholder="Optional reference number"
                            />
                        </div>
                    </div>

                    <div className="form-actions">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => navigate('/finance/banking/transactions')}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={loading}
                        >
                            {loading ? 'Processing...' : 'Record Transaction'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
