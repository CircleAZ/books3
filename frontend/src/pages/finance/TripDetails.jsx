import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import { formatINR } from '../../utils/financeUtils';
import './ExpenseCategories.css';

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

    const handleReimburseEmployee = async (employeeId) => {
        setReimbursing(employeeId);
        try {
            const res = await fetchWithAuth(
                `${ENDPOINTS.FINANCE_EXPENSE_TRIPS}${id}/reimburse-employee/`,
                { method: 'POST', body: JSON.stringify({ employee_id: employeeId, method: 'cash' }) }
            );
            if (res.ok) {
                const data = await res.json();
                setTrip(data);
                showToast('Employee reimbursed!', 'success');
            } else {
                const err = await res.json();
                showToast(err.error || 'Reimbursement failed', 'error');
            }
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
        finally { setReimbursing(null); }
    };

    const handleReimburseAll = async () => {
        setReimbursing('all');
        try {
            const res = await fetchWithAuth(
                `${ENDPOINTS.FINANCE_EXPENSE_TRIPS}${id}/reimburse-all/`,
                { method: 'POST', body: JSON.stringify({ method: 'cash' }) }
            );
            if (res.ok) {
                const data = await res.json();
                setTrip(data.trip);
                showToast(data.message, 'success');
            } else {
                showToast('Reimbursement failed', 'error');
            }
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
        finally { setReimbursing(null); }
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
                            <button className="btn btn-primary" onClick={handleReimburseAll}
                                disabled={reimbursing === 'all'} style={{ fontSize: 13 }}>
                                {reimbursing === 'all' ? 'Processing...' : '💸 Reimburse All'}
                            </button>
                        )}
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
                                                onClick={() => handleReimburseEmployee(emp.employee_id)}
                                                disabled={reimbursing === emp.employee_id}
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
                    <p style={{ color: '#94a3b8', margin: 0 }}>{trip.notes}</p>
                </div>
            )}
        </div>
    );
}
