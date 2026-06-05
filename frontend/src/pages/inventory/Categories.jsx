import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import CategoryModal from '../../components/inventory/CategoryModal';
import GuardedAction from '../../components/GuardedAction';
import './ProductList.css'; // Reusing table styles

import '../../styles/components/form-layout.css';
import '../../styles/components/modal-system.css';
export default function Categories() {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [currentCategory, setCurrentCategory] = useState(null);
    const [reassignCategory, setReassignCategory] = useState('');

    const fetchCategories = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(ENDPOINTS.INVENTORY_CATEGORIES);
            if (response.ok) {
                const data = await response.json();
                setCategories(data.results || data || []);
            }
        } catch (error) {
            console.error('Error fetching categories:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    const handleOpenModal = (category = null) => {
        setCurrentCategory(category);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setCurrentCategory(null);
    };

    const handleSuccess = () => {
        fetchCategories();
    };

    const handleDeleteClick = (category) => {
        setCurrentCategory(category);
        setReassignCategory('');
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        try {
            const query = reassignCategory ? `?reassign_to=${reassignCategory}` : '';
            const response = await fetchWithAuth(`${ENDPOINTS.INVENTORY_CATEGORIES}${currentCategory.id}/${query}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                fetchCategories();
                setIsDeleteModalOpen(false);
                setCurrentCategory(null);
                setReassignCategory('');
            } else {
                const data = await response.json();
                showToast(data.detail || 'Failed to delete category', 'error');
            }
        } catch (err) {
            showToast('Error deleting category', 'error');
        }
    };

    return (
        <div className="inventory-container fade-in">
            <div className="inventory-header">

                <div className="inventory-actions">
                    <GuardedAction permission="inventory.manage_products">
                        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                            + Add Category
                        </button>
// fallow-ignore-next-line code-duplication
                    </GuardedAction>
                </div>
            </div>

            <div className="inventory-table-container">
                {loading ? (
                    <div className="loading-container">
                        <div className="spinner-large"></div>
                    </div>
                ) : (
                    <table className="inventory-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Description</th>
                                <th>Display ID</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map(cat => (
                                <tr key={cat.id}>
                                    <td>{cat.name}</td>
                                    <td>{cat.description}</td>
                                    <td>{cat.display_id || '-'}</td>
                                    <td>
                                        <GuardedAction permission="inventory.manage_products">
                                            <button className="btn btn-sm btn-ghost" onClick={() => handleOpenModal(cat)}>Edit</button>
                                        </GuardedAction>
                                        <GuardedAction permission="inventory.manage_products">
                                            <button className="btn btn-sm btn-danger-ghost" onClick={() => handleDeleteClick(cat)}>Delete</button>
                                        </GuardedAction>
                                    </td>
                                </tr>
                            ))}
                            {categories.length === 0 && (
                                <tr>
                                    <td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>No categories found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add/Edit Modal */}
            <CategoryModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                category={currentCategory}
                onSuccess={handleSuccess}
            />

            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>Confirm Delete</h2>
                        <p>Are you sure you want to delete category "{currentCategory?.name}"?</p>

                        <div className="form-group" style={{ marginTop: '1rem' }}>
                            <label htmlFor="reassign-select">Reassign products to (optional):</label>
                            <select
                                id="reassign-select"
                                className="form-control"
                                value={reassignCategory}
                                onChange={(e) => setReassignCategory(e.target.value)}
                            >
                                <option value="">-- Delete products associated with this category --</option>
                                {categories
                                    .filter(c => c.id !== currentCategory?.id)
                                    .map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))
                                }
                            </select>
                            <small style={{ display: 'block', marginTop: '0.5rem', color: '#888' }}>
                                If you don't select a category, products in "{currentCategory?.name}" will be deleted.
                            </small>
                        </div>

                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setIsDeleteModalOpen(false)}>Cancel</button>
                            <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}