import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import Pagination from '../../components/common/Pagination';
import TransferModal from './modals/TransferModal';
import PaymentModal from './modals/PaymentModal';
import SaleModal from './modals/SaleModal';

export default function OutletDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { fetchWithAuth } = useAuth();
    const { formatCurrency, currency } = useCurrency();
    const { showToast } = useToast();
    
    const [outlet, setOutlet] = useState(null);
    const [stock, setStock] = useState([]);
    const [sales, setSales] = useState([]);
    const [payments, setPayments] = useState([]);
    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [activeTab, setActiveTab] = useState('stock');

    // Commission Matrix State
    const [products, setProducts] = useState([]);
    const [commissions, setCommissions] = useState([]);
    const [overrides, setOverrides] = useState({});      // { productId: rateString }
    const [commissionSearch, setCommissionSearch] = useState('');
    const [debouncedCommissionSearch, setDebouncedCommissionSearch] = useState('');
    const [commissionPage, setCommissionPage] = useState(1);
    const [commissionTotalPages, setCommissionTotalPages] = useState(1);
    const [savingCommissions, setSavingCommissions] = useState(false);
    const [commissionsLoaded, setCommissionsLoaded] = useState(false);
    const [commissionsLoading, setCommissionsLoading] = useState(false);

    // Modal states
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [editingTransfer, setEditingTransfer] = useState(null);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);

    const fetchOutlet = useCallback(async () => {
        try {
            const outletRes = await fetchWithAuth(`${ENDPOINTS.OUTLETS}${id}/`);
            if (outletRes.ok) {
                const outletData = await outletRes.json();
                setOutlet(outletData);
            }
        } catch (error) {
            console.error("Failed to load outlet:", error);
            showToast("Failed to load outlet data", "error");
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, id, showToast]);

    const fetchStock = useCallback(async () => {
        const res = await fetchWithAuth(`${ENDPOINTS.OUTLETS_STOCK}?outlet=${id}`);
        if (res.ok) { const d = await res.json(); setStock(d.results || d); }
    }, [fetchWithAuth, id]);

    const fetchSales = useCallback(async () => {
        const res = await fetchWithAuth(`${ENDPOINTS.OUTLETS_SALES}?outlet=${id}`);
        if (res.ok) { const d = await res.json(); setSales(d.results || d); }
    }, [fetchWithAuth, id]);

    const fetchPayments = useCallback(async () => {
        const res = await fetchWithAuth(`${ENDPOINTS.OUTLETS_PAYMENTS}?outlet=${id}`);
        if (res.ok) { const d = await res.json(); setPayments(d.results || d); }
    }, [fetchWithAuth, id]);

    const fetchTransfers = useCallback(async () => {
        const res = await fetchWithAuth(`${ENDPOINTS.OUTLETS_TRANSFERS}?outlet=${id}`);
        if (res.ok) { const d = await res.json(); setTransfers(d.results || d); }
    }, [fetchWithAuth, id]);

    const refreshData = useCallback(() => {
        fetchOutlet();
        if (activeTab === 'stock') fetchStock();
        else if (activeTab === 'sales') fetchSales();
        else if (activeTab === 'payments') fetchPayments();
        else if (activeTab === 'transfers') fetchTransfers();
    }, [activeTab, fetchOutlet, fetchStock, fetchSales, fetchPayments, fetchTransfers]);

    // Fetch commission overrides once (all of them, not paginated)
    const fetchCommissionOverrides = useCallback(async () => {
        try {
            const commissionsRes = await fetchWithAuth(`${ENDPOINTS.OUTLETS_COMMISSIONS}?outlet=${id}`);
            if (commissionsRes.ok) {
                const commData = await commissionsRes.json();
                const commList = commData.results || commData;
                setCommissions(commList);
                
                // Seed the overrides map from existing saved values
                const seedOverrides = {};
                commList.forEach(c => {
                    seedOverrides[c.product] = { type: c.commission_type || 'percent', value: c.commission_value };
                });
                setOverrides(seedOverrides);
            }
        } catch (error) {
            console.error("Failed to load commission overrides:", error);
        }
    }, [fetchWithAuth, id]);

    // Fetch products with server-side pagination + search
    const fetchCommissionProducts = useCallback(async (pageNum, searchQuery) => {
        setCommissionsLoading(true);
        try {
            const params = new URLSearchParams({ page: pageNum });
            if (searchQuery) params.set('search', searchQuery);
            
            const productsRes = await fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}?${params.toString()}`);
            if (productsRes.ok) {
                const productsData = await productsRes.json();
                setProducts(productsData.results || []);
                setCommissionTotalPages(Math.ceil((productsData.count || 0) / 20));
            }
        } catch (error) {
            console.error("Failed to load products:", error);
            showToast("Failed to load products", "error");
        } finally {
            setCommissionsLoading(false);
            setCommissionsLoaded(true);
        }
    }, [fetchWithAuth, showToast]);

    useEffect(() => {
        fetchOutlet();
    }, [fetchOutlet, location.key]);

    useEffect(() => {
        if (activeTab === 'stock') fetchStock();
        else if (activeTab === 'sales') fetchSales();
        else if (activeTab === 'payments') fetchPayments();
        else if (activeTab === 'transfers') fetchTransfers();
    }, [activeTab, fetchStock, fetchSales, fetchPayments, fetchTransfers, location.key]);

    // Debounce commission search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedCommissionSearch(commissionSearch);
            setCommissionPage(1);
        }, 400);
        return () => clearTimeout(timer);
    }, [commissionSearch]);

    // Load commission data when tab is activated, or when page/search changes
    useEffect(() => {
        if (activeTab === 'commissions') {
            fetchCommissionProducts(commissionPage, debouncedCommissionSearch);
            // Only fetch overrides once
            if (commissions.length === 0) fetchCommissionOverrides();
        }
    }, [activeTab, commissionPage, debouncedCommissionSearch, fetchCommissionProducts, fetchCommissionOverrides]);

    const handleDispatchTransfer = async (transferId) => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.OUTLETS_TRANSFERS}${transferId}/dispatch_transfer/`, {
                method: 'POST'
            });
            if (response.ok) {
                showToast("Transfer dispatched successfully", "success");
                refreshData(); // refresh
            } else {
                const err = await response.json().catch(() => ({}));
                showToast(err.error || "Failed to dispatch transfer", "error");
            }
        } catch (error) {
            showToast("Failed to dispatch transfer", "error");
        }
    };

    const handleDeleteTransfer = async (transferId) => {
        if (!window.confirm("Are you sure you want to delete this draft transfer?")) return;
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.OUTLETS_TRANSFERS}${transferId}/`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast("Transfer deleted successfully", "success");
                refreshData();
            } else {
                const err = await response.json().catch(() => ({}));
                showToast(err.error || "Failed to delete transfer", "error");
            }
        } catch (error) {
            showToast("Failed to delete transfer", "error");
        }
    };

    const openEditTransferModal = (transfer) => {
        setEditingTransfer(transfer);
        setIsTransferModalOpen(true);
    };

    // Commission Matrix Logic
    const handleOverrideChange = (productId, type, value) => {
        setOverrides(prev => ({ ...prev, [productId]: { type, value } }));
    };

    const handleClearOverride = (productId) => {
        setOverrides(prev => {
            const next = { ...prev };
            delete next[productId];
            return next;
        });
    };

    const handleSaveCommissions = async () => {
        setSavingCommissions(true);
        try {
            // Build the payload: only send products that have a non-empty override
            const payload = Object.entries(overrides)
                .filter(([_, rate]) => rate.value !== '' && rate.value !== undefined && rate.value !== null)
                .map(([productId, rate]) => ({
                    outlet: id,
                    product: productId,
                    commission_type: rate.type,
                    commission_value: parseFloat(rate.value).toFixed(2)
                }));

            // Also delete any existing commissions where the override was cleared
            const existingProductIds = commissions.map(c => c.product);
            const clearedProductIds = existingProductIds.filter(pid => !(pid in overrides));
            
            // Delete cleared overrides
            for (const pid of clearedProductIds) {
                const existing = commissions.find(c => c.product === pid);
                if (existing) {
                    await fetchWithAuth(`${ENDPOINTS.OUTLETS_COMMISSIONS}${existing.id}/`, {
                        method: 'DELETE'
                    });
                }
            }

            if (payload.length > 0) {
                const response = await fetchWithAuth(ENDPOINTS.OUTLETS_COMMISSIONS_BULK, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err.error || 'Failed to save commissions');
                }
            }

            showToast("Commission rates saved successfully", "success");
            // Force re-fetch to sync with server
            setCommissionsLoaded(false);
        } catch (error) {
            showToast(error.message || "Failed to save commission rates", "error");
        } finally {
            setSavingCommissions(false);
        }
    };

    // Count how many products have overrides
    const overrideCount = Object.keys(overrides).length;

    if (loading) return <div className="page-loading">Loading Ledger...</div>;
    if (!outlet) return <div className="page-loading">Outlet not found.</div>;

    return (
        <div className="page-container">
            <div className="page-header" style={{ marginBottom: '1rem', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {outlet.name} (Outlet #{outlet.display_id})
                        <button 
                            className="btn btn-sm btn-secondary" 
                            onClick={() => navigate(`/outlets/${outlet.id}/edit`)}
                        >
                            Edit Outlet
                        </button>
                    </h1>
                    <p className="page-subtitle">Contact: {outlet.contact_person || 'N/A'} | {outlet.phone || 'No phone'}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Outstanding Balance</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }} className={parseFloat(outlet.outstanding_balance) > 0 ? 'text-danger' : 'text-success'}>
                        {formatCurrency(outlet.outstanding_balance)}
                    </div>
                </div>
            </div>

            {/* Quick Action Bar */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
                <button className="btn btn-primary" onClick={() => setIsSaleModalOpen(true)}>Record Daily Sale</button>
                <button className="btn btn-success" onClick={() => setIsPaymentModalOpen(true)}>Log Payment</button>
                <button className="btn btn-secondary" onClick={() => setIsTransferModalOpen(true)}>Transfer Stock</button>
            </div>

            {/* Financial Summary Cards */}
            <div className="stats-grid" style={{ marginBottom: '2rem' }}>
                <div className="stat-card">
                    <div className="stat-title">Gross Sales</div>
                    <div className="stat-value">{formatCurrency(outlet.total_gross_sales)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-title">Commission Withheld</div>
                    <div className="stat-value">{formatCurrency(outlet.total_commission)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-title">Net Receivable</div>
                    <div className="stat-value">{formatCurrency(outlet.total_net_sales)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-title">Total Paid</div>
                    <div className="stat-value text-success">{formatCurrency(outlet.total_paid)}</div>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs">
                <button className={`tab ${activeTab === 'stock' ? 'active' : ''}`} onClick={() => setActiveTab('stock')}>Consignment Stock ({stock.length})</button>
                <button className={`tab ${activeTab === 'sales' ? 'active' : ''}`} onClick={() => setActiveTab('sales')}>Sales Logs ({sales.length})</button>
                <button className={`tab ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>Payments ({payments.length})</button>
                <button className={`tab ${activeTab === 'transfers' ? 'active' : ''}`} onClick={() => setActiveTab('transfers')}>Transfers ({transfers.length})</button>
                <button className={`tab ${activeTab === 'commissions' ? 'active' : ''}`} onClick={() => setActiveTab('commissions')}>Commissions</button>
            </div>

            {/* Tab Content */}
            <div className="tab-content">
                {activeTab === 'stock' && (
                    <div className="table-card">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>SKU</th>
                                    <th className="text-right">Quantity at Outlet</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stock.map(item => (
                                    <tr key={item.id}>
                                        <td className="font-medium">{item.product_details.name}</td>
                                        <td>#{item.product_details.display_id}</td>
                                        <td className="text-right font-bold">{item.quantity}</td>
                                    </tr>
                                ))}
                                {stock.length === 0 && <tr><td colSpan="3" className="text-center text-muted">No stock currently held at this outlet.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                )}
                
                {activeTab === 'sales' && (
                    <div className="table-card">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Date</th>
                                    <th>Gross</th>
                                    <th>Commission</th>
                                    <th>Net</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sales.map(sale => (
                                    <tr key={sale.id}>
                                        <td>#{sale.display_id}</td>
                                        <td>{sale.date}</td>
                                        <td>{formatCurrency(sale.gross_total)}</td>
                                        <td>{formatCurrency(sale.commission_amount)}</td>
                                        <td className="font-bold">{formatCurrency(sale.net_total)}</td>
                                    </tr>
                                ))}
                                {sales.length === 0 && <tr><td colSpan="5" className="text-center text-muted">No sales recorded.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'payments' && (
                    <div className="table-card">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Date</th>
                                    <th>Method</th>
                                    <th>Reference</th>
                                    <th>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments.map(payment => (
                                    <tr key={payment.id}>
                                        <td>#{payment.display_id}</td>
                                        <td>{payment.date}</td>
                                        <td style={{textTransform: 'capitalize'}}>{payment.payment_method}</td>
                                        <td>{payment.reference_id || '-'}</td>
                                        <td className="font-bold text-success">{formatCurrency(payment.amount)}</td>
                                    </tr>
                                ))}
                                {payments.length === 0 && <tr><td colSpan="5" className="text-center text-muted">No payments recorded.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'transfers' && (
                    <div className="table-card">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Date</th>
                                    <th>Reference</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transfers.map(transfer => (
                                    <tr key={transfer.id}>
                                        <td>#{transfer.display_id}</td>
                                        <td>{transfer.date}</td>
                                        <td>{transfer.reference_number || '-'}</td>
                                        <td>
                                            <span className={`status-badge status-${transfer.status === 'dispatched' ? 'completed' : 'draft'}`}>
                                                {(transfer.status || 'unknown').toUpperCase()}
                                            </span>
                                            {transfer.status === 'draft' && (
                                                <div style={{ display: 'inline-flex', gap: '0.5rem', marginLeft: '1rem', verticalAlign: 'middle' }}>
                                                    <button 
                                                        className="btn btn-sm btn-primary" 
                                                        onClick={() => handleDispatchTransfer(transfer.id)}
                                                    >
                                                        Dispatch Now
                                                    </button>
                                                    <button 
                                                        className="btn btn-sm btn-secondary" 
                                                        onClick={() => openEditTransferModal(transfer)}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button 
                                                        className="btn btn-sm btn-danger" 
                                                        onClick={() => handleDeleteTransfer(transfer.id)}
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {transfers.length === 0 && <tr><td colSpan="4" className="text-center text-muted">No transfers recorded.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'commissions' && (
                    <div className="table-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Search products..."
                                    value={commissionSearch}
                                    onChange={(e) => setCommissionSearch(e.target.value)}
                                    style={{ width: '250px' }}
                                />
                                {overrideCount > 0 && (
                                    <span className="status-badge status-info" style={{ fontSize: '0.75rem' }}>
                                        {overrideCount} override{overrideCount !== 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>
                            <button 
                                className="btn btn-primary"
                                onClick={handleSaveCommissions}
                                disabled={savingCommissions}
                            >
                                {savingCommissions ? 'Saving...' : 'Save Commission Rates'}
                            </button>
                        </div>
                        
                        <div style={{ padding: '0.75rem 1.25rem', background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            <strong>How it works:</strong> Each product has a Global Default rate. Enter a custom rate below to override it for this outlet. 
                            Leave blank to use the global default. Rates are frozen at the time of each sale.
                        </div>
                        
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Product Name</th>
                                    <th>Display ID</th>
                                    <th className="text-right">Selling Price</th>
                                    <th className="text-right">Margin</th>
                                    <th className="text-center">Global Default</th>
                                    <th className="text-center" style={{ minWidth: '220px' }}>Override for this Outlet (Live)</th>
                                    <th className="text-center">Effective Rate</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {commissionsLoading ? (
                                    <tr><td colSpan="9" className="text-center text-muted" style={{ padding: '2rem' }}>Loading products...</td></tr>
                                ) : products.length === 0 ? (
                                    <tr><td colSpan="9" className="text-center text-muted" style={{ padding: '2rem' }}>
                                        {commissionSearch ? 'No products match your search.' : 'No products found.'}
                                    </td></tr>
                                ) : products.map(product => {
                                    const hasOverride = product.id in overrides;
                                    const overrideData = hasOverride ? overrides[product.id] : null;
                                    
                                    const globalType = product.default_commission_type || 'percent';
                                    const globalVal = parseFloat(product.default_commission_value || 0).toFixed(2);
                                    const globalDisplay = globalType === 'percent' ? `${globalVal}%` : `${currency}${globalVal}`;
                                    
                                    const currentType = hasOverride && overrideData.value !== '' ? overrideData.type : globalType;
                                    const currentVal = hasOverride && overrideData.value !== '' ? parseFloat(overrideData.value).toFixed(2) : globalVal;
                                    const isCustom = hasOverride && overrideData.value !== '';

                                    const sp = parseFloat(product.selling_price) || 0;
                                    const cp = parseFloat(product.cost_price) || 0;
                                    const margin = Math.max(0, sp - cp);

                                    let displayPercent = '';
                                    let displayFixed = '';
                                    let commissionAmount = 0;

                                    if (currentType === 'percent') {
                                        displayPercent = hasOverride && overrideData.type === 'percent' ? overrideData.value : globalVal;
                                        commissionAmount = margin > 0 ? (parseFloat(currentVal) / 100 * margin) : 0;
                                        displayFixed = commissionAmount.toFixed(2);
                                    } else {
                                        displayFixed = hasOverride && overrideData.type === 'fixed' ? overrideData.value : globalVal;
                                        commissionAmount = parseFloat(currentVal);
                                        displayPercent = margin > 0 ? ((commissionAmount / margin) * 100).toFixed(2) : '0.00';
                                    }

                                    const effectiveRateDisplay = currentType === 'percent' ? `${currentVal}%` : `${currency}${currentVal}`;
                                    const exceedsMargin = commissionAmount > margin;

                                    return (
                                        <tr key={product.id} style={isCustom ? { background: 'var(--color-bg-highlight, rgba(59, 130, 246, 0.05))' } : {}}>
                                            <td className="font-medium">{product.name}</td>
                                            <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>#{product.display_id}</td>
                                            <td className="text-right">{formatCurrency(product.selling_price)}</td>
                                            <td className="text-right">{formatCurrency(margin)}</td>
                                            <td className="text-center" style={{ color: 'var(--color-text-muted)' }}>
                                                {globalDisplay}
                                            </td>
                                            <td className="text-center">
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                                                    <div className="input-with-action" style={{ width: '90px' }}>
                                                        <span style={{ padding: '0 5px', fontSize: '0.8rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRight: 'none', borderRadius: '4px 0 0 4px', display: 'flex', alignItems: 'center' }}>%</span>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            style={{ border: isCustom && currentType === 'percent' ? '2px solid var(--color-primary)' : undefined, borderRadius: '0 4px 4px 0', padding: '0.2rem', textAlign: 'center' }}
                                                            value={displayPercent}
                                                            onChange={(e) => handleOverrideChange(product.id, 'percent', e.target.value)}
                                                            onBlur={(e) => {
                                                                let val = parseFloat(e.target.value);
                                                                if (isNaN(val) || val < 0) val = 0;
                                                                if (val > 100) val = 100;
                                                                handleOverrideChange(product.id, 'percent', val.toString());
                                                            }}
                                                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                                                            min="0" max="100" step="0.01"
                                                        />
                                                    </div>
                                                    <span style={{ color: 'var(--color-text-muted)' }}>⇌</span>
                                                    <div className="input-with-action" style={{ width: '100px' }}>
                                                        <span style={{ padding: '0 5px', fontSize: '0.8rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRight: 'none', borderRadius: '4px 0 0 4px', display: 'flex', alignItems: 'center' }}>{currency}</span>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            style={{ border: isCustom && currentType === 'fixed' ? '2px solid var(--color-primary)' : undefined, borderRadius: '0 4px 4px 0', padding: '0.2rem', textAlign: 'center' }}
                                                            value={displayFixed}
                                                            onChange={(e) => handleOverrideChange(product.id, 'fixed', e.target.value)}
                                                            onBlur={(e) => {
                                                                let val = parseFloat(e.target.value);
                                                                if (isNaN(val) || val < 0) val = 0;
                                                                if (sp > 0 && val > sp) val = sp;
                                                                handleOverrideChange(product.id, 'fixed', val.toString());
                                                            }}
                                                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                                                            min="0" step="0.01"
                                                        />
                                                    </div>
                                                </div>
                                                {exceedsMargin && (
                                                    <div style={{ color: 'var(--color-warning, #f59e0b)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                                        Exceeds Margin!
                                                    </div>
                                                )}
                                            </td>
                                            <td className="text-center font-bold" style={{ color: isCustom ? 'var(--color-primary)' : 'inherit' }}>
                                                {effectiveRateDisplay}
                                                {isCustom && (
                                                    <span style={{ 
                                                        marginLeft: '0.35rem',
                                                        fontSize: '0.65rem', 
                                                        padding: '0.1rem 0.35rem',
                                                        borderRadius: '4px',
                                                        background: 'var(--color-primary)',
                                                        color: '#fff',
                                                        verticalAlign: 'middle'
                                                    }}>
                                                        CUSTOM
                                                    </span>
                                                )}
                                            </td>
                                            <td className="text-center">
                                                {isCustom && (
                                                    <button
                                                        className="btn btn-sm btn-danger"
                                                        onClick={() => handleClearOverride(product.id)}
                                                        title="Remove override, revert to global default"
                                                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <div className="pagination-bar">
                            <Pagination 
                                currentPage={commissionPage}
                                totalPages={commissionTotalPages}
                                onPageChange={setCommissionPage}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}
            <TransferModal 
                isOpen={isTransferModalOpen} 
                onClose={() => { setIsTransferModalOpen(false); setEditingTransfer(null); }} 
                outletId={outlet.id} 
                onTransferComplete={refreshData} 
                initialData={editingTransfer}
            />
            <PaymentModal 
                isOpen={isPaymentModalOpen} 
                onClose={() => setIsPaymentModalOpen(false)} 
                outletId={outlet.id} 
                outstandingBalance={outlet.outstanding_balance}
                onPaymentComplete={refreshData} 
            />
            <SaleModal 
                isOpen={isSaleModalOpen} 
                onClose={() => setIsSaleModalOpen(false)} 
                outletId={outlet.id} 
                onSaleComplete={refreshData} 
            />
        </div>
    );
}
