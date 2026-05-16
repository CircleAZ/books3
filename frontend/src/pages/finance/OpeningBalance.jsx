import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import './OpeningBalance.css';
import '../../styles/components/form-layout.css';

/**
 * OpeningBalance — Admin-only one-time data migration page.
 * Records pre-system stock counts and opening cash capital.
 *
 * Three-step wizard:
 *   1. Configure (label, date, cash, wallet)
 *   2. Stock Entry (bulk quantity grid grouped by category)
 *   3. Review & Submit
 */
export default function OpeningBalance() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();

    // Wizard state
    const [step, setStep] = useState(1);

    // Config fields (Step 1)
    const [label, setLabel] = useState('');
    const [effectiveDate, setEffectiveDate] = useState('');
    const [openingCash, setOpeningCash] = useState('');
    const [walletId, setWalletId] = useState('');
    const [notes, setNotes] = useState('');

    // Data
    const [products, setProducts] = useState([]);   // from products-template
    const [quantities, setQuantities] = useState({}); // { product_id: qty }
    const [wallets, setWallets] = useState([]);
    const [existingRecords, setExistingRecords] = useState([]);

    // UI state
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [collapsedCategories, setCollapsedCategories] = useState({});

    // ---- Data Fetching ----
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [prodRes, walletRes, recordsRes] = await Promise.all([
                fetchWithAuth(`${ENDPOINTS.FINANCE_OPENING_BALANCES}products-template/`),
                fetchWithAuth(`${ENDPOINTS.FINANCE_CASH_WALLETS}?active_only=true`),
                fetchWithAuth(ENDPOINTS.FINANCE_OPENING_BALANCES),
            ]);

            if (prodRes.ok) {
                const data = await prodRes.json();
                setProducts(data);
            }
            if (walletRes.ok) {
                const data = await walletRes.json();
                setWallets(data.results || data);
            }
            if (recordsRes.ok) {
                const data = await recordsRes.json();
                setExistingRecords(data.results || data);
            }
        } catch (err) {
            console.error('Error fetching opening balance data:', err);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // ---- Derived Data ----
    const groupedProducts = useMemo(() => {
        const groups = {};
        const query = searchQuery.toLowerCase();

        for (const p of products) {
            if (query && !p.name.toLowerCase().includes(query) && !p.category_name.toLowerCase().includes(query)) {
                continue;
            }
            const cat = p.category_name || 'Uncategorized';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(p);
        }

        // Sort categories alphabetically
        return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
    }, [products, searchQuery]);

    const filledCount = useMemo(() => {
        return Object.values(quantities).filter(q => q > 0).length;
    }, [quantities]);

    const stockValuation = useMemo(() => {
        let total = 0;
        for (const [pid, qty] of Object.entries(quantities)) {
            if (qty > 0) {
                const product = products.find(p => p.id === pid);
                if (product) {
                    total += qty * parseFloat(product.cost_price);
                }
            }
        }
        return total;
    }, [quantities, products]);

    const totalAssets = useMemo(() => {
        return stockValuation + (parseFloat(openingCash) || 0);
    }, [stockValuation, openingCash]);

    // ---- Handlers ----
    const handleQuantityChange = (productId, value) => {
        const qty = value === '' ? 0 : parseInt(value, 10);
        if (isNaN(qty) || qty < 0) return;
        setQuantities(prev => ({ ...prev, [productId]: qty }));
    };

    const toggleCategory = (cat) => {
        setCollapsedCategories(prev => ({
            ...prev,
            [cat]: !prev[cat]
        }));
    };

    const canProceedToStep2 = label.trim() && effectiveDate;
    const canSubmit = canProceedToStep2;

    const handleSubmit = async () => {
        if (submitting) return;
        setSubmitting(true);
        setError('');
        setSuccess('');

        // Build stock_items from quantities
        const stockItems = Object.entries(quantities)
            .filter(([, qty]) => qty > 0)
            .map(([product_id, quantity]) => ({ product_id, quantity }));

        const payload = {
            label: label.trim(),
            effective_date: effectiveDate,
            opening_cash: parseFloat(openingCash) || 0,
            wallet_id: walletId || null,
            notes: notes.trim(),
            stock_items: stockItems,
        };

        try {
            const res = await fetchWithAuth(ENDPOINTS.FINANCE_OPENING_BALANCES, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                const data = await res.json();
                setSuccess(`Opening balance "${data.label}" recorded successfully!`);
                // Reset form
                setLabel('');
                setEffectiveDate('');
                setOpeningCash('');
                setWalletId('');
                setNotes('');
                setQuantities({});
                setStep(1);
                fetchData(); // Refresh records
            } else {
                const err = await res.json();
                const msg = typeof err === 'object'
                    ? Object.values(err).flat().join(', ')
                    : JSON.stringify(err);
                setError(msg);
            }
        } catch (err) {
            console.error('Submit error:', err);
            setError('Network error. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // ---- Render ----
    if (loading) return <div className="loading-spinner">Loading Opening Balance...</div>;

    return (
        <div className="opening-balance-container fade-in">
            {/* Header */}
            <div className="ob-header">
                <div>
                    <h1>📦 Opening Balance Migration</h1>
                    <p className="ob-header-subtitle">
                        One-time entry of pre-system stock counts and opening cash capital
                    </p>
                </div>
            </div>

            {/* Status Messages */}
            {error && <div className="ob-error">{error}</div>}
            {success && <div className="ob-success">{success}</div>}

            {/* Stepper */}
            <div className="ob-stepper">
                <div className={`ob-step ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`} onClick={() => setStep(1)}>
                    <span className="ob-step-number">{step > 1 ? '✓' : '1'}</span>
                    <span className="ob-step-label">Configure</span>
                </div>
                <div className={`ob-step-connector ${step > 1 ? 'done' : ''}`} />
                <div className={`ob-step ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`} onClick={() => canProceedToStep2 && setStep(2)}>
                    <span className="ob-step-number">{step > 2 ? '✓' : '2'}</span>
                    <span className="ob-step-label">Stock Entry</span>
                </div>
                <div className={`ob-step-connector ${step > 2 ? 'done' : ''}`} />
                <div className={`ob-step ${step === 3 ? 'active' : ''}`} onClick={() => canProceedToStep2 && setStep(3)}>
                    <span className="ob-step-number">3</span>
                    <span className="ob-step-label">Review</span>
                </div>
            </div>

            {/* ==================== Step 1: Configure ==================== */}
            {step === 1 && (
                <div className="glass-card" style={{ padding: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem' }}>
                        Configuration
                    </h2>
                    <div className="ob-config-panel">
                        <div className="form-group">
                            <label>Label *</label>
                            <input
                                type="text"
                                placeholder="e.g., FY2025-26 Opening"
                                value={label}
                                onChange={e => setLabel(e.target.value)}
                                maxLength={50}
                            />
                        </div>
                        <div className="form-group">
                            <label>Effective Date *</label>
                            <input
                                type="date"
                                value={effectiveDate}
                                onChange={e => setEffectiveDate(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>Opening Cash Capital (₹)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={openingCash}
                                onChange={e => setOpeningCash(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>Deposit Into Wallet</label>
                            <select value={walletId} onChange={e => setWalletId(e.target.value)}>
                                <option value="">— No wallet deposit —</option>
                                {wallets.map(w => (
                                    <option key={w.id} value={w.id}>
                                        {w.name} (Balance: {currency}{Number(w.balance).toLocaleString()})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group ob-notes-group">
                            <label>Notes</label>
                            <textarea
                                rows={2}
                                placeholder="Optional notes about this opening balance..."
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                style={{ resize: 'vertical' }}
                            />
                        </div>
                    </div>
                    <div className="ob-actions">
                        <button
                            className="btn btn-primary"
                            disabled={!canProceedToStep2}
                            onClick={() => setStep(2)}
                        >
                            Next: Stock Entry →
                        </button>
                    </div>
                </div>
            )}

            {/* ==================== Step 2: Stock Entry ==================== */}
            {step === 2 && (
                <div className="ob-stock-section">
                    <div className="ob-stock-toolbar">
                        <input
                            type="text"
                            className="ob-stock-search"
                            placeholder="🔍 Search products..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        <div className="ob-stock-stats">
                            <span>Total products: <strong>{products.length}</strong></span>
                            <span className="filled-count">Filled: <strong>{filledCount}</strong></span>
                            <span>Valuation: <strong>{currency}{stockValuation.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
                        </div>
                    </div>

                    {groupedProducts.map(([category, items]) => {
                        const isCollapsed = collapsedCategories[category];
                        const categoryFilled = items.filter(p => quantities[p.id] > 0).length;
                        const categoryTotal = items.reduce((sum, p) => {
                            const qty = quantities[p.id] || 0;
                            return sum + qty * parseFloat(p.cost_price);
                        }, 0);

                        return (
                            <div key={category} className="ob-category-group">
                                <div className="ob-category-header" onClick={() => toggleCategory(category)}>
                                    <div className="ob-category-name">
                                        <span className={`ob-category-chevron ${!isCollapsed ? 'open' : ''}`}>▶</span>
                                        {category}
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
                                            ({items.length} products)
                                        </span>
                                    </div>
                                    <div className="ob-category-summary">
                                        {categoryFilled > 0 && (
                                            <span>{categoryFilled} filled · {currency}{categoryTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        )}
                                    </div>
                                </div>
                                {!isCollapsed && (
                                    <table className="ob-stock-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '45%' }}>Product</th>
                                                <th style={{ width: '15%' }}>Cost Price</th>
                                                <th style={{ width: '15%' }}>Quantity</th>
                                                <th style={{ width: '25%' }}>Total Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map(product => {
                                                const qty = quantities[product.id] || 0;
                                                const total = qty * parseFloat(product.cost_price);
                                                return (
                                                    <tr key={product.id}>
                                                        <td>{product.name}</td>
                                                        <td className="product-cost">{currency}{parseFloat(product.cost_price).toLocaleString()}</td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                className={`qty-input ${qty > 0 ? 'has-value' : ''}`}
                                                                min="0"
                                                                value={qty || ''}
                                                                placeholder="0"
                                                                onChange={e => handleQuantityChange(product.id, e.target.value)}
                                                            />
                                                        </td>
                                                        <td className="row-total">
                                                            {qty > 0 ? `${currency}${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        );
                    })}

                    <div className="ob-actions">
                        <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
                        <button className="btn btn-primary" onClick={() => setStep(3)}>
                            Next: Review →
                        </button>
                    </div>
                </div>
            )}

            {/* ==================== Step 3: Review & Submit ==================== */}
            {step === 3 && (
                <div className="glass-card" style={{ padding: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem' }}>
                        Review & Submit
                    </h2>

                    {/* Summary Cards */}
                    <div className="ob-summary-grid">
                        <div className="ob-summary-card cash">
                            <div className="ob-summary-label">Opening Cash</div>
                            <div className="ob-summary-value">{currency}{(parseFloat(openingCash) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            {walletId && (
                                <div className="ob-summary-detail">
                                    → {wallets.find(w => w.id === walletId)?.name || 'Selected wallet'}
                                </div>
                            )}
                        </div>
                        <div className="ob-summary-card stock">
                            <div className="ob-summary-label">Stock Valuation</div>
                            <div className="ob-summary-value">{currency}{stockValuation.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            <div className="ob-summary-detail">at cost price</div>
                        </div>
                        <div className="ob-summary-card total">
                            <div className="ob-summary-label">Total Assets</div>
                            <div className="ob-summary-value">{currency}{totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            <div className="ob-summary-detail">cash + stock</div>
                        </div>
                        <div className="ob-summary-card products">
                            <div className="ob-summary-label">Products Counted</div>
                            <div className="ob-summary-value">{filledCount}</div>
                            <div className="ob-summary-detail">of {products.length} total</div>
                        </div>
                    </div>

                    {/* Config Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                        <div><strong>Label:</strong> {label}</div>
                        <div><strong>Effective Date:</strong> {effectiveDate}</div>
                        {notes && <div style={{ gridColumn: '1 / -1' }}><strong>Notes:</strong> {notes}</div>}
                    </div>

                    {/* Stock Breakdown */}
                    {filledCount > 0 && (
                        <details style={{ marginBottom: '1.5rem' }}>
                            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                                View Stock Breakdown ({filledCount} items)
                            </summary>
                            <table className="ob-stock-table" style={{ border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>Category</th>
                                        <th style={{ textAlign: 'right' }}>Qty</th>
                                        <th style={{ textAlign: 'right' }}>Cost</th>
                                        <th style={{ textAlign: 'right' }}>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(quantities)
                                        .filter(([, qty]) => qty > 0)
                                        .map(([pid, qty]) => {
                                            const p = products.find(x => x.id === pid);
                                            if (!p) return null;
                                            const total = qty * parseFloat(p.cost_price);
                                            return (
                                                <tr key={pid}>
                                                    <td>{p.name}</td>
                                                    <td style={{ color: 'var(--text-secondary)' }}>{p.category_name}</td>
                                                    <td style={{ textAlign: 'right' }}>{qty}</td>
                                                    <td style={{ textAlign: 'right' }}>{currency}{parseFloat(p.cost_price).toLocaleString()}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{currency}{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </details>
                    )}

                    <div className="ob-actions">
                        <button className="btn btn-ghost" onClick={() => setStep(2)}>← Back to Stock</button>
                        <button
                            className="btn btn-primary"
                            disabled={!canSubmit || submitting}
                            onClick={handleSubmit}
                        >
                            {submitting ? 'Recording...' : '✅ Record Opening Balance'}
                        </button>
                    </div>
                </div>
            )}

            {/* ==================== Existing Records ==================== */}
            {existingRecords.length > 0 && (
                <div className="ob-existing-records">
                    <h2>📋 Previously Recorded</h2>
                    {existingRecords.map(record => (
                        <div key={record.id} className="ob-record-card">
                            <div className="ob-record-info">
                                <h3>{record.label}</h3>
                                <div className="ob-record-meta">
                                    <span>📅 {record.effective_date}</span>
                                    <span>👤 {record.created_by_name}</span>
                                    <span>🕐 {new Date(record.created_at).toLocaleString()}</span>
                                    {record.cash_recorded && <span>💰 Cash deposited</span>}
                                </div>
                            </div>
                            <div className="ob-record-values">
                                <div className="value-block">
                                    <span className="value-label">Cash</span>
                                    <span className="value-amount">{currency}{Number(record.opening_cash).toLocaleString()}</span>
                                </div>
                                <div className="value-block">
                                    <span className="value-label">Stock</span>
                                    <span className="value-amount">{currency}{Number(record.stock_valuation_total).toLocaleString()}</span>
                                </div>
                                <div className="value-block">
                                    <span className="value-label">Products</span>
                                    <span className="value-amount">{(record.stock_data || []).length}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
