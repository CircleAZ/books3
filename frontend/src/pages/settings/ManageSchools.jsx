import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';

export default function ManageSchools() {
    const { fetchWithAuth } = useAuth();
    const [schools, setSchools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', address: '' });

    const fetchSchools = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(ENDPOINTS.SCHOOLS);
            if (res.ok) {
                const data = await res.json();
                setSchools(data.results || data || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchSchools();
    }, [fetchSchools]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const url = currentItem
                ? `${ENDPOINTS.SCHOOLS}${currentItem.id}/`
                : ENDPOINTS.SCHOOLS;

            const method = currentItem ? 'PUT' : 'POST';

            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setIsEditing(false);
                setCurrentItem(null);
                setFormData({ name: '', address: '' });
                fetchSchools();
            } else {
                console.error('Failed to save school');
                const errData = await res.json();
                alert('Failed to save: ' + JSON.stringify(errData));
            }
        } catch (err) {
            console.error(err);
            alert('Error saving school');
        }
    };

    const handleEdit = (school) => {
        setIsEditing(true);
        setCurrentItem(school);
        setFormData({ name: school.name, address: school.address });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure? This may affect linked customers.')) return;
        try {
            await fetchWithAuth(`${ENDPOINTS.SCHOOLS}${id}/`, { method: 'DELETE' });
            fetchSchools();
        } catch (err) {
            console.error(err);
        }
    };

    if (loading && !isEditing && schools.length === 0) {
        return <div className="p-4 text-center">Loading...</div>;
    }

    return (
        <div>
            <div className="manager-header">
                <h2>Manage Schools</h2>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setIsEditing(true);
                        setCurrentItem(null);
                        setFormData({ name: '', address: '' });
                    }}
                >
                    + Add School
                </button>
            </div>

            {isEditing && (
                <div className="card mb-4" style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>{currentItem ? 'Edit School' : 'New School'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>School Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Address</label>
                            <textarea
                                value={formData.address}
                                onChange={e => setFormData({ ...formData, address: e.target.value })}
                                rows={2}
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
                        <th>Name</th>
                        <th>Address</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {schools.map(school => (
                        <tr key={school.id}>
                            <td>{school.name}</td>
                            <td>{school.address}</td>
                            <td className="actions-cell">
                                <button
                                    className="btn btn-ghost"
                                    onClick={() => handleEdit(school)}
                                >
                                    Edit
                                </button>
                                <button
                                    className="btn btn-ghost text-danger"
                                    onClick={() => handleDelete(school.id)}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                    {schools.length === 0 && (
                        <tr>
                            <td colSpan="3" className="text-center p-4">No schools found.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
