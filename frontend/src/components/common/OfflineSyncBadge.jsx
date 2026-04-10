import { useState, useEffect, useCallback } from 'react';
import './OfflineSyncBadge.css';

/**
 * OfflineSyncBadge — Shows offline/online status and pending sync queue count.
 * 
 * Displays:
 * - A floating banner when offline
 * - A sync badge showing pending write count (from BackgroundSync queues)
 * - A "Synced!" notification when all queued items are replayed
 */

const QUEUE_NAMES = [
  'offline-post-queue',
  'offline-put-queue',
  'offline-patch-queue',
  'offline-delete-queue',
];

// IndexedDB database used by Workbox BackgroundSync
const WORKBOX_DB_NAME = 'workbox-background-sync';
const WORKBOX_STORE_NAME = 'requests';

/**
 * Count pending requests across all BackgroundSync queues.
 * Reads directly from the Workbox IndexedDB store.
 */
async function getPendingCount() {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(WORKBOX_DB_NAME);
      
      request.onerror = () => resolve(0);
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        
        // Check if the object store exists
        if (!db.objectStoreNames.contains(WORKBOX_STORE_NAME)) {
          db.close();
          resolve(0);
          return;
        }
        
        const tx = db.transaction(WORKBOX_STORE_NAME, 'readonly');
        const store = tx.objectStore(WORKBOX_STORE_NAME);
        const countReq = store.count();
        
        countReq.onsuccess = () => {
          db.close();
          resolve(countReq.result);
        };
        
        countReq.onerror = () => {
          db.close();
          resolve(0);
        };
      };
      
      // DB doesn't exist yet (no offline writes have occurred)
      request.onupgradeneeded = (event) => {
        event.target.transaction.abort();
        resolve(0);
      };
    } catch {
      resolve(0);
    }
  });
}

export default function OfflineSyncBadge() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [showSynced, setShowSynced] = useState(false);
  const [prevCount, setPrevCount] = useState(0);

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

  // Poll pending queue count
  const checkQueue = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount((prev) => {
      setPrevCount(prev);
      return count;
    });
  }, []);

  useEffect(() => {
    checkQueue();

    // Poll every 3 seconds when offline or when there are pending items
    // Poll every 10 seconds when online and queue is empty
    const interval = setInterval(
      checkQueue,
      !isOnline || pendingCount > 0 ? 3000 : 10000
    );

    return () => clearInterval(interval);
  }, [checkQueue, isOnline, pendingCount]);

  // Show "Synced!" notification when queue drains
  useEffect(() => {
    if (prevCount > 0 && pendingCount === 0 && isOnline) {
      setShowSynced(true);
      const timer = setTimeout(() => setShowSynced(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [pendingCount, prevCount, isOnline]);

  // Nothing to show when online and no pending/synced state
  if (isOnline && pendingCount === 0 && !showSynced) {
    return null;
  }

  return (
    <>
      {/* Offline banner */}
      {!isOnline && (
        <div className="offline-banner" role="alert" aria-live="assertive">
          <span className="offline-banner__icon">📡</span>
          <span className="offline-banner__text">
            You're offline — changes will sync when you reconnect
          </span>
          {pendingCount > 0 && (
            <span className="offline-banner__count">
              {pendingCount} pending
            </span>
          )}
        </div>
      )}

      {/* Pending sync badge (shown when online but queue isn't empty yet) */}
      {isOnline && pendingCount > 0 && (
        <div className="sync-badge sync-badge--pending" role="status" aria-live="polite">
          <span className="sync-badge__spinner" />
          <span>Syncing {pendingCount} change{pendingCount !== 1 ? 's' : ''}…</span>
        </div>
      )}

      {/* Synced notification */}
      {showSynced && (
        <div className="sync-badge sync-badge--success" role="status" aria-live="polite">
          <span>✅ All changes synced!</span>
        </div>
      )}
    </>
  );
}
