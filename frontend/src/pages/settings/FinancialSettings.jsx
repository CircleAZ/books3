import React, { useState, useEffect } from 'react';

import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './FinancialSettings.css';
import '../settings/SettingsIndex.css';

const FinancialSettings = () => {
    const { fetchWithAuth } = useAuth();

    const [taxes, setTaxes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showTaxModal, setShowTaxModal] = useState(false);
    const [newTax, setNewTax] = useState({ name: '', percentage: '', is_default: false });

    useEffect(() => {
        fetchTaxes();
    }, []);

    const fetchTaxes = async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_TAXES}`);
            if (response.ok) {
                const data = await response.json();
                setTaxes(data.results || data);
            }
        } catch (error) {
            console.error('Error fetching taxes:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddTax = async (e) => {
        e.preventDefault();
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_TAXES}`, {
                method: 'POST',
                body: JSON.stringify(newTax)
            });
            if (response.ok) {
                fetchTaxes();
                setShowTaxModal(false);
                setNewTax({ name: '', percentage: '', is_default: false });
            }
        } catch (error) {
            console.error('Error adding tax:', error);
        }
    };

    const handleDeleteTax = async (id) => {
        if (!confirm('Are you sure you want to delete this tax rate?')) return;
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_TAXES}${id}/`, {
                method: 'DELETE'
            });
            if (response.ok) {
                fetchTaxes();
            }
        } catch (error) {
            console.error('Error deleting tax:', error);
        }
    };

    const handleSetDefault = async (tax) => {
        if (tax.is_default) return;
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.SETTINGS_TAXES}${tax.id}/`, {
                method: 'PATCH',
                body: JSON.stringify({ is_default: true })
            });
            if (response.ok) {
                fetchTaxes();
            }
        } catch (error) {
            console.error('Error updating tax:', error);
        }
    };

    if (loading) return <div>Loading Financial Settings...</div>;

    return (
        <div className="financial-settings-container">


            <div className="settings-grid">
                <section className="settings-card">
                    <div className="card-header">
                        <h2>Tax Rates</h2>
                        <button className="btn btn-sm btn-primary" onClick={() => setShowTaxModal(true)}>+ Add Tax</button>
                    </div>
                    <div className="card-body">
                        <table className="settings-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Rate (%)</th>
                                    <th>Default</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {taxes.map(tax => (
                                    <tr key={tax.id}>
                                        <td>{tax.name}</td>
                                        <td>{tax.percentage}%</td>
                                        <td>
                                            <input
                                                type="radio"
                                                name="default_tax"
                                                checked={tax.is_default}
                                                onChange={() => handleSetDefault(tax)}
                                            />
                                        </td>
                                        <td>
                                            <button className="btn-icon danger" onClick={() => handleDeleteTax(tax.id)}>Delete</button>
                                        </td>
                                    </tr>
                                ))}
                                {taxes.length === 0 && <tr><td colSpan="4" className="text-center">No tax rates defined</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="settings-card">
                    <div className="card-header">
                        <h2>Payment Methods</h2>
                    </div>
                    <div className="card-body">
                        <div className="placeholder-info">
                            <p>Manage payment methods (Cash, UPI, Card) and UPI account configurations.</p>
                            <a href="/settings/payments" className="btn btn-primary">Manage Payment Methods →</a>
                        </div>
                    </div>
                </section>
            </div>

            {showTaxModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Add New Tax Rate</h3>
                        <form onSubmit={handleAddTax}>
                            <div className="form-group">
                                <label>Tax Name (e.g., GST 18%)</label>
                                <input
                                    value={newTax.name}
                                    onChange={(e) => setNewTax({ ...newTax, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Percentage (%)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={newTax.percentage}
                                    onChange={(e) => setNewTax({ ...newTax, percentage: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-check">
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={newTax.is_default}
                                        onChange={(e) => setNewTax({ ...newTax, is_default: e.target.checked })}
                                    />
                                    Set as Default Tax
                                </label>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowTaxModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Tax</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinancialSettings;
