import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { ENDPOINTS } from '../config/api';

const StoreContext = createContext(null);

export const StoreProvider = ({ children }) => {
    const { fetchWithAuth, user } = useAuth();
    const [storeSettings, setStoreSettings] = useState(null);

    const fetchStoreSettings = useCallback(async () => {
        if (!user) return; // Don't fetch if not logged in
        try {
            const response = await fetchWithAuth(ENDPOINTS.SETTINGS_STORE);
            if (response.ok) {
                const data = await response.json();
                const settings = Array.isArray(data) ? data[0] : (data.results ? data.results[0] : data);
                setStoreSettings(settings);
            }
        } catch (error) {
            console.error('Error fetching global store settings:', error);
        }
    }, [fetchWithAuth, user]);

    useEffect(() => {
        fetchStoreSettings();
    }, [fetchStoreSettings]);

    // Favicon is set statically in index.html (points to CDN favicon.png).
    // Do NOT dynamically override it with storeSettings.logo — that's the
    // full-size 600px image, not the 32px favicon, and causes a 27KB
    // redundant fetch on every page load.

    return (
        <StoreContext.Provider value={{ storeSettings, fetchStoreSettings }}>
            {children}
        </StoreContext.Provider>
    );
};

export const useStoreSettings = () => useContext(StoreContext);
