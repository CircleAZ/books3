import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import './InitiateReturn.css';

export default function InitiateReturn() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // Selected Order State
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [isLoadingOrder, setIsLoadingOrder] = useState(false);

    // Return Data State
    const [returnReasons, setReturnReasons] = useState([]);
    const [selectedItems, setSelectedItems] = useState({}); // { order_item_id: { quantity, reason, stock_action } }
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch return reasons on mount
    useEffect(() => {
        const fetchReasons = async () => {
            try {
                const response = await fetchWithAuth(ENDPOINTS.RETURN_REASONS);
                if (response.ok) {
                    const data = await response.json();
                    setReturnReasons(data);
                }
            } catch (error) {
                console.error('Error fetching return reasons:', error);
            }
        };
        fetchReasons();
    }, [fetchWithAuth]);

    // Debounced Search for Orders
    useEffect(() => {
        if (!searchQuery || searchQuery.length < 3) {
            setSearchResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                // We only want delivered orders for returns
                const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}?search=${searchQuery}&delivery_status=delivered`);
                if (response.ok) {
                    const data = await response.json();
                    setSearchResults(data.results || []);
                }
            } catch (error) {
                console.error('Error searching orders:', error);
            } finally {
                setIsSearching(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchQuery, fetchWithAuth]);

    const handleSelectOrder = async (orderId) => {
        setIsLoadingOrder(true);
        setSearchResults([]);
        setSearchQuery('');
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}${orderId}/`);
            if (response.ok) {
                const data = await response.json();
                setSelectedOrder(data);
                // Initialize selected items (none selected by default)
                setSelectedItems({});
            }
        } catch (error) {
            console.error('Error fetching order details:', error);
            alert('Failed to load order details');
        } finally {
            setIsLoadingOrder(false);
        }
    };

    const toggleItemSelection = (itemId, item) => {
        setSelectedItems(prev => {
            const newSelected = { ...prev };
            if (newSelected[itemId]) {
                delete newSelected[itemId];
            } else {
                newSelected[itemId] = {
                    order_item: itemId,
                    quantity: 1,
                    reason: returnReasons[0]?.id || '',
                    stock_action: 'return_to_stock',
                    unit_price: item.unit_price
                };
            }
            return newSelected;
        });
    };

    const updateItemData = (itemId, field, value) => {
        setSelectedItems(prev => ({
            ...prev,
            [itemId]: {
                ...prev[itemId],
                [field]: value
            }
        }));
    };

    const refundAmount = useMemo(() => {
        return Object.values(selectedItems).reduce((total, item) => {
            return total + (item.quantity * item.unit_price);
        }, 0);
    }, [selectedItems]);

    const handleSubmit = async () => {
        const itemsToReturn = Object.values(selectedItems);
        if (itemsToReturn.length === 0) {
            alert('Please select at least one item to return');
            return;
        }

        // Validate quantities
        for (const item of itemsToReturn) {
            const originalItem = selectedOrder.items.find(i => i.id === item.order_item);
            if (item.quantity <= 0 || item.quantity > originalItem.quantity) {
                alert(`Invalid quantity for ${originalItem.product_name}`);
                return;
            }
            if (!item.reason) {
                alert(`Please select a reason for ${originalItem.product_name}`);
                return;
            }
        }

        setIsSubmitting(true);
        try {
            const payload = {
                order: selectedOrder.id,
                notes: notes,
                items: itemsToReturn.map(({ unit_price, ...rest }) => rest)
            };

            const response = await fetchWithAuth(ENDPOINTS.RETURNS, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const data = await response.json();
                alert('Return initiated successfully');
                navigate(`/returns/${data.id}`);
            } else {
                const err = await response.json();
                alert('Error creating return: ' + JSON.stringify(err));
            }
        } catch (error) {
            console.error('Error submitting return:', error);
            alert('Failed to submit return');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="returns-container fade-in">
            <header className="returns-header">
                <p>Process customer returns and manage inventory restock</p>
            </header>

            {/* 1. Order Search Section */}
            <section className="search-section">
                <div className="glass-card">
                    <label className="form-label">Search Order</label>
                    <div className="search-input-group">
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Enter Order ID, Customer Name or Phone..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {isSearching && (
                            <div className="spinner-wrapper" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}>
                                <div className="spinner-small"></div>
                            </div>
                        )}

                        {searchResults.length > 0 && (
                            <div className="order-search-results">
                                {searchResults.map(order => (
                                    <div
                                        key={order.id}
                                        className="order-result-item"
                                        onClick={() => handleSelectOrder(order.id)}
                                    >
                                        <div className="order-result-info">
                                            <div>#{order.id.split('-')[0].toUpperCase()}</div>
                                            <div className="small text-muted">{order.customer_name || 'Guest'} • {new Date(order.created_at).toLocaleDateString()}</div>
                                        </div>
                                        <div className="order-result-status status-delivered" style={{ textTransform: 'capitalize' }}>
                                            {order.derived_status || order.delivery_status}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {searchQuery.length > 0 && searchQuery.length < 3 && (
                        <div className="small text-muted mt-1">Type at least 3 characters to search...</div>
                    )}
                </div>
            </section>

            {isLoadingOrder && (
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading order details...</p>
                </div>
            )}

            {selectedOrder && (
                <div className="return-form-content fade-in">
                    {/* 2. Order Details Display */}
                    <section className="order-summary-section">
                        <div className="glass-card">
                            <div className="section-header">
                                <h3 className="section-title">Order Summary</h3>
                                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedOrder(null)}>Change Order</button>
                            </div>
                            <div className="order-info-grid">
                                <div className="info-item">
                                    <label>Order ID</label>
                                    <span>#{selectedOrder.id.split('-')[0].toUpperCase()}</span>
                                </div>
                                <div className="info-item">
                                    <label>Customer</label>
                                    <span>{selectedOrder.customer_name || 'Guest'}</span>
                                </div>
                                <div className="info-item">
                                    <label>Date</label>
                                    <span>{new Date(selectedOrder.created_at).toLocaleDateString()}</span>
                                </div>
                                <div className="info-item">
                                    <label>Total Paid</label>
                                    <span>{currency}{Number(selectedOrder.total_amount).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 3. Return Item Selection */}
                    <section className="items-selection-section">
                        <div className="glass-card">
                            <h3 className="section-title">Select Items to Return</h3>
                            <div className="items-table-container">
                                <table className="returns-table">
                                    <thead>
                                        <tr>
                                            <th>Select</th>
                                            <th>Product</th>
                                            <th>Original Qty</th>
                                            <th>Return Qty</th>
                                            <th>Reason</th>
                                            <th>Stock Action</th>
                                            <th>Refund</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedOrder.items.map(item => (
                                            <tr key={item.id} className={selectedItems[item.id] ? 'row-selected' : ''}>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        className="return-checkbox"
                                                        checked={!!selectedItems[item.id]}
                                                        onChange={() => toggleItemSelection(item.id, item)}
                                                    />
                                                </td>
                                                <td className="item-name-cell">
                                                    <span className="item-name">{item.product_name}</span>
                                                    <span className="item-sku">SKU: {item.product_sku || 'N/A'}</span>
                                                </td>
                                                <td>{item.quantity}</td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        className="form-control qty-input"
                                                        min="1"
                                                        max={item.quantity}
                                                        value={selectedItems[item.id]?.quantity || 1}
                                                        disabled={!selectedItems[item.id]}
                                                        onChange={(e) => updateItemData(item.id, 'quantity', parseInt(e.target.value) || 0)}
                                                    />
                                                </td>
                                                <td>
                                                    <select
                                                        className="form-control reason-select"
                                                        value={selectedItems[item.id]?.reason || ''}
                                                        disabled={!selectedItems[item.id]}
                                                        onChange={(e) => updateItemData(item.id, 'reason', e.target.value)}
                                                    >
                                                        <option value="" disabled>Select Reason</option>
                                                        {returnReasons.map(r => (
                                                            <option key={r.id} value={r.id}>{r.name}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <div className="stock-action-group">
                                                        <label className="radio-label">
                                                            <input
                                                                type="radio"
                                                                name={`action-${item.id}`}
                                                                checked={selectedItems[item.id]?.stock_action === 'return_to_stock'}
                                                                disabled={!selectedItems[item.id]}
                                                                onChange={() => updateItemData(item.id, 'stock_action', 'return_to_stock')}
                                                            />
                                                            Restock
                                                        </label>
                                                        <label className="radio-label">
                                                            <input
                                                                type="radio"
                                                                name={`action-${item.id}`}
                                                                checked={selectedItems[item.id]?.stock_action === 'damaged'}
                                                                disabled={!selectedItems[item.id]}
                                                                onChange={() => updateItemData(item.id, 'stock_action', 'damaged')}
                                                            />
                                                            Damaged
                                                        </label>
                                                    </div>
                                                </td>
                                                <td className="text-primary font-bold">
                                                    {currency}{selectedItems[item.id] ? (selectedItems[item.id].quantity * item.unit_price).toFixed(2) : '0.00'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="refund-summary">
                                <div className="refund-total">
                                    <label>Total Refund Amount</label>
                                    <div className="refund-amount">{currency}{refundAmount.toFixed(2)}</div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 4. Notes Section */}
                    <section className="notes-section">
                        <div className="glass-card">
                            <label className="form-label">Return Notes</label>
                            <textarea
                                className="form-control notes-textarea"
                                placeholder="Add internal notes about this return..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            ></textarea>
                        </div>
                    </section>

                    {/* 5. Actions */}
                    <div className="form-actions">
                        <button
                            className="btn btn-secondary"
                            onClick={() => navigate('/orders')}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleSubmit}
                            disabled={isSubmitting || Object.keys(selectedItems).length === 0}
                        >
                            {isSubmitting ? 'Processing...' : 'Submit Return'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
