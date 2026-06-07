import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import { Filter, ChevronUp, ChevronDown, Search, X } from 'lucide-react';
import './AllTransactions.css';

import '../../styles/components/modal-system.css';
import '../../styles/components/data-table.css';
export default function AllTransactions() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();

// fallow-ignore-next-line code-duplication
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [showFilters, setShowFilters] = useState(window.innerWidth > 768);
    
    // Modal State
    const [selectedTx, setSelectedTx] = useState(null);

    const [filters, setFilters] = useState({
        search: '',
        source: '',
        type: '',
        startDate: '',
        endDate: '',
        minAmount: '',
        maxAmount: ''
    });

    const fetchTransactions = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page,
                source: filters.source,
                transaction_type: filters.type,
                date_from: filters.startDate,
                date_to: filters.endDate,
                min_amount: filters.minAmount,
                max_amount: filters.maxAmount,
                search: filters.search
            });

            // Clean up empty params
            for (const key of queryParams.keys()) {
                if (!queryParams.get(key)) {
                    queryParams.delete(key);
                }
            }

// fallow-ignore-next-line code-duplication
            const response = await fetchWithAuth(`${ENDPOINTS.FINANCE_ALL_TRANSACTIONS}?${queryParams.toString()}`);
            if (response.ok) {
                const data = await response.json();
                setTransactions(data.results || []);
                setTotalPages(Math.ceil((data.count || 0) / (data.page_size || 30)));
            }
        } catch (error) {
            console.error('Error fetching transactions:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, page, filters]);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
        setPage(1); // Reset to first page when filtering
    };

    const getTypeBadgeClass = (type) => {
        switch (type?.toLowerCase()) {
            case 'deposit': return 'deposit';
            case 'withdrawal': return 'withdrawal';
            case 'transfer_in': return 'deposit';
            case 'transfer_out': return 'withdrawal';
            default: return '';
        }
    };

    const navigateToLinkedEntity = (entity) => {
        if (!entity) return;
        switch(entity.type) {
            case 'order':
            case 'refund':
                navigate(`/orders/${entity.id}`);
                break;
            case 'expense':
                navigate(`/finance/expenses/${entity.id}`);
                break;
            case 'employee_expense':
                navigate(`/finance/employee-expenses/${entity.id}`);
                break;
            case 'other_income':
                navigate(`/finance/other-income/`);
                break;
            case 'loan':
                navigate(`/finance/loans/${entity.id}`);
                break;
            case 'salary':
                navigate(`/finance/salaries/`); // Assuming salaries list
                break;
            default:
                break;
        }
        setSelectedTx(null);
    };

    return (
        <div className="all-transactions-container fade-in">
            <div className="at-header">
                <h1>Unified Financial Ledger</h1>
                <p>Consolidated timeline of all bank and cash wallet money movements.</p>
            </div>

            <div className="at-controls-card">
                <div className="at-search-bar">
                    <Search className="at-search-icon" size={20} />
                    <input
                        type="text"
                        className="at-search-input"
                        placeholder="Search by Order ID, Customer ID, Reference, Username or Description..."
                        name="search"
                        value={filters.search}
                        onChange={handleFilterChange}
                    />
                </div>

                <div className="filter-collapsible-wrapper" style={{ marginTop: '1rem' }}>
                    <button
                        className="btn filter-toggle-btn"
                        onClick={() => setShowFilters(!showFilters)}
                        style={{ width: '100%', justifyContent: 'space-between', padding: '1rem', background: 'rgba(var(--color-primary-rgb), 0.05)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                            <Filter size={18} />
                            <span>Advanced Filters</span>
                        </div>
                        {showFilters ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>

                    {showFilters && (
                        <div className="at-filters-grid" style={{ marginTop: '1.5rem' }}>
                            <div className="at-filter-group">
                                <label>Source (Bank / Wallet)</label>
                                <select className="at-filter-input" name="source" value={filters.source} onChange={handleFilterChange}>
                                    <option value="">All Sources</option>
                                    <option value="bank">Bank Accounts</option>
                                    <option value="wallet">Cash Wallets</option>
                                </select>
                            </div>

                            <div className="at-filter-group">
                                <label>Direction</label>
                                <select className="at-filter-input" name="type" value={filters.type} onChange={handleFilterChange}>
                                    <option value="">All Directions</option>
                                    <option value="deposit">Inflow (Deposit)</option>
                                    <option value="withdrawal">Outflow (Withdrawal)</option>
                                </select>
                            </div>

                            <div className="at-filter-group">
                                <label>From Date</label>
                                <input type="date" className="at-filter-input" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
                            </div>

                            <div className="at-filter-group">
                                <label>To Date</label>
                                <input type="date" className="at-filter-input" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
                            </div>

                            <div className="at-filter-group">
                                <label>Min Amount</label>
                                <input type="number" className="at-filter-input" placeholder="0.00" name="minAmount" value={filters.minAmount} onChange={handleFilterChange} />
                            </div>

                            <div className="at-filter-group">
                                <label>Max Amount</label>
                                <input type="number" className="at-filter-input" placeholder="0.00" name="maxAmount" value={filters.maxAmount} onChange={handleFilterChange} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="at-table-card">
                {loading ? (
                    <div className="loading-container" style={{ padding: '4rem' }}>
                        <div className="spinner-large"></div>
                    </div>
                ) : (
                    <>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="at-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Source</th>
                                        <th>Direction</th>
                                        <th>Amount</th>
                                        <th>Description</th>
                                        <th>Recorded By</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions.length > 0 ? (
                                        transactions.map(tx => (
                                            <tr key={`${tx.source_type}-${tx.id}`} onClick={() => setSelectedTx(tx)}>
                                                <td>{new Date(tx.date).toLocaleDateString()}</td>
                                                <td>
                                                    <span className={`at-badge source-${tx.source_type}`}>
                                                        {tx.source_type === 'bank' ? '🏦 ' : '👛 '}
                                                        {tx.source_name}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`at-badge ${getTypeBadgeClass(tx.transaction_type)}`}>
                                                        {tx.transaction_type?.replace('_', ' ') || 'Unknown'}
                                                    </span>
                                                </td>
                                                <td className={`at-amount ${(tx.transaction_type === 'withdrawal' || tx.transaction_type === 'transfer_out') ? 'negative' : 'positive'}`}>
                                                    {(tx.transaction_type === 'withdrawal' || tx.transaction_type === 'transfer_out') ? '-' : '+'}
                                                    {currency}{Number(tx.amount).toLocaleString()}
                                                </td>
                                                <td>
                                                    <div style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {tx.description || tx.ref || 'No description'}
                                                    </div>
                                                </td>
                                                <td style={{ color: 'var(--color-text-muted)' }}>
                                                    {tx.user_name || 'System'}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: '4rem' }}>
                                                <div className="no-data">
                                                    <span>🔍</span>
                                                    <p>No transactions found matching your filters.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="pagination-controls" style={{ padding: '1.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="page-info" style={{ fontWeight: 500, color: 'var(--color-text-muted)' }}>
                                Page {page} of {totalPages || 1}
                            </span>
                            <div className="pagination-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                                    Previous
                                </button>
                                <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Transaction Details Modal */}
            {selectedTx && (
                <div className="at-modal-overlay" onClick={() => setSelectedTx(null)}>
                    <div className="at-modal" onClick={e => e.stopPropagation()}>
                        <div className="at-modal-header">
                            <h2>Transaction Details</h2>
                            <button className="at-close-btn" onClick={() => setSelectedTx(null)}>
                                <X size={24} />
                            </button>
                        </div>
                        <div className="at-modal-body">
                            <div className="at-detail-grid">
                                <div className="at-detail-item">
                                    <span className="at-detail-label">Amount</span>
                                    <span className={`at-detail-value at-amount ${(selectedTx.transaction_type === 'withdrawal' || selectedTx.transaction_type === 'transfer_out') ? 'negative' : 'positive'}`}>
                                        {(selectedTx.transaction_type === 'withdrawal' || selectedTx.transaction_type === 'transfer_out') ? '-' : '+'}
                                        {currency}{Number(selectedTx.amount).toLocaleString()}
                                    </span>
                                </div>
                                <div className="at-detail-item">
                                    <span className="at-detail-label">Date</span>
                                    <span className="at-detail-value">{new Date(selectedTx.date).toLocaleDateString()}</span>
                                </div>
                                <div className="at-detail-item">
                                    <span className="at-detail-label">Source</span>
                                    <span className="at-detail-value">
                                        {selectedTx.source_type === 'bank' ? 'Bank Account: ' : 'Cash Wallet: '}
                                        {selectedTx.source_name}
                                    </span>
                                </div>
                                <div className="at-detail-item">
                                    <span className="at-detail-label">Recorded By</span>
                                    <span className="at-detail-value">{selectedTx.user_name || 'System Process'}</span>
                                </div>
                                <div className="at-detail-item at-detail-full">
                                    <span className="at-detail-label">Description</span>
                                    <span className="at-detail-value" style={{ lineHeight: 1.5 }}>
                                        {selectedTx.description || 'No description provided.'}
                                    </span>
                                </div>
                                <div className="at-detail-item at-detail-full">
                                    <span className="at-detail-label">Internal Reference / Receipt</span>
                                    <span className="at-detail-value" style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.05)', padding: '0.5rem', borderRadius: '4px', display: 'inline-block' }}>
                                        {selectedTx.ref || 'N/A'}
                                    </span>
                                </div>
                                <div className="at-detail-item at-detail-full">
                                    <span className="at-detail-label">Timestamp</span>
                                    <span className="at-detail-value" style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                                        {new Date(selectedTx.created_at).toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            {selectedTx.linked_entity && (
                                <div className="at-entity-card">
                                    <h3>
                                        <span>🔗 Linked Entity: {selectedTx.linked_entity.type.toUpperCase()}</span>
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                        {selectedTx.linked_entity.display_id && (
                                            <div><strong>Order ID:</strong> {selectedTx.linked_entity.display_id}</div>
                                        )}
                                        {selectedTx.linked_entity.customer_name && (
                                            <div><strong>Customer:</strong> {selectedTx.linked_entity.customer_name} {selectedTx.linked_entity.customer_id ? `(${selectedTx.linked_entity.customer_id})` : ''}</div>
                                        )}
                                        {selectedTx.linked_entity.payee && (
                                            <div><strong>Payee:</strong> {selectedTx.linked_entity.payee}</div>
                                        )}
                                        {selectedTx.linked_entity.employee && (
                                            <div><strong>Employee:</strong> {selectedTx.linked_entity.employee}</div>
                                        )}
                                        {selectedTx.linked_entity.lender && (
                                            <div><strong>Lender:</strong> {selectedTx.linked_entity.lender}</div>
                                        )}
                                        {selectedTx.linked_entity.category && (
                                            <div><strong>Category:</strong> {selectedTx.linked_entity.category}</div>
                                        )}
                                    </div>
                                    <button 
                                        className="btn btn-primary" 
                                        style={{ width: '100%' }}
                                        onClick={() => navigateToLinkedEntity(selectedTx.linked_entity)}
                                    >
                                        View {selectedTx.linked_entity.type} Details
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
