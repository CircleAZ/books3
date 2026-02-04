import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const API_BASE = 'http://localhost:8000/api';

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(true);

    // Load auth state from localStorage on mount
    useEffect(() => {
        const storedToken = localStorage.getItem('access_token');
        const storedUser = localStorage.getItem('user');

        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
        }
        setLoading(false);
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

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const logout = async () => {
        try {
            const refreshToken = localStorage.getItem('refresh_token');

            if (token && refreshToken) {
                await fetch(`${API_BASE}/account/logout/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({ refresh: refreshToken }),
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear local storage
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('user');
            localStorage.removeItem('profile');

            setToken(null);
            setUser(null);
        }
    };

    const fetchWithAuth = async (url, options = {}) => {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
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

        return response;
    };

    const refreshToken = async () => {
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
            setToken(data.access);
            return true;
        } catch {
            return false;
        }
    };

    const value = {
        user,
        token,
        loading,
        isAuthenticated: !!token,
        login,
        logout,
        fetchWithAuth,
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
