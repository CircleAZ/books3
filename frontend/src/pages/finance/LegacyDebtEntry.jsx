import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import { useToast } from '../../context/ToastContext';
import './LegacyDebtEntry.css';

export default function LegacyDebtEntry() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { showToast } = useToast();

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    
    // Selected Customer
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    
    // Amount state
    const [amount, setAmount] = useState('');
    
    // Logs for current rapid session
    const [sessionLogs, setSessionLogs] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Refs for furious entry focus management
    const searchInputRef = useRef(null);
    const amountInputRef = useRef(null);
    const debounceTimeout = useRef(null);

    // Focus search on mount
    useEffect(() => {
        if (searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, []);

    // Debounced Search
    const performSearch = useCallback(async (query) => {
        if (!query.trim()) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }

        try {
            const response = await fetchWithAuth(`${ENDPOINTS.CUSTOMERS}?search=${encodeURIComponent(query)}`);
            if (response.ok) {
                const data = await response.json();
                setSearchResults(data.results || data || []);
                setShowDropdown(true);
                setActiveIndex(-1);
            }
        } catch (err) {
            console.error('Customer search failed', err);
        }
    }, [fetchWithAuth]);

    const handleSearchChange = (e) => {
        const val = e.target.value;
        setSearchQuery(val);
        setSelectedCustomer(null);

        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        debounceTimeout.current = setTimeout(() => {
            performSearch(val);
        }, 300);
    };

    const handleCustomerSelect = (customer) => {
        setSelectedCustomer(customer);
        setSearchQuery(`${customer.name} - ${customer.phone || 'No Phone'}`);
        setShowDropdown(false);
        setActiveIndex(-1);
        
        // Rapid focus move to amount
        if (amountInputRef.current) {
            amountInputRef.current.focus();
        }
    };

    const handleSearchKeyDown = (e) => {
        if (!showDropdown || searchResults.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev > 0 ? prev - 1 : searchResults.length - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && activeIndex < searchResults.length) {
                handleCustomerSelect(searchResults[activeIndex]);
            } else if (searchResults.length > 0) {
                handleCustomerSelect(searchResults[0]);
            }
        } else if (e.key === 'Escape') {
            setShowDropdown(false);
        }
    };

    const handleAmountKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitEntry();
        }
    };

    const submitEntry = async () => {
        if (!selectedCustomer) {
            showToast('Please select a valid customer first.', 'warning');
            if (searchInputRef.current) searchInputRef.current.focus();
            return;
        }

        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            showToast('Please enter a valid positive amount.', 'warning');
            if (amountInputRef.current) amountInputRef.current.focus();
            return;
        }

        setIsSubmitting(true);
        const payload = [{
            customer: selectedCustomer.id,
            principal_amount: numericAmount
        }];

        try {
            const response = await fetchWithAuth(ENDPOINTS.LEGACY_DEBT_BULK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            
            const result = data.results && data.results[0] ? data.results[0] : null;

            if (response.ok && result && result.status === 'success') {
                setSessionLogs(prev => [{
                    id: Date.now(),
                    status: 'success',
                    customerName: selectedCustomer.name,
                    amount: numericAmount,
                    message: 'Saved successfully'
                }, ...prev]);

                // Reset form furiously
                setSearchQuery('');
                setSelectedCustomer(null);
                setAmount('');
                setSearchResults([]);
                
                if (searchInputRef.current) {
                    searchInputRef.current.focus();
                }
            } else {
                setSessionLogs(prev => [{
                    id: Date.now(),
                    status: 'error',
                    customerName: selectedCustomer.name,
                    amount: numericAmount,
                    message: result ? result.reason : (data.detail || 'Failed to save')
                }, ...prev]);
            }
        } catch (err) {
            setSessionLogs(prev => [{
                id: Date.now(),
                status: 'error',
                customerName: selectedCustomer.name,
                amount: numericAmount,
                message: err.message || 'Network error'
            }, ...prev]);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="legacy-debt-entry-container">
            <header>
                <h1>Legacy Debt: Rapid Entry</h1>
                <p>Quickly digitize notebook debt. Hit Enter to save and proceed to the next entry.</p>
            </header>

            <div className="rapid-entry-card">
                <div className="rapid-entry-form">
                    <div className="input-group">
                        <label>Customer Search</label>
                        <input 
                            type="text"
                            ref={searchInputRef}
                            value={searchQuery}
                            onChange={handleSearchChange}
                            onKeyDown={handleSearchKeyDown}
                            placeholder="Start typing name or phone..."
                            disabled={isSubmitting}
                            autoComplete="off"
                        />
                        {showDropdown && searchResults.length > 0 && (
                            <ul className="autocomplete-dropdown">
                                {searchResults.map((cust, idx) => (
                                    <li 
                                        key={cust.id} 
                                        className={`autocomplete-item ${idx === activeIndex ? 'active' : ''}`}
                                        onClick={() => handleCustomerSelect(cust)}
                                        onMouseEnter={() => setActiveIndex(idx)}
                                    >
                                        <span className="customer-name">{cust.name}</span>
                                        <span className="customer-phone">{cust.phone || 'No phone'}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="input-group">
                        <label>Debt Amount ({currency})</label>
                        <input 
                            type="number"
                            ref={amountInputRef}
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            onKeyDown={handleAmountKeyDown}
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            disabled={isSubmitting || !selectedCustomer}
                        />
                    </div>

                    <button 
                        className="submit-btn" 
                        onClick={submitEntry}
                        disabled={isSubmitting || !selectedCustomer || !amount}
                    >
                        {isSubmitting ? 'Saving...' : 'Save (Enter)'}
                    </button>
                </div>
            </div>

            {sessionLogs.length > 0 && (
                <div className="session-logs">
                    <h2>Session History</h2>
                    <div className="log-list">
                        {sessionLogs.map(log => (
                            <div key={log.id} className={`log-item ${log.status}`}>
                                <div className="log-status">
                                    {log.status === 'success' ? '✅' : '❌'}
                                </div>
                                <div className="log-details">
                                    <span className="log-customer">{log.customerName}</span>
                                    {log.status === 'error' && <span className="log-error">{log.message}</span>}
                                </div>
                                <div className="log-amount">
                                    {currency}{parseFloat(log.amount).toFixed(2)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
