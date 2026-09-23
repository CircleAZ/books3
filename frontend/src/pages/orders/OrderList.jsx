import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import { getStatusClass, formatStatusLabel } from '../../utils/statusUtils';
import Pagination from '../../components/common/Pagination';
import SearchTokenPalette from '../../components/common/SearchTokenPalette';
import useServerList from '../../hooks/useServerList';
import '../OrderList.css';

const ORDER_FILTER_CONFIG = {
    ordering: '-created_at',
};

const buildOrderParams = (debouncedSearch, fltrs) => ({
    search: debouncedSearch,
    ordering: fltrs.ordering,
});

const ORDER_LIST_OPTIONS = {
    filterConfig: ORDER_FILTER_CONFIG,
    pageSize: 20,
    buildParams: buildOrderParams,
};

export default function OrderList() {
    const { currency } = useCurrency();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const {
        data: orders,
        loading,
        page,
        setPage,
        totalPages,
        totalCount: count,
        search,
        setSearch,
        filters,
        setFilter,
        clearFilters: clearAllFilters,
    } = useServerList(ENDPOINTS.ORDERS, ORDER_LIST_OPTIONS);

    // Sync search from URL query param on mount
    useEffect(() => {
        const urlQ = searchParams.get('search');
        if (urlQ && urlQ !== search) {
            setSearch(urlQ);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync active search to URL query params
    useEffect(() => {
        const currentParam = searchParams.get('search') || '';
        if (search && search !== currentParam) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.set('search', search);
            setSearchParams(nextParams, { replace: true });
        } else if (!search && currentParam) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('search');
            setSearchParams(nextParams, { replace: true });
        }
    }, [search, searchParams, setSearchParams]);

    const toggleSort = (column) => {
        if (filters.ordering === column) {
            setFilter('ordering', `-${column}`);
        } else {
            setFilter('ordering', column);
        }
    };

    const toggleSearchToken = (token) => {
        if (search.includes(token)) {
            const updated = search.replace(token, '').replace(/\s{2,}/g, ' ').trim();
            setSearch(updated);
        } else {
            const updated = search ? `${search.trim()} ${token}` : token;
            setSearch(updated);
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

    const isTodayActive = search.includes('date:today');
    const isUnpaidActive = search.includes('payment:pending') || search.includes('balance:>0');
    const isDeliveryActive = search.includes('delivery:pending');

    const toggleUnpaid = () => {
        if (isUnpaidActive) {
            const updated = search
                .replace('balance:>0', '')
                .replace('payment:pending', '')
                .replace(/\s{2,}/g, ' ')
                .trim();
            setSearch(updated);
        } else {
            const updated = search ? `${search.trim()} payment:pending` : 'payment:pending';
            setSearch(updated);
        }
    };

    return (
        <div className="order-list-container animate-fade-in">
            <div className="order-list-header">
                <div className="order-list-actions">
                    <button className="btn btn-primary" onClick={() => navigate('/orders/new')}>
                        + New Order
                    </button>
                </div>
            </div>

            <div className="order-list-controls card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <SearchTokenPalette
                    value={search}
                    onChange={setSearch}
                    placeholder="Search by order ID, customer, status:confirmed, product:..., total:>1000..."
                    suggestionsEndpoint={ENDPOINTS.ORDERS_SEARCH_SUGGESTIONS}
                />

                <div className="quick-filters" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                        className={`btn btn-sm ${isTodayActive ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => toggleSearchToken('date:today')}
                    >
                        {isTodayActive ? '✕ Today' : "Today's Orders"}
                    </button>
                    <button
                        className={`btn btn-sm ${isUnpaidActive ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={toggleUnpaid}
                    >
                        {isUnpaidActive ? '✕ Unpaid' : 'Unpaid Orders'}
                    </button>

                    <button
                        className={`btn btn-sm ${isDeliveryActive ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => toggleSearchToken('delivery:pending')}
                    >
                        {isDeliveryActive ? '✕ Needs Delivery' : 'Needs Delivery'}
                    </button>
                    {search && (
                        <button className="btn btn-sm btn-ghost" onClick={() => setSearch('')}>
                            Clear Search
                        </button>
                    )}
                </div>
            </div>

            <div className="order-table-container card">
                {loading ? (
                    <div className="loading-container">
                        <div className="spinner-large"></div>
                    </div>
                ) : (
                    <>
                        <table className="order-table">
                            <thead>
                                <tr>
                                    <th onClick={() => toggleSort('display_id')} className="sortable">
                                        Order ID {filters.ordering.includes('display_id') && (filters.ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('customer_sort_name')} className="sortable">
                                        Customer {filters.ordering.includes('customer_sort_name') && (filters.ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('created_at')} className="sortable">
                                        Date {filters.ordering.includes('created_at') && (filters.ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('total')} className="sortable">
                                        Total {filters.ordering.includes('total') && (filters.ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('payment_status')} className="sortable">
                                        Payment {filters.ordering.includes('payment_status') && (filters.ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('order_status')} className="sortable">
                                        Status {filters.ordering.includes('order_status') && (filters.ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('item_count')} className="sortable">
                                        Items {filters.ordering.includes('item_count') && (filters.ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.length > 0 ? (
                                    orders.map(order => (
                                        <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)}>
                                            <td className="font-mono">#{order.display_id}</td>
                                            <td>
                                                <div className="customer-info">
                                                    <span className="customer-name">
                                                        {order.is_guest ? order.guest_name : (order.customer_name || 'Guest')}
                                                    </span>
                                                    {order.is_guest && <span className="guest-badge">Guest</span>}
                                                </div>
                                            </td>
                                            <td>{formatDate(order.created_at)}</td>
                                            <td className="font-bold">{currency}{Number(order.total).toFixed(2)}</td>
                                            <td>
                                                <span className={`status-pill ${getStatusClass(order.payment_status)}`}>
                                                    {formatStatusLabel('payment_status', order.payment_status)}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`status-pill ${getStatusClass(order.derived_status || order.order_status)}`}>
                                                    {formatStatusLabel('order_status', order.derived_status || order.order_status)}
                                                </span>
                                            </td>
                                            <td className="text-center">{order.item_count ?? '-'}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="7" className="empty-state">
                                            <p>No orders found matching your criteria.</p>
                                            <div className="empty-state-actions">
                                                {search && (
                                                    <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>
                                                        Clear Search
                                                    </button>
                                                )}
                                                <button className="btn btn-primary btn-sm" onClick={() => navigate('/orders/new')}>
                                                    + Create New Order
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        <div className="pagination-bar">
                            <span className="total-count">Total: {count} orders</span>
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
