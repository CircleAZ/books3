import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import { useToast } from '../../context/ToastContext';

import { getStatusClass, formatStatusLabel, STATUS_OPTIONS } from '../../utils/statusUtils';
import GuardedAction from '../../components/GuardedAction';
import './OrderDetails.css';

export default function OrderDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { showToast } = useToast();

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [noteContent, setNoteContent] = useState('');
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusUpdate, setStatusUpdate] = useState({ field: 'order_status', value: '', note: '' });
    const [showShareMenu, setShowShareMenu] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'cash', upi_reference: '', upi_account: '' });
    const [upiAccounts, setUpiAccounts] = useState([]);
    const [paymentSubmitting, setPaymentSubmitting] = useState(false);
    const [paymentError, setPaymentError] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [showDeliveryConfirm, setShowDeliveryConfirm] = useState(false);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [pendingDeliveryUpdate, setPendingDeliveryUpdate] = useState(null);

    const fetchOrderDetails = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}${id}/`);
            if (response.ok) {
                const data = await response.json();
                setOrder(data);
                setError(null);
            } else {
                setError('Failed to fetch order details');
            }
        } catch (err) {
            setError('Error connecting to server');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [id, fetchWithAuth]);

    useEffect(() => {
        fetchOrderDetails();
        
        // Fetch active UPI accounts for payment recording
        const fetchUpiAccounts = async () => {
            try {
                const response = await fetchWithAuth(ENDPOINTS.SETTINGS_UPI_ACCOUNTS);
                if (response.ok) {
                    const data = await response.json();
                    const accounts = data.results || data;
                    setUpiAccounts(accounts.filter(acc => acc.is_active));
                }
            } catch (err) {
                console.error('Failed to fetch UPI accounts:', err);
            }
        };
        fetchUpiAccounts();
    }, [fetchOrderDetails, fetchWithAuth]);

    const handleAddNote = async (e) => {
        e.preventDefault();
        if (!noteContent.trim()) return;

        try {
            const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}${id}/add_note/`, {
                method: 'POST',
                body: JSON.stringify({ content: noteContent })
            });
            if (response.ok) {
                setNoteContent('');
                fetchOrderDetails(); // Refresh to show new note
            }
        } catch (err) {
            console.error('Failed to add note:', err);
        }
    };

    const handleCancelOrder = async () => {
        setShowCancelConfirm(true);
    };

    const confirmCancelOrder = async () => {
        setShowCancelConfirm(false);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}${id}/cancel/`, {
                method: 'POST'
            });
            if (response.ok) {
                fetchOrderDetails();
            } else {
                const data = await response.json();
                showToast(data.error || 'Failed to cancel order', 'error');
            }
        } catch (err) {
            console.error('Error cancelling order:', err);
        }
    };

    const handleApproveCancellation = async () => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}${id}/approve_cancellation/`, {
                method: 'POST'
            });
            if (response.ok) {
                fetchOrderDetails();
            } else {
                const data = await response.json();
                showToast(data.error || 'Failed to approve cancellation', 'error');
            }
        } catch (err) {
            console.error('Error approving cancellation:', err);
        }
    };

    const handleRejectCancellation = async () => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}${id}/reject_cancellation/`, {
                method: 'POST'
            });
            if (response.ok) {
                fetchOrderDetails();
            } else {
                const data = await response.json();
                showToast(data.error || 'Failed to reject cancellation', 'error');
            }
        } catch (err) {
            console.error('Error rejecting cancellation:', err);
        }
    };

    const handleUpdateStatus = async (e) => {
        e.preventDefault();

        // Intercept delivery=delivered for confirmation
        if (statusUpdate.field === 'delivery_status' && statusUpdate.value === 'delivered') {
            setPendingDeliveryUpdate({ ...statusUpdate });
            setShowStatusModal(false);
            setShowDeliveryConfirm(true);
            return;
        }

        try {
            const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}${id}/update_status/`, {
                method: 'POST',
                body: JSON.stringify(statusUpdate)
            });
            if (response.ok) {
                setShowStatusModal(false);
                fetchOrderDetails();
            } else {
                const data = await response.json();
                showToast(data.error || 'Failed to update status', 'error');
            }
        } catch (err) {
            console.error('Error updating status:', err);
        }
    };

    const confirmDelivery = async () => {
        setShowDeliveryConfirm(false);
        if (!pendingDeliveryUpdate) return;
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}${id}/update_status/`, {
                method: 'POST',
                body: JSON.stringify({ ...pendingDeliveryUpdate, confirm: true })
            });
            if (response.ok) {
                fetchOrderDetails();
            } else {
                const data = await response.json();
                showToast(data.error || 'Failed to update delivery status', 'error');
            }
        } catch (err) {
            console.error('Error confirming delivery:', err);
        }
        setPendingDeliveryUpdate(null);
    };

    const openStatusModal = (field, currentValue) => {
        // Block manual payment_status changes
        if (field === 'payment_status') {
            showToast('Payment status is auto-computed and cannot be changed manually.', 'info');
            return;
        }
        setStatusUpdate({ field, value: currentValue, note: '' });
        setShowStatusModal(true);
    };

    const openPaymentModal = () => {
        setPaymentForm({
            amount: order.balance_due > 0 ? Number(order.balance_due).toFixed(2) : '',
            method: 'cash',
            upi_reference: '',
            upi_account: upiAccounts.length > 0 ? upiAccounts[0].upi_id : ''
        });
        setPaymentError('');
        setShowPaymentModal(true);
    };

    const handleRecordPayment = async (e) => {
        e.preventDefault();
        setPaymentSubmitting(true);
        setPaymentError('');
        try {
            const finalUpiReference = paymentForm.method === 'upi' 
                ? (paymentForm.upi_account ? `[${paymentForm.upi_account}] ${paymentForm.upi_reference}`.trim() : paymentForm.upi_reference) 
                : '';

            const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}${id}/add_payment/`, {
                method: 'POST',
                body: JSON.stringify({
                    amount: paymentForm.amount,
                    method: paymentForm.method,
                    upi_reference: finalUpiReference
                })
            });
            if (response.ok) {
                setShowPaymentModal(false);
                fetchOrderDetails();
            } else {
                const data = await response.json();
                setPaymentError(data.error || 'Failed to record payment');
            }
        } catch (err) {
            setPaymentError('Error connecting to server');
            console.error('Error recording payment:', err);
        } finally {
            setPaymentSubmitting(false);
        }
    };

    if (loading) return (
        <div className="order-details-loading">
            <div className="spinner-large"></div>
            <p>Loading order details...</p>
        </div>
    );

    if (error || !order) return (
        <div className="order-details-error card">
            <h2>Error</h2>
            <p>{error || 'Order not found'}</p>
        </div>
    );

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleString();
    };

    return (
        <div className="order-details-container animate-fade-in">
            {/* Header Section */}
            <div className="order-details-header">
                <div className="header-main">
                    <h1>Order #{order.display_id}</h1>
                    <span className={`status-pill ${getStatusClass(order.derived_status)}`}>
                        {order.derived_status}
                    </span>
                    <div className="header-actions">
                        <div className="actions-menu-wrapper">
                            <button
                                className="btn btn-ghost actions-menu-trigger"
                                onClick={() => setShowShareMenu(!showShareMenu)}
                                title="Actions"
                            >
                                ⋮
                            </button>
                            {showShareMenu && (
                                <>
                                    <div className="actions-menu-backdrop" onClick={() => setShowShareMenu(false)} />
                                    <div className="actions-dropdown-menu">
                                        <button
                                            className="actions-menu-item"
                                            onClick={() => {
                                                window.open(`/orders/${id}/receipt`, '_blank');
                                                setShowShareMenu(false);
                                            }}
                                        >
                                            🖨️ Print Receipt
                                        </button>
                                        {order.receipt_uuid && (
                                            <button
                                                className="actions-menu-item"
                                                onClick={() => {
                                                    const pdfUrl = `${window.location.origin}/api/orders/receipts/${order.receipt_uuid}/pdf/`;
                                                    window.open(pdfUrl, '_blank');
                                                    setShowShareMenu(false);
                                                }}
                                            >
                                                📄 Download PDF
                                            </button>
                                        )}
                                        <div className="actions-menu-divider" />
                                        <button
                                            className="actions-menu-item"
                                            onClick={() => {
                                                if (order.receipt_uuid) {
                                                    const url = `${window.location.origin}/r/${order.receipt_uuid}`;
                                                    navigator.clipboard.writeText(url).then(() => {
                                                        showToast('Receipt link copied!', 'success');
                                                    }).catch(() => {
                                                        const ta = document.createElement('textarea');
                                                        ta.value = url;
                                                        ta.style.position = 'fixed';
                                                        ta.style.opacity = '0';
                                                        document.body.appendChild(ta);
                                                        ta.select();
                                                        document.execCommand('copy');
                                                        document.body.removeChild(ta);
                                                        showToast('Receipt link copied!', 'success');
                                                    });
                                                } else {
                                                    showToast('No receipt available.', 'warning');
                                                }
                                                setShowShareMenu(false);
                                            }}
                                        >
                                            📋 Copy Receipt Link
                                        </button>
                                        <button
                                            className="actions-menu-item"
                                            onClick={() => {
                                                const subject = `Receipt for Order #${order.display_id}`;
                                                const body = order.receipt_uuid
                                                    ? `Your receipt: ${window.location.origin}/r/${order.receipt_uuid}`
                                                    : `Receipt for Order #${order.display_id}`;
                                                window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
                                                setShowShareMenu(false);
                                            }}
                                        >
                                            ✉️ Send via Email
                                        </button>
                                        <button
                                            className="actions-menu-item"
                                            onClick={() => {
                                                const text = order.receipt_uuid
                                                    ? `Receipt for Order #${order.display_id}: ${window.location.origin}/r/${order.receipt_uuid}`
                                                    : `Receipt for Order #${order.display_id}`;
                                                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
                                                setShowShareMenu(false);
                                            }}
                                        >
                                            💬 Send via WhatsApp
                                        </button>
                                        <div className="actions-menu-divider" />
                                        {order.can_edit && (
                                            <GuardedAction permission="orders.manage_orders">
                                                <button
                                                    className="actions-menu-item"
                                                    onClick={() => {
                                                        navigate(`/orders/${id}/edit`);
                                                        setShowShareMenu(false);
                                                    }}
                                                >
                                                    ✏️ Edit Order
                                                </button>
                                            </GuardedAction>
                                        )}
                                        {order.delivery_status === 'delivered' && (
                                            <GuardedAction permission="orders.manage_returns">
                                                <button
                                                    className="actions-menu-item"
                                                    onClick={() => {
                                                        navigate(`/returns/new?order=${id}`);
                                                        setShowShareMenu(false);
                                                    }}
                                                >
                                                    ↩️ Initiate Return
                                                </button>
                                            </GuardedAction>
                                        )}
                                        {order.can_cancel && (
                                            <>
                                                <div className="actions-menu-divider" />
                                                <GuardedAction permission="orders.manage_orders">
                                                    <button
                                                        className="actions-menu-item actions-menu-item-danger"
                                                        onClick={() => {
                                                            setShowShareMenu(false);
                                                            handleCancelOrder();
                                                        }}
                                                    >
                                                        ❌ Cancel Order
                                                    </button>
                                                </GuardedAction>
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Cancellation Pending Banner */}
            {order.cancellation_status === 'pending' && (
                <div className="card" style={{ background: 'var(--color-warning-bg, #fff3cd)', border: '1px solid var(--color-warning, #ffc107)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <div>
                        <strong>⚠️ Cancellation Requested</strong>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>This order has a pending cancellation request. Approve to finalize or reject to resume the order.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        <GuardedAction permission="orders.manage_orders">
                            <button className="btn btn-primary btn-sm" onClick={handleApproveCancellation}>✓ Approve</button>
                        </GuardedAction>
                        <GuardedAction permission="orders.manage_orders">
                            <button className="btn btn-ghost btn-sm" onClick={handleRejectCancellation}>✗ Reject</button>
                        </GuardedAction>
                    </div>
                </div>
            )}

            {/* Status Cards Grid */}
            <div className="status-cards-grid">
                <div
                    className={`status-card card ${showHistory ? 'active' : ''}`}
                    onClick={() => setShowHistory(!showHistory)}
                    style={{ cursor: 'pointer' }}
                >
                    <span className="status-label">Overall Status</span>
                    <span className={`status-value status-pill ${getStatusClass(order.derived_status)}`}>{order.derived_status}</span>
                    <span className="update-hint">{showHistory ? 'Hide history' : 'View history'}</span>
                </div>
                <StatusCard
                    label="Order Status"
                    value={formatStatusLabel(order.order_status)}
                    className={getStatusClass(order.order_status)}
                    onUpdate={() => openStatusModal('order_status', order.order_status)}
                />
                <StatusCard
                    label="Payment Status"
                    value={formatStatusLabel(order.payment_status)}
                    className={getStatusClass(order.payment_status)}
                />
                <StatusCard
                    label="Delivery Status"
                    value={formatStatusLabel(order.delivery_status)}
                    className={getStatusClass(order.delivery_status)}
                    onUpdate={() => openStatusModal('delivery_status', order.delivery_status)}
                />
                <StatusCard
                    label="Return"
                    value={formatStatusLabel(order.return_status)}
                    className={getStatusClass(order.return_status)}
                    onUpdate={() => openStatusModal('return_status', order.return_status)}
                    hideIfNA={order.return_status === 'na'}
                />
                <StatusCard
                    label="Refund"
                    value={formatStatusLabel(order.refund_status)}
                    className={getStatusClass(order.refund_status)}
                    onUpdate={() => openStatusModal('refund_status', order.refund_status)}
                    hideIfNA={order.refund_status === 'na'}
                />
                <StatusCard
                    label="Cancellation"
                    value={formatStatusLabel(order.cancellation_status)}
                    className={getStatusClass(order.cancellation_status)}
                    onUpdate={() => openStatusModal('cancellation_status', order.cancellation_status)}
                    hideIfNA={order.cancellation_status === 'na'}
                />
            </div>

            {/* Status History (collapsible) */}
            {showHistory && (
                <div className="card status-history-card animate-slide-in-up">
                    <h3>Status History</h3>
                    <div className="timeline">
                        {order.status_history.length > 0 ? order.status_history.map(history => (
                            <div key={history.id} className="timeline-item">
                                <div className="timeline-marker"></div>
                                <div className="timeline-content">
                                    <div className="timeline-header">
                                        <span className="timeline-field">{history.status_field.replace('_', ' ')}</span>
                                        <span className="timeline-date">{formatDate(history.created_at)}</span>
                                    </div>
                                    <div className="timeline-change">
                                        <span className="old-value">{history.old_value}</span>
                                        <span className="arrow">→</span>
                                        <span className="new-value">{history.new_value}</span>
                                    </div>
                                    {history.note && <p className="timeline-note">"{history.note}"</p>}
                                    <span className="timeline-user">by {history.created_by_name}</span>
                                </div>
                            </div>
                        )) : <p className="empty-state">No history records</p>}
                    </div>
                </div>
            )}

            {/* Customer Card - prominently placed */}
            <div className="card customer-card">
                <h3>Customer</h3>
                <div className="customer-details">
                    <div className="customer-avatar">
                        {order.customer_name?.charAt(0) || 'G'}
                    </div>
                    <div className="customer-info-main">
                        <p className="customer-name-large">{order.customer_name}</p>
                        <p className="customer-type">{order.is_guest ? 'Guest Customer' : 'Registered'}</p>
                    </div>
                    <div className="contact-info" style={{ marginLeft: 'auto' }}>
                        {order.is_guest ? (
                            <>
                                <p><strong>Phone:</strong> {order.guest_phone || '-'}</p>
                                <p><strong>Email:</strong> {order.guest_email || '-'}</p>
                            </>
                        ) : (
                            <p>View full profile <Link to={`/customers/${order.customer}`}>here</Link></p>
                        )}
                    </div>
                </div>
            </div>

            <div className="order-details-grid">
                <div className="main-column">
                    {/* Items Table */}
                    <div className="card order-items-card">
                        <h3>Order Items</h3>
                        <table className="details-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Price</th>
                                    <th>Qty</th>
                                    <th>Discount</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {order.items.map(item => (
                                    <tr key={item.id}>
                                        <td>
                                            <div className="product-info">
                                                <span className="product-name">{item.product_name}</span>
                                                <span className="product-id">#{item.product_display_id}</span>
                                            </div>
                                        </td>
                                        <td>{currency}{Number(item.unit_price).toFixed(2)}</td>
                                        <td>{item.quantity}</td>
                                        <td>
                                            {item.discount_amount > 0 ? (
                                                <span className="discount-tag">-{currency}{Number(item.discount_amount).toFixed(2)}</span>
                                            ) : '-'}
                                        </td>
                                        <td className="font-bold">{currency}{Number(item.line_total).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Payments Table */}
                    <div className="card order-payments-card">
                        <div className="card-header-with-action">
                            <h3>Payments</h3>
                            <div className="payment-summary">
                                <span>Paid: {currency}{Number(order.amount_paid).toFixed(2)}</span>
                                <span className={order.balance_due > 0 ? 'text-danger' : 'text-success'}>
                                    Due: {currency}{Number(order.balance_due).toFixed(2)}
                                </span>
                                {order.balance_due > 0 && (
                                    <GuardedAction permission="orders.manage_orders">
                                        <button className="btn btn-primary btn-sm" onClick={openPaymentModal}>
                                            + Record Payment
                                        </button>
                                    </GuardedAction>
                                )}
                            </div>
                        </div>
                        <table className="details-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Method</th>
                                    <th>Reference</th>
                                    <th>Amount</th>
                                    <th>Collector</th>
                                </tr>
                            </thead>
                            <tbody>
                                {order.payments.length > 0 ? order.payments.map(payment => (
                                    <tr key={payment.id}>
                                        <td>{new Date(payment.created_at).toLocaleDateString()}</td>
                                        <td className="capitalize">{payment.method}</td>
                                        <td>{payment.upi_reference || '-'}</td>
                                        <td className="font-bold">{currency}{Number(payment.amount).toFixed(2)}</td>
                                        <td>{payment.created_by_name}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="5" className="empty-state">No payments recorded</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                </div>

                <div className="side-column">
                    <div className="card summary-card">
                        <h3>Order Summary</h3>
                        <div className="summary-row">
                            <span>Subtotal</span>
                            <span>{currency}{Number(order.subtotal).toFixed(2)}</span>
                        </div>
                        {order.discount_amount > 0 && (
                            <div className="summary-row discount">
                                <span>Discount ({order.discount_type === 'percent' ? `${order.discount_value}%` : 'Fixed'})</span>
                                <span>-{currency}{Number(order.discount_amount).toFixed(2)}</span>
                            </div>
                        )}
                        <div className="summary-row total">
                            <span>Total</span>
                            <span>{currency}{Number(order.total).toFixed(2)}</span>
                        </div>
                        <div className="summary-divider"></div>
                        <div className="summary-row paid">
                            <span>Amount Paid</span>
                            <span>{currency}{Number(order.amount_paid).toFixed(2)}</span>
                        </div>
                        <div className="summary-row due">
                            <span>Balance Due</span>
                            <span className={order.balance_due > 0 ? 'text-danger' : ''}>
                                {currency}{Number(order.balance_due).toFixed(2)}
                            </span>
                        </div>
                        {order.change_due > 0 && (
                            <div className="summary-row" style={{ color: 'var(--color-primary-light)', fontWeight: 600 }}>
                                <span>Change Due</span>
                                <span>{currency}{Number(order.change_due).toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                    {/* Notes Section */}
                    <div className="card notes-card">
                        <h3>Internal Notes</h3>
                        <div className="notes-list">
                            {order.order_notes.length > 0 ? order.order_notes.map(note => (
                                <div key={note.id} className="note-item">
                                    <p className="note-content">{note.content}</p>
                                    <div className="note-meta">
                                        <span>{note.created_by_name}</span>
                                        <span>{new Date(note.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            )) : <p className="empty-state">No notes added</p>}
                        </div>
                        <form className="add-note-form" onSubmit={handleAddNote}>
                            <textarea
                                placeholder="Add a note..."
                                value={noteContent}
                                onChange={(e) => setNoteContent(e.target.value)}
                            />
                            <button type="submit" className="btn btn-primary btn-sm" disabled={!noteContent.trim()}>
                                Add Note
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            {/* Status Update Modal */}
            {showStatusModal && (
                <div className="modal-overlay" onClick={() => setShowStatusModal(false)}>
                    <div className="modal-content animate-slide-in-up" onClick={e => e.stopPropagation()}>
                        <h2>Update {statusUpdate.field.replace('_', ' ')}</h2>
                        <form onSubmit={handleUpdateStatus}>
                            <div className="form-group">
                                <label>New Status</label>
                                <select
                                    value={statusUpdate.value}
                                    onChange={(e) => setStatusUpdate({ ...statusUpdate, value: e.target.value })}
                                    required
                                >
                                    <option value="">Select status...</option>
                                    {(STATUS_OPTIONS[statusUpdate.field] || []).map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Note (Optional)</label>
                                <textarea
                                    placeholder="Reason for change..."
                                    value={statusUpdate.note}
                                    onChange={(e) => setStatusUpdate({ ...statusUpdate, note: e.target.value })}
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowStatusModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Update Status
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {showPaymentModal && (
                <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
                    <div className="modal-content animate-slide-in-up" onClick={e => e.stopPropagation()}>
                        <h2>Record Payment</h2>
                        <div className="payment-modal-summary">
                            <span>Order Total: <strong>{currency}{Number(order.total).toFixed(2)}</strong></span>
                            <span>Balance Due: <strong className="text-danger">{currency}{Number(order.balance_due).toFixed(2)}</strong></span>
                        </div>
                        {paymentError && <div className="payment-error">{paymentError}</div>}
                        <form onSubmit={handleRecordPayment}>
                            <div className="form-group">
                                <label>Amount ({currency})</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    max={Number(order.balance_due)}
                                    value={paymentForm.amount}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label>Payment Method</label>
                                <div className="payment-method-selector">
                                    <button
                                        type="button"
                                        className={`method-btn ${paymentForm.method === 'cash' ? 'active' : ''}`}
                                        onClick={() => setPaymentForm({ ...paymentForm, method: 'cash', upi_reference: '' })}
                                    >
                                        💵 Cash
                                    </button>
                                    <button
                                        type="button"
                                        className={`method-btn ${paymentForm.method === 'upi' ? 'active' : ''}`}
                                        onClick={() => setPaymentForm({ ...paymentForm, method: 'upi' })}
                                    >
                                        📱 UPI
                                    </button>
                                </div>
                            </div>
                            {paymentForm.method === 'upi' && (
                                <>
                                    <div className="form-group">
                                        <label>Credited To (UPI Account)</label>
                                        <select
                                            value={paymentForm.upi_account}
                                            onChange={(e) => setPaymentForm({ ...paymentForm, upi_account: e.target.value })}
                                            required
                                        >
                                            <option value="">-- Select Store UPI Account --</option>
                                            {upiAccounts.map(account => (
                                                <option key={account.id} value={account.upi_id}>
                                                    {account.display_name} ({account.upi_id})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Transaction ID / Reference (Optional)</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. 1234567890"
                                            value={paymentForm.upi_reference}
                                            onChange={(e) => setPaymentForm({ ...paymentForm, upi_reference: e.target.value })}
                                        />
                                    </div>
                                </>
                            )}
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowPaymentModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={paymentSubmitting}>
                                    {paymentSubmitting ? 'Recording...' : 'Record Payment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delivery Confirmation Modal */}
            {showDeliveryConfirm && (
                <div className="modal-overlay" onClick={() => { setShowDeliveryConfirm(false); setPendingDeliveryUpdate(null); }}>
                    <div className="modal-content animate-slide-in-up" onClick={e => e.stopPropagation()}>
                        <h2>⚠️ Confirm Delivery</h2>
                        <p style={{ margin: '1rem 0', lineHeight: 1.6 }}>
                            <strong>Mark this order as delivered?</strong><br />
                            This action <strong>cannot be undone</strong>. Once delivered:
                        </p>
                        <ul style={{ margin: '0 0 1rem 1.5rem', lineHeight: 1.8 }}>
                            <li>The order will be permanently locked</li>
                            <li>Items cannot be edited or cancelled</li>
                            <li>Only Returns & Refunds can be used for corrections</li>
                        </ul>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-ghost" onClick={() => { setShowDeliveryConfirm(false); setPendingDeliveryUpdate(null); }}>
                                Go Back
                            </button>
                            <button type="button" className="btn btn-primary" onClick={confirmDelivery}>
                                Yes, Mark as Delivered
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel Order Confirmation Modal */}
            {showCancelConfirm && (
                <div className="modal-overlay" onClick={() => setShowCancelConfirm(false)}>
                    <div className="modal-content animate-slide-in-up" onClick={e => e.stopPropagation()}>
                        <h2>Cancel Order</h2>
                        <p style={{ margin: '1rem 0', lineHeight: 1.6 }}>
                            Are you sure you want to request cancellation of this order?<br />
                            The order will be marked as <strong>"Cancellation Pending"</strong> and will need to be approved.
                        </p>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-ghost" onClick={() => setShowCancelConfirm(false)}>
                                Go Back
                            </button>
                            <button type="button" className="btn" style={{ background: 'var(--color-danger, #dc3545)', color: 'white' }} onClick={confirmCancelOrder}>
                                Yes, Request Cancellation
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatusCard({ label, value, className, onUpdate, hideIfNA }) {
    if (hideIfNA) return null;
    return (
        <div className={`status-card card ${onUpdate ? '' : 'no-action'}`} onClick={onUpdate} style={onUpdate ? { cursor: 'pointer' } : undefined}>
            <span className="status-label">{label}</span>
            <span className={`status-value status-pill ${className}`}>{value}</span>
            {onUpdate && <span className="update-hint">Click to update</span>}
        </div>
    );
}


