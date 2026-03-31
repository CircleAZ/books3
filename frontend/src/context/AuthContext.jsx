import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../config/api';

const AuthContext = createContext(null);

// Token expiry offset — refresh 60 seconds before actual expiry
// NOTE: Must be LESS than ACCESS_TOKEN_LIFETIME (15 min) or the timer never fires
const REFRESH_BUFFER_MS = 60 * 1000;

/**
 * Decode RBAC claims (role, roles, permissions) from a JWT access token.
 * This is synchronous — zero network dependency, works offline.
 */
function decodeRbacClaims(tokenStr) {
    try {
        const payload = JSON.parse(atob(tokenStr.split('.')[1]));
        return {
            role: payload.role || null,
            roles: payload.roles || [],
            permissions: payload.permissions || [],
            is_staff: payload.is_staff || false,
            is_superuser: payload.is_superuser || false,
        };
    } catch {
        return { role: null, roles: [], permissions: [], is_staff: false, is_superuser: false };
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(true);
    // RBAC state — decoded from JWT, no network fetch required
    const [rbac, setRbac] = useState({ role: null, roles: [], permissions: [], is_staff: false, is_superuser: false });

    // LENS-17 fix: Prevent concurrent refresh attempts
    const refreshPromiseRef = useRef(null);
    // Dedup: prevent multiple session-expiring warnings per cycle
    const sessionWarningFiredRef = useRef(false);
    // Proactive refresh timer (ARCH-3)
    const refreshTimerRef = useRef(null);

    // Load auth state from localStorage on mount
    useEffect(() => {
        const storedToken = localStorage.getItem('access_token');
        const storedUser = localStorage.getItem('user');

        if (storedToken && storedUser) {
            try {
                setToken(storedToken);
                setUser(JSON.parse(storedUser));
                setRbac(decodeRbacClaims(storedToken));
            } catch (e) {
                // BUG-1: Corrupted localStorage — clear and force re-login
                console.error('Corrupted auth data in localStorage, clearing');
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                localStorage.removeItem('user');
                localStorage.removeItem('profile');
            }
        }
        setLoading(false);
    }, []);

    // Session expiry warning timer
    const expiryWarningRef = useRef(null);

    // ARCH-3: Schedule proactive token refresh
    const scheduleTokenRefresh = useCallback((tokenStr) => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        if (expiryWarningRef.current) clearTimeout(expiryWarningRef.current);

        try {
            // Decode JWT payload to get exp
            const payload = JSON.parse(atob(tokenStr.split('.')[1]));
            const expiresAt = payload.exp * 1000; // convert to ms
            const now = Date.now();
            const timeUntilRefresh = expiresAt - now - REFRESH_BUFFER_MS;

            if (timeUntilRefresh > 0) {
                refreshTimerRef.current = setTimeout(async () => {
                    sessionWarningFiredRef.current = false;
                    const refreshed = await refreshToken();
                    if (!refreshed) {
                        // UX-1: Warn user before force-logout (deduped)
                        if (!sessionWarningFiredRef.current) {
                            sessionWarningFiredRef.current = true;
                            window.dispatchEvent(new CustomEvent('session-expiring', {
                                detail: { message: 'Your session is expiring. Please save your work.' }
                            }));
                        }

                        // Give user 60 seconds to finish before force-logout
                        expiryWarningRef.current = setTimeout(() => {
                            logout();
                        }, 60000);
                    }
                }, timeUntilRefresh);
            } else {
                // Token is already near expiry (e.g. page reload) — refresh immediately
                refreshToken();
            }
        } catch (e) {
            // Can't decode token — skip proactive refresh
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Start proactive refresh when token changes
    useEffect(() => {
        if (token) {
            scheduleTokenRefresh(token);
        }
        return () => {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        };
    }, [token, scheduleTokenRefresh]);

    // ARCH-4: Multi-tab sync — listen for storage changes
    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === 'access_token') {
                if (!e.newValue) {
                    // Another tab logged out
                    setToken(null);
                    setUser(null);
                } else {
                    setToken(e.newValue);
                }
            }
            if (e.key === 'user') {
                if (e.newValue) {
                    try {
                        setUser(JSON.parse(e.newValue));
                    } catch { /* ignore corrupted */ }
                } else {
                    setUser(null);
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const login = async (username, password, rememberMe = false) => {
        try {
            const response = await fetch(`${API_BASE}/account/login/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, remember_me: rememberMe }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            // Store tokens
            localStorage.setItem('access_token', data.access);
            localStorage.setItem('refresh_token', data.refresh);
            localStorage.setItem('user', JSON.stringify(data.user));

            if (data.profile) {
                localStorage.setItem('profile', JSON.stringify(data.profile));
            }

            setToken(data.access);
            setUser(data.user);
            setRbac(decodeRbacClaims(data.access));

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const logout = async () => {
        try {
            const refreshTokenStr = localStorage.getItem('refresh_token');
            let currentToken = token || localStorage.getItem('access_token');

            if (currentToken && refreshTokenStr) {
                // BUG-2: If access token is expired, try refreshing first for a clean logout
                let res = await fetch(`${API_BASE}/account/logout/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${currentToken}`,
                    },
                    body: JSON.stringify({ refresh: refreshTokenStr }),
                });

                // If 401, try getting a fresh token to blacklist the refresh
                if (res.status === 401) {
                    const refreshed = await refreshToken();
                    if (refreshed) {
                        currentToken = localStorage.getItem('access_token');
                        await fetch(`${API_BASE}/account/logout/`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${currentToken}`,
                            },
                            body: JSON.stringify({ refresh: refreshTokenStr }),
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear proactive refresh timer
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

            // Clear local storage
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('user');
            localStorage.removeItem('profile');

            setToken(null);
            setUser(null);
        }
    };

    // Ref to always read the latest token without re-creating fetchWithAuth
    const tokenRef = useRef(token);
    useEffect(() => { tokenRef.current = token; }, [token]);

    const fetchWithAuth = useCallback(async (url, options = {}) => {
        const headers = {
            ...options.headers,
        };

        // Only set Content-Type to JSON if body is NOT FormData
        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        }

        if (tokenRef.current) {
            headers['Authorization'] = `Bearer ${tokenRef.current}`;
        }

        const response = await fetch(url, { ...options, headers });

        // Handle token expiration (401)
        if (response.status === 401) {
            // Try to refresh token
            const refreshed = await refreshToken();
            if (refreshed) {
                // Retry request with new token
                headers['Authorization'] = `Bearer ${localStorage.getItem('access_token')}`;
                return fetch(url, { ...options, headers });
            } else {
                logout();
            }
        }

        // RBAC 403 interceptor: force token refresh to sync permissions (Tribunal Consensus 3)
        if (response.status === 403) {
            const refreshed = await refreshToken();
            if (refreshed) {
                const freshToken = localStorage.getItem('access_token');
                setRbac(decodeRbacClaims(freshToken));
            }
            // Still return the 403 response so the calling code can handle it
        }

        return response;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const refreshToken = async () => {
        // LENS-17: If a refresh is already in-flight, reuse it
        if (refreshPromiseRef.current) return refreshPromiseRef.current;

        refreshPromiseRef.current = (async () => {
            try {
                const refresh = localStorage.getItem('refresh_token');
                if (!refresh) return false;

                const response = await fetch(`${API_BASE}/token/refresh/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh }),
                });

                if (!response.ok) return false;

                const data = await response.json();
                localStorage.setItem('access_token', data.access);
                if (data.refresh) {
                    localStorage.setItem('refresh_token', data.refresh);
                }
                setToken(data.access);
                setRbac(decodeRbacClaims(data.access));
                return true;
            } catch {
                return false;
            } finally {
                refreshPromiseRef.current = null;
            }
        })();

        return refreshPromiseRef.current;
    };

    const value = {
        user,
        token,
        loading,
        isAuthenticated: !!token,
        login,
        logout,
        fetchWithAuth,
        // RBAC claims (decoded from JWT — zero network dependency)
        rbac,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
