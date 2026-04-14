import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ENDPOINTS } from '../config/api';
import { useAuth } from './AuthContext';

const CurrencyContext = createContext();

// Default matches Django model: StoreSettings.currency_symbol default='₹'
const DEFAULT_CURRENCY = '₹';

export const useCurrency = () => {
    const context = useContext(CurrencyContext);
    if (!context) {
        // Return default if not in provider
        return { currency: DEFAULT_CURRENCY, loading: false };
    }
    return context;
};

export const CurrencyProvider = ({ children }) => {
    const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
    const [loading, setLoading] = useState(true);
    const { fetchWithAuth, token } = useAuth();

    const fetchCurrency = useCallback(async (retries = 3) => {
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const response = await fetchWithAuth(ENDPOINTS.SETTINGS_STORE);
                if (response.ok) {
                    const data = await response.json();
                    // Handle both single object and array responses
                    const storeData = Array.isArray(data) ? data[0] : data;
                    setCurrency(storeData?.currency_symbol || DEFAULT_CURRENCY);
                    return; // Success — stop retrying
                }
            } catch (error) {
                console.error(`Currency fetch attempt ${attempt + 1} failed:`, error);
            }

            // Wait before retrying (1s, 2s, 4s)
            if (attempt < retries - 1) {
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
            }
        }
        // All retries exhausted — keep current state (DEFAULT_CURRENCY on first load)
        setLoading(false);
    }, [fetchWithAuth]);

    // Fetch on initial mount when authenticated
    useEffect(() => {
        if (token && fetchWithAuth) {
            setLoading(true);
            fetchCurrency().finally(() => setLoading(false));
        }
    }, [token, fetchWithAuth, fetchCurrency]);

    const value = {
        currency,
        setCurrency,
        refreshCurrency: fetchCurrency,
        loading,
        // Format currency with symbol
        formatCurrency: (amount) => {
            const formatted = Number(amount || 0).toFixed(2);
            return `${currency}${formatted}`;
        }
    };

    return (
        <CurrencyContext.Provider value={value}>
            {children}
        </CurrencyContext.Provider>
    );
};

export default CurrencyContext;
