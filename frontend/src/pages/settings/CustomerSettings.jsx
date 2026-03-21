import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ManageSchools from './ManageSchools';
import ManageClasses from './ManageClasses';
import ManageDivisions from './ManageDivisions';
import ManageSubdivisions from './ManageSubdivisions';
import ManageGroups from './ManageGroups';
import ManageTags from './ManageTags';
import ManageLinkTypes from './ManageLinkTypes';
import './CustomerSettings.css';
import '../settings/SettingsIndex.css';

const CustomerSettings = () => {
    const [activeTab, setActiveTab] = useState('schools');
    const navigate = useNavigate();

    const tabs = [
        { id: 'schools', label: 'Schools' },
        { id: 'classes', label: 'Classes' },
        { id: 'divisions', label: 'Divisions' },
        { id: 'subdivisions', label: 'Subdivisions' },
        { id: 'groups', label: 'Customer Groups' },
        { id: 'tags', label: 'Location Tags' },
        { id: 'links', label: 'Relationship Types' },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'schools':
                return <ManageSchools />;
            case 'classes':
                return <ManageClasses />;
            case 'divisions':
                return <ManageDivisions />;
            case 'subdivisions':
                return <ManageSubdivisions />;
            case 'groups':
                return <ManageGroups />;
            case 'tags':
                return <ManageTags />;
            case 'links':
                return <ManageLinkTypes />;
            default:
                return null;
        }
    };

    return (
        <div className="settings-container fade-in">
            <div className="settings-page-header">
                <button className="settings-back-btn settings-back-btn-wide" onClick={() => navigate('/customers')}>← Back to Customers</button>
                <h1>Customer Settings</h1>
            </div>

            <div className="settings-layout">
                <div className="settings-sidebar">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`settings-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="settings-content">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default CustomerSettings;
