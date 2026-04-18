import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import Pagination from '../../components/common/Pagination';
import './ReturnsList.css';

export default function ReturnsList() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();
    const location = useLocation();

    const [returns, setReturns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [count, setCount] = useState(0);

    // Filters
    const [status, setStatus] = useState('');
    const [dateAfter, setDateAfter] = useState('');
    const [dateBefore, setDateBefore] = useState('');
    const [ordering, setOrdering] = useState('-created_at');

    // Debounced search state
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    const fetchReturns = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page,
                search: debouncedSearch,
                status,
                created_after: dateAfter ? `${dateAfter}T00:00:00` : '',
                created_before: dateBefore ? `${dateBefore}T23:59:59` : '',
                ordering
            });

            // Remove empty params
            const cleanParams = new URLSearchParams();
            for (const [key, value] of queryParams.entries()) {
                if (value) cleanParams.append(key, value);
            }

            const response = await fetchWithAuth(`${ENDPOINTS.RETURNS}?${cleanParams.toString()}`);
            if (response.ok) {
                const data = await response.json();
                setReturns(data.results || []);
                setCount(data.count || 0);
                // Synchronize with DRF settings.PAGE_SIZE (20)
                setTotalPages(Math.ceil((data.count || 0) / 20));
            } else {
                console.error('Failed to fetch returns');
            }
        } catch (error) {
            console.error('Error fetching returns:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, page, debouncedSearch, status, dateAfter, dateBefore, ordering]);

    // Unified fetch execution: fires precisely when filters/pages or location.key changes
    useEffect(() => {
        fetchReturns();
    }, [fetchReturns, location.key]);

    const handleSearchChange = (e) => {
        setSearch(e.target.value);
        setPage(1);
    };

    const handleFilterChange = (setter) => (e) => {
        setter(e.target.value);
        setPage(1);
    };

    const toggleSort = (column) => {
        if (ordering === column) {
            setOrdering(`-${column}`);
        } else {
            setOrdering(column);
        }
        setPage(1);
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
                        <select value={status} onChange={handleFilterChange(setStatus)}>
                            <option value="">All Statuses</option>
                            <option value="initiated">Initiated</option>
                            <option value="items_received">Items Received</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>

                    <div className="filter-group">
                        <label>From</label>
                        <input type="date" value={dateAfter} onChange={handleFilterChange(setDateAfter)} />
                    </div>

                    <div className="filter-group">
                        <label>To</label>
                        <input type="date" value={dateBefore} onChange={handleFilterChange(setDateBefore)} />
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
                                        Return ID {ordering.includes('display_id') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th>Order ID</th>
                                    <th>Customer</th>
                                    <th onClick={() => toggleSort('created_at')} className="sortable">
                                        Date {ordering.includes('created_at') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th>Items</th>
                                    <th>Return Status</th>
                                    <th>Refund Status</th>
                                    <th onClick={() => toggleSort('total_refund_amount')} className="sortable">
                                        Amount {ordering.includes('total_refund_amount') && (ordering.startsWith('-') ? '↓' : '↑')}
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
