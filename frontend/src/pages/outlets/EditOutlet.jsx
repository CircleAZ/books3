import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import { useToast } from '../../context/ToastContext';

export default function EditOutlet() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    
    const [formData, setFormData] = useState({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        is_active: true
    });

    useEffect(() => {
        const fetchOutlet = async () => {
            try {
                const res = await fetchWithAuth(`${ENDPOINTS.OUTLETS}${id}/`);
                if (res.ok) {
                    const data = await res.json();
                    setFormData({
                        name: data.name || '',
                        contact_person: data.contact_person || '',
                        phone: data.phone || '',
                        email: data.email || '',
                        address: data.address || '',
                        is_active: data.is_active !== undefined ? data.is_active : true
                    });
                } else {
                    showToast("Failed to load outlet details", "error");
                    navigate('/outlets');
                }
            } catch (error) {
                showToast("Failed to load outlet details", "error");
                navigate('/outlets');
            } finally {
                setFetching(false);
            }
        };
        fetchOutlet();
    }, [id, fetchWithAuth, showToast, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.OUTLETS}${id}/`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (response.ok) {
                showToast("Outlet updated successfully!", "success");
                navigate(`/outlets/${id}`);
            } else {
                const err = await response.json().catch(() => ({}));
                showToast(err.detail || "Failed to update outlet", "error");
            }
        } catch (error) {
            console.error(error);
            showToast("Failed to update outlet", "error");
        } finally {
            setLoading(false);
        }
    };

    if (fetching) {
        return <div className="page-loading">Loading Outlet...</div>;
    }

    return (
        <div className="page-container" style={{ maxWidth: '600px' }}>
            <div className="page-header">
                <h1 className="page-title">Edit Outlet</h1>
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

                    <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input 
                            type="checkbox" 
                            checked={formData.is_active}
                            onChange={e => setFormData({...formData, is_active: e.target.checked})}
                            id="is_active_checkbox"
                        />
                        <label htmlFor="is_active_checkbox" style={{ marginBottom: 0 }}>Active</label>
                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => navigate(`/outlets/${id}`)}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
