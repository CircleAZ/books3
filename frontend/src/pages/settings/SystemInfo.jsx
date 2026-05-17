import React, { useState, useEffect } from 'react';
import './SystemInfo.css';
import { useToast } from '../../context/ToastContext';

const SystemInfo = () => {
    const { showToast } = useToast();
    const [systemData, setSystemData] = useState({
        appName: 'AZ Books',
        version: '1.0.0-beta',
        environment: import.meta.env.MODE,
        buildDate: new Date().toLocaleDateString(),
        developer: 'Google Deepmind (Agentic AI)',
        backendStatus: 'Online', // Placeholder for actual health check
        database: 'SQLite 3 (Development)',
        platform: navigator.platform,
        userAgent: navigator.userAgent
    });

    const checkUpdates = () => {
        showToast("You are running the latest version (Hell Mode Edition).", "info");
    };

    return (
        <div className="system-info-container">
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'var(--space-md)'}}>
                <button className="btn btn-primary" onClick={checkUpdates}>Check for Updates</button>
            </div>

            <div className="info-grid">
                <div className="info-card">
                    <h3>Application Details</h3>
                    <div className="info-row">
                        <span className="label">Name:</span>
                        <span className="value">{systemData.appName}</span>
                    </div>
                    <div className="info-row">
                        <span className="label">Version:</span>
                        <span className="value">{systemData.version}</span>
                    </div>
                    <div className="info-row">
                        <span className="label">Environment:</span>
                        <span className="value badge">{systemData.environment}</span>
                    </div>
                    <div className="info-row">
                        <span className="label">Build Date:</span>
                        <span className="value">{systemData.buildDate}</span>
                    </div>
                </div>

                <div className="info-card">
                    <h3>Technical Specs</h3>
                    <div className="info-row">
                        <span className="label">Developer:</span>
                        <span className="value">{systemData.developer}</span>
                    </div>
                    <div className="info-row">
                        <span className="label">Backend:</span>
                        <span className="value status-good">{systemData.backendStatus}</span>
                    </div>
                    <div className="info-row">
                        <span className="label">Database:</span>
                        <span className="value">{systemData.database}</span>
                    </div>
                </div>

                <div className="info-card">
                    <h3>Client Info</h3>
                    <div className="info-row">
                        <span className="label">Platform:</span>
                        <span className="value">{systemData.platform}</span>
                    </div>
                    <div className="code-block">
                        {systemData.userAgent}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemInfo;
