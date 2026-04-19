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

    // Update favicon dynamically when logo changes
    useEffect(() => {
        if (storeSettings?.logo) {
            const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
            link.type = 'image/x-icon';
            link.rel = 'shortcut icon';
            link.href = storeSettings.logo;
            document.getElementsByTagName('head')[0].appendChild(link);
        }
    }, [storeSettings?.logo]);

    return (
        <StoreContext.Provider value={{ storeSettings, fetchStoreSettings }}>
            {children}
        </StoreContext.Provider>
    );
};

export const useStoreSettings = () => useContext(StoreContext);
