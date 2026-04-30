import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import TransferModal from './modals/TransferModal';
import PaymentModal from './modals/PaymentModal';
import SaleModal from './modals/SaleModal';

export default function OutletDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { fetchWithAuth } = useAuth();
    const { formatCurrency } = useCurrency();
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
    const [savingCommissions, setSavingCommissions] = useState(false);
    const [commissionsLoaded, setCommissionsLoaded] = useState(false);

    // Modal states
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);

    const fetchOutletData = useCallback(async () => {
        try {
            setLoading(true);
            const [outletRes, stockRes, salesRes, paymentsRes, transferRes] = await Promise.all([
                fetchWithAuth(`${ENDPOINTS.OUTLETS}${id}/`),
                fetchWithAuth(`${ENDPOINTS.OUTLETS_STOCK}?outlet=${id}`),
                fetchWithAuth(`${ENDPOINTS.OUTLETS_SALES}?outlet=${id}`),
                fetchWithAuth(`${ENDPOINTS.OUTLETS_PAYMENTS}?outlet=${id}`),
                fetchWithAuth(`${ENDPOINTS.OUTLETS_TRANSFERS}?outlet=${id}`)
            ]);
            
            if (outletRes.ok) {
                const outletData = await outletRes.json();
                setOutlet(outletData);
            }
            if (stockRes.ok) {
                const stockData = await stockRes.json();
                setStock(stockData.results || stockData);
            }
            if (salesRes.ok) {
                const salesData = await salesRes.json();
                setSales(salesData.results || salesData);
            }
            if (paymentsRes.ok) {
                const paymentsData = await paymentsRes.json();
                setPayments(paymentsData.results || paymentsData);
            }
            if (transferRes.ok) {
                const transferData = await transferRes.json();
                setTransfers(transferData.results || transferData);
            }
        } catch (error) {
            console.error("Failed to load ledger:", error);
            showToast("Failed to load outlet ledger data", "error");
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, id, showToast]);

    // Lazy-load commission data only when the tab is activated
    const fetchCommissionData = useCallback(async () => {
        if (commissionsLoaded) return;
        try {
            const [productsRes, commissionsRes] = await Promise.all([
                fetchWithAuth(ENDPOINTS.INVENTORY_PRODUCTS),
                fetchWithAuth(`${ENDPOINTS.OUTLETS_COMMISSIONS}?outlet=${id}`)
            ]);

            if (productsRes.ok) {
                const productsData = await productsRes.json();
                setProducts(productsData.results || productsData);
            }
            if (commissionsRes.ok) {
                const commData = await commissionsRes.json();
                const commList = commData.results || commData;
                setCommissions(commList);
                
                // Seed the overrides map from existing saved values
                const seedOverrides = {};
                commList.forEach(c => {
                    seedOverrides[c.product] = c.commission_percentage;
                });
                setOverrides(seedOverrides);
            }
            setCommissionsLoaded(true);
        } catch (error) {
            console.error("Failed to load commission data:", error);
            showToast("Failed to load commission rates", "error");
        }
    }, [fetchWithAuth, id, showToast, commissionsLoaded]);

    useEffect(() => {
        fetchOutletData();
    }, [fetchOutletData, location.key]);

    useEffect(() => {
        if (activeTab === 'commissions') {
            fetchCommissionData();
        }
    }, [activeTab, fetchCommissionData]);

    const handleDispatchTransfer = async (transferId) => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.OUTLETS_TRANSFERS}${transferId}/dispatch_transfer/`, {
                method: 'POST'
            });
            if (response.ok) {
                showToast("Transfer dispatched successfully", "success");
                fetchOutletData(); // refresh
            } else {
                const err = await response.json().catch(() => ({}));
                showToast(err.error || "Failed to dispatch transfer", "error");
            }
        } catch (error) {
            showToast("Failed to dispatch transfer", "error");
        }
    };

    // Commission Matrix Logic
    const handleOverrideChange = (productId, value) => {
        setOverrides(prev => ({ ...prev, [productId]: value }));
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
                .filter(([_, rate]) => rate !== '' && rate !== undefined && rate !== null)
                .map(([productId, rate]) => ({
                    outlet: id,
                    product: productId,
                    commission_percentage: parseFloat(rate).toFixed(2)
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

    // Filtered products for commission matrix search
    const filteredProducts = useMemo(() => {
        if (!commissionSearch.trim()) return products;
        const q = commissionSearch.toLowerCase();
        return products.filter(p => 
            (p.name && p.name.toLowerCase().includes(q)) || 
            (p.display_id && String(p.display_id).includes(q))
        );
    }, [products, commissionSearch]);

    // Count how many products have overrides
    const overrideCount = Object.keys(overrides).length;

    if (loading) return <div className="page-loading">Loading Ledger...</div>;
    if (!outlet) return <div className="page-loading">Outlet not found.</div>;

    return (
        <div className="page-container">
            <div className="page-header" style={{ marginBottom: '1rem' }}>
                <div>
                    <h1 className="page-title">{outlet.name} (Outlet #{outlet.display_id})</h1>
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
            <div className="tab-content" style={{ marginTop: '1rem' }}>
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
                                        <td>{item.product_details.sku}</td>
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
                                                <button 
                                                    className="btn btn-sm btn-primary ml-2" 
                                                    onClick={() => handleDispatchTransfer(transfer.id)}
                                                    style={{ marginLeft: '0.5rem' }}
                                                >
                                                    Dispatch Now
                                                </button>
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
                                    <th>Product</th>
                                    <th>ID</th>
                                    <th className="text-right">Selling Price</th>
                                    <th className="text-center">Global Default (%)</th>
                                    <th className="text-center" style={{ minWidth: '160px' }}>Override for this Outlet (%)</th>
                                    <th className="text-center">Effective Rate</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {!commissionsLoaded ? (
                                    <tr><td colSpan="7" className="text-center text-muted" style={{ padding: '2rem' }}>Loading commission data...</td></tr>
                                ) : filteredProducts.length === 0 ? (
                                    <tr><td colSpan="7" className="text-center text-muted" style={{ padding: '2rem' }}>
                                        {commissionSearch ? 'No products match your search.' : 'No products found.'}
                                    </td></tr>
                                ) : filteredProducts.map(product => {
                                    const hasOverride = product.id in overrides;
                                    const overrideValue = hasOverride ? overrides[product.id] : '';
                                    const globalDefault = parseFloat(product.default_commission || 0).toFixed(2);
                                    const effectiveRate = hasOverride && overrideValue !== '' 
                                        ? parseFloat(overrideValue).toFixed(2)
                                        : globalDefault;
                                    const isCustom = hasOverride && overrideValue !== '';

                                    return (
                                        <tr key={product.id} style={isCustom ? { background: 'var(--color-bg-highlight, rgba(59, 130, 246, 0.05))' } : {}}>
                                            <td className="font-medium">{product.name}</td>
                                            <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>#{product.display_id}</td>
                                            <td className="text-right">{formatCurrency(product.selling_price)}</td>
                                            <td className="text-center" style={{ color: 'var(--color-text-muted)' }}>
                                                {globalDefault}%
                                            </td>
                                            <td className="text-center">
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    placeholder={`${globalDefault}`}
                                                    value={overrideValue}
                                                    onChange={(e) => handleOverrideChange(product.id, e.target.value)}
                                                    min="0"
                                                    max="100"
                                                    step="0.01"
                                                    style={{ 
                                                        width: '100px', 
                                                        textAlign: 'center',
                                                        margin: '0 auto',
                                                        display: 'block',
                                                        border: isCustom ? '2px solid var(--color-primary)' : undefined
                                                    }}
                                                />
                                            </td>
                                            <td className="text-center font-bold" style={{ color: isCustom ? 'var(--color-primary)' : 'inherit' }}>
                                                {effectiveRate}%
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
                    </div>
                )}
            </div>

            {/* Modals */}
            <TransferModal 
                isOpen={isTransferModalOpen} 
                onClose={() => setIsTransferModalOpen(false)} 
                outletId={outlet.id} 
                onTransferComplete={fetchOutletData} 
            />
            <PaymentModal 
                isOpen={isPaymentModalOpen} 
                onClose={() => setIsPaymentModalOpen(false)} 
                outletId={outlet.id} 
                outstandingBalance={outlet.outstanding_balance}
                onPaymentComplete={fetchOutletData} 
            />
            <SaleModal 
                isOpen={isSaleModalOpen} 
                onClose={() => setIsSaleModalOpen(false)} 
                outletId={outlet.id} 
                onSaleComplete={fetchOutletData} 
            />
        </div>
    );
}
