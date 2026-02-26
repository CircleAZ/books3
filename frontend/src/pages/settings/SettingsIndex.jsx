import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './SettingsIndex.css';

const settingsItems = [
    {
        to: '/settings/store',
        icon: '🏪',
        title: 'Store Settings',
        summary: 'Manage store name, address, and logo'
    },
    {
        to: '/settings/employees',
        icon: '👥',
        title: 'Employee Management',
        summary: 'Manage users and staff access'
    },

    {
        to: '/settings/finance',
        icon: '💰',
        title: 'Financial Settings',
        summary: 'Tax rates, payment methods, and currency'
    },
    {
        to: '/settings/data',
        icon: '💾',
        title: 'Data Management',
        summary: 'Backup and restore data'
    },
    {
        to: '/settings/payments',
        icon: '💳',
        title: 'Payment Methods',
        summary: 'Configure accepted payment methods'
    },
    {
        to: '/settings/receipt',
        icon: '🧾',
        title: 'Receipt Customization',
        summary: 'Customize receipt layout and content'
    },
    {
        to: '/settings/notifications',
        icon: '🔔',
        title: 'Notifications',
        summary: 'Configure notification preferences'
    },
    {
        to: '/settings/integrations',
        icon: '🔗',
        title: 'Integrations',
        summary: 'Manage third-party service connections'
    },
    {
        to: '/settings/system',
        icon: 'ℹ️',
        title: 'System Info',
        summary: 'Version and system status'
    }
];

const SettingsIndex = () => {
    const navigate = useNavigate();
    return (
        <div className="settings-index">
            <button className="settings-back-btn" onClick={() => navigate('/')}>
                ‹
            </button>
            <h1>Settings</h1>
            <div className="settings-list">
                {settingsItems.map(item => (
                    <Link key={item.to} to={item.to} className="settings-row">
                        <span className="settings-row-icon">{item.icon}</span>
                        <div className="settings-row-text">
                            <span className="settings-row-title">{item.title}</span>
                            <span className="settings-row-summary">{item.summary}</span>
                        </div>
                        <span className="settings-row-arrow">›</span>
                    </Link>
                ))}
            </div>
        </div>
    );
};

export default SettingsIndex;
