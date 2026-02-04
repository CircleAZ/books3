import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import './Profile.css';

const API_BASE = 'http://localhost:8000/api';

export default function Profile() {
    const { user, token, fetchWithAuth } = useAuth();
    const [profile, setProfile] = useState(null);
    const [activities, setActivities] = useState([]);
    const [editing, setEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Editable fields
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
    });

    useEffect(() => {
        loadProfile();
        loadActivities();
    }, []);

    const loadProfile = async () => {
        try {
            const response = await fetchWithAuth(`${API_BASE}/account/profile/`);
            const data = await response.json();
            setProfile(data);
            setFormData({
                first_name: data.user.first_name || '',
                last_name: data.user.last_name || '',
                email: data.user.email || '',
                phone: data.phone || '',
            });
        } catch (error) {
            console.error('Failed to load profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadActivities = async () => {
        try {
            const response = await fetchWithAuth(`${API_BASE}/account/activity/`);
            const data = await response.json();
            setActivities(data.results || data);
        } catch (error) {
            console.error('Failed to load activities:', error);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage({ type: '', text: '' });

        try {
            const response = await fetchWithAuth(`${API_BASE}/account/profile/`, {
                method: 'PATCH',
                body: JSON.stringify({
                    user: {
                        first_name: formData.first_name,
                        last_name: formData.last_name,
                        email: formData.email,
                    },
                    phone: formData.phone,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setProfile(data);
                setEditing(false);
                setMessage({ type: 'success', text: 'Profile updated successfully!' });
                loadActivities(); // Refresh activities
            } else {
                const error = await response.json();
                setMessage({ type: 'error', text: error.detail || 'Failed to update profile' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Network error. Please try again.' });
        } finally {
            setSaving(false);
        }
    };

    const handlePictureUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('profile_picture', file);

        try {
            const response = await fetch(`${API_BASE}/account/profile/picture/`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData,
            });

            if (response.ok) {
                loadProfile();
                setMessage({ type: 'success', text: 'Profile picture updated!' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to upload picture' });
        }
    };

    if (loading) {
        return (
            <div className="profile-page loading">
                <div className="spinner-large"></div>
                <p>Loading profile...</p>
            </div>
        );
    }

    return (
        <div className="profile-page">
            <section className="profile-hero">
                <div className="profile-avatar-large">
                    {profile?.profile_picture_url ? (
                        <img src={profile.profile_picture_url} alt="Profile" />
                    ) : (
                        <span>{profile?.initials || user?.username?.slice(0, 2).toUpperCase()}</span>
                    )}
                    <label className="avatar-upload" title="Change picture">
                        <input type="file" accept="image/*" onChange={handlePictureUpload} />
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17,8 12,3 7,8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                    </label>
                </div>
                <h1>{profile?.full_name || user?.username}</h1>
                <p className="profile-role">{profile?.role || 'Staff'}</p>
            </section>

            {message.text && (
                <div className={`profile-message ${message.type}`}>
                    {message.text}
                </div>
            )}

            <section className="profile-details">
                <div className="section-header">
                    <h2>Profile Details</h2>
                    {!editing && (
                        <button className="edit-btn" onClick={() => setEditing(true)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Edit
                        </button>
                    )}
                </div>

                <div className="details-grid">
                    <div className="detail-item">
                        <label>Username</label>
                        <p>{user?.username}</p>
                    </div>

                    <div className="detail-item">
                        <label>First Name</label>
                        {editing ? (
                            <input
                                type="text"
                                value={formData.first_name}
                                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                            />
                        ) : (
                            <p>{profile?.user?.first_name || '-'}</p>
                        )}
                    </div>

                    <div className="detail-item">
                        <label>Last Name</label>
                        {editing ? (
                            <input
                                type="text"
                                value={formData.last_name}
                                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                            />
                        ) : (
                            <p>{profile?.user?.last_name || '-'}</p>
                        )}
                    </div>

                    <div className="detail-item">
                        <label>Email</label>
                        {editing ? (
                            <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                        ) : (
                            <p>{profile?.user?.email || '-'}</p>
                        )}
                    </div>

                    <div className="detail-item">
                        <label>Phone</label>
                        {editing ? (
                            <input
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            />
                        ) : (
                            <p>{profile?.phone || '-'}</p>
                        )}
                    </div>

                    <div className="detail-item">
                        <label>Role</label>
                        <p className="role-badge">{profile?.role}</p>
                    </div>
                </div>

                {editing && (
                    <div className="edit-actions">
                        <button className="cancel-btn" onClick={() => setEditing(false)}>
                            Cancel
                        </button>
                        <button className="save-btn" onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                )}
            </section>

            <section className="activity-log">
                <h2>Recent Activity</h2>
                {activities.length === 0 ? (
                    <p className="no-activity">No recent activity</p>
                ) : (
                    <div className="activity-list">
                        {activities.slice(0, 10).map((activity) => (
                            <div key={activity.id} className="activity-item">
                                <div className="activity-icon">
                                    {getActivityIcon(activity.action)}
                                </div>
                                <div className="activity-info">
                                    <p className="activity-desc">{activity.description}</p>
                                    <p className="activity-time">
                                        {new Date(activity.created_at).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function getActivityIcon(action) {
    const icons = {
        login: '🔐',
        logout: '👋',
        password_change: '🔑',
        profile_update: '✏️',
        order_create: '📦',
        product_create: '📦',
        customer_create: '👤',
    };
    return icons[action] || '📋';
}
