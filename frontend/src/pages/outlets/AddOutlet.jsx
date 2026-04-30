import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import { useToast } from '../../context/ToastContext';

export default function AddOutlet() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        commission_percentage: '0.00',
        is_active: true
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const response = await axios.post(`${API_BASE}/outlets/outlets/`, formData);
            showToast("Outlet created successfully!", "success");
            navigate(`/outlets/${response.data.id}`);
        } catch (error) {
            console.error(error);
            showToast("Failed to create outlet", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container" style={{ maxWidth: '600px' }}>
            <div className="page-header">
                <h1 className="page-title">Add New Outlet</h1>
            </div>

            <div className="form-card">
                <form onSubmit={handleSubmit} className="form-layout">
                    <div className="form-group">
                        <label>Outlet Name *</label>
                        <input 
                            type="text" 
                            required 
                            className="form-input"
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                        />
                    </div>

                    <div className="form-group">
                        <label>Commission Percentage (%) *</label>
                        <input 
                            type="number" 
                            step="0.01"
                            min="0"
                            max="100"
                            required 
                            className="form-input"
                            value={formData.commission_percentage}
                            onChange={e => setFormData({...formData, commission_percentage: e.target.value})}
                            title="The percentage of gross sales kept by the outlet"
                        />
                        <small className="text-muted">E.g. 10.00</small>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Contact Person</label>
                            <input 
                                type="text" 
                                className="form-input"
                                value={formData.contact_person}
                                onChange={e => setFormData({...formData, contact_person: e.target.value})}
                            />
                        </div>
                        <div className="form-group">
                            <label>Phone</label>
                            <input 
                                type="text" 
                                className="form-input"
                                value={formData.phone}
                                onChange={e => setFormData({...formData, phone: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Email</label>
                        <input 
                            type="email" 
                            className="form-input"
                            value={formData.email}
                            onChange={e => setFormData({...formData, email: e.target.value})}
                        />
                    </div>

                    <div className="form-group">
                        <label>Address</label>
                        <textarea 
                            className="form-input"
                            rows="3"
                            value={formData.address}
                            onChange={e => setFormData({...formData, address: e.target.value})}
                        />
                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => navigate('/outlets')}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Saving...' : 'Create Outlet'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
