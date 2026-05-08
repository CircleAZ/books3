import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import { parseApiError } from '../../utils/financeUtils';
import './ExpenseCategories.css';
import LoadingSpinner from '../../components/common/LoadingSpinner';

import '../../styles/components/page-layout.css';
import '../../styles/components/form-layout.css';
import '../../styles/components/modal-system.css';
export default function IncomeCategories() {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);

    const emptyForm = { name: '', description: '', is_active: true };
    const [formData, setFormData] = useState(emptyForm);

    const fetchCategories = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(ENDPOINTS.FINANCE_INCOME_CATEGORIES);
            if (res.ok) {
                const data = await res.json();
                setCategories(data.results || data || []);
            } else throw new Error('Failed to fetch income categories');
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    }, [fetchWithAuth]);

    useEffect(() => { fetchCategories(); }, [fetchCategories]);

    const openModal = (item = null) => {
        if (item) {
            setCurrentItem(item);
            setFormData({ name: item.name, description: item.description || '', is_active: item.is_active });
        } else { setCurrentItem(null); setFormData(emptyForm); }
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const url = currentItem
            ? `${ENDPOINTS.FINANCE_INCOME_CATEGORIES}${currentItem.id}/`
            : ENDPOINTS.FINANCE_INCOME_CATEGORIES;
        try {
            const res = await fetchWithAuth(url, {
                method: currentItem ? 'PATCH' : 'POST',
                body: JSON.stringify(formData)
            });
            if (res.ok) { fetchCategories(); setIsModalOpen(false); showToast('Category saved', 'success'); }
            else { const d = await res.json(); showToast(d.detail || parseApiError(d), 'error'); }
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    };

    const handleDelete = async () => {
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_INCOME_CATEGORIES}${currentItem.id}/`, { method: 'DELETE' });
            if (res.ok) { fetchCategories(); setIsDeleteModalOpen(false); setCurrentItem(null); showToast('Deleted', 'success'); }
            else showToast('Delete failed', 'error');
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    };

    const toggleStatus = async (item) => {
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_INCOME_CATEGORIES}${item.id}/`, {
                method: 'PATCH', body: JSON.stringify({ is_active: !item.is_active })
            });
            if (res.ok) setCategories(prev => prev.map(c => c.id === item.id ? { ...c, is_active: !c.is_active } : c));
        } catch (_) { }
    };

    if (loading && categories.length === 0) {
        return <LoadingSpinner />;
    }

    return (
        <div className="expense-categories-container fade-in">
            <header className="page-header">
                <div>
                    <p>Classify your non-sales revenue sources</p>
                </div>
                <button className="btn btn-primary" onClick={() => openModal()}>
                    <span className="plus-icon">+</span> New Category
                </button>
            </header>

            {error && <div className="error-banner">{error}</div>}

            <div className="category-grid">
                {categories.map(cat => (
                    <div key={cat.id} className={`category-card glass-card ${!cat.is_active ? 'inactive' : ''}`}>
                        <div className="category-icon-wrapper">
                            <span className="category-icon" role="img" aria-label="Income">💰</span>
                            <div className="status-badge">
                                <label className="switch">
                                    <input type="checkbox" checked={cat.is_active} onChange={() => toggleStatus(cat)} />
                                    <span className="slider round"></span>
                                </label>
                            </div>
                        </div>
                        <div className="category-info">
                            <h3>{cat.name}</h3>
                            <p className="description">{cat.description || 'No description'}</p>
                            <div className="category-meta">
                                <span className={`status-text ${cat.is_active ? 'active' : 'inactive'}`}>
                                    {cat.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                        </div>
                        <div className="category-actions">
                            <button className="btn-icon edit" title="Edit" onClick={() => openModal(cat)}>✏️</button>
                            <button className="btn-icon delete" title="Delete"
                                onClick={() => { setCurrentItem(cat); setIsDeleteModalOpen(true); }}>🗑️</button>
                        </div>
                    </div>
                ))}

                {categories.length === 0 && !loading && (
                    <div className="empty-state glass-card">
                        <span className="empty-icon">💰</span>
                        <h3>No income categories</h3>
                        <p>Create categories to organize your non-sales revenue.</p>
                        <button className="btn btn-primary" onClick={() => openModal()}>Add Category</button>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content glass-card" onClick={e => e.stopPropagation()}>
                        <header>
                            <h2>{currentItem ? 'Edit Category' : 'New Income Category'}</h2>
                            <button className="close-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
                        </header>
                        <form onSubmit={handleSave}>
                            <div className="form-group">
                                <label>Category Name *</label>
                                <input type="text" required placeholder="e.g. Rental Income"
                                    value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea rows="3" placeholder="Optional description"
                                    value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                            </div>
                            <div className="form-group checkbox-group">
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={formData.is_active}
                                        onChange={e => setFormData({ ...formData, is_active: e.target.checked })} />
                                    Mark as Active
                                </label>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{currentItem ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isDeleteModalOpen && (
                <div className="modal-overlay" onClick={() => setIsDeleteModalOpen(false)}>
                    <div className="modal-content glass-card delete-modal" onClick={e => e.stopPropagation()}>
                        <h2>Confirm Delete</h2>
                        <p>Delete income category <strong>{currentItem?.name}</strong>?</p>
                        <p className="warning">This cannot be undone.</p>
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
