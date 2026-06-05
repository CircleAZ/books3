import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';

import '../../styles/components/form-layout.css';
import '../../styles/components/modal-system.css';
export default function CategoryModal({ isOpen, onClose, category, onSuccess }) {
    const { fetchWithAuth } = useAuth();
    const [formData, setFormData] = useState({ name: '', description: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (category) {
                setFormData({ name: category.name, description: category.description });
            } else {
                setFormData({ name: '', description: '' });
            }
            setError('');
        }
    }, [isOpen, category]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const url = category
            ? `${ENDPOINTS.INVENTORY_CATEGORIES}${category.id}/`
            : ENDPOINTS.INVENTORY_CATEGORIES;

        const method = category ? 'PUT' : 'POST';

        try {
            const response = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
// fallow-ignore-next-line code-duplication
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                const data = await response.json();
                onSuccess(data);
                onClose();
            } else {
                const data = await response.json();
                setError(data.detail || 'Failed to save category');
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
            <div className="modal-content">
// fallow-ignore-next-line code-duplication
                <h2>{category ? 'Edit Category' : 'Add Category'}</h2>
                {error && <div className="error-message">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Name</label>
// fallow-ignore-next-line code-duplication
                        <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>
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
