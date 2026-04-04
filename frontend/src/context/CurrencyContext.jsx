import { createContext, useContext, useState, useEffect } from 'react';
import { ENDPOINTS } from '../config/api';
import { useAuth } from './AuthContext';

const CurrencyContext = createContext();

export const useCurrency = () => {
    const context = useContext(CurrencyContext);
    if (!context) {
        // Return default if not in provider
        return { currency: '$', loading: false };
    }
    return context;
};

export const CurrencyProvider = ({ children }) => {
    const [currency, setCurrency] = useState('$');
    const [loading, setLoading] = useState(true);
    const { fetchWithAuth } = useAuth();

    const fetchCurrency = async () => {
        try {
            const response = await fetchWithAuth(ENDPOINTS.SETTINGS_STORE);
            if (response.ok) {
                const data = await response.json();
                // Handle both single object and array responses
                const storeData = Array.isArray(data) ? data[0] : data;
                setCurrency(storeData?.currency_symbol || '$');
            }
        } catch (error) {
            console.error('Error fetching currency settings:', error);
            // Keep default '$' on error
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (fetchWithAuth) {
            fetchCurrency();
        }
    }, [fetchWithAuth]);

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
