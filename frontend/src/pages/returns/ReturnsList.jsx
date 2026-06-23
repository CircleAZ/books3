import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import Pagination from '../../components/common/Pagination';
import useServerList from '../../hooks/useServerList';
import './ReturnsList.css';

export default function ReturnsList() {
    const { currency } = useCurrency();
    const navigate = useNavigate();

    const {
        data: returns,
        loading,
        page,
        setPage,
        totalPages,
        totalCount: count,
        search,
        setSearch,
        filters,
        setFilter,
        clearFilters,
    } = useServerList(ENDPOINTS.RETURNS, {
        filterConfig: { status: '', dateAfter: '', dateBefore: '', ordering: '-created_at' },
        pageSize: 20,
        buildParams: (debouncedSearch, fltrs) => ({
            search: debouncedSearch,
            status: fltrs.status,
            created_after: fltrs.dateAfter ? `${fltrs.dateAfter}T00:00:00` : '',
            created_before: fltrs.dateBefore ? `${fltrs.dateBefore}T23:59:59` : '',
            ordering: fltrs.ordering,
        })
    });

    const isFilterActive = search !== '' || filters.status !== '' || filters.dateAfter !== '' || filters.dateBefore !== '';

    const handleSearchChange = (e) => {
        setSearch(e.target.value);
    };

    const handleFilterChange = (key) => (e) => {
        setFilter(key, e.target.value);
    };

    const toggleSort = (column) => {
        if (filters.ordering === column) {
            setFilter('ordering', `-${column}`);
        } else {
            setFilter('ordering', column);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getStatusClass = (statusStr) => {
        if (!statusStr) return 'status-pending';
        const s = statusStr.toLowerCase();
        if (['completed', 'refunded'].includes(s)) return 'status-success';
        if (['initiated', 'pending'].includes(s)) return 'status-warning';
        if (['items_received'].includes(s)) return 'status-info';
        if (['cancelled'].includes(s)) return 'status-danger';
        return 'status-pending';
    };

    return (
        <div className="returns-list-container animate-fade-in">
            <div className="returns-list-header">
                <div className="returns-list-actions">
                    <button className="btn btn-primary" onClick={() => navigate('/returns/new')}>
                        + New Return
                    </button>
                </div>
            </div>

            <div className="returns-list-controls card">
                <div className="search-row">
                    <div className="search-container">
                        <span className="search-icon">🔍</span>
                        <input
                            type="text"
                            placeholder="Search by Return ID, Order ID, Customer..."
                            className="search-input"
                            value={search}
                            onChange={handleSearchChange}
                        />
                    </div>
                </div>

                <div className="filter-row">
                    <div className="filter-group">
                        <label>Return Status</label>
                        <select value={filters.status} onChange={handleFilterChange('status')}>
                            <option value="">All Statuses</option>
                            <option value="initiated">Initiated</option>
                            <option value="items_received">Items Received</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
{/* fallow-ignore-next-line code-duplication */}
                        </select>
                    </div>

                    <div className="filter-group">
                        <label>From</label>
                        <input type="date" value={filters.dateAfter} onChange={handleFilterChange('dateAfter')} />
                    </div>

                    <div className="filter-group">
                        <label>To</label>
                        <input type="date" value={filters.dateBefore} onChange={handleFilterChange('dateBefore')} />
                    </div>

                    <div className="filter-group spacer"></div>
                    <div className="filter-group spacer"></div>
                </div>
            </div>

            <div className="returns-table-container card">
                {loading ? (
                    <div className="loading-container">
                        <div className="spinner-large"></div>
                    </div>
                ) : (
                    <>
                        <table className="returns-table">
                            <thead>
                                <tr>
                                    <th onClick={() => toggleSort('display_id')} className="sortable">
                                        Return ID {filters.ordering.includes('display_id') && (filters.ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th>Order ID</th>
                                    <th>Customer</th>
                                    <th onClick={() => toggleSort('created_at')} className="sortable">
                                        Date {filters.ordering.includes('created_at') && (filters.ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th>Items</th>
                                    <th>Return Status</th>
                                    <th>Refund Status</th>
                                    <th onClick={() => toggleSort('total_refund_amount')} className="sortable">
                                        Amount {filters.ordering.includes('total_refund_amount') && (filters.ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {returns.length > 0 ? (
                                    returns.map(ret => (
                                        <tr key={ret.id} onClick={() => navigate(`/returns/${ret.id}`)}>
                                            <td className="font-mono">#{ret.display_id}</td>
                                            <td className="font-mono">#{ret.order_display_id}</td>
                                            <td>
                                                <div className="customer-info">
                                                    <span className="customer-name">{ret.customer_name || 'N/A'}</span>
                                                </div>
                                            </td>
                                            <td>{formatDate(ret.created_at)}</td>
                                            <td>{ret.item_count} items</td>
                                            <td>
                                                <span className={`status-pill ${getStatusClass(ret.status)}`}>
                                                    {ret.status.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`status-pill ${getStatusClass(ret.refund_status)}`}>
                                                    {ret.refund_status}
                                                </span>
                                            </td>
                                            <td className="font-bold">{currency}{Number(ret.total_refund_amount).toFixed(2)}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="8" className="empty-state">
                                            No returns found matching your criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        <div className="pagination-bar">
                            <span className="total-count">Total: {count} returns</span>
                            <div className="pagination-controls-wrapper" style={{ flexGrow: 1, display: 'flex', justifyContent: 'center' }}>
                                <Pagination 
                                    currentPage={page} 
                                    totalPages={totalPages} 
                                    onPageChange={setPage} 
                                />
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
