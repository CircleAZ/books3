import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import { Filter, ChevronUp, ChevronDown, X } from 'lucide-react';
import useServerList from '../../hooks/useServerList';
import Pagination from '../../components/common/Pagination';
import SearchTokenPalette from '../../components/common/SearchTokenPalette';
import './AllTransactions.css';

import '../../styles/components/modal-system.css';
import '../../styles/components/data-table.css';
export default function AllTransactions() {
    const { currency } = useCurrency();
    const navigate = useNavigate();

    const [showFilters, setShowFilters] = useState(false);
    
    // Modal State
    const [selectedTx, setSelectedTx] = useState(null);

    const {
        data: transactions,
        loading,
        totalPages,
        page,
        setPage,
        filters,
        setFilter,
        search,
        setSearch,
    } = useServerList(ENDPOINTS.FINANCE_ALL_TRANSACTIONS, {
        filterConfig: { source: '', type: '', startDate: '', endDate: '' },
        debounceMs: 300,
        buildParams: (debouncedSearch, f) => new URLSearchParams({
            search: debouncedSearch,
            source: f.source,
            transaction_type: f.type,
            date_from: f.startDate,
            date_to: f.endDate,
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

    const isBankActive = /(^|\s)source:bank($|\s)/i.test(search || '');
    const isWalletActive = /(^|\s)source:wallet($|\s)/i.test(search || '');
    const isDepositActive = /(^|\s)type:deposit($|\s)/i.test(search || '');
    const isWithdrawalActive = /(^|\s)type:withdrawal($|\s)/i.test(search || '');
    const isHighValueActive = /(^|\s)amount:>10000($|\s)/i.test(search || '');

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilter(name, value);
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
                <SearchTokenPalette
                    value={search}
                    onChange={setSearch}
                    placeholder="Search ledger: ref:..., type:deposit, source:bank, amount:>5000, date:today..."
                    suggestionsEndpoint={ENDPOINTS.FINANCE_ALL_TRANSACTIONS_SUGGESTIONS}
                />

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '1rem' }}>
                    <button
                        type="button"
                        className={`btn btn-sm ${isBankActive ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => toggleSearchToken('source:bank')}
                    >
                        {isBankActive ? '✕ Bank Only' : 'Bank Accounts'}
                    </button>
                    <button
                        type="button"
                        className={`btn btn-sm ${isWalletActive ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => toggleSearchToken('source:wallet')}
                    >
                        {isWalletActive ? '✕ Cash Only' : 'Cash Wallets'}
                    </button>
                    <button
                        type="button"
                        className={`btn btn-sm ${isDepositActive ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => toggleSearchToken('type:deposit')}
                    >
                        {isDepositActive ? '✕ Deposits' : 'Inflows (Deposits)'}
                    </button>
                    <button
                        type="button"
                        className={`btn btn-sm ${isWithdrawalActive ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => toggleSearchToken('type:withdrawal')}
                    >
                        {isWithdrawalActive ? '✕ Withdrawals' : 'Outflows (Withdrawals)'}
                    </button>
                    <button
                        type="button"
                        className={`btn btn-sm ${isHighValueActive ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => toggleSearchToken('amount:>10000')}
                    >
                        {isHighValueActive ? '✕ >₹10,000' : 'High Value (>₹10,000)'}
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

                <div className="filter-collapsible-wrapper" style={{ marginTop: '1rem' }}>
                    <button
                        className="btn filter-toggle-btn"
                        onClick={() => setShowFilters(!showFilters)}
                        style={{ width: '100%', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'rgba(var(--color-primary-rgb), 0.05)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                            <Filter size={16} />
                            <span>Date Range Picker</span>
                        </div>
                        {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {showFilters && (
                        <div className="at-filters-grid" style={{ marginTop: '1rem' }}>
                            <div className="at-filter-group">
                                <label>From Date</label>
                                <input type="date" className="at-filter-input" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
                            </div>

                            <div className="at-filter-group">
                                <label>To Date</label>
                                <input type="date" className="at-filter-input" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
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

                        <Pagination
                            currentPage={page}
                            totalPages={totalPages}
                            onPageChange={setPage}
                        />
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
