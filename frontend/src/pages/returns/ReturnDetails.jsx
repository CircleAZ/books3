import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
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

    // Refund form state
    const [refundForm, setRefundForm] = useState({
        amount: '',
        method: 'cash',
        transaction_id: '',
        note: ''
    });

    const fetchReturnDetails = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.RETURNS}${id}/`);
            if (response.ok) {
                const data = await response.json();
                setReturnData(data);
                // Pre-fill refund amount with remaining balance
                const remaining = (data.total_refund_amount || 0) - (data.total_refunded || 0);
                setRefundForm(prev => ({
                    ...prev,
                    amount: remaining > 0 ? remaining.toFixed(2) : ''
                }));
                setError(null);
            } else {
                setError('Failed to fetch return details');
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

    const handleAddRefund = async (e) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.RETURNS}${id}/add_refund/`, {
                method: 'POST',
                body: JSON.stringify(refundForm)
            });
            if (response.ok) {
                setRefundForm({
                    amount: '',
                    method: 'cash',
                    transaction_id: '',
                    note: ''
                });
                fetchReturnDetails();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to record refund');
            }
        } catch (err) {
            console.error('Error adding refund:', err);
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
                            <div className="refunds-list">
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

                        {!isFullyRefunded && returnData.status !== 'cancelled' && (
                            <div className="record-refund-form">
                                <h4>Record New Refund</h4>
                                <form onSubmit={handleAddRefund} className="refund-form">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Amount</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                required
                                                value={refundForm.amount}
                                                onChange={e => setRefundForm({ ...refundForm, amount: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Method</label>
                                            <select
                                                value={refundForm.method}
                                                onChange={e => setRefundForm({ ...refundForm, method: e.target.value })}
                                            >
                                                <option value="cash">Cash</option>
                                                <option value="upi">UPI</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Transaction ID (Optional)</label>
                                        <input
                                            type="text"
                                            value={refundForm.transaction_id}
                                            onChange={e => setRefundForm({ ...refundForm, transaction_id: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Note</label>
                                        <textarea
                                            rows="2"
                                            value={refundForm.note}
                                            onChange={e => setRefundForm({ ...refundForm, note: e.target.value })}
                                        ></textarea>
                                    </div>
                                    <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                                        Record Refund
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
