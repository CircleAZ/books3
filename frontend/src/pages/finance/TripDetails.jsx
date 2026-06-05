import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import { formatINR } from '../../utils/financeUtils';
import './ExpenseCategories.css';

import '../../styles/components/page-layout.css';
import '../../styles/components/modal-system.css';
const STATUS_BADGES = {
    unsettled: { label: 'Unsettled', bg: '#ef444422', color: '#ef4444' },
    partial: { label: 'Partial', bg: '#f59e0b22', color: '#f59e0b' },
    settled: { label: 'Settled', bg: '#22c55e22', color: '#22c55e' },
};

const ITEM_STATUS = {
    unpaid: { label: 'Unpaid', color: '#ef4444' },
    partial: { label: 'Partial', color: '#f59e0b' },
    paid: { label: 'Paid', color: '#22c55e' },
    pending: { label: 'Pending', color: '#94a3b8' },
    approved: { label: 'Approved', color: '#3b82f6' },
    rejected: { label: 'Rejected', color: '#ef4444' },
    reimbursed: { label: 'Reimbursed', color: '#22c55e' },
};

export default function TripDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { showToast } = useToast();
    const [trip, setTrip] = useState(null);
    const [loading, setLoading] = useState(true);
    const [reimbursing, setReimbursing] = useState(null);

    const [showReimburseModal, setShowReimburseModal] = useState(false);
    const [reimburseTarget, setReimburseTarget] = useState(null); // 'all' or employeeId
    const [reimburseForm, setReimburseForm] = useState({ method: '', source_bank: '', source_wallet: '' });
    const [banks, setBanks] = useState([]);
    const [wallets, setWallets] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);

    const fetchTrip = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_EXPENSE_TRIPS}${id}/`);
            if (res.ok) {
                setTrip(await res.json());
            } else {
                showToast('Trip not found', 'error');
                navigate('/finance/trips');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally { setLoading(false); }
    }, [fetchWithAuth, id]);

    useEffect(() => { fetchTrip(); }, [fetchTrip]);

    const isCashMethod = (method) => {
        if (!method) return false;
// fallow-ignore-next-line code-duplication
        return method.toLowerCase().includes('cash');
    };

// fallow-ignore-next-line code-duplication
    const fetchLedgers = useCallback(async () => {
        try {
            const [bRes, wRes, mRes] = await Promise.allSettled([
                fetchWithAuth(ENDPOINTS.FINANCE_BANK_ACCOUNTS + '?active_only=true'),
                fetchWithAuth(ENDPOINTS.FINANCE_CASH_WALLETS + '?active_only=true'),
                fetchWithAuth(ENDPOINTS.SETTINGS_PAYMENT_METHODS),
            ]);
            if (bRes.status === 'fulfilled' && bRes.value.ok) {
                const d = await bRes.value.json();
                setBanks(d.results || d || []);
            }
            if (wRes.status === 'fulfilled' && wRes.value.ok) {
                const d = await wRes.value.json();
                setWallets(d.results || d || []);
            }
            if (mRes.status === 'fulfilled' && mRes.value.ok) {
                const d = await mRes.value.json();
                setPaymentMethods((d.results || d || []).filter(m => m.is_enabled));
            }
        } catch (_) {}
    }, [fetchWithAuth]);

    const handleMethodChange = (method) => {
        const isCash = isCashMethod(method);
        setReimburseForm({
            method,
            source_bank: !isCash && (banks || []).length > 0 ? String(banks[0].id) : '',
            source_wallet: isCash && (wallets || []).length > 0 ? String(wallets[0].id) : '',
        });
    };

    const openReimburseModal = async (target) => {
        setReimburseTarget(target);
        await fetchLedgers();
        setReimburseForm({ method: '', source_bank: '', source_wallet: '' });
        setShowReimburseModal(true);
    };

// fallow-ignore-next-line code-duplication
    const handleReimburseSubmit = async (e) => {
        e.preventDefault();
        if (!reimburseForm.method) {
            showToast('Please select a payment method', 'error');
            return;
        }
        const isCash = isCashMethod(reimburseForm.method);
        const source_bank = isCash ? null : reimburseForm.source_bank;
        const source_wallet = isCash ? reimburseForm.source_wallet : null;

        if (!isCash && !source_bank) {
            showToast('Please select a bank account ledger', 'error');
            return;
        }
        if (isCash && !source_wallet) {
            showToast('Please select a cash wallet ledger', 'error');
            return;
        }

        const payload = {
            method: reimburseForm.method,
            source_bank: source_bank ? Number(source_bank) : null,
            source_wallet: source_wallet ? Number(source_wallet) : null
        };

        setReimbursing(reimburseTarget);
        try {
            if (reimburseTarget === 'all') {
                const res = await fetchWithAuth(
                    `${ENDPOINTS.FINANCE_EXPENSE_TRIPS}${id}/reimburse-all/`,
                    { method: 'POST', body: JSON.stringify(payload) }
                );
                if (res.ok) {
                    const data = await res.json();
                    setTrip(data.trip);
                    showToast(data.message, 'success');
                    setShowReimburseModal(false);
                } else {
                    const err = await res.json();
                    showToast(err.error || 'Reimbursement failed', 'error');
                }
            } else {
                payload.employee_id = reimburseTarget;
                const res = await fetchWithAuth(
                    `${ENDPOINTS.FINANCE_EXPENSE_TRIPS}${id}/reimburse-employee/`,
                    { method: 'POST', body: JSON.stringify(payload) }
                );
                if (res.ok) {
                    const data = await res.json();
                    setTrip(data);
                    showToast('Employee reimbursed!', 'success');
                    setShowReimburseModal(false);
                } else {
                    const err = await res.json();
                    showToast(err.error || 'Reimbursement failed', 'error');
                }
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setReimbursing(null);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Delete this trip and all linked records?')) return;
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_EXPENSE_TRIPS}${id}/`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
                showToast('Trip deleted', 'success');
                navigate('/finance/trips');
            } else {
                const errText = await res.text();
                console.error('Delete failed:', res.status, errText);
                showToast(`Delete failed (${res.status})`, 'error');
            }
        } catch (err) {
            console.error('Delete error:', err);
            showToast('Error: ' + err.message, 'error');
        }
    };

    const fmt = formatINR;

    if (loading || !trip) {
        return <div className="expense-categories-loading"><div className="spinner"></div><p>Loading trip...</p></div>;
    }

    const badge = STATUS_BADGES[trip.settlement_status] || STATUS_BADGES.unsettled;

    return (
        <div className="expense-categories-container fade-in" style={{ maxWidth: 950 }}>
            {/* Header */}
            <header className="page-header">
                <div>
                    <h1 style={{ margin: 0 }}>{trip.name}</h1>
                    <p style={{ margin: '4px 0 0', color: '#94a3b8' }}>
                        {trip.date} {trip.purpose ? `— ${trip.purpose}` : ''}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{
                        padding: '8px 18px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                        textTransform: 'uppercase', background: badge.bg, color: badge.color,
                        display: 'flex', alignItems: 'center',
                    }}>{badge.label}</span>
                    <button className="btn btn-ghost" onClick={handleDelete}
                        style={{ color: '#ef4444', fontSize: 13 }}>🗑 Delete</button>
                </div>
            </header>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div className="glass-card" style={{ padding: 20, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Trip Total</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{currency}{fmt(trip.total_amount)}</div>
                </div>
                <div className="glass-card" style={{ padding: 20, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Company Paid</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#818cf8' }}>{currency}{fmt(trip.company_amount)}</div>
                </div>
                <div className="glass-card" style={{ padding: 20, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Reimbursement Due</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: parseFloat(trip.reimbursement_due) > 0 ? '#f87171' : '#22c55e' }}>
                        {currency}{fmt(trip.reimbursement_due)}
                    </div>
                </div>
            </div>

            {/* Line Items Table */}
            <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 16px', color: '#818cf8' }}>Line Items</h3>
{/* fallow-ignore-next-line code-duplication */}
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, color: '#f1f5f9' }}>
                        <thead>
                            <tr style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ padding: '10px', textAlign: 'left' }}>Description</th>
                                <th style={{ padding: '10px', textAlign: 'left' }}>Category</th>
                                <th style={{ padding: '10px', textAlign: 'right' }}>Amount</th>
                                <th style={{ padding: '10px', textAlign: 'left' }}>Paid By</th>
                                <th style={{ padding: '10px', textAlign: 'center' }}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {trip.items.map(item => {
                                const st = ITEM_STATUS[item.reimbursement_status] || ITEM_STATUS.pending;
                                return (
                                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={{ padding: '12px 10px', fontWeight: 500 }}>{item.description}</td>
                                        <td style={{ padding: '12px 10px', color: '#94a3b8' }}>{item.category_name}</td>
                                        <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 600 }}>
                                            {currency}{fmt(item.amount)}
                                        </td>
                                        <td style={{ padding: '12px 10px' }}>
                                            {item.paid_by_type === 'company'
                                                ? <span style={{ color: '#818cf8' }}>🏢 Company</span>
                                                : <span style={{ color: '#fb923c' }}>👤 {item.paid_by_employee_name}</span>
                                            }
                                        </td>
                                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                            <span style={{
                                                display: 'inline-block', padding: '3px 10px', borderRadius: 12,
                                                fontSize: 11, fontWeight: 600,
                                                background: st.color + '22', color: st.color,
                                            }}>{st.label}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Reimbursement Section */}
            {trip.employee_breakdown && trip.employee_breakdown.length > 0 && (
                <div className="glass-card" style={{ padding: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ margin: 0, color: '#818cf8' }}>Reimbursement Summary</h3>
                        {trip.settlement_status !== 'settled' && (
                            <button className="btn btn-primary" onClick={() => openReimburseModal('all')}
                                disabled={reimbursing !== null} style={{ fontSize: 13 }}>
                                {reimbursing === 'all' ? 'Processing...' : '💸 Reimburse All'}
                            </button>
                        )}
// fallow-ignore-next-line code-duplication
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, color: '#f1f5f9' }}>
                        <thead>
                            <tr style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ padding: '10px', textAlign: 'left' }}>Employee</th>
                                <th style={{ padding: '10px', textAlign: 'center' }}>Items</th>
                                <th style={{ padding: '10px', textAlign: 'right' }}>Total</th>
                                <th style={{ padding: '10px', textAlign: 'right' }}>Reimbursed</th>
                                <th style={{ padding: '10px', textAlign: 'right' }}>Remaining</th>
                                <th style={{ padding: '10px', textAlign: 'center' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {trip.employee_breakdown.map(emp => (
                                <tr key={emp.employee_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <td style={{ padding: '12px 10px', fontWeight: 500 }}>👤 {emp.employee_name}</td>
                                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>{emp.items_count}</td>
                                    <td style={{ padding: '12px 10px', textAlign: 'right' }}>{currency}{fmt(emp.total_amount)}</td>
                                    <td style={{ padding: '12px 10px', textAlign: 'right', color: '#22c55e' }}>{currency}{fmt(emp.reimbursed)}</td>
                                    <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 600, color: parseFloat(emp.remaining) > 0 ? '#f87171' : '#22c55e' }}>
                                        {currency}{fmt(emp.remaining)}
                                    </td>
                                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                        {parseFloat(emp.remaining) > 0 ? (
                                            <button className="btn btn-primary"
                                                onClick={() => openReimburseModal(emp.employee_id)}
                                                disabled={reimbursing !== null}
                                                style={{ fontSize: 12, padding: '6px 14px' }}>
                                                {reimbursing === emp.employee_id ? '...' : 'Reimburse'}
                                            </button>
                                        ) : (
                                            <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 600 }}>✓ Done</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {trip.notes && (
                <div className="glass-card" style={{ padding: 24, marginTop: 20 }}>
                    <h3 style={{ margin: '0 0 8px', color: '#818cf8' }}>Notes</h3>
// fallow-ignore-next-line code-duplication
                    <p style={{ color: '#94a3b8', margin: 0 }}>{trip.notes}</p>
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
                        <p style={{ color: '#94a3b8', marginBottom: 16, fontSize: '0.9rem' }}>
                            Choose payment method and source ledger for reimbursement.
                        </p>
// fallow-ignore-next-line code-duplication
                        <form onSubmit={handleReimburseSubmit}>
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
// fallow-ignore-next-line code-duplication
                                            (banks || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)
                                        )}
                                    </select>
                                </div>
                            )}
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowReimburseModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-success" disabled={reimbursing !== null}>
                                    {reimbursing !== null ? 'Processing...' : '💸 Reimburse'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
