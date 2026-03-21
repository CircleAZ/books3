import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './NotificationPanel.css';

const TYPE_ICONS = {
    info: '💬',
    warning: '⚠️',
    success: '✅',
    error: '❌',
    stock: '📦',
    order: '🛒',
};

export default function NotificationPanel({ isOpen, onClose, onCountUpdate }) {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);
    const panelRef = useRef(null);
    const navigate = useNavigate();
    const { fetchWithAuth } = useAuth();

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(e) {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                onClose();
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    // Fetch notifications when panel opens
    useEffect(() => {
        if (isOpen) {
            fetchNotifications();
        }
    }, [isOpen]);

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(ENDPOINTS.NOTIFICATIONS);
            if (res.ok) {
                const data = await res.json();
                setNotifications(data);
            }
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (id) => {
        try {
            await fetchWithAuth(`${ENDPOINTS.NOTIFICATIONS}${id}/read/`, {
                method: 'PATCH',
            });
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, is_read: true } : n)
            );
            // Update parent count
            onCountUpdate?.(prev => Math.max(0, prev - 1));
        } catch (err) {
            console.error('Failed to mark notification as read:', err);
        }
    };

    const markAllRead = async () => {
        try {
            await fetchWithAuth(ENDPOINTS.NOTIFICATIONS, {
                method: 'POST',
            });
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            onCountUpdate?.(0);
        } catch (err) {
            console.error('Failed to mark all as read:', err);
        }
    };

    const handleClick = (notification) => {
        if (!notification.is_read) {
            markAsRead(notification.id);
        }
        if (notification.link) {
            navigate(notification.link);
            onClose();
        }
    };

    if (!isOpen) return null;

    const unreadCount = notifications.filter(n => !n.is_read).length;

    return (
        <div className="notification-panel animate-fade-in" ref={panelRef}>
            <div className="notification-header">
                <h3>Notifications</h3>
                {unreadCount > 0 && (
                    <button className="mark-all-btn" onClick={markAllRead}>
                        Mark all read
                    </button>
                )}
            </div>

            <div className="notification-list">
                {loading ? (
                    <div className="notification-empty">
                        <span className="loading-spinner" />
                        Loading...
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="notification-empty">
                        <span className="empty-icon">🔔</span>
                        <p>No notifications yet</p>
                    </div>
                ) : (
                    notifications.map(n => (
                        <button
                            key={n.id}
                            className={`notification-item ${!n.is_read ? 'unread' : ''}`}
                            onClick={() => handleClick(n)}
                        >
                            <span className="notification-type-icon">{TYPE_ICONS[n.type] || '💬'}</span>
                            <div className="notification-content">
                                <p className="notification-title">{n.title}</p>
                                <p className="notification-message">{n.message}</p>
                                <span className="notification-time">{n.time_ago}</span>
                            </div>
                            {!n.is_read && <span className="unread-dot" />}
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
