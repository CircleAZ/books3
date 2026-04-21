import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import './LenderDetails.css';

export default function LenderDetails() {
    const { id } = useParams();
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();

    const [lender, setLender] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showAddLoanModal, setShowAddLoanModal] = useState(false);
    const [showEditLenderModal, setShowEditLenderModal] = useState(false);
    const [loanFormData, setLoanFormData] = useState({
        principal_amount: '',
        interest_rate: '',
        term_months: '',
        start_date: new Date().toISOString().split('T')[0],
        notes: ''
    });
    const [editLenderData, setEditLenderData] = useState({
        name: '', contact_person: '', phone: '', email: '', address: '', notes: ''
    });
    const [submitting, setSubmitting] = useState(false);

    const fetchLenderDetails = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_LENDERS}${id}/`);
            if (response.ok) {
                const data = await response.json();
                setLender(data);
            } else {
                console.error('Failed to fetch lender details');
            }
        } catch (error) {
            console.error('Error fetching lender details:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, id]);

    useEffect(() => {
        fetchLenderDetails();
    }, [fetchLenderDetails]);

    const handleLoanInputChange = (e) => {
        const { name, value } = e.target;
        setLoanFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleAddLoan = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const response = await fetchWithAuth(ENDPOINTS.FINANCE_LOANS, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...loanFormData,
                    lender: id
                })
            });

            if (response.ok) {
                setShowAddLoanModal(false);
                setLoanFormData({
                    principal_amount: '',
                    interest_rate: '',
                    term_months: '',
                    start_date: new Date().toISOString().split('T')[0],
                    notes: ''
                });
                fetchLenderDetails();
            } else {
                const errorData = await response.json();
                alert(`Error: ${JSON.stringify(errorData)}`);
            }
        } catch (error) {
            console.error('Error adding loan:', error);
        } finally {
            setSubmitting(false);
        }
    };

    const openEditLender = () => {
        setEditLenderData({
            name: lender.name || '',
            contact_person: lender.contact_person || '',
            phone: lender.phone || '',
            email: lender.email || '',
            address: lender.address || '',
            notes: lender.notes || ''
        });
        setShowEditLenderModal(true);
    };

    const handleEditLender = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_LENDERS}${id}/`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editLenderData)
            });
            if (response.ok) {
                setShowEditLenderModal(false);
                fetchLenderDetails();
            } else {
                const errorData = await response.json();
                alert(`Error: ${JSON.stringify(errorData)}`);
            }
        } catch (error) {
            console.error('Error updating lender:', error);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner-large"></div>
            </div>
        );
    }

    if (!lender) {
        return <div className="error-message">Lender not found</div>;
    }

    return (
        <div className="lender-details-container fade-in">
            <div className="lender-details-header">
                <div className="header-left">
                    <div>
                        <h1 className="lender-title">{lender.name}</h1>
                        <div className="lender-meta">
                            <span>👤 {lender.contact_person}</span>
                            <span>📞 {lender.phone}</span>
                            <span>📧 {lender.email}</span>
                        </div>
                    </div>
                </div>
                <div className="header-actions">
                    <button className="btn btn-ghost" onClick={openEditLender}>Edit Lender</button>
                    <button className="btn btn-primary" onClick={() => setShowAddLoanModal(true)}>+ New Loan</button>
                </div>
            </div>

            <div className="summary-cards">
                <div className="summary-card glass-card">
                    <span className="summary-label">Total Loans</span>
                    <span className="summary-value">{lender.total_loans || 0}</span>
                </div>
                <div className="summary-card glass-card">
                    <span className="summary-label">Active Loans</span>
                    <span className="summary-value">{lender.active_loans?.length || 0}</span>
                </div>
                <div className="summary-card glass-card highlighted">
                    <span className="summary-label">Total Outstanding</span>
                    <span className="summary-value">{currency}{Number(lender.total_outstanding || 0).toLocaleString()}</span>
                </div>
            </div>

            <div className="loans-section">
                <h2 className="section-title">Loans History</h2>
                <div className="loans-table-container glass-card">
                    <table className="loans-table">
                        <thead>
                            <tr>
                                <th>Loan #</th>
                                <th>Principal</th>
                                <th>Interest Rate</th>
                                <th>Start Date</th>
                                <th>Total Paid</th>
                                <th>Balance Due</th>
                                <th>Progress</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lender.loans && lender.loans.length > 0 ? (
                                lender.loans.map(loan => {
                                    const progress = Math.min(100, (loan.total_paid / (loan.principal_amount + (loan.interest_amount || 0))) * 100) || 0;
                                    return (
                                        <tr
                                            key={loan.id}
                                            className="clickable-row"
                                            onClick={() => navigate(`/finance/loans/${loan.id}`)}
                                        >
                                            <td className="loan-number">{loan.loan_number}</td>
                                            <td>{currency}{Number(loan.principal_amount).toLocaleString()}</td>
                                            <td>{loan.interest_rate}%</td>
                                            <td>{new Date(loan.start_date).toLocaleDateString()}</td>
                                            <td>{currency}{Number(loan.total_paid || 0).toLocaleString()}</td>
                                            <td className="balance-due">{currency}{Number(loan.balance_due || 0).toLocaleString()}</td>
                                            <td>
                                                <div className="progress-container">
                                                    <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                                                    <span className="progress-text">{Math.round(progress)}%</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`status-badge status-${loan.status?.toLowerCase()}`}>
                                                    {loan.status}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan="8" style={{ textAlign: 'center', padding: '3rem' }}>
                                        No loans recorded for this lender.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showAddLoanModal && (
                <div className="modal-overlay">
                    <div className="modal-content glass-card fade-in">
                        <div className="modal-header">
                            <h2>Add New Loan</h2>
                            <button className="close-btn" onClick={() => setShowAddLoanModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleAddLoan}>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Principal Amount ({currency}) *</label>
                                    <input
                                        type="number"
                                        name="principal_amount"
                                        value={loanFormData.principal_amount}
                                        onChange={handleLoanInputChange}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Interest Rate (%) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        name="interest_rate"
                                        value={loanFormData.interest_rate}
                                        onChange={handleLoanInputChange}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Term (Months) *</label>
                                    <input
                                        type="number"
                                        name="term_months"
                                        value={loanFormData.term_months}
                                        onChange={handleLoanInputChange}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Start Date *</label>
                                    <input
                                        type="date"
                                        name="start_date"
                                        value={loanFormData.start_date}
                                        onChange={handleLoanInputChange}
                                        required
                                    />
                                </div>
                                <div className="form-group full-width">
                                    <label>Notes</label>
                                    <textarea
                                        name="notes"
                                        value={loanFormData.notes}
                                        onChange={handleLoanInputChange}
                                        rows="3"
                                    ></textarea>
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowAddLoanModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Creating...' : 'Create Loan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {showEditLenderModal && (
                <div className="modal-overlay">
                    <div className="modal-content glass-card fade-in">
                        <div className="modal-header">
                            <h2>Edit Lender</h2>
                            <button className="close-btn" onClick={() => setShowEditLenderModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleEditLender}>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Name *</label>
                                    <input
                                        type="text"
                                        value={editLenderData.name}
                                        onChange={e => setEditLenderData(prev => ({ ...prev, name: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Contact Person</label>
                                    <input
                                        type="text"
                                        value={editLenderData.contact_person}
                                        onChange={e => setEditLenderData(prev => ({ ...prev, contact_person: e.target.value }))}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Phone</label>
                                    <input
                                        type="text"
                                        value={editLenderData.phone}
                                        onChange={e => setEditLenderData(prev => ({ ...prev, phone: e.target.value }))}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Email</label>
                                    <input
                                        type="email"
                                        value={editLenderData.email}
                                        onChange={e => setEditLenderData(prev => ({ ...prev, email: e.target.value }))}
                                    />
                                </div>
                                <div className="form-group full-width">
                                    <label>Address</label>
                                    <textarea
                                        value={editLenderData.address}
                                        onChange={e => setEditLenderData(prev => ({ ...prev, address: e.target.value }))}
                                        rows="2"
                                    ></textarea>
                                </div>
                                <div className="form-group full-width">
                                    <label>Notes</label>
                                    <textarea
                                        value={editLenderData.notes}
                                        onChange={e => setEditLenderData(prev => ({ ...prev, notes: e.target.value }))}
                                        rows="2"
                                    ></textarea>
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowEditLenderModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
