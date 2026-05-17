import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import Pagination from '../../components/common/Pagination';
import './InitiateReturn.css';

export default function InitiateReturn() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { showToast } = useToast();
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

    // Recent Delivered Orders State (Default View)
    const [recentOrders, setRecentOrders] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoadingRecent, setIsLoadingRecent] = useState(false);

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
                // We only want delivered or partial orders for returns
                const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}?search=${searchQuery}&delivery_status__in=delivered,partial`);
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

    // Fetch recent delivered orders for default view
    useEffect(() => {
        if (searchQuery || selectedOrder) return;
        
        const fetchRecent = async () => {
            setIsLoadingRecent(true);
            try {
                const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}?delivery_status__in=delivered,partial&page=${currentPage}`);
                if (response.ok) {
                    const data = await response.json();
                    setRecentOrders(data.results || []);
                    // Assuming standard page size of 10 from backend
                    setTotalPages(Math.ceil((data.count || 0) / 10) || 1);
                }
            } catch (error) {
                console.error('Error fetching recent orders:', error);
            } finally {
                setIsLoadingRecent(false);
            }
        };
        fetchRecent();
    }, [searchQuery, selectedOrder, currentPage, fetchWithAuth]);

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
            showToast('Failed to load order details', 'error');
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
            return total + ((parseInt(item.quantity, 10) || 0) * item.unit_price);
        }, 0);
    }, [selectedItems]);

    const handleSubmit = async () => {
        const itemsToReturn = Object.values(selectedItems);
        if (itemsToReturn.length === 0) {
            showToast('Please select at least one item to return', 'error');
            return;
        }

        // Validate quantities
        for (const item of itemsToReturn) {
            const originalItem = selectedOrder.items.find(i => i.id === item.order_item);
            if (item.quantity <= 0 || item.quantity > originalItem.quantity) {
                showToast(`Invalid quantity for ${originalItem.product_name}`, 'error');
                return;
            }
            if (!item.reason) {
                showToast(`Please select a reason for ${originalItem.product_name}`, 'error');
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
                showToast('Return initiated successfully', 'success');
                navigate(`/returns/${data.id}`);
            } else {
                const err = await response.json();
                showToast('Error creating return: ' + JSON.stringify(err), 'error');
            }
        } catch (error) {
            console.error('Error submitting return:', error);
            showToast('Failed to submit return', 'error');
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
                            <div className="search-results-dropdown">
                                {searchResults.map(order => (
                                    <div
                                        key={order.id}
                                        className="search-result-item"
                                        onClick={() => handleSelectOrder(order.id)}
                                    >
                                        <div>
                                            <span className="text-muted small" style={{ marginRight: '6px' }}>#{order.id.split('-')[0].toUpperCase()}</span>
                                            <strong>{order.customer_name || 'Guest'}</strong>
                                        </div>
                                        <div className="small text-muted">
                                            {new Date(order.created_at).toLocaleDateString()} • <span style={{ textTransform: 'capitalize' }}>{order.derived_status || order.delivery_status}</span>
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

            {!selectedOrder && !searchQuery && (
                <section className="recent-orders-section mt-4 fade-in">
                    <div className="glass-card">
                        <div className="section-header">
                            <h3 className="section-title">Eligible Returnable Orders</h3>
                        </div>
                        {isLoadingRecent ? (
                            <div className="loading-state py-4">
                                <div className="spinner"></div>
                            </div>
                        ) : recentOrders.length > 0 ? (
                            <>
                                <div className="table-responsive">
                                    <table className="returns-table" style={{ width: '100%', textAlign: 'left' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ padding: '0.75rem' }}>Order ID</th>
                                                <th style={{ padding: '0.75rem' }}>Customer</th>
                                                <th style={{ padding: '0.75rem' }}>Date</th>
                                                <th style={{ padding: '0.75rem' }}>Status</th>
                                                <th style={{ padding: '0.75rem' }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recentOrders.map(order => (
                                                <tr key={order.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                    <td style={{ padding: '0.75rem' }}>#{order.id.split('-')[0].toUpperCase()}</td>
                                                    <td style={{ padding: '0.75rem' }}>{order.customer_name || 'Guest'}</td>
                                                    <td style={{ padding: '0.75rem' }}>{new Date(order.created_at).toLocaleDateString()}</td>
                                                    <td style={{ padding: '0.75rem', textTransform: 'capitalize' }}>
                                                        <span className={`status-badge status-${order.delivery_status || 'delivered'}`}>
                                                            {order.derived_status || order.delivery_status}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem' }}>
                                                        <button 
                                                            className="btn btn-sm btn-primary"
                                                            onClick={() => handleSelectOrder(order.id)}
                                                        >
                                                            Select
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {totalPages > 1 && (
                                    <div className="mt-4" style={{ display: 'flex', justifyContent: 'center' }}>
                                        <Pagination
                                            currentPage={currentPage}
                                            totalPages={totalPages}
                                            onPageChange={setCurrentPage}
                                        />
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="empty-state py-4 text-center text-muted">
                                No recently delivered orders available for return.
                            </div>
                        )}
                    </div>
                </section>
            )}

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
                                    <span>{currency}{Number(selectedOrder.total || selectedOrder.total_amount || 0).toFixed(2)}</span>
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
                                                        value={selectedItems[item.id]?.quantity ?? ''}
                                                        disabled={!selectedItems[item.id]}
                                                        onChange={(e) => updateItemData(item.id, 'quantity', e.target.value)}
                                                        onBlur={(e) => {
                                                            let val = parseInt(e.target.value, 10);
                                                            if (isNaN(val) || val < 1) val = 1;
                                                            if (val > item.quantity) val = item.quantity;
                                                            updateItemData(item.id, 'quantity', val);
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') e.target.blur();
                                                        }}
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
                                                    {currency}{selectedItems[item.id] ? ((parseInt(selectedItems[item.id].quantity, 10) || 0) * item.unit_price).toFixed(2) : '0.00'}
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
