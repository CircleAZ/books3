import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import './LenderList.css';

export default function LenderList() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();

    const [lenders, setLenders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        notes: ''
    });
    const [submitting, setSubmitting] = useState(false);

    const fetchLenders = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(ENDPOINTS.FINANCE_LENDERS);
            if (response.ok) {
                const data = await response.json();
                setLenders(data.results || data || []);
            } else {
                console.error('Failed to fetch lenders');
            }
        } catch (error) {
            console.error('Error fetching lenders:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchLenders();
    }, [fetchLenders]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const response = await fetchWithAuth(ENDPOINTS.FINANCE_LENDERS, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                setShowAddModal(false);
                setFormData({
                    name: '',
                    contact_person: '',
                    phone: '',
                    email: '',
                    address: '',
                    notes: ''
                });
                fetchLenders();
            } else {
                const errorData = await response.json();
                alert(`Error: ${JSON.stringify(errorData)}`);
            }
        } catch (error) {
            console.error('Error adding lender:', error);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="lender-container fade-in">
            <div className="lender-header">
                <div>
                    <p className="lender-subtitle">Manage financial lenders and institutions</p>
                </div>
                <div className="lender-actions">
                    <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                        + Add Lender
                    </button>
                </div>
            </div>

            <div className="lender-table-container glass-card">
                {loading ? (
                    <div className="loading-container">
                        <div className="spinner-large"></div>
                    </div>
                ) : (
                    <table className="lender-table">
                        <thead>
                            <tr>
                                <th>Lender Name</th>
                                <th>Contact Person</th>
                                <th>Phone</th>
                                <th>Email</th>
                                <th>Active Loans</th>
                                <th>Total Outstanding</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lenders.length > 0 ? (
                                lenders.map(lender => (
                                    <tr
                                        key={lender.id}
                                        className="clickable-row"
                                        onClick={() => navigate(`/finance/lenders/${lender.id}`)}
                                    >
                                        <td>
                                            <div className="lender-name-cell">
                                                <span className="lender-icon">🏦</span>
                                                <span className="lender-name">{lender.name}</span>
                                            </div>
                                        </td>
                                        <td>{lender.contact_person}</td>
                                        <td>{lender.phone}</td>
                                        <td>{lender.email}</td>
                                        <td>
                                            <span className="loan-count-badge">
                                                {lender.active_loans_count || 0}
                                            </span>
                                        </td>
                                        <td className="outstanding-amount">
                                            {currency}{Number(lender.total_outstanding || 0).toLocaleString()}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '3rem' }}>
                                        <div className="no-data">
                                            <span>🏦</span>
                                            <p>No lenders found. Add your first lender to get started.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {showAddModal && (
                <div className="modal-overlay">
                    <div className="modal-content glass-card fade-in">
                        <div className="modal-header">
                            <h2>Add New Lender</h2>
                            <button className="close-btn" onClick={() => setShowAddModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Lender Name *</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleInputChange}
                                        required
                                        placeholder="e.g. HDFC Bank"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Contact Person</label>
                                    <input
                                        type="text"
                                        name="contact_person"
                                        value={formData.contact_person}
                                        onChange={handleInputChange}
                                        placeholder="John Doe"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Phone</label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleInputChange}
                                        placeholder="+91 ..."
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Email</label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleInputChange}
                                        placeholder="contact@lender.com"
                                    />
                                </div>
                                <div className="form-group full-width">
                                    <label>Address</label>
                                    <textarea
                                        name="address"
                                        value={formData.address}
                                        onChange={handleInputChange}
                                        rows="2"
                                    ></textarea>
                                </div>
                                <div className="form-group full-width">
                                    <label>Notes</label>
                                    <textarea
                                        name="notes"
                                        value={formData.notes}
                                        onChange={handleInputChange}
                                        rows="2"
                                    ></textarea>
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Adding...' : 'Add Lender'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
