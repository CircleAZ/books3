import { useState, useEffect, useCallback } from 'react';
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

    useEffect(() => {
        fetchOutletData();
    }, [fetchOutletData, location.key]);

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

    if (loading) return <div className="page-loading">Loading Ledger...</div>;
    if (!outlet) return <div className="page-loading">Outlet not found.</div>;

    return (
        <div className="page-container">
            <div className="page-header" style={{ marginBottom: '1rem' }}>
                <div>
                    <h1 className="page-title">{outlet.name} (Outlet #{outlet.display_id})</h1>
                    <p className="page-subtitle">Commission: {outlet.commission_percentage}% | Contact: {outlet.contact_person || 'N/A'}</p>
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
                                                {transfer.status.toUpperCase()}
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
