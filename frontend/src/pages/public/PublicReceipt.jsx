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
        viewCatalogue: 'અમારું કેટલોગ જુઓ',
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
        viewCatalogue: 'हमारी कैटलॉग देखें',
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
        viewCatalogue: 'View Our Catalogue',
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

    /* Live balance and PDF generation have been removed as per user requirements. */

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
    const balance = parseFloat(receipt.balance ?? 0);
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
                    {receipt.store?.logo ? (
                        <img src={receipt.store.logo} alt={receipt.store.name} className="store-logo" />
                    ) : (
                        <h1 className="store-name">{receipt.store?.name || 'AZ Books'}</h1>
                    )}
                    {receipt.store?.phone && (
                        <p className="store-phone">
                            📞 <a href={`tel:${receipt.store.phone}`}>{receipt.store.phone}</a>
                        </p>
                    )}
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
                {receipt.payments && receipt.payments.length > 0 && (
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
                )}

                {/* Catalogue Link */}
                <div className="catalogue-link-container">
                    <a 
                        href={receipt.store?.website || 'https://circleaz.in'} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="catalogue-link"
                    >
                        📚 {t.viewCatalogue}
                    </a>
                </div>
            </div>
        </div>
    );
};

export default PublicReceipt;
