import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import Pagination from '../../components/common/Pagination';
import useServerList from '../../hooks/useServerList';
import './MessageQueue.css';

import '../../styles/components/data-table.css';

const MessageQueue = () => {
    const { fetchWithAuth } = useAuth();

    const {
        data: messages,
        loading,
        page,
        setPage,
        totalPages,
        filters,
        setFilter,
        refresh: fetchMessages,
    } = useServerList(ENDPOINTS.MESSAGING_QUEUE, {
        filterConfig: { status: 'all' },
        pageSize: 20,
        buildParams: (debouncedSearch, fltrs) => {
            const params = {};
            if (fltrs.status && fltrs.status !== 'all') {
                params.status = fltrs.status;
            }
            return params;
        }
    });

    const retryMessage = async (id) => {
        try {
            await fetchWithAuth(`${ENDPOINTS.MESSAGING_QUEUE}${id}/retry/`, { method: 'POST' });
            fetchMessages();
        } catch (error) {
            console.error('Error retrying message:', error);
        }
    };

    if (loading && messages.length === 0) return <div>Loading Queue...</div>;

    return (
        <div className="message-queue">
            <header>
                <div className="filters">
                    <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
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
            <div className="pagination-bar" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                <Pagination 
                    currentPage={page} 
                    totalPages={totalPages} 
                    onPageChange={setPage} 
                />
            </div>
        </div>
    );
};

export default MessageQueue;
