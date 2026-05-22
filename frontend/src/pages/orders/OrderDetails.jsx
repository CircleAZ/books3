import { useState, useEffect, useCallback, useRef } from 'react';
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
    const { fetchWithAuth, rbac } = useAuth();
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
    const [paymentForm, setPaymentForm] = useState({ amount: '', method: '', upi_reference: '', upi_account: '', destination_bank: '', destination_wallet: '' });
    const [upiAccounts, setUpiAccounts] = useState([]);
    const [availablePaymentMethods, setAvailablePaymentMethods] = useState([]);
    const [availableBankAccounts, setAvailableBankAccounts] = useState([]);
    const [availableCashWallets, setAvailableCashWallets] = useState([]);
    const [paymentSubmitting, setPaymentSubmitting] = useState(false);
    const isPaymentSubmitting = useRef(false);
    const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState('');
    const [paymentError, setPaymentError] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    
    // Delivery Modal State
    const [showDeliveryModal, setShowDeliveryModal] = useState(false);
    const [deliveryMode, setDeliveryMode] = useState('all'); // 'all' or 'partial'
    const [deliveryNotes, setDeliveryNotes] = useState('');
    const [partialQuantities, setPartialQuantities] = useState({});
    const [deliverySubmitting, setDeliverySubmitting] = useState(false);

    // Edit Payment Modal State
    const [showEditPaymentModal, setShowEditPaymentModal] = useState(false);
    const [editPaymentData, setEditPaymentData] = useState({ id: '', currentAmount: '', newAmount: '' });
    const [editPaymentSubmitting, setEditPaymentSubmitting] = useState(false);
    const [editPaymentError, setEditPaymentError] = useState('');

    // RBAC for edit payment time restrictions
    const isPrivilegedRole = rbac.role === 'owner' || rbac.role === 'manager' || rbac.is_superuser;

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

        const fetchPaymentSettings = async () => {
            try {
                // Payment Methods
                const response = await fetchWithAuth(ENDPOINTS.SETTINGS_PAYMENT_METHODS);
                if (response.ok) {
                    const data = await response.json();
                    setAvailablePaymentMethods((data.results || data).filter(m => m.is_enabled));
                }

                // Bank Accounts
                const bankRes = await fetchWithAuth(ENDPOINTS.FINANCE_BANK_ACCOUNTS + '?active_only=true');
                if (bankRes.ok) {
                    const bankData = await bankRes.json();
                    setAvailableBankAccounts(bankData.results || bankData);
                }

                // Cash Wallets
                const walletRes = await fetchWithAuth(ENDPOINTS.FINANCE_CASH_WALLETS + '?active_only=true');
                if (walletRes.ok) {
                    const walletData = await walletRes.json();
                    setAvailableCashWallets(walletData.results || walletData);
                }
            } catch (err) {
                console.error('Failed to fetch payment settings:', err);
            }
        };
        fetchPaymentSettings();
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


    const openStatusModal = (field, currentValue) => {
        // Block manual payment_status changes
        if (field === 'payment_status') {
            showToast('Payment status is auto-computed and cannot be changed manually.', 'info');
            return;
        }
        // Block manual delivery_status changes (auto-computed from delivery events)
        if (field === 'delivery_status') {
            showToast('Delivery status is auto-computed. Use "Record Delivery" to update.', 'info');
            return;
        }
        setStatusUpdate({ field, value: currentValue, note: '' });
        setShowStatusModal(true);
    };

    const openDeliveryModal = () => {
        setDeliveryMode('all');
        setDeliveryNotes('');
        
        // Initialize partial quantities with remaining quantities
        const initialQtys = {};
        if (order && order.items) {
            order.items.forEach(item => {
                if (item.remaining_quantity > 0) {
                    initialQtys[item.id] = item.remaining_quantity;
                }
            });
        }
        setPartialQuantities(initialQtys);
        setShowDeliveryModal(true);
    };

    const handleRecordDelivery = async (e) => {
        e.preventDefault();
        setDeliverySubmitting(true);
        
        try {
            const endpoint = deliveryMode === 'all' 
                ? `${ENDPOINTS.ORDERS}${id}/deliver_all/`
                : `${ENDPOINTS.ORDERS}${id}/deliver_partial/`;
                
            let payload = { notes: deliveryNotes };
            
            if (deliveryMode === 'partial') {
                const itemsToDeliver = [];
                Object.entries(partialQuantities).forEach(([itemId, qty]) => {
                    const parsedQty = parseInt(qty, 10);
                    if (parsedQty > 0) {
                        itemsToDeliver.push({
                            order_item: itemId,
                            quantity: parsedQty
                        });
                    }
                });
                
                if (itemsToDeliver.length === 0) {
                    showToast('Please specify at least one item to deliver.', 'error');
                    setDeliverySubmitting(false);
                    return;
                }
                
                payload.items = itemsToDeliver;
            }
            
            const response = await fetchWithAuth(endpoint, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                setShowDeliveryModal(false);
                fetchOrderDetails();
                showToast('Delivery recorded successfully', 'success');
            } else {
                const data = await response.json();
                showToast(data.error || 'Failed to record delivery', 'error');
            }
        } catch (err) {
            console.error('Error recording delivery:', err);
            showToast('Error connecting to server', 'error');
        } finally {
            setDeliverySubmitting(false);
        }
    };

    const isUpiMethod = (method) => {
        if (!method) return false;
        const lower = method.toLowerCase();
        return lower.includes('upi') || lower.includes('gpay') || lower.includes('phonepe') || lower.includes('paytm');
    };

    const openPaymentModal = () => {
        setPaymentForm({
            amount: order.balance_due > 0 ? Number(order.balance_due).toFixed(2) : '',
            method: availablePaymentMethods.length > 0 ? availablePaymentMethods[0].type : '',
            upi_reference: '',
            upi_account: upiAccounts.length > 0 ? upiAccounts[0].upi_id : '',
            destination_wallet: availableCashWallets.length > 0 ? availableCashWallets[0].id : ''
        });
        setPaymentError('');
        setPaymentIdempotencyKey(`pay_${Date.now()}_${Math.random().toString(36).substring(7)}`);
        setShowPaymentModal(true);
    };

    const handleRecordPayment = async (e) => {
        e.preventDefault();
        if (isPaymentSubmitting.current) return;
        isPaymentSubmitting.current = true;
        setPaymentSubmitting(true);
        setPaymentError('');
        try {
            const finalUpiReference = isUpiMethod(paymentForm.method)
                ? (paymentForm.upi_account ? `[${paymentForm.upi_account}] ${paymentForm.upi_reference}`.trim() : paymentForm.upi_reference) 
                : '';

            const isUpi = isUpiMethod(paymentForm.method);
            const isCash = !isUpi && paymentForm.method && paymentForm.method.toLowerCase().includes('cash');

            let resolved_destination_bank = null;
            if (isUpi) {
                const upiObj = upiAccounts.find(u => u.upi_id === paymentForm.upi_account);
                resolved_destination_bank = upiObj ? upiObj.linked_bank_account : null;
            } else if (!isCash) {
                if (paymentForm.method !== 'Customer Wallet') {
                    const methodObj = availablePaymentMethods.find(m => m.type === paymentForm.method);
                    resolved_destination_bank = methodObj ? methodObj.linked_bank_account : null;
                    
                    if (isUpiMethod(paymentForm.method)) {
                        if (!paymentForm.upi_account) {
                            setPaymentError('Please select a Store UPI Account to receive the payment.');
                            return;
                        }
                    } else if (paymentForm.method.toLowerCase().includes('cash')) {
                        if (!paymentForm.destination_wallet) {
                            setPaymentError('Please select a destination cash wallet.');
                            return;
                        }
                    }
                } else {
                    // Customer Wallet Payment
                    const amount = parseFloat(paymentForm.amount);
                    if (amount > parseFloat(order.customer_wallet_balance)) {
                        setPaymentError(`Insufficient Wallet Balance (${currency}${Number(order.customer_wallet_balance).toFixed(2)})`);
                        return;
                    }
                }
            }

            const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}${id}/add_payment/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Idempotency-Key': paymentIdempotencyKey
                },
                body: JSON.stringify({
                    amount: paymentForm.amount,
                    method: paymentForm.method,
                    upi_reference: finalUpiReference,
                    destination_bank: resolved_destination_bank,
                    destination_wallet: isCash ? paymentForm.destination_wallet : null
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
            isPaymentSubmitting.current = false;
            setPaymentSubmitting(false);
        }
    };

    const handleSweepChangeToWallet = async () => {
        if (!window.confirm(`Are you sure you want to sweep ₹${order.change_due} into the customer's wallet instead of returning physical cash?`)) return;
        
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}${id}/add_change_to_wallet/`, {
                method: 'POST'
            });
            if (response.ok) {
                fetchOrderDetails(); 
            } else {
                const err = await response.json();
                showToast(`Error: ${err.error || 'Failed to sweep change to wallet'}`, 'error');
            }
        } catch (error) {
            console.error("Error sweeping change to wallet:", error);
            showToast("Failed to sweep change to wallet", 'error');
        }
    };

    const handleResyncPrice = async (item) => {
        if (!window.confirm(`Are you sure you want to resync the price for ${item.product_name}?\n\nThis will update the line item to use the current market price of the product and immediately recalculate the entire order total.`)) return;

        try {
            const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}${id}/resync_item_price/`, {
                method: 'POST',
                body: JSON.stringify({ order_item_id: item.id })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.old_price === data.new_price) {
                    showToast(`Price is already up to date at ${currency}${Number(data.new_price).toFixed(2)}`, 'info');
                } else {
                    showToast(
                        `Price resynced from ${currency}${Number(data.old_price).toFixed(2)} to ${currency}${Number(data.new_price).toFixed(2)}`,
                        'success'
                    );
                    fetchOrderDetails();
                }
            } else {
                const err = await response.json();
                showToast(`Error: ${err.error || 'Failed to resync price'}`, 'error');
            }
        } catch (error) {
            console.error("Error resyncing price:", error);
            showToast("Failed to resync price", 'error');
        }
    };

    const openEditPaymentModal = (payment) => {
        setEditPaymentData({
            id: payment.id,
            currentAmount: Number(payment.amount).toFixed(2),
            newAmount: Number(payment.amount).toFixed(2)
        });
        setEditPaymentError('');
        setShowEditPaymentModal(true);
    };

    const handleEditPayment = async (e) => {
        e.preventDefault();
        setEditPaymentSubmitting(true);
        setEditPaymentError('');
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}${id}/edit_payment/`, {
                method: 'POST',
                body: JSON.stringify({
                    payment_id: editPaymentData.id,
                    amount: editPaymentData.newAmount
                })
            });
            if (response.ok) {
                setShowEditPaymentModal(false);
                fetchOrderDetails();
                showToast('Payment updated successfully', 'success');
            } else {
                const data = await response.json();
                setEditPaymentError(data.error || 'Failed to update payment');
            }
        } catch (err) {
            setEditPaymentError('Error connecting to server');
            console.error('Error editing payment:', err);
        } finally {
            setEditPaymentSubmitting(false);
        }
    };

    const canEditPayment = (payment) => {
        // Managers/owners can always edit
        if (isPrivilegedRole) return true;
        // Staff/cashier: only within 24 hours
        const paymentAge = Date.now() - new Date(payment.created_at).getTime();
        return paymentAge < 24 * 60 * 60 * 1000;
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
                        {order.receipt_uuid && (
                            <button
                                className="btn btn-primary"
                                style={{ backgroundColor: '#25D366', borderColor: '#25D366', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                onClick={() => {
                                    const text = `Receipt for Order #${order.display_id}: ${window.location.origin}/r/${order.receipt_uuid}`;
                                    const phone = order.customer_phone ? order.customer_phone.replace(/\D/g, '') : '';
                                    const waPhone = phone.length === 10 ? `91${phone}` : phone;
                                    const url = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
                                    window.open(url);
                                }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/>
                                </svg>
                                Share Receipt
                            </button>
                        )}
                        {/* Record Delivery Button */}
                        {order.order_status !== 'draft' && order.order_status !== 'cancelled' && order.delivery_status !== 'delivered' && (
                            <GuardedAction permission="orders.edit_orders">
                                <button className="btn btn-primary" onClick={openDeliveryModal}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    🚚 Record Delivery
                                </button>
                            </GuardedAction>
                        )}
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
                                            <GuardedAction permission="orders.edit_orders">
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
                                                <GuardedAction permission="orders.cancel_orders">
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
                <div className="card" style={{ background: 'var(--color-warning-bg, #fff3cd)', color: '#856404', border: '1px solid var(--color-warning, #ffc107)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <div>
                        <strong>⚠️ Cancellation Requested</strong>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>This order has a pending cancellation request. Approve to finalize or reject to resume the order.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        <GuardedAction permission="orders.cancel_orders">
                            <button className="btn btn-primary btn-sm" onClick={handleApproveCancellation}>✓ Approve</button>
                        </GuardedAction>
                        <GuardedAction permission="orders.cancel_orders">
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
                    value={formatStatusLabel('order_status', order.order_status)}
                    className={getStatusClass(order.order_status)}
                    onUpdate={() => openStatusModal('order_status', order.order_status)}
                />
                <StatusCard
                    label="Payment Status"
                    value={formatStatusLabel('payment_status', order.payment_status)}
                    className={getStatusClass(order.payment_status)}
                />
                <StatusCard
                    label="Delivery Status"
                    value={formatStatusLabel('delivery_status', order.delivery_status)}
                    className={getStatusClass(order.delivery_status)}
                />
                <StatusCard
                    label="Return"
                    value={formatStatusLabel('return_status', order.return_status)}
                    className={getStatusClass(order.return_status)}
                    onUpdate={() => openStatusModal('return_status', order.return_status)}
                    hideIfNA={order.return_status === 'na'}
                />
                <StatusCard
                    label="Refund"
                    value={formatStatusLabel('refund_status', order.refund_status)}
                    className={getStatusClass(order.refund_status)}
                    onUpdate={() => openStatusModal('refund_status', order.refund_status)}
                    hideIfNA={order.refund_status === 'na'}
                />
                <StatusCard
                    label="Cancellation"
                    value={formatStatusLabel('cancellation_status', order.cancellation_status)}
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
                                    <th>Ordered</th>
                                    <th>Delivered</th>
                                    <th>Returned</th>
                                    <th>Remaining</th>
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
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {currency}{Number(item.unit_price).toFixed(2)}
                                                {order.can_edit && order.delivery_status !== 'delivered' && (
                                                    <GuardedAction permission="orders.edit_orders">
                                                        <button 
                                                            className="btn btn-ghost btn-sm" 
                                                            onClick={(e) => { e.stopPropagation(); handleResyncPrice(item); }}
                                                            title="Resync to current market price"
                                                            style={{ padding: '2px 4px', fontSize: '1rem', lineHeight: 1 }}
                                                        >
                                                            🔄
                                                        </button>
                                                    </GuardedAction>
                                                )}
                                            </div>
                                        </td>
                                        <td>{item.confirmed_quantity ?? item.quantity}</td>
                                        <td>
                                            <span style={{
                                                color: item.delivered_quantity > 0 ? 'var(--color-success, #28a745)' : 'inherit',
                                                fontWeight: item.delivered_quantity > 0 ? 600 : 400
                                            }}>
                                                {item.delivered_quantity ?? 0}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{
                                                color: item.returned_quantity > 0 ? 'var(--color-danger, #dc3545)' : 'inherit',
                                                fontWeight: item.returned_quantity > 0 ? 600 : 400
                                            }}>
                                                {item.returned_quantity ?? 0}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{
                                                color: (item.remaining_quantity ?? item.quantity) > 0 ? 'var(--color-warning, #ffc107)' : 'var(--color-success, #28a745)',
                                                fontWeight: 600
                                            }}>
                                                {item.remaining_quantity ?? item.quantity}
                                            </span>
                                        </td>
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
                                <span>Net Paid: {currency}{Number(order.net_paid || order.amount_paid).toFixed(2)}</span>
                                <span className={order.balance_due > 0 ? 'text-danger' : 'text-success'}>
                                    Due: {currency}{Number(order.balance_due).toFixed(2)}
                                </span>
                                {order.balance_due > 0 && (
                                    <GuardedAction permission="orders.manage_payments">
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
                                    <th style={{ width: '50px' }}></th>
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
                                        <td>
                                            {canEditPayment(payment) && (
                                                <GuardedAction permission="orders.manage_payments">
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={(e) => { e.stopPropagation(); openEditPaymentModal(payment); }}
                                                        title="Edit payment amount"
                                                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                                    >
                                                        ✏️
                                                    </button>
                                                </GuardedAction>
                                            )}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="6" className="empty-state">No payments recorded</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Deliveries History */}
                    <div className="card order-deliveries-card">
                        <div className="card-header-with-action">
                            <h3>Deliveries</h3>
                            <div className="payment-summary">
                                <span className={`status-pill ${getStatusClass(order.delivery_status)}`} style={{ fontSize: '0.75rem' }}>
                                    {formatStatusLabel(order.delivery_status)}
                                </span>
                            </div>
                        </div>
                        {order.deliveries && order.deliveries.length > 0 ? (
                            order.deliveries.map((delivery, idx) => (
                                <div key={delivery.id} className="delivery-event" style={{
                                    padding: '0.75rem',
                                    borderBottom: idx < order.deliveries.length - 1 ? '1px solid var(--color-border, #eee)' : 'none'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                            Delivery #{idx + 1}
                                        </span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #888)' }}>
                                            {new Date(delivery.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                    {delivery.delivered_by_name && (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #888)', marginBottom: '0.4rem' }}>
                                            Delivered by: <strong>{delivery.delivered_by_name}</strong>
                                        </div>
                                    )}
                                    {delivery.notes && (
                                        <div style={{ fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-secondary, #888)', marginBottom: '0.4rem' }}>
                                            "{delivery.notes}"
                                        </div>
                                    )}
                                    <table className="details-table" style={{ fontSize: '0.8rem' }}>
                                        <thead>
                                            <tr>
                                                <th>Product</th>
                                                <th>Qty Delivered</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {delivery.items.map(dItem => (
                                                <tr key={dItem.id}>
                                                    <td>{dItem.product_name}</td>
                                                    <td style={{ fontWeight: 600 }}>{dItem.quantity}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ))
                        ) : (
                            <p className="empty-state" style={{ padding: '1rem' }}>No deliveries recorded</p>
                        )}
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
                        {order.returned_value > 0 && (
                            <>
                                <div className="summary-row" style={{ color: 'var(--color-danger)' }}>
                                    <span>Returned Items Value</span>
                                    <span>-{currency}{Number(order.returned_value).toFixed(2)}</span>
                                </div>
                                <div className="summary-row total" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                                    <span>Effective Total</span>
                                    <span>{currency}{Number(order.effective_total).toFixed(2)}</span>
                                </div>
                            </>
                        )}
                        <div className="summary-divider"></div>
                        <div className="summary-row paid">
                            <span>Total Inbound Payments</span>
                            <span>{currency}{Number(order.amount_paid).toFixed(2)}</span>
                        </div>
                        {order.total_refunded > 0 && (
                            <div className="summary-row" style={{ color: 'var(--color-danger)' }}>
                                <span>Refunds Issued</span>
                                <span>-{currency}{Number(order.total_refunded).toFixed(2)}</span>
                            </div>
                        )}
                        <div className="summary-row" style={{ fontWeight: 600 }}>
                            <span>Net Paid</span>
                            <span>{currency}{Number(order.net_paid || order.amount_paid).toFixed(2)}</span>
                        </div>
                        <div className="summary-row due">
                            <span>Balance Due</span>
                            <span className={order.balance_due > 0 ? 'text-danger' : ''}>
                                {currency}{Number(order.balance_due).toFixed(2)}
                            </span>
                        </div>
                        {order.change_due > 0 && (
                            <div className="summary-row" style={{ color: 'var(--color-primary-light)', fontWeight: 600, flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                    <span>Change Due</span>
                                    <span>{currency}{Number(order.change_due).toFixed(2)}</span>
                                </div>
                                <button 
                                    className="btn btn-secondary btn-sm" 
                                    style={{ width: '100%', padding: '4px' }}
                                    onClick={handleSweepChangeToWallet}
                                >
                                    Add Change to Wallet
                                </button>
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
                                <select
                                    className="form-control"
                                    value={paymentForm.method}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value, upi_reference: '' })}
                                    required
                                >
                                    <option value="">-- Select Method --</option>
                                    {availablePaymentMethods.length > 0 ? (
                                        <>
                                            {availablePaymentMethods.map(method => (
                                                <option key={method.id} value={method.type}>{method.type}</option>
                                            ))}
                                            {order.customer_wallet_balance > 0 && (
                                                <option value="Customer Wallet">
                                                    Customer Wallet (Bal: {currency}{Number(order.customer_wallet_balance).toFixed(2)})
                                                </option>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <option value="Cash">Cash</option>
                                            <option value="UPI">UPI</option>
                                            {order.customer_wallet_balance > 0 && (
                                                <option value="Customer Wallet">
                                                    Customer Wallet (Bal: {currency}{Number(order.customer_wallet_balance).toFixed(2)})
                                                </option>
                                            )}
                                        </>
                                    )}
                                </select>
                            </div>

                            {(!isUpiMethod(paymentForm.method) && paymentForm.method && paymentForm.method.toLowerCase().includes('cash') && paymentForm.method !== 'Customer Wallet') && (
                                <div className="form-group">
                                    <label>Destination Wallet</label>
                                    <select
                                        className="form-control"
                                        value={paymentForm.destination_wallet}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, destination_wallet: e.target.value })}
                                        required
                                    >
                                        {availableCashWallets.map(w => (
                                            <option key={w.id} value={w.id}>{w.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {isUpiMethod(paymentForm.method) && (
                                <>
                                    <div className="form-group">
                                        <label>Credited To (UPI Account)</label>
                                        <select
                                            className="form-control"
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
                                            className="form-control"
                                            placeholder="e.g. 1234567890"
                                            value={paymentForm.upi_reference}
                                            onChange={(e) => setPaymentForm({ ...paymentForm, upi_reference: e.target.value })}
                                        />
                                    </div>
                                    {paymentForm.amount > 0 && paymentForm.upi_account && (() => {
                                        const upiUrl = `upi://pay?pa=${paymentForm.upi_account}&pn=AZBooks&am=${paymentForm.amount}&cu=INR`;
                                        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiUrl)}`;
                                        return (
                                            <div className="upi-qr-code text-center my-3">
                                                <img
                                                    src={qrUrl}
                                                    alt="UPI QR Code"
                                                    style={{ border: '1px solid #ddd', borderRadius: '8px', maxWidth: '150px' }}
                                                />
                                                <div className="small text-muted mt-2">Scan to pay {currency}{paymentForm.amount}</div>
                                            </div>
                                        );
                                    })()}
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

            {/* Delivery Modal */}
            {showDeliveryModal && (
                <div className="modal-overlay" onClick={() => setShowDeliveryModal(false)}>
                    <div className="modal-content animate-slide-in-up" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
                        <h2>🚚 Record Delivery</h2>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            <button
                                type="button"
                                className={`btn btn-sm ${deliveryMode === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setDeliveryMode('all')}
                            >
                                Deliver All Remaining
                            </button>
                            <button
                                type="button"
                                className={`btn btn-sm ${deliveryMode === 'partial' ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setDeliveryMode('partial')}
                            >
                                Partial Delivery
                            </button>
                        </div>
                        <form onSubmit={handleRecordDelivery}>
                            {deliveryMode === 'all' ? (
                                <div style={{ padding: '0.75rem', background: 'var(--color-bg-secondary, #f8f9fa)', borderRadius: '8px', marginBottom: '1rem' }}>
                                    <p style={{ margin: 0, fontSize: '0.85rem' }}>
                                        <strong>All remaining items will be marked as delivered:</strong>
                                    </p>
                                    <ul style={{ margin: '0.5rem 0 0 1.25rem', fontSize: '0.85rem', lineHeight: 1.8 }}>
                                        {order.items.filter(i => (i.remaining_quantity ?? i.quantity) > 0).map(item => (
                                            <li key={item.id}>
                                                {item.product_name} — <strong>{item.remaining_quantity ?? item.quantity}</strong> units
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <div style={{ marginBottom: '1rem' }}>
                                    <table className="details-table" style={{ fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr>
                                                <th>Product</th>
                                                <th>Remaining</th>
                                                <th>Deliver Qty</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {order.items.filter(i => (i.remaining_quantity ?? i.quantity) > 0).map(item => (
                                                <tr key={item.id}>
                                                    <td>{item.product_name}</td>
                                                    <td>{item.remaining_quantity ?? item.quantity}</td>
                                                    <td>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max={item.remaining_quantity ?? item.quantity}
                                                            value={partialQuantities[item.id] ?? 0}
                                                            onChange={(e) => setPartialQuantities({
                                                                ...partialQuantities,
                                                                [item.id]: e.target.value
                                                            })}
                                                            style={{ width: '70px', textAlign: 'center' }}
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <div className="form-group">
                                <label>Notes (Optional)</label>
                                <textarea
                                    placeholder="e.g. Driver name, vehicle, delivery notes..."
                                    value={deliveryNotes}
                                    onChange={(e) => setDeliveryNotes(e.target.value)}
                                />
                            </div>
                            <div style={{ padding: '0.75rem', background: 'var(--color-warning-bg, #fff3cd)', color: '#856404', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.8rem' }}>
                                ⚠️ <strong>This action cannot be undone.</strong> Delivered quantities are permanently recorded.
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowDeliveryModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={deliverySubmitting}>
                                    {deliverySubmitting ? 'Recording...' : (deliveryMode === 'all' ? 'Deliver All' : 'Record Partial Delivery')}
                                </button>
                            </div>
                        </form>
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

            {/* Edit Payment Modal */}
            {showEditPaymentModal && (
                <div className="modal-overlay" onClick={() => setShowEditPaymentModal(false)}>
                    <div className="modal-content animate-slide-in-up" onClick={e => e.stopPropagation()}>
                        <h2>Edit Payment</h2>
                        <div className="payment-modal-summary">
                            <span>Current Amount: <strong>{currency}{editPaymentData.currentAmount}</strong></span>
                        </div>
                        {editPaymentError && <div className="payment-error">{editPaymentError}</div>}
                        <form onSubmit={handleEditPayment}>
                            <div className="form-group">
                                <label>New Amount ({currency})</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    value={editPaymentData.newAmount}
                                    onChange={(e) => setEditPaymentData({ ...editPaymentData, newAmount: e.target.value })}
                                    required
                                    autoFocus
                                />
                            </div>
                            {editPaymentData.newAmount && editPaymentData.currentAmount !== editPaymentData.newAmount && (
                                <div style={{
                                    padding: '0.75rem',
                                    background: Number(editPaymentData.newAmount) < Number(editPaymentData.currentAmount)
                                        ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                    borderRadius: '8px',
                                    marginBottom: '1rem',
                                    fontSize: '0.85rem',
                                    color: Number(editPaymentData.newAmount) < Number(editPaymentData.currentAmount)
                                        ? '#ef4444' : '#10b981'
                                }}>
                                    {Number(editPaymentData.newAmount) < Number(editPaymentData.currentAmount)
                                        ? `↓ Reducing by ${currency}${(Number(editPaymentData.currentAmount) - Number(editPaymentData.newAmount)).toFixed(2)}`
                                        : `↑ Increasing by ${currency}${(Number(editPaymentData.newAmount) - Number(editPaymentData.currentAmount)).toFixed(2)}`
                                    }
                                </div>
                            )}
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowEditPaymentModal(false)}>
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={editPaymentSubmitting || editPaymentData.newAmount === editPaymentData.currentAmount}
                                >
                                    {editPaymentSubmitting ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
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


