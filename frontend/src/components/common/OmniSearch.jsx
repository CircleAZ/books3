import { useState, useEffect, useRef } from 'react';
import './OmniSearch.css';

const searchCategories = [
    { id: 'products', label: 'Products', icon: '📦' },
    { id: 'customers', label: 'Customers', icon: '👥' },
    { id: 'orders', label: 'Orders', icon: '📋' },
    { id: 'actions', label: 'Quick Actions', icon: '⚡' },
];

const quickActions = [
    { id: 'new-order', label: 'Create New Order', path: '/orders/new', icon: '➕' },
    { id: 'add-product', label: 'Add New Product', path: '/inventory/add', icon: '📦' },
    { id: 'add-customer', label: 'Add New Customer', path: '/customers/add', icon: '👤' },
    { id: 'view-reports', label: 'View Reports', path: '/reports', icon: '📊' },
];

export default function OmniSearch({ isOpen, onClose }) {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [results, setResults] = useState([]);
    const inputRef = useRef(null);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
            setQuery('');
            setSelectedIndex(0);
            setResults(quickActions);
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

    // Search logic (placeholder - will connect to API later)
    useEffect(() => {
        if (!query.trim()) {
            setResults(quickActions);
            return;
        }
        // Simulate search results
        const filtered = quickActions.filter(a =>
            a.label.toLowerCase().includes(query.toLowerCase())
        );
        setResults(filtered);
        setSelectedIndex(0);
    }, [query]);

    const handleSelect = (item) => {
        if (item.path) {
            window.location.href = item.path;
        }
        onClose();
    };

    if (!isOpen) return null;

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
                    <kbd className="search-shortcut">ESC</kbd>
                </div>

                <div className="search-categories">
                    {searchCategories.map(cat => (
                        <button key={cat.id} className="category-chip">
                            <span>{cat.icon}</span>
                            <span>{cat.label}</span>
                        </button>
                    ))}
                </div>

                <div className="search-results">
                    {results.length === 0 ? (
                        <div className="no-results">
                            <p>No results found for "{query}"</p>
                        </div>
                    ) : (
                        <>
                            <p className="results-label">{query ? 'Results' : 'Quick Actions'}</p>
                            {results.map((item, idx) => (
                                <button
                                    key={item.id}
                                    className={`result-item ${idx === selectedIndex ? 'selected' : ''}`}
                                    onClick={() => handleSelect(item)}
                                    onMouseEnter={() => setSelectedIndex(idx)}
                                >
                                    <span className="result-icon">{item.icon}</span>
                                    <span className="result-label">{item.label}</span>
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
