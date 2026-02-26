import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import './ReceiptSettings.css';
import '../settings/SettingsIndex.css';

const ReceiptSettings = () => {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();
    const [config, setConfig] = useState({
        header_text: '',
        footer_text: '',
        show_logo: true,
        show_address: true,
        show_gst: true,
        show_phone: true,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_RECEIPT}`);
            if (response.ok) {
                const data = await response.json();
                setConfig({
                    header_text: data.header_text || '',
                    footer_text: data.footer_text || '',
                    show_logo: data.show_logo,
                    show_address: data.show_address,
                    show_gst: data.show_gst,
                    show_phone: data.show_phone
                });
            }
        } catch (error) {
            console.error('Error fetching receipt settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setConfig(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSave = async () => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_RECEIPT}`, {
                method: 'POST',
                body: JSON.stringify(config)
            });
            if (response.ok) {
                alert('Receipt settings saved successfully!');
            } else {
                alert('Failed to save settings.');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    };

    if (loading) return <div>Loading Receipt Settings...</div>;

    return (
        <div className="settings-page animate-fade-in">
            <div className="settings-page-header">
                <button className="settings-back-btn" onClick={() => navigate('/settings')}>‹</button>
                <h1>Receipt Settings</h1>
            </div>

            <div className="receipt-settings-layout">
                <div className="settings-panel card">
                    <section className="settings-section">
                        <h3>General Content</h3>
                        <div className="form-group">
                            <label>Receipt Header</label>
                            <textarea
                                name="header_text"
                                value={config.header_text}
                                onChange={handleChange}
                                rows="3"
                                placeholder="Business Name, Tagline, etc."
                            />
                        </div>
                        <div className="form-group">
                            <label>Receipt Footer</label>
                            <textarea
                                name="footer_text"
                                value={config.footer_text}
                                onChange={handleChange}
                                rows="3"
                                placeholder="Terms, Thank you message, etc."
                            />
                        </div>
                    </section>

                    <section className="settings-section toggles">
                        <h3>Visibility Options</h3>
                        <div className="toggle-item">
                            <div className="toggle-info">
                                <span className="toggle-label">Show Business Logo</span>
                            </div>
                            <label className="switch">
                                <input
                                    type="checkbox"
                                    name="show_logo"
                                    checked={config.show_logo}
                                    onChange={handleChange}
                                />
                                <span className="slider round"></span>
                            </label>
                        </div>
                        <div className="toggle-item">
                            <div className="toggle-info">
                                <span className="toggle-label">Show Address</span>
                            </div>
                            <label className="switch">
                                <input
                                    type="checkbox"
                                    name="show_address"
                                    checked={config.show_address}
                                    onChange={handleChange}
                                />
                                <span className="slider round"></span>
                            </label>
                        </div>
                        <div className="toggle-item">
                            <div className="toggle-info">
                                <span className="toggle-label">Show GST Number</span>
                            </div>
                            <label className="switch">
                                <input
                                    type="checkbox"
                                    name="show_gst"
                                    checked={config.show_gst}
                                    onChange={handleChange}
                                />
                                <span className="slider round"></span>
                            </label>
                        </div>
                        <div className="toggle-item">
                            <div className="toggle-info">
                                <span className="toggle-label">Show Phone Number</span>
                            </div>
                            <label className="switch">
                                <input
                                    type="checkbox"
                                    name="show_phone"
                                    checked={config.show_phone}
                                    onChange={handleChange}
                                />
                                <span className="slider round"></span>
                            </label>
                        </div>
                    </section>

                    <div className="panel-actions">
                        <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
                    </div>
                </div>

                <div className="preview-panel card">
                    <h3>Live Preview</h3>
                    <div className="receipt-preview">
                        <div className="receipt-paper">
                            {config.show_logo && <div className="preview-logo">AZ</div>}
                            <div className="preview-header">{config.header_text || 'Business Name'}</div>
                            {config.show_address && <div className="preview-subtext">123, Market Street, Book City</div>}
                            {config.show_gst && <div className="preview-subtext">GSTIN: 07AAAAA0000A1Z5</div>}
                            {config.show_phone && <div className="preview-subtext">Ph: +91 98765 43210</div>}

                            <div className="preview-divider"></div>

                            <div className="preview-items">
                                <div className="preview-item">
                                    <span>Sample Book Name</span>
                                    <span>{currency}10.00</span>
                                </div>
                            </div>

                            <div className="preview-divider"></div>

                            <div className="preview-total">
                                <span>TOTAL</span>
                                <span>{currency}10.00</span>
                            </div>

                            <div className="preview-footer">{config.footer_text || 'Thank you!'}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReceiptSettings;
