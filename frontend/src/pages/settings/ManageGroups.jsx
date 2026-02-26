import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';

export default function ManageGroups() {
    const { fetchWithAuth } = useAuth();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '', discount_percent: 0 });

    const fetchGroups = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(ENDPOINTS.CUSTOMERS_GROUPS);
            if (res.ok) {
                const data = await res.json();
                setGroups(data.results || data || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchGroups();
    }, [fetchGroups]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const url = isEditing 
                ? `${ENDPOINTS.CUSTOMERS_GROUPS}${currentItem.id}/` 
                : ENDPOINTS.CUSTOMERS_GROUPS;
            
            const method = isEditing ? 'PUT' : 'POST';
            
            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setIsEditing(false);
                setCurrentItem(null);
                setFormData({ name: '', description: '', discount_percent: 0 });
                fetchGroups();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleEdit = (group) => {
        setIsEditing(true);
        setCurrentItem(group);
        setFormData({ 
            name: group.name, 
            description: group.description, 
            discount_percent: group.discount_percent 
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure?')) return;
        try {
            await fetchWithAuth(`${ENDPOINTS.CUSTOMERS_GROUPS}${id}/`, { method: 'DELETE' });
            fetchGroups();
        } catch (err) {
            console.error(err);
        }
    };

    if (loading && !isEditing && groups.length === 0) {
        return <div className="p-4 text-center">Loading...</div>;
    }

    return (
        <div>
            <div className="manager-header">
                <h2>Customer Groups</h2>
                <button 
                    className="btn btn-primary"
                    onClick={() => {
                        setIsEditing(true);
                        setCurrentItem(null);
                        setFormData({ name: '', description: '', discount_percent: 0 });
                    }}
                >
                    + Add Group
                </button>
            </div>

            {isEditing && (
                <div className="card mb-4" style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>{currentItem ? 'Edit Group' : 'New Group'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Group Name</label>
                            <input 
                                type="text" 
                                value={formData.name} 
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                required 
                            />
                        </div>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Discount (%)</label>
                            <input 
                                type="number" 
                                step="0.01"
                                value={formData.discount_percent} 
                                onChange={e => setFormData({...formData, discount_percent: e.target.value})}
                            />
                        </div>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Description</label>
                            <textarea 
                                value={formData.description} 
                                onChange={e => setFormData({...formData, description: e.target.value})}
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
                        <th>Discount</th>
                        <th>Description</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {groups.map(group => (
                        <tr key={group.id}>
                            <td>{group.name}</td>
                            <td>{group.discount_percent}%</td>
                            <td>{group.description}</td>
                            <td className="actions-cell">
                                <button 
                                    className="btn btn-ghost"
                                    onClick={() => handleEdit(group)}
                                >
                                    Edit
                                </button>
                                <button 
                                    className="btn btn-ghost text-danger"
                                    onClick={() => handleDelete(group.id)}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                    {groups.length === 0 && (
                        <tr>
                            <td colSpan="4" className="text-center p-4">No groups found.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
