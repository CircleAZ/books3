import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { ENDPOINTS } from '../../../config/api';
import { useToast } from '../../../context/ToastContext';
import { useCurrency } from '../../../context/CurrencyContext';

import '../../../styles/components/page-layout.css';
import '../../../styles/components/form-layout.css';
import '../../../styles/components/modal-system.css';

export default function RefundModal({ isOpen, onClose, returnId, orderId, orderDisplayId, outstandingBalance, maxRefundable, onRefundComplete }) {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const { currency } = useCurrency();
    const [loading, setLoading] = useState(false);
    
    const [bankAccounts, setBankAccounts] = useState([]);
    const [cashWallets, setCashWallets] = useState([]);
    
    const [formData, setFormData] = useState({
        return_request: returnId,
        order: orderId,
        amount: '',
        method: 'customer_wallet',
        transaction_id: '',
        note: '',
        finance_account_id: '' 
    });

    useEffect(() => {
        if (isOpen) {
            setFormData({
                return_request: returnId,
                order: orderId,
                amount: outstandingBalance || '',
                method: 'customer_wallet',
                transaction_id: '',
                note: '',
                finance_account_id: ''
            });
            fetchFinanceAccounts();
        }
    }, [isOpen, returnId, orderId, outstandingBalance]);

    const fetchFinanceAccounts = async () => {
        try {
            const [banksRes, walletsRes] = await Promise.all([
                fetchWithAuth(ENDPOINTS.FINANCE_BANK_ACCOUNTS),
                fetchWithAuth(ENDPOINTS.FINANCE_CASH_WALLETS)
            ]);
            if (banksRes.ok) {
                const banksData = await banksRes.json();
                setBankAccounts(banksData.results || banksData);
            }
            if (walletsRes.ok) {
                const walletsData = await walletsRes.json();
                setCashWallets(walletsData.results || walletsData);
            }
        } catch (error) {
            showToast("Failed to fetch finance accounts", "error");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.amount || parseFloat(formData.amount) <= 0) {
            showToast("Please enter a valid amount", "error");
            return;
        }

        const requiresBank = ['bank', 'cheque', 'upi'].includes(formData.method);
        const requiresCash = formData.method === 'cash';

        if ((requiresBank || requiresCash) && !formData.finance_account_id) {
            showToast("Please select a source account for the funds", "error");
            return;
        }

        setLoading(true);
        try {
            const payload = { ...formData };
            if (requiresBank) {
                payload.source_bank = payload.finance_account_id;
            } else if (requiresCash) {
                payload.source_wallet = payload.finance_account_id;
            }
            delete payload.finance_account_id;

            const response = await fetchWithAuth(ENDPOINTS.ORDERS_REFUNDS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                showToast("Refund recorded successfully", "success");
                onRefundComplete();
                onClose();
            } else {
                const errorData = await response.json();
                const errorMsg = errorData.amount ? errorData.amount[0] : errorData.non_field_errors?.[0] || "Failed to record refund";
                showToast(errorMsg, "error");
            }
        } catch (error) {
            console.error(error);
            showToast("Failed to record refund", "error");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const requiresBank = ['bank', 'cheque', 'upi'].includes(formData.method);
    const requiresCash = formData.method === 'cash';
    const sourceAccounts = requiresBank ? bankAccounts : cashWallets;

    return (
        <div className="modal-overlay" style={overlayStyle}>
            <div className="modal-content" style={contentStyle}>
                <h2>Record Refund for Order #{orderDisplayId}</h2>
                <p className="page-subtitle mb-4">
                    Recommended: {currency}{outstandingBalance} 
                    {maxRefundable !== undefined && <span style={{color: 'var(--color-danger)', marginLeft: '10px'}}>(Max Cap: {currency}{maxRefundable})</span>}
                </p>
                
                {maxRefundable !== undefined && Number(maxRefundable) < Number(outstandingBalance) && (
                    <div style={{
                        padding: '0.75rem', 
                        background: 'rgba(239, 68, 68, 0.1)', 
                        color: 'var(--color-danger)', 
                        borderRadius: '8px', 
                        marginBottom: '1rem',
                        fontSize: '0.85rem',
                        lineHeight: '1.5'
                    }}>
                        <strong>Why is the cap lower than the return value?</strong><br/>
                        The customer underpaid the original order. The maximum refund is mathematically limited to what they actually overpaid relative to the new effective total.
                    </div>
                )}

                <form onSubmit={handleSubmit} className="form-layout">
                    <div className="form-row">
                        <div className="form-group">
                            <label>Amount ({currency}) *</label>
                            <input 
                                type="number" 
                                step="0.01"
                                required 
                                className="form-input"
                                value={formData.amount}
                                onChange={e => setFormData({...formData, amount: e.target.value})}
                                max={maxRefundable !== undefined ? Math.min(Number(outstandingBalance), Number(maxRefundable)) : outstandingBalance}
                            />
                        </div>
                        <div className="form-group">
                            <label>Refund Method *</label>
                            <select 
                                className="form-input"
                                value={formData.method}
                                onChange={e => setFormData({...formData, method: e.target.value, finance_account_id: ''})}
                            >
                                <option value="customer_wallet">Customer Wallet (Store Credit)</option>
                                <option value="cash">Cash</option>
                                <option value="bank">Bank Transfer (NEFT/RTGS/IMPS)</option>
                                <option value="cheque">Cheque</option>
                                <option value="upi">UPI</option>
                            </select>
                        </div>
                    </div>

                    {(requiresBank || requiresCash) && (
                        <div className="form-group">
                            <label>Source Account *</label>
                            <select 
                                required
                                className="form-input"
                                value={formData.finance_account_id}
                                onChange={e => setFormData({...formData, finance_account_id: e.target.value})}
                            >
                                <option value="">Select Source Ledger...</option>
                                {sourceAccounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} {acc.account_number ? `(*${acc.account_number.slice(-4)})` : ''}</option>
                                ))}
                            </select>
                            <small className="text-muted">Funds will be withdrawn from this ledger automatically.</small>
                        </div>
                    )}

                    <div className="form-group">
                        <label>Reference Number / ID</label>
                        <input 
                            type="text" 
                            className="form-input"
                            value={formData.transaction_id}
                            onChange={e => setFormData({...formData, transaction_id: e.target.value})}
                            placeholder={requiresBank ? "UTR/Cheque No." : "Optional"}
                        />
                    </div>

                    <div className="form-group">
                        <label>Internal Notes</label>
                        <textarea 
                            className="form-input"
                            rows="2"
                            value={formData.note}
                            onChange={e => setFormData({...formData, note: e.target.value})}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-success" disabled={loading}>
                            {loading ? 'Processing...' : 'Issue Refund'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const overlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
    display: 'flex', justifyContent: 'center', alignItems: 'center'
};
const contentStyle = {
    backgroundColor: 'var(--color-bg-primary)', padding: '2rem',
    borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '600px',
    boxShadow: 'var(--shadow-xl)'
};
