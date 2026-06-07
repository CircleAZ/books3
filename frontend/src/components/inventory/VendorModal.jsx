import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import usePermissions from '../../utils/usePermissions';

import '../../styles/components/form-layout.css';
import '../../styles/components/modal-system.css';
export default function VendorModal({ isOpen, onClose, vendor, onSuccess }) {
    const { fetchWithAuth } = useAuth();
    const { hasPermission } = usePermissions();
    const canViewContact = hasPermission('finance.manage_expenses') || hasPermission('finance.view_reports');
    const [formData, setFormData] = useState({ name: '', description: '', contact_email: '', contact_phone: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (vendor) {
                setFormData({
                    name: vendor.name,
                    description: vendor.description,
                    contact_email: vendor.contact_email || '',
                    contact_phone: vendor.contact_phone || ''
                });
            } else {
                setFormData({ name: '', description: '', contact_email: '', contact_phone: '' });
            }
            setError('');
        }
    }, [isOpen, vendor]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const url = vendor
            ? `${ENDPOINTS.INVENTORY_VENDORS}${vendor.id}/`
            : ENDPOINTS.INVENTORY_VENDORS;

        const method = vendor ? 'PUT' : 'POST';

        const payload = { ...formData };
        if (vendor && !canViewContact) {
            delete payload.contact_email;
            delete payload.contact_phone;
        }

        try {
            const response = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
// fallow-ignore-next-line code-duplication
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const data = await response.json();
                onSuccess(data);
                onClose();
            } else {
                const data = await response.json();
                setError(data.detail || 'Failed to save vendor');
            }
        } catch (err) {
            setError('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ margin: '16px', padding: '20px', width: '100%', maxWidth: '450px' }}>
{/* fallow-ignore-next-line code-duplication */}
                <h2>{vendor ? 'Edit Vendor' : 'Add Vendor'}</h2>
                {error && <div className="error-message">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Name</label>
                        <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>
                    {canViewContact && (
                        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className="form-group">
                                <label>Email</label>
                                <input
                                    type="email"
                                    style={{ width: '100%' }}
                                    value={formData.contact_email}
                                    onChange={e => setFormData({ ...formData, contact_email: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Phone</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength="10"
                                    pattern="\d{10}"
                                    title="Phone number must be exactly 10 digits"
                                    style={{ width: '100%' }}
                                    value={formData.contact_phone}
                                    onChange={e => setFormData({ ...formData, contact_phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                                />
                            </div>
                        </div>
                    )}
                    <div className="form-group">
                        <label>Description</label>
                        <textarea
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                        />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
