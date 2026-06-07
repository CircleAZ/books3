import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import { Filter, ChevronUp, ChevronDown } from 'lucide-react';
import './BankTransactions.css';

export default function BankTransactions() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();

    const [transactions, setTransactions] = useState([]);
// fallow-ignore-next-line code-duplication
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [showFilters, setShowFilters] = useState(window.innerWidth > 768);

    const [filters, setFilters] = useState({
        account: '',
        type: '',
        startDate: '',
        endDate: '',
        reconciled: ''
    });

    const fetchTransactions = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page,
                account: filters.account,
                transaction_type: filters.type,
                start_date: filters.startDate,
                end_date: filters.endDate,
                is_reconciled: filters.reconciled
            });

// fallow-ignore-next-line code-duplication
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_BANK_TRANSACTIONS}?${queryParams.toString()}`);
            if (response.ok) {
                const data = await response.json();
                setTransactions(data.results || []);
                setTotalPages(Math.ceil((data.count || 0) / (data.page_size || 10)));
            }
        } catch (error) {
            console.error('Error fetching transactions:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, page, filters]);

    const fetchAccounts = useCallback(async () => {
        try {
            const response = await fetchWithAuth(ENDPOINTS.FINANCE_BANK_ACCOUNTS);
            if (response.ok) {
                const data = await response.json();
                setAccounts(data.results || data || []);
            }
        } catch (error) {
            console.error('Error fetching accounts:', error);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
        setPage(1);
    };

    const handleReconcile = async (id) => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_BANK_TRANSACTIONS}${id}/reconcile/`, {
                method: 'POST'
            });
            if (response.ok) {
                fetchTransactions();
            }
        } catch (error) {
            console.error('Error reconciling transaction:', error);
        }
    };

    const getTypeColor = (type) => {
        switch (type?.toLowerCase()) {
            case 'deposit': return '#4ade80';
            case 'withdrawal': return '#f87171';
            case 'transfer': return '#60a5fa';
            default: return 'inherit';
        }
    };

    return (
        <div className="transactions-container fade-in">
            <div className="transactions-header" style={{ justifyContent: 'flex-end' }}>
                <div className="transactions-actions">
                    <button className="btn btn-manage-accounts" onClick={() => navigate('/finance/banking')}>
                        Manage Accounts
                    </button>
                    <button className="btn btn-primary" onClick={() => navigate('/finance/banking/record')}>
                        Record Transaction
                    </button>
                </div>
            </div>

            <div className="filter-collapsible-wrapper">
                <button
                    className="btn filter-toggle-btn glass-card"
                    onClick={() => setShowFilters(!showFilters)}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Filter size={18} />
                        <span>Filter Transactions</span>
                    </div>
                    {showFilters ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {showFilters && (
                    <div className="transactions-controls glass-card">
                        <div className="filter-group">
                            <label>Account</label>
                    <select
                        className="filter-select"
                        name="account"
                        value={filters.account}
                        onChange={handleFilterChange}
                    >
                        <option value="">All Accounts</option>
                        {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                    </select>
                </div>

                <div className="filter-group">
                    <label>Type</label>
                    <select
                        className="filter-select"
                        name="type"
                        value={filters.type}
                        onChange={handleFilterChange}
                    >
                        <option value="">All Types</option>
                        <option value="deposit">Deposit</option>
                        <option value="withdrawal">Withdrawal</option>
                        <option value="transfer">Transfer</option>
                    </select>
                </div>

                <div className="filter-group">
                    <label>Reconciled</label>
                    <select
                        className="filter-select"
                        name="reconciled"
                        value={filters.reconciled}
                        onChange={handleFilterChange}
                    >
                        <option value="">All</option>
                        <option value="true">Reconciled</option>
                        <option value="false">Pending</option>
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
            </div>
            )}
            </div>

            <div className="transactions-table-container glass-card">
                {loading ? (
                    <div className="loading-container">
                        <div className="spinner-large"></div>
                    </div>
                ) : (
                    <>
                        <table className="transactions-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Account</th>
                                    <th>Type</th>
                                    <th>Amount</th>
                                    <th>Description</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.length > 0 ? (
                                    transactions.map(tx => (
                                        <tr key={tx.id}>
                                            <td>{new Date(tx.date).toLocaleDateString()}</td>
                                            <td>{tx.account_name}</td>
                                            <td>
                                                <span
                                                    className="type-badge"
                                                    style={{ color: getTypeColor(tx.transaction_type), borderColor: getTypeColor(tx.transaction_type) }}
                                                >
                                                    {tx.transaction_type}
                                                </span>
                                            </td>
                                            <td className="amount-cell" style={{ color: getTypeColor(tx.transaction_type) }}>
                                                {tx.transaction_type === 'withdrawal' ? '-' : '+'}
                                                {currency}{Number(tx.amount).toLocaleString()}
                                            </td>
                                            <td>
                                                <div className="tx-desc">
                                                    <span>{tx.description}</span>
                                                    {tx.reference && <span className="tx-ref">{tx.reference}</span>}
                                                </div>
                                            </td>
                                            <td>
                                                {tx.is_reconciled ? (
                                                    <span className="status-badge reconciled">Reconciled</span>
                                                ) : (
                                                    <span className="status-badge pending">Pending</span>
                                                )}
                                            </td>
                                            <td>
                                                {!tx.is_reconciled && (
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => handleReconcile(tx.id)}
                                                    >
                                                        Reconcile
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="7" style={{ textAlign: 'center', padding: '3rem' }}>
                                            <div className="no-data">
                                                <span>📊</span>
                                                <p>No transactions found matching your filters.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

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
                    </>
                )}
            </div>
        </div>
    );
}
