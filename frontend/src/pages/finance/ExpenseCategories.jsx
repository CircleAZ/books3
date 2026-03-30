import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './ExpenseCategories.css';

const ICONS = ['📁', '💸', '💼', '🏢', '🚚', '🛠️', '📱', '🏥', '🎓', '⚖️', '🛒', '⛽', '💡', '🌐', '🍕', '🎉', '🎁', '🧹', '🔌', '📦'];

export default function ExpenseCategories() {
    const { fetchWithAuth } = useAuth();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // Modal states
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [currentCategory, setCurrentCategory] = useState(null);
    
    // Form state
    const [formData, setFormData] = useState({
        name: '',
        icon: '📁',
        description: '',
        is_active: true
    });

    const fetchCategories = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(ENDPOINTS.FINANCE_EXPENSE_CATEGORIES);
            if (response.ok) {
                const data = await response.json();
                setCategories(data.results || data || []);
            } else {
                throw new Error('Failed to fetch categories');
            }
        } catch (err) {
            console.error('Error fetching expense categories:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    const handleOpenEditModal = (category = null) => {
        if (category) {
            setCurrentCategory(category);
            setFormData({
                name: category.name,
                icon: category.icon || '📁',
                description: category.description || '',
                is_active: category.is_active !== undefined ? category.is_active : true
            });
        } else {
            setCurrentCategory(null);
            setFormData({
                name: '',
                icon: '📁',
                description: '',
                is_active: true
            });
        }
        setIsEditModalOpen(true);
    };

    const handleCloseEditModal = () => {
        setIsEditModalOpen(false);
        setCurrentCategory(null);
    };

    const handleSaveCategory = async (e) => {
        e.preventDefault();
        const url = currentCategory 
            ? `${ENDPOINTS.FINANCE_EXPENSE_CATEGORIES}${currentCategory.id}/`
            : ENDPOINTS.FINANCE_EXPENSE_CATEGORIES;
        
        const method = currentCategory ? 'PATCH' : 'POST';

        try {
            const response = await fetchWithAuth(url, {
                method,
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                fetchCategories();
                handleCloseEditModal();
                // Simple toast-like alert
                console.log('Category saved successfully');
            } else {
                const data = await response.json();
                alert(data.detail || 'Failed to save category');
            }
        } catch (err) {
            console.error('Error saving category:', err);
            alert('An error occurred while saving the category');
        }
    };

    const handleDeleteClick = (category) => {
        setCurrentCategory(category);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_EXPENSE_CATEGORIES}${currentCategory.id}/`, {
                method: 'DELETE'
            });

            if (response.ok) {
                fetchCategories();
                setIsDeleteModalOpen(false);
                setCurrentCategory(null);
            } else {
                const data = await response.json();
                alert(data.detail || 'Failed to delete category. It might be in use.');
            }
        } catch (err) {
            console.error('Error deleting category:', err);
            alert('An error occurred while deleting the category');
        }
    };

    const toggleStatus = async (category) => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_EXPENSE_CATEGORIES}${category.id}/`, {
                method: 'PATCH',
                body: JSON.stringify({ is_active: !category.is_active })
            });

            if (response.ok) {
                setCategories(prev => prev.map(c => 
                    c.id === category.id ? { ...c, is_active: !c.is_active } : c
                ));
            }
        } catch (err) {
            console.error('Error toggling status:', err);
        }
    };

    if (loading && categories.length === 0) {
        return (
            <div className="expense-categories-loading">
                <div className="spinner"></div>
                <p>Loading categories...</p>
            </div>
        );
    }

    return (
        <div className="expense-categories-container fade-in">
            <header className="page-header">
                <div>
                    <p>Manage how you classify your business expenditures</p>
                </div>
                <button className="btn btn-primary" onClick={() => handleOpenEditModal()}>
                    <span className="plus-icon">+</span> New Category
                </button>
            </header>

            {error && <div className="error-banner">{error}</div>}

            <div className="category-grid">
                {categories.map(category => (
                    <div key={category.id} className={`category-card glass-card ${!category.is_active ? 'inactive' : ''}`}>
                        <div className="category-icon-wrapper">
                            <span className="category-icon">{category.icon || '📁'}</span>
                            <div className="status-badge">
                                <label className="switch">
                                    <input 
                                        type="checkbox" 
                                        checked={category.is_active} 
                                        onChange={() => toggleStatus(category)}
                                    />
                                    <span className="slider round"></span>
                                </label>
                            </div>
                        </div>
                        <div className="category-info">
                            <h3>{category.name}</h3>
                            <p className="description">{category.description || 'No description'}</p>
                            <div className="category-meta">
                                <span className="expense-count">
                                    {category.expense_count || 0} Expenses
                                </span>
                                <span className={`status-text ${category.is_active ? 'active' : 'inactive'}`}>
                                    {category.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                        </div>
                        <div className="category-actions">
                            <button className="btn-icon edit" title="Edit" onClick={() => handleOpenEditModal(category)}>
                                ✏️
                            </button>
                            <button className="btn-icon delete" title="Delete" onClick={() => handleDeleteClick(category)}>
                                🗑️
                            </button>
                        </div>
                    </div>
                ))}

                {categories.length === 0 && !loading && (
                    <div className="empty-state glass-card">
                        <span className="empty-icon">📁</span>
                        <h3>No categories found</h3>
                        <p>Create your first expense category to get started.</p>
                        <button className="btn btn-primary" onClick={() => handleOpenEditModal()}>
                            Add Category
                        </button>
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {isEditModalOpen && (
                <div className="modal-overlay" onClick={handleCloseEditModal}>
                    <div className="modal-content glass-card" onClick={e => e.stopPropagation()}>
                        <header>
                            <h2>{currentCategory ? 'Edit Category' : 'New Category'}</h2>
                            <button className="close-btn" onClick={handleCloseEditModal}>&times;</button>
                        </header>
                        <form onSubmit={handleSaveCategory}>
                            <div className="form-group">
                                <label>Category Name</label>
                                <input 
                                    type="text" 
                                    required 
                                    placeholder="e.g. Office Supplies"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label>Pick an Icon</label>
                                <div className="icon-picker">
                                    {ICONS.map(icon => (
                                        <button 
                                            key={icon}
                                            type="button"
                                            className={`icon-option ${formData.icon === icon ? 'selected' : ''}`}
                                            onClick={() => setFormData({ ...formData, icon })}
                                        >
                                            {icon}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Description (Optional)</label>
                                <textarea 
                                    placeholder="What is this category for?"
                                    rows="3"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                ></textarea>
                            </div>

                            <div className="form-group checkbox-group">
                                <label className="checkbox-label">
                                    <input 
                                        type="checkbox" 
                                        checked={formData.is_active}
                                        onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                                    />
                                    Mark as Active
                                </label>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={handleCloseEditModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary">
                                    {currentCategory ? 'Update Category' : 'Create Category'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && (
                <div className="modal-overlay" onClick={() => setIsDeleteModalOpen(false)}>
                    <div className="modal-content glass-card delete-modal" onClick={e => e.stopPropagation()}>
                        <h2>Confirm Delete</h2>
                        <p>Are you sure you want to delete <strong>{currentCategory?.name}</strong>?</p>
                        <p className="warning">This action cannot be undone. If there are expenses linked to this category, the deletion might fail or cause issues.</p>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setIsDeleteModalOpen(false)}>Cancel</button>
                            <button className="btn btn-danger" onClick={confirmDelete}>Delete Permanently</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
