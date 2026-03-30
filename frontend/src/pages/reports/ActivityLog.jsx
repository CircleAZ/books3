import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './ActivityLog.css';

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

    const fetchActivities = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page,
                search: searchTerm,
                action_type: filterType,
                start_date: dateFilter
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
                                    <tr key={activity.id}>
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
        </div>
    );
}
