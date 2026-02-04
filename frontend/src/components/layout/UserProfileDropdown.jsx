import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './UserProfileDropdown.css';

export default function UserProfileDropdown({ isOpen, onClose }) {
    const dropdownRef = useRef(null);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        function handleClickOutside(e) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                onClose();
                setShowLogoutConfirm(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleLogout = async () => {
        if (showLogoutConfirm) {
            await logout();
            onClose();
            navigate('/login');
        } else {
            setShowLogoutConfirm(true);
        }
    };

    const handleNavigation = (path) => {
        onClose();
        navigate(path);
    };

    // Get initials from user
    const getInitials = () => {
        if (user?.first_name && user?.last_name) {
            return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
        }
        return user?.username?.slice(0, 2).toUpperCase() || 'U';
    };

    return (
        <div className="profile-dropdown animate-fade-in" ref={dropdownRef}>
            <div className="profile-header">
                <div className="profile-avatar">
                    <span>{getInitials()}</span>
                </div>
                <div className="profile-info">
                    <p className="profile-name">
                        {user?.first_name && user?.last_name
                            ? `${user.first_name} ${user.last_name}`
                            : user?.username}
                    </p>
                    <p className="profile-email">{user?.email || 'No email set'}</p>
                </div>
            </div>

            <div className="profile-menu">
                <button className="profile-menu-item" onClick={() => handleNavigation('/account/profile')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                    </svg>
                    My Profile
                </button>

                <button className="profile-menu-item" onClick={() => handleNavigation('/settings')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    Settings
                </button>

                <div className="menu-divider" />

                <button
                    className={`profile-menu-item logout-btn ${showLogoutConfirm ? 'confirm' : ''}`}
                    onClick={handleLogout}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16,17 21,12 16,7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    {showLogoutConfirm ? 'Click again to confirm' : 'Logout'}
                </button>
            </div>
        </div>
    );
}
