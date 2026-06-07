// fallow-ignore-next-line code-duplication
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import { formatINR, parseApiError } from '../../utils/financeUtils';
import './ExpenseCategories.css'; // Shared card-grid styles
import LoadingSpinner from '../../components/common/LoadingSpinner';

import '../../styles/components/page-layout.css';
import '../../styles/components/form-layout.css';
import '../../styles/components/modal-system.css';
const FREQUENCY_OPTIONS = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'yearly', label: 'Yearly' },
];

export default function RecurringExpenses() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { showToast } = useToast();
// fallow-ignore-next-line code-duplication
    const [items, setItems] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);
    const [generating, setGenerating] = useState(null);

    const emptyForm = {
        name: '', category: '', payee_name: '', payee_type: 'other',
        amount: '', tax_amount: '0', frequency: 'monthly',
        next_date: new Date().toISOString().split('T')[0],
        end_date: '', is_active: true, description: ''
    };
    const [formData, setFormData] = useState(emptyForm);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(ENDPOINTS.FINANCE_RECURRING_EXPENSES);
            if (res.ok) {
                const data = await res.json();
                setItems(data.results || data || []);
// fallow-ignore-next-line code-duplication
            } else throw new Error('Failed to fetch recurring expenses');
        } catch (err) {
            setError(err.message);
        } finally { setLoading(false); }
// fallow-ignore-next-line code-duplication
    }, [fetchWithAuth]);

    const fetchCategories = useCallback(async () => {
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_EXPENSE_CATEGORIES}?active_only=true`);
            if (res.ok) {
                const data = await res.json();
                setCategories(data.results || data || []);
            }
        } catch (_) { }
    }, [fetchWithAuth]);

    useEffect(() => { fetchItems(); fetchCategories(); }, [fetchItems, fetchCategories]);

    const openModal = (item = null) => {
        if (item) {
            setCurrentItem(item);
// fallow-ignore-next-line code-duplication
            setFormData({
                name: item.name, category: item.category, payee_name: item.payee_name,
                payee_type: item.payee_type, amount: item.amount, tax_amount: item.tax_amount || '0',
                frequency: item.frequency, next_date: item.next_date, end_date: item.end_date || '',
                is_active: item.is_active, description: item.description || ''
            });
        } else { setCurrentItem(null); setFormData(emptyForm); }
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const url = currentItem
            ? `${ENDPOINTS.FINANCE_RECURRING_EXPENSES}${currentItem.id}/`
            : ENDPOINTS.FINANCE_RECURRING_EXPENSES;
        try {
            const res = await fetchWithAuth(url, {
                method: currentItem ? 'PATCH' : 'POST',
                body: JSON.stringify({
                    ...formData,
                    amount: parseFloat(formData.amount),
                    tax_amount: parseFloat(formData.tax_amount || 0),
                    end_date: formData.end_date || null
                })
            });
            if (res.ok) { fetchItems(); setIsModalOpen(false); showToast('Saved successfully', 'success'); }
            else { const d = await res.json(); showToast(parseApiError(d), 'error'); }
        } catch (err) { showToast('Error saving: ' + err.message, 'error'); }
    };

    const handleDelete = async () => {
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_RECURRING_EXPENSES}${currentItem.id}/`, { method: 'DELETE' });
// fallow-ignore-next-line code-duplication
            if (res.ok) { fetchItems(); setIsDeleteModalOpen(false); setCurrentItem(null); showToast('Deleted', 'success'); }
            else showToast('Delete failed', 'error');
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    };

    const handleGenerate = async (item) => {
        setGenerating(item.id);
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_RECURRING_EXPENSES}${item.id}/generate/`, { method: 'POST' });
            if (res.ok) { fetchItems(); showToast('Expense generated successfully!', 'success'); }
            else { const d = await res.json(); showToast(d.error || 'Generate failed', 'error'); }
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
        finally { setGenerating(null); }
    };

    const fmt = formatINR;

    if (loading && items.length === 0) {
        return <LoadingSpinner />;
    }

    return (
        <div className="expense-categories-container fade-in">
            <header className="page-header">
                <div>
                    <p>Manage auto-generated periodic expenses</p>
                </div>
                <button className="btn btn-primary" onClick={() => openModal()}>
                    <span className="plus-icon">+</span> New Template
                </button>
            </header>

            {error && <div className="error-banner">{error}</div>}

            <div className="category-grid">
                {items.map(item => (
                    <div key={item.id} className={`category-card glass-card ${!item.is_active ? 'inactive' : ''}`}>
                        <div className="category-icon-wrapper">
                            <span className="category-icon" role="img" aria-label="Recurring">🔄</span>
                            <span className={`status-text ${item.is_active ? 'active' : 'inactive'}`}
                                style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>
                                {item.is_active ? 'Active' : 'Paused'}
                            </span>
                        </div>
                        <div className="category-info">
                            <h3>{item.name}</h3>
                            <p className="description">{item.description || `${item.frequency} — ${currency}${fmt(item.amount)}`}</p>
                            <div className="category-meta">
                                <span className="expense-count">{item.frequency}</span>
                                <span style={{ color: '#a5b4fc' }}>Next: {item.next_date}</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#818cf8' }}>
                                {currency}{fmt(item.amount)}
                            </span>
                            <div className="category-actions" style={{ marginTop: 0 }}>
                                <button className="btn-icon edit" title="Generate Now"
                                    onClick={() => handleGenerate(item)}
                                    disabled={generating === item.id}>
                                    {generating === item.id ? '⏳' : '▶️'}
                                </button>
                                <button className="btn-icon edit" title="Edit" onClick={() => openModal(item)}>✏️</button>
                                <button className="btn-icon delete" title="Delete"
                                    onClick={() => { setCurrentItem(item); setIsDeleteModalOpen(true); }}>🗑️</button>
                            </div>
                        </div>
                    </div>
                ))}

{/* fallow-ignore-next-line code-duplication */}
                {items.length === 0 && !loading && (
                    <div className="empty-state glass-card">
                        <span className="empty-icon">🔄</span>
                        <h3>No recurring expenses</h3>
                        <p>Create a template to auto-generate periodic expenses.</p>
                        <button className="btn btn-primary" onClick={() => openModal()}>Add Template</button>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content glass-card" onClick={e => e.stopPropagation()}>
                        <header>
                            <h2>{currentItem ? 'Edit Template' : 'New Recurring Expense'}</h2>
                            <button className="close-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
                        </header>
                        <form onSubmit={handleSave}>
                            <div className="form-group">
                                <label>Name *</label>
                                <input type="text" required placeholder="e.g. Monthly Rent"
                                    value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Category *</label>
                                <select required value={formData.category}
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}>
                                    <option value="">Select Category</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Payee Name *</label>
                                <input type="text" required placeholder="Payee"
                                    value={formData.payee_name} onChange={e => setFormData({ ...formData, payee_name: e.target.value })} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div className="form-group">
                                    <label>Amount ({currency}) *</label>
                                    <input type="number" required step="0.01" min="0.01"
                                        value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Tax ({currency})</label>
                                    <input type="number" step="0.01" min="0"
                                        value={formData.tax_amount} onChange={e => setFormData({ ...formData, tax_amount: e.target.value })} />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                                <div className="form-group">
                                    <label>Frequency *</label>
                                    <select value={formData.frequency}
                                        onChange={e => setFormData({ ...formData, frequency: e.target.value })}>
                                        {FREQUENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Next Date *</label>
                                    <input type="date" required value={formData.next_date}
                                        onChange={e => setFormData({ ...formData, next_date: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>End Date</label>
                                    <input type="date" value={formData.end_date}
                                        onChange={e => setFormData({ ...formData, end_date: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea rows="2" placeholder="Optional details"
                                    value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                            </div>
                            <div className="form-group checkbox-group">
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={formData.is_active}
                                        onChange={e => setFormData({ ...formData, is_active: e.target.checked })} />
                                    Active
                                </label>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">
                                    {currentItem ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isDeleteModalOpen && (
                <div className="modal-overlay" onClick={() => setIsDeleteModalOpen(false)}>
                    <div className="modal-content glass-card delete-modal" onClick={e => e.stopPropagation()}>
                        <h2>Confirm Delete</h2>
                        <p>Delete recurring expense <strong>{currentItem?.name}</strong>?</p>
                        <p className="warning">This will not delete previously generated expenses.</p>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setIsDeleteModalOpen(false)}>Cancel</button>
                            <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
