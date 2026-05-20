import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import { ArrowLeft, Save } from 'lucide-react';

export default function AddOtherIncome() {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    
    const [wallets, setWallets] = useState([]);
    const [banks, setBanks] = useState([]);
    const [categories, setCategories] = useState([]);

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        source: '',
        amount: '',
        description: '',
        destination_type: 'wallet', // 'wallet' or 'bank'
        destination_wallet: '',
        destination_bank: '',
        category: ''
    });

    useEffect(() => {
        const fetchDependencies = async () => {
            try {
                const [walletsRes, banksRes, catsRes] = await Promise.all([
                    fetchWithAuth(ENDPOINTS.FINANCE_CASH_WALLETS),
                    fetchWithAuth(ENDPOINTS.FINANCE_BANK_ACCOUNTS),
                    fetchWithAuth(ENDPOINTS.FINANCE_INCOME_CATEGORIES)
                ]);
                
                if (walletsRes.ok) {
                    const data = await walletsRes.json();
                    setWallets(data.results || data);
                }
                if (banksRes.ok) {
                    const data = await banksRes.json();
                    setBanks(data.results || data);
                }
                if (catsRes.ok) {
                    const data = await catsRes.json();
                    setCategories(data.results || data);
                }
            } catch (error) {
                showToast("Failed to load form dependencies", 'error');
            }
        };
        fetchDependencies();
    }, [fetchWithAuth]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Ledger Guardrails: Ensure a destination is actually selected
        if (formData.destination_type === 'wallet' && !formData.destination_wallet) {
            showToast("You must select a destination cash wallet to record this income.", 'error');
            return;
        }
        if (formData.destination_type === 'bank' && !formData.destination_bank) {
            showToast("You must select a destination bank account to record this income.", 'error');
            return;
        }

        setLoading(true);
        try {
            // Clean up payload based on destination type
            const payload = { ...formData };
            if (payload.destination_type === 'wallet') {
                delete payload.destination_bank;
            } else {
                delete payload.destination_wallet;
            }
            delete payload.destination_type;

            const res = await fetchWithAuth(ENDPOINTS.FINANCE_OTHER_INCOME, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                showToast("Income recorded successfully and deposited into ledger.", 'success');
                navigate('/finance/other-income');
            } else {
                const err = await res.json();
                showToast(err.detail || 'Failed to record income', 'error');
            }
        } catch (error) {
            showToast("Network error. Please try again.", 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container fade-in">
            <div className="page-header" style={{ marginBottom: '2rem' }}>
                <button className="btn-icon" onClick={() => navigate('/finance/other-income')} style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)' }}>
                    <ArrowLeft size={18} /> Back to Other Income
                </button>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 600 }}>Record Other Income</h1>
                <p style={{ color: 'var(--color-text-muted)' }}>Record non-sales revenue directly into a bank account or cash wallet.</p>
            </div>

            <div className="form-card" style={{ background: 'var(--color-surface)', padding: '2rem', borderRadius: '12px', border: '1px solid var(--color-border)', maxWidth: '800px' }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    
                    <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Date *</label>
                            <input type="date" className="form-control" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Amount *</label>
                            <input type="number" step="0.01" min="0.01" className="form-control" placeholder="0.00" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} required />
                        </div>
                    </div>

                    <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Source (e.g. Rent, Interest) *</label>
                            <input type="text" className="form-control" placeholder="Source of income" value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})} required />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Income Category</label>
                            <select className="form-control" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                                <option value="">Select a category...</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Description</label>
                        <textarea className="form-control" rows="3" placeholder="Additional details..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
                    </div>

                    <hr style={{ borderTop: '1px solid var(--color-border)', margin: '1rem 0' }} />
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Ledger Routing Guardrails</h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                        To ensure accounting integrity, you must specify where this income was deposited.
                    </p>

                    <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Destination Type *</label>
                            <select className="form-control" value={formData.destination_type} onChange={e => setFormData({...formData, destination_type: e.target.value, destination_bank: '', destination_wallet: ''})} required>
                                <option value="wallet">Cash Wallet</option>
                                <option value="bank">Bank Account</option>
                            </select>
                        </div>
                        
                        <div className="form-group" style={{ flex: 1 }}>
                            {formData.destination_type === 'wallet' ? (
                                <>
                                    <label>Select Cash Wallet *</label>
                                    <select className="form-control" value={formData.destination_wallet} onChange={e => setFormData({...formData, destination_wallet: e.target.value})} required>
                                        <option value="">Choose wallet...</option>
                                        {wallets.map(w => (
                                            <option key={w.id} value={w.id}>{w.name} (Balance: {w.balance})</option>
                                        ))}
                                    </select>
                                </>
                            ) : (
                                <>
                                    <label>Select Bank Account *</label>
                                    <select className="form-control" value={formData.destination_bank} onChange={e => setFormData({...formData, destination_bank: e.target.value})} required>
                                        <option value="">Choose bank...</option>
                                        {banks.map(b => (
                                            <option key={b.id} value={b.id}>{b.name} ({b.bank_name})</option>
                                        ))}
                                    </select>
                                </>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                        <button type="submit" className="btn btn-primary" disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {loading ? <div className="spinner-small" style={{ borderColor: 'white', borderTopColor: 'transparent' }}></div> : <Save size={18} />}
                            {loading ? 'Recording...' : 'Record & Deposit Income'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
