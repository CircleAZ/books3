import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import './ExpenseList.css';

export default function ExpenseList() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();

    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Filter options
    const [categories, setCategories] = useState([]);
    const [filters, setFilters] = useState({
        category: '',
        status: '',
        startDate: '',
        endDate: ''
    });

    const fetchExpenses = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page,
                category: filters.category,
                payment_status: filters.status,
                start_date: filters.startDate,
                end_date: filters.endDate
            });

            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_EXPENSES}?${queryParams.toString()}`);
            if (response.ok) {
                const data = await response.json();
                setExpenses(data.results || []);
                setTotalPages(Math.ceil((data.count || 0) / (data.page_size || 10)));
            } else {
                console.error('Failed to fetch expenses');
            }
        } catch (error) {
            console.error('Error fetching expenses:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, page, filters]);

    const fetchCategories = useCallback(async () => {
        try {
            const response = await fetchWithAuth(ENDPOINTS.FINANCE_EXPENSE_CATEGORIES);
            if (response.ok) {
                const data = await response.json();
                setCategories(data.results || data || []);
            }
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchExpenses();
    }, [fetchExpenses]);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
        setPage(1);
    };

    const getStatusClass = (status) => {
        switch (status?.toLowerCase()) {
            case 'paid': return 'status-paid';
            case 'partial': return 'status-partial';
            case 'unpaid': return 'status-unpaid';
            default: return '';
        }
    };

    return (
        <div className="expense-container fade-in">
            <div className="expense-header">
                <div>
                    <p className="expense-subtitle">Manage and track your company expenses</p>
                </div>
                <div className="expense-actions">
                    <button className="btn btn-primary" onClick={() => navigate('/finance/expenses/add')}>
                        + Add Expense
                    </button>
                </div>
            </div>

            <div className="expense-controls glass-card">
                <div className="filter-group">
                    <label>Category</label>
                    <select
                        className="filter-select"
                        name="category"
                        value={filters.category}
                        onChange={handleFilterChange}
                    >
                        <option value="">All Categories</option>
                        {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </select>
                </div>

                <div className="filter-group">
                    <label>Status</label>
                    <select
                        className="filter-select"
                        name="status"
                        value={filters.status}
                        onChange={handleFilterChange}
                    >
                        <option value="">All Statuses</option>
                        <option value="paid">Paid</option>
                        <option value="partial">Partial</option>
                        <option value="unpaid">Unpaid</option>
                    </select>
                </div>

                <div className="filter-group">
                    <label>From Date</label>
                    <input
                        type="date"
                        className="filter-input"
                        name="startDate"
                        value={filters.startDate}
                        onChange={handleFilterChange}
                    />
                </div>

                <div className="filter-group">
                    <label>To Date</label>
                    <input
                        type="date"
                        className="filter-input"
                        name="endDate"
                        value={filters.endDate}
                        onChange={handleFilterChange}
                    />
                </div>
            </div>

            <div className="expense-table-container glass-card">
                {loading ? (
                    <div className="loading-container">
                        <div className="spinner-large"></div>
                    </div>
                ) : (
                    <>
                        <table className="expense-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Payee</th>
                                    <th>Category</th>
                                    <th>Amount</th>
                                    <th>Tax</th>
                                    <th>Total</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expenses.length > 0 ? (
                                    expenses.map(expense => (
                                        <tr key={expense.id} className="clickable-row" onClick={() => navigate(`/finance/expenses/${expense.id}`)}>
                                            <td>{new Date(expense.date).toLocaleDateString()}</td>
                                            <td>
                                                <div className="payee-info">
                                                    <span className="payee-name">{expense.payee_name}</span>
                                                    <span className="payee-type">{expense.payee_type}</span>
                                                </div>
                                            </td>
                                            <td>{expense.category_name || 'Uncategorized'}</td>
                                            <td>{currency}{Number(expense.amount).toLocaleString()}</td>
                                            <td>{currency}{Number(expense.tax_amount || 0).toLocaleString()}</td>
                                            <td className="total-amount">{currency}{Number(expense.total_amount).toLocaleString()}</td>
                                            <td>
                                                <span className={`status-badge ${getStatusClass(expense.payment_status)}`}>
                                                    {expense.payment_status}
                                                </span>
                                            </td>
                                            <td onClick={(e) => e.stopPropagation()}>
                                                <button className="btn-icon" title="View Details">👁️</button>
                                                <button className="btn-icon" title="Edit">✏️</button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="8" style={{ textAlign: 'center', padding: '3rem' }}>
                                            <div className="no-data">
                                                <span>📂</span>
                                                <p>No expenses found matching your filters.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </>
                )}

                <div className="pagination-controls">
                    <span className="page-info">
                        Page {page} of {totalPages || 1}
                    </span>
                    <div className="pagination-buttons">
                        <button
                            className="btn btn-ghost"
                            disabled={page <= 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                        >
                            Previous
                        </button>
                        <button
                            className="btn btn-ghost"
                            disabled={page >= totalPages}
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
