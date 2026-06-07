import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { ENDPOINTS } from '../../../config/api';
import { useToast } from '../../../context/ToastContext';

import '../../../styles/components/modal-system.css';
import '../../../styles/components/data-table.css';

const RETURN_REASONS = [
    { value: 'unsold', label: 'Unsold' },
    { value: 'damage', label: 'Damaged' },
    { value: 'recall', label: 'Recalled' },
    { value: 'overstock', label: 'Overstock / Rebalancing' },
    { value: 'expired', label: 'Expired' },
    { value: 'defective', label: 'Defective / Manufacturing Fault' },
    { value: 'wrong_shipment', label: 'Wrong Shipment' },
    { value: 'discontinued', label: 'Discontinued' },
    { value: 'season_end', label: 'Season End / Clearance' },
    { value: 'other', label: 'Other' },
];

export default function ReturnModal({ isOpen, onClose, outletId, onReturnComplete }) {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [outletStock, setOutletStock] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [reason, setReason] = useState('unsold');
    const [notes, setNotes] = useState('');
    const [selectedItems, setSelectedItems] = useState([]);
// fallow-ignore-next-line code-duplication
    const isSubmittingRef = useRef(false);
    const [idempotencyKey, setIdempotencyKey] = useState('');

    // Regenerate idempotency key when payload dependencies change
    useEffect(() => {
        setIdempotencyKey(Math.random().toString(36).substring(2, 15) + Date.now().toString(36));
    }, [selectedItems, reason, notes]);

    useEffect(() => {
        if (isOpen) {
            isSubmittingRef.current = false;
            setSearchTerm('');
            setSelectedItems([]);
            setReason('unsold');
            setNotes('');
            fetchOutletStock();
        }
    }, [isOpen]);

    const fetchOutletStock = async () => {
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.OUTLETS_STOCK}?outlet=${outletId}`);
            if (res.ok) {
                const data = await res.json();
                const stockList = (data.results || data).filter(s => s.quantity > 0);
                setOutletStock(stockList);
            }
        } catch (error) {
            showToast("Failed to fetch outlet stock", "error");
        }
    };

    const handleAddItem = (stockItem) => {
        const productId = stockItem.product_details?.id || stockItem.product;
        if (!selectedItems.find(i => i.productId === productId)) {
            setSelectedItems([...selectedItems, {
                productId,
                name: stockItem.product_details?.name || 'Unknown',
                display_id: stockItem.product_details?.display_id || '',
                maxQty: stockItem.quantity,
                quantity: 1
            }]);
        }
    };

    const handleUpdateQuantity = (productId, qty) => {
        const parsed = parseInt(qty) || 0;
        setSelectedItems(selectedItems.map(item =>
            item.productId === productId
                ? { ...item, quantity: Math.min(Math.max(1, parsed), item.maxQty) }
                : item
        ));
    };

    const handleRemoveItem = (productId) => {
        setSelectedItems(selectedItems.filter(item => item.productId !== productId));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (selectedItems.length === 0) {
            showToast("Please add at least one item to return", "error");
            return;
        }

        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;
        setLoading(true);

        try {
            const payload = {
                outlet: outletId,
                reason,
                notes,
                items: selectedItems.map(item => ({
                    product: item.productId,
                    quantity: item.quantity
                })),
                idempotency_key: idempotencyKey
            };

            const response = await fetchWithAuth(ENDPOINTS.OUTLETS_RETURNS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                showToast("Return drafted successfully. Receive it to restore stock to inventory.", "success");
                onReturnComplete();
                onClose();
            } else {
                const err = await response.json().catch(() => ({}));
                showToast(err.error || "Failed to create return", "error");
                isSubmittingRef.current = false;
            }
        } catch (error) {
            console.error(error);
            showToast("Failed to create return", "error");
            isSubmittingRef.current = false;
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const filteredStock = searchTerm
        ? outletStock.filter(s => {
            const name = (s.product_details?.name || '').toLowerCase();
            const did = String(s.product_details?.display_id || '');
            const q = searchTerm.toLowerCase();
            return name.includes(q) || did.includes(q);
          })
        : outletStock;

    return (
        <div className="modal-overlay" style={overlayStyle}>
            <div className="modal-content" style={contentStyle}>
                <h2>Return Stock to Inventory</h2>

                {/* Reason selector */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem', display: 'block' }}>Reason</label>
                        <select className="form-input" value={reason} onChange={e => setReason(e.target.value)}>
                            {RETURN_REASONS.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ flex: 2, minWidth: '200px' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem', display: 'block' }}>Notes (optional)</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="e.g. Season clearance batch #3"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                        />
                    </div>
                </div>

                {/* Product search from outlet stock */}
                <div style={{ marginBottom: '1rem' }}>
                    <input
                        type="text"
                        placeholder="Search outlet stock by name or ID..."
                        className="form-input"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && filteredStock.length > 0 && (
                        <div style={searchResultsStyle}>
                            {filteredStock.slice(0, 15).map(s => {
                                const pid = s.product_details?.id || s.product;
                                const alreadyAdded = selectedItems.find(i => i.productId === pid);
                                return (
                                    <div
                                        key={s.id}
                                        style={{ ...searchResultItemStyle, opacity: alreadyAdded ? 0.4 : 1 }}
                                        onClick={() => !alreadyAdded && handleAddItem(s)}
                                    >
                                        <span>{s.product_details?.name} (#{s.product_details?.display_id})</span>
                                        <span className="text-muted">At outlet: {s.quantity}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {searchTerm && filteredStock.length === 0 && (
                        <div style={{ padding: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                            No matching stock found at this outlet.
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>At Outlet</th>
                                    <th style={{ width: '100px' }}>Return Qty</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedItems.map(item => (
                                    <tr key={item.productId}>
                                        <td>{item.name} <br/><small className="text-muted">#{item.display_id}</small></td>
                                        <td>{item.maxQty}</td>
                                        <td>
                                            <input
                                                type="number"
                                                className="form-input"
                                                min="1"
                                                max={item.maxQty}
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
                        <button type="submit" className="btn btn-warning" disabled={loading || selectedItems.length === 0}>
                            {loading ? 'Creating...' : 'Create Draft Return'}
{/* fallow-ignore-next-line code-duplication */}
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
