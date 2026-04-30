import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import { useToast } from '../../context/ToastContext';
import { useCart } from '../../context/CartContext';
import '../NewOrder.css';
import LoadingSpinner from '../../components/common/LoadingSpinner';

export default function EditOrder() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { showToast } = useToast();
    const { isDrawerOpen, setIsDrawerOpen, setCartData } = useCart();

    // State
    const [originalOrder, setOriginalOrder] = useState(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerResults, setCustomerResults] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);

    const [productSearch, setProductSearch] = useState('');
    const [productResults, setProductResults] = useState([]);
    const [popularProducts, setPopularProducts] = useState([]);
    const [cartItems, setCartItems] = useState([]);
    const [orderDiscount, setOrderDiscount] = useState({ type: 'fixed', value: 0 });

    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [isSearchingProducts, setIsSearchingProducts] = useState(false);
    const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
    const [availableCategories, setAvailableCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [clearStage, setClearStage] = useState('idle');

    // Quick Product Modal
    const [showQuickProduct, setShowQuickProduct] = useState(false);
    const [newProduct, setNewProduct] = useState({
        name: '',
        selling_price: '',
        category: '',
        is_additional: true
    });
    const [referencePhoto, setReferencePhoto] = useState(null);
    const [isCreatingProduct, setIsCreatingProduct] = useState(false);

    // AbortController refs for search race condition prevention
    const customerAbortRef = useRef(null);
    const productAbortRef = useRef(null);

    // Drawer panel ref
    const drawerRef = useRef(null);
    const isDrawerOpenRef = useRef(isDrawerOpen);
    isDrawerOpenRef.current = isDrawerOpen;

    const cartLengthRef = useRef(cartItems.length);
    cartLengthRef.current = cartItems.length;

    // Unsaved-work detection (compares against original loaded order)
    const hasUnsavedWork = () => cartLengthRef.current > 0;

    // Warn on browser refresh/close when there's unsaved work
    useEffect(() => {
        const onBeforeUnload = (e) => {
            if (hasUnsavedWork()) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, []);

    // Unified back-button handler: drawer close > unsaved work guard > allow navigation
    useEffect(() => {
        const needsGuard = isDrawerOpen || cartItems.length > 0;
        if (!needsGuard) return;

        window.history.pushState({ posGuard: true }, '');

        const onPopState = () => {
            if (isDrawerOpenRef.current) {
                setIsDrawerOpen(false);
                if (drawerRef.current) drawerRef.current.style.transform = '';
                if (hasUnsavedWork()) {
                    window.history.pushState({ posGuard: true }, '');
                }
                return;
            }
            if (hasUnsavedWork()) {
                if (window.confirm('You have unsaved changes to this order. Leave this page?')) {
                    window.history.back();
                } else {
                    window.history.pushState({ posGuard: true }, '');
                }
                return;
            }
            window.history.back();
        };

        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [isDrawerOpen, cartItems.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch Order Data
    useEffect(() => {
        const fetchOrder = async () => {
            try {
                const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}${id}/`);
                if (response.ok) {
                    const data = await response.json();

                    if (data.delivery_status !== 'pending') {
                        showToast('Delivered orders cannot be edited.', 'warning');
                        navigate(`/orders/${id}`);
                        return;
                    }

                    setOriginalOrder(data);

                    // Populate State
                    if (data.customer) {
                        setSelectedCustomer({
                            id: data.customer,
                            name: data.customer_name,
                            phone: data.customer_phone
                        });
                    }

                    setOrderDiscount({ type: data.discount_type || 'fixed', value: parseFloat(data.discount_value) || 0 });

                    // Map items to cart format
                    const mappedItems = data.items.map(item => ({
                        id: item.product, // Product ID
                        name: item.product_name,
                        selling_price: parseFloat(item.unit_price),
                        quantity: item.quantity,
                        discountType: item.discount_type || 'fixed',
                        discountValue: parseFloat(item.discount_value) || 0,
                        stock_quantity: item.product_stock ?? 9999
                    }));
                    setCartItems(mappedItems);

                } else {
                    showToast('Failed to load order', 'error');
                    navigate('/orders');
                }
            } catch (error) {
                console.error("Error loading order:", error);
                navigate('/orders');
            } finally {
                setLoading(false);
            }
        };
        fetchOrder();
    }, [id, fetchWithAuth, navigate, showToast]);

    // Debounced Customer Search (with AbortController)
    useEffect(() => {
        if (!customerSearch || customerSearch.length < 2) {
            setCustomerResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            if (customerAbortRef.current) customerAbortRef.current.abort();
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
                if (error.name !== 'AbortError') console.error('Error searching customers:', error);
            } finally {
                setIsSearchingCustomers(false);
            }
        }, 500);
        return () => {
            clearTimeout(timer);
            if (customerAbortRef.current) customerAbortRef.current.abort();
        };
    }, [customerSearch, fetchWithAuth]);

    // Debounced Product Search (with AbortController)
    useEffect(() => {
        if (!productSearch) {
            setProductResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            if (productAbortRef.current) productAbortRef.current.abort();
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
                if (error.name !== 'AbortError') console.error('Error searching products:', error);
            } finally {
                setIsSearchingProducts(false);
            }
        }, 500);
        return () => {
            clearTimeout(timer);
            if (productAbortRef.current) productAbortRef.current.abort();
        };
    }, [productSearch, fetchWithAuth, selectedCategory]);

    // Fetch popular products (ordered by order_count desc)
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

    // Fetch categories
    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const res = await fetchWithAuth(ENDPOINTS.INVENTORY_CATEGORIES);
                if (res.ok) {
                    const data = await res.json();
                    const cats = (data.results || data).slice();
                    cats.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                    setAvailableCategories(cats);
                }
            } catch (error) {
                console.error('Error fetching categories:', error);
            }
        };
        fetchCategories();
    }, [fetchWithAuth]);

    // --- Cart Actions ---
    const addToCart = (product) => {
        if (product.stock_quantity <= 0) {
            showToast(`⚠ ${product.name} is out of stock (${product.stock_quantity}). Adding anyway.`, 'warning');
        }
        setCartItems(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            return [...prev, { ...product, quantity: 1, discountType: 'fixed', discountValue: 0 }];
        });
        setProductSearch('');
        setProductResults([]);
    };

    const updateQuantity = (id, delta) => {
        setCartItems(prev => prev.map(item => {
            if (item.id === id) return { ...item, quantity: Math.max(1, item.quantity + delta) };
            return item;
        }));
    };

    const updateItemDiscount = (id, type, value) => {
        setCartItems(prev => prev.map(item => item.id === id ? { ...item, discountType: type, discountValue: parseFloat(value) || 0 } : item));
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

    // --- Totals ---
    const subtotal = useMemo(() => cartItems.reduce((sum, item) => {
        const itemTotal = item.selling_price * item.quantity;
        const discount = item.discountType === 'fixed' ? item.discountValue : (itemTotal * item.discountValue / 100);
        return sum + (itemTotal - discount);
    }, 0), [cartItems]);

    const totalDiscount = useMemo(() => {
        if (orderDiscount.type === 'fixed') {
            return Math.min(orderDiscount.value, subtotal);
        }
        return (subtotal * Math.min(orderDiscount.value, 100)) / 100;
    }, [subtotal, orderDiscount]);

    const grandTotal = Math.max(0, subtotal - totalDiscount);

    // Sync to global CartContext for BottomNavBar
    useEffect(() => {
        setCartData(cartItems.length, grandTotal);
    }, [cartItems, grandTotal, setCartData]);

    // Clear cart confirmation timer
    useEffect(() => {
        if (clearStage === 'confirming') {
            const timer = setTimeout(() => setClearStage('ready'), 1000);
            return () => clearTimeout(timer);
        }
    }, [clearStage]);

    // I-04 fix: Submission lock to prevent duplicate PUT requests
    const isSubmittingRef = useRef(false);

    // --- Submit ---
    const handleUpdateOrder = async () => {
        if (cartItems.length === 0) {
            showToast('Cannot save an order with no items', 'warning');
            return;
        }
        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;
        setProcessing(true);
        try {
            const orderData = {
                customer: selectedCustomer?.id || null,
                discount_type: orderDiscount.type,
                discount_value: orderDiscount.value,
                client_updated_at: originalOrder?.updated_at || null,
                items: cartItems.map(item => ({
                    product: item.id,
                    quantity: item.quantity,
                    unit_price: item.selling_price,
                    discount_type: item.discountType,
                    discount_value: item.discountValue
                }))
            };

            const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}${id}/`, {
                method: 'PUT',
                body: JSON.stringify(orderData)
            });

            if (response.ok) {
                showToast('Order updated successfully', 'success');
                setIsDrawerOpen(false);
                setCartData(0, 0);
                navigate(`/orders/${id}`);
            } else if (response.status === 409) {
                showToast('This order was modified by someone else. Please reload and try again.', 'warning');
            } else {
                const err = await response.json();
                showToast('Update failed: ' + JSON.stringify(err), 'error');
            }
        } catch (error) {
            console.error(error);
            showToast('Error updating order', 'error');
        } finally {
            isSubmittingRef.current = false;
            setProcessing(false);
        }
    };

    // --- Quick Product Create (FormData for photo upload) ---
    const handleCreateProduct = async (e) => {
        e.preventDefault();
        setIsCreatingProduct(true);
        try {
            const formData = new FormData();
            formData.append('name', newProduct.name);
            formData.append('selling_price', newProduct.selling_price);
            formData.append('cost_price', newProduct.selling_price);
            formData.append('is_additional', 'true');
            formData.append('stock_quantity', '0');
            if (newProduct.category) formData.append('category', newProduct.category);
            if (referencePhoto) formData.append('images', referencePhoto);

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
        } finally { setIsCreatingProduct(false); }
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div className="pos-container fade-in">
            <div className="pos-left-panel">

                {/* Customer Section */}
                <section className="pos-section">
                    <div className="section-title"><span>Customer</span></div>
                    {selectedCustomer ? (
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
                    ) : (
                        <div className="customer-search-wrapper">
                            <input type="text" className="form-control" placeholder="Search customer by name or phone..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
                            {isSearchingCustomers && <div className="spinner-small"></div>}
                            {customerResults.length > 0 && (
                                <div className="search-results-dropdown">
                                    {customerResults.map(c => (
                                        <div key={c.id} className="search-result-item" onClick={() => {
                                            setSelectedCustomer({
                                                ...c,
                                                name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()
                                            });
                                            setCustomerResults([]);
                                            setCustomerSearch('');
                                        }}>
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
                    )}
                </section>

                {/* Products Section */}
                <section className="pos-section" style={{ flex: 1 }}>
                    <div className="section-title">
                        <span>Products</span>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowQuickProduct(true)} title="Quick Add Product">+ Quick Add</button>
                    </div>
                    <div className="product-search-wrapper">
                        <input type="text" className="form-control" placeholder="Search products by name, ISBN or SKU..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                    </div>

                    {!productSearch && availableCategories.length > 0 && (
                        <div className="category-filter">
                            <select className="form-control form-control-sm" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
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
                                !selectedCategory
                                    ? [...popularProducts].sort((a, b) => {
                                        const catA = a.category_name || '';
                                        const catB = b.category_name || '';
                                        if (!catA && !catB) return 0;
                                        if (!catA) return 1;
                                        if (!catB) return -1;
                                        return catA.localeCompare(catB);
                                    })
                                    : popularProducts
                            )).map(p => {
                                const cartItem = cartItems.find(item => item.id === p.id);
                                const inCart = !!cartItem;
                                return (
                                    <div key={p.id} className={`product-card ${inCart ? 'in-cart' : ''}`} onClick={() => !inCart && addToCart(p)}>
                                        <div className="product-card-name">{p.name}</div>
                                        <div className="product-card-info">
                                            <span className="product-card-price">{currency}{Number(p.selling_price).toFixed(2)}</span>
                                            <span className={p.stock_quantity <= 5 ? 'text-danger' : ''}>Stock: {p.stock_quantity}</span>
                                        </div>
                                        {inCart ? (
                                            <div className="product-card-qty" onClick={e => e.stopPropagation()}>
                                                <button className="qty-btn" onClick={() => { if (cartItem.quantity <= 1) removeFromCart(p.id); else updateQuantity(p.id, -1); }}>−</button>
                                                <input type="number" className="qty-input" value={cartItem.quantity} onChange={e => { const val = e.target.value; if (val === '' || val === '0') return; setQuantity(p.id, val); }} onBlur={e => { if (!e.target.value || parseInt(e.target.value, 10) <= 0) removeFromCart(p.id); }} min="1" onClick={e => e.target.select()} />
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
                                <div className="text-muted p-3 text-center w-100">No products yet</div>
                            )}
                        </div>
                    )}
                </section>
            </div>

            {/* Cart Drawer Overlay (mobile) */}
            {isDrawerOpen && <div className="cart-drawer-overlay" onClick={() => setIsDrawerOpen(false)} />}

            {/* Right Panel: Cart */}
            <div className={`pos-right-panel ${isDrawerOpen ? 'drawer-open' : ''}`} ref={drawerRef}>
                <div className="cart-header">
                    <span>Editing Items ({cartItems.length})</span>
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
                                        <button className="qty-btn" onClick={() => updateQuantity(item.id, -1)}>-</button>
                                        <span className="qty-val">{item.quantity}</span>
                                        <button className="qty-btn" onClick={() => updateQuantity(item.id, 1)}>+</button>
                                    </div>
                                    <button className="btn btn-ghost btn-sm text-danger" onClick={() => removeFromCart(item.id)}>×</button>
                                </div>
                            </div>
                            <div className="item-discount-row">
                                <span>Disc:</span>
                                <select className="form-control form-control-sm" style={{ width: '60px' }} value={item.discountType} onChange={e => updateItemDiscount(item.id, e.target.value, item.discountValue)}>
                                    <option value="fixed">{currency}</option>
                                    <option value="percent">%</option>
                                </select>
                                <input type="number" className="form-control form-control-sm item-discount-input" value={item.discountValue} onChange={e => updateItemDiscount(item.id, item.discountType, e.target.value)} />
                            </div>
                        </div>
                    ))}
                    {cartItems.length === 0 && (
                        <div className="text-center p-5 text-muted">Cart is empty</div>
                    )}
                </div>

                <div className="order-summary">
                    <div className="summary-row"><span>Subtotal</span><span>{currency}{subtotal.toFixed(2)}</span></div>
                    <div className="summary-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span>Order Discount</span>
                            <select className="form-control form-control-sm" style={{ width: '50px', padding: '0 2px', height: '20px' }} value={orderDiscount.type} onChange={e => setOrderDiscount({ ...orderDiscount, type: e.target.value })}>
                                <option value="fixed">{currency}</option>
                                <option value="percent">%</option>
                            </select>
                        </div>
                        <input type="number" className="form-control form-control-sm" style={{ width: '60px', textAlign: 'right' }} value={orderDiscount.value} onChange={e => setOrderDiscount({ ...orderDiscount, value: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="summary-row total"><span>Total</span><span>{currency}{grandTotal.toFixed(2)}</span></div>
                </div>

                <div className="pos-actions">
                    {isDrawerOpen && (
                        <button className="btn btn-ghost btn-full" onClick={() => { if (drawerRef.current) drawerRef.current.style.transform = ''; setIsDrawerOpen(false); }}>
                            ← Back
                        </button>
                    )}
                    <button className="btn btn-primary btn-full complete-btn" onClick={handleUpdateOrder} disabled={processing}>
                        {processing ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {/* Quick Product Modal */}
            {showQuickProduct && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Quick Add Product</h3>
                        <form onSubmit={handleCreateProduct}>
                            <div className="form-group">
                                <label>Product Name</label>
                                <input type="text" required className="form-control" value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} />
                            </div>
                            <div className="form-row">
                                <div className="form-group col-6">
                                    <label>Estimated Price</label>
                                    <input type="number" required min="0" step="0.01" className="form-control" value={newProduct.selling_price} onChange={e => setNewProduct({ ...newProduct, selling_price: e.target.value })} />
                                </div>
                                <div className="form-group col-6">
                                    <label>Category</label>
                                    <select className="form-control" value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}>
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
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '8px' }}>Selected: {referencePhoto.name}</span>
                                        <button type="button" onClick={() => setReferencePhoto(null)} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }} title="Remove selection">×</button>
                                    </div>
                                )}
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => { setShowQuickProduct(false); setReferencePhoto(null); }}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={isCreatingProduct}>
                                    {isCreatingProduct ? 'Creating...' : 'Create & Add'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
