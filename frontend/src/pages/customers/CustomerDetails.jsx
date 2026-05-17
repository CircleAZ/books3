import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import MapComponent from '../../components/MapComponent';
import './CustomerDetails.css';

import '../../styles/components/form-layout.css';
import '../../styles/components/modal-system.css';
const CustomerDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { showToast } = useToast();

    const [customer, setCustomer] = useState(null);
    const [wallet, setWallet] = useState(null);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lightboxPhoto, setLightboxPhoto] = useState(null);

    // Link Management State
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [linkTypes, setLinkTypes] = useState([]);
    const [linkFormData, setLinkFormData] = useState({ target_customer: '', link_type: '' });
    const [customerSearchResults, setCustomerSearchResults] = useState([]);
    const [linkSearch, setLinkSearch] = useState('');

    // Withdrawal State
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [cashWallets, setCashWallets] = useState([]);
    const [withdrawForm, setWithdrawForm] = useState({ amount: '', destination_wallet: '' });
    const [withdrawError, setWithdrawError] = useState('');
    const [isWithdrawing, setIsWithdrawing] = useState(false);

    // Legacy Debt Settlement State
    const [showLegacyDebtModal, setShowLegacyDebtModal] = useState(false);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [legacyDebtForm, setLegacyDebtForm] = useState({ amount: '', destination_wallet: '', destination_bank: '' });
    const [legacyDebtError, setLegacyDebtError] = useState('');
    const [isSettlingDebt, setIsSettlingDebt] = useState(false);

    const fetchData = React.useCallback(async () => {
        setLoading(true);
        try {
            // Fetch customer details, wallet, and orders in parallel
            const [customerRes, walletRes, ordersRes] = await Promise.all([
                fetchWithAuth(`${ENDPOINTS.CUSTOMERS}${id}/`),
                fetchWithAuth(`${ENDPOINTS.CUSTOMERS}${id}/wallet/`),
                fetchWithAuth(`${ENDPOINTS.ORDERS}?customer=${id}`)
            ]);

            if (!customerRes.ok) {
                throw new Error(`Failed to fetch customer: ${customerRes.statusText}`);
            }

            const customerData = await customerRes.json();
            setCustomer(customerData);

            if (walletRes.ok) {
                const walletData = await walletRes.json();
                setWallet(walletData);
            } else {
                console.warn("Could not fetch wallet details");
                setWallet(null);
            }

            if (ordersRes.ok) {
                const ordersData = await ordersRes.json();
                setOrders(ordersData.results || ordersData || []);
            } else {
                console.warn("Could not fetch orders");
                setOrders([]);
            }
        } catch (err) {
            console.error("Error fetching data:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [id, fetchWithAuth]);

    useEffect(() => {
        if (id) {
            fetchData();
        }
    }, [id, fetchData]);

    // Fetch Link Types on mount
    useEffect(() => {
        const fetchLinkTypes = async () => {
            try {
                const res = await fetchWithAuth(ENDPOINTS.CUSTOMERS_LINK_TYPES);
                if (res.ok) {
                    const data = await res.json();
                    setLinkTypes(data.results || data);
                }
            } catch (e) { console.error("Failed to load link types", e); }
        };
        fetchLinkTypes();
    }, [fetchWithAuth]);

    // Search customers for linking
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (linkSearch.length > 2) {
                try {
                    const res = await fetchWithAuth(`${ENDPOINTS.CUSTOMERS}?search=${linkSearch}`);
                    if (res.ok) {
                        const data = await res.json();
                        setCustomerSearchResults((data.results || data || []).filter(c => c.id !== id));
                    }
                } catch (e) { }
            } else {
                setCustomerSearchResults([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [linkSearch, fetchWithAuth, id]);

    const handleAddLink = async (e) => {
        e.preventDefault();
        try {
            const res = await fetchWithAuth(ENDPOINTS.CUSTOMERS_LINKS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customer_a: id,
                    customer_b: linkFormData.target_customer,
                    link_type: linkFormData.link_type
                })
            });
            if (res.ok) {
                setIsLinkModalOpen(false);
                setLinkFormData({ target_customer: '', link_type: '' });
                setLinkSearch('');
                fetchData(); // Refresh data
            } else {
                const errData = await res.json().catch(() => null);
                const msg = errData?.non_field_errors?.[0] || errData?.detail || JSON.stringify(errData) || 'Failed to create link';
                showToast(msg, 'error');
            }
        } catch (e) { showToast("Error creating link", 'error'); }
    };

    const handleDeleteLink = async (linkId, e) => {
        e.stopPropagation(); // Prevent navigation
        if (!window.confirm("Remove this link?")) return;
        try {
            await fetchWithAuth(`${ENDPOINTS.CUSTOMERS_LINKS}${linkId}/`, { method: 'DELETE' });
            fetchData(); // Refresh data
        } catch (e) { showToast("Error removing link", 'error'); }
    };

    const handleOpenWithdraw = async () => {
        setShowWithdrawModal(true);
        setWithdrawError('');
        setWithdrawForm({ amount: '', destination_wallet: '' });
        try {
            const res = await fetchWithAuth(ENDPOINTS.FINANCE_CASH_WALLETS);
            if (res.ok) {
                const data = await res.json();
                const active = data.filter(w => w.is_active);
                setCashWallets(active);
                if (active.length > 0) {
                    setWithdrawForm(prev => ({ ...prev, destination_wallet: active[0].id }));
                }
            }
        } catch (e) { console.error("Error fetching cash wallets", e); }
    };

    const handleWithdraw = async (e) => {
        e.preventDefault();
        setIsWithdrawing(true);
        setWithdrawError('');
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.CUSTOMERS}${id}/withdraw_wallet/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(withdrawForm)
            });
            if (res.ok) {
                setShowWithdrawModal(false);
                fetchData();
                showToast("Withdrawal successful.", 'success');
            } else {
                const err = await res.json();
                setWithdrawError(err.error || 'Withdrawal failed');
            }
        } catch (error) {
            setWithdrawError("Network error occurred.");
        } finally {
            setIsWithdrawing(false);
        }
    };

    const handleOpenLegacyDebt = async () => {
        setShowLegacyDebtModal(true);
        setLegacyDebtError('');
        setLegacyDebtForm({ amount: '', destination_wallet: '', destination_bank: '' });
        try {
            const [walletsRes, banksRes] = await Promise.all([
                fetchWithAuth(ENDPOINTS.FINANCE_CASH_WALLETS),
                fetchWithAuth(ENDPOINTS.FINANCE_BANK_ACCOUNTS)
            ]);
            
            if (walletsRes.ok) {
                const data = await walletsRes.json();
                const active = data.filter(w => w.is_active);
                setCashWallets(active);
                if (active.length > 0) {
                    setLegacyDebtForm(prev => ({ ...prev, destination_wallet: active[0].id }));
                }
            }
            if (banksRes.ok) {
                const data = await banksRes.json();
                const active = data.filter(b => b.is_active);
                setBankAccounts(active);
            }
        } catch (e) { console.error("Error fetching financial accounts", e); }
    };

    const handleSettleLegacyDebt = async (e) => {
        e.preventDefault();
        
        if (!legacyDebtForm.destination_wallet && !legacyDebtForm.destination_bank) {
            setLegacyDebtError('Please select a destination account for the funds.');
            return;
        }

        setIsSettlingDebt(true);
        setLegacyDebtError('');
        
        const payload = {
            amount: legacyDebtForm.amount,
            is_fresh_cash: true,
            destination_wallet_id: legacyDebtForm.destination_wallet || null,
            destination_bank_id: legacyDebtForm.destination_bank || null
        };

        try {
            const res = await fetchWithAuth(`${ENDPOINTS.LEGACY_DEBT}${customer.legacy_debt_id}/allocate_payment/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setShowLegacyDebtModal(false);
                fetchData();
                showToast("Legacy debt settled and funds deposited to ledger.", 'success');
            } else {
                const err = await res.json();
                setLegacyDebtError(err.detail || 'Settlement failed');
            }
        } catch (error) {
            setLegacyDebtError("Network error occurred.");
        } finally {
            setIsSettlingDebt(false);
        }
    };

    if (loading && !customer) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
                <p>Loading customer details...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="error-container">
                <p className="error-message">Error: {error}</p>
            </div>
        );
    }

    if (!customer) return null;

    return (
        <div className="customer-details-container animate-fade-in">
            {/* Header Section */}
            <div className="customer-details-header">
                <div className="customer-details-title">
                    <h1>{customer.full_name}</h1>
                    <span className="customer-id">ID: {customer.display_id || customer.id}</span>
                </div>
                <div className="customer-details-actions">
                    <button className="btn btn-primary" onClick={() => navigate(`/customers/${id}/edit`)}>
                        Edit Customer
                    </button>
                </div>
            </div>

            <div className="customer-sections-grid">

                {/* Contact Section */}
                <div className="customer-section">
                    <div className="customer-section-header">
                        <h3>Contact Information</h3>
                    </div>
                    <div className="customer-section-content">
                        <div className="contact-item">
                            <span className="contact-label">Phone</span>
                            <span className="contact-value">
                                <a href={`tel:${customer.phone}`}>{customer.phone}</a>
                            </span>
                        </div>
                        <div className="contact-item">
                            <span className="contact-label">Email</span>
                            <span className="contact-value">
                                {customer.email ? (
                                    <a href={`mailto:${customer.email}`}>{customer.email}</a>
                                ) : (
                                    <span className="text-muted">Not provided</span>
                                )}
                            </span>
                        </div>
                        {customer.customer_group && (
                            <div className="contact-item">
                                <span className="contact-label">Group</span>
                                <span className="contact-value">{customer.customer_group.name}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Education Section */}
                <div className="customer-section">
                    <div className="customer-section-header">
                        <h3>Students & Education</h3>
                    </div>
                    <div className="customer-section-content" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {customer.students && customer.students.length > 0 ? (
                            customer.students.map((student, idx) => (
                                <div key={student.id || idx} className="student-details-card" style={{ padding: '1rem', border: '1px solid var(--color-border)', borderRadius: '6px', backgroundColor: 'var(--color-bg-secondary)' }}>
                                    <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--color-primary)' }}>{student.name}</h4>
                                    <div className="info-row">
                                        <span className="info-label">School</span>
                                        <span className="info-value">
                                            {student.school_name || (student.class_name ? <span className="text-muted" style={{ fontStyle: 'italic' }}>Independent</span> : <span className="text-muted">-</span>)}
                                        </span>
                                    </div>
                                    <div className="info-row">
                                        <span className="info-label">Class</span>
                                        <span className="info-value">{student.class_name_display || <span className="text-muted">-</span>}</span>
                                    </div>
                                    <div className="info-row">
                                        <span className="info-label">Division</span>
                                        <span className="info-value">{student.division_name_display || <span className="text-muted">-</span>}</span>
                                    </div>
                                    <div className="info-row">
                                        <span className="info-label">Subdivision</span>
                                        <span className="info-value">{student.subdivision_name_display || <span className="text-muted">-</span>}</span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <span className="text-muted" style={{ padding: '0.5rem 1rem' }}>No student records found.</span>
                        )}
                    </div>
                </div>

                {/* Addresses Section */}
                <div className="customer-section" style={{ gridRow: 'span 2' }}>
                    <div className="customer-section-header">
                        <h3>Addresses ({customer.addresses?.length || 0})</h3>
                    </div>
                    <div className="customer-section-content">
                        {customer.addresses && customer.addresses.length > 0 ? (
                            customer.addresses.map(addr => (
                                <div key={addr.id} className="address-card">
                                    {addr.latitude && addr.longitude && (
                                        <div style={{ marginBottom: '10px', height: '150px' }}>
                                            <MapComponent
                                                position={[parseFloat(addr.latitude), parseFloat(addr.longitude)]}
                                                height="150px"
                                                readonly={true}
                                            />
                                        </div>
                                    )}
                                    <div className="address-header">
                                        <div className="flex gap-sm">
                                            {addr.is_primary && <span className="badge">Primary</span>}
                                            {addr.location_tags && addr.location_tags.map(tag => (
                                                <span
                                                    key={tag.id}
                                                    className="location-tag"
                                                    style={{ backgroundColor: tag.color || 'var(--color-primary)' }}
                                                >
                                                    {tag.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="address-text">
                                        {addr.village && <div><strong>Village:</strong> {addr.village}</div>}
                                        {addr.faliya && <div><strong>Faliya:</strong> {addr.faliya}</div>}
                                        {addr.address_line && <div style={{ marginTop: '0.25rem' }}>{addr.address_line}</div>}
                                        {addr.landmark && <div className="text-muted" style={{ fontSize: '0.85em', marginTop: '0.25rem' }}>Near {addr.landmark}</div>}
                                        {addr.pincode && <div style={{ marginTop: '0.25rem' }}>PIN: {addr.pincode}</div>}
                                    </div>
                                    {addr.home_photo && (
                                        <div
                                            style={{
                                                marginTop: '0.75rem',
                                                cursor: 'pointer',
                                                borderRadius: 'var(--radius-md, 8px)',
                                                overflow: 'hidden',
                                                border: '1px solid var(--color-border-light, #e0e0e0)',
                                                position: 'relative',
                                                maxHeight: '180px',
                                            }}
                                            onClick={() => setLightboxPhoto(addr.home_photo)}
                                            title="Click to view full size"
                                        >
                                            <img
                                                src={addr.home_photo}
                                                alt="Customer Home"
                                                style={{
                                                    width: '100%',
                                                    height: '180px',
                                                    objectFit: 'cover',
                                                    display: 'block',
                                                }}
                                            />
                                            <div style={{
                                                position: 'absolute',
                                                bottom: 0,
                                                left: 0,
                                                right: 0,
                                                background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
                                                color: '#fff',
                                                fontSize: '0.75rem',
                                                padding: '12px 8px 6px',
                                                textAlign: 'center',
                                            }}>
                                                📷 Home Photo — Tap to enlarge
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className="text-muted text-center">No addresses found.</p>
                        )}
                    </div>
                </div>

                {/* Customer Links Section */}
                <div className="customer-section">
                    <div className="customer-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>Customer Links</h3>
                        <button className="btn btn-sm btn-outline" onClick={() => setIsLinkModalOpen(true)}>+ Add</button>
                    </div>
                    <div className="customer-section-content">
                        {customer.links && customer.links.length > 0 ? (
                            customer.links.map(link => (
                                <div key={link.link_id} className="customer-link" onClick={() => navigate(`/customers/${link.linked_customer.id || link.linked_customer}`)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div className="link-avatar">
                                            {(link.customer_name || '?').charAt(0)}
                                        </div>
                                        <div className="link-info">
                                            <span className="link-name">{link.customer_name}</span>
                                            <span className="link-relation">{link.relationship}</span>
                                        </div>
                                    </div>
                                    <button
                                        className="btn-icon danger"
                                        onClick={(e) => handleDeleteLink(link.link_id, e)}
                                        title="Remove Link"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))
                        ) : (
                            <p className="text-muted text-center">No related customers.</p>
                        )}
                    </div>
                </div>

                {/* Orders Section */}
                <div className="customer-section" style={{ gridColumn: '1 / -1' }}>
                    <div className="customer-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>Order History ({orders.length})</h3>
                        <button className="btn btn-sm btn-outline" onClick={() => navigate(`/orders?customer=${id}`)}>View All</button>
                    </div>
                    <div className="customer-section-content">
                        {orders.length > 0 ? (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                                            <th style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>Order #</th>
                                            <th style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>Date</th>
                                            <th style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>Total</th>
                                            <th style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>Payment</th>
                                            <th style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orders.slice(0, 10).map(order => (
                                            <tr
                                                key={order.id}
                                                onClick={() => navigate(`/orders/${order.id}`)}
                                                style={{ borderBottom: '1px solid var(--color-border-light)', cursor: 'pointer', transition: 'background 0.15s' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                                                    #{order.display_id}
                                                </td>
                                                <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                                                    {new Date(order.created_at).toLocaleDateString()}
                                                </td>
                                                <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600 }}>
                                                    {currency}{Number(order.total || 0).toFixed(2)}
                                                </td>
                                                <td style={{ padding: '0.6rem 0.75rem' }}>
                                                    <span className={`badge ${order.payment_status === 'paid' ? 'badge-success' : order.payment_status === 'partial' ? 'badge-warning' : 'badge-danger'}`}
                                                        style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '999px', textTransform: 'capitalize' }}>
                                                        {order.payment_status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.6rem 0.75rem' }}>
                                                    <span className={`badge ${order.order_status === 'completed' ? 'badge-success' : order.order_status === 'cancelled' ? 'badge-danger' : 'badge-info'}`}
                                                        style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '999px', textTransform: 'capitalize' }}>
                                                        {order.derived_status || order.order_status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {orders.length > 10 && (
                                    <p style={{ textAlign: 'center', marginTop: '0.75rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                                        Showing 10 of {orders.length} orders. <Link to={`/orders?customer=${id}`} style={{ color: 'var(--color-primary)' }}>View all →</Link>
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="text-muted text-center">No orders found for this customer.</p>
                        )}
                    </div>
                </div>

                {/* Wallet Section */}
                <div className="customer-section" style={{ gridColumn: '1 / -1' }}>
                    <div className="customer-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>Wallet</h3>
                        <div>
                            {wallet?.balance > 0 && (
                                <button className="btn btn-sm btn-outline text-danger" onClick={handleOpenWithdraw} style={{ borderColor: 'var(--color-danger)' }}>
                                    Withdraw Funds
                                </button>
                            )}
                            {customer?.has_legacy_debt && parseFloat(customer.legacy_debt_remaining) > 0 && (
                                <button className="btn btn-sm btn-outline text-success" onClick={handleOpenLegacyDebt} style={{ borderColor: 'var(--color-success)', marginLeft: '1rem' }}>
                                    Settle Legacy Debt
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="customer-section-content">
                        <div className="wallet-balance">
                            <div className="balance-label">Current Balance</div>
                            <div className={`balance-amount ${wallet?.balance < 0 ? 'negative' : ''}`}>
                                {currency}{wallet?.balance || '0.00'}
                            </div>
                        </div>

                        <h4>Recent Transactions</h4>
                        <div className="transaction-list">
                            {wallet?.transactions && wallet.transactions.length > 0 ? (
                                wallet.transactions.map(tx => (
                                    <div key={tx.id} className="transaction-item">
                                        <div>
                                            <span style={{
                                                color: tx.transaction_type === 'credit' ? 'var(--color-success)' : 'var(--color-danger)',
                                                fontWeight: 600,
                                                marginRight: '8px',
                                                textTransform: 'capitalize'
                                            }}>
                                                {tx.transaction_type}
                                            </span>
                                            <span>{tx.reason}</span>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: 600 }}>{currency}{tx.amount}</div>
                                            <div className="transaction-date">
                                                {new Date(tx.created_at).toLocaleDateString()} {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-muted text-center" style={{ marginTop: '1rem' }}>No transactions found.</p>
                            )}
                        </div>
                    </div>
                </div>

            </div>

            {/* Add Link Modal */}
            {isLinkModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>Add Customer Link</h2>
                        <form onSubmit={handleAddLink}>
                            <div className="form-group" style={{ position: 'relative' }}>
                                <label>Search Customer</label>
                                <input
                                    type="text"
                                    value={linkSearch}
                                    onChange={e => setLinkSearch(e.target.value)}
                                    placeholder="Type name..."
                                />
                                {linkSearch && customerSearchResults.length > 0 && (
                                    <ul className="search-results-dropdown" style={{
                                        position: 'absolute',
                                        backgroundColor: 'var(--color-bg-elevated)',
                                        border: '1px solid var(--color-border)',
                                        width: '100%',
                                        zIndex: 1000,
                                        listStyle: 'none',
                                        padding: 0,
                                        margin: 0,
                                        maxHeight: '150px',
                                        overflowY: 'auto',
                                        borderRadius: 'var(--radius-md)',
                                        boxShadow: 'var(--shadow-lg)',
                                        marginTop: '4px'
                                    }}>
                                        {customerSearchResults.map(c => (
                                            <li key={c.id} onClick={() => {
                                                setLinkFormData(p => ({ ...p, target_customer: c.id }));
                                                setLinkSearch(c.full_name);
                                                setCustomerSearchResults([]);
                                            }} style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}>
                                                {c.full_name} ({c.phone})
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <div className="form-group">
                                <label>Relationship (is...)</label>
                                <select
                                    value={linkFormData.link_type}
                                    onChange={e => setLinkFormData(p => ({ ...p, link_type: e.target.value }))}
                                    required
                                >
                                    <option value="">Select Type</option>
                                    {linkTypes.map(lt => (
                                        <option key={lt.id} value={lt.id}>{lt.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setIsLinkModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={!linkFormData.target_customer || !linkFormData.link_type}>Add Link</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Home Photo Lightbox */}
            {lightboxPhoto && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.92)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                    }}
                    onClick={() => setLightboxPhoto(null)}
                >
                    <button
                        onClick={() => setLightboxPhoto(null)}
                        style={{
                            position: 'absolute',
                            top: '16px',
                            right: '16px',
                            background: 'rgba(255,255,255,0.15)',
                            border: 'none',
                            color: '#fff',
                            fontSize: '1.5rem',
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backdropFilter: 'blur(4px)',
                        }}
                    >
                        ✕
                    </button>
                    <img
                        src={lightboxPhoto}
                        alt="Customer Home — Full Size"
                        style={{
                            maxWidth: '95vw',
                            maxHeight: '90vh',
                            objectFit: 'contain',
                            borderRadius: '8px',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            {/* Withdraw Modal */}
            {showWithdrawModal && (
                <div className="modal-overlay" onClick={() => setShowWithdrawModal(false)}>
                    <div className="modal-content animate-slide-in-up" onClick={e => e.stopPropagation()}>
                        <h2>Withdraw Funds</h2>
                        <p className="text-muted" style={{ marginBottom: '1rem' }}>
                            Current Balance: <strong>{currency}{wallet?.balance}</strong>
                        </p>
                        {withdrawError && <div className="payment-error text-danger" style={{ marginBottom: '1rem' }}>{withdrawError}</div>}
                        <form onSubmit={handleWithdraw}>
                            <div className="form-group">
                                <label>Amount to Withdraw ({currency})</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    max={wallet?.balance}
                                    value={withdrawForm.amount}
                                    onChange={e => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                                    className="form-control"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label>Source Physical Cash Wallet</label>
                                <select
                                    className="form-control"
                                    value={withdrawForm.destination_wallet}
                                    onChange={e => setWithdrawForm({ ...withdrawForm, destination_wallet: e.target.value })}
                                    required
                                >
                                    <option value="">-- Select Cash Drawer --</option>
                                    {cashWallets.map(w => (
                                        <option key={w.id} value={w.id}>{w.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowWithdrawModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-danger" disabled={isWithdrawing || !withdrawForm.amount || !withdrawForm.destination_wallet}>
                                    {isWithdrawing ? 'Processing...' : 'Confirm Withdrawal'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Legacy Debt Settle Modal */}
            {showLegacyDebtModal && (
                <div className="modal-overlay" onClick={() => setShowLegacyDebtModal(false)}>
                    <div className="modal-content animate-slide-in-up" onClick={e => e.stopPropagation()}>
                        <h2>Settle Legacy Debt</h2>
                        <p className="text-muted" style={{ marginBottom: '1rem' }}>
                            Remaining Debt: <strong>{currency}{customer?.legacy_debt_remaining}</strong>
                        </p>
                        {legacyDebtError && <div className="payment-error text-danger" style={{ marginBottom: '1rem' }}>{legacyDebtError}</div>}
                        <form onSubmit={handleSettleLegacyDebt}>
                            <div className="form-group">
                                <label>Amount Received ({currency})</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    max={customer?.legacy_debt_remaining}
                                    value={legacyDebtForm.amount}
                                    onChange={e => setLegacyDebtForm({ ...legacyDebtForm, amount: e.target.value })}
                                    className="form-control"
                                    required
                                    autoFocus
                                />
                            </div>
                            
                            <div className="form-row">
                                <div className="form-group col-6">
                                    <label>Deposit to Cash Wallet</label>
                                    <select
                                        className="form-control"
                                        value={legacyDebtForm.destination_wallet}
                                        onChange={e => setLegacyDebtForm({ ...legacyDebtForm, destination_wallet: e.target.value, destination_bank: '' })}
                                        disabled={!!legacyDebtForm.destination_bank}
                                    >
                                        <option value="">-- None --</option>
                                        {cashWallets.map(w => (
                                            <option key={w.id} value={w.id}>{w.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group col-6">
                                    <label>Or Bank Account</label>
                                    <select
                                        className="form-control"
                                        value={legacyDebtForm.destination_bank}
                                        onChange={e => setLegacyDebtForm({ ...legacyDebtForm, destination_bank: e.target.value, destination_wallet: '' })}
                                        disabled={!!legacyDebtForm.destination_wallet}
                                    >
                                        <option value="">-- None --</option>
                                        {bankAccounts.map(b => (
                                            <option key={b.id} value={b.id}>{b.bank_name} - {b.account_number.slice(-4)}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            
                            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowLegacyDebtModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-success" disabled={isSettlingDebt || !legacyDebtForm.amount || (!legacyDebtForm.destination_wallet && !legacyDebtForm.destination_bank)}>
                                    {isSettlingDebt ? 'Processing...' : 'Settle Debt'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomerDetails;