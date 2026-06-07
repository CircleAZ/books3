import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import { getStatusClass, formatStatusLabel, STATUS_OPTIONS } from '../../utils/statusUtils';
import Pagination from '../../components/common/Pagination';
import '../OrderList.css';

export default function OrderList() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();
    const location = useLocation();

// fallow-ignore-next-line code-duplication
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [count, setCount] = useState(0);

    // Filters
    const [orderStatus, setOrderStatus] = useState('');
    const [paymentStatus, setPaymentStatus] = useState('');
    const [deliveryStatus, setDeliveryStatus] = useState('');
    const [returnStatus, setReturnStatus] = useState('');
    const [refundStatus, setRefundStatus] = useState('');
    const [cancellationStatus, setCancellationStatus] = useState('');
    const [dateAfter, setDateAfter] = useState('');
    const [dateBefore, setDateBefore] = useState('');
    const [ordering, setOrdering] = useState('-created_at');
    const [showFilters, setShowFilters] = useState(false);

// fallow-ignore-next-line code-duplication
    const activeFilterCount = [orderStatus, paymentStatus, deliveryStatus, returnStatus, refundStatus, cancellationStatus, dateAfter, dateBefore].filter(Boolean).length;

    // Debounced search state
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page,
                search: debouncedSearch,
                order_status: orderStatus,
                payment_status: paymentStatus,
                delivery_status: deliveryStatus,
                return_status: returnStatus,
                refund_status: refundStatus,
                cancellation_status: cancellationStatus,
// fallow-ignore-next-line code-duplication
                created_after: dateAfter ? `${dateAfter}T00:00:00` : '',
                created_before: dateBefore ? `${dateBefore}T23:59:59` : '',
                ordering
            });

            // Remove empty params
            const cleanParams = new URLSearchParams();
            for (const [key, value] of queryParams.entries()) {
                if (value) cleanParams.append(key, value);
            }

            const response = await fetchWithAuth(`${ENDPOINTS.ORDERS}?${cleanParams.toString()}`);
            if (response.ok) {
                const data = await response.json();
                setOrders(data.results || []);
                setCount(data.count || 0);
                // Synchronize with DRF settings.PAGE_SIZE (20)
                setTotalPages(Math.ceil((data.count || 0) / 20));
            } else {
                console.error('Failed to fetch orders');
            }
        } catch (error) {
            console.error('Error fetching orders:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, page, debouncedSearch, orderStatus, paymentStatus, deliveryStatus, returnStatus, refundStatus, cancellationStatus, dateAfter, dateBefore, ordering]);

    // Unified fetch execution: fires precisely when filters/pages or location.key changes
    useEffect(() => {
        fetchOrders();
    }, [fetchOrders, location.key]);

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

    const clearAllFilters = () => {
        setSearch('');
        setOrderStatus('');
        setPaymentStatus('');
        setDeliveryStatus('');
        setReturnStatus('');
        setRefundStatus('');
        setCancellationStatus('');
        setDateAfter('');
        setDateBefore('');
        setPage(1);
    };

    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = dateAfter === todayStr && dateBefore === todayStr;

    const setTodayFilter = () => {
        setDateAfter(todayStr);
        setDateBefore(todayStr);
// fallow-ignore-next-line code-duplication
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
                            <select value={orderStatus} onChange={handleFilterChange(setOrderStatus)}>
                                <option value="">All Statuses</option>
                                {STATUS_OPTIONS.order_status.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label>Payment Status</label>
                            <select value={paymentStatus} onChange={handleFilterChange(setPaymentStatus)}>
                                <option value="">All Payments</option>
                                {STATUS_OPTIONS.payment_status.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label>Delivery Status</label>
                            <select value={deliveryStatus} onChange={handleFilterChange(setDeliveryStatus)}>
                                <option value="">All Deliveries</option>
                                {STATUS_OPTIONS.delivery_status.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label>Return Status</label>
                            <select value={returnStatus} onChange={handleFilterChange(setReturnStatus)}>
                                <option value="">All Returns</option>
                                {STATUS_OPTIONS.return_status.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label>Refund Status</label>
                            <select value={refundStatus} onChange={handleFilterChange(setRefundStatus)}>
                                <option value="">All Refunds</option>
                                {STATUS_OPTIONS.refund_status.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <label>Cancellation</label>
                            <select value={cancellationStatus} onChange={handleFilterChange(setCancellationStatus)}>
                                <option value="">All</option>
                                {STATUS_OPTIONS.cancellation_status.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
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
                                        Order ID {ordering.includes('display_id') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('customer_sort_name')} className="sortable">
                                        Customer {ordering.includes('customer_sort_name') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('created_at')} className="sortable">
                                        Date {ordering.includes('created_at') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('total')} className="sortable">
                                        Total {ordering.includes('total') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('payment_status')} className="sortable">
                                        Payment {ordering.includes('payment_status') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('order_status')} className="sortable">
                                        Status {ordering.includes('order_status') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('item_count')} className="sortable">
                                        Items {ordering.includes('item_count') && (ordering.startsWith('-') ? '↓' : '↑')}
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
