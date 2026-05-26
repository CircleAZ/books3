import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useCart } from '../../context/CartContext';
import { ENDPOINTS } from '../../config/api';
import AddCustomer from '../customers/AddCustomer';
import { useToast } from '../../context/ToastContext';
import { compressImage } from '../../utils/imageCompression';
import UniversalPaymentEngine from '../../components/common/UniversalPaymentEngine';
import '../NewOrder.css';

import '../../styles/components/form-layout.css';
import '../../styles/components/modal-system.css';
export default function NewOrder() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { isDrawerOpen, setIsDrawerOpen, setCartData } = useCart();
    const { showToast } = useToast();

    // State
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerResults, setCustomerResults] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [showAddCustomer, setShowAddCustomer] = useState(false);

    const [productSearch, setProductSearch] = useState('');
    const [productResults, setProductResults] = useState([]);
    const [popularProducts, setPopularProducts] = useState([]);
    const [cartItems, setCartItems] = useState([]);
    const [orderDiscount, setOrderDiscount] = useState({ type: 'fixed', value: 0 });
    const [orderNotes, setOrderNotes] = useState('');

    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [payments, setPayments] = useState([]);
    
    // UPE Integrations
    const [currentPaymentPayload, setCurrentPaymentPayload] = useState(null);
    const [upiReferenceInput, setUpiReferenceInput] = useState('');

    const [availableCategories, setAvailableCategories] = useState([]);

    const [isLoading, setIsLoading] = useState(false);
    const [isSearchingProducts, setIsSearchingProducts] = useState(false);
    const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
    const [clearStage, setClearStage] = useState('idle'); // idle → confirming → ready
    const [selectedCategory, setSelectedCategory] = useState('');

    // Quick Product Modal State (P4 3.3.1.2.3: Name, Estimated Price, Category, Reference Photo)
    const [showQuickProduct, setShowQuickProduct] = useState(false);
    const [newProduct, setNewProduct] = useState({
        name: '',
        selling_price: '',
        category: '',
        is_additional: true
    });
    const [referencePhoto, setReferencePhoto] = useState(null);
    const [isCreatingProduct, setIsCreatingProduct] = useState(false);


    // Refs for AbortController (fixes Chaos race condition)
    const customerAbortRef = useRef(null);
    const productAbortRef = useRef(null);
    const isSubmittingOrderRef = useRef(false);
    const isSubmittingProductRef = useRef(false);

    // Synchronous submission lock — prevents rapid-fire duplicate orders (VULN-3)
    const isSubmittingRef = useRef(false);
    // Idempotency key — prevents duplicate order creation from SW replay or 401 retry
    // Key is derived from cart contents so retries of the same order reuse the same key.
    const idempotencyKeyRef = useRef(null);

    // ── Deterministic idempotency key: regenerate only when cart/customer changes ──
    // djb2 hash — fast, deterministic, collision-resistant enough for dedup (not security)
    const djb2Hash = useCallback((str) => {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
            hash = hash & hash; // Convert to 32-bit integer
        }
        return (hash >>> 0).toString(36); // Unsigned, base36 for compactness
    }, []);

    useEffect(() => {
        if (cartItems.length === 0 || !selectedCustomer) {
            idempotencyKeyRef.current = null;
            return;
        }
        // Fingerprint: customer ID + sorted product:quantity pairs (content-only, no time bucket)
        const itemFingerprint = cartItems
            .map(i => `${i.id}:${i.quantity}`)
            .sort()
            .join(',');
        const raw = `${selectedCustomer.id}|${itemFingerprint}`;
        idempotencyKeyRef.current = djb2Hash(raw);
    }, [cartItems, selectedCustomer, djb2Hash]);

    // Drawer panel ref
    const drawerRef = useRef(null);
    const isDrawerOpenRef = useRef(isDrawerOpen);
    isDrawerOpenRef.current = isDrawerOpen;

    // Refs for unsaved-work detection (used in event handlers to avoid stale closures)
    const cartLengthRef = useRef(cartItems.length);
    cartLengthRef.current = cartItems.length;
    const showAddCustomerRef = useRef(showAddCustomer);
    showAddCustomerRef.current = showAddCustomer;

    // Unified check: is there ANY unsaved work on this page?
    const hasUnsavedWork = () => {
        if (cartLengthRef.current > 0) return true;
        if (showAddCustomerRef.current) return true;
        return false;
    };

    // Warn on browser refresh/close when there's unsaved work
    useEffect(() => {
        const onBeforeUnload = (e) => {
            if (hasUnsavedWork()) {
                e.preventDefault();
                e.returnValue = 'You have unsaved work. Are you sure you want to leave?';
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, []);

    // Unified back-button handler: drawer close > unsaved work guard > allow navigation
    useEffect(() => {
        // Push a guard state whenever drawer opens OR there's unsaved work
        const needsGuard = isDrawerOpen || cartItems.length > 0 || showAddCustomer;
        if (!needsGuard) return;

        window.history.pushState({ posGuard: true }, '');

        const onPopState = () => {
            // Priority 1: If drawer is open, just close it
            if (isDrawerOpenRef.current) {
                setIsDrawerOpen(false);
                if (drawerRef.current) drawerRef.current.style.transform = '';
                // Re-push guard if there's still unsaved work
                if (hasUnsavedWork()) {
                    window.history.pushState({ posGuard: true }, '');
                }
                return;
            }

            // Priority 2: Unsaved work — confirm before leaving
            if (hasUnsavedWork()) {
                const msg = cartLengthRef.current > 0
                        ? 'You have items in your cart. Leave this page?'
                        : 'You have unsaved customer details. Leave this page?';
                if (window.confirm(msg)) {
                    window.history.back();
                } else {
                    window.history.pushState({ posGuard: true }, '');
                }
                return;
            }

            // Priority 3: Nothing to guard, let it go
            window.history.back();
        };

        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [isDrawerOpen, cartItems.length > 0, showAddCustomer]); // eslint-disable-line react-hooks/exhaustive-deps

    // Debounced Customer Search (with AbortController)
    useEffect(() => {
        if (!customerSearch || customerSearch.length < 2) {
            setCustomerResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            // Cancel any previous in-flight request
            if (customerAbortRef.current) {
                customerAbortRef.current.abort();
            }
            const controller = new AbortController();
            customerAbortRef.current = controller;

            setIsSearchingCustomers(true);
            try {
                const response = await fetchWithAuth(
                    `${ENDPOINTS.CUSTOMERS}?search=${encodeURIComponent(customerSearch)}`,
                    { signal: controller.signal }
                );
                if (response.ok) {
                    const data = await response.json();
                    setCustomerResults(data.results || []);
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Error searching customers:', error);
                }
            } finally {
                setIsSearchingCustomers(false);
            }
        }, 500);

        return () => {
            clearTimeout(timer);
            if (customerAbortRef.current) {
                customerAbortRef.current.abort();
            }
        };
    }, [customerSearch, fetchWithAuth]);

    // Debounced Product Search (with AbortController)
    useEffect(() => {
        if (!productSearch) {
            setProductResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            // Cancel any previous in-flight request
            if (productAbortRef.current) {
                productAbortRef.current.abort();
            }
            const controller = new AbortController();
            productAbortRef.current = controller;

            setIsSearchingProducts(true);
            try {
                let url = `${ENDPOINTS.INVENTORY_PRODUCTS}?search=${encodeURIComponent(productSearch)}&page_size=100`;
                if (selectedCategory) {
                    url += `&category=${selectedCategory}`;
                } else {
                    url += `&exclude_category_prefix=Nav_`;
                }
                const response = await fetchWithAuth(url, { signal: controller.signal });
                if (response.ok) {
                    const data = await response.json();
                    setProductResults(data.results || []);
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Error searching products:', error);
                }
            } finally {
                setIsSearchingProducts(false);
            }
        }, 500);

        return () => {
            clearTimeout(timer);
            if (productAbortRef.current) {
                productAbortRef.current.abort();
            }
        };
    }, [productSearch, fetchWithAuth, selectedCategory]);

    // Fetch popular products on mount (ordered by order_count desc)
    useEffect(() => {
        const fetchPopularProducts = async () => {
            try {
                let url = `${ENDPOINTS.INVENTORY_PRODUCTS}?ordering=-order_count&page_size=100`;
                if (selectedCategory) {
                    url += `&category=${selectedCategory}`;
                } else {
                    url += `&exclude_category_prefix=Nav_`;
                }
                const response = await fetchWithAuth(url);
                if (response.ok) {
                    const data = await response.json();
                    setPopularProducts(data.results || []);
                }
            } catch (error) {
                console.error('Error fetching popular products:', error);
            }
        };
        fetchPopularProducts();
    }, [fetchWithAuth, selectedCategory]);

    // Fetch Payment Methods, UPI Accounts, Bank Accounts, Cash Wallets, and Categories — ALL IN PARALLEL
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                // Fire all 5 requests simultaneously — no data dependencies between them
                const [catRes] = await Promise.allSettled([
                    fetchWithAuth(ENDPOINTS.INVENTORY_CATEGORIES)
                ]);

                // Process categories — sort alphabetically by name for dropdown
                if (catRes.status === 'fulfilled' && catRes.value.ok) {
                    const catData = await catRes.value.json();
                    const cats = (catData.results || catData).slice();
                    cats.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                    setAvailableCategories(cats);
                }
            } catch (error) {
                console.error('Error fetching settings:', error);
            }
        };

        fetchSettings();
    }, [fetchWithAuth]);



    // Cart Logic
    const addToCart = (product) => {
        if (product.stock_quantity <= 0) {
            showToast(`⚠ ${product.name} is out of stock (${product.stock_quantity}). Adding anyway.`, 'warning');
        }
        setCartItems(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item =>
                    item.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, {
                ...product,
                selling_price: Number(product.selling_price),
                quantity: 1,
                discountType: 'fixed',
                discountValue: 0
            }];
        });
        setProductSearch('');
        setProductResults([]);
    };

    const updateQuantity = (id, delta) => {
        setCartItems(prev => prev.map(item => {
            if (item.id === id) {
                const newQty = Math.max(1, item.quantity + delta);
                return { ...item, quantity: newQty };
            }
            return item;
        }));
    };

    const updateItemDiscount = (id, type, value) => {
        setCartItems(prev => prev.map(item => {
            if (item.id === id) {
                return { ...item, discountType: type, discountValue: parseFloat(value) || 0 };
            }
            return item;
        }));
    };

    const updateItemPrice = (id, price) => {
        setCartItems(prev => prev.map(item => item.id === id ? { ...item, selling_price: parseFloat(price) || 0 } : item));
    };

    const removeFromCart = (id) => {
        const removed = cartItems.find(item => item.id === id);
        setCartItems(prev => prev.filter(item => item.id !== id));
        if (removed) {
            showToast(`${removed.name} removed`, 'info', {
                undo: () => setCartItems(prev => [...prev, removed])
            });
        }
    };

    const setQuantity = (id, qty) => {
        const val = parseInt(qty, 10);
        if (isNaN(val) || val <= 0) {
            removeFromCart(id);
        } else {
            setCartItems(prev => prev.map(item =>
                item.id === id ? { ...item, quantity: val } : item
            ));
        }
    };

    // Calculations
    const subtotal = useMemo(() => {
        return cartItems.reduce((sum, item) => {
            const itemTotal = item.selling_price * item.quantity;
            let discount = 0;
            if (item.discountType === 'fixed') {
                discount = item.discountValue;
            } else {
                discount = (itemTotal * item.discountValue) / 100;
            }
            return sum + (itemTotal - discount);
        }, 0);
    }, [cartItems]);

    const totalDiscount = useMemo(() => {
        if (orderDiscount.type === 'fixed') {
            // VULN-4 fix: Clamp fixed discount to subtotal
            return Math.min(orderDiscount.value, subtotal);
        }
        // VULN-4 fix: Clamp percent discount to 100%
        const clampedPercent = Math.min(orderDiscount.value, 100);
        return (subtotal * clampedPercent) / 100;
    }, [subtotal, orderDiscount]);

    const grandTotal = Math.max(0, subtotal - totalDiscount);

    const totalPaid = useMemo(() => {
        return payments.reduce((sum, p) => sum + p.amount, 0);
    }, [payments]);

    const balanceDue = grandTotal - totalPaid;

    // Sync cart data to context for BottomNavBar
    useEffect(() => {
        setCartData(cartItems.length, grandTotal);
    }, [cartItems, grandTotal, setCartData]);

    // Clear cart confirmation timer: confirming → ready after 1s
    useEffect(() => {
        if (clearStage === 'confirming') {
            const timer = setTimeout(() => setClearStage('ready'), 1000);
            return () => clearTimeout(timer);
        }
    }, [clearStage]);

    // Payment Logic
    const addPayment = () => {
        if (!currentPaymentPayload) return;
        const amt = parseFloat(currentPaymentPayload.amount);
        if (isNaN(amt) || amt <= 0) return;

        // VULN-2 fix: Warn on overpayment (allow but confirm)
        if (amt > balanceDue && balanceDue > 0) {
            if (!window.confirm(`Payment ₹${amt.toFixed(2)} exceeds balance due ₹${balanceDue.toFixed(2)}. Add anyway?`)) {
                return;
            }
        }

        const isUpi = currentPaymentPayload.payment_method === 'upi';
        let upi_reference = '';
        if (isUpi) {
            upi_reference = upiReferenceInput.trim() || `QR-PAY-${Date.now()}`;
        }
        
        let methodDesc = currentPaymentPayload.payment_method;
        if (methodDesc === 'store_credit') {
            methodDesc = 'Customer Wallet';
            const wBal = selectedCustomer ? parseFloat(selectedCustomer.wallet_balance) : 0;
            if (!selectedCustomer || isNaN(wBal) || wBal < amt) {
                showToast(`Error: Insufficient wallet balance (₹${wBal.toFixed(2)}).`, 'error');
                return;
            }
        }

        setPayments(prev => [...prev, {
            ...currentPaymentPayload,
            method: methodDesc,
            upi_reference,
            timestamp: new Date().toISOString()
        }]);
        setUpiReferenceInput('');
    };

    // VULN-5 fix: Individual payment removal
    const removePayment = (index) => {
        setPayments(prev => prev.filter((_, i) => i !== index));
    };

    const clearPayments = () => setPayments([]);

    // Quick Product Creation (P4 3.3.1.2.3 — FormData for photo upload)
    const handleCreateProduct = async (e) => {
        e.preventDefault();
        if (isSubmittingProductRef.current) return;
        isSubmittingProductRef.current = true;
        setIsCreatingProduct(true);
        try {
            const formData = new FormData();
            formData.append('name', newProduct.name);
            formData.append('selling_price', newProduct.selling_price);
            formData.append('cost_price', newProduct.selling_price); // Use estimated price as cost
            formData.append('is_additional', 'true');
            formData.append('stock_quantity', '0');

            if (newProduct.category) {
                formData.append('category', newProduct.category);
            }
            if (referencePhoto) {
                try {
                    const { file: optimizedFile, thumbnail } = await compressImage(referencePhoto);
                    formData.append('images', optimizedFile);
                    formData.append('thumbnails', thumbnail);
                } catch (imgError) {
                    console.error('Image compression failed, using original', imgError);
                    formData.append('images', referencePhoto);
                }
            }

            const response = await fetchWithAuth(ENDPOINTS.INVENTORY_PRODUCTS, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const product = await response.json();
                addToCart(product);
                setShowQuickProduct(false);
                setNewProduct({ name: '', selling_price: '', category: '', is_additional: true });
                setReferencePhoto(null);
                showToast('Product created and added to cart', 'success');
            } else {
                const err = await response.json();
                showToast('Failed to create product: ' + JSON.stringify(err), 'error');
            }
        } catch (error) {
            console.error('Error creating product:', error);
            showToast('Error creating product', 'error');
        } finally {
            setIsCreatingProduct(false);
            isSubmittingProductRef.current = false;
        }
    };

    // Customer Creation Success
    const handleCustomerSuccess = (customer) => {
        setSelectedCustomer({
            id: customer.id,
            display_id: customer.display_id,
            name: `${customer.first_name} ${customer.last_name}`.trim(),
            phone: customer.phone,
            // Education fields needed for product set auto-load
            school_id: customer.school?.id || customer.school || null,
            effective_class_name: customer.class_obj?.name || customer.class_name || '',
            class_name: customer.class_name || '',
            division_name: customer.division_name || '',
            subdivision_name: customer.subdivision_name || '',
        });
        setShowAddCustomer(false);
        showToast('Customer added and selected!', 'success');
    };

    // Final Actions
    const handleClearCart = () => {
        if (window.confirm('Clear all items and reset order?')) {
            setCartItems([]);
            setSelectedCustomer(null);
            setShowAddCustomer(false);
            setPayments([]);
            setOrderNotes('');
            setOrderDiscount({ type: 'fixed', value: 0 });
        }
    };

    const submitOrder = async (status = 'confirmed') => {
        // VULN-3 fix: Synchronous lock prevents rapid-fire duplicate orders
        if (isSubmittingRef.current) return;

        if (cartItems.length === 0) {
            showToast('Cart is empty', 'warning');
            return;
        }

        if (!selectedCustomer) {
            showToast('Please select a customer or quick-add one', 'warning');
            return;
        }



        isSubmittingRef.current = true;
        setIsLoading(true);
        try {
            const orderData = {
                customer: selectedCustomer?.id || null,
                order_status: status,
                discount_type: orderDiscount.type,
                discount_value: orderDiscount.value,
                notes: orderNotes,
                items: cartItems.map(item => ({
                    product: item.id,
                    quantity: item.quantity,
                    unit_price: item.selling_price,
                    discount_type: item.discountType,
                    discount_value: item.discountValue
                })),
                payments: payments.map(p => ({
                    method: p.method === 'Customer Wallet' ? 'customer_wallet' : p.payment_method,
                    amount: p.amount,
                    destination_bank: p.destination_bank || null,
                    destination_wallet: p.destination_wallet || null,
                    upi_reference: p.upi_reference || ''
                }))
            };

            // Idempotency key is pre-computed from cart contents (see useEffect above).
            // If somehow null (edge case: cart changed mid-submit), generate a fallback.
            if (!idempotencyKeyRef.current) {
                const itemFp = cartItems.map(i => `${i.id}:${i.quantity}`).sort().join(',');
                idempotencyKeyRef.current = djb2Hash(`${selectedCustomer?.id}|${itemFp}`);
            }

            const response = await fetchWithAuth(ENDPOINTS.ORDERS, {
                method: 'POST',
                headers: { 'X-Idempotency-Key': idempotencyKeyRef.current },
                body: JSON.stringify(orderData)
            });

            if (response.ok) {
                const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
                if (totalPaid > grandTotal && selectedCustomer?.has_legacy_debt && parseFloat(selectedCustomer.legacy_debt_remaining) > 0) {
                    const excess = totalPaid - grandTotal;
                    const legacyDebtAmount = Math.min(excess, parseFloat(selectedCustomer.legacy_debt_remaining));
                    showToast(`Order successful! ₹${legacyDebtAmount.toFixed(2)} automatically allocated to Legacy Debt via ledger.`, 'success');
                } else {
                    showToast(`Order ${status === 'draft' ? 'held' : 'confirmed'} successfully!`, 'success');
                }

                // Reset state
                setCartItems([]);
                setSelectedCustomer(null);
                setShowAddCustomer(false);
                setPayments([]);
                setOrderNotes('');
                setOrderDiscount({ type: 'fixed', value: 0 });
            } else if (response.status === 409) {
                // Duplicate order detected by backend fingerprint guard
                try {
                    const err = await response.json();
                    showToast(err.detail || 'A similar order was created recently. Please verify.', 'warning');
                } catch (e) {
                    showToast('A similar order may already exist. Please check before resubmitting.', 'warning');
                }
            } else {
                let errMsg = `Status ${response.status}`;
                try {
                    const text = await response.text();
                    try {
                        const err = JSON.parse(text);
                        errMsg = JSON.stringify(err);
                        console.error('Order API error:', err);
                    } catch (jsonErr) {
                        errMsg = text.slice(0, 200);
                        console.error('Order API error (non-JSON):', text.slice(0, 500));
                    }
                } catch (e) {
                    console.error('Failed to read error response:', e);
                }
                showToast('Order failed: ' + errMsg, 'error');
            }
        } catch (error) {
            console.error('Order submission error:', error);
            showToast('Failed to submit order: ' + error.message, 'error');
        } finally {
            isSubmittingRef.current = false;
            setIsLoading(false);
        }
    };

    // Removed legacy UI helpers for manual payment state

    return (
        <div className="pos-container fade-in">
            {/* Left Panel: Customer & Products */}
            <div className="pos-left-panel">

                {/* Customer Section */}
                <section className="pos-section">
                    <div className="section-title">
                        <span>Customer</span>
                        {!selectedCustomer && (
                            <div className="d-flex gap-2">
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAddCustomer(prev => !prev)}>
                                    {showAddCustomer ? 'Close' : 'New Customer'}
                                </button>
                            </div>
                        )}
                    </div>

                    {selectedCustomer ? (
                        <>
                        <div className="selected-customer-card">
                            <div>
                                <strong>
                                    {selectedCustomer.display_id && <span className="text-muted small" style={{ marginRight: '6px' }}>#{selectedCustomer.display_id}</span>}
                                    {selectedCustomer.name || selectedCustomer.full_name}
                                </strong>
                                <div className="text-muted small">{selectedCustomer.phone || 'No phone'}</div>
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedCustomer(null)}>Change</button>
                        </div>
                        {selectedCustomer.has_legacy_debt && parseFloat(selectedCustomer.legacy_debt_remaining) > 0 && (
                            <div style={{ background: 'var(--danger-color, #dc3545)', color: 'white', padding: '0.5rem', borderRadius: '4px', marginTop: '0.5rem', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>⚠️ LEGACY DEBT ALERT</span>
                                <span>{currency}{parseFloat(selectedCustomer.legacy_debt_remaining).toFixed(2)}</span>
                            </div>
                        )}
                        </>
                    ) : (
                        <>
                            <div className="customer-search-wrapper">
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Search customer by name or phone..."
                                    value={customerSearch}
                                    onChange={e => setCustomerSearch(e.target.value)}
                                />
                                {isSearchingCustomers && <div className="spinner-small"></div>}
                                {customerResults.length > 0 && (
                                    <div className="search-results-dropdown">
                                        {customerResults.map(c => (
                                            <div
                                                key={c.id}
                                                className="search-result-item"
                                                onClick={() => {
                                                    setSelectedCustomer({
                                                        ...c,
                                                        name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()
                                                    });
                                                    setCustomerResults([]);
                                                    setCustomerSearch('');
                                                }}
                                            >
                                                <div>
                                                    {c.display_id && <span className="text-muted small" style={{ marginRight: '6px' }}>#{c.display_id}</span>}
                                                    <strong>{c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}</strong>
                                                </div>
                                                <div className="small text-muted">{c.phone}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Collapsible Add Customer Form (P4 3.3.1.1.2: "Form is collapsible") */}
                    <div className={`add-customer-collapsible ${showAddCustomer ? 'open' : ''}`}>
                        {showAddCustomer && (
                            <AddCustomer
                                isEmbedded={true}
                                onSuccess={handleCustomerSuccess}
                                onCancel={() => setShowAddCustomer(false)}
                            />
                        )}
                    </div>
                </section>

                {/* Products Section */}
                <section className="pos-section" style={{ flex: 1 }}>
                    <div className="section-title">
                        <span>Products</span>
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setShowQuickProduct(true)}
                            title="Quick Add Product"
                        >
                            + Quick Add
                        </button>
                    </div>
                    <div className="product-search-wrapper">
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Search products by name, ISBN or SKU..."
                            value={productSearch}
                            onChange={e => setProductSearch(e.target.value)}
                        />
                    </div>

                    {!productSearch && availableCategories.length > 0 && (
                        <div className="category-filter">
                            <select
                                className="form-control form-control-sm"
                                value={selectedCategory}
                                onChange={e => setSelectedCategory(e.target.value)}
                            >
                                <option value="">All Categories</option>
                                {availableCategories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {isSearchingProducts ? (
                        <div className="loading-container"><div className="spinner"></div></div>
                    ) : (
                        <div className="product-grid">
                            {(productSearch ? productResults : (
                                // When "All Categories" is active, group products by category
                                // with uncategorized products at the end, then sort by name within each category
                                !selectedCategory
                                    ? [...popularProducts].sort((a, b) => {
                                        const catA = a.category_name || '';
                                        const catB = b.category_name || '';
                                        // Both uncategorized — sort by name
                                        if (!catA && !catB) return (a.name || '').localeCompare(b.name || '');
                                        // Uncategorized goes last
                                        if (!catA) return 1;
                                        if (!catB) return -1;
                                        // Same category — sort by name
                                        if (catA === catB) return (a.name || '').localeCompare(b.name || '');
                                        // Different category — sort by category name
                                        return catA.localeCompare(catB);
                                    })
                                    : popularProducts
                            )).map(p => {
                                const cartItem = cartItems.find(item => item.id === p.id);
                                const inCart = !!cartItem;
                                return (
                                    <div
                                        key={p.id}
                                        className={`product-card ${inCart ? 'in-cart' : ''}`}
                                        onClick={() => !inCart && addToCart(p)}
                                    >
                                        <div className="product-card-header">
                                            {p.primary_image_url && (
                                                <div className="product-card-image">
                                                    <img src={p.primary_image_url} alt={p.name} loading="lazy" />
                                                </div>
                                            )}
                                            <div className="product-card-name">{p.name}</div>
                                        </div>
                                        <div className="product-card-info">
                                            <span className="product-card-price">{currency}{Number(p.selling_price).toFixed(2)}</span>
                                            <span className={p.stock_quantity <= 5 ? 'text-danger' : ''}>
                                                Stock: {p.stock_quantity}
                                            </span>
                                        </div>
                                        {inCart ? (
                                            <div className="product-card-qty" onClick={e => e.stopPropagation()}>
                                                <button
                                                    className="qty-btn"
                                                    onClick={() => {
                                                        if (cartItem.quantity <= 1) {
                                                            removeFromCart(p.id);
                                                        } else {
                                                            updateQuantity(p.id, -1);
                                                        }
                                                    }}
                                                >−</button>
                                                <input
                                                    type="number"
                                                    className="qty-input"
                                                    value={cartItem.quantity}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        if (val === '' || val === '0') return;
                                                        setQuantity(p.id, val);
                                                    }}
                                                    onBlur={e => {
                                                        if (!e.target.value || parseInt(e.target.value, 10) <= 0) {
                                                            removeFromCart(p.id);
                                                        }
                                                    }}
                                                    min="1"
                                                    onClick={e => e.target.select()}
                                                />
                                                <button className="qty-btn" onClick={() => updateQuantity(p.id, 1)}>+</button>
                                            </div>
                                        ) : (
                                            <div className="product-card-add">Tap to add</div>
                                        )}
                                    </div>
                                );
                            })}
                            {productSearch && productResults.length === 0 && !isSearchingProducts && (
                                <div className="text-muted p-3">No products found</div>
                            )}
                            {!productSearch && popularProducts.length === 0 && (
                                <div className="text-muted p-3 text-center w-100">
                                    No products yet
                                </div>
                            )}
                        </div>
                    )}
                </section>
            </div >

            {/* Cart Drawer Overlay (mobile) */}
            {isDrawerOpen && <div className="cart-drawer-overlay" onClick={() => setIsDrawerOpen(false)} />}

            {/* Right Panel: Cart & Summary */}
            <div
                className={`pos-right-panel ${isDrawerOpen ? 'drawer-open' : ''}`}
                ref={drawerRef}
            >
                <div className="cart-header">
                    <span>Cart ({cartItems.length} items)</span>
                    {clearStage === 'idle' && (
                        <button className="btn btn-ghost btn-sm text-danger" onClick={() => setClearStage('confirming')}>Clear</button>
                    )}
                    {clearStage === 'confirming' && (
                        <span className="clear-confirming">Are you sure?</span>
                    )}
                    {clearStage === 'ready' && (
                        <div className="clear-actions">
                            <button className="btn btn-ghost btn-sm text-danger" onClick={() => { setCartItems([]); setClearStage('idle'); }}>Clear</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setClearStage('idle')}>Cancel</button>
                        </div>
                    )}
                </div>

                <div className="cart-items-list">
                    {cartItems.map(item => (
                        <div key={item.id} className="cart-item">
                            <div className="cart-item-main">
                                <div className="cart-item-details">
                                    <span className="cart-item-name">{item.name}</span>
                                    <span className="cart-item-price-info">
                                        {currency}<input type="number" className="cart-price-input" value={item.selling_price} onChange={e => updateItemPrice(item.id, e.target.value)} onBlur={e => { if (!e.target.value || parseFloat(e.target.value) < 0) updateItemPrice(item.id, 0); }} min="0" step="0.01" onClick={e => e.target.select()} /> × {item.quantity}
                                    </span>
                                </div>
                                <div className="cart-item-actions">
                                    <div className="qty-controls">
                                        <button className="qty-btn" onClick={() => {
                                            if (item.quantity <= 1) removeFromCart(item.id);
                                            else updateQuantity(item.id, -1);
                                        }}>-</button>
                                        <input
                                            type="number"
                                            className="qty-input-cart"
                                            value={item.quantity}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (val === '') return;
                                                setQuantity(item.id, val);
                                            }}
                                            onBlur={e => {
                                                if (!e.target.value || parseInt(e.target.value, 10) <= 0) {
                                                    removeFromCart(item.id);
                                                }
                                            }}
                                            min="1"
                                            onClick={e => e.target.select()}
                                        />
                                        <button className="qty-btn" onClick={() => updateQuantity(item.id, 1)}>+</button>
                                    </div>
                                    <button className="btn btn-ghost btn-sm text-danger" onClick={() => removeFromCart(item.id)}>×</button>
                                </div>
                            </div>
                            <div className="item-discount-row">
                                <span>Disc:</span>
                                <select
                                    className="form-control form-control-sm"
                                    style={{ width: '60px' }}
                                    value={item.discountType}
                                    onChange={e => updateItemDiscount(item.id, e.target.value, item.discountValue)}
                                >
                                    <option value="fixed">{currency}</option>
                                    <option value="percent">%</option>
                                </select>
                                <input
                                    type="number"
                                    className="form-control form-control-sm item-discount-input"
                                    value={item.discountValue}
                                    onChange={e => updateItemDiscount(item.id, item.discountType, e.target.value)}
                                />
                            </div>
                        </div>
                    ))}
                    {cartItems.length === 0 && (
                        <div className="text-center p-5 text-muted">
                            Cart is empty
                        </div>
                    )}
                </div>

                <div className="order-summary">
                    <div className="summary-row">
                        <span>Subtotal</span>
                        <span>{currency}{subtotal.toFixed(2)}</span>
                    </div>
                    <div className="summary-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span>Order Discount</span>
                            <select
                                className="form-control form-control-sm"
                                style={{ width: '50px', padding: '0 2px', height: '20px' }}
                                value={orderDiscount.type}
                                onChange={e => setOrderDiscount({ ...orderDiscount, type: e.target.value })}
                            >
                                <option value="fixed">{currency}</option>
                                <option value="percent">%</option>
                            </select>
                        </div>
                        <input
                            type="number"
                            className="form-control form-control-sm"
                            style={{ width: '60px', textAlign: 'right' }}
                            value={orderDiscount.value}
                            onChange={e => setOrderDiscount({ ...orderDiscount, value: parseFloat(e.target.value) || 0 })}
                        />
                    </div>
                    <div className="summary-row total">
                        <span>Total</span>
                        <span>{currency}{grandTotal.toFixed(2)}</span>
                    </div>
                </div>

                <div className="order-notes-section" style={{ padding: 'var(--space-sm) var(--page-padding) var(--space-md)' }}>
                    <label className="small text-muted" style={{ display: 'block', marginBottom: '4px', fontWeight: 600 }}>Order Notes (max 2000 chars)</label>
                    <textarea
                        className="form-control"
                        placeholder="Add internal order notes..."
                        maxLength={2000}
                        style={{
                            width: '100%',
                            minHeight: '60px',
                            resize: 'vertical',
                            fontSize: '0.9rem',
                            padding: '8px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-border)',
                            backgroundColor: 'var(--color-bg-tertiary)',
                            color: 'var(--color-text-primary)'
                        }}
                        value={orderNotes}
                        onChange={e => setOrderNotes(e.target.value)}
                    />
                </div>

                <div className="payment-section">
                    <UniversalPaymentEngine
                        key={payments.length} // Force reset on add
                        transactionType="inflow"
                        allowedMethods={['cash', 'upi', 'bank', 'cheque', ...(selectedCustomer && parseFloat(selectedCustomer.wallet_balance) > 0 ? ['store_credit'] : [])]}
                        initialAmount={balanceDue > 0 ? balanceDue : ''}
                        onValidPayload={setCurrentPaymentPayload}
                    >
                        {/* Option C: UPI Reference Input Fallback */}
                        {currentPaymentPayload && currentPaymentPayload.payment_method === 'upi' && (
                            <div className="form-group" style={{ marginTop: '10px' }}>
                                <label className="small text-muted">UPI Reference (Optional):</label>
                                <input 
                                    type="text"
                                    className="form-control form-control-sm"
                                    placeholder={`e.g. UTR (Defaults to QR-PAY-...)`}
                                    value={upiReferenceInput}
                                    onChange={e => setUpiReferenceInput(e.target.value)}
                                />
                            </div>
                        )}
                        <button 
                            className="btn btn-primary btn-sm w-100 mt-2" 
                            disabled={!currentPaymentPayload}
                            onClick={addPayment}
                        >
                            Add Payment
                        </button>
                    </UniversalPaymentEngine>

                    <div className="payments-list">
                        {payments.map((p, idx) => (
                            <div key={idx} className="payment-item">
                                <span>{p.method}</span>
                                <span className="d-flex align-items-center gap-2">
                                    {currency}{p.amount.toFixed(2)}
                                    <button
                                        className="btn-remove-payment"
                                        onClick={() => removePayment(idx)}
                                        title="Remove this payment"
                                    >
                                        ×
                                    </button>
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className={`balance-due ${balanceDue <= 0 ? 'balance-paid' : ''}`}>
                        <span>{balanceDue <= 0 ? 'Change/Balance' : 'Balance Due'}</span>
                        <span>{currency}{Math.abs(balanceDue).toFixed(2)}</span>
                    </div>
                    {
                        payments.length > 0 && (
                            <button className="btn btn-link btn-sm p-0 mt-1" onClick={clearPayments}>Clear Payments</button>
                        )
                    }
                </div >

                {cartItems.length > 0 && !selectedCustomer && (
                    <div className="inline-warning">
                        ⚠ Please select a customer or quick-add one
                    </div>
                )}

                <div className="pos-actions">
                    <button
                        type="button"
                        className="btn btn-secondary btn-full"
                        disabled={isLoading || cartItems.length === 0 || !selectedCustomer}
                        onClick={() => {
                            if (window.confirm('Save this order as a draft (held order)? The form will reset after saving.')) {
                                submitOrder('draft');
                            }
                        }}
                    >
                        {isLoading ? 'Saving...' : 'Hold Order'}
                    </button>
                    {isDrawerOpen && (
                        <button
                            className="btn btn-ghost btn-full"
                            onClick={() => {
                                if (drawerRef.current) drawerRef.current.style.transform = '';
                                setIsDrawerOpen(false);
                            }}
                        >
                            ← Back
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn-success btn-full complete-btn"
                        disabled={isLoading || cartItems.length === 0 || !selectedCustomer}
                        onClick={() => submitOrder('confirmed')}
                    >
                        {isLoading ? 'Processing...' :
                            cartItems.length === 0 ? '+ Add items to confirm' :
                                'Confirm Order ✓'}
                    </button>
                </div>
            </div >


            {/* Quick Product Modal (P4 3.3.1.2.3: Name, Estimated Price, Category, Reference Photo) */}
            {
                showQuickProduct && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h3>Quick Add Product</h3>
                            <form onSubmit={handleCreateProduct}>
                                <div className="form-group">
                                    <label>Product Name</label>
                                    <input
                                        type="text"
                                        required
                                        className="form-control"
                                        value={newProduct.name}
                                        onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                                    />
                                </div>
                                <div className="form-row">
                                    <div className="form-group col-6">
                                        <label>Estimated Price</label>
                                        <input
                                            type="number"
                                            required
                                            min="0"
                                            step="0.01"
                                            className="form-control"
                                            value={newProduct.selling_price}
                                            onChange={e => setNewProduct({ ...newProduct, selling_price: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group col-6">
                                        <label>Category</label>
                                        <select
                                            className="form-control"
                                            value={newProduct.category}
                                            onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}
                                        >
                                            <option value="">— Select —</option>
                                            {availableCategories.map(cat => (
                                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Reference Photo</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <label className="btn btn-secondary btn-sm" style={{ flex: 1, textAlign: 'center', cursor: 'pointer', padding: '0.5rem' }}>
                                            📁 Upload Image
                                            <input type="file" accept="image/*" onChange={e => setReferencePhoto(e.target.files[0] || null)} hidden />
                                        </label>
                                        <label className="btn btn-secondary btn-sm" style={{ flex: 1, textAlign: 'center', cursor: 'pointer', padding: '0.5rem' }}>
                                            📷 Take Photo
                                            <input type="file" accept="image/*" capture="environment" onChange={e => setReferencePhoto(e.target.files[0] || null)} hidden />
                                        </label>
                                    </div>
                                    {referencePhoto && (
                                        <div className="mt-2 small text-muted" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--bg-card)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '8px' }}>
                                                Selected: {referencePhoto.name}
                                            </span>
                                            <button 
                                                type="button" 
                                                onClick={() => setReferencePhoto(null)} 
                                                style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}
                                                title="Remove selection"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn btn-ghost" onClick={() => {
                                        setShowQuickProduct(false);
                                        setReferencePhoto(null);
                                    }}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={isCreatingProduct}>
                                        {isCreatingProduct ? 'Creating...' : 'Create & Add'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }


        </div >
    );
}