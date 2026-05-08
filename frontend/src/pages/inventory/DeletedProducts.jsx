import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './DeletedProducts.css';
import '../inventory/ProductList.css';

import '../../styles/components/modal-system.css';
export default function DeletedProducts() {
    const { fetchWithAuth } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [deletedProducts, setDeletedProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmModal, setConfirmModal] = useState(null);
    const [toast, setToast] = useState(null);

    const fetchDeleted = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}deleted/`);
            if (response.ok) {
                const data = await response.json();
                setDeletedProducts(data.results || []);
            }
        } catch (error) {
            console.error('Error fetching deleted products:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchDeleted();
    }, [fetchDeleted, location.key]);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleRestore = async (product) => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}${product.id}/restore/`, {
                method: 'POST',
            });
            if (response.ok) {
                showToast(`"${product.name}" has been restored`);
                fetchDeleted();
            } else {
                showToast('Failed to restore product', 'error');
            }
        } catch (error) {
            console.error('Error restoring product:', error);
            showToast('Failed to restore product', 'error');
        }
    };

    const handlePermanentDelete = async (product) => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}${product.id}/hard_delete/`, {
                method: 'POST',
            });
            if (response.ok || response.status === 204) {
                showToast(`"${product.name}" has been permanently deleted`);
                setConfirmModal(null);
                fetchDeleted();
            } else {
                showToast('Failed to delete product', 'error');
            }
        } catch (error) {
            console.error('Error permanently deleting product:', error);
            showToast('Failed to delete product', 'error');
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (loading) {
        return (
            <div className="deleted-products-container">
                <div className="loading-container">
                    <div className="spinner-large"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="deleted-products-container">
            <div className="deleted-products-header">
                <div>
                    <h2>Deleted Products</h2>
                    <span className="deleted-count">
                        {deletedProducts.length} deleted product{deletedProducts.length !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {deletedProducts.length === 0 ? (
                <div className="inventory-table-container">
                    <div className="deleted-empty-state">
                        <span className="empty-icon">🗑️</span>
                        <h3>No Deleted Products</h3>
                        <p>Products that you delete will appear here. You can restore them or permanently remove them.</p>
                    </div>
                </div>
            ) : (
                <div className="inventory-table-container">
                    <table className="inventory-table">
                        <thead>
                            <tr>
                                <th>Product Name</th>
                                <th>Category</th>
                                <th>Vendor</th>
                                <th>Deleted Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {deletedProducts.map(product => (
                                <tr key={product.id}>
                                    <td style={{ fontWeight: 500 }}>{product.name}</td>
                                    <td>{product.category_name || '—'}</td>
                                    <td>{product.vendor_name || '—'}</td>
                                    <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                                        {formatDate(product.deleted_at)}
                                    </td>
                                    <td>
                                        <div className="deleted-actions">
                                            <button
                                                className="btn-view"
                                                onClick={() => navigate(`/inventory/product/${product.id}`)}
                                                title="View Details"
                                            >
                                                View
                                            </button>
                                            <button
                                                className="btn-restore"
                                                onClick={() => handleRestore(product)}
                                                title="Restore Product"
                                            >
                                                Restore
                                            </button>
                                            <button
                                                className="btn-destroy"
                                                onClick={() => setConfirmModal(product)}
                                                title="Permanently Delete"
                                            >
                                                Delete Forever
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmModal && (
                <div className="confirm-modal-overlay" onClick={() => setConfirmModal(null)}>
                    <div className="confirm-modal" onClick={e => e.stopPropagation()}>
                        <h3>⚠️ Permanently Delete</h3>
                        <p>
                            Are you sure you want to permanently delete{' '}
                            <span className="product-name-highlight">"{confirmModal.name}"</span>?
                            <br /><br />
                            This action cannot be undone. The product and all associated data will be removed forever.
                        </p>
                        <div className="confirm-modal-actions">
                            <button
                                className="btn btn-ghost"
                                onClick={() => setConfirmModal(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={() => handlePermanentDelete(confirmModal)}
                            >
                                Delete Forever
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast notification */}
            {toast && (
                <div className={`deleted-toast ${toast.type}`}>
                    {toast.message}
                </div>
            )}
        </div>
    );
}
