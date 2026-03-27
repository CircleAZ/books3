import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import './PublicReceipt.css';

/* ── i18n strings ── */
const STRINGS = {
    gu: {
        receipt: 'રસીદ',
        date: 'તારીખ',
        customer: 'ગ્રાહક',
        item: 'આઇટમ',
        qty: 'જથ્થો',
        price: 'ભાવ',
        total: 'કુલ',
        subtotal: 'પેટા કુલ',
        discount: 'ડિસ્કાઉન્ટ',
        grandTotal: 'કુલ રકમ',
        paid: 'ચૂકવેલ',
        balance: 'બાકી રકમ',
        paymentHistory: 'ચુકવણી ઇતિહાસ',
        payDate: 'તારીખ',
        method: 'પદ્ધતિ',
        amount: 'રકમ',
        payNow: 'હમણાં ચૂકવો',
        downloadPdf: 'PDF ડાઉનલોડ કરો',
        loading: 'રસીદ લોડ થઈ રહી છે...',
        notFound: 'રસીદ મળી નથી',
        noPayments: 'હજુ સુધી કોઈ ચુકવણી નથી',
        poweredBy: 'AZ Books દ્વારા સંચાલિત',
        Cash: 'રોકડ',
        UPI: 'UPI',
    },
    hi: {
        receipt: 'रसीद',
        date: 'तारीख',
        customer: 'ग्राहक',
        item: 'आइटम',
        qty: 'मात्रा',
        price: 'कीमत',
        total: 'कुल',
        subtotal: 'उप कुल',
        discount: 'छूट',
        grandTotal: 'कुल राशि',
        paid: 'भुगतान',
        balance: 'बकाया राशि',
        paymentHistory: 'भुगतान इतिहास',
        payDate: 'तारीख',
        method: 'तरीका',
        amount: 'राशि',
        payNow: 'अभी भुगतान करें',
        downloadPdf: 'PDF डाउनलोड करें',
        loading: 'रसीद लोड हो रही है...',
        notFound: 'रसीद नहीं मिली',
        noPayments: 'अभी तक कोई भुगतान नहीं',
        poweredBy: 'AZ Books द्वारा संचालित',
        Cash: 'नकद',
        UPI: 'UPI',
    },
    en: {
        receipt: 'Receipt',
        date: 'Date',
        customer: 'Customer',
        item: 'Item',
        qty: 'Qty',
        price: 'Price',
        total: 'Total',
        subtotal: 'Subtotal',
        discount: 'Discount',
        grandTotal: 'Grand Total',
        paid: 'Paid',
        balance: 'Balance Due',
        paymentHistory: 'Payment History',
        payDate: 'Date',
        method: 'Method',
        amount: 'Amount',
        payNow: 'Pay Now',
        downloadPdf: 'Download PDF',
        loading: 'Loading receipt...',
        notFound: 'Receipt Not Found',
        noPayments: 'No payments yet',
        poweredBy: 'Powered by AZ Books',
        Cash: 'Cash',
        UPI: 'UPI',
    },
};

const LANG_LABELS = { gu: 'ગુજ', hi: 'हिं', en: 'EN' };

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const PublicReceipt = () => {
    const { uuid } = useParams();
    const [receipt, setReceipt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lang, setLang] = useState('gu');
    const [pdfLoading, setPdfLoading] = useState(false);
    const [liveBalance, setLiveBalance] = useState(null);
    const receiptRef = useRef(null);

    const t = STRINGS[lang];

    useEffect(() => {
        fetchReceipt();
    }, [uuid]);

    const fetchReceipt = async () => {
        try {
            const response = await fetch(`${API_BASE}/orders/receipts/${uuid}/`);
            if (!response.ok) throw new Error('Receipt not found');
            const data = await response.json();
            setReceipt(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    /* Fetch live balance before Pay Now (never cached) */
    const fetchLiveBalance = async () => {
        try {
            const res = await fetch(`${API_BASE}/orders/receipts/${uuid}/balance/`);
            if (!res.ok) return null;
            const data = await res.json();
            setLiveBalance(data.balance);
            return data.balance;
        } catch {
            return null;
        }
    };

    /* UPI deep link: upi://pay?pa=VPA&pn=Name&am=Amount&cu=INR */
    const handlePayNow = async () => {
        const balance = await fetchLiveBalance();
        if (!balance || parseFloat(balance) <= 0) return;
        
        const storeName = receipt.store?.name || 'AZ Books';
        // TODO: Set actual UPI VPA in StoreSettings
        const vpa = receipt.store?.upi_vpa || 'azbooks@upi';
        const upiUrl = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(storeName)}&am=${balance}&cu=INR&tn=Receipt%23${receipt.display_id}`;
        window.location.href = upiUrl;
    };

    /* Client-side PDF via html2pdf.js */
    const handleDownloadPdf = async () => {
        if (!receiptRef.current) return;
        setPdfLoading(true);
        try {
            const html2pdf = (await import('html2pdf.js')).default;
            const element = receiptRef.current;
            
            // Hide buttons before printing
            const buttons = element.querySelectorAll('.receipt-actions, .lang-toggle');
            buttons.forEach(b => b.style.display = 'none');

            await html2pdf()
                .set({
                    margin: [10, 8, 10, 8],
                    filename: `Receipt_${receipt.display_id}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true },
                    jsPDF: { unit: 'mm', format: 'a5', orientation: 'portrait' },
                })
                .from(element)
                .save();

            // Restore buttons
            buttons.forEach(b => b.style.display = '');
        } catch (err) {
            console.error('PDF generation failed:', err);
        } finally {
            setPdfLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="public-receipt-page">
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p>{STRINGS[lang].loading}</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="public-receipt-page">
                <div className="error-container">
                    <div className="error-icon">❌</div>
                    <h2>{STRINGS[lang].notFound}</h2>
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    const currency = receipt.store?.currency_symbol || '₹';
    const balance = parseFloat(liveBalance ?? receipt.balance ?? 0);
    const hasBalance = balance > 0;

    return (
        <div className="public-receipt-page">
            {/* Language Toggle */}
            <div className="lang-toggle">
                {Object.entries(LANG_LABELS).map(([code, label]) => (
                    <button
                        key={code}
                        className={`lang-btn ${lang === code ? 'active' : ''}`}
                        onClick={() => setLang(code)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className="receipt-container" ref={receiptRef}>
                {/* Store Header */}
                <div className="store-header">
                    <h1 className="store-name">{receipt.store?.name || 'AZ Books'}</h1>
                    {receipt.store?.phone && <p className="store-phone">📞 {receipt.store.phone}</p>}
                </div>

                {/* Order Info */}
                <div className="order-info">
                    <div className="order-number">
                        <span className="label">{t.receipt} #</span>
                        <span className="value">{receipt.display_id}</span>
                    </div>
                    <div className="order-date">
                        <span className="label">{t.date}</span>
                        <span className="value">
                            {new Date(receipt.created_at).toLocaleDateString(
                                lang === 'gu' ? 'gu-IN' : lang === 'hi' ? 'hi-IN' : 'en-IN',
                                { day: '2-digit', month: 'short', year: 'numeric' }
                            )}
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
                                <th>{t.item}</th>
                                <th>{t.qty}</th>
                                <th>{t.price}</th>
                                <th>{t.total}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {receipt.items?.map((item, i) => (
                                <tr key={i}>
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
                        <span>{t.subtotal}</span>
                        <span>{currency}{parseFloat(receipt.subtotal || 0).toFixed(2)}</span>
                    </div>
                    {parseFloat(receipt.discount_amount) > 0 && (
                        <div className="total-row discount">
                            <span>{t.discount}</span>
                            <span>-{currency}{parseFloat(receipt.discount_amount).toFixed(2)}</span>
                        </div>
                    )}
                    <div className="total-row grand-total">
                        <span>{t.grandTotal}</span>
                        <span>{currency}{parseFloat(receipt.total || 0).toFixed(2)}</span>
                    </div>
                    <div className="total-row">
                        <span>{t.paid}</span>
                        <span>{currency}{parseFloat(receipt.paid || 0).toFixed(2)}</span>
                    </div>
                    {hasBalance && (
                        <div className="total-row balance-due">
                            <span>{t.balance}</span>
                            <span>{currency}{balance.toFixed(2)}</span>
                        </div>
                    )}
                </div>

                {/* Payment Status Badge */}
                <div className="payment-status-container">
                    <span className={`payment-badge ${receipt.payment_status?.toLowerCase()}`}>
                        {receipt.payment_status?.toUpperCase() || 'PENDING'}
                    </span>
                </div>

                {/* Payment History */}
                {receipt.payments && receipt.payments.length > 0 ? (
                    <div className="payment-history">
                        <h3>{t.paymentHistory}</h3>
                        <table className="payments-table">
                            <thead>
                                <tr>
                                    <th>{t.payDate}</th>
                                    <th>{t.method}</th>
                                    <th>{t.amount}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {receipt.payments.map((p, i) => (
                                    <tr key={i}>
                                        <td>{p.date}</td>
                                        <td>{t[p.method_display] || p.method_display}</td>
                                        <td>{currency}{parseFloat(p.amount).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="payment-history empty">
                        <p className="no-payments">{t.noPayments}</p>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="receipt-actions">
                    {hasBalance && (
                        <button className="pay-now-btn" onClick={handlePayNow}>
                            💳 {t.payNow} — {currency}{balance.toFixed(2)}
                        </button>
                    )}
                    <button 
                        className="download-btn" 
                        onClick={handleDownloadPdf}
                        disabled={pdfLoading}
                    >
                        {pdfLoading ? '⏳...' : `📄 ${t.downloadPdf}`}
                    </button>
                </div>

                <div className="powered-by">{t.poweredBy}</div>
            </div>
        </div>
    );
};

export default PublicReceipt;
