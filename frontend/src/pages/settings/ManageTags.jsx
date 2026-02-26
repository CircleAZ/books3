import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';

export default function ManageTags() {
    const { fetchWithAuth } = useAuth();
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isMerging, setIsMerging] = useState(false);
    const [mergeSource, setMergeSource] = useState(null);
    const [mergeTarget, setMergeTarget] = useState('');
    const [currentItem, setCurrentItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', color: '#6366f1' });

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
        try {
            const url = isEditing
                ? `${ENDPOINTS.CUSTOMERS_LOCATION_TAGS}${currentItem.id}/`
                : ENDPOINTS.CUSTOMERS_LOCATION_TAGS;

            const method = isEditing ? 'PUT' : 'POST';

            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setIsEditing(false);
                setCurrentItem(null);
                setFormData({ name: '', color: '#6366f1' });
                fetchTags();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleEdit = (tag) => {
        setIsEditing(true);
        setIsMerging(false);
        setCurrentItem(tag);
        setFormData({
            name: tag.name,
            color: tag.color
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure?')) return;
        try {
            await fetchWithAuth(`${ENDPOINTS.CUSTOMERS_LOCATION_TAGS}${id}/`, { method: 'DELETE' });
            fetchTags();
        } catch (err) {
            console.error(err);
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
                setIsMerging(false);
                setMergeSource(null);
                setMergeTarget('');
                fetchTags();
            }
        } catch (err) {
            console.error(err);
        }
    };

    if (loading && !isEditing && tags.length === 0) {
        return <div className="p-4 text-center">Loading...</div>;
    }

    return (
        <div>
            <div className="manager-header">
                <h2>Location Tags</h2>
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
                <div className="card mb-4" style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>{currentItem ? 'Edit Tag' : 'New Tag'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Tag Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Color</label>
                            <input
                                type="color"
                                value={formData.color}
                                onChange={e => setFormData({ ...formData, color: e.target.value })}
                                style={{ height: '40px', padding: '0 5px' }}
                            />
                        </div>
                        <div className="flex gap-sm">
                            <button type="submit" className="btn btn-primary">Save</button>
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
                <div className="card mb-4" style={{ marginBottom: '1.5rem', borderLeft: '4px solid var(--warning)' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Merge Tag: {mergeSource.name}</h3>
                    <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                        All addresses using "{mergeSource.name}" will be reassigned to the target tag.
                        The source tag will be deleted.
                    </p>
                    <form onSubmit={handleMergeSubmit}>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Merge Into</label>
                            <select
                                value={mergeTarget}
                                onChange={e => setMergeTarget(e.target.value)}
                                required
                                style={{ width: '100%', padding: '0.5rem' }}
                            >
                                <option value="">Select target tag...</option>
                                {tags.filter(t => t.id !== mergeSource.id).map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-sm">
                            <button type="submit" className="btn btn-primary">Merge</button>
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

            <table className="manager-table">
                <thead>
                    <tr>
                        <th>Color</th>
                        <th>Name</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {tags.map(tag => (
                        <tr key={tag.id}>
                            <td style={{ width: '60px' }}>
                                <div style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    backgroundColor: tag.color
                                }}></div>
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
                    {tags.length === 0 && (
                        <tr>
                            <td colSpan="3" className="text-center p-4">No tags found.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
