import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import './EmployeeExpenses.css';

export default function EmployeeExpenses() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('');

    const profileData = localStorage.getItem('profile');
    const profile = profileData ? JSON.parse(profileData) : null;
    const userRole = profile?.role?.toLowerCase() || 'staff';
    const isManager = ['manager', 'owner'].includes(userRole);

    const fetchExpenses = useCallback(async () => {
        setLoading(true);
        try {
            const url = filterStatus
                ? `${ENDPOINTS.FINANCE_EMPLOYEE_EXPENSES}?status=${filterStatus}`
                : ENDPOINTS.FINANCE_EMPLOYEE_EXPENSES;

            const response = await fetchWithAuth(url);
            if (response.ok) {
                const data = await response.json();
                setExpenses(data.results || data || []);
            } else {
                console.error('Failed to fetch employee expenses');
            }
        } catch (error) {
            console.error('Error fetching employee expenses:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, filterStatus]);

    useEffect(() => {
        fetchExpenses();
    }, [fetchExpenses]);

    const handleAction = async (id, action) => {
        if (!window.confirm(`Are you sure you want to ${action} this expense?`)) return;

        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_EMPLOYEE_EXPENSES}${id}/${action}/`, {
                method: 'POST'
            });
            if (response.ok) {
                fetchExpenses();
            } else {
                alert(`Failed to ${action} expense`);
            }
        } catch (error) {
            console.error(`Error during ${action}:`, error);
        }
    };

    const getStatusClass = (status) => {
        switch (status?.toLowerCase()) {
            case 'pending': return 'status-pending';
            case 'approved': return 'status-approved';
            case 'rejected': return 'status-rejected';
            case 'reimbursed': return 'status-reimbursed';
            default: return '';
        }
    };

    return (
        <div className="employee-expenses-container fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Employee Expenses</h1>
                    <p className="page-subtitle">Track and manage employee expense claims</p>
                </div>
                <div className="page-actions">
                    <button className="btn btn-primary" onClick={() => navigate('/finance/employee-expenses/submit')}>
                        <span className="icon">➕</span> Submit New Expense
                    </button>
                </div>
            </div>

            <div className="expenses-controls glass-card">
                <div className="filter-group">
                    <label>Filter by Status</label>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="filter-select"
                    >
                        <option value="">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="reimbursed">Reimbursed</option>
                    </select>
                </div>
            </div>

            <div className="expenses-table-container glass-card">
                {loading ? (
                    <div className="loading-spinner">Loading...</div>
                ) : (
                    <table className="expenses-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Employee</th>
                                <th>Category</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {expenses.length > 0 ? (
                                expenses.map(expense => (
                                    <tr key={expense.id}>
                                        <td>{new Date(expense.date).toLocaleDateString()}</td>
                                        <td>{expense.employee_name}</td>
                                        <td>{expense.category_name}</td>
                                        <td className="amount">{currency}{Number(expense.amount).toLocaleString()}</td>
                                        <td>
                                            <span className={`status-badge ${getStatusClass(expense.status)}`}>
                                                {expense.status}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="action-buttons">
                                                {isManager && expense.status === 'pending' && (
                                                    <>
                                                        <button
                                                            className="btn-icon approve"
                                                            onClick={() => handleAction(expense.id, 'approve')}
                                                            title="Approve"
                                                        >
                                                            ✅
                                                        </button>
                                                        <button
                                                            className="btn-icon reject"
                                                            onClick={() => handleAction(expense.id, 'reject')}
                                                            title="Reject"
                                                        >
                                                            ❌
                                                        </button>
                                                    </>
                                                )}
                                                <button className="btn-icon" title="View Details">👁️</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" className="no-data">No expense claims found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
