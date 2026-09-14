import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import { getStatusClass, formatStatusLabel, STATUS_OPTIONS } from '../../utils/statusUtils';
import Pagination from '../../components/common/Pagination';
import useServerList from '../../hooks/useServerList';
import '../OrderList.css';

const ORDER_FILTER_CONFIG = {
    orderStatus: '',
    paymentStatus: '',
    deliveryStatus: '',
    returnStatus: '',
    refundStatus: '',
    cancellationStatus: '',
    dateAfter: '',
    dateBefore: '',
    ordering: '-created_at',
};

const buildOrderParams = (debouncedSearch, fltrs) => ({
    search: debouncedSearch,
    order_status: fltrs.orderStatus,
    payment_status: fltrs.paymentStatus,
    delivery_status: fltrs.deliveryStatus,
    return_status: fltrs.returnStatus,
    refund_status: fltrs.refundStatus,
    cancellation_status: fltrs.cancellationStatus,
    created_after: fltrs.dateAfter ? `${fltrs.dateAfter}T00:00:00` : '',
    created_before: fltrs.dateBefore ? `${fltrs.dateBefore}T23:59:59` : '',
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

    const [showFilters, setShowFilters] = useState(false);

    const activeFilterCount = [
        filters.orderStatus,
        filters.paymentStatus,
        filters.deliveryStatus,
        filters.returnStatus,
        filters.refundStatus,
        filters.cancellationStatus,
        filters.dateAfter,
        filters.dateBefore
    ].filter(Boolean).length;

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

    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = filters.dateAfter === todayStr && filters.dateBefore === todayStr;

    const setTodayFilter = () => {
        setFilter('dateAfter', todayStr);
        setFilter('dateBefore', todayStr);
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

    return (
        <div className="order-list-container animate-fade-in">
            <div className="order-list-header">

                <div className="order-list-actions">
                    <button className="btn btn-primary" onClick={() => navigate('/orders/new')}>
                        + New Order
                    </button>
                </div>
            </div>

            <div className="order-list-controls card">
                <div className="search-row">
                    <div className="search-container">
                        <span className="search-icon">🔍</span>
                        <input
                            type="text"
                            placeholder="Search by Order ID, Customer name..."
                            className="search-input"
                            value={search}
                            onChange={handleSearchChange}
                        />
                    </div>
                    <button
                        className={`btn btn-ghost filter-toggle-btn${showFilters ? ' active' : ''}`}
                        onClick={() => setShowFilters(!showFilters)}
                        title="Toggle Filters"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                        </svg>
                        Filters
                        {activeFilterCount > 0 && (
                            <span className="filter-badge">{activeFilterCount}</span>
                        )}
                    </button>
                </div>

                <div className="quick-filters">
                    <button
                        className={`btn btn-sm ${isToday ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={isToday ? clearAllFilters : setTodayFilter}
                    >
                        {isToday ? '✕ Today' : "Today's Orders"}
                    </button>
                    {activeFilterCount > 0 && !isToday && (
                        <button className="btn btn-sm btn-ghost" onClick={clearAllFilters}>
                            Clear All Filters
                        </button>
                    )}
                </div>

                {showFilters && (
                    <div className="filter-row">
                        <div className="filter-group">
                            <label>Order Status</label>
                            <select value={filters.orderStatus} onChange={handleFilterChange('orderStatus')}>
                                <option value="">All Statuses</option>
                                {STATUS_OPTIONS.order_status.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label>Payment Status</label>
                            <select value={filters.paymentStatus} onChange={handleFilterChange('paymentStatus')}>
                                <option value="">All Payments</option>
                                {STATUS_OPTIONS.payment_status.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label>Delivery Status</label>
                            <select value={filters.deliveryStatus} onChange={handleFilterChange('deliveryStatus')}>
                                <option value="">All Deliveries</option>
                                {STATUS_OPTIONS.delivery_status.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label>Return Status</label>
                            <select value={filters.returnStatus} onChange={handleFilterChange('returnStatus')}>
                                <option value="">All Returns</option>
                                {STATUS_OPTIONS.return_status.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label>Refund Status</label>
                            <select value={filters.refundStatus} onChange={handleFilterChange('refundStatus')}>
                                <option value="">All Refunds</option>
                                {STATUS_OPTIONS.refund_status.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label>Cancellation</label>
                            <select value={filters.cancellationStatus} onChange={handleFilterChange('cancellationStatus')}>
                                <option value="">All</option>
                                {STATUS_OPTIONS.cancellation_status.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
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
                    </div>
                )}
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
                                                {activeFilterCount > 0 && (
                                                    <button className="btn btn-ghost btn-sm" onClick={clearAllFilters}>
                                                        Clear Filters
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
