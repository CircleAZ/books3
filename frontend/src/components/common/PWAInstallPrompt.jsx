import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './PWAInstallPrompt.css';

export default function PWAInstallPrompt() {
    const { isAuthenticated } = useAuth();
    const [deferredPrompt, setDeferredPrompt] = useState(window.deferredInstallPrompt);
    const [showIosPrompt, setShowIosPrompt] = useState(false);
    const [isDismissed, setIsDismissed] = useState(
        localStorage.getItem('azbooks_install_dismissed') === 'true'
    );

    // Gate: Only show PWA install prompt to authenticated staff.
    // Public visitors (e.g. customers viewing receipts at /r/:uuid) must never see this.
    if (!isAuthenticated) return null;

    useEffect(() => {
        if (isDismissed) return;

        // 1. Android/Chrome Flow
        const handleReady = () => {
            setDeferredPrompt(window.deferredInstallPrompt);
        };

        if (window.deferredInstallPrompt) {
            setDeferredPrompt(window.deferredInstallPrompt);
        } else {
            window.addEventListener('app-install-prompt-ready', handleReady);
        }

        // 2. iOS Safari Flow
        const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        
        // Anti-Trap: Detect WebViews (Instagram, Facebook, etc.)
        // These don't have a "Share" button to add to home screen.
        const isWebView = /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(navigator.userAgent) || 
                          /FBAV|Instagram|Line/i.test(navigator.userAgent);
                          
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

        if (isIos && !isWebView && !isStandalone) {
            // Delay slightly so it doesn't jarringly pop up the millisecond the app loads
            const timer = setTimeout(() => setShowIosPrompt(true), 2000);
            return () => {
                clearTimeout(timer);
                window.removeEventListener('app-install-prompt-ready', handleReady);
            };
        }

        return () => {
            window.removeEventListener('app-install-prompt-ready', handleReady);
        };
    }, [isDismissed]);

    const handleDismiss = () => {
        localStorage.setItem('azbooks_install_dismissed', 'true');
        setIsDismissed(true);
        setDeferredPrompt(null);
        setShowIosPrompt(false);
    };

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
            // If they install, we don't need to show it again
            localStorage.setItem('azbooks_install_dismissed', 'true');
        } else {
            console.log('User dismissed the install prompt');
        }
        
        setDeferredPrompt(null);
        window.deferredInstallPrompt = null;
    };

    if (isDismissed) return null;

    if (deferredPrompt) {
        return (
            <div className="pwa-install-banner" role="dialog" aria-labelledby="install-title">
                <div className="pwa-install-header">
                    <div className="pwa-install-title" id="install-title">
                        <span>📱</span> Install AZ Books
                    </div>
                    <button className="pwa-install-close" onClick={handleDismiss} aria-label="Dismiss">
                        ✕
                    </button>
                </div>
                <div className="pwa-install-body">
                    Install this app on your device for fast, offline access.
                </div>
                <div className="pwa-install-actions">
                    <button className="btn btn-primary btn-sm" onClick={handleInstallClick}>
                        Install App
                    </button>
                </div>
            </div>
        );
    }

    if (showIosPrompt) {
        return (
            <div className="pwa-install-banner" role="dialog" aria-labelledby="ios-install-title">
                <div className="pwa-install-header">
                    <div className="pwa-install-title" id="ios-install-title">
                        <span>🍎</span> Install on iOS
                    </div>
                    <button className="pwa-install-close" onClick={handleDismiss} aria-label="Dismiss">
                        ✕
                    </button>
                </div>
                <div className="pwa-install-body">
                    To install AZ Books, tap the <strong>Share</strong> button below and select <strong>Add to Home Screen</strong>.
                </div>
            </div>
        );
    }

    return null;
}
