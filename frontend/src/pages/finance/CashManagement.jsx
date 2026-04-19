import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import './CashManagement.css';

export default function CashManagement() {
    const { fetchWithAuth, user } = useAuth();
    const { currency } = useCurrency();

    const [wallets, setWallets] = useState([]);
    const [transfers, setTransfers] = useState([]);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferForm, setTransferForm] = useState({
        source_wallet: '',
        destination_type: 'bank', // 'bank' or 'wallet'
        destination_bank: '',
        destination_wallet: '',
        amount: '',
        reference_id: ''
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch wallets
            const wRes = await fetchWithAuth(ENDPOINTS.FINANCE_CASH_WALLETS);
            if (wRes.ok) {
                const wData = await wRes.json();
                setWallets(wData.results || wData);
            }

            // Fetch transfers
            const tRes = await fetchWithAuth(ENDPOINTS.FINANCE_CASH_TRANSFERS);
            if (tRes.ok) {
                const tData = await tRes.json();
                setTransfers(tData.results || tData);
            }

            // Fetch banks
            const bRes = await fetchWithAuth(ENDPOINTS.FINANCE_BANK_ACCOUNTS + '?active_only=true');
            if (bRes.ok) {
                const bData = await bRes.json();
                setBankAccounts(bData.results || bData);
            }

        } catch (err) {
            console.error('Error fetching cash management data:', err);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleTransferSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                source_wallet: transferForm.source_wallet,
                amount: parseFloat(transferForm.amount),
                reference_id: transferForm.reference_id,
            };
            if (transferForm.destination_type === 'bank') {
                payload.destination_bank = transferForm.destination_bank;
            } else {
                payload.destination_wallet = transferForm.destination_wallet;
            }

            const response = await fetchWithAuth(ENDPOINTS.FINANCE_CASH_TRANSFERS, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                setShowTransferModal(false);
                setTransferForm({
                    source_wallet: '',
                    destination_type: 'bank',
                    destination_bank: '',
                    destination_wallet: '',
                    amount: '',
                    reference_id: ''
                });
                fetchData();
                alert('Transfer initiated. It is pending peer approval.');
            } else {
                const err = await response.json();
                alert('Transfer failed: ' + JSON.stringify(err));
            }
        } catch (err) {
            console.error('Transfer error:', err);
        }
    };

    const handleApprove = async (id) => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_CASH_TRANSFERS}${id}/approve/`, {
                method: 'POST'
            });
            if (response.ok) {
                fetchData();
                alert('Transfer Approved!');
            } else {
                const err = await response.json();
                alert(err.error || 'Failed to approve');
            }
        } catch (err) {
            console.error('Approval error:', err);
        }
    };

    const handleReject = async (id) => {
        if (!window.confirm('Reject this transfer?')) return;
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_CASH_TRANSFERS}${id}/reject/`, {
                method: 'POST'
            });
            if (response.ok) {
                fetchData();
            } else {
                const err = await response.json();
                alert(err.error || 'Failed to reject');
            }
        } catch (err) {
            console.error('Reject error:', err);
        }
    };

    if (loading) return <div className="loading-spinner">Loading Cash Management...</div>;

    return (
        <div className="cash-management-container fade-in">
            <div className="header-actions">
                <h1>Cash Management</h1>
                <button className="btn btn-primary" onClick={() => setShowTransferModal(true)}>
                    Initiate Transfer
                </button>
            </div>

            <div className="wallets-grid">
                {wallets.map(wallet => (
                    <div key={wallet.id} className="glass-card wallet-card">
                        <h3>{wallet.name}</h3>
                        <p className="wallet-owner">Owner: {wallet.owner_name}</p>
                        <div className="wallet-balance">
                            {currency}{Number(wallet.balance).toLocaleString()}
                        </div>
                        {wallet.is_system && <span className="badge badge-system">System Safe</span>}
                    </div>
                ))}
            </div>

            <div className="glass-card mt-4">
                <h3>Peer Review Approval Matrix (Transfers)</h3>
                <div className="table-responsive">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>From</th>
                                <th>To</th>
                                <th>Amount</th>
                                <th>Initiator</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transfers.length === 0 ? (
                                <tr><td colSpan="7" className="text-center">No transfers found.</td></tr>
                            ) : (
                                transfers.map(t => (
                                    <tr key={t.id}>
                                        <td>{new Date(t.created_at).toLocaleString()}</td>
                                        <td>{t.source_wallet_name}</td>
                                        <td>{t.destination_wallet_name || t.destination_bank_name}</td>
                                        <td className="amount">{currency}{Number(t.amount).toLocaleString()}</td>
                                        <td>{t.initiated_by_name}</td>
                                        <td>
                                            <span className={`status-badge status-${t.status}`}>
                                                {t.status}
                                            </span>
                                        </td>
                                        <td>
                                            {t.status === 'pending' && (
                                                <div className="action-buttons">
                                                    <button 
                                                        className="btn btn-success btn-sm"
                                                        onClick={() => handleApprove(t.id)}
                                                        disabled={t.initiated_by === user?.id && !user?.is_superuser}
                                                        title={t.initiated_by === user?.id && !user?.is_superuser ? "Cannot approve your own transfer" : ""}
                                                    >
                                                        Approve
                                                    </button>
                                                    <button 
                                                        className="btn btn-danger btn-sm"
                                                        onClick={() => handleReject(t.id)}
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showTransferModal && (
                <div className="modal-overlay">
                    <div className="modal-content glass-card">
                        <div className="modal-header">
                            <h2>Initiate Cash Transfer</h2>
                            <button className="close-btn" onClick={() => setShowTransferModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleTransferSubmit}>
                            <div className="form-group">
                                <label>Source Wallet</label>
                                <select 
                                    className="form-control"
                                    value={transferForm.source_wallet}
                                    onChange={e => setTransferForm({...transferForm, source_wallet: e.target.value})}
                                    required
                                >
                                    <option value="">Select Wallet...</option>
                                    {wallets.map(w => (
                                        <option key={w.id} value={w.id}>{w.name} ({currency}{w.balance})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Destination Type</label>
                                <select 
                                    className="form-control"
                                    value={transferForm.destination_type}
                                    onChange={e => setTransferForm({...transferForm, destination_type: e.target.value})}
                                >
                                    <option value="bank">Bank Account</option>
                                    <option value="wallet">Other Cash Wallet</option>
                                </select>
                            </div>
                            
                            {transferForm.destination_type === 'bank' ? (
                                <div className="form-group">
                                    <label>Destination Bank Account</label>
                                    <select 
                                        className="form-control"
                                        value={transferForm.destination_bank}
                                        onChange={e => setTransferForm({...transferForm, destination_bank: e.target.value})}
                                        required
                                    >
                                        <option value="">Select Bank...</option>
                                        {bankAccounts.map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <div className="form-group">
                                    <label>Destination Wallet</label>
                                    <select 
                                        className="form-control"
                                        value={transferForm.destination_wallet}
                                        onChange={e => setTransferForm({...transferForm, destination_wallet: e.target.value})}
                                        required
                                    >
                                        <option value="">Select Wallet...</option>
                                        {wallets.map(w => (
                                            <option key={w.id} value={w.id}>{w.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="form-group">
                                <label>Amount</label>
                                <input 
                                    type="number"
                                    className="form-control"
                                    step="0.01"
                                    min="0.01"
                                    value={transferForm.amount}
                                    onChange={e => setTransferForm({...transferForm, amount: e.target.value})}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Reference ID (Optional)</label>
                                <input 
                                    type="text"
                                    className="form-control"
                                    value={transferForm.reference_id}
                                    onChange={e => setTransferForm({...transferForm, reference_id: e.target.value})}
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowTransferModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Initiate</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
