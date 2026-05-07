import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import { searchableItems } from '../../config/navigation';
import usePermissions from '../../utils/usePermissions';
import './OmniSearch.css';

const searchCategories = [
    { id: 'all', label: 'All', icon: '🔍' },
    { id: 'products', label: 'Products', icon: '📦' },
    { id: 'customers', label: 'Customers', icon: '👥' },
    { id: 'orders', label: 'Orders', icon: '📋' },
    { id: 'actions', label: 'Quick Actions', icon: '⚡' },
];

const quickActions = [
    { id: 'new-order', label: 'Create New Order', path: '/orders/new', icon: '➕', category: 'actions' },
    { id: 'add-product', label: 'Add New Product', path: '/inventory/add', icon: '📦', category: 'actions' },
    { id: 'add-customer', label: 'Add New Customer', path: '/customers/add', icon: '👤', category: 'actions' },
    { id: 'view-reports', label: 'View Reports', path: '/reports/sales', icon: '📊', category: 'actions' },
];

export default function OmniSearch({ isOpen, onClose }) {
    const [query, setQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [results, setResults] = useState([]);
    const [apiResults, setApiResults] = useState({ products: [], customers: [], orders: [] });
    const [loading, setLoading] = useState(false);
    const inputRef = useRef(null);
    const debounceRef = useRef(null);
    const navigate = useNavigate();
    const { fetchWithAuth } = useAuth();
    const { hasPermission } = usePermissions();

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
            setQuery('');
            setActiveCategory('all');
            setSelectedIndex(0);
            setResults(quickActions);
            setApiResults({ products: [], customers: [], orders: [] });
        }
    }, [isOpen]);

    // Handle keyboard shortcuts
    useEffect(() => {
        function handleKeyDown(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                onClose(); // Toggle
            }
            if (!isOpen) return;

            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(i => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(i => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && results[selectedIndex]) {
                e.preventDefault();
                handleSelect(results[selectedIndex]);
            }
        }
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, results, selectedIndex, onClose]);

    // Debounced API search
    const searchAPI = useCallback(async (searchQuery) => {
        if (!searchQuery.trim() || searchQuery.length < 2) {
            setApiResults({ products: [], customers: [], orders: [] });
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [productsRes, customersRes, ordersRes] = await Promise.allSettled([
                fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}?search=${encodeURIComponent(searchQuery)}&page_size=5`),
                fetchWithAuth(`${ENDPOINTS.CUSTOMERS}?search=${encodeURIComponent(searchQuery)}&page_size=5`),
                fetchWithAuth(`${ENDPOINTS.ORDERS}?search=${encodeURIComponent(searchQuery)}&page_size=5`),
            ]);

            const products = productsRes.status === 'fulfilled' && productsRes.value.ok
                ? (await productsRes.value.json()).results?.map(p => ({
                    id: `product-${p.id}`, label: p.name, path: `/inventory/${p.id}`,
                    icon: '📦', category: 'products', subtitle: `₹${Number(p.selling_price || 0).toFixed(2)}`
                })) || []
                : [];

            const customers = customersRes.status === 'fulfilled' && customersRes.value.ok
                ? (await customersRes.value.json()).results?.map(c => ({
                    id: `customer-${c.id}`, label: c.name, path: `/customers/${c.id}`,
                    icon: '👤', category: 'customers', subtitle: c.phone || c.email || ''
                })) || []
                : [];

            const orders = ordersRes.status === 'fulfilled' && ordersRes.value.ok
                ? (await ordersRes.value.json()).results?.map(o => ({
                    id: `order-${o.id}`, label: `Order #${o.order_number || o.id}`, path: `/orders/${o.id}`,
                    icon: '📋', category: 'orders', subtitle: `₹${o.total || 0}`
                })) || []
                : [];

            setApiResults({ products, customers, orders });
        } catch (err) {
            console.error('Search failed:', err);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    // Build combined results whenever query, category, or API results change
    useEffect(() => {
        if (!query.trim()) {
            // No query — show quick actions (filtered by category and permission)
            const filtered = (activeCategory === 'all' || activeCategory === 'actions'
                ? quickActions
                : []).filter(item => !item.permission || hasPermission(item.permission));
            setResults(filtered);
            setSelectedIndex(0);
            return;
        }

        const q = query.toLowerCase();
        let combined = [];

        // Quick actions matching query
        if (activeCategory === 'all' || activeCategory === 'actions') {
            const actionMatches = quickActions.filter(a => 
                a.label.toLowerCase().includes(q) && (!a.permission || hasPermission(a.permission))
            );
            combined.push(...actionMatches);
        }

        // Navigation items matching query
        if (activeCategory === 'all' || activeCategory === 'actions') {
            const navMatches = searchableItems
                .filter(item => item.label.toLowerCase().includes(q) && (!item.permission || hasPermission(item.permission)))
                .slice(0, 5)
                .map(item => ({ ...item, id: `nav-${item.path}`, icon: '🔗', category: 'actions' }));
            combined.push(...navMatches);
        }

        // API results
        if (activeCategory === 'all' || activeCategory === 'products') {
            combined.push(...apiResults.products);
        }
        if (activeCategory === 'all' || activeCategory === 'customers') {
            combined.push(...apiResults.customers);
        }
        if (activeCategory === 'all' || activeCategory === 'orders') {
            combined.push(...apiResults.orders);
        }

        // Deduplicate by id
        const seen = new Set();
        combined = combined.filter(item => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });

        setResults(combined);
        setSelectedIndex(0);
    }, [query, activeCategory, apiResults]);

    // Debounced API trigger
    useEffect(() => {
        clearTimeout(debounceRef.current);
        if (query.trim().length >= 2) {
            debounceRef.current = setTimeout(() => searchAPI(query), 300);
        } else {
            setApiResults({ products: [], customers: [], orders: [] });
        }
        return () => clearTimeout(debounceRef.current);
    }, [query, searchAPI]);

    const handleSelect = (item) => {
        if (item.path) {
            navigate(item.path);
        }
        onClose();
    };

    const handleCategoryClick = (catId) => {
        setActiveCategory(catId);
        setSelectedIndex(0);
        inputRef.current?.focus();
    };

    if (!isOpen) return null;

    // Group results by category for display labels
    const getResultsLabel = () => {
        if (!query) return 'Quick Actions';
        if (loading) return 'Searching...';
        if (results.length === 0) return null;
        if (activeCategory !== 'all') {
            const cat = searchCategories.find(c => c.id === activeCategory);
            return cat?.label || 'Results';
        }
        return 'Results';
    };

    return (
        <div className="omni-search-overlay" onClick={onClose}>
            <div className="omni-search-modal animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="search-input-wrapper">
                    <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        className="search-input"
                        placeholder="Search products, customers, orders..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    {loading && <span className="search-spinner" />}
                    <kbd className="search-shortcut">ESC</kbd>
                </div>

                <div className="search-categories">
                    {searchCategories.map(cat => (
                        <button
                            key={cat.id}
                            className={`category-chip ${activeCategory === cat.id ? 'active' : ''}`}
                            onClick={() => handleCategoryClick(cat.id)}
                        >
                            <span>{cat.icon}</span>
                            <span>{cat.label}</span>
                        </button>
                    ))}
                </div>

                <div className="search-results">
                    {results.length === 0 && query ? (
                        <div className="no-results">
                            <p>{loading ? 'Searching...' : `No results found for "${query}"`}</p>
                        </div>
                    ) : (
                        <>
                            <p className="results-label">{getResultsLabel()}</p>
                            {results.map((item, idx) => (
                                <button
                                    key={item.id}
                                    className={`result-item ${idx === selectedIndex ? 'selected' : ''}`}
                                    onClick={() => handleSelect(item)}
                                    onMouseEnter={() => setSelectedIndex(idx)}
                                >
                                    <span className="result-icon">{item.icon}</span>
                                    <div className="result-content">
                                        <span className="result-label">{item.label}</span>
                                        {item.subtitle && <span className="result-subtitle">{item.subtitle}</span>}
                                    </div>
                                    <span className="result-hint">↵</span>
                                </button>
                            ))}
                        </>
                    )}
                </div>

                <div className="search-footer">
                    <span><kbd>↑↓</kbd> Navigate</span>
                    <span><kbd>↵</kbd> Select</span>
                    <span><kbd>ESC</kbd> Close</span>
                </div>
            </div>
        </div>
    );
}
