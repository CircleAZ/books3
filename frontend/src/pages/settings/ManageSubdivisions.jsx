import './shared.css';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import { useToast } from '../../context/ToastContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';

import '../../styles/components/form-layout.css';
export default function ManageSubdivisions() {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [templates, setTemplates] = useState([]);
// fallow-ignore-next-line code-duplication
    const [divisionTemplates, setDivisionTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', applicable_divisions: [] });
    const [search, setSearch] = useState('');

    const fetchTemplates = useCallback(async () => {
        setLoading(true);
        try {
            const [subRes, divRes] = await Promise.all([
                fetchWithAuth(ENDPOINTS.SUBDIVISION_TEMPLATES),
                fetchWithAuth(ENDPOINTS.DIVISION_TEMPLATES)
            ]);
            if (subRes.ok) {
                const data = await subRes.json();
                setTemplates(data.results || data || []);
            }
            if (divRes.ok) {
                const data = await divRes.json();
// fallow-ignore-next-line code-duplication
                setDivisionTemplates(data.results || data || []);
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
        const trimmed = {
            name: formData.name.trim(),
            applicable_divisions: formData.applicable_divisions
        };
        if (!trimmed.name) { showToast('Subdivision name is required', 'error'); return; }
        setSaving(true);
        try {
            const url = currentItem
                ? `${ENDPOINTS.SUBDIVISION_TEMPLATES}${currentItem.id}/`
                : ENDPOINTS.SUBDIVISION_TEMPLATES;
            const method = currentItem ? 'PUT' : 'POST';
            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trimmed)
            });
// fallow-ignore-next-line code-duplication
            if (res.ok) {
                showToast(currentItem ? 'Subdivision updated' : 'Subdivision created', 'success');
                setIsEditing(false);
                setCurrentItem(null);
// fallow-ignore-next-line code-duplication
                setFormData({ name: '', applicable_divisions: [] });
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
        setFormData({
            name: item.name,
            applicable_divisions: item.applicable_divisions || []
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this subdivision template? Schools using this name will not be affected.')) return;
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.SUBDIVISION_TEMPLATES}${id}/`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
                showToast('Subdivision template deleted', 'success');
                fetchTemplates();
            } else {
                showToast('Failed to delete', 'error');
            }
        } catch (err) {
            showToast('Error deleting', 'error');
        }
    };

    const toggleDivisionSelection = (divId) => {
        setFormData(prev => {
            const current = prev.applicable_divisions || [];
            const updated = current.includes(divId)
                ? current.filter(id => id !== divId)
                : [...current, divId];
            return { ...prev, applicable_divisions: updated };
        });
    };

// fallow-ignore-next-line code-duplication
    const sortedDivisions = [...divisionTemplates].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    const filtered = templates
        .filter(t => t.name?.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

// fallow-ignore-next-line code-duplication
    if (loading && !isEditing && templates.length === 0) {
        return <LoadingSpinner />;
    }

    return (
        <div>
            <div className="manager-header">
                <div>
                    <h2>Subdivision Catalog</h2>
                    <div className="manager-subtitle">Reusable subdivision names — e.g. PCM, PCB, Computer Applications</div>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setIsEditing(true);
                        setCurrentItem(null);
                        setFormData({ name: '', applicable_divisions: [] });
                    }}
                >
                    + Add Subdivision
                </button>
            </div>

            {isEditing && (
                <div className="card manager-form-card">
// fallow-ignore-next-line code-duplication
                    <h3>{currentItem ? 'Edit Subdivision' : 'New Subdivision'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="manager-form-group">
                            <label>Subdivision Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. PCM, PCB, Computer Applications"
                                required
                            />
                        </div>
                        <div className="manager-form-group">
                            <label>Applicable to Divisions</label>
                            <small style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                Leave empty to show this subdivision under ALL divisions
                            </small>
                            <div className="chip-picker">
                                {sortedDivisions.map(div => {
                                    const isSelected = formData.applicable_divisions.includes(div.id);
                                    return (
                                        <button
                                            key={div.id}
                                            type="button"
                                            className={`chip ${isSelected ? 'chip--active' : ''}`}
                                            onClick={() => toggleDivisionSelection(div.id)}
                                        >
                                            {isSelected && '✓ '}{div.name}
                                        </button>
                                    );
                                })}
// fallow-ignore-next-line code-duplication
                                {sortedDivisions.length === 0 && (
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                        No division templates yet. Add divisions first.
                                    </span>
                                )}
// fallow-ignore-next-line code-duplication
                            </div>
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
                        placeholder="Filter subdivisions..."
// fallow-ignore-next-line code-duplication
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            )}

            <table className="manager-table">
                <thead>
                    <tr>
// fallow-ignore-next-line code-duplication
                        <th>Subdivision Name</th>
                        <th>Applicable Divisions</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(item => (
                        <tr key={item.id}>
                            <td>{item.name}</td>
                            <td>
                                {item.applicable_division_names?.length > 0 ? (
                                    <span style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
// fallow-ignore-next-line code-duplication
                                        {item.applicable_division_names
                                            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                                            .map(n => <span key={n} className="manager-badge">{n}</span>)}
                                    </span>
                                ) : (
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>All divisions</span>
                                )}
// fallow-ignore-next-line code-duplication
                            </td>
                            <td className="actions-cell">
                                <button className="btn btn-ghost" onClick={() => handleEdit(item)}>Edit</button>
                                <button className="btn btn-ghost text-danger" onClick={() => handleDelete(item.id)}>Delete</button>
                            </td>
                        </tr>
                    ))}
                    {filtered.length === 0 && (
                        <tr>
                            <td colSpan="3" className="manager-empty">
                                {search ? 'No subdivisions match your filter.' : 'No subdivision templates yet. Add your first subdivision name above.'}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
