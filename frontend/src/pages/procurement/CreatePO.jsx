import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import { PROCUREMENT_ENDPOINTS } from '../../services/procurementService';

export default function CreatePO() {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();

    // Vendor state
    const [vendors, setVendors] = useState([]);
    const [selectedVendorId, setSelectedVendorId] = useState('');

    // Line items
    const [lineItems, setLineItems] = useState([]);

    // Additional Charges
    const [charges, setCharges] = useState([]);

    // Product search
    const [productSearch, setProductSearch] = useState('');
    const [productResults, setProductResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const productAbortRef = useRef(null);

    // Form fields
    const [expectedDate, setExpectedDate] = useState('');
    const [notes, setNotes] = useState('');

    // M1: Double-submit protection
    const isSubmittingRef = useRef(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch vendors on mount
    useEffect(() => {
        const fetchVendors = async () => {
            try {
                const res = await fetchWithAuth(ENDPOINTS.INVENTORY_VENDORS);
                if (res.ok) {
                    const data = await res.json();
                    setVendors(data.results || data);
                }
            } catch (e) {
                console.error('Failed to load vendors', e);
            }
        };
        fetchVendors();
    }, [fetchWithAuth]);

    // Debounced product search (same pattern as NewOrder.jsx)
    useEffect(() => {
        if (!productSearch || productSearch.length < 2) {
            setProductResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            if (productAbortRef.current) productAbortRef.current.abort();
            const controller = new AbortController();
            productAbortRef.current = controller;
            setIsSearching(true);

            try {
                const url = `${ENDPOINTS.INVENTORY_PRODUCTS}?search=${encodeURIComponent(productSearch)}&page_size=20`;
                const res = await fetchWithAuth(url, { signal: controller.signal });
                if (res.ok) {
                    const data = await res.json();
                    setProductResults(data.results || []);
                }
            } catch (e) {
                if (e.name !== 'AbortError') console.error('Product search failed', e);
            } finally {
                setIsSearching(false);
            }
        }, 400);

        return () => {
            clearTimeout(timer);
            if (productAbortRef.current) productAbortRef.current.abort();
        };
    }, [productSearch, fetchWithAuth]);

    const addLineItem = (product) => {
        // Prevent duplicates
        if (lineItems.find(li => li.product_id === product.id)) {
            showToast(`${product.name} is already in the list`, 'warning');
            return;
        }
        setLineItems(prev => [...prev, {
            product_id: product.id,
            product_name: product.name,
            is_pack: product.is_pack,
            pack_size: product.pack_size || 1,
            vendor_pack_size: product.pack_size || 1,
            purchased_packs: 1,
            unit_cost_price: product.cost_price || '0.0000',
        }]);
        setProductSearch('');
        setProductResults([]);
    };

    const updateLineItem = (index, field, value) => {
        setLineItems(prev => prev.map((item, i) => {
            if (i !== index) return item;
            return { ...item, [field]: value };
        }));
    };

    const removeLineItem = (index) => {
        setLineItems(prev => prev.filter((_, i) => i !== index));
    };

    const addCharge = () => {
        setCharges(prev => [...prev, { charge_type: 'packing', amount: '0.00', description: '' }]);
    };

    const updateCharge = (index, field, value) => {
        setCharges(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
    };

    const removeCharge = (index) => {
        setCharges(prev => prev.filter((_, i) => i !== index));
    };

    const getOrderedQty = (item) => (parseInt(item.purchased_packs) || 0) * (parseInt(item.vendor_pack_size) || 0);
    const getLineTotal = (item) => getOrderedQty(item) * (parseFloat(item.unit_cost_price) || 0);
    const subtotal = lineItems.reduce((sum, item) => sum + getLineTotal(item), 0);
    const totalCharges = charges.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
    const grandTotal = subtotal + totalCharges;

    const handleSubmit = async () => {
        if (isSubmittingRef.current) return;

        if (!selectedVendorId) {
            showToast('Please select a vendor', 'warning');
            return;
        }
        if (lineItems.length === 0) {
            showToast('Add at least one product', 'warning');
            return;
        }
        // Validate all line items
        for (const item of lineItems) {
            if (!item.vendor_pack_size || item.vendor_pack_size < 1) {
                showToast(`Pack size must be ≥ 1 for ${item.product_name}`, 'error');
                return;
            }
            if (!item.purchased_packs || item.purchased_packs < 1) {
                showToast(`Quantity must be ≥ 1 for ${item.product_name}`, 'error');
                return;
            }
        }

        isSubmittingRef.current = true;
        setIsSubmitting(true);

        try {
            const payload = {
                vendor_id: selectedVendorId,
                expected_delivery_date: expectedDate || null,
                notes,
                items: lineItems.map(li => ({
                    product_id: li.product_id,
                    vendor_pack_size: parseInt(li.vendor_pack_size),
                    purchased_packs: parseInt(li.purchased_packs),
                    unit_cost_price: li.unit_cost_price.toString(),
                })),
                charges: charges.filter(c => parseFloat(c.amount) > 0).map(c => ({
                    charge_type: c.charge_type,
                    amount: c.amount.toString(),
                    description: c.description
                }))
            };

            const res = await fetchWithAuth(PROCUREMENT_ENDPOINTS.CREATE_PO, {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                const data = await res.json();
                showToast(`PO #${data.display_id} created successfully`, 'success');
                navigate(`/procurement/${data.id}`);
            } else {
                const err = await res.json();
                showToast('Failed: ' + JSON.stringify(err), 'error');
            }
        } catch (e) {
            console.error('PO creation failed', e);
            showToast('Error creating PO', 'error');
        } finally {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
        }
    };

    return (
        <div className="page-container">
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
                <button onClick={() => navigate('/procurement')} className="btn btn-ghost btn-sm">← Back</button>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Create Purchase Order</h1>
            </div>

            {/* Vendor & Details */}
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>PO Details</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                            Vendor *
                        </label>
                        <select
                            className="form-control"
                            value={selectedVendorId}
                            onChange={e => setSelectedVendorId(e.target.value)}
                            style={{ width: '100%' }}
                        >
                            <option value="">Select vendor...</option>
                            {vendors.map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                            Expected Delivery
                        </label>
                        <input
                            type="date"
                            className="form-control"
                            value={expectedDate}
                            onChange={e => setExpectedDate(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                </div>
                <div style={{ marginTop: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                        Notes
                    </label>
                    <textarea
                        className="form-control"
                        rows={2}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Optional notes..."
                        style={{ width: '100%', resize: 'vertical' }}
                    />
                </div>
            </div>

            {/* Product Search + Line Items */}
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Line Items</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                        {lineItems.length} item{lineItems.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* Search */}
                <div style={{ position: 'relative', marginBottom: '1rem' }}>
                    <input
                        type="text"
                        className="form-control"
                        placeholder="Search products to add..."
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                        style={{ width: '100%' }}
                    />
                    {isSearching && (
                        <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                            Searching...
                        </div>
                    )}
                    {productResults.length > 0 && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                            background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                            borderRadius: '8px', maxHeight: '200px', overflowY: 'auto',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                        }}>
                            {productResults.map(p => (
                                <div
                                    key={p.id}
                                    onClick={() => addLineItem(p)}
                                    style={{
                                        padding: '10px 14px', cursor: 'pointer',
                                        borderBottom: '1px solid var(--color-border)',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    }}
                                    onMouseOver={e => e.currentTarget.style.background = 'var(--color-bg-secondary)'}
                                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div>
                                        <strong>{p.name}</strong>
                                        {p.is_pack && (
                                            <span style={{
                                                marginLeft: '8px', fontSize: '0.7rem', fontWeight: 600,
                                                padding: '1px 6px', borderRadius: '4px',
                                                background: '#3b82f622', color: '#3b82f6'
                                            }}>PACK ({p.pack_size})</span>
                                        )}
                                    </div>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                        Stock: {p.stock_quantity} | ₹{parseFloat(p.cost_price).toFixed(2)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Line Items Table */}
                {lineItems.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                        Search and add products above
                    </div>
                ) : (
                    <>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Product</th>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Pack Size</th>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Packs</th>
                                        <th style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Units</th>
                                        <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Unit Cost (₹)</th>
                                        <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Total (₹)</th>
                                        <th style={{ width: '40px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lineItems.map((item, idx) => (
                                        <tr key={item.product_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '8px 6px' }}>
                                                {item.product_name}
                                                {item.is_pack && (
                                                    <span style={{
                                                        marginLeft: '6px', fontSize: '0.65rem', fontWeight: 600,
                                                        padding: '1px 5px', borderRadius: '3px',
                                                        background: '#3b82f622', color: '#3b82f6'
                                                    }}>PACK</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={item.vendor_pack_size}
                                                    onChange={e => updateLineItem(idx, 'vendor_pack_size', e.target.value)}
                                                    className="form-control"
                                                    style={{ width: '80px', textAlign: 'center', margin: '0 auto' }}
                                                />
                                            </td>
                                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={item.purchased_packs}
                                                    onChange={e => updateLineItem(idx, 'purchased_packs', e.target.value)}
                                                    className="form-control"
                                                    style={{ width: '80px', textAlign: 'center', margin: '0 auto' }}
                                                />
                                            </td>
                                            <td style={{ padding: '8px 6px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                                {getOrderedQty(item)}
                                            </td>
                                            <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={item.unit_cost_price}
                                                    onChange={e => updateLineItem(idx, 'unit_cost_price', e.target.value)}
                                                    className="form-control"
                                                    style={{ width: '120px', textAlign: 'right', marginLeft: 'auto' }}
                                                />
                                            </td>
                                            <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>
                                                ₹{getLineTotal(item).toFixed(2)}
                                            </td>
                                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => removeLineItem(idx)}
                                                    className="btn btn-ghost btn-sm"
                                                    style={{ color: '#ef4444', padding: '2px 6px' }}
                                                    title="Remove"
                                                >✕</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{
                            display: 'flex', justifyContent: 'flex-end', padding: '1rem 6px 0',
                            borderTop: '2px solid var(--color-border)', marginTop: '0.5rem'
                        }}>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Subtotal: </span>
                                <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>₹{subtotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Additional Charges */}
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Additional Charges</h3>
                    <button onClick={addCharge} className="btn btn-ghost btn-sm">+ Add Charge</button>
                </div>
                
                {charges.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                        No additional charges
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {charges.map((charge, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <select 
                                    className="form-control" 
                                    value={charge.charge_type} 
                                    onChange={e => updateCharge(idx, 'charge_type', e.target.value)}
                                    style={{ width: '150px' }}
                                >
                                    <option value="packing">Packing</option>
                                    <option value="transport">Transport</option>
                                    <option value="handling">Handling</option>
                                    <option value="other">Other</option>
                                </select>
                                <input 
                                    type="text" 
                                    className="form-control" 
                                    placeholder="Description (optional)" 
                                    value={charge.description}
                                    onChange={e => updateCharge(idx, 'description', e.target.value)}
                                    style={{ flex: 1 }}
                                />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontWeight: 500 }}>₹</span>
                                    <input 
                                        type="number" 
                                        min="0" 
                                        step="0.01" 
                                        className="form-control" 
                                        value={charge.amount}
                                        onChange={e => updateCharge(idx, 'amount', e.target.value)}
                                        style={{ width: '100px', textAlign: 'right' }}
                                    />
                                </div>
                                <button
                                    onClick={() => removeCharge(idx)}
                                    className="btn btn-ghost btn-sm"
                                    style={{ color: '#ef4444', padding: '2px 6px' }}
                                    title="Remove Charge"
                                >✕</button>
                            </div>
                        ))}
                    </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '2px solid var(--color-border)', marginTop: '1rem' }}>
                    <div style={{ textAlign: 'right', minWidth: '200px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                            <span>Subtotal:</span>
                            <span>₹{subtotal.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                            <span>Total Charges:</span>
                            <span>₹{totalCharges.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
                            <span style={{ fontWeight: 600 }}>Grand Total:</span>
                            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-primary)' }}>₹{grandTotal.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '1rem' }}>
                <button
                    className="btn btn-ghost"
                    onClick={() => navigate('/procurement')}
                    disabled={isSubmitting}
                >
                    Cancel
                </button>
                <button
                    className="btn btn-primary"
                    onClick={handleSubmit}
                    disabled={isSubmitting || lineItems.length === 0 || !selectedVendorId}
                >
                    {isSubmitting ? 'Creating...' : 'Create PO'}
                </button>
            </div>
        </div>
    );
}
