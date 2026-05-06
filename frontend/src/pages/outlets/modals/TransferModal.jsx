import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { ENDPOINTS } from '../../../config/api';
import { useToast } from '../../../context/ToastContext';

export default function TransferModal({ isOpen, onClose, outletId, onTransferComplete, initialData = null }) {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [products, setProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    
    // items will be an array of { productId, quantity }
    const [selectedItems, setSelectedItems] = useState([]);
    const isSubmittingRef = useRef(false);
    
    useEffect(() => {
        if (isOpen) {
            isSubmittingRef.current = false;
            setSearchTerm('');
            fetchProducts('');
            
            if (initialData && initialData.items) {
                // Populate existing items
                setSelectedItems(initialData.items.map(item => ({
                    productId: item.product,
                    name: item.product_details?.name || 'Unknown Product',
                    display_id: item.product_details?.display_id || '',
                    stock: item.product_details?.current_stock || 0,
                    quantity: item.quantity
                })));
            } else {
                setSelectedItems([]);
            }
        }
    }, [isOpen, initialData]);

    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                fetchProducts(searchTerm);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [searchTerm, isOpen]);

    const fetchProducts = async (query = '') => {
        try {
            const searchParam = query ? `&search=${encodeURIComponent(query)}` : '';
            const res = await fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}?is_active=true${searchParam}`);
            if (res.ok) {
                const data = await res.json();
                setProducts(data.results || data);
            }
        } catch (error) {
            showToast("Failed to fetch products", "error");
        }
    };

    const handleAddItem = (product) => {
        if (!selectedItems.find(i => i.productId === product.id)) {
            setSelectedItems([...selectedItems, { 
                productId: product.id, 
                name: product.name,
                display_id: product.display_id,
                stock: product.current_stock,
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
            showToast("Please add at least one item", "error");
            return;
        }

        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;
        setLoading(true);

        try {
            const payload = {
                outlet: outletId,
                status: 'draft', // By default, create as draft. Can be dispatched in details view.
                items: selectedItems.map(item => ({
                    product: item.productId,
                    quantity: item.quantity
                }))
            };
            
            const url = initialData 
                ? `${ENDPOINTS.OUTLETS_TRANSFERS}${initialData.id}/`
                : ENDPOINTS.OUTLETS_TRANSFERS;
            
            const method = initialData ? 'PUT' : 'POST';

            const response = await fetchWithAuth(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                showToast(`Stock Transfer ${initialData ? 'updated' : 'drafted'} successfully`, "success");
                onTransferComplete();
                onClose();
            } else {
                const err = await response.json().catch(() => ({}));
                showToast(err.error || `Failed to ${initialData ? 'update' : 'create'} stock transfer`, "error");
                isSubmittingRef.current = false;
            }
        } catch (error) {
            console.error(error);
            showToast(`Failed to ${initialData ? 'update' : 'create'} stock transfer`, "error");
            isSubmittingRef.current = false;
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const filteredProducts = products.slice(0, 20);

    return (
        <div className="modal-overlay" style={overlayStyle}>
            <div className="modal-content" style={contentStyle}>
                <h2>{initialData ? 'Edit Transfer Draft' : 'Transfer Stock to Outlet'}</h2>
                
                <div style={{ marginBottom: '1rem' }}>
                    <input 
                        type="text" 
                        placeholder="Search products by name or ID..." 
                        className="form-input"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <div style={searchResultsStyle}>
                            {filteredProducts.map(p => (
                                <div key={p.id} style={searchResultItemStyle} onClick={() => handleAddItem(p)}>
                                    <span>{p.name} (#{p.display_id})</span>
                                    <span className="text-muted">Stock: {p.current_stock}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Current Stock</th>
                                    <th style={{ width: '100px' }}>Transfer Qty</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedItems.map(item => (
                                    <tr key={item.productId}>
                                        <td>{item.name} <br/><small className="text-muted">#{item.display_id}</small></td>
                                        <td>{item.stock}</td>
                                        <td>
                                            <input 
                                                type="number" 
                                                className="form-input" 
                                                min="1" 
                                                max={item.stock}
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
                            {loading ? 'Saving...' : (initialData ? 'Save Changes' : 'Create Draft Transfer')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// Basic inline styles for modal since we don't have a global modal CSS class guaranteed
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
