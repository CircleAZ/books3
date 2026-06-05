import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './ProductList.css';
import './StockControl.css';

import '../../styles/components/form-layout.css';
import '../../styles/components/modal-system.css';
const HISTORY_PAGE_SIZE = 50;

export default function StockControl() {
    const { fetchWithAuth } = useAuth();
    const location = useLocation();
    const [activeTab, setActiveTab] = useState('low-stock');
    const [lowStockItems, setLowStockItems] = useState([]);
    const [negativeStockItems, setNegativeStockItems] = useState([]);
    const [historyItems, setHistoryItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isFiltering, setIsFiltering] = useState(false);
    const hasLoadedHistory = useRef(false);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [products, setProducts] = useState([]); // For dropdown
// fallow-ignore-next-line code-duplication
    const [selectedProduct, setSelectedProduct] = useState('');
    const [adjustmentType, setAdjustmentType] = useState('add'); // add, subtract, set
    const [quantity, setQuantity] = useState('');
    const [unitCost, setUnitCost] = useState('');
    const [reason, setReason] = useState('adjustment');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');
    // LENS-12: Searchable product filter
    const [productSearch, setProductSearch] = useState('');

    // History filter state
    const [historySearch, setHistorySearch] = useState('');
    const [debouncedHistorySearch, setDebouncedHistorySearch] = useState('');
    const [historyReason, setHistoryReason] = useState('');
    const [historyUser, setHistoryUser] = useState('');
    const [historyDirection, setHistoryDirection] = useState('');
    const [historyDateFrom, setHistoryDateFrom] = useState('');
    const [historyDateTo, setHistoryDateTo] = useState('');
    const [historyPage, setHistoryPage] = useState(1);
    const [historyTotalPages, setHistoryTotalPages] = useState(1);
    const [historyCount, setHistoryCount] = useState(0);
    const [filterOptions, setFilterOptions] = useState({ users: [], reasons: [] });

    // Debounce search — batch page reset with search term update (prevents race condition)
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedHistorySearch(historySearch);
            setHistoryPage(1);
        }, 400);
        return () => clearTimeout(timer);
    }, [historySearch]);

    const fetchLowStock = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}low_stock/`);
            if (response.ok) {
                const data = await response.json();
                setLowStockItems(data.results || data || []);
            }
        } catch (error) {
            console.error('Error fetching low stock:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    const fetchNegativeStock = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}negative_stock/`);
            if (response.ok) {
                const data = await response.json();
                setNegativeStockItems(data.results || data || []);
            }
        } catch (error) {
            console.error('Error fetching negative stock:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    const fetchHistory = useCallback(async () => {
        // First load → full spinner; subsequent loads → subtle dim effect
        if (!hasLoadedHistory.current) {
            setLoading(true);
        } else {
            setIsFiltering(true);
        }
        try {
            const params = new URLSearchParams();
            params.set('page', historyPage);
            params.set('page_size', HISTORY_PAGE_SIZE);
            if (debouncedHistorySearch) params.set('search', debouncedHistorySearch);
            if (historyReason) params.set('reason', historyReason);
            if (historyUser) params.set('created_by', historyUser);
            if (historyDirection) params.set('change_direction', historyDirection);
            if (historyDateFrom) params.set('date_from', historyDateFrom);
            if (historyDateTo) params.set('date_to', historyDateTo);

            const response = await fetchWithAuth(`${ENDPOINTS.INVENTORY_STOCK_HISTORY}?${params.toString()}`);
            if (response.ok) {
                const data = await response.json();
                setHistoryItems(data.results || []);
                setHistoryCount(data.count || 0);
                setHistoryTotalPages(Math.ceil((data.count || 0) / HISTORY_PAGE_SIZE));
            }
        } catch (error) {
            console.error('Error fetching history:', error);
        } finally {
            hasLoadedHistory.current = true;
            setLoading(false);
            setIsFiltering(false);
        }
    }, [fetchWithAuth, historyPage, debouncedHistorySearch, historyReason, historyUser, historyDirection, historyDateFrom, historyDateTo]);

    const fetchProducts = useCallback(async () => {
        try {
            const response = await fetchWithAuth(ENDPOINTS.INVENTORY_PRODUCTS);
            if (response.ok) {
                const data = await response.json();
                setProducts(data.results || data || []);
            }
        } catch (error) {
            console.error('Error fetching products:', error);
        }
    }, [fetchWithAuth]);

    const fetchFilterOptions = useCallback(async () => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.INVENTORY_STOCK_HISTORY}filter_options/`);
            if (response.ok) {
                const data = await response.json();
                setFilterOptions(data);
            }
        } catch (error) {
            console.error('Error fetching filter options:', error);
        }
    }, [fetchWithAuth]);

    // Low Stock & Negative Stock — only re-fetch on tab switch or navigation
    useEffect(() => {
        if (activeTab === 'low-stock') fetchLowStock();
        else if (activeTab === 'negative-stock') fetchNegativeStock();
    }, [activeTab, fetchLowStock, fetchNegativeStock, location.key]);

    // History — re-fetch on tab switch, navigation, OR when any filter changes
    // NOTE: location.key is intentionally in both effects. When the user
    // navigates back to this page, both effects fire, but only the one
    // matching the active tab actually calls a fetch function.
    useEffect(() => {
        if (activeTab === 'history') fetchHistory();
    }, [activeTab, fetchHistory, location.key]);

    // Reset filtering state when leaving history tab (prevents stuck dim)
    useEffect(() => {
        if (activeTab !== 'history') setIsFiltering(false);
    }, [activeTab]);

    // Fetch products once for the modal
    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    // Fetch filter options once for dropdowns
    useEffect(() => {
        fetchFilterOptions();
    }, [fetchFilterOptions]);

    const handleOpenModal = (product = null) => {
        if (product) {
            setSelectedProduct(product.id);
        } else {
            setSelectedProduct('');
        }
        setAdjustmentType('add');
        setQuantity('');
        setUnitCost('');
        setReason('adjustment');
        setNotes('');
        setError('');
        setProductSearch('');
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!selectedProduct || (quantity === '' || quantity === null || quantity === undefined)) {
            setError('Please fill in all required fields');
            return;
        }

        let qtyChange = parseInt(quantity, 10);
        if (isNaN(qtyChange)) {
            setError('Quantity must be a valid number');
            return;
        }
        // LENS-11: Allow 0 for 'set' type (clear stock), require positive for add/subtract
        if (adjustmentType === 'set' && qtyChange < 0) {
            setError('Set quantity cannot be negative');
            return;
        }
        if (adjustmentType !== 'set' && qtyChange <= 0) {
            setError('Quantity must be a positive number');
            return;
        }

        let type = 'increase';
        if (adjustmentType === 'subtract') type = 'decrease';
        if (adjustmentType === 'set') type = 'set';

        const payload = {
            product: selectedProduct,
            adjustment_type: type,
            quantity: parseInt(quantity, 10),
            unit_cost: unitCost ? Number(unitCost) : undefined,
            reason: reason,
            notes: notes
        };

        try {
            const response = await fetchWithAuth(ENDPOINTS.INVENTORY_STOCK_ADJUSTMENTS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                handleCloseModal();
                // Refresh current tab
                if (activeTab === 'low-stock') fetchLowStock();
                else if (activeTab === 'negative-stock') fetchNegativeStock();
                else fetchHistory();
                // Also refresh products list to update stock counts in dropdown
                fetchProducts();
            } else {
                const data = await response.json();
                setError(data.detail || 'Failed to update stock');
            }
        } catch (err) {
            setError('An error occurred');
        }
    };

    const handleFilterChange = (setter) => (e) => {
        setter(e.target.value);
        setHistoryPage(1);
    };

    const clearAllFilters = () => {
        setHistorySearch('');
        setDebouncedHistorySearch('');
        setHistoryReason('');
        setHistoryUser('');
        setHistoryDirection('');
        setHistoryDateFrom('');
        setHistoryDateTo('');
        setHistoryPage(1);
    };

    const hasActiveFilters = historySearch || historyReason || historyUser || historyDirection || historyDateFrom || historyDateTo;

    return (
        <div className="inventory-container fade-in">
            <div className="inventory-header">

                <div className="inventory-actions">
                    <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                        + New Adjustment
                    </button>
                </div>
            </div>

            <div className="stock-control-tabs">
                <button
                    className={`tab-button ${activeTab === 'low-stock' ? 'active' : ''}`}
                    onClick={() => setActiveTab('low-stock')}
                >
                    Low Stock Alerts
                </button>
                <button
                    className={`tab-button ${activeTab === 'negative-stock' ? 'active' : ''}`}
                    onClick={() => setActiveTab('negative-stock')}
                >
                    Negative Stock
                </button>
                <button
                    className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => setActiveTab('history')}
                >
                    Adjustment History
                </button>
            </div>

            <div className="inventory-table-container">
// fallow-ignore-next-line code-duplication
                {activeTab === 'low-stock' && (
                    loading ? (
                        <div className="loading-container"><div className="spinner-large"></div></div>
                    ) : (
// fallow-ignore-next-line code-duplication
                        <table className="inventory-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Category</th>
                                    <th>Current Stock</th>
                                    <th>Threshold</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...lowStockItems].sort((a, b) => a.stock_quantity - b.stock_quantity).map(item => (
                                    <tr key={item.id}>
                                        <td>{item.name}</td>
                                        <td>{item.category_name}</td>
                                        <td style={{ fontWeight: 'bold', color: 'var(--color-danger)' }}>{item.stock_quantity}</td>
                                        <td>{item.low_stock_threshold}</td>
                                        <td>
                                            <span className={`status-badge status-${item.stock_quantity <= 0 ? 'out-of-stock' : item.stock_quantity <= (item.low_stock_threshold || 5) ? 'low-stock' : 'in-stock'}`}>
                                                {item.stock_quantity <= 0 ? 'Out of Stock' : item.stock_quantity <= (item.low_stock_threshold || 5) ? 'Low Stock' : 'In Stock'}
                                            </span>
                                        </td>
                                        <td>
                                            <button className="btn btn-sm btn-ghost" onClick={() => handleOpenModal(item)}>Adjust</button>
                                        </td>
                                    </tr>
                                ))}
                                {lowStockItems.length === 0 && (
                                    <tr>
                                        <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No low stock items. Good job!</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )
                )}

// fallow-ignore-next-line code-duplication
                {activeTab === 'negative-stock' && (
// fallow-ignore-next-line code-duplication
                    loading ? (
                        <div className="loading-container"><div className="spinner-large"></div></div>
                    ) : (
// fallow-ignore-next-line code-duplication
                        <table className="inventory-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Category</th>
                                    <th>Current Stock</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {negativeStockItems.map(item => (
                                    <tr key={item.id}>
                                        <td>{item.name}</td>
                                        <td>{item.category_name}</td>
                                        <td style={{ fontWeight: 'bold', color: 'red' }}>{item.stock_quantity}</td>
                                        <td><span className="status-badge status-out-of-stock">Negative</span></td>
                                        <td>
                                            <button className="btn btn-sm btn-ghost" onClick={() => handleOpenModal(item)}>Adjust</button>
                                        </td>
                                    </tr>
                                ))}
                                {negativeStockItems.length === 0 && (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No negative stock items. All good!</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )
                )}

                {activeTab === 'history' && (
                    <>
                        {/* Filter Bar */}
                        <div className="history-filter-bar">
                            <div className="filter-search-row">
                                <div className="filter-search-wrapper">
                                    <svg className="filter-search-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                                        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                                    </svg>
                                    <input
                                        type="text"
                                        id="history-search-input"
                                        placeholder="Search by product name or notes..."
                                        className="filter-search-input"
                                        value={historySearch}
                                        onChange={e => setHistorySearch(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="filter-controls-row">
                                <select
                                    id="history-reason-filter"
                                    className="filter-select"
                                    value={historyReason}
                                    onChange={handleFilterChange(setHistoryReason)}
                                >
                                    <option value="">All Reasons</option>
                                    {filterOptions.reasons.map(r => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>

                                <select
                                    id="history-user-filter"
                                    className="filter-select"
                                    value={historyUser}
                                    onChange={handleFilterChange(setHistoryUser)}
                                >
                                    <option value="">All Users</option>
                                    {filterOptions.users.map(u => (
                                        <option key={u.id} value={u.id}>{u.username}</option>
                                    ))}
                                </select>

                                <select
                                    id="history-direction-filter"
                                    className="filter-select"
                                    value={historyDirection}
                                    onChange={handleFilterChange(setHistoryDirection)}
                                >
                                    <option value="">All Changes</option>
                                    <option value="positive">↑ Increases Only</option>
                                    <option value="negative">↓ Decreases Only</option>
                                </select>

                                <div className="filter-date-group">
                                    <label className="filter-date-label">From</label>
                                    <input
                                        type="date"
                                        id="history-date-from"
                                        className="filter-date-input"
                                        value={historyDateFrom}
                                        onChange={handleFilterChange(setHistoryDateFrom)}
                                    />
                                </div>

                                <div className="filter-date-group">
                                    <label className="filter-date-label">To</label>
                                    <input
                                        type="date"
                                        id="history-date-to"
                                        className="filter-date-input"
                                        value={historyDateTo}
                                        onChange={handleFilterChange(setHistoryDateTo)}
                                    />
                                </div>

                                {hasActiveFilters && (
                                    <button
                                        className="btn btn-ghost btn-sm filter-clear-btn"
                                        onClick={clearAllFilters}
                                    >
                                        ✕ Clear
                                    </button>
                                )}
                            </div>
                            <div className="filter-status-row">
                                {historyCount > 0 && (
                                    <div className="filter-result-count">
                                        {historyCount} record{historyCount !== 1 ? 's' : ''} found
                                    </div>
                                )}
                                {isFiltering && (
                                    <span className="filter-loading-indicator">Filtering...</span>
                                )}
                            </div>
                        </div>

                        {loading && !hasLoadedHistory.current ? (
                            <div className="loading-container"><div className="spinner-large"></div></div>
                        ) : (
                            <div className={`history-table-wrapper${isFiltering ? ' is-filtering' : ''}`}>
// fallow-ignore-next-line code-duplication
                                <table className="inventory-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Product</th>
                                            <th>Change</th>
                                            <th>New Level</th>
                                            <th>Reason</th>
                                            <th>User</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historyItems.map(item => (
                                            <tr key={item.id}>
                                                <td>{new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString()}</td>
                                                <td>{item.product_name}</td>
                                                <td className={item.quantity_change > 0 ? 'positive-change' : 'negative-change'}>
                                                    {item.quantity_change > 0 ? '+' : ''}{item.quantity_change}
                                                </td>
                                                <td>{item.quantity_after}</td>
                                                <td>
                                                    <span className={`history-reason-badge reason-${item.reason}`}>
                                                        {item.reason}
                                                    </span>
                                                </td>
                                                <td>{item.created_by_name}</td>
                                            </tr>
                                        ))}
                                        {historyItems.length === 0 && (
                                            <tr>
                                                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                                                    {hasActiveFilters ? 'No records match your filters.' : 'No history found.'}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>

                                {/* Pagination */}
                                {historyTotalPages > 1 && (
                                    <div className="history-pagination">
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            disabled={historyPage <= 1}
                                            onClick={() => setHistoryPage(p => p - 1)}
                                        >
                                            ← Previous
                                        </button>
                                        <span className="pagination-info">
                                            Page {historyPage} of {historyTotalPages}
                                        </span>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            disabled={historyPage >= historyTotalPages}
                                            onClick={() => setHistoryPage(p => p + 1)}
                                        >
                                            Next →
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Adjustment Modal */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>Stock Adjustment</h2>
                        {error && <div className="error-message">{error}</div>}

                        {/* LENS-13: Prominent current stock display */}
                        {selectedProduct && (() => {
                            const p = products.find(p => String(p.id) === String(selectedProduct));
                            return p ? (
                                <div className="current-stock-display">
                                    <span className="stock-product-name">{p.name}</span>
                                    <span className="stock-current-badge">Current Stock: <strong>{p.stock_quantity}</strong></span>
                                </div>
                            ) : null;
                        })()}

                        <form onSubmit={handleSubmit}>
                            {!selectedProduct && (
                                <div className="form-group">
                                    <label>Product</label>
                                    {/* LENS-12: Searchable product input */}
                                    <input
                                        type="text"
                                        placeholder="Search for a product..."
                                        className="product-search-input"
                                        value={productSearch}
                                        onChange={e => {
                                            setProductSearch(e.target.value);
                                            if (selectedProduct) setSelectedProduct('');
                                        }}
                                    />
                                    <div className="product-dropdown-list">
                                        {products
                                            .filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
                                            .slice(0, 10)
                                            .map(p => (
                                                <div
                                                    key={p.id}
                                                    className={`product-dropdown-item ${String(p.id) === String(selectedProduct) ? 'selected' : ''}`}
                                                    onClick={() => {
                                                        setSelectedProduct(p.id);
                                                        setProductSearch(p.name);
                                                    }}
                                                >
                                                    <span>{p.name}</span>
                                                    <span className="stock-badge">Stock: {p.stock_quantity}</span>
                                                </div>
                                            ))}
                                        {products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                                            <div className="product-dropdown-empty">No products found</div>
                                        )}
                                    </div>
// fallow-ignore-next-line code-duplication
                                </div>
                            )}

                            <div className="form-group">
                                <label>Adjustment Type</label>
                                <div className="adjustment-type-selector">
                                    <button
                                        type="button"
                                        className={`adjustment-type-btn ${adjustmentType === 'add' ? 'selected' : ''}`}
                                        onClick={() => setAdjustmentType('add')}
                                    >
                                        Received Stock
                                    </button>
                                    <button
                                        type="button"
                                        className={`adjustment-type-btn ${adjustmentType === 'subtract' ? 'selected' : ''}`}
                                        onClick={() => setAdjustmentType('subtract')}
                                    >
                                        Removed / Damaged
                                    </button>
                                    <button
                                        type="button"
                                        className={`adjustment-type-btn ${adjustmentType === 'set' ? 'selected' : ''}`}
                                        onClick={() => setAdjustmentType('set')}
                                    >
                                        Physical Count
                                    </button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Quantity</label>
// fallow-ignore-next-line code-duplication
                                <input
                                    type="number"
                                    min={adjustmentType === 'set' ? '0' : '1'}
                                    required
                                    value={quantity}
                                    onChange={e => setQuantity(e.target.value)}
                                    placeholder={adjustmentType === 'set' ? "Enter counted stock" : adjustmentType === 'add' ? "Quantity received" : "Quantity removed"}
                                />
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
                                    <option value="return">Return</option>
                                    <option value="purchase">Purchase</option>
                                    <option value="sale">Sale Correction</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Notes</label>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="Optional notes..."
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={handleCloseModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Adjustment</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
