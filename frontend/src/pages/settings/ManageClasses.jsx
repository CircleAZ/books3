import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import { useToast } from '../../context/ToastContext';

export default function ManageClasses() {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);
    const [formData, setFormData] = useState({ name: '' });
    const [search, setSearch] = useState('');

    const fetchTemplates = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(ENDPOINTS.CLASS_TEMPLATES);
            if (res.ok) {
                const data = await res.json();
                setTemplates(data.results || data || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchTemplates();
    }, [fetchTemplates]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (saving) return;
        const trimmed = { name: formData.name.trim() };
        if (!trimmed.name) { showToast('Class name is required', 'error'); return; }
        setSaving(true);
        try {
            const url = currentItem
                ? `${ENDPOINTS.CLASS_TEMPLATES}${currentItem.id}/`
                : ENDPOINTS.CLASS_TEMPLATES;
            const method = currentItem ? 'PUT' : 'POST';
            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trimmed)
            });
            if (res.ok) {
                showToast(currentItem ? 'Class updated' : 'Class created', 'success');
                setIsEditing(false);
                setCurrentItem(null);
                setFormData({ name: '' });
                fetchTemplates();
            } else {
                const errData = await res.json().catch(() => null);
                showToast(errData?.name?.[0] || errData?.detail || 'Failed to save', 'error');
            }
        } catch (err) {
            showToast('Network error', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (item) => {
        setIsEditing(true);
        setCurrentItem(item);
        setFormData({ name: item.name });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this class template? Schools using this name will not be affected.')) return;
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.CLASS_TEMPLATES}${id}/`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
                showToast('Class template deleted', 'success');
                fetchTemplates();
            } else {
                showToast('Failed to delete', 'error');
            }
        } catch (err) {
            showToast('Error deleting', 'error');
        }
    };

    const filtered = templates
        .filter(t => t.name?.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    if (loading && !isEditing && templates.length === 0) {
        return <div className="manager-empty">Loading...</div>;
    }

    return (
        <div>
            <div className="manager-header">
                <div>
                    <h2>Class Catalog</h2>
                    <div className="manager-subtitle">Reusable class names — add once, assign to any school</div>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setIsEditing(true);
                        setCurrentItem(null);
                        setFormData({ name: '' });
                    }}
                >
                    + Add Class
                </button>
            </div>

            {isEditing && (
                <div className="card manager-form-card">
                    <h3>{currentItem ? 'Edit Class' : 'New Class'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="manager-form-group">
                            <label>Class Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. Class 1, Class 2, ..."
                                required
                            />
                        </div>
                        <div className="flex gap-sm">
                            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                            <button type="button" className="btn btn-ghost" onClick={() => setIsEditing(false)}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            {templates.length > 3 && (
                <div className="manager-search">
                    <input
                        type="text"
                        placeholder="Filter classes..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            )}

            <table className="manager-table">
                <thead>
                    <tr>
                        <th>Class Name</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(item => (
                        <tr key={item.id}>
                            <td>{item.name}</td>
                            <td className="actions-cell">
                                <button className="btn btn-ghost" onClick={() => handleEdit(item)}>Edit</button>
                                <button className="btn btn-ghost text-danger" onClick={() => handleDelete(item.id)}>Delete</button>
                            </td>
                        </tr>
                    ))}
                    {filtered.length === 0 && (
                        <tr>
                            <td colSpan="2" className="manager-empty">
                                {search ? 'No classes match your filter.' : 'No class templates yet. Add your first class name above.'}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
