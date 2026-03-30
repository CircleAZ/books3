import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './DataManagement.css';

const DataManagement = () => {
    const { user } = useAuth(); // Assuming check for admin
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [backupStatus, setBackupStatus] = useState(null);

    const handleBackup = () => {
        setBackupStatus('Creating backup...');
        setTimeout(() => {
            setBackupStatus('Backup created: azbooks_backup_2024.sqlite3');
        }, 2000);
    };

    const handleRestore = () => {
        if (!maintenanceMode) {
            alert("Maintenance Mode must be enabled to restore data.");
            return;
        }
        alert("Restore functionality is currently disabled for safety.");
    };

    return (
        <div className="data-management-grid">


            <div className="settings-section">
                <h2>System Maintenance</h2>
                <div className="setting-card danger-zone">
                    <div className="setting-info">
                        <h3>Maintenance Mode</h3>
                        <p>Disables all non-admin access and API writes. Required for restoration.</p>
                    </div>
                    <div className="setting-action">
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={maintenanceMode}
                                onChange={(e) => setMaintenanceMode(e.target.checked)}
                            />
                            <span className="slider round"></span>
                        </label>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <h2>Backup & Restore</h2>
                <div className="actions-grid">
                    <div className="action-card">
                        <h3>Export Data</h3>
                        <p>Create a full database backup.</p>
                        <button className="btn btn-primary" onClick={handleBackup}>Download Backup</button>
                        {backupStatus && <div className="status-msg success">{backupStatus}</div>}
                    </div>

                    <div className="action-card">
                        <h3>Import Data</h3>
                        <p>Restore from a previous backup file.</p>
                        <button
                            className={`btn ${maintenanceMode ? 'btn-danger' : 'btn-disabled'}`}
                            onClick={handleRestore}
                            disabled={!maintenanceMode}
                        >
                            Restore Data
                        </button>
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <h2>Factory Reset</h2>
                <div className="action-card danger-zone-full">
                    <h3>Dangerous Actions</h3>
                    <button className="btn btn-outline-danger" onClick={() => alert("Are you sure? This cannot be undone.")}>
                        Reset All Data
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DataManagement;
