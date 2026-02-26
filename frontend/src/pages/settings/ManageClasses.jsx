import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';

export default function ManageClasses() {
    const { fetchWithAuth } = useAuth();
    const [classes, setClasses] = useState([]);
    const [schools, setSchools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', school: '', order: 0 });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [classesRes, schoolsRes] = await Promise.all([
                fetchWithAuth(ENDPOINTS.CUSTOMERS_CLASSES),
                fetchWithAuth(ENDPOINTS.SCHOOLS)
            ]);

            if (classesRes.ok) {
                const data = await classesRes.json();
                setClasses(data.results || data || []);
            }
            if (schoolsRes.ok) {
                const data = await schoolsRes.json();
                setSchools(data.results || data || []);
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
                ? `${ENDPOINTS.CUSTOMERS_CLASSES}${currentItem.id}/` 
                : ENDPOINTS.CUSTOMERS_CLASSES;
            
            const method = isEditing ? 'PUT' : 'POST';
            
            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setIsEditing(false);
                setCurrentItem(null);
                setFormData({ name: '', school: '', order: 0 });
                fetchData();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleEdit = (cls) => {
        setIsEditing(true);
        setCurrentItem(cls);
        setFormData({ 
            name: cls.name, 
            school: cls.school, 
            order: cls.order || 0 
        });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure? This may affect linked customers.')) return;
        try {
            await fetchWithAuth(`${ENDPOINTS.CUSTOMERS_CLASSES}${id}/`, { method: 'DELETE' });
            fetchData();
        } catch (err) {
            console.error(err);
        }
    };

    if (loading && !isEditing && classes.length === 0) {
        return <div className="p-4 text-center">Loading...</div>;
    }

    return (
        <div>
            <div className="manager-header">
                <h2>Manage Classes</h2>
                <button 
                    className="btn btn-primary"
                    onClick={() => {
                        setIsEditing(true);
                        setCurrentItem(null);
                        setFormData({ name: '', school: '', order: 0 });
                    }}
                >
                    + Add Class
                </button>
            </div>

            {isEditing && (
                <div className="card mb-4" style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>{currentItem ? 'Edit Class' : 'New Class'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>School</label>
                            <select
                                value={formData.school}
                                onChange={e => setFormData({...formData, school: e.target.value})}
                                required
                                style={{ width: '100%', padding: '0.5rem' }}
                            >
                                <option value="">Select School</option>
                                {schools.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Class Name</label>
                            <input 
                                type="text" 
                                value={formData.name} 
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                required 
                            />
                        </div>
                        <div className="form-group mb-2" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Order (Sort Priority)</label>
                            <input 
                                type="number" 
                                value={formData.order} 
                                onChange={e => setFormData({...formData, order: parseInt(e.target.value)})}
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
                        <th>Class Name</th>
                        <th>School</th>
                        <th>Order</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {classes.map(cls => (
                        <tr key={cls.id}>
                            <td>{cls.name}</td>
                            <td>{cls.school_name || schools.find(s => s.id === cls.school)?.name || '-'}</td>
                            <td>{cls.order}</td>
                            <td className="actions-cell">
                                <button 
                                    className="btn btn-ghost"
                                    onClick={() => handleEdit(cls)}
                                >
                                    Edit
                                </button>
                                <button 
                                    className="btn btn-ghost text-danger"
                                    onClick={() => handleDelete(cls.id)}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    ))}
                    {classes.length === 0 && (
                        <tr>
                            <td colSpan="4" className="text-center p-4">No classes found.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
