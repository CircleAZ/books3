import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './MessageQueue.css';

import '../../styles/components/data-table.css';
const MessageQueue = () => {
    const { fetchWithAuth } = useAuth();
    const location = useLocation();
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        fetchMessages();
    }, [filter, location.key]);

    const fetchMessages = async () => {
        setLoading(true);
        try {
            let url = `${ENDPOINTS.MESSAGING_QUEUE}`;
            if (filter !== 'all') {
                url += `?status=${filter}`;
            }
            const response = await fetchWithAuth(url);
            if (response.ok) {
                const data = await response.json();
                setMessages(data.results || data);
            }
        } catch (error) {
            console.error('Error fetching queue:', error);
        } finally {
            setLoading(false);
        }
    };

    const retryMessage = async (id) => {
        try {
            await fetchWithAuth(`${ENDPOINTS.MESSAGING_QUEUE}${id}/retry/`, { method: 'POST' });
            fetchMessages();
        } catch (error) {
            console.error('Error retrying message:', error);
        }
    };

    if (loading) return <div>Loading Queue...</div>;

    return (
        <div className="message-queue">
            <header>
                <div className="filters">
                    <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                        <option value="all">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="failed">Failed</option>
                        <option value="sent">Sent</option>
                    </select>
{/* fallow-ignore-next-line code-duplication */}
                </div>
            </header>
{/* fallow-ignore-next-line code-duplication */}
            <table className="data-table">
                <thead>
                    <tr>
                        <th>To</th>
                        <th>Type</th>
                        <th>Content</th>
                        <th>Status</th>
                        <th>Gateway</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {messages.map(msg => (
                        <tr key={msg.id}>
                            <td>{msg.phone}</td>
                            <td>{msg.type_display}</td>
                            <td className="msg-content">{msg.content.substring(0, 50)}...</td>
                            <td>
                                <span className={`badge status-${msg.status}`}>
                                    {msg.status_display}
                                </span>
                            </td>
                            <td>{msg.gateway_name || '-'}</td>
                            <td>{new Date(msg.created_at).toLocaleString()}</td>
                            <td>
                                {msg.status === 'failed' && (
                                    <button onClick={() => retryMessage(msg.id)} className="btn-sm btn-warning">
                                        Retry
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default MessageQueue;
