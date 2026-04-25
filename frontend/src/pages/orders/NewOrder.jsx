import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useCart } from '../../context/CartContext';
import { ENDPOINTS } from '../../config/api';
import AddCustomer from '../customers/AddCustomer';
import { useToast } from '../../context/ToastContext';
import '../NewOrder.css';

export default function NewOrder() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { isDrawerOpen, setIsDrawerOpen, setCartData } = useCart();
    const { showToast } = useToast();

    // State
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerResults, setCustomerResults] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [isQuickAdd, setIsQuickAdd] = useState(false);
    const [quickAddInfo, setQuickAddInfo] = useState({ first_name: '', phone: '' });
    const [isQuickAddSaving, setIsQuickAddSaving] = useState(false);
    const [quickAddPhoneWarning, setQuickAddPhoneWarning] = useState('');

    const [productSearch, setProductSearch] = useState('');
    const [productResults, setProductResults] = useState([]);
    const [popularProducts, setPopularProducts] = useState([]);
    const [cartItems, setCartItems] = useState([]);
    const [orderDiscount, setOrderDiscount] = useState({ type: 'fixed', value: 0 });

    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [selectedUpiAccount, setSelectedUpiAccount] = useState('');
    const [paymentAmount, setPaymentAmount] = useState('');
    const [payments, setPayments] = useState([]);

    const [availablePaymentMethods, setAvailablePaymentMethods] = useState([]);
    const [availableUpiAccounts, setAvailableUpiAccounts] = useState([]);
    const [availableBankAccounts, setAvailableBankAccounts] = useState([]);
    const [availableCashWallets, setAvailableCashWallets] = useState([]);
    const [selectedDestination, setSelectedDestination] = useState('');
    const [availableCategories, setAvailableCategories] = useState([]);

    const [isLoading, setIsLoading] = useState(false);
    const [isSearchingProducts, setIsSearchingProducts] = useState(false);
    const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
    const [clearStage, setClearStage] = useState('idle'); // idle → confirming → ready
    const [selectedCategory, setSelectedCategory] = useState('');

    // Quick Product Modal State (P4 3.3.1.2.3: Name, Estimated Price, Category, Reference Photo)
    const [showQuickProduct, setShowQuickProduct] = useState(false);
    const [showAddCustomer, setShowAddCustomer] = useState(false);
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

    // Synchronous submission lock — prevents rapid-fire duplicate orders (VULN-3)
    const isSubmittingRef = useRef(false);

    // Drawer panel ref
    const drawerRef = useRef(null);
    const isDrawerOpenRef = useRef(isDrawerOpen);
    isDrawerOpenRef.current = isDrawerOpen;

    // Refs for unsaved-work detection (used in event handlers to avoid stale closures)
    const cartLengthRef = useRef(cartItems.length);
    cartLengthRef.current = cartItems.length;
    const showAddCustomerRef = useRef(showAddCustomer);
    showAddCustomerRef.current = showAddCustomer;
    const quickAddInfoRef = useRef(quickAddInfo);
    quickAddInfoRef.current = quickAddInfo;
    const isQuickAddRef = useRef(isQuickAdd);
    isQuickAddRef.current = isQuickAdd;

    // Unified check: is there ANY unsaved work on this page?
    const hasUnsavedWork = () => {
        if (cartLengthRef.current > 0) return true;
        if (showAddCustomerRef.current) return true; // AddCustomer form is open
        if (isQuickAddRef.current) {
            const qa = quickAddInfoRef.current;
            if (qa.first_name?.trim() || qa.phone?.trim()) return true;
        }
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
        const needsGuard = isDrawerOpen || cartItems.length > 0 || showAddCustomer || (isQuickAdd && (quickAddInfo.first_name?.trim() || quickAddInfo.phone?.trim()));
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
                const msg = cartLengthRef.current > 0 && showAddCustomerRef.current
                    ? 'You have items in your cart and unsaved customer details. Leave this page?'
                    : cartLengthRef.current > 0
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
    }, [isDrawerOpen, cartItems.length > 0, showAddCustomer, isQuickAdd, quickAddInfo.first_name, quickAddInfo.phone]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Fetch Payment Methods, UPI Accounts, and Categories
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                // Fetch enabled payment methods
                const methodsRes = await fetchWithAuth(ENDPOINTS.SETTINGS_PAYMENT_METHODS);
                if (methodsRes.ok) {
                    const methodsData = await methodsRes.json();
                    const enabled = (methodsData.results || methodsData).filter(m => m.is_enabled);
                    setAvailablePaymentMethods(enabled);
                    if (enabled.length > 0) {
                        setPaymentMethod(enabled[0].id);
                    }
                }

                // Fetch active UPI accounts
                const upiRes = await fetchWithAuth(ENDPOINTS.SETTINGS_UPI_ACCOUNTS);
                if (upiRes.ok) {
                    const upiData = await upiRes.json();
                    const active = (upiData.results || upiData).filter(u => u.is_active);
                    setAvailableUpiAccounts(active);
                    if (active.length > 0) {
                        setSelectedUpiAccount(active[0].upi_id);
                    }
                }

                // Fetch Bank Accounts
                const bankRes = await fetchWithAuth(ENDPOINTS.FINANCE_BANK_ACCOUNTS + '?active_only=true');
                if (bankRes.ok) {
                    const bankData = await bankRes.json();
                    setAvailableBankAccounts(bankData.results || bankData);
                }

                // Fetch Cash Wallets
                const walletRes = await fetchWithAuth(ENDPOINTS.FINANCE_CASH_WALLETS + '?active_only=true');
                if (walletRes.ok) {
                    const walletData = await walletRes.json();
                    setAvailableCashWallets(walletData.results || walletData);
                }

                // Fetch categories for Quick Add Product
                const catRes = await fetchWithAuth(ENDPOINTS.INVENTORY_CATEGORIES);
                if (catRes.ok) {
                    const catData = await catRes.json();
                    setAvailableCategories(catData.results || catData);
                }
            } catch (error) {
                console.error('Error fetching settings:', error);
            }
        };

        fetchSettings();
    }, [fetchWithAuth]);

    // ── Product Set Auto-Load (Tribunal: auto-load when customer selected) ──
    const lastSetLoadedForRef = useRef(null);

    useEffect(() => {
        if (!selectedCustomer) {
            lastSetLoadedForRef.current = null;
            return;
        }

        // Get class name from either school-based or independent assignment
        const className = selectedCustomer.effective_class_name
            || selectedCustomer.class_name
            || null;
        if (!className) return;

        // Don't re-load if we already loaded for this customer
        const customerKey = `${selectedCustomer.id}-${className}`;
        if (lastSetLoadedForRef.current === customerKey) return;
        lastSetLoadedForRef.current = customerKey;

        const loadProductSet = async () => {
            try {
                let url = `${ENDPOINTS.PRODUCT_SETS_RESOLVE}?class_name=${encodeURIComponent(className)}`;
                if (selectedCustomer.school_id) {
                    url += `&school_id=${selectedCustomer.school_id}`;
                }
                // Pass division/subdivision for higher-specificity matching
                const divName = selectedCustomer.effective_division_name || selectedCustomer.division_name || '';
                const subName = selectedCustomer.effective_subdivision_name || selectedCustomer.subdivision_name || '';
                if (divName) {
                    url += `&division_name=${encodeURIComponent(divName)}`;
                }
                if (subName) {
                    url += `&subdivision_name=${encodeURIComponent(subName)}`;
                }

                const res = await fetchWithAuth(url);
                if (!res.ok) return; // No matching set

                const data = await res.json();
                const productSet = data.product_set;
                if (!productSet?.items?.length) return;

                // Auto-add items to cart
                let outOfStockItems = [];

                setCartItems(prev => {
                    const updated = [...prev];
                    for (const setItem of productSet.items) {
                        const existing = updated.find(ci => ci.id === setItem.product);
                        if (existing) {
                            if (setItem.quantity > existing.quantity) {
                                existing.quantity = setItem.quantity;
                            }
                        } else {
                            updated.push({
                                id: setItem.product,
                                name: setItem.product_name,
                                selling_price: setItem.selling_price,
                                cost_price: setItem.cost_price,
                                stock_quantity: setItem.stock_quantity,
                                quantity: setItem.quantity,
                                discountType: 'fixed',
                                discountValue: 0,
                            });
                            if (setItem.stock_quantity <= 0) {
                                outOfStockItems.push(setItem.product_name);
                            }
                        }
                    }
                    return updated;
                });

                showToast(
                    `📦 "${productSet.name}" loaded — ${productSet.items.length} items`,
                    'success'
                );
                if (outOfStockItems.length > 0) {
                    showToast(
                        `⚠ Out of stock: ${outOfStockItems.join(', ')}`,
                        'warning',
                        { duration: 6000 }
                    );
                }
            } catch (err) {
                console.error('Product set auto-load failed:', err);
            }
        };

        loadProductSet();
    }, [selectedCustomer, fetchWithAuth, showToast]);

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
        const amt = parseFloat(paymentAmount);
        if (isNaN(amt) || amt <= 0) return;

        // VULN-2 fix: Warn on overpayment (allow but confirm)
        if (amt > balanceDue && balanceDue > 0) {
            if (!window.confirm(`Payment ₹${amt.toFixed(2)} exceeds balance due ₹${balanceDue.toFixed(2)}. Add anyway?`)) {
                return;
            }
        }

        let destination_bank = null;
        let destination_wallet = null;
        
        let methodDesc = paymentMethod;

        if (paymentMethod === 'Customer Wallet') {
            const wBal = selectedCustomer ? parseFloat(selectedCustomer.wallet_balance) : 0;
            if (!selectedCustomer || isNaN(wBal) || wBal < amt) {
                showToast(`Error: Insufficient wallet balance (₹${wBal.toFixed(2)}).`, 'error');
                return;
            }
        } else {
            const methodObj = availablePaymentMethods.find(m => m.id === paymentMethod);
            const typeStr = methodObj ? methodObj.type : paymentMethod;
            const currentType = (typeStr || '').toLowerCase();
            methodDesc = methodObj ? methodObj.type : (currentType === 'cash' ? 'Cash' : 'UPI');

            if (currentType.includes('cash') || currentType.includes('legacy')) {
                destination_wallet = selectedDestination || (availableCashWallets.length > 0 ? availableCashWallets[0].id : null);
                if (!destination_wallet) {
                    showToast('Error: No active Cash Wallet found. Contact Admin.', 'error');
                    return;
                }
            } else if (currentType === 'upi') {
                const upiObj = availableUpiAccounts.find(u => u.upi_id === selectedUpiAccount);
                if (!upiObj || !upiObj.linked_bank_account) {
                    showToast('Error: Selected UPI Account has no linked bank account. Contact Admin.', 'error');
                    return;
                }
                destination_bank = upiObj.linked_bank_account;
            } else {
                // Card or Bank
                if (!methodObj || !methodObj.linked_bank_account) {
                    showToast('Error: Selected Payment Method has no linked bank account. Contact Admin.', 'error');
                    return;
                }
                destination_bank = methodObj.linked_bank_account;
            }
        }

        setPayments(prev => [...prev, {
            method: methodDesc,
            amount: amt,
            destination_bank,
            destination_wallet,
            upi_reference: paymentMethod === 'Customer Wallet' ? '' : (methodDesc.toLowerCase() === 'upi' ? `QR-PAY-${Date.now()}` : ''),
            timestamp: new Date().toISOString()
        }]);
        setPaymentAmount('');
    };

    // VULN-5 fix: Individual payment removal
    const removePayment = (index) => {
        setPayments(prev => prev.filter((_, i) => i !== index));
    };

    const clearPayments = () => setPayments([]);

    // Quick Product Creation (P4 3.3.1.2.3 — FormData for photo upload)
    const handleCreateProduct = async (e) => {
        e.preventDefault();
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
                formData.append('images', referencePhoto);
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
            setIsQuickAdd(false);
            setQuickAddInfo({ first_name: '', phone: '' });
            setPayments([]);
            setOrderDiscount({ type: 'fixed', value: 0 });
        }
    };

    const submitOrder = async (status = 'completed') => {
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
                items: cartItems.map(item => ({
                    product: item.id,
                    quantity: item.quantity,
                    unit_price: item.selling_price,
                    discount_type: item.discountType,
                    discount_value: item.discountValue
                })),
                payments: payments.map(p => ({
                    method: p.method,
                    amount: p.amount,
                    destination_bank: p.destination_bank,
                    destination_wallet: p.destination_wallet,
                    upi_reference: p.upi_reference
                }))
            };



            const response = await fetchWithAuth(ENDPOINTS.ORDERS, {
                method: 'POST',
                body: JSON.stringify(orderData)
            });

            if (response.ok) {
                showToast(`Order ${status === 'draft' ? 'held' : 'completed'} successfully!`, 'success');
                // Reset state
                setCartItems([]);
                setSelectedCustomer(null);
                setIsQuickAdd(false);
                setQuickAddInfo({ first_name: '', phone: '' });
                setPayments([]);
                setOrderDiscount({ type: 'fixed', value: 0 });
            } else {
                let errMsg = `Status ${response.status}`;
                try {
                    const err = await response.json();
                    errMsg = JSON.stringify(err);
                    console.error('Order API error:', err);
                } catch (e) {
                    const text = await response.text();
                    errMsg = text.slice(0, 200);
                    console.error('Order API error (non-JSON):', text.slice(0, 500));
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

    const currentMethodObj = useMemo(() => availablePaymentMethods.find(m => m.id === paymentMethod), [availablePaymentMethods, paymentMethod]);
    // Infer the behavior type from the dynamic string since the enum was removed
    const typeString = (currentMethodObj ? currentMethodObj.type : paymentMethod).toLowerCase();
    const isCash = typeString.includes('cash');
    const isUpi = typeString.includes('upi') || typeString.includes('gpay') || typeString.includes('phonepe') || typeString.includes('paytm');

    return (
        <div className="pos-container fade-in">
            {/* Left Panel: Customer & Products */}
            <div className="pos-left-panel">

                {/* Customer Section */}
                <section className="pos-section">
                    <div className="section-title">
                        <span>Customer</span>
                        {!selectedCustomer && !isQuickAdd && (
                            <div className="d-flex gap-2">
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAddCustomer(prev => !prev)}>
                                    {showAddCustomer ? 'Close' : 'New Customer'}
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsQuickAdd(true)}>
                                    Quick Add
                                </button>
                            </div>
                        )}
                    </div>

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
                    ) : isQuickAdd ? (
                        <div className="guest-info-form">
                            <div className="guest-inputs">
                                <input
                                    type="text"
                                    placeholder="Customer Name *"
                                    className="form-control"
                                    value={quickAddInfo.first_name}
                                    onChange={e => setQuickAddInfo({ ...quickAddInfo, first_name: e.target.value })}
                                />
                                <input
                                    type="tel"
                                    placeholder="Phone (10 digits) *"
                                    className="form-control"
                                    maxLength="10"
                                    value={quickAddInfo.phone}
                                    onChange={e => {
                                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                        setQuickAddInfo({ ...quickAddInfo, phone: val });
                                        if (val.length < 10) setQuickAddPhoneWarning('');
                                    }}
                                    onBlur={async () => {
                                        const phone = quickAddInfo.phone;
                                        if (phone.length !== 10) return;
                                        try {
                                            const res = await fetchWithAuth(`${ENDPOINTS.CUSTOMERS}?search=${phone}`);
                                            if (res.ok) {
                                                const data = await res.json();
                                                const matches = (data.results || []).filter(c => c.phone === phone);
                                                if (matches.length > 0) {
                                                    setQuickAddPhoneWarning(`⚠ Phone already used by: ${matches[0].full_name} (#${matches[0].display_id})`);
                                                } else {
                                                    setQuickAddPhoneWarning('');
                                                }
                                            }
                                        } catch (e) { /* ignore */ }
                                    }}
                                />
                            </div>
                            {quickAddPhoneWarning && (
                                <div style={{ color: '#e6a817', fontSize: '0.8rem', marginTop: '0.25rem' }}>{quickAddPhoneWarning}</div>
                            )}
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <button
                                    className="btn btn-primary btn-sm"
                                    disabled={!quickAddInfo.first_name.trim() || quickAddInfo.phone.length !== 10 || isQuickAddSaving}
                                    type="button"
                                    onClick={async () => {
                                        setIsQuickAddSaving(true);
                                        try {
                                            const res = await fetchWithAuth(ENDPOINTS.CUSTOMERS, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    first_name: quickAddInfo.first_name.trim(),
                                                    phone: quickAddInfo.phone,
                                                    notes: ''
                                                })
                                            });
                                            if (res.ok) {
                                                const customer = await res.json();
                                                setSelectedCustomer({
                                                    id: customer.id,
                                                    display_id: customer.display_id,
                                                    name: customer.first_name || quickAddInfo.first_name,
                                                    phone: customer.phone || quickAddInfo.phone,
                                                    // Education fields — Quick Add has none, but include for consistency
                                                    school_id: null,
                                                    effective_class_name: '',
                                                    class_name: '',
                                                    division_name: '',
                                                    subdivision_name: '',
                                                });
                                                setIsQuickAdd(false);
                                                setQuickAddInfo({ first_name: '', phone: '' });
                                            } else {
                                                const err = await res.json();
                                                const flatten = (obj) => {
                                                    return Object.entries(obj).flatMap(([k, v]) => {
                                                        if (Array.isArray(v)) return v.map(item => typeof item === 'object' ? flatten(item) : `${k}: ${item}`).flat();
                                                        if (typeof v === 'object' && v !== null) return flatten(v);
                                                        return [`${k}: ${v}`];
                                                    });
                                                };
                                                showToast('Failed: ' + flatten(err).join(', '), 'error');
                                            }
                                        } catch (e) {
                                            showToast('Error creating customer', 'error');
                                        } finally {
                                            setIsQuickAddSaving(false);
                                        }
                                    }}
                                >
                                    {isQuickAddSaving ? 'Saving...' : 'Create & Select'}
                                </button>
                                <button className="btn btn-link btn-sm" onClick={() => setIsQuickAdd(false)}>Back to search</button>
                            </div>
                        </div>
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
                        </>
                    )}
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
                            {(productSearch ? productResults : popularProducts).map(p => {
                                const cartItem = cartItems.find(item => item.id === p.id);
                                const inCart = !!cartItem;
                                return (
                                    <div
                                        key={p.id}
                                        className={`product-card ${inCart ? 'in-cart' : ''}`}
                                        onClick={() => !inCart && addToCart(p)}
                                    >
                                        <div className="product-card-name">{p.name}</div>
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
                                        {currency}{Number(item.selling_price).toFixed(2)} x {item.quantity}
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

                <div className="payment-section">
                    <div className="payment-controls">
                        <select
                            className="form-control form-select"
                            value={paymentMethod}
                            onChange={e => setPaymentMethod(e.target.value)}
                        >
                            {availablePaymentMethods.length > 0 ? (
                                <>
                                    {availablePaymentMethods.map(method => (
                                        <option key={method.id} value={method.id}>
                                            {method.type}
                                        </option>
                                    ))}
                                    {selectedCustomer && parseFloat(selectedCustomer.wallet_balance) > 0 && (
                                        <option value="Customer Wallet">
                                            Customer Wallet (Bal: {currency}{parseFloat(selectedCustomer.wallet_balance).toFixed(2)})
                                        </option>
                                    )}
                                </>
                            ) : (
                                <>
                                    <option value="cash">Cash</option>
                                    <option value="upi">UPI</option>
                                    {selectedCustomer && parseFloat(selectedCustomer.wallet_balance) > 0 && (
                                        <option value="Customer Wallet">
                                            Customer Wallet (Bal: {currency}{parseFloat(selectedCustomer.wallet_balance).toFixed(2)})
                                        </option>
                                    )}
                                </>
                            )}
                        </select>
                        
                        {isCash && (
                            <select
                                className="form-control form-select"
                                value={selectedDestination}
                                onChange={e => setSelectedDestination(e.target.value)}
                            >
                                {availableCashWallets.map(w => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                            </select>
                        )}
                        <input
                            type="number"
                            className="form-control"
                            placeholder="Amount"
                            value={paymentAmount}
                            onChange={e => setPaymentAmount(e.target.value)}
                            onKeyPress={e => e.key === 'Enter' && addPayment()}
                        />
                        <button className="btn btn-primary btn-sm" onClick={addPayment}>Add</button>
                    </div>

                    {/* UPI Account Selector */}
                    {isUpi && availableUpiAccounts.length > 0 && (
                        <div className="upi-account-selector mt-2">
                            <label className="small text-muted">Select UPI Account:</label>
                            <select
                                className="form-control form-select"
                                value={selectedUpiAccount}
                                onChange={e => setSelectedUpiAccount(e.target.value)}
                            >
                                {availableUpiAccounts.map(account => (
                                    <option key={account.id} value={account.upi_id}>
                                        {account.display_name} ({account.upi_id})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* QR Code Display */}
                    {isUpi && paymentAmount > 0 && selectedUpiAccount && (() => {
                        const upiUrl = `upi://pay?pa=${selectedUpiAccount}&pn=AZBooks&am=${paymentAmount}&cu=INR`;
                        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiUrl)}`;
                        return (
                            <div className="upi-qr-code text-center my-2">
                                <img
                                    src={qrUrl}
                                    alt="UPI QR Code"
                                    style={{ border: '1px solid #ddd', borderRadius: '8px' }}
                                />
                                <div className="small text-muted mt-1">Scan to pay {currency}{paymentAmount}</div>
                            </div>
                        );
                    })()}

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
                        onClick={() => submitOrder('completed')}
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