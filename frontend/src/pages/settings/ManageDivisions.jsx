import './shared.css';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import { useToast } from '../../context/ToastContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';

import '../../styles/components/form-layout.css';
export default function ManageDivisions() {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [templates, setTemplates] = useState([]);
// fallow-ignore-next-line code-duplication
    const [classTemplates, setClassTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', applicable_classes: [] });
    const [search, setSearch] = useState('');

    const fetchTemplates = useCallback(async () => {
        setLoading(true);
        try {
            const [divRes, classRes] = await Promise.all([
                fetchWithAuth(ENDPOINTS.DIVISION_TEMPLATES),
                fetchWithAuth(ENDPOINTS.CLASS_TEMPLATES)
            ]);
            if (divRes.ok) {
                const data = await divRes.json();
                setTemplates(data.results || data || []);
            }
            if (classRes.ok) {
                const data = await classRes.json();
// fallow-ignore-next-line code-duplication
                setClassTemplates(data.results || data || []);
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
            applicable_classes: formData.applicable_classes
        };
        if (!trimmed.name) { showToast('Division name is required', 'error'); return; }
        setSaving(true);
        try {
            const url = currentItem
                ? `${ENDPOINTS.DIVISION_TEMPLATES}${currentItem.id}/`
                : ENDPOINTS.DIVISION_TEMPLATES;
            const method = currentItem ? 'PUT' : 'POST';
            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trimmed)
            });
// fallow-ignore-next-line code-duplication
            if (res.ok) {
                showToast(currentItem ? 'Division updated' : 'Division created', 'success');
                setIsEditing(false);
                setCurrentItem(null);
// fallow-ignore-next-line code-duplication
                setFormData({ name: '', applicable_classes: [] });
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
            applicable_classes: item.applicable_classes || []
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this division template? Schools using this name will not be affected.')) return;
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.DIVISION_TEMPLATES}${id}/`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
                showToast('Division template deleted', 'success');
                fetchTemplates();
            } else {
                showToast('Failed to delete', 'error');
            }
        } catch (err) {
            showToast('Error deleting', 'error');
        }
    };

    const toggleClassSelection = (classId) => {
        setFormData(prev => {
            const current = prev.applicable_classes || [];
            const updated = current.includes(classId)
                ? current.filter(id => id !== classId)
                : [...current, classId];
            return { ...prev, applicable_classes: updated };
        });
    };

// fallow-ignore-next-line code-duplication
    const sortedClasses = [...classTemplates].sort((a, b) =>
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
                    <h2>Division Catalog</h2>
                    <div className="manager-subtitle">Reusable division names — e.g. Math Standard, Science Stream</div>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setIsEditing(true);
                        setCurrentItem(null);
                        setFormData({ name: '', applicable_classes: [] });
                    }}
                >
                    + Add Division
                </button>
            </div>

            {isEditing && (
                <div className="card manager-form-card">
// fallow-ignore-next-line code-duplication
                    <h3>{currentItem ? 'Edit Division' : 'New Division'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="manager-form-group">
                            <label>Division Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. Arts, Commerce, Science"
                                required
                            />
                        </div>
                        <div className="manager-form-group">
                            <label>Applicable to Classes</label>
                            <small style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                Leave empty to show this division under ALL classes
                            </small>
                            <div className="chip-picker">
                                {sortedClasses.map(cls => {
                                    const isSelected = formData.applicable_classes.includes(cls.id);
                                    return (
                                        <button
                                            key={cls.id}
                                            type="button"
                                            className={`chip ${isSelected ? 'chip--active' : ''}`}
                                            onClick={() => toggleClassSelection(cls.id)}
                                        >
                                            {isSelected && '✓ '}{cls.name}
                                        </button>
                                    );
                                })}
// fallow-ignore-next-line code-duplication
                                {sortedClasses.length === 0 && (
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                        No class templates yet. Add classes first.
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
                        placeholder="Filter divisions..."
/* fallow-ignore-next-line code-duplication */
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            )}

            <table className="manager-table">
                <thead>
                    <tr>
{/* fallow-ignore-next-line code-duplication */}
                        <th>Division Name</th>
                        <th>Applicable Classes</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(item => (
                        <tr key={item.id}>
                            <td>{item.name}</td>
                            <td>
                                {item.applicable_class_names?.length > 0 ? (
                                    <span style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
// fallow-ignore-next-line code-duplication
                                        {item.applicable_class_names
                                            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                                            .map(n => <span key={n} className="manager-badge">{n}</span>)}
                                    </span>
                                ) : (
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>All classes</span>
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
                                {search ? 'No divisions match your filter.' : 'No division templates yet. Add your first division name above.'}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
