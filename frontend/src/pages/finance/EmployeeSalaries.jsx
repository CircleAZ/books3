import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import { useToast } from '../../context/ToastContext';
import './EmployeeSalaries.css';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import UniversalPaymentEngine from '../../components/common/UniversalPaymentEngine';

export default function EmployeeSalaries() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [salaries, setSalaries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showPayModal, setShowPayModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showViewPanel, setShowViewPanel] = useState(false);
    const [selectedSalary, setSelectedSalary] = useState(null);
    const [payData, setPayData] = useState({
        startDate: '',
        endDate: '',
        deductions: 0,
        bonuses: 0,
        notes: ''
    });
    const [paymentEnginePayload, setPaymentEnginePayload] = useState(null);
    const [editData, setEditData] = useState({
        base_amount: '',
        frequency: 'monthly',
        payment_day: 1,
        is_active: true
    });

    const fetchSalaries = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(ENDPOINTS.FINANCE_SALARIES);
            if (response.ok) {
                const data = await response.json();
                setSalaries(data.results || data || []);
            } else {
                console.error('Failed to fetch salaries');
            }
        } catch (error) {
            console.error('Error fetching salaries:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchSalaries();
    }, [fetchSalaries]);

    const openViewPanel = (salary) => {
        setSelectedSalary(salary);
        setShowViewPanel(true);
    };

    const openPayModal = (salary, e) => {
        if (e) e.stopPropagation();
        setSelectedSalary(salary);
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        setPayData({ startDate: start, endDate: end, deductions: 0, bonuses: 0, notes: '' });
        setPaymentEnginePayload(null);
        setShowPayModal(true);
    };

    // Banks & Wallets fetching removed. UniversalPaymentEngine handles it.

    const openEditModal = (salary, e) => {
        if (e) e.stopPropagation();
        setSelectedSalary(salary);
        setEditData({
            base_amount: salary.base_amount,
            frequency: salary.frequency,
            payment_day: salary.payment_day,
            is_active: salary.is_active
        });
        setShowEditModal(true);
    };

    const handlePaySubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_SALARIES}${selectedSalary.id}/pay/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...payData,
                    ...paymentEnginePayload
                })
            });
            if (response.ok) {
                setShowPayModal(false);
                fetchSalaries();
                showToast('Salary payment processed successfully', 'success');
            } else {
                showToast('Failed to process salary payment', 'error');
            }
        } catch (error) {
            console.error('Error paying salary:', error);
        }
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_SALARIES}${selectedSalary.id}/`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editData)
            });
            if (response.ok) {
                setShowEditModal(false);
                setShowViewPanel(false);
                fetchSalaries();
            } else {
                const err = await response.json();
                showToast(`Error: ${JSON.stringify(err)}`, 'error');
            }
        } catch (error) {
            console.error('Error updating salary:', error);
        }
    };

    return (
        <div className="employee-salaries-container fade-in">
            <div className="page-header">
                <div>
                    <p className="page-subtitle">Manage payroll and salary information</p>
                </div>
            </div>

            <div className="salaries-table-container glass-card">
                {loading ? (
                    <LoadingSpinner />
                ) : (
// fallow-ignore-next-line code-duplication
                    <table className="salaries-table">
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Base Amount</th>
                                <th>Frequency</th>
                                <th>Payment Day</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {salaries.length > 0 ? (
                                salaries.map(salary => (
                                    <tr
                                        key={salary.id}
                                        className="clickable-row"
                                        onClick={() => openViewPanel(salary)}
                                    >
                                        <td className="emp-name">{salary.employee_name}</td>
                                        <td className="amount">{currency}{Number(salary.base_amount).toLocaleString()}</td>
                                        <td className="capitalize">{salary.frequency}</td>
                                        <td>Day {salary.payment_day}</td>
                                        <td>
                                            <span className={`status-badge ${salary.is_active ? 'status-paid' : 'status-unpaid'}`}>
                                                {salary.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="action-buttons" onClick={e => e.stopPropagation()}>
                                                <button
                                                    className="btn btn-sm btn-primary"
                                                    onClick={(e) => openPayModal(salary, e)}
                                                >
                                                    Pay
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-ghost"
                                                    onClick={(e) => openEditModal(salary, e)}
                                                >
                                                    Edit
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" className="no-data">No salary records found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* View Panel */}
            {showViewPanel && selectedSalary && (
                <div className="modal-overlay" onClick={() => setShowViewPanel(false)}>
                    <div className="modal glass-card" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{selectedSalary.employee_name}</h2>
                            <button className="close-btn" onClick={() => setShowViewPanel(false)}>×</button>
                        </div>
                        <div className="view-details">
                            <div className="detail-row">
                                <span className="detail-label">Base Salary</span>
                                <span className="detail-value">{currency}{Number(selectedSalary.base_amount).toLocaleString()}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Frequency</span>
                                <span className="detail-value capitalize">{selectedSalary.frequency}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Payment Day</span>
                                <span className="detail-value">Day {selectedSalary.payment_day}</span>
                            </div>
                            <div className="detail-row">
                                <span className="detail-label">Status</span>
                                <span className={`status-badge ${selectedSalary.is_active ? 'status-paid' : 'status-unpaid'}`}>
                                    {selectedSalary.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            {selectedSalary.bank_name && (
                                <div className="detail-row">
                                    <span className="detail-label">Bank</span>
                                    <span className="detail-value">{selectedSalary.bank_name}</span>
                                </div>
                            )}
                            {selectedSalary.bank_account && (
                                <div className="detail-row">
                                    <span className="detail-label">Account</span>
                                    <span className="detail-value">{selectedSalary.bank_account}</span>
                                </div>
                            )}

                            {/* Recent Payments */}
                            {selectedSalary.recent_payments?.length > 0 && (
                                <div className="recent-payments-section">
                                    <h4>Recent Payments</h4>
                                    {selectedSalary.recent_payments.map(p => (
                                        <div key={p.id} className="payment-item">
                                            <span>{new Date(p.payment_date).toLocaleDateString()}</span>
                                            <span>{currency}{Number(p.net_amount).toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => navigate(`/finance/salaries/${selectedSalary.id}/history`)}>
                                View History
                            </button>
                            <button className="btn btn-ghost" onClick={() => { setShowViewPanel(false); openEditModal(selectedSalary); }}>
                                Edit
                            </button>
                            <button className="btn btn-primary" onClick={() => { setShowViewPanel(false); openPayModal(selectedSalary); }}>
                                Pay Salary
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Salary Modal */}
            {showEditModal && selectedSalary && (
                <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
                    <div className="modal glass-card" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Edit Salary — {selectedSalary.employee_name}</h2>
                            <button className="close-btn" onClick={() => setShowEditModal(false)}>×</button>
                        </div>
                        <form onSubmit={handleEditSubmit}>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Base Amount ({currency})</label>
                                    <input
                                        type="number"
                                        value={editData.base_amount}
                                        onChange={e => setEditData({ ...editData, base_amount: e.target.value })}
                                        min="0"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Frequency</label>
                                    <select
                                        value={editData.frequency}
                                        onChange={e => setEditData({ ...editData, frequency: e.target.value })}
                                    >
                                        <option value="monthly">Monthly</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="biweekly">Bi-Weekly</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Payment Day</label>
                                    <input
                                        type="number"
                                        value={editData.payment_day}
                                        onChange={e => setEditData({ ...editData, payment_day: parseInt(e.target.value) || 1 })}
                                        min="1"
                                        max="31"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Status</label>
                                    <select
                                        value={editData.is_active ? 'active' : 'inactive'}
                                        onChange={e => setEditData({ ...editData, is_active: e.target.value === 'active' })}
                                    >
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowEditModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Pay Salary Modal */}
            {showPayModal && (
                <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
                    <div className="modal glass-card" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Pay Salary — {selectedSalary?.employee_name}</h2>
                            <button className="close-btn" onClick={() => setShowPayModal(false)}>×</button>
                        </div>
                        <form onSubmit={handlePaySubmit}>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Period Start Date</label>
                                    <input
                                        type="date"
                                        value={payData.startDate}
                                        onChange={e => setPayData({ ...payData, startDate: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Period End Date</label>
                                    <input
                                        type="date"
                                        value={payData.endDate}
                                        onChange={e => setPayData({ ...payData, endDate: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Deductions ({currency})</label>
                                    <input
                                        type="number"
                                        value={payData.deductions}
                                        onChange={e => setPayData({ ...payData, deductions: e.target.value })}
                                        min="0"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Bonuses ({currency})</label>
                                    <input
                                        type="number"
                                        value={payData.bonuses}
                                        onChange={e => setPayData({ ...payData, bonuses: e.target.value })}
                                        min="0"
                                    />
                                </div>
                            </div>
                            
                            <UniversalPaymentEngine
                                transactionType="outflow"
                                allowedMethods={['bank', 'cash']}
                                hideAmount={true}
                                onValidPayload={setPaymentEnginePayload}
                            />
                            
                            <div className="form-group full-width">
                                <label>Notes</label>
                                <textarea
                                    value={payData.notes}
                                    onChange={e => setPayData({ ...payData, notes: e.target.value })}
                                    rows="2"
                                    placeholder="Add payment notes..."
                                ></textarea>
                            </div>

                            <div className="salary-payment-summary">
                                <div className="summary-row">
                                    <span>Base Salary:</span>
                                    <span>{currency}{Number(selectedSalary?.base_amount).toLocaleString()}</span>
                                </div>
                                <div className="summary-row">
                                    <span>Bonuses:</span>
                                    <span className="text-success">+{currency}{Number(payData.bonuses || 0).toLocaleString()}</span>
                                </div>
                                <div className="summary-row">
                                    <span>Deductions:</span>
                                    <span className="text-danger">-{currency}{Number(payData.deductions || 0).toLocaleString()}</span>
                                </div>
                                <div className="summary-row total">
                                    <span>Net Payable:</span>
                                    <span>{currency}{Number(
                                        Number(selectedSalary?.base_amount || 0) +
                                        Number(payData.bonuses || 0) -
                                        Number(payData.deductions || 0)
                                    ).toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowPayModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={!paymentEnginePayload}>Process Payment</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
