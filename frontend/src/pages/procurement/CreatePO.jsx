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

    // Transporter state
    const [transporters, setTransporters] = useState([]);

    // Line items
    const [lineItems, setLineItems] = useState([]);

    // Additional Charges
    const [charges, setCharges] = useState([]);

    // Product search & replenishment
    const [productSearch, setProductSearch] = useState('');
    const [productResults, setProductResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const productAbortRef = useRef(null);
    const productInputRef = useRef(null);

    // Search filters & quick replenishment
    const [categories, setCategories] = useState([]);
    const [filterCategoryId, setFilterCategoryId] = useState('');
    const [filterVendorId, setFilterVendorId] = useState('');
    const [lowStockOnly, setLowStockOnly] = useState(false);
    const [depletedProducts, setDepletedProducts] = useState([]);
    const [lowStockCount, setLowStockCount] = useState(0);

    // Form fields
    const [expectedDate, setExpectedDate] = useState('');
    const [notes, setNotes] = useState('');

    // M1: Double-submit protection
    const isSubmittingRef = useRef(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch vendors, categories, and transporters on mount
    useEffect(() => {
        const fetchFilters = async () => {
            try {
                const [vendRes, catRes, transRes] = await Promise.all([
                    fetchWithAuth(ENDPOINTS.INVENTORY_VENDORS),
                    fetchWithAuth(ENDPOINTS.INVENTORY_CATEGORIES),
                    fetchWithAuth(PROCUREMENT_ENDPOINTS.TRANSPORTERS)
                ]);
                if (vendRes.ok) {
                    const data = await vendRes.json();
                    setVendors(data.results || data);
                }
                if (catRes.ok) {
                    const data = await catRes.json();
                    setCategories(data.results || data);
                }
                if (transRes && transRes.ok) {
                    const data = await transRes.json();
                    setTransporters(data.results || data);
                }
            } catch (e) {
                console.error('Failed to load filters', e);
            }
        };
        fetchFilters();
    }, [fetchWithAuth]);

    // Probe depleted / low-stock products when a vendor is selected
    useEffect(() => {
        const vendorId = filterVendorId || selectedVendorId;
        if (!vendorId) {
            setDepletedProducts([]);
            setLowStockCount(0);
            return;
        }

        const fetchDepleted = async () => {
            try {
                const res = await fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}?vendor=${vendorId}&low_stock=true&page_size=100`);
                if (res.ok) {
                    const data = await res.json();
                    const list = data.results || (Array.isArray(data) ? data : []);
                    setDepletedProducts(list);
                    setLowStockCount(list.length);
                }
            } catch (err) {
                console.error('Failed to probe low stock products:', err);
            }
        };
        fetchDepleted();
    }, [selectedVendorId, filterVendorId, fetchWithAuth]);

    // Debounced product search — triggers on search text OR filter change OR lowStockOnly
    useEffect(() => {
        const hasFilter = filterVendorId || filterCategoryId || lowStockOnly;
        const hasSearch = productSearch && productSearch.trim().length >= 1;

        if (!hasFilter && !hasSearch) {
            setProductResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            if (productAbortRef.current) productAbortRef.current.abort();
            const controller = new AbortController();
            productAbortRef.current = controller;
            setIsSearching(true);

            try {
                let url = `${ENDPOINTS.INVENTORY_PRODUCTS}?page_size=50`;
                if (productSearch) {
                    url += `&search=${encodeURIComponent(productSearch.trim())}`;
                }
                if (filterVendorId) {
                    url += `&vendor=${filterVendorId}`;
                }
                if (filterCategoryId) {
                    url += `&category=${filterCategoryId}`;
                }
                if (lowStockOnly) {
                    url += `&low_stock=true`;
                }
                const res = await fetchWithAuth(url, { signal: controller.signal });
                if (res.ok) {
                    const data = await res.json();
                    setProductResults(data.results || []);
                    setHighlightedIndex(-1);
                }
            } catch (e) {
                if (e.name !== 'AbortError') console.error('Product search failed', e);
            } finally {
                setIsSearching(false);
            }
        }, hasSearch ? 300 : 0);

        return () => {
            clearTimeout(timer);
            if (productAbortRef.current) productAbortRef.current.abort();
        };
    }, [productSearch, filterVendorId, filterCategoryId, lowStockOnly, fetchWithAuth]);

    // 1-Click Replenishment: Pull all depleted products from vendor into PO
    const handleAddAllDepleted = () => {
        if (!depletedProducts.length) {
            showToast('No depleted products found for this vendor', 'info');
            return;
        }
        let addedCount = 0;
        setLineItems(prev => {
            const existingIds = new Set(prev.map(li => li.product_id));
            const newItems = [];
            for (const product of depletedProducts) {
                if (!existingIds.has(product.id)) {
                    const packSize = parseInt(product.pack_size) > 0 ? parseInt(product.pack_size) : 1;
                    const rawCost = parseFloat(product.cost_price) || 0;
                    const perUnitCost = product.is_pack ? (rawCost / packSize).toFixed(4) : rawCost.toFixed(4);
                    const currentStock = parseInt(product.stock_quantity) || 0;
                    const threshold = parseInt(product.low_stock_threshold) || 10;
                    const deficit = threshold - currentStock;
                    const targetReplenish = Math.max(1, Math.ceil(deficit / packSize));
                    newItems.push({
                        product_id: product.id,
                        product_name: product.name,
                        is_pack: product.is_pack,
                        pack_size: packSize,
                        vendor_pack_size: packSize,
                        purchased_packs: targetReplenish,
                        unit_cost_price: perUnitCost,
                    });
                    addedCount++;
                }
            }
            if (addedCount === 0) {
                showToast('All depleted products are already in line items', 'info');
                return prev;
            }
            showToast(`Added ${addedCount} depleted products to line items`, 'success');
            return [...prev, ...newItems];
        });
    };

    // Keyboard navigation in product search
    const handleProductKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev < productResults.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => (prev > 0 ? prev - 1 : productResults.length - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && productResults[highlightedIndex]) {
                addLineItem(productResults[highlightedIndex]);
            } else if (productResults.length === 1) {
                addLineItem(productResults[0]);
            }
        } else if (e.key === 'Escape') {
            setProductSearch('');
            setHighlightedIndex(-1);
        }
    };

    const addLineItem = (product) => {
        // Prevent duplicates
        if (lineItems.find(li => li.product_id === product.id)) {
            showToast(`${product.name} is already in the list`, 'warning');
            return;
        }
        // Backend expects unit_cost_price as cost per BASE UNIT.
        // For pack products, inventory cost_price is the pack price,
        // so we divide by pack_size to get the per-unit cost.
        const packSize = parseInt(product.pack_size) > 0 ? parseInt(product.pack_size) : 1;
        const rawCost = parseFloat(product.cost_price) || 0;
        const perUnitCost = product.is_pack ? (rawCost / packSize).toFixed(4) : rawCost.toFixed(4);

        setLineItems(prev => [...prev, {
            product_id: product.id,
            product_name: product.name,
            is_pack: product.is_pack,
            pack_size: packSize,
            vendor_pack_size: packSize,
            purchased_packs: 1,
            unit_cost_price: perUnitCost,
        }]);
        // Don't clear results — keep the filtered list visible for adding more products
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
        setCharges(prev => [...prev, { charge_type: 'packing', amount: '0.00', description: '', transporter_id: '' }]);
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
                    description: c.description,
                    transporter_id: c.transporter_id || null,
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
                            onChange={e => {
                                const val = e.target.value;
                                setSelectedVendorId(val);
                                setFilterVendorId(val);
                            }}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Line Items</h3>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                            ({lineItems.length} item{lineItems.length !== 1 ? 's' : ''})
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            className={`btn btn-sm ${lowStockOnly ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setLowStockOnly(prev => !prev)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                border: '1px solid var(--color-border)',
                                fontSize: '0.8rem',
                            }}
                            title="Filter search to items at or below low stock threshold"
                        >
                            ⚡ Low Stock Only
                        </button>
                        {selectedVendorId && (
                            <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                onClick={handleAddAllDepleted}
                                disabled={depletedProducts.length === 0}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    border: '1px solid #f59e0b',
                                    color: '#d97706',
                                    background: depletedProducts.length > 0 ? '#fef3c722' : 'transparent',
                                    cursor: depletedProducts.length === 0 ? 'not-allowed' : 'pointer',
                                    opacity: depletedProducts.length === 0 ? 0.5 : 1,
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                }}
                                title="Automatically calculate needed packs and add depleted items for this vendor"
                            >
                                ⚡ Replenish Depleted ({depletedProducts.length})
                            </button>
                        )}
                    </div>
                </div>

                {/* Search */}
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                            ref={productInputRef}
                            type="text"
                            className="form-control"
                            placeholder="Search products by name/barcode... (↑/↓ to navigate, Enter to add)"
                            value={productSearch}
                            onChange={e => setProductSearch(e.target.value)}
                            onKeyDown={handleProductKeyDown}
                            style={{ flex: 1, minWidth: '220px' }}
                        />
                        <select
                            className="form-control"
                            value={filterCategoryId}
                            onChange={e => { setFilterCategoryId(e.target.value); setProductSearch(''); }}
                            style={{ width: 'auto', minWidth: '140px' }}
                        >
                            <option value="">All Categories</option>
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                        <select
                            className="form-control"
                            value={filterVendorId}
                            onChange={e => { setFilterVendorId(e.target.value); setProductSearch(''); }}
                            style={{ width: 'auto', minWidth: '140px' }}
                        >
                            <option value="">All Vendors</option>
                            {vendors.map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Filtered Product List */}
                {isSearching && (
                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                        Loading products...
                    </div>
                )}
                {!isSearching && productResults.length > 0 && (
                    <div style={{
                        maxHeight: '320px', overflowY: 'auto', marginBottom: '1rem',
                        border: '1px solid var(--color-border)', borderRadius: '8px',
                        background: 'var(--color-bg-secondary)',
                    }}>
                        <div style={{ padding: '6px 14px', fontSize: '0.75rem', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)', fontWeight: 500, display: 'flex', justifyContent: 'space-between' }}>
                            <span>{productResults.length} product{productResults.length !== 1 ? 's' : ''} found — click or Enter to add</span>
                            <span style={{ fontSize: '0.7rem' }}>Use ↑ ↓ to navigate</span>
                        </div>
                        {productResults.map((p, idx) => {
                            const isAdded = !!lineItems.find(li => li.product_id === p.id);
                            const isSelected = idx === highlightedIndex;
                            const isLowStock = p.stock_quantity <= (p.low_stock_threshold || 10);
                            const isOutOfStock = p.stock_quantity <= 0;
                            return (
                                <div
                                    key={p.id}
                                    onClick={() => addLineItem(p)}
                                    style={{
                                        padding: '10px 14px', cursor: 'pointer',
                                        borderBottom: '1px solid var(--color-border)',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        opacity: isAdded ? 0.45 : 1,
                                        backgroundColor: isSelected ? 'var(--color-bg-hover, rgba(59, 130, 246, 0.15))' : 'transparent',
                                        outline: isSelected ? '2px solid var(--color-primary)' : 'none',
                                    }}
                                    onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.05))'; }}
                                    onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <strong>{p.name}</strong>
                                        {p.is_pack && (
                                            <span style={{
                                                fontSize: '0.7rem', fontWeight: 600,
                                                padding: '1px 6px', borderRadius: '4px',
                                                background: '#3b82f622', color: '#3b82f6'
                                            }}>PACK ({p.pack_size})</span>
                                        )}
                                        {isAdded && (
                                            <span style={{
                                                fontSize: '0.65rem', fontWeight: 600,
                                                padding: '1px 6px', borderRadius: '4px',
                                                background: '#22c55e22', color: '#22c55e'
                                            }}>ADDED</span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: 600,
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            background: isOutOfStock ? '#ef444422' : isLowStock ? '#f59e0b22' : '#22c55e22',
                                            color: isOutOfStock ? '#ef4444' : isLowStock ? '#d97706' : '#16a34a',
                                        }}>
                                            {isOutOfStock ? 'OUT OF STOCK' : isLowStock ? `LOW (${p.stock_quantity})` : `STOCK: ${p.stock_quantity}`}
                                        </span>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: '70px', textAlign: 'right' }}>
                                            ₹{parseFloat(p.cost_price).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                {!isSearching && productResults.length === 0 && (filterVendorId || filterCategoryId) && (
                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                        No products match the selected filters.
                    </div>
                )}

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
                                                    style={{ minWidth: '70px', width: `calc(${String(item.vendor_pack_size).length}ch + 50px)`, textAlign: 'center', margin: '0 auto' }}
                                                />
                                            </td>
                                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={item.purchased_packs}
                                                    onChange={e => updateLineItem(idx, 'purchased_packs', e.target.value)}
                                                    className="form-control"
                                                    style={{ minWidth: '70px', width: `calc(${String(item.purchased_packs).length}ch + 50px)`, textAlign: 'center', margin: '0 auto' }}
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
                                                    style={{ minWidth: '90px', width: `calc(${String(item.unit_cost_price).length}ch + 50px)`, textAlign: 'right', marginLeft: 'auto' }}
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
                                    style={{ width: '130px' }}
                                >
                                    <option value="packing">Packing</option>
                                    <option value="transport">Transport</option>
                                    <option value="handling">Handling</option>
                                    <option value="other">Other</option>
                                </select>
                                {charge.charge_type === 'transport' && (
                                    <select
                                        className="form-control"
                                        value={charge.transporter_id || ''}
                                        onChange={e => updateCharge(idx, 'transporter_id', e.target.value)}
                                        style={{ width: '180px' }}
                                    >
                                        <option value="">Select transporter...</option>
                                        {transporters.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                )}
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
