import './shared.css';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import { useToast } from '../../context/ToastContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';

export default function ManageTags() {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isMerging, setIsMerging] = useState(false);
    const [mergeSource, setMergeSource] = useState(null);
    const [mergeTarget, setMergeTarget] = useState('');
    const [currentItem, setCurrentItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', color: '#6366f1' });
    const [search, setSearch] = useState('');

    const fetchTags = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(ENDPOINTS.CUSTOMERS_LOCATION_TAGS);
            if (res.ok) {
                const data = await res.json();
                setTags(data.results || data || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchTags();
    }, [fetchTags]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (saving) return;
        const trimmed = { ...formData, name: formData.name.trim() };
        if (!trimmed.name) { showToast('Tag name is required', 'error'); return; }
        setSaving(true);
        try {
            const url = isEditing
                ? `${ENDPOINTS.CUSTOMERS_LOCATION_TAGS}${currentItem.id}/`
                : ENDPOINTS.CUSTOMERS_LOCATION_TAGS;

            const method = isEditing ? 'PUT' : 'POST';

            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trimmed)
            });

            if (res.ok) {
                showToast(isEditing ? 'Tag updated' : 'Tag created', 'success');
                setIsEditing(false);
                setCurrentItem(null);
                setFormData({ name: '', color: '#6366f1' });
                fetchTags();
            } else {
                const errData = await res.json().catch(() => null);
                showToast(errData?.name?.[0] || errData?.detail || 'Failed to save tag', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Network error saving tag', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (tag) => {
        setIsEditing(true);
        setIsMerging(false);
        setCurrentItem(tag);
        setFormData({
            name: tag.name,
            color: tag.color || '#6366f1'
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure? Addresses using this tag will lose their tag.')) return;
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.CUSTOMERS_LOCATION_TAGS}${id}/`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
                showToast('Tag deleted', 'success');
                fetchTags();
            } else {
                showToast('Failed to delete tag', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error deleting tag', 'error');
        }
    };

    const handleMergeStart = (tag) => {
        setIsMerging(true);
        setIsEditing(false);
        setMergeSource(tag);
        setMergeTarget('');
    };

    const handleMergeSubmit = async (e) => {
        e.preventDefault();
        if (!mergeTarget || !mergeSource) return;

        if (!window.confirm(`Merge "${mergeSource.name}" into the selected tag? This will delete "${mergeSource.name}" and reassign all its addresses.`)) return;

        setSaving(true);
        try {
            const res = await fetchWithAuth(
                `${ENDPOINTS.CUSTOMERS_LOCATION_TAGS}${mergeSource.id}/merge/`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ target_tag_id: mergeTarget })
                }
            );
            if (res.ok) {
                showToast(`Tag "${mergeSource.name}" merged successfully`, 'success');
                setIsMerging(false);
                setMergeSource(null);
                setMergeTarget('');
                fetchTags();
            } else {
                showToast('Failed to merge tags', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error merging tags', 'error');
        } finally {
            setSaving(false);
        }
    };

    const filtered = tags.filter(t =>
        t.name?.toLowerCase().includes(search.toLowerCase())
    );

    if (loading && !isEditing && tags.length === 0) {
        return <LoadingSpinner />;
    }

    return (
        <div>
            <div className="manager-header">
                <div>
                    <h2>Location Tags</h2>
                    <div className="manager-subtitle">Color-coded tags for customer addresses</div>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setIsEditing(true);
                        setIsMerging(false);
                        setCurrentItem(null);
                        setFormData({ name: '', color: '#6366f1' });
                    }}
                >
                    + Add Tag
                </button>
            </div>

            {isEditing && (
                <div className="card manager-form-card">
                    <h3>{currentItem ? 'Edit Tag' : 'New Tag'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="manager-form-group">
                            <label>Tag Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="manager-form-group">
                            <label>Color</label>
                            <input
                                type="color"
                                value={formData.color}
                                onChange={e => setFormData({ ...formData, color: e.target.value })}
                                style={{ height: '40px', padding: '0 5px' }}
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

            {isMerging && mergeSource && (
                <div className="card manager-form-card" style={{ borderLeft: '4px solid var(--warning)' }}>
                    <h3>Merge Tag: {mergeSource.name}</h3>
                    <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                        All addresses using "{mergeSource.name}" will be reassigned to the target tag.
                        The source tag will be deleted.
                    </p>
                    <form onSubmit={handleMergeSubmit}>
                        <div className="manager-form-group">
                            <label>Merge Into</label>
                            <select
                                value={mergeTarget}
                                onChange={e => setMergeTarget(e.target.value)}
                                required
                            >
                                <option value="">Select target tag...</option>
                                {tags.filter(t => t.id !== mergeSource.id).map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-sm">
                            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Merging...' : 'Merge'}</button>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => { setIsMerging(false); setMergeSource(null); }}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {tags.length > 3 && (
                <div className="manager-search">
                    <input
                        type="text"
                        placeholder="Filter tags..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            )}

            <table className="manager-table">
                <thead>
                    <tr>
                        <th>Color</th>
                        <th>Name</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(tag => (
                        <tr key={tag.id}>
                            <td style={{ width: '60px' }}>
                                <div className="tag-color-swatch" style={{ backgroundColor: tag.color }}></div>
                            </td>
                            <td>{tag.name}</td>
                            <td className="actions-cell">
                                <button
                                    className="btn btn-ghost"
                                    onClick={() => handleEdit(tag)}
                                >
                                    Edit
                                </button>
                                <button
                                    className="btn btn-ghost"
                                    onClick={() => handleMergeStart(tag)}
                                    disabled={tags.length < 2}
                                >
                                    Merge
                                </button>
                                <button
                                    className="btn btn-ghost text-danger"
                                    onClick={() => handleDelete(tag.id)}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                    {filtered.length === 0 && (
                        <tr>
                            <td colSpan="3" className="manager-empty">
                                {search ? 'No tags match your filter.' : 'No location tags found.'}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
