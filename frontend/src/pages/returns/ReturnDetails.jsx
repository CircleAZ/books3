import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import RefundModal from './modals/RefundModal';
import './ReturnDetails.css';

export default function ReturnDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();

    const [returnData, setReturnData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);

    const [availablePaymentMethods, setAvailablePaymentMethods] = useState([]);

    const fetchReturnDetails = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.RETURNS}${id}/`);
            if (response.ok) {
                const data = await response.json();
                setReturnData(data);
                setError(null);
            } else {
                setError('Failed to fetch return details');
            }

            // Fetch Payment Methods
            const methodRes = await fetchWithAuth(ENDPOINTS.SETTINGS_PAYMENT_METHODS);
            if (methodRes.ok) {
                const methodData = await methodRes.json();
                setAvailablePaymentMethods((methodData.results || methodData).filter(m => m.is_enabled));
            }
        } catch (err) {
            setError('Error connecting to server');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [id, fetchWithAuth]);

    useEffect(() => {
        fetchReturnDetails();
    }, [fetchReturnDetails]);

    const handleAction = async (action) => {
        if (action === 'cancel' && !window.confirm('Are you sure you want to cancel this return?')) return;

        setActionLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.RETURNS}${id}/${action}/`, {
                method: 'POST'
            });
            if (response.ok) {
                fetchReturnDetails();
            } else {
                const data = await response.json();
                alert(data.error || `Failed to ${action.replace('_', ' ')}`);
            }
        } catch (err) {
            console.error(`Error during ${action}:`, err);
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return (
        <div className="return-details-loading">
            <div className="spinner-large"></div>
            <p>Loading return details...</p>
        </div>
    );

    if (error || !returnData) return (
        <div className="return-details-error card">
            <h2>Error</h2>
            <p>{error || 'Return not found'}</p>
        </div>
    );

    const getStatusClass = (status) => {
        switch (status) {
            case 'initiated': return 'status-orange';
            case 'items_received': return 'status-blue';
            case 'completed': return 'status-green';
            case 'cancelled': return 'status-red';
            default: return '';
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleString();
    };

    const isFullyRefunded = Number(returnData.total_refunded) >= Number(returnData.total_refund_amount);

    return (
        <div className="return-details-container animate-fade-in">
            {/* Header */}
            <div className="return-header">
                <div className="header-info">
                    <h1>Return #{returnData.display_id}</h1>
                    <span className={`status-pill ${getStatusClass(returnData.status)}`}>
                        {returnData.status.replace('_', ' ')}
                    </span>
                </div>
                <div className="header-actions">
                    {returnData.status === 'initiated' && (
                        <>
                            <button
                                className="btn btn-primary"
                                onClick={() => handleAction('receive_items')}
                                disabled={actionLoading}
                            >
                                Receive Items
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={() => handleAction('cancel')}
                                disabled={actionLoading}
                            >
                                Cancel Return
                            </button>
                        </>
                    )}
                    {returnData.status === 'items_received' && (
                        <button
                            className="btn btn-success"
                            onClick={() => handleAction('complete')}
                            disabled={actionLoading}
                        >
                            Complete Return
                        </button>
                    )}
                    {returnData.status === 'completed' && !isFullyRefunded && (
                        <button
                            className="btn btn-primary"
                            onClick={() => setIsRefundModalOpen(true)}
                            disabled={actionLoading}
                        >
                            Record Refund
                        </button>
                    )}
                </div>
            </div>

            <div className="return-grid">
                <div className="main-content">
                    {/* Return Info Card */}
                    <div className="card glass info-card">
                        <h3>Return Information</h3>
                        <div className="info-grid">
                            <div className="info-item">
                                <label>Order ID</label>
                                <Link to={`/orders/${returnData.order}`} className="order-link">
                                    #{returnData.order_display_id}
                                </Link>
                            </div>
                            <div className="info-item">
                                <label>Customer</label>
                                <span>{returnData.customer_name}</span>
                            </div>
                            <div className="info-item">
                                <label>Created At</label>
                                <span>{formatDate(returnData.created_at)}</span>
                            </div>
                            <div className="info-item">
                                <label>Created By</label>
                                <span>{returnData.created_by_name}</span>
                            </div>
                        </div>
                        {returnData.notes && (
                            <div className="return-notes">
                                <label>Notes</label>
                                <p>{returnData.notes}</p>
                            </div>
                        )}
                    </div>

                    {/* Items Table */}
                    <div className="card glass items-card">
                        <h3>Returned Items</h3>
                        <div className="table-container">
                            <table className="details-table">
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>Reason</th>
                                        <th>Stock Action</th>
                                        <th>Price</th>
                                        <th>Qty</th>
                                        <th>Total</th>
                                        <th>Restored</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {returnData.items.map(item => (
                                        <tr key={item.id}>
                                            <td>{item.product_name}</td>
                                            <td>{item.reason_name || item.reason_display}</td>
                                            <td className="capitalize">{item.stock_action.replace('_', ' ')}</td>
                                            <td>{currency}{Number(item.unit_price).toFixed(2)}</td>
                                            <td>{item.quantity}</td>
                                            <td>{currency}{Number(item.line_total).toFixed(2)}</td>
                                            <td className="text-center">
                                                {item.stock_restored ? (
                                                    <span className="icon-success">✓</span>
                                                ) : (
                                                    <span className="text-muted">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Refunds Section */}
                    <div className="card glass refund-card">
                        <h3>Refund History</h3>
                        {returnData.refunds && returnData.refunds.length > 0 ? (
                            <div className="table-container">
                                <table className="details-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Method</th>
                                            <th>Transaction ID</th>
                                            <th>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {returnData.refunds.map(refund => (
                                            <tr key={refund.id}>
                                                <td>{new Date(refund.created_at).toLocaleDateString()}</td>
                                                <td className="capitalize">{refund.method}</td>
                                                <td>{refund.transaction_id || '-'}</td>
                                                <td className="font-bold">{currency}{Number(refund.amount).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="empty-state">No refunds recorded yet.</p>
                        )}

                        <div className="refund-summary">
                            <div className="summary-row">
                                <span>Total Refund Amount:</span>
                                <span>{currency}{Number(returnData.total_refund_amount).toFixed(2)}</span>
                            </div>
                            <div className="summary-row">
                                <span>Total Refunded:</span>
                                <span className="text-success">{currency}{Number(returnData.total_refunded).toFixed(2)}</span>
                            </div>
                            <div className="summary-row total">
                                <span>Remaining:</span>
                                <span className={!isFullyRefunded ? 'text-warning' : ''}>
                                    {currency}{(Number(returnData.total_refund_amount) - Number(returnData.total_refunded)).toFixed(2)}
                                </span>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            <RefundModal 
                isOpen={isRefundModalOpen}
                onClose={() => setIsRefundModalOpen(false)}
                returnId={returnData.id}
                orderId={returnData.order}
                orderDisplayId={returnData.order_display_id}
                outstandingBalance={(Number(returnData.total_refund_amount) - Number(returnData.total_refunded)).toFixed(2)}
                onRefundComplete={fetchReturnDetails}
            />
        </div>
    );
}
