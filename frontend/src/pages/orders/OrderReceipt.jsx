import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useStoreSettings } from '../../context/StoreContext';
import { ENDPOINTS } from '../../config/api';
import { useToast } from '../../context/ToastContext';
import './OrderReceipt.css';

export default function OrderReceipt() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { showToast } = useToast();
    const { storeSettings } = useStoreSettings();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const orderRes = await fetchWithAuth(`${ENDPOINTS.ORDERS}${id}/`);

                if (orderRes.ok) {
                    setOrder(await orderRes.json());
                } else {
                    showToast('Failed to load order for receipt', 'error');
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id, fetchWithAuth]);

    const handlePrint = () => window.print();

    const handleShareReceipt = () => {
        if (!order?.receipt_uuid) {
            showToast('Receipt link not available', 'error');
            return;
        }
        const receiptUrl = `${window.location.origin}/r/${order.receipt_uuid}`;
        
        if (navigator.share) {
            navigator.share({
                title: `Receipt #${order.display_id}`,
                text: `AZ Books Receipt #${order.display_id} — ₹${Number(order.total).toFixed(2)}`,
                url: receiptUrl,
            }).catch(() => {});
        } else {
            navigator.clipboard.writeText(receiptUrl).then(() => {
                showToast('Receipt link copied!', 'success');
            }).catch(() => {
                showToast('Could not copy link', 'error');
            });
        }
    };

    const handleOpenPublicReceipt = () => {
        if (order?.receipt_uuid) {
            window.open(`/r/${order.receipt_uuid}`, '_blank');
        }
    };

    if (loading) return <div className="p-5 text-center">Loading receipt...</div>;
    if (!order) return <div className="p-5 text-center text-danger">Order not found</div>;

    const storeName = storeSettings?.store_name || storeSettings?.name || 'AZ Books';
    const storeAddress = storeSettings?.address || '';
    const storePhone = storeSettings?.phone || '';

    return (
        <div className="receipt-container">
            <div className="receipt-actions no-print">
                <button className="btn btn-primary" onClick={handlePrint}>🖨️ Print</button>
                <button className="btn btn-secondary" onClick={handleShareReceipt}>📤 Share Link</button>
                <button className="btn btn-secondary" onClick={handleOpenPublicReceipt}>🧾 Customer View</button>
                <button className="btn btn-ghost" onClick={() => {
                    if (window.history.length > 1) {
                        window.history.back();
                    } else {
                        navigate(`/orders/${id}`);
                    }
                }}>← Close</button>
            </div>

            <div className="receipt-content">
                <header className="receipt-header">
                    <h1>{storeName}</h1>
                    {storeAddress && <p>{storeAddress}</p>}
                    {storePhone && <p>Phone: {storePhone}</p>}
                    <div className="receipt-meta">
                        <p><strong>Order #{order.display_id}</strong></p>
                        <p>Date: {new Date(order.created_at).toLocaleString('en-IN')}</p>
                    </div>
                </header>

                <div className="customer-section">
                    <p><strong>Customer:</strong> {order.is_guest ? (order.guest_name || 'Guest') : order.customer_name}</p>
                    {order.customer_phone && <p>Phone: {order.customer_phone}</p>}
                </div>

                <table className="receipt-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th className="text-right">Qty</th>
                            <th className="text-right">Price</th>
                            <th className="text-right">Disc.</th>
                            <th className="text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {order.items.map((item, idx) => {
                            const hasDiscount = Number(item.discount_amount) > 0;
                            return (
                                <tr key={idx}>
                                    <td>{item.product_name}</td>
                                    <td className="text-right">{item.quantity}</td>
                                    <td className="text-right">{currency}{Number(item.unit_price).toFixed(2)}</td>
                                    <td className="text-right">
                                        {hasDiscount
                                            ? `-${currency}${Number(item.discount_amount).toFixed(2)}`
                                            : '-'
                                        }
                                    </td>
                                    <td className="text-right">{currency}{Number(item.line_total).toFixed(2)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                <div className="receipt-totals">
                    <div className="total-row">
                        <span>Subtotal:</span>
                        <span>{currency}{Number(order.subtotal).toFixed(2)}</span>
                    </div>
                    {order.discount_amount > 0 && (
                        <div className="total-row">
                            <span>Discount:</span>
                            <span>-{currency}{Number(order.discount_amount).toFixed(2)}</span>
                        </div>
                    )}
                    <div className="total-row grand-total">
                        <span>Total:</span>
                        <span>{currency}{Number(order.total).toFixed(2)}</span>
                    </div>
                    <div className="total-row">
                        <span>Paid:</span>
                        <span>{currency}{Number(order.amount_paid).toFixed(2)}</span>
                    </div>
                    {Number(order.balance_due) > 0 && (
                        <div className="total-row balance-due">
                            <span>Balance Due:</span>
                            <span>{currency}{Number(order.balance_due).toFixed(2)}</span>
                        </div>
                    )}
                </div>

                {/* Payment History */}
                {order.payments && order.payments.length > 0 && (
                    <div className="payment-history-section">
                        <h3>Payment History</h3>
                        <table className="receipt-table payment-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Method</th>
                                    <th className="text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {order.payments.map((p, i) => (
                                    <tr key={i}>
                                        <td>{new Date(p.created_at).toLocaleDateString('en-IN')}</td>
                                        <td>{p.method_display || p.method}</td>
                                        <td className="text-right">{currency}{Number(p.amount).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <footer className="receipt-footer">
                    <p>Thank you for shopping with us!</p>
                </footer>
            </div>
        </div>
    );
}
