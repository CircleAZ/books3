import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import { Plus, Edit2, Search, X } from 'lucide-react';
import '../../styles/components/modal-system.css';
import '../../styles/components/data-table.css';

export default function Transporters() {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [transporters, setTransporters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        vehicle_types: '',
        is_active: true
    });

    const fetchTransporters = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.PROCUREMENT_TRANSPORTERS}?search=${search}`);
            if (res.ok) {
                const data = await res.json();
                setTransporters(data.results || data);
            }
        } catch (error) {
            showToast("Failed to fetch transporters", 'error');
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, search]);

    useEffect(() => {
        fetchTransporters();
    }, [fetchTransporters]);

    const openModal = (transporter = null) => {
        if (transporter) {
            setEditingId(transporter.id);
            setFormData({
                name: transporter.name,
                contact_person: transporter.contact_person || '',
                phone: transporter.phone || '',
                email: transporter.email || '',
                vehicle_types: transporter.vehicle_types || '',
                is_active: transporter.is_active
            });
        } else {
            setEditingId(null);
            setFormData({
                name: '',
                contact_person: '',
                phone: '',
                email: '',
                vehicle_types: '',
                is_active: true
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const url = editingId 
                ? `${ENDPOINTS.PROCUREMENT_TRANSPORTERS}${editingId}/` 
                : ENDPOINTS.PROCUREMENT_TRANSPORTERS;
            
            const method = editingId ? 'PUT' : 'POST';
            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                showToast(`Transporter ${editingId ? 'updated' : 'added'} successfully!`, 'success');
                setIsModalOpen(false);
                fetchTransporters();
            } else {
                const err = await res.json();
                showToast(err.detail || 'Failed to save transporter', 'error');
            }
        } catch (error) {
            showToast('Network error. Please try again.', 'error');
        }
    };

    return (
        <div className="page-container fade-in">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 600 }}>Transporters</h1>
                    <p style={{ color: 'var(--color-text-muted)' }}>Manage logistics partners and fleet details.</p>
                </div>
{/* fallow-ignore-next-line code-duplication */}
                <button className="btn btn-primary" onClick={() => openModal()} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Plus size={18} /> Add Transporter
                </button>
            </div>

            <div className="data-controls" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
                <div className="search-bar" style={{ flex: 1, position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input 
                        type="text" 
                        placeholder="Search transporters by name, phone..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
                    />
                </div>
            </div>

            <div className="table-card">
                {loading ? (
                    <div style={{ padding: '4rem', textAlign: 'center' }}><div className="spinner-large"></div></div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Contact Person</th>
                                <th>Phone</th>
                                <th>Vehicle Types</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transporters.length > 0 ? (
                                transporters.map(t => (
                                    <tr key={t.id} className={!t.is_active ? 'inactive-row' : ''}>
                                        <td style={{ fontWeight: 500 }}>{t.name}</td>
                                        <td>{t.contact_person || '-'}</td>
                                        <td>{t.phone || '-'}</td>
                                        <td>{t.vehicle_types || '-'}</td>
                                        <td>
                                            <span className={`status-badge ${t.is_active ? 'active' : 'inactive'}`}>
                                                {t.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button className="btn-icon" onClick={() => openModal(t)}>
                                                <Edit2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                                        No transporters found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h2>{editingId ? 'Edit Transporter' : 'New Transporter'}</h2>
                            <button className="icon-btn" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <form id="transporter-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div className="form-group">
                                    <label>Company/Transporter Name *</label>
                                    <input type="text" className="form-control" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                                </div>
                                <div className="form-group">
                                    <label>Contact Person</label>
                                    <input type="text" className="form-control" value={formData.contact_person} onChange={e => setFormData({...formData, contact_person: e.target.value})} />
                                </div>
                                <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label>Phone</label>
                                        <input type="text" className="form-control" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                                    </div>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label>Email</label>
                                        <input type="email" className="form-control" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Vehicle Types (e.g. Mini Truck, Van)</label>
                                    <input type="text" className="form-control" value={formData.vehicle_types} onChange={e => setFormData({...formData, vehicle_types: e.target.value})} />
                                </div>
                                <div className="form-group checkbox-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                                    <input type="checkbox" id="t-active" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} />
                                    <label htmlFor="t-active">Active Transporter</label>
                                </div>
                            </form>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                            <button type="submit" form="transporter-form" className="btn btn-primary">Save Transporter</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
