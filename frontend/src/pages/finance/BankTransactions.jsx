import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import { Filter, ChevronUp, ChevronDown } from 'lucide-react';
import useServerList from '../../hooks/useServerList';
import Pagination from '../../components/common/Pagination';
import './BankTransactions.css';

export default function BankTransactions() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();

// fallow-ignore-next-line code-duplication
    const [accounts, setAccounts] = useState([]);
    const [showFilters, setShowFilters] = useState(window.innerWidth > 768);

    const {
        data: transactions,
        loading,
        totalPages,
        page,
        setPage,
        filters,
        setFilter,
        refresh,
    } = useServerList(ENDPOINTS.FINANCE_BANK_TRANSACTIONS, {
        filterConfig: { account: '', type: '', startDate: '', endDate: '', reconciled: '' },
        buildParams: (search, f) => new URLSearchParams({
            account: f.account,
            transaction_type: f.type,
            start_date: f.startDate,
            end_date: f.endDate,
            is_reconciled: f.reconciled,
        }),
    });

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
        fetchAccounts();
    }, [fetchAccounts]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilter(name, value);
    };

    const handleReconcile = async (id) => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_BANK_TRANSACTIONS}${id}/reconcile/`, {
                method: 'POST'
            });
            if (response.ok) {
                refresh();
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

                        <Pagination
                            currentPage={page}
                            totalPages={totalPages}
                            onPageChange={setPage}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
