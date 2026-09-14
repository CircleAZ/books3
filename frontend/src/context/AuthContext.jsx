import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { API_BASE } from '../config/api';
import { secureStorage } from '../utils/secureStorage';

const AuthContext = createContext(null);

// Token expiry offset — refresh 2 minutes before actual expiry
// NOTE: Must be LESS than ACCESS_TOKEN_LIFETIME (30 min) or the timer never fires
const REFRESH_BUFFER_MS = 120 * 1000;

// Backend keepalive interval (10 minutes) — prevents Render free-tier sleep
const KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000;

// Retry settings for proactive token refresh
const REFRESH_MAX_RETRIES = 3;
const REFRESH_RETRY_DELAYS = [3000, 6000, 12000]; // 3s, 6s, 12s

/**
 * Robustly decodes a Base64Url JWT payload.
 * Standard atob throws DOMExceptions if it encounters '-' or '_', which are standard in Base64Url.
 * This normalizes the Base64 sequence and uses UTF-8 decoding to ensure unicode resilience.
 */
function decodeJwtPayload(tokenStr) {
    const base64Url = tokenStr.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    
    // Use TextDecoder to safely handle any multi-byte UTF-8 sequences (e.g., emojis/i18n names)
    const decoder = new TextDecoder('utf-8');
    return JSON.parse(decoder.decode(bytes));
}

/**
 * Decode RBAC claims (role, roles, permissions) from a JWT access token.
 * This is synchronous — zero network dependency, works offline.
 */
function decodeRbacClaims(tokenStr) {
    try {
        const payload = decodeJwtPayload(tokenStr);
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
    
    // Elevated Auth Modal state
    const [elevatedAuthRequest, setElevatedAuthRequest] = useState(null);

    // LENS-17 fix: Prevent concurrent refresh attempts
    const refreshPromiseRef = useRef(null);
    // Dedup: prevent multiple session-expiring warnings per cycle
    const sessionWarningFiredRef = useRef(false);
    // Proactive refresh timer (ARCH-3)
    const refreshTimerRef = useRef(null);
    // Backend keepalive timer
    const keepaliveTimerRef = useRef(null);

    useEffect(() => {
        const storedToken = secureStorage.getItem('access_token');
        const storedUserStr = secureStorage.getItem('user');

        if (storedToken && storedUserStr) {
            try {
                setToken(storedToken);
                setUser(JSON.parse(storedUserStr));
                setRbac(decodeRbacClaims(storedToken));
            } catch (e) {
                // BUG-1: Corrupted secureStorage — clear and force re-login
                console.error('Corrupted auth data in secureStorage, clearing');
                secureStorage.removeItem('access_token');
                secureStorage.removeItem('refresh_token');
                secureStorage.removeItem('user');
                secureStorage.removeItem('profile');
            }
        }
        setLoading(false);
    }, []);

    // Session expiry warning timer
    const expiryWarningRef = useRef(null);

    // ── Backend Keepalive Heartbeat ──
    // Pings /api/health/ every 4 minutes while authenticated to prevent
    // Render free-tier backends from going to sleep (15-min inactivity spin-down).
    useEffect(() => {
        if (!token) {
            if (keepaliveTimerRef.current) clearInterval(keepaliveTimerRef.current);
            return;
        }

        const pingBackend = () => {
            fetch(`${API_BASE}/health/`, { method: 'GET', cache: 'no-store' }).catch(() => {});
        };

        // Ping immediately on login, then every 4 minutes
        pingBackend();
        keepaliveTimerRef.current = setInterval(pingBackend, KEEPALIVE_INTERVAL_MS);

        return () => {
            if (keepaliveTimerRef.current) clearInterval(keepaliveTimerRef.current);
        };
    }, [token]);

    // ── Proactive Token Refresh with Retry ──
    // Wraps refreshToken() with exponential backoff retries.
    // Before each retry, sends a wake-up ping to warm the backend.
    const refreshTokenWithRetryRef = useRef(null);

    // ARCH-3: Schedule proactive token refresh
    const scheduleTokenRefresh = useCallback((tokenStr) => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        if (expiryWarningRef.current) clearTimeout(expiryWarningRef.current);

        try {
            const payload = decodeJwtPayload(tokenStr);
            const expiresAt = payload.exp * 1000;
            const now = Date.now();
            const timeUntilRefresh = expiresAt - now - REFRESH_BUFFER_MS;

            if (timeUntilRefresh > 0) {
                refreshTimerRef.current = setTimeout(async () => {
                    sessionWarningFiredRef.current = false;

                    // Use the ref to always call the latest version
                    const retryFn = refreshTokenWithRetryRef.current;
                    const refreshed = retryFn ? await retryFn() : false;

                    if (!refreshed) {
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
                // Token already expired or very close — defer to 401 interceptor
                console.warn('Token lifetime near zero or negative. Deferring to 401 interceptor.');
            }
        } catch (e) {
            console.error('JWT Decode Error:', e);
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
            // Because we obfuscated keys, we must listen for the obfuscated key name
            // _az_at = access_token, _az_u = user
            if (e.key === '_az_at' || e.key === 'access_token') {
                if (!e.newValue) {
                    // Another tab logged out
                    setToken(null);
                    setUser(null);
                } else {
                    setToken(secureStorage.getItem('access_token'));
                }
            }
            if (e.key === '_az_u' || e.key === 'user') {
                if (e.newValue) {
                    try {
                        const userStr = secureStorage.getItem('user');
                        if (userStr) setUser(JSON.parse(userStr));
                    } catch { /* ignore corrupted */ }
                } else {
                    setUser(null);
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const _processTokenResponse = (data) => {
        secureStorage.setItem('access_token', data.access);
        secureStorage.setItem('refresh_token', data.refresh);
        secureStorage.setItem('user', JSON.stringify(data.user));

        if (data.profile) {
            secureStorage.setItem('profile', JSON.stringify(data.profile));
        }
        
        // DEVICE TOKEN: Store securely. 
        // This is explicitly NOT cleared on logout so this device remains trusted.
        if (data.device_token) {
            secureStorage.setItem('device_token', data.device_token);
        }

        setToken(data.access);
        setUser(data.user);
        setRbac(decodeRbacClaims(data.access));
    };

    const login = async (username, password, rememberMe = false) => {
        try {
            const deviceToken = secureStorage.getItem('device_token');
            const response = await fetch(`${API_BASE}/account/login/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username, 
                    password, 
                    remember_me: rememberMe,
                    ...(deviceToken ? { device_token: deviceToken } : {})
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            // OTP required — credentials valid but tokens not issued yet
            if (data.requires_otp) {
                return {
                    success: false,
                    requires_otp: true,
                    requires_email_verification: data.requires_email_verification || false,
                    otp_session: data.otp_session,
                    email: data.email,
                };
            }

            // Direct login (OTP skipped — already verified today)
            _processTokenResponse(data);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const verifyOtp = async (otpSession, code) => {
        try {
            const response = await fetch(`${API_BASE}/account/verify-otp/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ otp_session: otpSession, code }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'OTP verification failed');
            }

            _processTokenResponse(data);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const resendOtp = async (otpSession) => {
        try {
            const response = await fetch(`${API_BASE}/account/resend-otp/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ otp_session: otpSession }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to resend OTP');
            }

            return { success: true, otp_session: data.otp_session };
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const logout = async () => {
        try {
            const refreshTokenStr = secureStorage.getItem('refresh_token');
            let currentToken = token || secureStorage.getItem('access_token');

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
                        currentToken = secureStorage.getItem('access_token');
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

            // VORTEX-02: Clear SW API cache on logout to prevent cross-user data leakage
            if ('caches' in window) {
                caches.delete('api-cache').catch(() => {});
            }

            // Clear storage
            secureStorage.removeItem('access_token');
            secureStorage.removeItem('refresh_token');
            secureStorage.removeItem('user');
            secureStorage.removeItem('profile');

            setToken(null);
            setUser(null);
        }
    };

    // Ref to always read the latest token without re-creating fetchWithAuth
    const tokenRef = useRef(token);
    useEffect(() => { tokenRef.current = token; }, [token]);

    const fetchWithAuth = useCallback(async (url, options = {}) => {
        // PROACTIVE INTERCEPTOR: Prevent doomed 401 requests from polluting the console
        if (tokenRef.current) {
            try {
                const payload = decodeJwtPayload(tokenRef.current);
                const expiresAt = payload.exp * 1000;
                // If token expires in less than 30 seconds (or is already expired), refresh BEFORE sending
                if (expiresAt - Date.now() < 30000) {
                    await refreshToken();
                }
            } catch (e) {
                // Ignore decoding errors and let the backend reject it naturally
            }
        }

        const headers = {
            ...options.headers,
        };

        // Only set Content-Type to JSON if body is NOT FormData
        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        }

        // Must read directly from secureStorage here in case `refreshToken()` just ran
        // because React state `tokenRef.current` won't be updated until the next cycle
        const currentToken = secureStorage.getItem('access_token') || tokenRef.current;
        if (currentToken) {
            headers['Authorization'] = `Bearer ${currentToken}`;
        }

        const response = await fetch(url, { ...options, headers, cache: 'no-store' });

        // Handle token expiration (401)
        if (response.status === 401) {
            // Try to refresh token
            const refreshed = await refreshToken();
            if (refreshed) {
                // Only auto-retry idempotent methods (GET/HEAD/OPTIONS).
                // Mutating methods (POST/PUT/PATCH/DELETE) must NOT be auto-retried
                // because the server may have already processed the original request.
                const method = (options.method || 'GET').toUpperCase();
                const safeToRetry = ['GET', 'HEAD', 'OPTIONS'].includes(method);
                if (safeToRetry) {
                    headers['Authorization'] = `Bearer ${secureStorage.getItem('access_token')}`;
                    return fetch(url, { ...options, headers, cache: 'no-store' });
                }
                // For mutating methods: token is refreshed for next call,
                // but return the 401 response so the caller can handle it
            } else {
                logout();
            }
        }

        // RBAC 403 interceptor: force token refresh to sync permissions (Tribunal Consensus 3)
        if (response.status === 403) {
            const clonedResponse = response.clone();
            const data = await clonedResponse.json().catch(() => ({}));

            if (data.code === 'requires_elevated_otp') {
                return new Promise((resolve, reject) => {
                    setElevatedAuthRequest({
                        resolve: () => {
                            setElevatedAuthRequest(null);
                            fetch(url, { ...options, headers, cache: 'no-store' })
                                .then(resolve)
                                .catch(reject);
                        },
                        reject: () => {
                            setElevatedAuthRequest(null);
                            resolve(response); // Resolve with original 403
                        }
                    });
                });
            }

            const refreshed = await refreshToken();
            if (refreshed) {
                const freshToken = secureStorage.getItem('access_token');
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
                const refresh = secureStorage.getItem('refresh_token');
                if (!refresh) return false;

                const response = await fetch(`${API_BASE}/token/refresh/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh }),
                    cache: 'no-store',
                });

                if (!response.ok) return false;

                const data = await response.json();
                secureStorage.setItem('access_token', data.access);
                if (data.refresh) {
                    secureStorage.setItem('refresh_token', data.refresh);
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

    // Retry wrapper: attempts refreshToken up to 3 times with wake-up pings
    const refreshTokenWithRetry = async () => {
        for (let attempt = 0; attempt <= REFRESH_MAX_RETRIES; attempt++) {
            const success = await refreshToken();
            if (success) return true;

            // Don't retry if we've exhausted attempts
            if (attempt >= REFRESH_MAX_RETRIES) break;

            // Wake up backend before next retry
            try {
                await fetch(`${API_BASE}/health/`, { method: 'GET', cache: 'no-store' });
            } catch { /* ignore */ }

            // Wait before retrying (3s, 6s, 12s)
            await new Promise(r => setTimeout(r, REFRESH_RETRY_DELAYS[attempt]));
        }
        return false;
    };

    // Keep retry ref always pointing to latest closure
    refreshTokenWithRetryRef.current = refreshTokenWithRetry;

    const value = useMemo(() => ({
        user,
        token,
        loading,
        isAuthenticated: !!token,
        login,
        logout,
        verifyOtp,
        resendOtp,
        fetchWithAuth,
        // RBAC claims (decoded from JWT — zero network dependency)
        rbac,
        elevatedAuthRequest,
        setElevatedAuthRequest,
    }), [user, token, loading, fetchWithAuth, rbac, elevatedAuthRequest]);

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
