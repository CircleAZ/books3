import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import './InlineCustomerPicker.css';

/**
 * InlineCustomerPicker
 * High-speed, keyboard-first customer selection picker for POS (NewOrder / EditOrder).
 * Features:
 *  - Real-time debounced search (name, phone, village, or tokenized qualifiers)
 *  - ArrowUp / ArrowDown / Enter keyboard navigation
 *  - Rich result cards: Name, Monospace Phone, Location Badge [ Machhiwad, Jalalpore ],
 *    Financial Health Badges (Wallet balance & Debt warning)
 *  - Selected customer view with live balance badges & legacy debt warning
 */
export default function InlineCustomerPicker({
    selectedCustomer = null,
    onSelectCustomer,
    onClearCustomer,
    onAddNewCustomer,
    placeholder = 'Search customer by name, phone, or village...',
    autoFocus = false,
    disabled = false
}) {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();

    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    const containerRef = useRef(null);
    const inputRef = useRef(null);
    const dropdownRef = useRef(null);
    const abortControllerRef = useRef(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Auto-focus if requested and no customer selected
    useEffect(() => {
        if (autoFocus && !selectedCustomer && inputRef.current) {
            inputRef.current.focus();
        }
    }, [autoFocus, selectedCustomer]);

    // Debounced search
    useEffect(() => {
        const trimmed = (query || '').trim();
        const isNumericOrShortId = /^[#A-Za-z_-]*\d+$/.test(trimmed);
        if (!trimmed || (!isNumericOrShortId && trimmed.length < 2)) {
            setResults([]);
            setIsSearching(false);
            return;
        }

        const timer = setTimeout(async () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            const controller = new AbortController();
            abortControllerRef.current = controller;

            setIsSearching(true);
            try {
                const url = `${ENDPOINTS.CUSTOMERS}?search=${encodeURIComponent(trimmed)}&page_size=25`;
                const res = await fetchWithAuth(url, { signal: controller.signal });
                if (res.ok) {
                    const data = await res.json();
                    const list = data.results || (Array.isArray(data) ? data : []);
                    setResults(list);
                    setIsOpen(true);
                    setSelectedIndex(-1);
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Error searching customers:', err);
                }
            } finally {
                setIsSearching(false);
            }
        }, 250);

        return () => {
            clearTimeout(timer);
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [query, fetchWithAuth]);

    const handleClear = useCallback(() => {
        if (onClearCustomer) {
            onClearCustomer();
        }
        setQuery('');
        setResults([]);
        setIsOpen(false);
        setSelectedIndex(-1);
        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.focus();
            }
        }, 50);
    }, [onClearCustomer]);

    // Handle customer selection
    const handleSelect = useCallback((cust) => {
        const fullName = cust.full_name || `${cust.first_name || ''} ${cust.last_name || ''}`.trim() || 'Unknown';
        const formatted = {
            ...cust,
            name: fullName,
            full_name: fullName
        };
        if (onSelectCustomer) {
            onSelectCustomer(formatted);
        }
        setQuery('');
        setResults([]);
        setIsOpen(false);
        setSelectedIndex(-1);
    }, [onSelectCustomer]);

    // Keyboard navigation
    const handleKeyDown = (e) => {
        if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            if (results.length > 0) {
                setIsOpen(true);
                e.preventDefault();
                return;
            }
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) => {
                const next = prev < results.length - 1 ? prev + 1 : 0;
                scrollItemIntoView(next);
                return next;
            });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) => {
                const next = prev > 0 ? prev - 1 : results.length - 1;
                scrollItemIntoView(next);
                return next;
            });
        } else if (e.key === 'Enter') {
            if (selectedIndex >= 0 && results[selectedIndex]) {
                e.preventDefault();
                handleSelect(results[selectedIndex]);
            } else if (results.length === 1) {
                e.preventDefault();
                handleSelect(results[0]);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
            setSelectedIndex(-1);
        }
    };

    const scrollItemIntoView = (index) => {
        if (!dropdownRef.current) return;
        const items = dropdownRef.current.querySelectorAll('.customer-result-card');
        if (items[index]) {
            items[index].scrollIntoView({ block: 'nearest' });
        }
    };

    // If a customer is already selected, render the rich selected card
    if (selectedCustomer) {
        const fullName = selectedCustomer.full_name || selectedCustomer.name || `${selectedCustomer.first_name || ''} ${selectedCustomer.last_name || ''}`.trim() || 'Customer';
        const phone = selectedCustomer.phone || 'No phone';
        const address = selectedCustomer.primary_address || selectedCustomer.address || '';
        const locationText = address ? address.split(',').slice(0, 2).map(s => s.trim()).filter(Boolean).join(', ') : '';
        const walletBal = parseFloat(selectedCustomer.wallet_balance || 0);
        const hasDebt = selectedCustomer.has_legacy_debt && parseFloat(selectedCustomer.legacy_debt_remaining || 0) > 0;
        const debtAmount = parseFloat(selectedCustomer.legacy_debt_remaining || 0);

        return (
            <div className="selected-customer-box fade-in">
                <div className="selected-customer-header">
                    <div className="selected-customer-info">
                        <div className="selected-customer-title">
                            {selectedCustomer.display_id && (
                                <span className="customer-display-id">#{selectedCustomer.display_id}</span>
                            )}
                            <strong>{fullName}</strong>
                        </div>
                        <div className="selected-customer-sub">
                            <span className="customer-phone-mono">📞 {phone}</span>
                            {locationText && (
                                <span className="customer-badge-location" title={address}>
                                    📍 [ {locationText} ]
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={handleClear}
                        title="Change Customer"
                    >
                        Change
                    </button>
                </div>

                <div className="selected-customer-badges">
                    {walletBal > 0 && (
                        <span className="badge-wallet">
                            💰 {currency}{walletBal.toFixed(2)} Wallet
                        </span>
                    )}
                    {hasDebt && (
                        <span className="badge-debt">
                            ⚠️ {currency}{debtAmount.toFixed(2)} Debt
                        </span>
                    )}
                </div>

                {hasDebt && (
                    <div className="legacy-debt-alert-banner">
                        <span>⚠️ LEGACY DEBT ALERT</span>
                        <span>{currency}{debtAmount.toFixed(2)}</span>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="inline-customer-picker" ref={containerRef}>
            <div className="customer-search-box">
                <div className="customer-search-input-wrapper">
                    <input
                        ref={inputRef}
                        type="text"
                        className="form-control customer-search-input"
                        placeholder={placeholder}
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => {
                            if (results.length > 0) setIsOpen(true);
                        }}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                        autoComplete="off"
                    />
                    {isSearching && <div className="customer-search-spinner" />}
                </div>

                {onAddNewCustomer && (
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={onAddNewCustomer}
                        title="Register New Customer"
                        style={{ whiteSpace: 'nowrap' }}
                    >
                        + New
                    </button>
                )}
            </div>

            {isOpen && results.length > 0 && (
                <div className="customer-search-dropdown" ref={dropdownRef}>
                    <div className="customer-search-header">
                        <span>{results.length} match{results.length !== 1 ? 'es' : ''} found</span>
                        <span>↑↓ to navigate, ↵ to select</span>
                    </div>

                    {results.map((c, index) => {
                        const name = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Customer';
                        const address = c.primary_address || c.address || '';
                        const locationText = address ? address.split(',').slice(0, 2).map(s => s.trim()).filter(Boolean).join(', ') : '';
                        const wallet = parseFloat(c.wallet_balance || 0);
                        const debt = c.has_legacy_debt && parseFloat(c.legacy_debt_remaining || 0) > 0
                            ? parseFloat(c.legacy_debt_remaining)
                            : 0;

                        return (
                            <div
                                key={c.id}
                                className={`customer-result-card ${index === selectedIndex ? 'highlighted' : ''}`}
                                onClick={() => handleSelect(c)}
                                onMouseEnter={() => setSelectedIndex(index)}
                            >
                                <div className="customer-card-main">
                                    <div className="customer-card-name-row">
                                        {c.display_id && (
                                            <span className="customer-display-id">#{c.display_id}</span>
                                        )}
                                        <span className="customer-name">{name}</span>
                                    </div>
                                    <div className="customer-card-meta-row">
                                        <span className="customer-phone-mono">{c.phone || 'No phone'}</span>
                                        {locationText && (
                                            <span className="customer-badge-location" title={address}>
                                                📍 [ {locationText} ]
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="customer-card-badges">
                                    {wallet > 0 && (
                                        <span className="badge-wallet">
                                            {currency}{wallet.toFixed(2)} Wallet
                                        </span>
                                    )}
                                    {debt > 0 && (
                                        <span className="badge-debt">
                                            ⚠️ {currency}{debt.toFixed(2)} Debt
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
