import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import { formatINR, parseApiError } from '../../utils/financeUtils';
import './ExpenseCategories.css';
import LoadingSpinner from '../../components/common/LoadingSpinner';

import '../../styles/components/page-layout.css';
import '../../styles/components/form-layout.css';
import '../../styles/components/modal-system.css';
export default function CategoryBudgets() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { showToast } = useToast();
    const [budgets, setBudgets] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [currentBudget, setCurrentBudget] = useState(null);

    const today = new Date();
    const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const monthEnd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${lastDay}`;

    const emptyForm = { category: '', period_start: monthStart, period_end: monthEnd, budget_amount: '' };
    const [formData, setFormData] = useState(emptyForm);

    const fetchBudgets = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(ENDPOINTS.FINANCE_CATEGORY_BUDGETS);
            if (res.ok) {
                const data = await res.json();
                setBudgets(data.results || data || []);
            } else throw new Error('Failed to fetch budgets');
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    }, [fetchWithAuth]);

    const fetchCategories = useCallback(async () => {
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_EXPENSE_CATEGORIES}?active_only=true`);
            if (res.ok) { const d = await res.json(); setCategories(d.results || d || []); }
        } catch (_) { }
    }, [fetchWithAuth]);

    useEffect(() => { fetchBudgets(); fetchCategories(); }, [fetchBudgets, fetchCategories]);

    const openModal = (b = null) => {
        if (b) {
            setCurrentBudget(b);
            setFormData({ category: b.category, period_start: b.period_start, period_end: b.period_end, budget_amount: b.budget_amount });
        } else { setCurrentBudget(null); setFormData(emptyForm); }
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const url = currentBudget
            ? `${ENDPOINTS.FINANCE_CATEGORY_BUDGETS}${currentBudget.id}/`
            : ENDPOINTS.FINANCE_CATEGORY_BUDGETS;
        try {
            const res = await fetchWithAuth(url, {
                method: currentBudget ? 'PATCH' : 'POST',
                body: JSON.stringify({ ...formData, budget_amount: parseFloat(formData.budget_amount) })
            });
            if (res.ok) { fetchBudgets(); setIsModalOpen(false); showToast('Budget saved', 'success'); }
            else { const d = await res.json(); showToast(parseApiError(d), 'error'); }
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    };

    const handleDelete = async () => {
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_CATEGORY_BUDGETS}${currentBudget.id}/`, { method: 'DELETE' });
            if (res.ok) { fetchBudgets(); setIsDeleteModalOpen(false); showToast('Budget deleted', 'success'); }
            else showToast('Delete failed', 'error');
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    };

    const fmt = formatINR;

    const getBarColor = (pct) => {
        const p = parseFloat(pct || 0);
        if (p >= 100) return '#ef4444';
        if (p >= 80) return '#f59e0b';
        return '#10b981';
    };

    if (loading && budgets.length === 0) {
        return <LoadingSpinner />;
    }

    return (
        <div className="expense-categories-container fade-in">
            <header className="page-header">
                <div>
                    <p>Set spending limits per expense category</p>
                </div>
                <button className="btn btn-primary" onClick={() => openModal()}>
                    <span className="plus-icon">+</span> New Budget
                </button>
            </header>

            {error && <div className="error-banner">{error}</div>}

            <div className="category-grid">
                {budgets.map(b => {
                    const pct = parseFloat(b.utilization_pct || 0);
                    return (
                        <div key={b.id} className="category-card glass-card">
                            <div className="category-icon-wrapper">
                                <span className="category-icon" role="img" aria-label="Budget">📊</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: getBarColor(b.utilization_pct) }}>
                                    {pct.toFixed(1)}%
                                </span>
                            </div>
                            <div className="category-info">
                                <h3>{b.category_name}</h3>
                                <p className="description">{b.period_start} → {b.period_end}</p>
                                {/* Progress bar */}
                                <div style={{
                                    background: 'rgba(255,255,255,0.05)', borderRadius: 8,
                                    height: 8, marginBottom: 12, overflow: 'hidden'
                                }}>
                                    <div style={{
                                        width: `${Math.min(pct, 100)}%`,
                                        height: '100%', background: getBarColor(b.utilization_pct),
                                        borderRadius: 8, transition: 'width 0.5s ease'
                                    }} />
                                </div>
                                <div className="category-meta">
                                    <span style={{ color: '#94a3b8' }}>
                                        Spent: {currency}{fmt(b.spent)}
                                    </span>
                                    <span style={{ color: parseFloat(b.remaining) < 0 ? '#ef4444' : '#10b981' }}>
                                        {parseFloat(b.remaining) < 0 ? 'Over: ' : 'Left: '}
                                        {currency}{fmt(Math.abs(parseFloat(b.remaining)))}
                                    </span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#818cf8' }}>
                                    Budget: {currency}{fmt(b.budget_amount)}
                                </span>
                                <div className="category-actions" style={{ marginTop: 0 }}>
                                    <button className="btn-icon edit" title="Edit" onClick={() => openModal(b)}>✏️</button>
                                    <button className="btn-icon delete" title="Delete"
                                        onClick={() => { setCurrentBudget(b); setIsDeleteModalOpen(true); }}>🗑️</button>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {budgets.length === 0 && !loading && (
                    <div className="empty-state glass-card">
                        <span className="empty-icon">📊</span>
                        <h3>No budgets set</h3>
                        <p>Create a budget to track spending per category.</p>
                        <button className="btn btn-primary" onClick={() => openModal()}>Add Budget</button>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content glass-card" onClick={e => e.stopPropagation()}>
                        <header>
                            <h2>{currentBudget ? 'Edit Budget' : 'New Budget'}</h2>
                            <button className="close-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
                        </header>
                        <form onSubmit={handleSave}>
                            <div className="form-group">
                                <label>Category *</label>
                                <select required value={formData.category}
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}>
                                    <option value="">Select Category</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div className="form-group">
                                    <label>Period Start *</label>
                                    <input type="date" required value={formData.period_start}
                                        onChange={e => setFormData({ ...formData, period_start: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Period End *</label>
                                    <input type="date" required value={formData.period_end}
                                        onChange={e => setFormData({ ...formData, period_end: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Budget Amount ({currency}) *</label>
                                <input type="number" required step="0.01" min="0.01"
                                    value={formData.budget_amount}
                                    onChange={e => setFormData({ ...formData, budget_amount: e.target.value })} />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{currentBudget ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isDeleteModalOpen && (
                <div className="modal-overlay" onClick={() => setIsDeleteModalOpen(false)}>
                    <div className="modal-content glass-card delete-modal" onClick={e => e.stopPropagation()}>
                        <h2>Confirm Delete</h2>
                        <p>Delete budget for <strong>{currentBudget?.category_name}</strong>?</p>
                        <p className="warning">This will not affect existing expenses.</p>
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
