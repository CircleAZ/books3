import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import './EmployeeSalaries.css';

export default function EmployeeSalaries() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();
    const [salaries, setSalaries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showPayModal, setShowPayModal] = useState(false);
    const [selectedSalary, setSelectedSalary] = useState(null);
    const [payData, setPayData] = useState({
        startDate: '',
        endDate: '',
        deductions: 0,
        bonuses: 0,
        notes: ''
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

    const openPayModal = (salary) => {
        setSelectedSalary(salary);
        // Default period: current month
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        setPayData({
            startDate: start,
            endDate: end,
            deductions: 0,
            bonuses: 0,
            notes: ''
        });
        setShowPayModal(true);
    };

    const handlePaySubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_SALARIES}${selectedSalary.id}/pay/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payData)
            });

            if (response.ok) {
                setShowPayModal(false);
                fetchSalaries();
                alert('Salary payment processed successfully');
            } else {
                alert('Failed to process salary payment');
            }
        } catch (error) {
            console.error('Error paying salary:', error);
        }
    };

    return (
        <div className="employee-salaries-container fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Employee Salaries</h1>
                    <p className="page-subtitle">Manage payroll and salary information</p>
                </div>
            </div>

            <div className="salaries-table-container glass-card">
                {loading ? (
                    <div className="loading-spinner">Loading...</div>
                ) : (
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
                                    <tr key={salary.id}>
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
                                            <div className="action-buttons">
                                                <button
                                                    className="btn btn-sm btn-primary"
                                                    onClick={() => openPayModal(salary)}
                                                >
                                                    Pay Salary
                                                </button>
                                                <button className="btn-link" onClick={() => navigate(`/finance/salaries/${salary.id}/history`)}>
                                                    View History
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

            {showPayModal && (
                <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
                    <div className="modal glass-card" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Pay Salary - {selectedSalary?.employee_name}</h2>
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
                            <div className="form-group full-width">
                                <label>Notes</label>
                                <textarea
                                    value={payData.notes}
                                    onChange={e => setPayData({ ...payData, notes: e.target.value })}
                                    rows="3"
                                    placeholder="Add payment notes..."
                                ></textarea>
                            </div>

                            <div className="payment-summary">
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
                                <button type="submit" className="btn btn-primary">Process Payment</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
