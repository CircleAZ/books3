import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import { sanitizeDecimalFields, sanitizeFKFields } from '../../utils/payloadSanitizer';

/**
 * Universal Payment Engine
 * Handles core money logic: fetching banks/wallets, mapping payment methods to ledgers,
 * and producing a sanitized backend-ready payload object.
 * 
 * @param {string} transactionType - 'inflow' (destination_*) or 'outflow' (source_*)
 * @param {string[]} allowedMethods - e.g., ['cash', 'bank', 'upi', 'cheque', 'store_credit', 'employee_expense']
 * @param {number|null} maxAmount - Enforced mathematical limit (optional)
 * @param {string} initialAmount - Initial value for the amount input
 * @param {Function} onValidPayload - Callback fired with valid payload object, or null if incomplete
 * @param {ReactNode} children - Extension slot for domain-specific UI (bypasses, etc.)
 */
export default function UniversalPaymentEngine({
    transactionType = 'outflow',
    allowedMethods = ['cash', 'bank'],
    maxAmount = null,
    initialAmount = '',
    hideAmount = false,
    onValidPayload = () => {},
    children
}) {
    const { fetchWithAuth } = useAuth();

    // Internal State
    const [amount, setAmount] = useState(initialAmount);
    const [method, setMethod] = useState(allowedMethods[0] || 'cash');
    const [selectedBank, setSelectedBank] = useState('');
    const [selectedWallet, setSelectedWallet] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState('');

    // Sync initialAmount to amount state when it changes
    useEffect(() => {
        setAmount(initialAmount);
    }, [initialAmount]);

    // Ledger Data
    const [banks, setBanks] = useState([]);
    const [wallets, setWallets] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loadingData, setLoadingData] = useState(false);

    const allowedMethodsKey = allowedMethods.join(',');

    // Fetch required dependencies
    useEffect(() => {
        let mounted = true;
        const methods = allowedMethodsKey.split(',');
        const fetchDependencies = async () => {
            setLoadingData(true);
            const promises = [];
            
            if (methods.includes('cash') && wallets.length === 0) {
                promises.push(fetchWithAuth(ENDPOINTS.FINANCE_CASH_WALLETS + '?active_only=true')
                    .then(r => r.ok ? r.json() : []).then(d => d.results || d).then(w => mounted && setWallets(w)));
            }
            if ((methods.includes('bank') || methods.includes('upi') || methods.includes('cheque')) && banks.length === 0) {
                promises.push(fetchWithAuth(ENDPOINTS.FINANCE_BANK_ACCOUNTS + '?active_only=true')
                    .then(r => r.ok ? r.json() : []).then(d => d.results || d).then(b => mounted && setBanks(b)));
            }
            if (methods.includes('employee_expense') && employees.length === 0) {
                promises.push(fetchWithAuth(ENDPOINTS.SETTINGS_USERS)
                    .then(r => r.ok ? r.json() : []).then(d => d.results || d).then(e => mounted && setEmployees(e.filter(u => u.is_active))));
            }

            if (promises.length > 0) {
                await Promise.allSettled(promises);
            }
            if (mounted) setLoadingData(false);
        };

        fetchDependencies();
        return () => { mounted = false; };
    }, [allowedMethodsKey, fetchWithAuth]); // Run only when allowedMethods changes

    // Update parent when state becomes valid/invalid
    useEffect(() => {
        // Validation rules
        if (!hideAmount) {
            const parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                onValidPayload(null);
                return;
            }

            if (maxAmount !== null && parsedAmount > maxAmount) {
                onValidPayload(null);
                return;
            }
        }

        let isComplete = false;
        let payload = {
            payment_method: method
        };
        
        if (!hideAmount) {
            payload.amount = amount;
        }

        const ledgerPrefix = transactionType === 'inflow' ? 'destination_' : 'source_';

        if (method === 'cash') {
            if (selectedWallet) {
                payload[`${ledgerPrefix}wallet`] = selectedWallet;
                isComplete = true;
            }
        } else if (method === 'bank' || method === 'upi' || method === 'cheque') {
            if (selectedBank) {
                payload[`${ledgerPrefix}bank`] = selectedBank;
                isComplete = true;
            }
        } else if (method === 'employee_expense') {
            if (selectedEmployee) {
                payload['paid_by_employee'] = selectedEmployee;
                isComplete = true;
            }
        } else if (method === 'store_credit') {
            // Handled separately or implicitly valid without ledger selection
            isComplete = true;
        }

        if (isComplete) {
            // Apply Frontera sanitizers before emitting
            if (!hideAmount) sanitizeDecimalFields(payload, ['amount']);
            sanitizeFKFields(payload, [
                `${ledgerPrefix}wallet`, 
                `${ledgerPrefix}bank`, 
                'paid_by_employee'
            ]);
            onValidPayload(payload);
        } else {
            onValidPayload(null);
        }
    }, [amount, method, selectedBank, selectedWallet, selectedEmployee, maxAmount, transactionType, hideAmount, onValidPayload]);

    const formatMethodLabel = (m) => {
        const labels = {
            'cash': 'Cash',
            'bank': 'Bank Transfer',
            'upi': 'UPI',
            'cheque': 'Cheque',
            'store_credit': 'Store Credit',
            'employee_expense': 'Employee Expense'
        };
        return labels[m] || m;
    };

    return (
        <div className="universal-payment-engine" style={{ width: '100%' }}>
            {/* Method Selector */}
            <select 
                className="form-control" 
                value={method} 
                onChange={e => {
                    setMethod(e.target.value);
                    // Reset selections on switch
                    setSelectedBank('');
                    setSelectedWallet('');
                    setSelectedEmployee('');
                }} 
                style={{ width: '100%', marginBottom: '10px' }}
            >
                {allowedMethods.map(m => (
                    <option key={m} value={m}>{formatMethodLabel(m)}</option>
                ))}
            </select>

            {/* Ledger Selectors based on method */}
            {method === 'cash' && wallets.length > 0 && (
                <select 
                    className="form-control" 
                    value={selectedWallet} 
                    onChange={e => setSelectedWallet(e.target.value)} 
                    style={{ width: '100%', marginBottom: '10px' }}
                >
                    <option value="">Select cash wallet...</option>
                    {wallets.map(w => (
                        <option key={w.id} value={w.id}>{w.name} (₹{parseFloat(w.balance).toFixed(2)})</option>
                    ))}
                </select>
            )}

            {(method === 'bank' || method === 'upi' || method === 'cheque') && banks.length > 0 && (
                <select 
                    className="form-control" 
                    value={selectedBank} 
                    onChange={e => setSelectedBank(e.target.value)} 
                    style={{ width: '100%', marginBottom: '10px' }}
                >
                    <option value="">Select bank account...</option>
                    {banks.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>
            )}

            {method === 'employee_expense' && employees.length > 0 && (
                <select 
                    className="form-control" 
                    value={selectedEmployee} 
                    onChange={e => setSelectedEmployee(e.target.value)} 
                    style={{ width: '100%', marginBottom: '10px' }}
                >
                    <option value="">Select employee who paid...</option>
                    {employees.map(e => (
                        <option key={e.id} value={e.id}>
                            {e.first_name && e.last_name ? `${e.first_name} ${e.last_name}` : e.username}
                        </option>
                    ))}
                </select>
            )}

            {loadingData && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>Loading accounts...</div>}

            {/* Amount Input */}
            {!hideAmount && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
                    <input 
                        type="number" 
                        min="0.01" 
                        step="0.01" 
                        max={maxAmount || undefined}
                        placeholder="Amount (₹)" 
                        value={amount} 
                        onChange={e => setAmount(e.target.value)} 
                        className="form-control" 
                        style={{ width: '100%' }} 
                    />
                    {maxAmount !== null && parseFloat(amount) > maxAmount && (
                        <span style={{ fontSize: '0.8rem', color: '#ef4444' }}>Amount exceeds balance due (₹{maxAmount.toFixed(2)})</span>
                    )}
                </div>
            )}

            {/* Extension Slot (Injected by Parent) */}
            {children && (
                <div className="payment-extensions" style={{ marginTop: '10px', marginBottom: '10px' }}>
                    {children}
                </div>
            )}
        </div>
    );
}
