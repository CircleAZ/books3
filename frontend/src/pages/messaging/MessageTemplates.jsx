import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './MessageTemplates.css';

const MessageTemplates = () => {
    const { fetchWithAuth } = useAuth();
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTemplates();
    }, []);

    const fetchTemplates = async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.MESSAGING_TEMPLATES}`);
            if (response.ok) {
                const data = await response.json();
                setTemplates(data.results || data);
            }
        } catch (error) {
            console.error('Error fetching templates:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div>Loading Templates...</div>;

    return (
        <div className="message-templates">
            <header>
                <h1>Message Templates</h1>
                <button className="btn btn-primary">+ Add Template</button>
            </header>
            <div className="templates-grid">
                {templates.map(t => (
                    <div key={t.id} className="template-card">
                        <div className="card-header">
                            <h3>{t.name}</h3>
                            <span className="badge">{t.language_display}</span>
                        </div>
                        <p className="type">{t.type_display}</p>
                        <div className="content-preview">
                            {t.content}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MessageTemplates;
