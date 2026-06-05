import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ENDPOINTS } from '../config/api';
import API_BASE from '../config/api';
import './Profile.css';

import '../styles/components/form-layout.css';
import '../styles/components/modal-system.css';
export default function Profile() {
    const { fetchWithAuth } = useAuth();

    const [profile, setProfile] = useState(null);
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [message, setMessage] = useState(null);

    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone: ''
    });

    const [passwordData, setPasswordData] = useState({
        current_password: '',
        new_password: '',
        confirm_password: ''
    });
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    // Load profile
    const loadProfile = async () => {
        try {
            const response = await fetchWithAuth(ENDPOINTS.PROFILE);
            if (response.ok) {
                const data = await response.json();
                setProfile(data);
                setFormData({
                    first_name: data.first_name || '',
                    last_name: data.last_name || '',
                    email: data.email || '',
                    phone: data.phone || ''
                });
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    };

    // Load activity log
    const loadActivities = async () => {
        try {
            const response = await fetchWithAuth(ENDPOINTS.ACTIVITY);
            if (response.ok) {
                const data = await response.json();
                setActivities(data.results || data || []);
            }
        } catch (error) {
            console.error('Error loading activities:', error);
        }
    };

    useEffect(() => {
        Promise.all([loadProfile(), loadActivities()]).finally(() => setLoading(false));
    }, []);

    // Save profile
    const handleSave = async (e) => {
        e.preventDefault();
        try {
            const response = await fetchWithAuth(ENDPOINTS.PROFILE, {
                method: 'PATCH',
                body: JSON.stringify(formData)
            });
            if (response.ok) {
                const data = await response.json();
                setProfile(data);
                setEditing(false);
// fallow-ignore-next-line code-duplication
                setMessage({ type: 'success', text: 'Profile updated successfully' });
            } else {
                const err = await response.json();
                setMessage({ type: 'error', text: JSON.stringify(err) });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Network error' });
        }
    };

    // Upload picture
    const handlePictureUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const fd = new FormData();
        fd.append('profile_picture', file);

        try {
            const response = await fetchWithAuth(ENDPOINTS.PROFILE_PICTURE, {
                method: 'POST',
                body: fd,
                headers: {} // Let browser set Content-Type for FormData
            });
            if (response.ok) {
                setMessage({ type: 'success', text: 'Profile picture updated' });
                loadProfile();
            } else {
                const err = await response.json();
                setMessage({ type: 'error', text: err.profile_picture?.[0] || 'Upload failed' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Upload error' });
        }
    };

    // Change password
    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (passwordData.new_password !== passwordData.confirm_password) {
            setMessage({ type: 'error', text: 'New passwords do not match' });
            return;
        }

        try {
            const response = await fetchWithAuth(ENDPOINTS.CHANGE_PASSWORD, {
                method: 'POST',
                body: JSON.stringify({
                    current_password: passwordData.current_password,
                    new_password: passwordData.new_password,
                    confirm_password: passwordData.confirm_password
                }),
            });

            if (response.ok) {
                setMessage({ type: 'success', text: 'Password changed successfully' });
                setShowPasswordModal(false);
                setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
            } else {
                const data = await response.json();
                const errorText = data.current_password?.[0] || data.new_password?.[0] || data.error || 'Failed to change password';
                setMessage({ type: 'error', text: errorText });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Network error' });
        }
    };

    const getActivityIcon = (action) => {
        const icons = {
            'login': '🔑',
            'logout': '🚪',
            'profile_update': '✏️',
            'password_change': '🔒',
            'order_create': '🛒',
            'order_update': '📦',
        };
        return icons[action] || '📋';
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="profile-page">
                <div className="loading-container">
                    <div className="spinner-large"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="profile-page animate-fade-in">
            {/* Hero Section */}
            <div className="profile-hero">
                <div className="profile-avatar-section">
                    <div className="profile-avatar-wrapper">
                        {profile?.profile_picture_url ? (
                            <img src={profile.profile_picture_url} alt="Profile" className="profile-avatar-img" />
                        ) : (
                            <div className="profile-avatar-placeholder">
                                {profile?.initials || '?'}
                            </div>
                        )}
                        <div className="avatar-upload-actions" style={{ display: 'flex', gap: '8px' }}>
                            <label className="avatar-upload-btn" title="Upload picture">
                                📁
                                <input type="file" accept="image/*" onChange={handlePictureUpload} hidden />
                            </label>
                            <label className="avatar-upload-btn" title="Take photo">
                                📷
                                <input type="file" accept="image/*" capture="environment" onChange={handlePictureUpload} hidden />
                            </label>
                        </div>
                    </div>
                    <div className="profile-hero-info">
                        <h1>{profile?.full_name || profile?.username}</h1>
                        <span className="profile-role-badge">{profile?.role || 'User'}</span>
                        <div className="profile-meta">
                            <span>Joined {formatDate(profile?.date_joined)}</span>
                            <span>Last login {formatDate(profile?.last_login)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Message */}
            {message && (
                <div className={`profile-message ${message.type}`}>
                    {message.text}
                    <button className="message-close" onClick={() => setMessage(null)}>×</button>
                </div>
            )}

            {/* Profile Details */}
            <section className="profile-details card">
                <div className="section-header">
                    <h2>Profile Details</h2>
                    {!editing ? (
                        <button className="btn btn-primary btn-sm" onClick={() => setEditing(true)}>Edit</button>
                    ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
                    )}
                </div>

                {editing ? (
                    <form onSubmit={handleSave}>
                        <div className="profile-form-grid">
                            <div className="form-group">
                                <label>First Name</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={formData.first_name}
                                    onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Last Name</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={formData.last_name}
                                    onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Email</label>
                                <input
                                    type="email"
                                    className="form-control"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Phone</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="form-actions">
                            <button type="submit" className="btn btn-primary">Save Changes</button>
                        </div>
                    </form>
                ) : (
                    <div className="profile-info-grid">
                        <div className="info-item">
                            <span className="info-label">Username</span>
                            <span className="info-value">{profile?.username}</span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">First Name</span>
                            <span className="info-value">{profile?.first_name || '-'}</span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">Last Name</span>
                            <span className="info-value">{profile?.last_name || '-'}</span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">Email</span>
                            <span className="info-value">{profile?.email || '-'}</span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">Phone</span>
                            <span className="info-value">{profile?.phone || '-'}</span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">Role</span>
                            <span className="info-value">{profile?.role || '-'}</span>
                        </div>
                    </div>
                )}

                <div className="password-section">
                    <button className="btn btn-secondary" onClick={() => setShowPasswordModal(true)}>
                        🔒 Change Password
                    </button>
                </div>
            </section>

            {/* Activity Log */}
            <section className="profile-activity card">
                <h2>Recent Activity</h2>
                {activities.length > 0 ? (
                    <div className="activity-list">
                        {activities.map((activity, idx) => (
                            <div key={activity.id || idx} className="activity-item">
                                <span className="activity-icon">{getActivityIcon(activity.action)}</span>
                                <div className="activity-content">
                                    <span className="activity-desc">
                                        {activity.action_display || activity.description}
                                    </span>
                                    <span className="activity-time">{formatDate(activity.created_at)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-muted">No recent activity</p>
                )}
            </section>

            {/* Password Modal */}
            {showPasswordModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Change Password</h3>
                        <form onSubmit={handleChangePassword}>
                            <div className="form-group">
                                <label>Current Password</label>
                                <input
                                    type="password"
                                    className="form-control"
                                    value={passwordData.current_password}
                                    onChange={e => setPasswordData({ ...passwordData, current_password: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>New Password</label>
                                <input
                                    type="password"
                                    className="form-control"
                                    value={passwordData.new_password}
                                    onChange={e => setPasswordData({ ...passwordData, new_password: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Confirm Password</label>
                                <input
                                    type="password"
                                    className="form-control"
                                    value={passwordData.confirm_password}
                                    onChange={e => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowPasswordModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Update Password</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
