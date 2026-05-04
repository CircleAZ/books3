import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { ENDPOINTS } from '../../../config/api';
import { useToast } from '../../../context/ToastContext';

export default function SaleModal({ isOpen, onClose, outletId, onSaleComplete }) {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [outletStock, setOutletStock] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    
    // items will be an array of { stockId, productId, name, sku, available, quantity }
    const [selectedItems, setSelectedItems] = useState([]);
    
    useEffect(() => {
        if (isOpen) {
            fetchOutletStock();
            setSelectedItems([]);
        }
    }, [isOpen, outletId]);

    const fetchOutletStock = async () => {
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.OUTLETS_STOCK}?outlet=${outletId}`);
            if (res.ok) {
                const data = await res.json();
                setOutletStock(data.results || data);
            }
        } catch (error) {
            showToast("Failed to fetch outlet stock", "error");
        }
    };

    const handleAddItem = (stockItem) => {
        if (!selectedItems.find(i => i.productId === stockItem.product)) {
            setSelectedItems([...selectedItems, { 
                productId: stockItem.product,
                name: stockItem.product_details.name,
                display_id: stockItem.product_details.display_id,
                available: stockItem.quantity,
                quantity: 1 
            }]);
        }
    };

    const handleUpdateQuantity = (productId, qty) => {
        setSelectedItems(selectedItems.map(item => 
            item.productId === productId ? { ...item, quantity: parseInt(qty) || 1 } : item
        ));
    };

    const handleRemoveItem = (productId) => {
        setSelectedItems(selectedItems.filter(item => item.productId !== productId));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (selectedItems.length === 0) {
            showToast("Please add at least one item to the sale", "error");
            return;
        }

        // Frontend validation deferred to backend to prevent stale stock caching race conditions.

        setLoading(true);
        try {
            const payload = {
                outlet: outletId,
                date: new Date().toISOString().split('T')[0],
                items: selectedItems.map(item => ({
                    product: item.productId,
                    quantity: item.quantity
                }))
            };
            const response = await fetchWithAuth(ENDPOINTS.OUTLETS_SALES, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                showToast("Daily Sale recorded successfully", "success");
                onSaleComplete();
                onClose();
            } else {
                const errData = await response.json().catch(() => ({}));
                // Check common DRF error formats (dict or list)
                const errMsg = errData.error || errData.detail || (Array.isArray(errData) ? errData[0] : "Failed to record daily sale");
                showToast(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg), "error");
            }
        } catch (error) {
            console.error(error);
            showToast("Failed to record daily sale", "error");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const filteredStock = outletStock.filter(s => 
        (s.product_details?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
        String(s.product_details?.display_id || '').includes(searchTerm)
    ).filter(s => s.quantity > 0).slice(0, 5); // Only show items with positive stock

    return (
        <div className="modal-overlay" style={overlayStyle}>
            <div className="modal-content" style={contentStyle}>
                <h2>Record Daily Sale</h2>
                <p className="page-subtitle mb-4">Select items sold by the outlet today.</p>
                
                <div style={{ marginBottom: '1rem' }}>
                    <input 
                        type="text" 
                        placeholder="Search outlet stock by name or SKU..." 
                        className="form-input"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <div style={searchResultsStyle}>
                            {filteredStock.map(s => (
                                <div key={s.id} style={searchResultItemStyle} onClick={() => handleAddItem(s)}>
                                    <span>{s.product_details.name} (#{s.product_details.display_id})</span>
                                    <span className="text-muted">Available: {s.quantity}</span>
                                </div>
                            ))}
                            {filteredStock.length === 0 && <div style={{padding: '0.5rem'}} className="text-muted">No stock matches found.</div>}
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Available</th>
                                    <th style={{ width: '100px' }}>Sold Qty</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedItems.map(item => (
                                    <tr key={item.productId}>
                                        <td>{item.name} <br/><small className="text-muted">#{item.display_id}</small></td>
                                        <td>{item.available}</td>
                                        <td>
                                            <input 
                                                type="number" 
                                                className="form-input" 
                                                min="1" 
                                                value={item.quantity}
                                                onChange={(e) => handleUpdateQuantity(item.productId, e.target.value)}
                                            />
                                        </td>
                                        <td>
                                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleRemoveItem(item.productId)}>✕</button>
                                        </td>
                                    </tr>
                                ))}
                                {selectedItems.length === 0 && (
                                    <tr><td colSpan="4" className="text-center text-muted">No items selected</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={loading || selectedItems.length === 0}>
                            {loading ? 'Processing...' : 'Record Sale'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const overlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
    display: 'flex', justifyContent: 'center', alignItems: 'center'
};
const contentStyle = {
    backgroundColor: 'var(--color-bg-primary)', padding: '2rem',
    borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '700px',
    boxShadow: 'var(--shadow-xl)'
};
const searchResultsStyle = {
    border: '1px solid var(--color-border)',
    borderTop: 'none',
    maxHeight: '150px',
    overflowY: 'auto',
    backgroundColor: 'var(--color-bg-primary)'
};
const searchResultItemStyle = {
    padding: '0.5rem',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    borderBottom: '1px solid var(--color-border)'
};
