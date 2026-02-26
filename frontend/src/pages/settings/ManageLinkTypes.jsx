import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';

export default function ManageLinkTypes() {
    const { fetchWithAuth } = useAuth();
    const [types, setTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', reverse_name: '' });

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
        try {
            const url = isEditing 
                ? `${ENDPOINTS.CUSTOMERS_LINK_TYPES}${currentItem.id}/` 
                : ENDPOINTS.CUSTOMERS_LINK_TYPES;
            
            const method = isEditing ? 'PUT' : 'POST';
            
            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setIsEditing(false);
                setCurrentItem(null);
                setFormData({ name: '', reverse_name: '' });
                fetchTypes();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleEdit = (type) => {
        setIsEditing(true);
        setCurrentItem(type);
        setFormData({ 
            name: type.name, 
            reverse_name: type.reverse_name 
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure?')) return;
        try {
            await fetchWithAuth(`${ENDPOINTS.CUSTOMERS_LINK_TYPES}${id}/`, { method: 'DELETE' });
            fetchTypes();
        } catch (err) {
            console.error(err);
        }
    };

    if (loading && !isEditing && types.length === 0) {
        return <div className="p-4 text-center">Loading...</div>;
    }

    return (
        <div>
            <div className="manager-header">
                <h2>Relationship Types</h2>
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
                <div className="card mb-4" style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>{currentItem ? 'Edit Type' : 'New Type'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Relationship Name (e.g. Parent)</label>
                            <input 
                                type="text" 
                                value={formData.name} 
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                required 
                            />
                        </div>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Reverse Name (e.g. Child)</label>
                            <input 
                                type="text" 
                                value={formData.reverse_name} 
                                onChange={e => setFormData({...formData, reverse_name: e.target.value})}
                            />
                            <small className="text-muted">What the other person calls this person</small>
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
                        <th>Reverse Name</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {types.map(type => (
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
                    {types.length === 0 && (
                        <tr>
                            <td colSpan="3" className="text-center p-4">No types found.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
