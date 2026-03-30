import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import { formatINR } from '../../utils/financeUtils';
import './ExpenseCategories.css';

const STATUS_BADGES = {
    unsettled: { label: 'Unsettled', color: '#ef4444' },
    partial: { label: 'Partial', color: '#f59e0b' },
    settled: { label: 'Settled', color: '#22c55e' },
};

export default function TripList() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [trips, setTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('');

    const fetchTrips = useCallback(async () => {
        setLoading(true);
        try {
            let url = ENDPOINTS.FINANCE_EXPENSE_TRIPS;
            const params = [];
            if (search) params.push(`search=${encodeURIComponent(search)}`);
            if (filter) params.push(`settlement=${filter}`);
            if (params.length) url += '?' + params.join('&');
            const res = await fetchWithAuth(url);
            if (res.ok) {
                const data = await res.json();
                setTrips(data.results || data || []);
            }
        } catch (err) {
            showToast('Failed to load trips: ' + err.message, 'error');
        } finally { setLoading(false); }
    }, [fetchWithAuth, search, filter]);

    useEffect(() => { fetchTrips(); }, [fetchTrips]);

    const fmt = formatINR;

    if (loading && trips.length === 0) {
        return <div className="expense-categories-loading"><div className="spinner"></div><p>Loading trips...</p></div>;
    }

    return (
        <div className="expense-categories-container fade-in">
            <header className="page-header">
                <div>
                    <p>Group multiple expenses under a single trip</p>
                </div>
                <button className="btn btn-primary" onClick={() => navigate('/finance/trips/new')}>
                    <span className="plus-icon">+</span> New Trip
                </button>
            </header>

            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <input
                    type="text" placeholder="Search trips..."
                    value={search} onChange={e => setSearch(e.target.value)}
                    style={{
                        flex: 1, padding: '10px 14px', borderRadius: 8,
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#f1f5f9', fontSize: 14,
                    }}
                />
                <select value={filter} onChange={e => setFilter(e.target.value)} style={{
                    padding: '10px 14px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#f1f5f9', fontSize: 14,
                }}>
                    <option value="">All Statuses</option>
                    <option value="unsettled">Unsettled</option>
                    <option value="partial">Partial</option>
                    <option value="settled">Settled</option>
                </select>
            </div>

            {trips.length === 0 && !loading ? (
                <div className="empty-state glass-card">
                    <span className="empty-icon">🧳</span>
                    <h3>No trips yet</h3>
                    <p>Create a trip to group related expenses together — track who paid what and settle reimbursements easily.</p>
                    <button className="btn btn-primary" onClick={() => navigate('/finance/trips/new')}>Create First Trip</button>
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{
                        width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px',
                        fontSize: 14, color: '#f1f5f9',
                    }}>
                        <thead>
                            <tr style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                                <th style={{ padding: '8px 14px', textAlign: 'left' }}>Trip Name</th>
                                <th style={{ padding: '8px 14px', textAlign: 'left' }}>Date</th>
                                <th style={{ padding: '8px 14px', textAlign: 'left' }}>Purpose</th>
                                <th style={{ padding: '8px 14px', textAlign: 'right' }}>Total</th>
                                <th style={{ padding: '8px 14px', textAlign: 'right' }}>Company</th>
                                <th style={{ padding: '8px 14px', textAlign: 'right' }}>Reimburse Due</th>
                                <th style={{ padding: '8px 14px', textAlign: 'center' }}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {trips.map(trip => {
                                const badge = STATUS_BADGES[trip.settlement_status] || STATUS_BADGES.unsettled;
                                return (
                                    <tr key={trip.id}
                                        onClick={() => navigate(`/finance/trips/${trip.id}`)}
                                        style={{
                                            cursor: 'pointer', background: 'rgba(255,255,255,0.04)',
                                            borderRadius: 10, transition: 'background 0.2s',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                    >
                                        <td style={{ padding: '14px', fontWeight: 600 }}>{trip.name}</td>
                                        <td style={{ padding: '14px' }}>{trip.date}</td>
                                        <td style={{ padding: '14px', color: '#94a3b8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {trip.purpose || '—'}
                                        </td>
                                        <td style={{ padding: '14px', textAlign: 'right', fontWeight: 600 }}>
                                            {currency}{fmt(trip.total_amount)}
                                        </td>
                                        <td style={{ padding: '14px', textAlign: 'right', color: '#818cf8' }}>
                                            {currency}{fmt(trip.company_amount)}
                                        </td>
                                        <td style={{ padding: '14px', textAlign: 'right', color: parseFloat(trip.reimbursement_due) > 0 ? '#f87171' : '#22c55e' }}>
                                            {currency}{fmt(trip.reimbursement_due)}
                                        </td>
                                        <td style={{ padding: '14px', textAlign: 'center' }}>
                                            <span style={{
                                                display: 'inline-block', padding: '4px 12px', borderRadius: 20,
                                                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                                                background: badge.color + '22', color: badge.color,
                                            }}>
                                                {badge.label}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
