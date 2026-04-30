import { useState, useEffect } from 'react';
import './OfflineSyncBadge.css';

/**
 * OfflineSyncBadge — Shows offline/online connectivity status.
 * 
 * Displays a floating banner when the user goes offline,
 * warning them not to submit orders until reconnected.
 */

export default function OfflineSyncBadge() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Nothing to show when online
  if (isOnline) {
    return null;
  }

  return (
    <div className="offline-banner" role="alert" aria-live="assertive">
      <span className="offline-banner__icon">📡</span>
      <span className="offline-banner__text">
        You're offline — changes will sync when you reconnect
      </span>
    </div>
  );
}
