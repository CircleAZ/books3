import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Toast from '../components/common/Toast';

const ToastContext = createContext(null);

let toastIdCounter = 0;

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const timersRef = useRef({});

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
        if (timersRef.current[id]) {
            clearTimeout(timersRef.current[id]);
            delete timersRef.current[id];
        }
    }, []);

    const showToast = useCallback((message, type = 'info', options = {}) => {
        const id = ++toastIdCounter;
        const duration = options.duration ?? 4000;

        setToasts(prev => {
            const next = [...prev, { id, message, type, undo: options.undo || null }];
            return next.length > 3 ? next.slice(-3) : next;
        });

        if (duration > 0) {
            timersRef.current[id] = setTimeout(() => removeToast(id), duration);
        }

        return id;
    }, [removeToast]);

    // UX-1: Listen for session expiry warnings from AuthContext
    useEffect(() => {
        const handleSessionExpiring = (e) => {
            showToast(
                e.detail?.message || 'Your session is expiring. Please save your work.',
                'warning',
                { duration: 55000 } // stays visible for ~55s of the 60s grace period
            );
        };

        window.addEventListener('session-expiring', handleSessionExpiring);
        return () => window.removeEventListener('session-expiring', handleSessionExpiring);
    }, [showToast]);

    const value = useMemo(() => ({
        showToast,
        removeToast,
    }), [showToast, removeToast]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="toast-container">
                {toasts.map(t => (
                    <Toast
                        key={t.id}
                        id={t.id}
                        message={t.message}
                        type={t.type}
                        undo={t.undo}
                        onDismiss={removeToast}
                    />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
}
