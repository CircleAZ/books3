import React, { useState, useEffect } from 'react';

import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './SettingsIndex.css';

const NotificationSettings = () => {
    const { fetchWithAuth } = useAuth();

    const [preferences, setPreferences] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPreferences();
    }, []);

    const fetchPreferences = async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_NOTIFICATIONS}`);
            if (response.ok) {
                const data = await response.json();
                setPreferences(data.results || data);
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (id, currentStatus) => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_NOTIFICATIONS}${id}/`, {
                method: 'PATCH',
                body: JSON.stringify({ is_enabled: !currentStatus })
            });
            if (response.ok) {
                setPreferences(prev => prev.map(p =>
                    p.id === id ? { ...p, is_enabled: !currentStatus } : p
                ));
            }
        } catch (error) {
            console.error('Error updating notification:', error);
        }
    };

    if (loading) return <div>Loading Notification Preferences...</div>;

    return (
        <div className="settings-page">


            <div className="settings-card">
                <table className="settings-table">
                    <thead>
                        <tr>
                            <th>Notification Type</th>
                            <th>Recipients</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {preferences.map(pref => (
                            <tr key={pref.id}>
                                <td>{pref.notification_type_display || pref.notification_type}</td>
                                <td>{pref.recipients || 'All Admins'}</td>
                                <td>
                                    <label className="switch">
                                        <input
                                            type="checkbox"
                                            checked={pref.is_enabled}
                                            onChange={() => handleToggle(pref.id, pref.is_enabled)}
                                        />
                                        <span className="slider round"></span>
                                    </label>
                                </td>
                            </tr>
                        ))}
                        {preferences.length === 0 && (
                            <tr><td colSpan="3">No notification preferences found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default NotificationSettings;
