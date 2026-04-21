import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import { useToast } from '../../context/ToastContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';

export default function ManageGroups() {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '', discount_percent: 0 });
    const [search, setSearch] = useState('');

    const fetchGroups = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(ENDPOINTS.CUSTOMERS_GROUPS);
            if (res.ok) {
                const data = await res.json();
                setGroups(data.results || data || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchGroups();
    }, [fetchGroups]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (saving) return;
        const trimmed = { ...formData, name: formData.name.trim(), description: formData.description.trim() };
        if (!trimmed.name) { showToast('Group name is required', 'error'); return; }
        setSaving(true);
        try {
            const isUpdating = !!currentItem;
            const url = isUpdating
                ? `${ENDPOINTS.CUSTOMERS_GROUPS}${currentItem.id}/`
                : ENDPOINTS.CUSTOMERS_GROUPS;

            const method = isUpdating ? 'PUT' : 'POST';

            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trimmed)
            });

            if (res.ok) {
                showToast(isUpdating ? 'Group updated' : 'Group created', 'success');
                setIsEditing(false);
                setCurrentItem(null);
                setFormData({ name: '', description: '', discount_percent: 0 });
                fetchGroups();
            } else {
                const errData = await res.json().catch(() => null);
                showToast(errData?.name?.[0] || errData?.detail || 'Failed to save group', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Network error saving group', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (group) => {
        setIsEditing(true);
        setCurrentItem(group);
        setFormData({
            name: group.name,
            description: group.description || '',
            discount_percent: group.discount_percent || 0
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure?')) return;
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.CUSTOMERS_GROUPS}${id}/`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
                showToast('Group deleted', 'success');
                fetchGroups();
            } else {
                showToast('Failed to delete group', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error deleting group', 'error');
        }
    };

    const filtered = groups.filter(g =>
        g.name?.toLowerCase().includes(search.toLowerCase()) ||
        g.description?.toLowerCase().includes(search.toLowerCase())
    );

    if (loading && !isEditing && groups.length === 0) {
        return <LoadingSpinner />;
    }

    return (
        <div>
            <div className="manager-header">
                <div>
                    <h2>Customer Groups</h2>
                    <div className="manager-subtitle">Group customers for discounts and reporting</div>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setIsEditing(true);
                        setCurrentItem(null);
                        setFormData({ name: '', description: '', discount_percent: 0 });
                    }}
                >
                    + Add Group
                </button>
            </div>

            {isEditing && (
                <div className="card manager-form-card">
                    <h3>{currentItem ? 'Edit Group' : 'New Group'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="manager-form-group">
                            <label>Group Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="manager-form-group">
                            <label>Discount (%)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={formData.discount_percent}
                                onChange={e => setFormData({ ...formData, discount_percent: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="manager-form-group">
                            <label>Description</label>
                            <textarea
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                rows={2}
                            />
                        </div>
                        <div className="flex gap-sm">
                            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setIsEditing(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {groups.length > 3 && (
                <div className="manager-search">
                    <input
                        type="text"
                        placeholder="Filter groups..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            )}

            <table className="manager-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Discount</th>
                        <th>Description</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(group => (
                        <tr key={group.id}>
                            <td>{group.name}</td>
                            <td>{group.discount_percent}%</td>
                            <td>{group.description}</td>
                            <td className="actions-cell">
                                <button
                                    className="btn btn-ghost"
                                    onClick={() => handleEdit(group)}
                                >
                                    Edit
                                </button>
                                <button
                                    className="btn btn-ghost text-danger"
                                    onClick={() => handleDelete(group.id)}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                    {filtered.length === 0 && (
                        <tr>
                            <td colSpan="4" className="manager-empty">
                                {search ? 'No groups match your filter.' : 'No groups found.'}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
