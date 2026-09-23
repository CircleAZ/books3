import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import useServerList from '../../hooks/useServerList';
import Pagination from '../../components/common/Pagination';
import SearchTokenPalette from '../../components/common/SearchTokenPalette';
import './ExpenseList.css';

export default function ExpenseList() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();

    // Filter options (independent data fetch — not part of list hook)
    const [categories, setCategories] = useState([]);

    const {
        data: expenses,
        loading,
        totalPages,
        page,
        setPage,
        filters,
        setFilter,
        search,
        setSearch,
    } = useServerList(ENDPOINTS.FINANCE_EXPENSES, {
        filterConfig: { category: '', status: '', startDate: '', endDate: '' },
        debounceMs: 300,
        buildParams: (debouncedSearch, f) => new URLSearchParams({
            search: debouncedSearch,
            category: f.category,
            payment_status: f.status,
            start_date: f.startDate,
            end_date: f.endDate,
        }),
    });

    const toggleSearchToken = (token) => {
        const current = (search || '').trim();
        const regex = new RegExp(`(^|\\s)${token.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1")}($|\\s)`, 'i');
        if (regex.test(current)) {
            const next = current.replace(regex, ' ').replace(/\s+/g, ' ').trim();
            setSearch(next);
        } else {
            const next = current ? `${current} ${token}` : token;
            setSearch(next);
        }
    };

    const isApprovalPending = /(^|\s)approval:pending($|\s)/i.test(search || '');
    const isHighValue = /(^|\s)high_value:true($|\s)/i.test(search || '');
    const isUnpaid = /(^|\s)status:unpaid($|\s)/i.test(search || '');
    const isPaid = /(^|\s)status:paid($|\s)/i.test(search || '');

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
        fetchCategories();
    }, [fetchCategories]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilter(name, value);
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

            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                marginBottom: '1rem',
                padding: '1rem',
                background: 'var(--color-surface-raised, var(--color-surface, #1e1e2e))',
                borderRadius: '12px',
                border: '1px solid var(--color-border-light, #313244)',
            }}>
                <SearchTokenPalette
                    value={search}
                    onChange={setSearch}
                    placeholder="Search expenses: payee:..., category:..., status:unpaid, amount:>5000, high_value:true..."
                    suggestionsEndpoint={ENDPOINTS.FINANCE_EXPENSES_SUGGESTIONS}
                />

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                        type="button"
                        className={`btn btn-sm ${isApprovalPending ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => toggleSearchToken('approval:pending')}
                    >
                        {isApprovalPending ? '✕ Needs Approval' : 'Needs Approval'}
                    </button>
                    <button
                        type="button"
                        className={`btn btn-sm ${isHighValue ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => toggleSearchToken('high_value:true')}
                    >
                        {isHighValue ? '✕ High Value' : 'High Value (>₹5,000)'}
                    </button>
                    <button
                        type="button"
                        className={`btn btn-sm ${isUnpaid ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => toggleSearchToken('status:unpaid')}
                    >
                        {isUnpaid ? '✕ Unpaid' : 'Unpaid Expenses'}
                    </button>
                    <button
                        type="button"
                        className={`btn btn-sm ${isPaid ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => toggleSearchToken('status:paid')}
                    >
                        {isPaid ? '✕ Fully Paid' : 'Fully Paid'}
                    </button>
                    {search && (
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => setSearch('')}
                            style={{ marginLeft: 'auto' }}
                        >
                            ✕ Clear Search
                        </button>
                    )}
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

                <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                />
            </div>
        </div>
    );
}
