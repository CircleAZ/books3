import React from 'react';
import { useNavigate } from 'react-router-dom';
import './SettingsIndex.css';

const IntegrationSettings = () => {
    const navigate = useNavigate();
    const integrations = [
        { id: 1, name: 'Email (SMTP)', status: 'Connected', icon: '📧' },
        { id: 2, name: 'SMS Gateway', status: 'Not Configured', icon: '📱' },
        { id: 3, name: 'WhatsApp API', status: 'Coming Soon', icon: '💬' },
        { id: 4, name: 'Google Maps', status: 'Connected', icon: '🗺️' },
    ];

    return (
        <div className="settings-page">
            <div className="settings-page-header">
                <button className="settings-back-btn" onClick={() => navigate('/settings')}>‹</button>
                <h1>Integrations</h1>
            </div>

            <div className="integrations-grid">
                {integrations.map(integration => (
                    <div key={integration.id} className="integration-card card">
                        <div className="integration-icon">{integration.icon}</div>
                        <h3>{integration.name}</h3>
                        <p className={`status-badge ${integration.status === 'Connected' ? 'active' : 'inactive'}`}>
                            {integration.status}
                        </p>
                        <button className="btn btn-outline-primary btn-sm mt-md">Configure</button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default IntegrationSettings;
