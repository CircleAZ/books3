import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './PublicReceipt.css';

const PublicReceipt = () => {
    const { uuid } = useParams();
    const [receipt, setReceipt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [phone4, setPhone4] = useState('');
    const [verifyError, setVerifyError] = useState('');
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        fetchReceipt();
    }, [uuid]);

    const fetchReceipt = async () => {
        try {
            const response = await fetch(`/api/orders/receipts/${uuid}/`);
            if (!response.ok) throw new Error('Receipt not found');
            const data = await response.json();
            setReceipt(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async () => {
        if (phone4.length !== 4) {
            setVerifyError('Please enter exactly 4 digits');
            return;
        }

        setDownloading(true);
        setVerifyError('');

        try {
            const response = await fetch(`/api/orders/receipts/${uuid}/pdf/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone_last4: phone4 })
            });

            if (response.status === 403) {
                setVerifyError('Phone verification failed. Please check the last 4 digits.');
                return;
            }

            if (!response.ok) throw new Error('Download failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `receipt_${receipt.order_display_id}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
            setShowModal(false);
        } catch (err) {
            setVerifyError(err.message);
        } finally {
            setDownloading(false);
        }
    };

    if (loading) {
        return (
            <div className="public-receipt-page">
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p>Loading receipt...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="public-receipt-page">
                <div className="error-container">
                    <div className="error-icon">❌</div>
                    <h2>Receipt Not Found</h2>
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    const currency = receipt.store?.currency_symbol || '₹';

    return (
        <div className="public-receipt-page">
            <div className="receipt-container">
                {/* Store Header */}
                <div className="store-header">
                    {receipt.store?.logo && (
                        <img src={receipt.store.logo} alt="Store Logo" className="store-logo" />
                    )}
                    <h1 className="store-name">{receipt.store?.name || 'AZ Books'}</h1>
                    {receipt.store?.address && <p className="store-address">{receipt.store.address}</p>}
                    {receipt.store?.phone && <p className="store-phone">📞 {receipt.store.phone}</p>}
                </div>

                {receipt.receipt_header && (
                    <div className="receipt-header-text">{receipt.receipt_header}</div>
                )}

                {/* Order Info */}
                <div className="order-info">
                    <div className="order-number">
                        <span className="label">Receipt #</span>
                        <span className="value">{receipt.order_display_id}</span>
                    </div>
                    <div className="order-date">
                        <span className="label">Date</span>
                        <span className="value">
                            {new Date(receipt.order_date).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </span>
                    </div>
                </div>

                {/* Customer Info */}
                <div className="customer-info">
                    <span className="customer-name">{receipt.customer_name}</span>
                    <span className="customer-phone">{receipt.customer_phone}</span>
                </div>

                {/* Items Table */}
                <div className="items-section">
                    <table className="items-table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Qty</th>
                                <th>Price</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {receipt.items?.map((item, index) => (
                                <tr key={index}>
                                    <td className="item-name">{item.name}</td>
                                    <td className="item-qty">{item.quantity}</td>
                                    <td className="item-price">{currency}{parseFloat(item.price).toFixed(2)}</td>
                                    <td className="item-total">{currency}{parseFloat(item.total).toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Totals */}
                <div className="totals-section">
                    <div className="total-row">
                        <span>Subtotal</span>
                        <span>{currency}{parseFloat(receipt.subtotal || 0).toFixed(2)}</span>
                    </div>
                    {parseFloat(receipt.discount) > 0 && (
                        <div className="total-row discount">
                            <span>Discount</span>
                            <span>-{currency}{parseFloat(receipt.discount).toFixed(2)}</span>
                        </div>
                    )}
                    {parseFloat(receipt.tax) > 0 && (
                        <div className="total-row">
                            <span>Tax</span>
                            <span>{currency}{parseFloat(receipt.tax).toFixed(2)}</span>
                        </div>
                    )}
                    <div className="total-row grand-total">
                        <span>Total</span>
                        <span>{currency}{parseFloat(receipt.total || 0).toFixed(2)}</span>
                    </div>
                    <div className="total-row">
                        <span>Paid</span>
                        <span>{currency}{parseFloat(receipt.paid || 0).toFixed(2)}</span>
                    </div>
                    {parseFloat(receipt.balance) > 0 && (
                        <div className="total-row balance">
                            <span>Balance Due</span>
                            <span>{currency}{parseFloat(receipt.balance).toFixed(2)}</span>
                        </div>
                    )}
                </div>

                {/* Payment Status */}
                <div className="payment-status-container">
                    <span className={`payment-badge ${receipt.payment_status?.toLowerCase()}`}>
                        {receipt.payment_status || 'Pending'}
                    </span>
                </div>

                {/* Download Button */}
                <button className="download-btn" onClick={() => setShowModal(true)}>
                    📄 Download PDF Receipt
                </button>

                {/* Footer */}
                {receipt.receipt_footer && (
                    <div className="receipt-footer">{receipt.receipt_footer}</div>
                )}

                <div className="powered-by">Powered by AZ Books</div>
            </div>

            {/* Verification Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h3>📱 Phone Verification</h3>
                        <p>Enter the last 4 digits of your phone number to download the PDF.</p>

                        <input
                            type="text"
                            value={phone4}
                            onChange={e => setPhone4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            placeholder="Last 4 digits"
                            maxLength={4}
                            className="phone-input"
                            autoFocus
                        />

                        {verifyError && <p className="verify-error">{verifyError}</p>}

                        <div className="modal-buttons">
                            <button className="cancel-btn" onClick={() => setShowModal(false)}>
                                Cancel
                            </button>
                            <button
                                className="verify-btn"
                                onClick={handleDownload}
                                disabled={downloading || phone4.length !== 4}
                            >
                                {downloading ? 'Downloading...' : 'Download PDF'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PublicReceipt;
