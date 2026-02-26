import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './MessagingIndex.css'; // Assume style exists

const MessagingIndex = () => {
    const { fetchWithAuth } = useAuth();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.MESSAGING_QUEUE}stats/`);
            if (response.ok) {
                const data = await response.json();
                setStats(data);
            }
        } catch (error) {
            console.error('Error fetching messaging stats:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="messaging-dashboard">
            <h1>Messaging System</h1>

            <div className="messaging-cards">
                <Link to="/messaging/gateways" className="card">
                    <h3>Gateways</h3>
                    <p>Manage Android SMS Gateways</p>
                </Link>
                <Link to="/messaging/queue" className="card">
                    <h3>Message Queue</h3>
                    <p>Monitor Pending/Sent Messages</p>
                </Link>
                <Link to="/messaging/templates" className="card">
                    <h3>Templates</h3>
                    <p>Manage SMS/WhatsApp Templates</p>
                </Link>
            </div>

            {loading ? <p>Loading stats...</p> : stats && (
                <div className="stats-grid">
                    <div className="stat-card">
                        <h4>Pending</h4>
                        <div className="value">{stats.pending}</div>
                    </div>
                    <div className="stat-card">
                        <h4>Sent Today</h4>
                        <div className="value">{stats.total_today}</div>
                    </div>
                    <div className="stat-card error">
                        <h4>Failed</h4>
                        <div className="value">{stats.failed}</div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MessagingIndex;
