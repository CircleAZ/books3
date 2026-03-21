import './TopBar.css';

export default function TopBar({ title, storeLogo, onMenuClick, onSearchClick, onProfileClick, onNotificationClick, notificationCount = 0, sidebarClass = '', showHamburger = false, hamburgerLabel = 'Open navigation menu', hamburgerRef, user }) {
    return (
        <header className={`topbar ${sidebarClass}`}>
            <div className="topbar-left">
                {showHamburger && (
                    <button
                        ref={hamburgerRef}
                        className="icon-btn hamburger-btn"
                        onClick={onMenuClick}
                        aria-label={hamburgerLabel}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 12h18M3 6h18M3 18h18" />
                        </svg>
                    </button>
                )}
                {storeLogo && (
                    <img src={storeLogo} alt="Store Logo" className="topbar-logo" />
                )}
                <h1 className="topbar-title">{title}</h1>
            </div>

            <div className="topbar-right">
                <button
                    className="icon-btn search-btn"
                    onClick={onSearchClick}
                    aria-label="Open search (Ctrl+K)"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                    </svg>
                </button>

                <button className="icon-btn notification-btn" onClick={onNotificationClick} aria-label={notificationCount > 0 ? `Notifications (${notificationCount} unread)` : 'Notifications'}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    {notificationCount > 0 && (
                        <span className="notification-badge">{notificationCount > 99 ? '99+' : notificationCount}</span>
                    )}
                </button>

                <button
                    className="profile-btn"
                    onClick={onProfileClick}
                    aria-label="Open user menu"
                >
                    <div className="avatar">
                        <span>{user?.first_name && user?.last_name ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase() : user?.username?.slice(0, 2).toUpperCase() || 'U'}</span>
                    </div>
                </button>
            </div>
        </header>
    );
}
