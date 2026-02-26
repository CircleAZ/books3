import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';

export default function ManageSubdivisions() {
    const { fetchWithAuth } = useAuth();
    const [subdivisions, setSubdivisions] = useState([]);
    const [divisions, setDivisions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', division: '' });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [subdivisionsRes, divisionsRes] = await Promise.all([
                fetchWithAuth(ENDPOINTS.CUSTOMERS_SUBDIVISIONS),
                fetchWithAuth(ENDPOINTS.CUSTOMERS_DIVISIONS)
            ]);

            if (subdivisionsRes.ok) {
                const data = await subdivisionsRes.json();
                setSubdivisions(data.results || data || []);
            }
            if (divisionsRes.ok) {
                const data = await divisionsRes.json();
                setDivisions(data.results || data || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const url = isEditing
                ? `${ENDPOINTS.CUSTOMERS_SUBDIVISIONS}${currentItem.id}/`
                : ENDPOINTS.CUSTOMERS_SUBDIVISIONS;

            const method = isEditing ? 'PUT' : 'POST';

            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setIsEditing(false);
                setCurrentItem(null);
                setFormData({ name: '', division: '' });
                fetchData();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleEdit = (sub) => {
        setIsEditing(true);
        setCurrentItem(sub);
        setFormData({
            name: sub.name,
            division: sub.division
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure?')) return;
        try {
            await fetchWithAuth(`${ENDPOINTS.CUSTOMERS_SUBDIVISIONS}${id}/`, { method: 'DELETE' });
            fetchData();
        } catch (err) {
            console.error(err);
        }
    };

    if (loading && !isEditing && subdivisions.length === 0) {
        return <div className="p-4 text-center">Loading...</div>;
    }

    return (
        <div>
            <div className="manager-header">
                <h2>Manage Subdivisions</h2>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setIsEditing(true);
                        setCurrentItem(null);
                        setFormData({ name: '', division: '' });
                    }}
                >
                    + Add Subdivision
                </button>
            </div>

            {isEditing && (
                <div className="card mb-4" style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>{currentItem ? 'Edit Subdivision' : 'New Subdivision'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Division</label>
                            <select
                                value={formData.division}
                                onChange={e => setFormData({ ...formData, division: e.target.value })}
                                required
                                style={{ width: '100%', padding: '0.5rem' }}
                            >
                                <option value="">Select Division</option>
                                {divisions.map(d => (
                                    <option key={d.id} value={d.id}>{d.name} {d.class_name ? `(${d.class_name})` : ''}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Subdivision Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
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

            <table className="manager-table">
                <thead>
                    <tr>
                        <th>Subdivision</th>
                        <th>Division</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {subdivisions.map(sub => (
                        <tr key={sub.id}>
                            <td>{sub.name}</td>
                            <td>{divisions.find(d => d.id === sub.division)?.name || '-'}</td>
                            <td className="actions-cell">
                                <button
                                    className="btn btn-ghost"
                                    onClick={() => handleEdit(sub)}
                                >
                                    Edit
                                </button>
                                <button
                                    className="btn btn-ghost text-danger"
                                    onClick={() => handleDelete(sub.id)}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                    {subdivisions.length === 0 && (
                        <tr>
                            <td colSpan="3" className="text-center p-4">No subdivisions found.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
