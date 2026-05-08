import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './ActivityLog.css';

import '../../styles/components/modal-system.css';
export default function ActivityLog() {
    const { fetchWithAuth } = useAuth();
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [selectedLog, setSelectedLog] = useState(null);

    const fetchActivities = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page,
                search: searchTerm,
                action_type: filterType,
                date: dateFilter
            });

            // Remove empty params
            const cleanParams = new URLSearchParams();
            for (const [key, value] of queryParams.entries()) {
                if (value) cleanParams.append(key, value);
            }

            const response = await fetchWithAuth(`${ENDPOINTS.REPORTS_ACTIVITY}?${cleanParams.toString()}`);
            if (response.ok) {
                const data = await response.json();
                setActivities(data.results || []);
                setTotalCount(data.count || 0);
                setTotalPages(Math.ceil((data.count || 0) / 20)); // Assuming page size 20
            }
        } catch (error) {
            console.error('Error fetching activity log:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, page, searchTerm, filterType, dateFilter]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchActivities();
        }, 500);
        return () => clearTimeout(timer);
    }, [fetchActivities]);

    const handleRefresh = () => {
        fetchActivities();
    };

    const getActionIcon = (type) => {
        switch (type) {
            case 'login': return '🔑';
            case 'logout': return '👋';
            case 'create': return '✨';
            case 'update': return '✏️';
            case 'delete': return '🗑️';
            case 'order': return '🛍️';
            case 'return': return '↩️';
            default: return '📝';
        }
    };

    return (
        <div className="activity-log-page animate-fade-in">
            <header className="activity-header">
                <div className="header-titles">
                    <p>Track all actions and events across the system.</p>
                </div>
                <button className="btn btn-ghost" onClick={handleRefresh}>
                    <span>🔄</span> Refresh
                </button>
            </header>

            <div className="filters-bar glass">
                <div className="search-box">
                    <span>🔍</span>
                    <input
                        type="text"
                        placeholder="Search users or descriptions..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                    />
                </div>

                <div className="filter-group">
                    <select
                        value={filterType}
                        onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
                        className="filter-select"
                    >
                        <option value="">All Event Types</option>
                        <option value="login">Login</option>
                        <option value="logout">Logout</option>
                        <option value="create">Create</option>
                        <option value="update">Update</option>
                        <option value="delete">Delete</option>
                        <option value="order">Order</option>
                        <option value="return">Return</option>
                    </select>

                    <input
                        type="date"
                        className="date-picker"
                        value={dateFilter}
                        onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
                    />
                </div>
            </div>

            <div className="table-container card">
                {loading ? (
                    <div className="p-5 text-center">Loading activities...</div>
                ) : (
                    <table className="activity-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Action</th>
                                <th>Description</th>
                                <th>Entity</th>
                                <th>Timestamp</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activities.length > 0 ? (
                                activities.map(activity => (
                                    <tr key={activity.id} className="activity-row" onClick={() => setSelectedLog(activity)}>
                                        <td className="user-cell">
                                            <div className="user-avatar">
                                                {activity.user_name ? activity.user_name.charAt(0).toUpperCase() : '?'}
                                            </div>
                                            <span>{activity.user_name || 'System'}</span>
                                        </td>
                                        <td>
                                            <span className="action-text">
                                                {getActionIcon(activity.action_type)} {activity.action_type}
                                            </span>
                                        </td>
                                        <td className="desc-cell">{activity.description}</td>
                                        <td>
                                            {activity.entity_type && (
                                                <span className="type-badge">
                                                    {activity.entity_type} #{activity.entity_id}
                                                </span>
                                            )}
                                        </td>
                                        <td className="time-cell">{new Date(activity.created_at).toLocaleString()}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" className="empty-state">No activities found matching your criteria.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="pagination">
                <p className="pagination-info">
                    Showing {activities.length} of {totalCount} entries
                </p>
                <div className="pagination-controls">
                    <button
                        className="btn btn-ghost"
                        disabled={page <= 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                        Previous
                    </button>
                    <span className="mx-2">Page {page} of {totalPages}</span>
                    <button
                        className="btn btn-ghost"
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    >
                        Next
                    </button>
                </div>
            </div>

            {selectedLog && (
                <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ margin: '16px', padding: '24px', width: '100%', maxWidth: '500px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Activity Details</h2>
                            <button className="btn-ghost" style={{ padding: '0px 8px', fontSize: '1.5rem', cursor: 'pointer' }} onClick={() => setSelectedLog(null)}>×</button>
                        </div>
                        <div className="log-detail-grid">
                            <div className="log-detail-item">
                                <span className="log-detail-label">Description</span>
                                <span className="log-detail-value">{selectedLog.description}</span>
                            </div>
                            <div className="log-detail-item">
                                <span className="log-detail-label">Action Performed</span>
                                <span className="log-detail-value" style={{ textTransform: 'capitalize' }}>
                                    {getActionIcon(selectedLog.action_type)} {selectedLog.action_type}
                                </span>
                            </div>
                            <div className="log-detail-item">
                                <span className="log-detail-label">Initiated By</span>
                                <span className="log-detail-value">{selectedLog.user_name || 'System'}</span>
                            </div>
                            <div className="log-detail-item">
                                <span className="log-detail-label">Timestamp</span>
                                <span className="log-detail-value">{new Date(selectedLog.created_at).toLocaleString()}</span>
                            </div>
                            <div className="log-detail-item">
                                <span className="log-detail-label">Related Entity</span>
                                <span className="log-detail-value">
                                    {selectedLog.entity_type ? `${selectedLog.entity_type} #${selectedLog.entity_id}` : 'None'}
                                </span>
                            </div>
                            {selectedLog.ip_address && (
                                <div className="log-detail-item">
                                    <span className="log-detail-label">IP Address</span>
                                    <span className="log-detail-value">{selectedLog.ip_address}</span>
                                </div>
                            )}
                            {selectedLog.details && selectedLog.details.trim() !== '' && (
                                <div className="log-detail-item" style={{ gridColumn: '1 / -1' }}>
                                    <span className="log-detail-label" style={{ color: 'var(--color-primary)' }}>Specific Changes</span>
                                    <span className="log-detail-value" style={{ borderLeft: '4px solid var(--color-primary)', backgroundColor: 'var(--color-bg-secondary)' }}>
                                        {selectedLog.details}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div style={{ marginTop: '24px', textAlign: 'right' }}>
                            <button className="btn btn-primary" onClick={() => setSelectedLog(null)}>Close Details</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
