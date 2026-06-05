import './shared.css';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import { useToast } from '../../context/ToastContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';

import '../../styles/components/form-layout.css';
export default function ManageLinkTypes() {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
// fallow-ignore-next-line code-duplication
    const [types, setTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', reverse_name: '' });
    const [search, setSearch] = useState('');

    const fetchTypes = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(ENDPOINTS.CUSTOMERS_LINK_TYPES);
            if (res.ok) {
                const data = await res.json();
                setTypes(data.results || data || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchTypes();
    }, [fetchTypes]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (saving) return;
        const trimmed = { name: formData.name.trim(), reverse_name: formData.reverse_name.trim() };
        if (!trimmed.name) { showToast('Relationship name is required', 'error'); return; }
        setSaving(true);
        try {
            const url = isEditing
                ? `${ENDPOINTS.CUSTOMERS_LINK_TYPES}${currentItem.id}/`
                : ENDPOINTS.CUSTOMERS_LINK_TYPES;

            const method = isEditing ? 'PUT' : 'POST';

            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trimmed)
            });

            if (res.ok) {
                showToast(isEditing ? 'Relationship type updated' : 'Relationship type created', 'success');
                setIsEditing(false);
                setCurrentItem(null);
                setFormData({ name: '', reverse_name: '' });
                fetchTypes();
            } else {
                const errData = await res.json().catch(() => null);
                showToast(errData?.name?.[0] || errData?.detail || 'Failed to save type', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Network error saving type', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (type) => {
        setIsEditing(true);
        setCurrentItem(type);
        setFormData({
            name: type.name,
            reverse_name: type.reverse_name || ''
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure? This will affect all customer links using this type.')) return;
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.CUSTOMERS_LINK_TYPES}${id}/`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
                showToast('Relationship type deleted', 'success');
                fetchTypes();
            } else {
                showToast('Failed to delete type', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error deleting type', 'error');
        }
    };

    const filtered = types.filter(t =>
        t.name?.toLowerCase().includes(search.toLowerCase()) ||
        t.reverse_name?.toLowerCase().includes(search.toLowerCase())
    );

// fallow-ignore-next-line code-duplication
    if (loading && !isEditing && types.length === 0) {
        return <LoadingSpinner />;
    }

    return (
        <div>
            <div className="manager-header">
                <div>
                    <h2>Relationship Types</h2>
                    <div className="manager-subtitle">Define how customers are linked (e.g. Parent ↔ Child)</div>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setIsEditing(true);
                        setCurrentItem(null);
                        setFormData({ name: '', reverse_name: '' });
                    }}
                >
                    + Add Type
                </button>
            </div>

            {isEditing && (
                <div className="card manager-form-card">
// fallow-ignore-next-line code-duplication
                    <h3>{currentItem ? 'Edit Type' : 'New Type'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="manager-form-group">
                            <label>Relationship Name (e.g. Parent)</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="manager-form-group">
                            <label>Reverse Name (e.g. Child)</label>
                            <input
                                type="text"
                                value={formData.reverse_name}
                                onChange={e => setFormData({ ...formData, reverse_name: e.target.value })}
                            />
// fallow-ignore-next-line code-duplication
                            <small>What the other person calls this person</small>
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

            {types.length > 3 && (
                <div className="manager-search">
                    <input
                        type="text"
                        placeholder="Filter relationship types..."
// fallow-ignore-next-line code-duplication
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            )}

            <table className="manager-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Reverse Name</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(type => (
                        <tr key={type.id}>
                            <td>{type.name}</td>
                            <td>{type.reverse_name || '-'}</td>
                            <td className="actions-cell">
                                <button
                                    className="btn btn-ghost"
                                    onClick={() => handleEdit(type)}
                                >
                                    Edit
                                </button>
                                <button
                                    className="btn btn-ghost text-danger"
                                    onClick={() => handleDelete(type.id)}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                    {filtered.length === 0 && (
                        <tr>
                            <td colSpan="3" className="manager-empty">
                                {search ? 'No types match your filter.' : 'No relationship types found.'}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
