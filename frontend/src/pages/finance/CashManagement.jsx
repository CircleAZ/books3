import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import { useToast } from '../../context/ToastContext';
import './CashManagement.css';

import '../../styles/components/form-layout.css';
import '../../styles/components/modal-system.css';
export default function CashManagement() {
    const { fetchWithAuth, user } = useAuth();
    const { currency } = useCurrency();
    const { showToast } = useToast();

    const [wallets, setWallets] = useState([]);
    const [transfers, setTransfers] = useState([]);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showTransferModal, setShowTransferModal] = useState(false);
    const [showCreateWalletModal, setShowCreateWalletModal] = useState(false);
    const [transferForm, setTransferForm] = useState({
        source_wallet: '',
        destination_type: 'bank', // 'bank' or 'wallet'
        destination_bank: '',
        destination_wallet: '',
        amount: '',
        reference_id: ''
    });
    const [walletForm, setWalletForm] = useState({
        wallet_type: 'company', // 'company' or 'personal'
        name: '',
        owner: '',
    });
    const [walletFormError, setWalletFormError] = useState('');
    
    const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
    const [isSubmittingWallet, setIsSubmittingWallet] = useState(false);
    const [approvingId, setApprovingId] = useState(null);

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

            // Fetch users for personal wallet assignment
            const uRes = await fetchWithAuth(ENDPOINTS.SETTINGS_USERS);
            if (uRes.ok) {
                const uData = await uRes.json();
                setAllUsers(uData.results || uData);
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

    // Users who don't already have a wallet
    const usersWithoutWallet = allUsers.filter(u => {
        return !wallets.some(w => w.owner === u.id);
    });

    const handleTransferSubmit = async (e) => {
        e.preventDefault();
        if (isSubmittingTransfer) return;
        setIsSubmittingTransfer(true);
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
                headers: {
                    'X-Idempotency-Key': crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
                },
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
                showToast('Transfer initiated. It is pending peer approval.', 'success');
            } else {
                const err = await response.json();
                showToast('Transfer failed: ' + JSON.stringify(err), 'error');
            }
        } catch (err) {
            console.error('Transfer error:', err);
        } finally {
            setIsSubmittingTransfer(false);
        }
    };

    const handleCreateWallet = async (e) => {
        e.preventDefault();
        if (isSubmittingWallet) return;
        setWalletFormError('');

        if (!walletForm.name.trim()) {
            setWalletFormError('Wallet name is required.');
            return;
        }

        setIsSubmittingWallet(true);
        try {
            const payload = { name: walletForm.name.trim() };

            if (walletForm.wallet_type === 'personal') {
                if (!walletForm.owner) {
                    setWalletFormError('Please select an employee.');
                    setIsSubmittingWallet(false);
                    return;
                }
                payload.owner = walletForm.owner;
            }
            // If wallet_type === 'company', no owner → backend sets is_system=True

            const response = await fetchWithAuth(ENDPOINTS.FINANCE_CASH_WALLETS, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                setShowCreateWalletModal(false);
                setWalletForm({ wallet_type: 'company', name: '', owner: '' });
                fetchData();
            } else {
                const err = await response.json();
                // Handle OneToOneField violation gracefully
                const errMsg = typeof err === 'object' 
                    ? Object.values(err).flat().join(', ') 
                    : JSON.stringify(err);
                setWalletFormError(errMsg);
            }
        } catch (err) {
            console.error('Create wallet error:', err);
            setWalletFormError('Network error. Please try again.');
        } finally {
            setIsSubmittingWallet(false);
        }
    };

    const handleApprove = async (id) => {
        if (approvingId) return; // P0 Fix: Block double-click
        setApprovingId(id);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_CASH_TRANSFERS}${id}/approve/`, {
                method: 'POST'
            });
            if (response.ok) {
                fetchData();
                showToast('Transfer Approved!', 'success');
            } else {
                const err = await response.json();
                showToast(err.error || 'Failed to approve', 'error');
            }
        } catch (err) {
            console.error('Approval error:', err);
        } finally {
            setApprovingId(null);
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
                showToast(err.error || 'Failed to reject', 'error');
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
                <div className="d-flex gap-2">
                    <button className="btn btn-secondary" onClick={() => setShowCreateWalletModal(true)}>
                        + New Wallet
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowTransferModal(true)}>
                        Initiate Transfer
                    </button>
                </div>
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
                                                        disabled={(t.initiated_by === user?.id && !user?.is_superuser) || approvingId === t.id}
                                                        title={t.initiated_by === user?.id && !user?.is_superuser ? "Cannot approve your own transfer" : ""}
                                                    >
                                                        {approvingId === t.id ? 'Approving...' : 'Approve'}
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
                                <button type="button" className="btn btn-ghost" onClick={() => setShowTransferModal(false)} disabled={isSubmittingTransfer}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={isSubmittingTransfer}>
                                    {isSubmittingTransfer ? 'Initiating...' : 'Initiate'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Create Wallet Modal */}
            {showCreateWalletModal && (
                <div className="modal-overlay">
                    <div className="modal-content glass-card">
                        <div className="modal-header">
                            <h2>Create Cash Wallet</h2>
                            <button className="close-btn" onClick={() => { setShowCreateWalletModal(false); setWalletFormError(''); }}>&times;</button>
                        </div>
                        <form onSubmit={handleCreateWallet}>
                            <div className="form-group">
                                <label>Wallet Type</label>
                                <div className="wallet-type-selector">
                                    <label className={`radio-card ${walletForm.wallet_type === 'company' ? 'active' : ''}`}>
                                        <input
                                            type="radio"
                                            name="wallet_type"
                                            value="company"
                                            checked={walletForm.wallet_type === 'company'}
                                            onChange={() => setWalletForm({ ...walletForm, wallet_type: 'company', owner: '', name: '' })}
                                        />
                                        <div className="radio-card-content">
                                            <strong>🏢 Company Wallet</strong>
                                            <small>Shared safe, register, or petty cash</small>
                                        </div>
                                    </label>
                                    <label className={`radio-card ${walletForm.wallet_type === 'personal' ? 'active' : ''}`}>
                                        <input
                                            type="radio"
                                            name="wallet_type"
                                            value="personal"
                                            checked={walletForm.wallet_type === 'personal'}
                                            onChange={() => setWalletForm({ ...walletForm, wallet_type: 'personal', owner: '', name: '' })}
                                        />
                                        <div className="radio-card-content">
                                            <strong>👤 Personal Wallet</strong>
                                            <small>Assigned to a specific employee</small>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {walletForm.wallet_type === 'personal' && (
                                <div className="form-group">
                                    <label>Assign to Employee</label>
                                    <select
                                        className="form-control"
                                        value={walletForm.owner}
                                        onChange={e => {
                                            const selectedUser = allUsers.find(u => u.id === e.target.value);
                                            setWalletForm({
                                                ...walletForm,
                                                owner: e.target.value,
                                                name: selectedUser ? `${selectedUser.username}'s Wallet` : ''
                                            });
                                        }}
                                        required
                                    >
                                        <option value="">Select Employee...</option>
                                        {usersWithoutWallet.map(u => (
                                            <option key={u.id} value={u.id}>
                                                {u.full_name || u.username} ({u.role || 'staff'})
                                            </option>
                                        ))}
                                    </select>
                                    {usersWithoutWallet.length === 0 && (
                                        <small className="helper-text" style={{ color: 'var(--color-warning)', display: 'block', marginTop: '4px' }}>
                                            All employees already have wallets.
                                        </small>
                                    )}
                                </div>
                            )}

                            <div className="form-group">
                                <label>Wallet Name</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder={walletForm.wallet_type === 'company' ? 'e.g., Branch 2 Register, Event Petty Cash' : "e.g., John's Wallet"}
                                    value={walletForm.name}
                                    onChange={e => setWalletForm({ ...walletForm, name: e.target.value })}
                                    required
                                />
                            </div>

                            {walletFormError && (
                                <div className="form-error" style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '12px', padding: '8px', background: 'rgba(239,68,68,0.1)', borderRadius: '6px' }}>
                                    {walletFormError}
                                </div>
                            )}

                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => { setShowCreateWalletModal(false); setWalletFormError(''); }} disabled={isSubmittingWallet}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={isSubmittingWallet}>
                                    {isSubmittingWallet ? 'Creating...' : 'Create Wallet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
