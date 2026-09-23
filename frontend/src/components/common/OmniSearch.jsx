import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import usePermissions from '../../utils/usePermissions';
import './OmniSearch.css';

const CATEGORY_TABS = [
    { id: 'all', label: 'All', icon: '🔍' },
    { id: 'orders', label: 'Orders', icon: '📋' },
    { id: 'customers', label: 'Customers', icon: '👥' },
    { id: 'products', label: 'Products', icon: '📦' },
    { id: 'purchase_orders', label: 'Purchase Orders', icon: '🏭' },
    { id: 'finance', label: 'Transactions', icon: '💰' },
];

const CATEGORY_META = {
    orders: { label: 'Orders', icon: '📋' },
    customers: { label: 'Customers', icon: '👥' },
    products: { label: 'Products', icon: '📦' },
    purchase_orders: { label: 'Purchase Orders', icon: '🏭' },
    finance: { label: 'Transactions', icon: '💰' },
};

const QUICK_ACTIONS = [
    {
        id: 'action-new-order',
        title: 'Create New Order',
        subtitle: 'POS counter & customer billing',
        url: '/orders/new',
        icon: '📋',
        category: 'orders',
        permission: 'orders.create_orders'
    },
    {
        id: 'action-add-customer',
        title: 'Add New Customer',
        subtitle: 'Register school, student, or client',
        url: '/customers/add',
        icon: '👥',
        category: 'customers',
        permission: 'customers.manage_customers'
    },
    {
        id: 'action-add-product',
        title: 'Add New Product',
        subtitle: 'Create inventory item or book',
        url: '/inventory/add',
        icon: '📦',
        category: 'products',
        permission: 'inventory.manage_products'
    },
    {
        id: 'action-record-expense',
        title: 'Record Expense',
        subtitle: 'Log operating or travel expenses',
        url: '/finance/expenses/add',
        icon: '💰',
        category: 'finance',
        permission: 'finance.manage_expenses'
    },
];

const RECENTS_STORAGE_KEY = 'omnisearch_recents';

export default function OmniSearch({ isOpen, onClose }) {
    const [query, setQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [recents, setRecents] = useState([]);
    const [results, setResults] = useState({
        orders: [],
        customers: [],
        products: [],
        purchase_orders: [],
        finance: []
    });
    const [loading, setLoading] = useState(false);

    const inputRef = useRef(null);
    const resultsContainerRef = useRef(null);
    const debounceTimerRef = useRef(null);
    const abortControllerRef = useRef(null);

    const navigate = useNavigate();
    const { fetchWithAuth } = useAuth();
    const { hasPermission } = usePermissions();

    // 1. Instant Mount (0ms): synchronous read from localStorage on open
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setActiveCategory('all');
            setSelectedIndex(0);
            setResults({
                orders: [],
                customers: [],
                products: [],
                purchase_orders: [],
                finance: []
            });
            setLoading(false);

            try {
                const stored = localStorage.getItem(RECENTS_STORAGE_KEY);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    const safe = Array.isArray(parsed)
                        ? parsed.filter(i => i && typeof i === 'object' && i.id && i.title && i.url).slice(0, 6)
                        : [];
                    setRecents(safe);
                } else {
                    setRecents([]);
                }
            } catch {
                setRecents([]);
            }

            // Focus input synchronously or next tick
            setTimeout(() => {
                inputRef.current?.focus();
            }, 10);
        } else {
            // Cancel any pending request when modal closes
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            clearTimeout(debounceTimerRef.current);
        }
    }, [isOpen]);

    // 2. Trailing Debounce (280ms) + AbortController Cancellation (Single unified endpoint)
    useEffect(() => {
        if (!isOpen) return;

        const trimmed = query.trim();
        if (!trimmed) {
            setResults({
                orders: [],
                customers: [],
                products: [],
                purchase_orders: [],
                finance: []
            });
            setLoading(false);
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            return;
        }

        // Single character text check (unless numeric or starts with #)
        const isNumericSearch = /^[#A-Za-z_-]*\d+$/.test(trimmed);
        if (trimmed.length < 2 && !isNumericSearch) {
            setResults({
                orders: [],
                customers: [],
                products: [],
                purchase_orders: [],
                finance: []
            });
            setLoading(false);
            return;
        }

        setLoading(true);
        clearTimeout(debounceTimerRef.current);

        debounceTimerRef.current = setTimeout(async () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            const controller = new AbortController();
            abortControllerRef.current = controller;

            try {
                const res = await fetchWithAuth(
                    `${ENDPOINTS.CORE_OMNISEARCH}?q=${encodeURIComponent(trimmed)}`,
                    { signal: controller.signal }
                );
                if (res.ok) {
                    const data = await res.json();
                    setResults({
                        orders: data.orders || [],
                        customers: data.customers || [],
                        products: data.products || [],
                        purchase_orders: data.purchase_orders || [],
                        finance: data.finance || []
                    });
                    setSelectedIndex(0);
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('OmniSearch request error:', err);
                }
            } finally {
                setLoading(false);
            }
        }, 280);

        return () => {
            clearTimeout(debounceTimerRef.current);
        };
    }, [query, isOpen, fetchWithAuth]);

    // 3. Compute flat list of currently visible items for index-based keyboard navigation
    const visibleActions = useMemo(() => {
        return QUICK_ACTIONS.filter(a => !a.permission || hasPermission(a.permission));
    }, [hasPermission]);

    const filteredRecents = useMemo(() => {
        if (activeCategory === 'all') return recents;
        return recents.filter(r => r.category === activeCategory);
    }, [recents, activeCategory]);

    const filteredActions = useMemo(() => {
        if (activeCategory === 'all') return visibleActions;
        return visibleActions.filter(a => a.category === activeCategory);
    }, [visibleActions, activeCategory]);

    const flatVisibleItems = useMemo(() => {
        const trimmed = query.trim();
        if (!trimmed) {
            return [...filteredRecents, ...filteredActions];
        }

        if (activeCategory === 'all') {
            const list = [];
            for (const cat of ['orders', 'customers', 'products', 'purchase_orders', 'finance']) {
                if (results[cat] && results[cat].length > 0) {
                    list.push(...results[cat]);
                }
            }
            return list;
        }

        return results[activeCategory] || [];
    }, [query, activeCategory, filteredRecents, filteredActions, results]);

    // Ensure selectedIndex is within bounds when list updates
    useEffect(() => {
        if (flatVisibleItems.length === 0) {
            setSelectedIndex(0);
        } else if (selectedIndex < 0 || selectedIndex >= flatVisibleItems.length) {
            setSelectedIndex(0);
        }
    }, [flatVisibleItems.length, selectedIndex]);

    // Reset container scroll to top on query or category change
    useEffect(() => {
        if (resultsContainerRef.current) {
            resultsContainerRef.current.scrollTop = 0;
        }
    }, [query, activeCategory]);

    // Auto-scroll highlighted item into view
    useEffect(() => {
        if (!resultsContainerRef.current) return;
        const selectedEl = resultsContainerRef.current.querySelector('.result-item.selected');
        if (selectedEl) {
            selectedEl.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedIndex]);

    // 4. Keyboard Navigation across all categories
    useEffect(() => {
        function handleKeyDown(e) {
            if (!isOpen) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (flatVisibleItems.length > 0) {
                    setSelectedIndex(idx => Math.min(idx + 1, flatVisibleItems.length - 1));
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (flatVisibleItems.length > 0) {
                    setSelectedIndex(idx => Math.max(idx - 1, 0));
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const item = flatVisibleItems[selectedIndex];
                if (item) {
                    handleSelect(item);
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, flatVisibleItems, selectedIndex, onClose]);

    // 5. Item Selection & Recents Persistence
    const handleSelect = (item) => {
        if (!item || !item.url) return;

        // Save real entities to recents (ignore quick actions)
        const isQuickAction = item.id && String(item.id).startsWith('action-');
        if (!isQuickAction) {
            try {
                const stored = localStorage.getItem(RECENTS_STORAGE_KEY);
                const current = stored ? JSON.parse(stored) : [];
                const safeCurrent = Array.isArray(current)
                    ? current.filter(r => r && typeof r === 'object' && r.id && r.url)
                    : [];
                const filtered = safeCurrent.filter(r => r.id !== item.id && r.url !== item.url);
                const recentItem = {
                    id: String(item.id),
                    title: String(item.title || ''),
                    subtitle: String(item.subtitle || ''),
                    badge: item.badge ? String(item.badge) : '',
                    badgeColor: item.badgeColor ? String(item.badgeColor) : 'secondary',
                    url: String(item.url),
                    category: item.category ? String(item.category) : 'orders',
                };
                const updated = [recentItem, ...filtered].slice(0, 6);
                localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(updated));
                setRecents(updated);
            } catch (err) {
                console.error('Failed to update recents:', err);
            }
        }

        navigate(item.url);
        onClose();
    };

    const handleClearRecents = (e) => {
        e.stopPropagation();
        try {
            localStorage.removeItem(RECENTS_STORAGE_KEY);
            setRecents([]);
            setSelectedIndex(0);
        } catch (err) {
            console.error('Failed to clear recents:', err);
        }
    };

    const handleCategoryClick = (catId) => {
        setActiveCategory(catId);
        setSelectedIndex(0);
        inputRef.current?.focus();
    };

    if (!isOpen) return null;

    const trimmed = query.trim();
    const hasQuery = Boolean(trimmed);
    const selectedItemId = flatVisibleItems[selectedIndex]?.id;

    // Count results per category
    const categoryCounts = {
        orders: results.orders.length,
        customers: results.customers.length,
        products: results.products.length,
        purchase_orders: results.purchase_orders.length,
        finance: results.finance.length,
    };
    const totalResults = Object.values(categoryCounts).reduce((a, b) => a + b, 0);

    return (
        <div className="omni-search-overlay" onClick={onClose}>
            <div className="omni-search-modal animate-fade-in" onClick={e => e.stopPropagation()}>
                {/* Search Input Bar */}
                <div className="search-input-wrapper">
                    <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        className="search-input"
                        placeholder="Search orders, customers, products, POs, transactions..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        autoComplete="off"
                        spellCheck="false"
                    />
                    {loading && <span className="search-spinner" />}
                    <kbd className="search-shortcut" onClick={onClose}>ESC</kbd>
                </div>

                {/* Category Filter Pills */}
                <div className="search-categories">
                    {CATEGORY_TABS.map(tab => {
                        const count = tab.id === 'all' ? totalResults : categoryCounts[tab.id];
                        return (
                            <button
                                key={tab.id}
                                className={`category-chip ${activeCategory === tab.id ? 'active' : ''}`}
                                onClick={() => handleCategoryClick(tab.id)}
                            >
                                <span className="category-chip-icon">{tab.icon}</span>
                                <span>{tab.label}</span>
                                {hasQuery && count > 0 && (
                                    <span className="category-chip-count">{count}</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Results Container */}
                <div className="search-results" ref={resultsContainerRef}>
                    {!hasQuery ? (
                        // Empty query: Show Recent Searches (up to 6) + Quick Actions
                        <>
                            {filteredRecents.length > 0 && (
                                <div className="result-category-group">
                                    <div className="results-group-header">
                                        <span>🕒 Recent Searches</span>
                                        <button
                                            type="button"
                                            className="clear-recents-btn"
                                            onClick={handleClearRecents}
                                            title="Clear recent searches"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    {filteredRecents.map(item => (
                                        <button
                                            key={`recent-${item.id}`}
                                            className={`result-item ${item.id === selectedItemId ? 'selected' : ''}`}
                                            onClick={() => handleSelect(item)}
                                            onMouseEnter={() => {
                                                const idx = flatVisibleItems.findIndex(x => x.id === item.id);
                                                if (idx !== -1) setSelectedIndex(idx);
                                            }}
                                        >
                                            <span className="result-icon">
                                                {CATEGORY_META[item.category]?.icon || '🕒'}
                                            </span>
                                            <div className="result-content">
                                                <div className="result-title-row">
                                                    <span className="result-label">{item.title}</span>
                                                    {item.badge && (
                                                        <span className={`result-badge badge-${item.badgeColor || 'secondary'}`}>
                                                            {item.badge}
                                                        </span>
                                                    )}
                                                </div>
                                                {item.subtitle && (
                                                    <span className="result-subtitle">{item.subtitle}</span>
                                                )}
                                            </div>
                                            <span className="result-hint">↵</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {filteredActions.length > 0 && (
                                <div className="result-category-group">
                                    <div className="results-group-header">
                                        <span>⚡ Quick Actions</span>
                                    </div>
                                    {filteredActions.map(action => (
                                        <button
                                            key={action.id}
                                            className={`result-item quick-action-item ${action.id === selectedItemId ? 'selected' : ''}`}
                                            onClick={() => handleSelect(action)}
                                            onMouseEnter={() => {
                                                const idx = flatVisibleItems.findIndex(x => x.id === action.id);
                                                if (idx !== -1) setSelectedIndex(idx);
                                            }}
                                        >
                                            <span className="result-icon quick-action-icon">{action.icon}</span>
                                            <div className="result-content">
                                                <div className="result-title-row">
                                                    <span className="result-label">{action.title}</span>
                                                </div>
                                                <span className="result-subtitle">{action.subtitle}</span>
                                            </div>
                                            <span className="result-hint">↵</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {filteredRecents.length === 0 && filteredActions.length === 0 && (
                                <div className="no-results empty-search-hint">
                                    <p>Type to search across Books3</p>
                                    <span className="no-results-hint">Search orders, customers, products, POs, and financial ledger</span>
                                </div>
                            )}
                        </>
                    ) : totalResults === 0 ? (
                        // No results state
                        <div className="no-results">
                            <p>{loading ? 'Searching unified database...' : `No matching results found for "${query}"`}</p>
                            <span className="no-results-hint">Try searching by #ID, customer phone, product name, or PO number</span>
                        </div>
                    ) : (
                        // Active search results categorized
                        <>
                            {activeCategory === 'all' ? (
                                ['orders', 'customers', 'products', 'purchase_orders', 'finance'].map(cat => {
                                    const items = results[cat] || [];
                                    if (items.length === 0) return null;
                                    const meta = CATEGORY_META[cat];
                                    return (
                                        <div key={cat} className="result-category-group">
                                            <div className="results-group-header">
                                                <span>{meta.icon} {meta.label}</span>
                                                <span className="results-group-count">{items.length}</span>
                                            </div>
                                            {items.map(item => (
                                                <button
                                                    key={item.id}
                                                    className={`result-item ${item.id === selectedItemId ? 'selected' : ''}`}
                                                    onClick={() => handleSelect(item)}
                                                    onMouseEnter={() => {
                                                        const idx = flatVisibleItems.findIndex(x => x.id === item.id);
                                                        if (idx !== -1) setSelectedIndex(idx);
                                                    }}
                                                >
                                                    <span className="result-icon">{meta.icon}</span>
                                                    <div className="result-content">
                                                        <div className="result-title-row">
                                                            <span className="result-label">{item.title}</span>
                                                            {item.badge && (
                                                                <span className={`result-badge badge-${item.badgeColor || 'secondary'}`}>
                                                                    {item.badge}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {item.subtitle && (
                                                            <span className="result-subtitle">{item.subtitle}</span>
                                                        )}
                                                    </div>
                                                    <span className="result-hint">↵</span>
                                                </button>
                                            ))}
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="result-category-group">
                                    <div className="results-group-header">
                                        <span>{CATEGORY_META[activeCategory]?.icon} {CATEGORY_META[activeCategory]?.label}</span>
                                        <span className="results-group-count">{flatVisibleItems.length}</span>
                                    </div>
                                    {flatVisibleItems.length === 0 ? (
                                        <div className="no-category-results">
                                            <p>No {CATEGORY_META[activeCategory]?.label.toLowerCase() || 'items'} found matching &quot;{query}&quot;</p>
                                        </div>
                                    ) : (
                                        flatVisibleItems.map(item => (
                                            <button
                                                key={item.id}
                                                className={`result-item ${item.id === selectedItemId ? 'selected' : ''}`}
                                                onClick={() => handleSelect(item)}
                                                onMouseEnter={() => {
                                                    const idx = flatVisibleItems.findIndex(x => x.id === item.id);
                                                    if (idx !== -1) setSelectedIndex(idx);
                                                }}
                                            >
                                                <span className="result-icon">{CATEGORY_META[activeCategory]?.icon}</span>
                                                <div className="result-content">
                                                    <div className="result-title-row">
                                                        <span className="result-label">{item.title}</span>
                                                        {item.badge && (
                                                            <span className={`result-badge badge-${item.badgeColor || 'secondary'}`}>
                                                                {item.badge}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {item.subtitle && (
                                                        <span className="result-subtitle">{item.subtitle}</span>
                                                    )}
                                                </div>
                                                <span className="result-hint">↵</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer Hotkey Legend */}
                <div className="search-footer">
                    <span><kbd>↑↓</kbd> Navigate</span>
                    <span><kbd>↵</kbd> Open</span>
                    <span><kbd>ESC</kbd> Close</span>
                    {totalResults > 0 && hasQuery && (
                        <span className="footer-total-count">{totalResults} result{totalResults !== 1 ? 's' : ''}</span>
                    )}
                </div>
            </div>
        </div>
    );
}
