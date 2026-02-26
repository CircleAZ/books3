import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';

export default function ManageDivisions() {
    const { fetchWithAuth } = useAuth();
    const [divisions, setDivisions] = useState([]);
    const [classes, setClasses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', class_obj: '' });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [divisionsRes, classesRes] = await Promise.all([
                fetchWithAuth(ENDPOINTS.CUSTOMERS_DIVISIONS),
                fetchWithAuth(ENDPOINTS.CUSTOMERS_CLASSES)
            ]);

            if (divisionsRes.ok) {
                const data = await divisionsRes.json();
                setDivisions(data.results || data || []);
            }
            if (classesRes.ok) {
                const data = await classesRes.json();
                setClasses(data.results || data || []);
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
                ? `${ENDPOINTS.CUSTOMERS_DIVISIONS}${currentItem.id}/` 
                : ENDPOINTS.CUSTOMERS_DIVISIONS;
            
            const method = isEditing ? 'PUT' : 'POST';
            
            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setIsEditing(false);
                setCurrentItem(null);
                setFormData({ name: '', class_obj: '' });
                fetchData();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleEdit = (div) => {
        setIsEditing(true);
        setCurrentItem(div);
        setFormData({ 
            name: div.name, 
            class_obj: div.class_obj
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure?')) return;
        try {
            await fetchWithAuth(`${ENDPOINTS.CUSTOMERS_DIVISIONS}${id}/`, { method: 'DELETE' });
            fetchData();
        } catch (err) {
            console.error(err);
        }
    };

    if (loading && !isEditing && divisions.length === 0) {
        return <div className="p-4 text-center">Loading...</div>;
    }

    return (
        <div>
            <div className="manager-header">
                <h2>Manage Divisions</h2>
                <button 
                    className="btn btn-primary"
                    onClick={() => {
                        setIsEditing(true);
                        setCurrentItem(null);
                        setFormData({ name: '', class_obj: '' });
                    }}
                >
                    + Add Division
                </button>
            </div>

            {isEditing && (
                <div className="card mb-4" style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>{currentItem ? 'Edit Division' : 'New Division'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Class</label>
                            <select
                                value={formData.class_obj}
                                onChange={e => setFormData({...formData, class_obj: e.target.value})}
                                required
                                style={{ width: '100%', padding: '0.5rem' }}
                            >
                                <option value="">Select Class</option>
                                {classes.map(c => (
                                    <option key={c.id} value={c.id}>{c.name} {c.school_name ? `(${c.school_name})` : ''}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Division Name</label>
                            <input 
                                type="text" 
                                value={formData.name} 
                                onChange={e => setFormData({...formData, name: e.target.value})}
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
                        <th>Division</th>
                        <th>Class</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {divisions.map(div => (
                        <tr key={div.id}>
                            <td>{div.name}</td>
                            <td>{div.class_name || classes.find(c => c.id === div.class_obj)?.name || '-'}</td>
                            <td className="actions-cell">
                                <button 
                                    className="btn btn-ghost"
                                    onClick={() => handleEdit(div)}
                                >
                                    Edit
                                </button>
                                <button 
                                    className="btn btn-ghost text-danger"
                                    onClick={() => handleDelete(div.id)}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                    {divisions.length === 0 && (
                        <tr>
                            <td colSpan="3" className="text-center p-4">No divisions found.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
