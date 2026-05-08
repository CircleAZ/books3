import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { ENDPOINTS } from '../../../config/api';
import { useToast } from '../../../context/ToastContext';

import '../../../styles/components/page-layout.css';
import '../../../styles/components/form-layout.css';
import '../../../styles/components/modal-system.css';
export default function PaymentModal({ isOpen, onClose, outletId, outstandingBalance, onPaymentComplete }) {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    
    // We need to fetch Bank Accounts and Cash Wallets for finance ledger linking
    const [bankAccounts, setBankAccounts] = useState([]);
    const [cashWallets, setCashWallets] = useState([]);
    
    const [formData, setFormData] = useState({
        outlet: outletId,
        date: new Date().toISOString().split('T')[0],
        amount: '',
        payment_method: 'bank',
        reference_id: '',
        notes: '',
        // These fields are needed for backend ledger injection
        finance_account_id: '' 
    });

    useEffect(() => {
        if (isOpen) {
            setFormData({
                outlet: outletId,
                date: new Date().toISOString().split('T')[0],
                amount: outstandingBalance || '',
                payment_method: 'bank',
                reference_id: '',
                notes: '',
                finance_account_id: ''
            });
            fetchFinanceAccounts();
        }
    }, [isOpen, outletId, outstandingBalance]);

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

        if (!formData.finance_account_id) {
            showToast("Please select a target destination account for the funds", "error");
            return;
        }

        setLoading(true);
        try {
            // The backend ViewSet / Serializer should handle the link to bank_transaction/wallet_transaction.
            // We pass extra context fields.
            const response = await fetchWithAuth(ENDPOINTS.OUTLETS_PAYMENTS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (response.ok) {
                showToast("Payment recorded and injected into finance ledger", "success");
                onPaymentComplete();
                onClose();
            } else {
                showToast("Failed to record payment", "error");
            }
        } catch (error) {
            console.error(error);
            showToast("Failed to record payment", "error");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const requiresBank = ['bank', 'cheque', 'upi'].includes(formData.payment_method);
    const destinationAccounts = requiresBank ? bankAccounts : cashWallets;

    return (
        <div className="modal-overlay" style={overlayStyle}>
            <div className="modal-content" style={contentStyle}>
                <h2>Log Outlet Payment</h2>
                <p className="page-subtitle mb-4">Outstanding Balance: ₹{outstandingBalance}</p>

                <form onSubmit={handleSubmit} className="form-layout">
                    <div className="form-row">
                        <div className="form-group">
                            <label>Payment Date *</label>
                            <input 
                                type="date" 
                                required 
                                className="form-input"
                                value={formData.date}
                                onChange={e => setFormData({...formData, date: e.target.value})}
                            />
                        </div>
                        <div className="form-group">
                            <label>Amount (₹) *</label>
                            <input 
                                type="number" 
                                step="0.01"
                                required 
                                className="form-input"
                                value={formData.amount}
                                onChange={e => setFormData({...formData, amount: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Payment Method *</label>
                            <select 
                                className="form-input"
                                value={formData.payment_method}
                                onChange={e => setFormData({...formData, payment_method: e.target.value, finance_account_id: ''})}
                            >
                                <option value="cash">Cash</option>
                                <option value="bank">Bank Transfer (NEFT/RTGS/IMPS)</option>
                                <option value="cheque">Cheque</option>
                                <option value="upi">UPI</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Destination Account *</label>
                            <select 
                                required
                                className="form-input"
                                value={formData.finance_account_id}
                                onChange={e => setFormData({...formData, finance_account_id: e.target.value})}
                            >
                                <option value="">Select Account...</option>
                                {destinationAccounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} {acc.account_number ? `(*${acc.account_number.slice(-4)})` : ''}</option>
                                ))}
                            </select>
                            <small className="text-muted">Funds will be injected here automatically.</small>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Reference Number (UTR/Cheque No.)</label>
                        <input 
                            type="text" 
                            className="form-input"
                            value={formData.reference_id}
                            onChange={e => setFormData({...formData, reference_id: e.target.value})}
                        />
                    </div>

                    <div className="form-group">
                        <label>Internal Notes</label>
                        <textarea 
                            className="form-input"
                            rows="2"
                            value={formData.notes}
                            onChange={e => setFormData({...formData, notes: e.target.value})}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-success" disabled={loading}>
                            {loading ? 'Processing...' : 'Record Payment'}
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
