import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import './PWAPrompt.css';

export default function PWAPrompt() {
    const { isAuthenticated } = useAuth();
    const { showToast } = useToast();
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisterError(error) {
            console.error('SW registration error', error);
        },
    });

    const [isUpdating, setIsUpdating] = useState(false);

    // Hard-reload all tabs when the controller actually changes (Zombie Tab Executioner)
    useEffect(() => {
        let refreshing = false;
        const handleControllerChange = () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        };

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
        }

        return () => {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
            }
        };
    }, []);

    const handleUpdate = async () => {
        // The Offline Brick Preventer
        if (!navigator.onLine) {
            showToast('Cannot update while offline. Please connect to the internet.', 'error');
            return;
        }

        // The State Guardian
        if (!window.confirm("Updating will reload the page. Any unsaved changes will be lost. Continue?")) {
            return;
        }

        setIsUpdating(true);
        // Sends SKIP_WAITING to the new SW.
        // Once it takes control, the 'controllerchange' event fires and reloads the page.
        await updateServiceWorker(true);
    };

    // Gate: Only show update prompt to authenticated staff
    if (!isAuthenticated) return null;
    if (!needRefresh) return null;

    return (
        <div className="pwa-prompt-banner" role="alert" aria-live="assertive">
            <div className="pwa-prompt-content">
                <span className="pwa-prompt-icon">🚀</span>
                <span className="pwa-prompt-text">
                    A new version of AZ Books is available!
                </span>
            </div>
            <div className="pwa-prompt-actions">
                <button 
                    className="btn btn-primary btn-sm" 
                    onClick={handleUpdate}
                    disabled={isUpdating}
                >
                    {isUpdating ? 'Updating...' : 'Update Now'}
                </button>
                <button 
                    className="btn btn-ghost btn-sm" 
                    onClick={() => setNeedRefresh(false)}
                    disabled={isUpdating}
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}
