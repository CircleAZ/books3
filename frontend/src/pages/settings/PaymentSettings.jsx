import React, { useState, useEffect } from 'react';

import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import { sanitizeFKFields } from '../../utils/payloadSanitizer';
import './FinancialSettings.css';
import '../settings/SettingsIndex.css';

import '../../styles/components/form-layout.css';
import '../../styles/components/modal-system.css';
const PaymentSettings = () => {
    const { fetchWithAuth } = useAuth();

    const [methods, setMethods] = useState([]);
    const [upiAccounts, setUpiAccounts] = useState([]);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showMethodModal, setShowMethodModal] = useState(false);
    const [showUpiModal, setShowUpiModal] = useState(false);
    const [newMethod, setNewMethod] = useState({ type: '', is_enabled: true, display_order: 0, linked_bank_account: '' });
    const [newUpi, setNewUpi] = useState({ upi_id: '', display_name: '', is_active: true, linked_bank_account: '' });
    const [message, setMessage] = useState(null);
    const [confirmDialog, setConfirmDialog] = useState({ show: false, title: '', message: '', onConfirm: null });

    useEffect(() => {
        loadAll();
    }, []);

    async function loadAll() {
        setLoading(true);
        await Promise.all([fetchMethods(), fetchUpiAccounts(), fetchBankAccounts()]);
        setLoading(false);
    }

    const fetchMethods = async () => {
        try {
            const response = await fetchWithAuth(ENDPOINTS.SETTINGS_PAYMENT_METHODS);
            if (response.ok) {
                const data = await response.json();
                setMethods(data.results || data);
            }
        } catch (error) {
            console.error('Error fetching payment methods:', error);
        }
    };

    const fetchUpiAccounts = async () => {
        try {
            const response = await fetchWithAuth(ENDPOINTS.SETTINGS_UPI_ACCOUNTS);
            if (response.ok) {
                const data = await response.json();
                setUpiAccounts(data.results || data);
            }
        } catch (error) {
            console.error('Error fetching UPI accounts:', error);
        }
    };

    const fetchBankAccounts = async () => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_BANK_ACCOUNTS}?active_only=true`);
            if (response.ok) {
                const data = await response.json();
                setBankAccounts(data.results || data);
            }
        } catch (error) {
            console.error('Error fetching bank accounts:', error);
        }
    };

    const handleAddMethod = async (e) => {
        e.preventDefault();
        try {
            const response = await fetchWithAuth(ENDPOINTS.SETTINGS_PAYMENT_METHODS, {
                method: 'POST',
                body: JSON.stringify(
                    sanitizeFKFields({ ...newMethod }, ['linked_bank_account'])
                )
            });
            if (response.ok) {
                fetchMethods();
                setShowMethodModal(false);
                setNewMethod({ type: '', is_enabled: true, display_order: 0, linked_bank_account: '' });
// fallow-ignore-next-line code-duplication
                setMessage({ type: 'success', text: 'Payment method added' });
            } else {
                const err = await response.json();
                setMessage({ type: 'error', text: JSON.stringify(err) });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Network error' });
        }
    };

    const handleToggleMethod = async (method) => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_PAYMENT_METHODS}${method.id}/`, {
                method: 'PATCH',
                body: JSON.stringify({ is_enabled: !method.is_enabled })
            });
            if (response.ok) fetchMethods();
        } catch (error) {
            console.error('Error toggling method:', error);
        }
    };

    const handleDeleteMethod = (method) => {
        setConfirmDialog({
            show: true,
            title: 'Delete Payment Method',
            message: `Are you sure you want to delete "${method.type}"? This action cannot be undone.`,
            onConfirm: async () => {
                try {
                    const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_PAYMENT_METHODS}${method.id}/`, {
                        method: 'DELETE'
                    });
                    if (response.ok) {
                        fetchMethods();
                        setMessage({ type: 'success', text: 'Payment method deleted' });
                    }
                } catch (error) {
                    console.error('Error deleting method:', error);
                    setMessage({ type: 'error', text: 'Failed to delete payment method' });
                }
                setConfirmDialog({ show: false, title: '', message: '', onConfirm: null });
            }
        });
    };

    const handleAddUpi = async (e) => {
        e.preventDefault();
        try {
            // Validate UPI ID format (username@bankname)
            const upiPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/;
            if (!upiPattern.test(newUpi.upi_id)) {
                setMessage({ type: 'error', text: 'Invalid UPI ID format. Expected format: username@bankname (e.g., store@upi, user@paytm)' });
                return;
            }

            const response = await fetchWithAuth(ENDPOINTS.SETTINGS_UPI_ACCOUNTS, {
                method: 'POST',
                body: JSON.stringify(
                    sanitizeFKFields({ ...newUpi }, ['linked_bank_account'])
                )
            });
            if (response.ok) {
                fetchUpiAccounts();
                setShowUpiModal(false);
                setNewUpi({ upi_id: '', display_name: '', is_active: true, linked_bank_account: '' });
// fallow-ignore-next-line code-duplication
                setMessage({ type: 'success', text: 'UPI account added' });
            } else {
                const err = await response.json();
                setMessage({ type: 'error', text: JSON.stringify(err) });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Network error' });
        }
    };

    const handleToggleUpi = async (upi) => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_UPI_ACCOUNTS}${upi.id}/`, {
                method: 'PATCH',
                body: JSON.stringify({ is_active: !upi.is_active })
            });
            if (response.ok) fetchUpiAccounts();
        } catch (error) {
            console.error('Error toggling UPI:', error);
        }
    };

    const handleDeleteUpi = (upi) => {
        setConfirmDialog({
            show: true,
            title: 'Delete UPI Account',
            message: `Are you sure you want to delete "${upi.display_name}" (${upi.upi_id})? This action cannot be undone.`,
            onConfirm: async () => {
                try {
                    const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_UPI_ACCOUNTS}${upi.id}/`, {
                        method: 'DELETE'
                    });
                    if (response.ok) {
                        fetchUpiAccounts();
                        setMessage({ type: 'success', text: 'UPI account deleted' });
                    }
                } catch (error) {
                    console.error('Error deleting UPI:', error);
                    setMessage({ type: 'error', text: 'Failed to delete UPI account' });
                }
                setConfirmDialog({ show: false, title: '', message: '', onConfirm: null });
            }
        });
    };

    const getMethodIcon = (type) => {
        const icons = { cash: '💵', upi: '📱', card: '💳', bank: '🏦' };
        return icons[type] || '💰';
    };

    const getBankName = (bankId) => {
        if (!bankId) return <span className="text-muted">—</span>;
        const bank = bankAccounts.find(b => b.id === bankId);
        return bank ? bank.name : 'Unknown Bank';
    };

    if (loading) return <div className="loading-container"><div className="spinner-large"></div></div>;

    return (
        <div className="financial-settings-container">


            {message && (
                <div className={`profile-message ${message.type}`}>
                    {message.text}
                    <button className="message-close" onClick={() => setMessage(null)}>×</button>
                </div>
            )}

            <div className="settings-grid">
                {/* Payment Methods Section */}
                <section className="settings-card">
                    <div className="card-header">
                        <h2>Payment Methods</h2>
{/* fallow-ignore-next-line code-duplication */}
                        <button className="btn btn-sm btn-primary" onClick={() => setShowMethodModal(true)}>+ Add Method</button>
                    </div>
                    <div className="card-body">
                        <p className="helper-text">Enable or disable payment methods available at checkout.</p>
                        <table className="settings-table">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Linked Bank</th>
                                    <th>Enabled</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {methods.map(method => (
                                    <tr key={method.id} className={!method.is_enabled ? 'disabled-row' : ''}>
                                        <td>{method.type}</td>
                                        <td>{getBankName(method.linked_bank_account)}</td>
                                        <td>
                                            <label className="toggle-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={method.is_enabled}
                                                    onChange={() => handleToggleMethod(method)}
                                                />
                                                <span className="toggle-slider"></span>
                                            </label>
                                        </td>
                                        <td>
                                            <button className="btn-icon danger" onClick={() => handleDeleteMethod(method)}>Delete</button>
                                        </td>
                                    </tr>
                                ))}
                                {methods.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="text-center">No payment methods configured. Add one to get started.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* UPI Accounts Section */}
                <section className="settings-card">
                    <div className="card-header">
                        <h2>UPI Accounts</h2>
{/* fallow-ignore-next-line code-duplication */}
                        <button className="btn btn-sm btn-primary" onClick={() => setShowUpiModal(true)}>+ Add UPI ID</button>
                    </div>
                    <div className="card-body">
                        <p className="helper-text">Manage UPI IDs for receiving payments. QR codes are auto-generated at checkout.</p>
                        <table className="settings-table">
                            <thead>
                                <tr>
                                    <th>Display Name</th>
                                    <th>UPI ID</th>
                                    <th>Linked Bank</th>
                                    <th>Active</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {upiAccounts.map(upi => (
                                    <tr key={upi.id} className={!upi.is_active ? 'disabled-row' : ''}>
                                        <td>{upi.display_name}</td>
                                        <td><code>{upi.upi_id}</code></td>
                                        <td>{getBankName(upi.linked_bank_account)}</td>
                                        <td>
                                            <label className="toggle-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={upi.is_active}
                                                    onChange={() => handleToggleUpi(upi)}
                                                />
                                                <span className="toggle-slider"></span>
                                            </label>
                                        </td>
                                        <td>
                                            <button className="btn-icon danger" onClick={() => handleDeleteUpi(upi)}>Delete</button>
                                        </td>
                                    </tr>
                                ))}
                                {upiAccounts.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="text-center">No UPI accounts configured.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            {/* Add Payment Method Modal */}
            {showMethodModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Add Payment Method</h3>
                        <form onSubmit={handleAddMethod}>
                            <div className="form-group">
                                <label>Method Type</label>
                                <input
                                    value={newMethod.type}
                                    onChange={(e) => setNewMethod({ ...newMethod, type: e.target.value })}
                                    placeholder="e.g., Cash, Google Pay, PhonePe"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Linked Bank Account (Optional)</label>
// fallow-ignore-next-line code-duplication
                                <select
                                    className="form-select"
                                    value={newMethod.linked_bank_account}
                                    onChange={(e) => setNewMethod({ ...newMethod, linked_bank_account: e.target.value })}
                                >
                                    <option value="">Select a Bank Account (Leave blank for Cash)</option>
                                    {bankAccounts.map(bank => (
                                        <option key={bank.id} value={bank.id}>{bank.name} ({bank.bank_name})</option>
                                    ))}
                                </select>
                                <small className="helper-text" style={{display: 'block', marginTop: '4px'}}>All funds from this method will be routed here.</small>
                            </div>

                            <div className="form-group">
                                <label>Display Order</label>
                                <input
                                    type="number"
                                    value={newMethod.display_order}
                                    onChange={(e) => setNewMethod({ ...newMethod, display_order: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="form-check">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={newMethod.is_enabled}
                                        onChange={(e) => setNewMethod({ ...newMethod, is_enabled: e.target.checked })}
                                    />
                                    Enabled
                                </label>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowMethodModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add UPI Account Modal */}
            {showUpiModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Add UPI Account</h3>
                        <form onSubmit={handleAddUpi}>
                            <div className="form-group">
                                <label>Display Name</label>
                                <input
                                    value={newUpi.display_name}
                                    onChange={(e) => setNewUpi({ ...newUpi, display_name: e.target.value })}
                                    placeholder="e.g., Store GPay, Personal PhonePe"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>UPI ID</label>
                                <input
                                    value={newUpi.upi_id}
                                    onChange={(e) => setNewUpi({ ...newUpi, upi_id: e.target.value })}
                                    placeholder="e.g., store@upi, user@paytm"
                                    pattern="[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+"
                                    title="Enter a valid UPI ID (format: username@bankname)"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Linked Bank Account</label>
// fallow-ignore-next-line code-duplication
                                <select
                                    className="form-select"
                                    value={newUpi.linked_bank_account}
                                    onChange={(e) => setNewUpi({ ...newUpi, linked_bank_account: e.target.value })}
                                    required
                                >
                                    <option value="">Select a Bank Account</option>
                                    {bankAccounts.map(bank => (
                                        <option key={bank.id} value={bank.id}>{bank.name} ({bank.bank_name})</option>
                                    ))}
                                </select>
                                <small className="helper-text" style={{display: 'block', marginTop: '4px'}}>Incoming UPI payments will be recorded here.</small>
                            </div>
                            <div className="form-check">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={newUpi.is_active}
                                        onChange={(e) => setNewUpi({ ...newUpi, is_active: e.target.checked })}
                                    />
                                    Active
                                </label>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowUpiModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Confirmation Dialog Modal */}
            {confirmDialog.show && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>{confirmDialog.title}</h3>
                        <p style={{ marginBottom: '20px' }}>{confirmDialog.message}</p>
                        <div className="modal-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setConfirmDialog({ show: false, title: '', message: '', onConfirm: null })}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={confirmDialog.onConfirm}
                                style={{ backgroundColor: '#dc3545', borderColor: '#dc3545' }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentSettings;
