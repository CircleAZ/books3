import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import { formatINR, parseApiError } from '../../utils/financeUtils';
import './ExpenseCategories.css';

export default function CreateTrip() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { showToast } = useToast();
    const navigate = useNavigate();

    const [categories, setCategories] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [saving, setSaving] = useState(false);

    const [tripName, setTripName] = useState('');
    const [tripDate, setTripDate] = useState(new Date().toISOString().split('T')[0]);
    const [purpose, setPurpose] = useState('');
    const [notes, setNotes] = useState('');

    const emptyItem = { description: '', category: '', amount: '', paid_by_type: 'company', paid_by_employee: '' };
    const [items, setItems] = useState([{ ...emptyItem }]);

    const fetchCategories = useCallback(async () => {
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_EXPENSE_CATEGORIES}?active_only=true`);
            if (res.ok) {
                const data = await res.json();
                setCategories(data.results || data || []);
            }
        } catch (_) { }
    }, [fetchWithAuth]);

    const fetchEmployees = useCallback(async () => {
        try {
            const res = await fetchWithAuth(ENDPOINTS.SETTINGS_USERS);
            if (res.ok) {
                const data = await res.json();
                const allUsers = data.results || data || [];
                setEmployees(allUsers.filter(u => u.is_active));
            }
        } catch (_) { }
    }, [fetchWithAuth]);

    useEffect(() => { fetchCategories(); fetchEmployees(); }, [fetchCategories, fetchEmployees]);

    const updateItem = (idx, field, value) => {
        setItems(prev => prev.map((item, i) =>
            i === idx ? { ...item, [field]: value } : item
        ));
    };

    const addItem = () => setItems(prev => [...prev, { ...emptyItem }]);

    const removeItem = (idx) => {
        if (items.length === 1) return; // Must have at least 1
        setItems(prev => prev.filter((_, i) => i !== idx));
    };

    // Running totals
    const totals = useMemo(() => {
        let tripTotal = 0, companyTotal = 0;
        const perEmployee = {};

        items.forEach(item => {
            const amt = parseFloat(item.amount) || 0;
            tripTotal += amt;
            if (item.paid_by_type === 'company') {
                companyTotal += amt;
            } else if (item.paid_by_employee) {
                const emp = employees.find(e => String(e.id) === String(item.paid_by_employee));
                const name = emp ? emp.username : `Emp #${item.paid_by_employee}`;
                if (!perEmployee[item.paid_by_employee]) {
                    perEmployee[item.paid_by_employee] = { name, total: 0 };
                }
                perEmployee[item.paid_by_employee].total += amt;
            }
        });

        return { tripTotal, companyTotal, perEmployee };
    }, [items, employees]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (items.length === 0) { showToast('Add at least one line item', 'error'); return; }
        // Validate each item
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.description || !item.category || !item.amount) {
                showToast(`Line item ${i + 1} is incomplete — fill description, category, and amount.`, 'error');
                return;
            }
            if (item.paid_by_type === 'employee' && !item.paid_by_employee) {
                showToast(`Line item ${i + 1} — select which employee paid.`, 'error');
                return;
            }
        }

        setSaving(true);
        try {
            const payload = {
                name: tripName,
                date: tripDate,
                purpose,
                notes,
                items: items.map(item => ({
                    description: item.description,
                    category: item.category,
                    amount: parseFloat(item.amount),
                    paid_by_type: item.paid_by_type,
                    paid_by_employee: item.paid_by_type === 'employee' ? item.paid_by_employee : null,
                })),
            };
            const res = await fetchWithAuth(ENDPOINTS.FINANCE_EXPENSE_TRIPS, {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                const data = await res.json();
                showToast('Trip created! Expenses auto-generated.', 'success');
                navigate(`/finance/trips/${data.id}`);
            } else {
                const err = await res.json();
                showToast(parseApiError(err), 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally { setSaving(false); }
    };

    const inputStyle = {
        padding: '10px 12px', borderRadius: 8, fontSize: 14,
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        color: '#f1f5f9', width: '100%',
    };

    return (
        <div className="expense-categories-container fade-in" style={{ maxWidth: 900 }}>
            <header className="page-header">
                <div>
                    <p>Enter all expenses for this trip in one form</p>
                </div>
            </header>

            <form onSubmit={handleSubmit}>
                {/* Trip Header */}
                <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
                    <h3 style={{ marginTop: 0, marginBottom: 16, color: '#818cf8' }}>Trip Details</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                        <div className="form-group">
                            <label>Trip Name *</label>
                            <input type="text" required placeholder='e.g. "Ahmedabad — To place order"'
                                value={tripName} onChange={e => setTripName(e.target.value)} style={inputStyle} />
                        </div>
                        <div className="form-group">
                            <label>Date *</label>
                            <input type="date" required value={tripDate}
                                onChange={e => setTripDate(e.target.value)} style={inputStyle} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Purpose / Reason</label>
                        <input type="text" placeholder='e.g. "To place order with supplier"'
                            value={purpose} onChange={e => setPurpose(e.target.value)} style={inputStyle} />
                    </div>
                    <div className="form-group">
                        <label>Notes</label>
                        <textarea rows="2" placeholder="Optional notes about the trip"
                            value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
                    </div>
                </div>

                {/* Line Items */}
                <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ margin: 0, color: '#818cf8' }}>Line Items</h3>
                        <button type="button" className="btn btn-primary" onClick={addItem} style={{ fontSize: 13 }}>
                            + Add Item
                        </button>
                    </div>

                    {items.map((item, idx) => (
                        <div key={idx} style={{
                            padding: 16, marginBottom: 12, borderRadius: 10,
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                            position: 'relative',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Item #{idx + 1}</span>
                                {items.length > 1 && (
                                    <button type="button" onClick={() => removeItem(idx)}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}>
                                        ✕
                                    </button>
                                )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr', gap: 12 }}>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label style={{ fontSize: 12 }}>Description *</label>
                                    <input type="text" placeholder="e.g. Parking, Ticket"
                                        value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                                        style={inputStyle} />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label style={{ fontSize: 12 }}>Category *</label>
                                    <select value={item.category} onChange={e => updateItem(idx, 'category', e.target.value)}
                                        style={inputStyle}>
                                        <option value="">Select</option>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label style={{ fontSize: 12 }}>Amount ({currency}) *</label>
                                    <input type="number" step="0.01" min="0.01" placeholder="0.00"
                                        value={item.amount} onChange={e => updateItem(idx, 'amount', e.target.value)}
                                        style={inputStyle} />
                                </div>
                                <div className="form-group" style={{ margin: 0 }}>
                                    <label style={{ fontSize: 12 }}>Paid By *</label>
                                    <select value={item.paid_by_type === 'company' ? 'company' : `emp_${item.paid_by_employee}`}
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (val === 'company') {
                                                updateItem(idx, 'paid_by_type', 'company');
                                                updateItem(idx, 'paid_by_employee', '');
                                            } else {
                                                const empId = val.replace('emp_', '');
                                                setItems(prev => prev.map((it, i) =>
                                                    i === idx ? { ...it, paid_by_type: 'employee', paid_by_employee: empId } : it
                                                ));
                                            }
                                        }}
                                        style={inputStyle}>
                                        <option value="company">🏢 Company Budget</option>
                                        {employees.map(emp => (
                                            <option key={emp.id} value={`emp_${emp.id}`}>👤 {emp.username}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Running Totals */}
                <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
                    <h3 style={{ margin: '0 0 16px', color: '#818cf8' }}>Summary</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                        <div style={{ padding: 16, borderRadius: 10, background: 'rgba(129,140,248,0.1)', textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Trip Total</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>
                                {currency}{formatINR(totals.tripTotal)}
                            </div>
                        </div>
                        <div style={{ padding: 16, borderRadius: 10, background: 'rgba(99,102,241,0.1)', textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Company Paid</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#818cf8' }}>
                                {currency}{formatINR(totals.companyTotal)}
                            </div>
                        </div>
                        {Object.entries(totals.perEmployee).map(([empId, data]) => (
                            <div key={empId} style={{ padding: 16, borderRadius: 10, background: 'rgba(251,146,60,0.1)', textAlign: 'center' }}>
                                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{data.name}</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: '#fb923c' }}>
                                    {currency}{formatINR(data.total)}
                                </div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>needs reimbursement</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <button type="button" className="btn btn-ghost" onClick={() => navigate('/finance/trips')}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                        {saving ? 'Creating...' : '🧳 Create Trip'}
                    </button>
                </div>
            </form>
        </div>
    );
}
