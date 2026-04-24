import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import AddCustomer from '../customers/AddCustomer';
import { useToast } from '../../context/ToastContext';
import { useCart } from '../../context/CartContext';
import '../NewOrder.css'; // Reusing POS styles
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
    const [cartItems, setCartItems] = useState([]); // Items to be saved
    const [orderDiscount, setOrderDiscount] = useState({ type: 'fixed', value: 0 });

    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [isSearchingProducts, setIsSearchingProducts] = useState(false);
    const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);

    // Quick Product Modal
    const [showQuickProduct, setShowQuickProduct] = useState(false);
    const [newProduct, setNewProduct] = useState({
        name: '',
        selling_price: '',
        cost_price: '',
        stock_quantity: 1,
        is_additional: true
    });
    const [isCreatingProduct, setIsCreatingProduct] = useState(false);

    // Drawer panel ref
    const drawerRef = useRef(null);
    const isDrawerOpenRef = useRef(isDrawerOpen);
    isDrawerOpenRef.current = isDrawerOpen;

    const cartLengthRef = useRef(cartItems.length);
    cartLengthRef.current = cartItems.length;

    // Mobile back-button drawer guard
    useEffect(() => {
        const needsGuard = isDrawerOpen;
        if (!needsGuard) return;

        window.history.pushState({ posGuard: true }, '');

        const onPopState = () => {
            if (isDrawerOpenRef.current) {
                setIsDrawerOpen(false);
                if (drawerRef.current) drawerRef.current.style.transform = '';
            } else {
                window.history.back();
            }
        };

        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [isDrawerOpen]);

    // Sync cart to BottomNavBar
    useEffect(() => {
        // We calculate total inside the render, but we need it here for the effect.
        // It's safe to just re-calculate or rely on the grandTotal variable below.
        // To avoid circular dependencies, we'll sync it after grandTotal is computed.
    }, []); // Handled below

    // Fetch Order Data
    useEffect(() => {
        const fetchOrder = async () => {
            try {
                const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}${id}/`);
                if (response.ok) {
                    const data = await response.json();

                    if (data.delivery_status === 'delivered') {
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
    }, [id, fetchWithAuth, navigate]);

    // --- Search Logic (Duplicated from NewOrder for now) ---
    useEffect(() => {
        if (!customerSearch || customerSearch.length < 2) {
            setCustomerResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setIsSearchingCustomers(true);
            try {
                const response = await fetchWithAuth(`${ENDPOINTS.CUSTOMERS}?search=${customerSearch}`);
                if (response.ok) {
                    const data = await response.json();
                    setCustomerResults(data.results || []);
                }
            } finally { setIsSearchingCustomers(false); }
        }, 500);
        return () => clearTimeout(timer);
    }, [customerSearch, fetchWithAuth]);

    useEffect(() => {
        if (!productSearch) {
            setProductResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setIsSearchingProducts(true);
            try {
                const response = await fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}?search=${productSearch}`);
                if (response.ok) {
                    const data = await response.json();
                    setProductResults(data.results || []);
                }
            } finally { setIsSearchingProducts(false); }
        }, 500);
        return () => clearTimeout(timer);
    }, [productSearch, fetchWithAuth]);

    // --- Cart Actions ---
    const addToCart = (product) => {
        setCartItems(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            return [...prev, { ...product, quantity: 1, discountType: 'fixed', discountValue: 0 }];
        });
        setProductSearch('');
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

    const removeFromCart = (id) => setCartItems(prev => prev.filter(item => item.id !== id));

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
        setCartData(cartItems, grandTotal);
    }, [cartItems, grandTotal, setCartData]);

    // I-04 fix: Submission lock to prevent duplicate PUT requests
    const isSubmittingRef = useRef(false);

    // --- Submit ---
    const handleUpdateOrder = async () => {
        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;
        setProcessing(true);
        try {
            const orderData = {
                customer: selectedCustomer?.id || null,
                discount_type: orderDiscount.type,
                discount_value: orderDiscount.value,
                client_updated_at: originalOrder?.updated_at || '',
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
                setCartData([], 0); // Clear global cart
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

    // --- Quick Product Create ---
    const handleCreateProduct = async (e) => {
        e.preventDefault();
        setIsCreatingProduct(true);
        try {
            const response = await fetchWithAuth(ENDPOINTS.INVENTORY_PRODUCTS, {
                method: 'POST',
                body: JSON.stringify(newProduct)
            });
            if (response.ok) {
                const product = await response.json();
                addToCart(product);
                setShowQuickProduct(false);
                setNewProduct({ name: '', selling_price: '', cost_price: '', stock_quantity: 1, is_additional: true });
            } else {
                showToast('Failed to create product', 'error');
            }
        } finally { setIsCreatingProduct(false); }
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div className="pos-container">
            {/* Reusing POS Layout Structure */}
            <div className="pos-left-panel">
                <div className="mb-3">
                </div>

                {/* Customer Section */}
                <section className="pos-section">
                    <div className="section-title">Customer</div>
                    {/* Simplified customer edit for Edit Mode main focus on items */}
                    {selectedCustomer ? (
                        <div className="selected-customer-card">
                            <strong>{selectedCustomer.name}</strong>
                            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedCustomer(null)}>Change</button>
                        </div>
                    ) : (
                        <div className="customer-search-wrapper">
                            <input className="form-control" placeholder="Search customer..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
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
                        <span>Add Products</span>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowQuickProduct(true)}>+ Quick Add</button>
                    </div>
                    <div className="product-search-wrapper">
                        <input className="form-control" placeholder="Search products..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                    </div>
                    <div className="product-grid">
                        {productResults.map(p => (
                            <div key={p.id} className="product-card" onClick={() => addToCart(p)}>
                                <div className="product-card-name">{p.name}</div>
                                <div className="product-card-info">{currency}{p.selling_price}</div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {/* Cart Drawer Overlay (mobile) */}
            {isDrawerOpen && <div className="cart-drawer-overlay" onClick={() => setIsDrawerOpen(false)} />}

            {/* Right Panel: Cart */}
            <div className={`pos-right-panel ${isDrawerOpen ? 'drawer-open' : ''}`} ref={drawerRef}>
                <div className="cart-header">
                    <span>Editing Items ({cartItems.length})</span>
                </div>

                <div className="cart-items-list">
                    {cartItems.map(item => (
                        <div key={item.id} className="cart-item">
                            <div className="cart-item-main">
                                <span className="cart-item-name">{item.name}</span>
                                <div className="cart-item-actions">
                                    <button className="qty-btn" onClick={() => updateQuantity(item.id, -1)}>-</button>
                                    <span className="qty-val">{item.quantity}</span>
                                    <button className="qty-btn" onClick={() => updateQuantity(item.id, 1)}>+</button>
                                    <button className="btn btn-ghost btn-sm text-danger" onClick={() => removeFromCart(item.id)}>×</button>
                                </div>
                            </div>
                            <div className="item-discount-row">
                                <select className="form-control form-control-sm" value={item.discountType} onChange={e => updateItemDiscount(item.id, e.target.value, item.discountValue)}>
                                    <option value="fixed">{currency}</option>
                                    <option value="percent">%</option>
                                </select>
                                <input type="number" className="form-control form-control-sm" value={item.discountValue} onChange={e => updateItemDiscount(item.id, item.discountType, e.target.value)} />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="order-summary">
                    <div className="summary-row"><span>Subtotal</span><span>{currency}{subtotal.toFixed(2)}</span></div>
                    <div className="summary-row">
                        <span>Order Discount</span>
                        <div style={{ display: 'flex' }}>
                            <select value={orderDiscount.type} onChange={e => setOrderDiscount({ ...orderDiscount, type: e.target.value })}>
                                <option value="fixed">{currency}</option>
                                <option value="percent">%</option>
                            </select>
                            <input type="number" value={orderDiscount.value} onChange={e => setOrderDiscount({ ...orderDiscount, value: e.target.value })} style={{ width: '60px' }} />
                        </div>
                    </div>
                    <div className="summary-row total"><span>Total</span><span>{currency}{grandTotal.toFixed(2)}</span></div>
                </div>

                <div className="pos-actions">
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
                            <div className="form-group"><label>Name</label><input className="form-control" value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} required /></div>
                            <div className="form-group"><label>Price</label><input type="number" className="form-control" value={newProduct.selling_price} onChange={e => setNewProduct({ ...newProduct, selling_price: e.target.value })} required /></div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowQuickProduct(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Create</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
