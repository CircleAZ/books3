import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import './ProductDetails.css';
import './StockControl.css';

export default function ProductDetails() {
    const { id } = useParams();
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);

    // LENS-06: Custom delete confirmation modal
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);
    // LENS-08: Inline error state
    const [error, setError] = useState(null);

    // Stock adjustment modal state
    const [showStockModal, setShowStockModal] = useState(false);
    const [adjustmentType, setAdjustmentType] = useState('add');
    const [quantity, setQuantity] = useState('');
    const [unitCost, setUnitCost] = useState('');
    const [reason, setReason] = useState('adjustment');
    const [notes, setNotes] = useState('');
    const [stockError, setStockError] = useState('');
    const [stockSuccess, setStockSuccess] = useState('');

    const fetchProduct = useCallback(async () => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}${id}/`);
            if (response.ok) {
                const data = await response.json();
                setProduct(data);
            } else {
                console.error('Failed to fetch product');
            }
        } catch (err) {
            console.error('Error fetching product:', err);
        } finally {
            setLoading(false);
        }
    }, [id, fetchWithAuth]);

    useEffect(() => {
        if (id) fetchProduct();
    }, [id, fetchProduct]);

    const handleOpenStockModal = () => {
        setAdjustmentType('add');
        setQuantity('');
        setUnitCost('');
        setReason('adjustment');
        setNotes('');
        setStockError('');
        setStockSuccess('');
        setShowStockModal(true);
    };

    const handleStockSubmit = async (e) => {
        e.preventDefault();
        if (quantity === '' || quantity === null) {
            setStockError('Please enter a quantity');
            return;
        }
        try {
            const response = await fetchWithAuth(ENDPOINTS.INVENTORY_ADJUSTMENTS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product: product.id,
                    adjustment_type: adjustmentType,
                    quantity: Number(quantity),
                    unit_cost: unitCost ? Number(unitCost) : undefined,
                    reason,
                    notes,
                }),
            });
            if (response.ok) {
                setShowStockModal(false);
                setStockSuccess('Stock adjusted successfully');
                setTimeout(() => setStockSuccess(''), 3000);
                fetchProduct(); // refresh to show updated stock
            } else {
                const data = await response.json();
                setStockError(data.detail || 'Failed to save adjustment');
            }
        } catch (err) {
            setStockError('Network error');
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        setError(null);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}${id}/`, {
                method: 'DELETE'
            });
            if (response.ok) {
                navigate('/inventory');
            } else {
                // LENS-08: Inline error instead of alert()
                setShowDeleteModal(false);
                setError('Failed to delete product. It may have associated orders.');
            }
        } catch (error) {
            console.error('Error deleting product:', error);
            setShowDeleteModal(false);
            setError('A network error occurred while deleting.');
        } finally {
            setDeleting(false);
        }
    };

    if (loading) return <div className="loading-container"><div className="spinner-large"></div></div>;
    if (!product) return <div className="error-message">Product not found</div>;

    return (
        <div className="product-details-page fade-in">
            <div className="details-header">
                <div>
                    <h1>{product.name}</h1>
                    <span className="product-id">ID: {product.display_id}</span>
                </div>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={() => navigate(`/inventory/edit/${product.id}`)}>Edit</button>
                    <button className="btn btn-danger" onClick={() => setShowDeleteModal(true)}>Delete</button>
                </div>
            </div>

            {/* LENS-08: Inline error banner */}
            {error && (
                <div className="form-error-banner" role="alert" style={{ marginBottom: 'var(--space-md)' }}>
                    <span>⚠️ {error}</span>
                    <button type="button" className="banner-dismiss" onClick={() => setError(null)}>×</button>
                </div>
            )}

            <div className="details-grid">
                <div className="details-main card">
                    <h3>Product Information</h3>
                    <div className="info-row">
                        <strong>Category:</strong> {product.category?.name || '-'}
                    </div>
                    <div className="info-row">
                        <strong>Vendor:</strong> {product.vendor?.name || '-'}
                    </div>
                    <div className="info-row">
                        <strong>Description:</strong>
                        <p>{product.description || 'No description'}</p>
                    </div>

                    <div className="pricing-section">
                        <div className="price-item">
                            <span className="label">Cost Price</span>
                            <span className="value">{currency}{product.cost_price}</span>
                        </div>
                        <div className="price-item">
                            <span className="label">Selling Price</span>
                            <span className="value">{currency}{product.selling_price}</span>
                        </div>
                        <div className="price-item">
                            {/* Calculated Margin could go here */}
                            <span className="label">Margin</span>
                            <span className="value">{currency}{(product.selling_price - product.cost_price).toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                <div className="details-sidebar">
                    <div className="card stock-card">
                        <h3>Stock Status</h3>
                        <div className="stock-display">
                            <span className="stock-number">{product.stock_quantity}</span>
                            <span className="stock-label">In Stock</span>
                        </div>
                        <div className="threshold-info">
                            Low Stock Threshold: {product.low_stock_threshold}
                        </div>
                        <button className="btn btn-outline" onClick={handleOpenStockModal}>
                            Adjust Stock
                        </button>
                    </div>

                    <div className="card images-card">
                        <h3>Images</h3>
                        <div className="image-gallery">
                            {product.images && product.images.length > 0 ? (
                                product.images.map((img, i) => {
                                    const srcUrl = img.image || img;
                                    const finalSrc = srcUrl.startsWith('http') ? srcUrl : `${ENDPOINTS.INVENTORY_PRODUCTS.split('/api')[0]}${srcUrl}`;
                                    return <img key={i} src={finalSrc} alt={product.name} className="gallery-img" />;
                                })
                            ) : (
                                <div className="no-images">No images</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* LENS-06: Custom delete confirmation modal */}
            {showDeleteModal && (
                <div className="modal-overlay" onClick={() => !deleting && setShowDeleteModal(false)}>
                    <div className="modal-content delete-modal" onClick={e => e.stopPropagation()}>
                        <h2>Delete Product?</h2>
                        <p className="delete-warning">
                            You are about to permanently delete <strong>{product.name}</strong>.
                        </p>
                        <div className="delete-details">
                            <div className="delete-detail-item">
                                <span>Current Stock:</span>
                                <strong>{product.stock_quantity} units</strong>
                            </div>
                            <div className="delete-detail-item">
                                <span>Selling Price:</span>
                                <strong>{currency}{product.selling_price}</strong>
                            </div>
                        </div>
                        <p className="delete-caution">⚠️ This action cannot be undone. Stock history and associated data will be lost.</p>
                        <div className="modal-actions">
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setShowDeleteModal(false)}
                                disabled={deleting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={handleDelete}
                                disabled={deleting}
                            >
                                {deleting ? 'Deleting...' : 'Delete Product'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Stock Adjustment Modal */}
            {showStockModal && (
                <div className="modal-overlay" onClick={() => setShowStockModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h2>Stock Adjustment</h2>
                        {stockError && <div className="error-message">{stockError}</div>}

                        <div className="current-stock-display">
                            <span className="stock-product-name">{product.name}</span>
                            <span className="stock-current-badge">Current Stock: <strong>{product.stock_quantity}</strong></span>
                        </div>

                        <form onSubmit={handleStockSubmit}>
                            <div className="form-group">
                                <label>Adjustment Type</label>
                                <div className="adjustment-type-selector">
                                    <button type="button" className={`adjustment-type-btn ${adjustmentType === 'add' ? 'selected' : ''}`} onClick={() => setAdjustmentType('add')}>Received Stock</button>
                                    <button type="button" className={`adjustment-type-btn ${adjustmentType === 'subtract' ? 'selected' : ''}`} onClick={() => setAdjustmentType('subtract')}>Removed / Damaged</button>
                                    <button type="button" className={`adjustment-type-btn ${adjustmentType === 'set' ? 'selected' : ''}`} onClick={() => setAdjustmentType('set')}>Physical Count</button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Quantity</label>
                                <input type="number" min="0" placeholder={adjustmentType === 'set' ? 'New stock count' : 'Quantity received'} value={quantity} onChange={e => setQuantity(e.target.value)} required />
                            </div>

                            {adjustmentType === 'add' && (
                                <div className="form-group">
                                    <label>Unit Cost (Optional)</label>
                                    <input type="number" min="0" step="0.01" placeholder="Current cost will be used if blank" value={unitCost} onChange={e => setUnitCost(e.target.value)} />
                                </div>
                            )}

                            <div className="form-group">
                                <label>Reason</label>
                                <select value={reason} onChange={e => setReason(e.target.value)}>
                                    <option value="adjustment">Manual Adjustment</option>
                                    <option value="restock">Restock</option>
                                    <option value="damaged">Damaged</option>
                                    <option value="returned">Returned</option>
                                    <option value="correction">Correction</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Notes</label>
                                <textarea placeholder="Optional notes..." value={notes} onChange={e => setNotes(e.target.value)} rows="3" />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowStockModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Adjustment</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Stock success toast */}
            {stockSuccess && (
                <div className="deleted-toast success" style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1001 }}>
                    {stockSuccess}
                </div>
            )}
        </div>
    );
}

