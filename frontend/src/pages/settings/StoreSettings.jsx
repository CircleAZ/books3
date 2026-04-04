import React, { useState, useEffect } from 'react';

import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import '../settings/SettingsIndex.css';
import './StoreSettings.css'; // Assume similar styles to other forms

const StoreSettings = () => {
    const { fetchWithAuth } = useAuth();
    const { setCurrency } = useCurrency();
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({
        name: '',
        address: '',
        phone: '',
        email: '',
        website: '',
        currency_symbol: '₹',
        timezone: 'Asia/Kolkata',
        gst_number: '',
        business_registration: ''
    });

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_STORE}`);
            if (response.ok) {
                const data = await response.json();
                setFormData(data);
            }
        } catch (error) {
            console.error('Error fetching store settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_STORE}`, {
                method: 'POST', // or PUT depending on backend view
                body: JSON.stringify(formData)
            });
            if (response.ok) {
                setCurrency(formData.currency_symbol);
                alert('Store settings updated successfully');
            } else {
                alert('Failed to update settings');
            }
        } catch (error) {
            console.error('Error updating settings:', error);
        }
    };

    if (loading) return <div>Loading Settings...</div>;

    return (
        <div className="settings-container">

            <form onSubmit={handleSubmit} className="settings-form">
                <div className="form-group">
                    <label>Store Name</label>
                    <input name="name" value={formData.name} onChange={handleChange} required />
                </div>
                <div className="form-group">
                    <label>Address</label>
                    <textarea name="address" value={formData.address} onChange={handleChange} />
                </div>
                <div className="form-row">
                    <div className="form-group">
                        <label>Phone</label>
                        <input name="phone" value={formData.phone} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                        <label>Email</label>
                        <input name="email" value={formData.email} onChange={handleChange} />
                    </div>
                </div>
                <div className="form-group">
                    <label>Website</label>
                    <input name="website" value={formData.website} onChange={handleChange} />
                </div>
                <div className="form-row">
                    <div className="form-group">
                        <label>Currency Symbol</label>
                        <input name="currency_symbol" value={formData.currency_symbol} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                        <label>Timezone</label>
                        <input name="timezone" value={formData.timezone} onChange={handleChange} />
                    </div>
                </div>
                <div className="form-row">
                    <div className="form-group">
                        <label>GST Number</label>
                        <input name="gst_number" value={formData.gst_number} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                        <label>Business Reg. No.</label>
                        <input name="business_registration" value={formData.business_registration} onChange={handleChange} />
                    </div>
                </div>
                <button type="submit" className="btn btn-primary">Save Settings</button>
            </form>
        </div>
    );
};

export default StoreSettings;
