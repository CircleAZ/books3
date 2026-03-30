import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './EmployeeManagement.css'; // Assume existing styles or create new

const EmployeeManagement = () => {
    const { fetchWithAuth } = useAuth();
    const [users, setUsers] = useState([]);
    const [availableRoles, setAvailableRoles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        first_name: '',
        last_name: '',
        password: '',
        role_ids: []
    });

    useEffect(() => {
        fetchUsers();
        fetchRoles();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_USERS}`);
            if (response.ok) {
                const data = await response.json();
                setUsers(data.results || data);
            }
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchRoles = async () => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_ROLES}`);
            if (response.ok) {
                const data = await response.json();
                setAvailableRoles(data.results || data);
            }
        } catch (error) {
            console.error('Error fetching roles:', error);
        }
    };

    const toggleActivation = async (userId) => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_USERS}${userId}/toggle_activation/`, {
                method: 'POST'
            });
            if (response.ok) {
                fetchUsers();
            }
        } catch (error) {
            console.error('Error toggling user activation:', error);
        }
    };

    const handleAddClick = () => {
        setCurrentUser(null);
        const defaultRole = availableRoles.find(r => r.is_default);
        setFormData({ username: '', email: '', first_name: '', last_name: '', password: '', role_ids: defaultRole ? [defaultRole.id] : [] });
        setShowModal(true);
    };

    const handleEditClick = (user) => {
        setCurrentUser(user);
        setFormData({
            username: user.username,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            password: '',
            role_ids: user.roles ? user.roles.map(r => r.id) : []
        });
        setShowModal(true);
    };

    const handleModalClose = () => {
        setShowModal(false);
        setCurrentUser(null);
    };

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const url = currentUser
            ? `${ENDPOINTS.SETTINGS_USERS}${currentUser.id}/`
            : `${ENDPOINTS.SETTINGS_USERS}`;
        const method = currentUser ? 'PUT' : 'POST';

        try {
            const response = await fetchWithAuth(url, {
                method: method,
                body: JSON.stringify(formData)
            });
            if (response.ok) {
                fetchUsers();
                handleModalClose();
            } else {
                alert('Failed to save user');
            }
        } catch (error) {
            console.error('Error saving user:', error);
        }
    };

    if (loading) return <div>Loading Employees...</div>;

    return (
        <div className="employee-management-container">
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'var(--space-md)'}}>
                <button className="btn btn-primary" onClick={handleAddClick}>+ Add Employee</button>
            </div>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(user => (
                        <tr key={user.id}>
                            <td>{user.username}</td>
                            <td>{user.email}</td>
                            <td>{user.first_name} {user.last_name}</td>
                            <td>{user.roles && user.roles.length > 0 ? user.roles.map(r => r.name).join(', ') : 'No Role'}</td>
                            <td>
                                <span className={`status-badge ${user.is_active ? 'active' : 'inactive'}`}>
                                    {user.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </td>
                            <td>
                                <button className="btn-icon" onClick={() => handleEditClick(user)} title="Edit">
                                    Edit
                                </button>
                                <button className="btn-icon" onClick={() => toggleActivation(user.id)} title="Toggle Activation">
                                    {user.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>{currentUser ? 'Edit Employee' : 'Add Employee'}</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Username</label>
                                <input name="username" value={formData.username} onChange={handleInputChange} required />
                            </div>
                            <div className="form-group">
                                <label>Email</label>
                                <input name="email" type="email" value={formData.email} onChange={handleInputChange} required />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>First Name</label>
                                    <input name="first_name" value={formData.first_name} onChange={handleInputChange} />
                                </div>
                                <div className="form-group">
                                    <label>Last Name</label>
                                    <input name="last_name" value={formData.last_name} onChange={handleInputChange} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Role</label>
                                <select
                                    name="role_ids"
                                    value={formData.role_ids[0] || ''}
                                    onChange={(e) => setFormData({ ...formData, role_ids: e.target.value ? [e.target.value] : [] })}
                                >
                                    <option value="">— Select Role —</option>
                                    {availableRoles.map(role => (
                                        <option key={role.id} value={role.id}>{role.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Password {currentUser && '(Leave blank to keep current)'}</label>
                                <input name="password" type="password" value={formData.password} onChange={handleInputChange} required={!currentUser} />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={handleModalClose}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmployeeManagement;
