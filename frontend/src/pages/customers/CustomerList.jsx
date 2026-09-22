import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import useServerList from '../../hooks/useServerList';
import Pagination from '../../components/common/Pagination';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import SearchTokenPalette from '../../components/common/SearchTokenPalette';
import './CustomerList.css';

const CustomerList = () => {
    const { currency } = useCurrency();
    const navigate = useNavigate();

    const {
        data: customers,
        loading,
        totalPages,
        totalCount,
        page,
        setPage,
        search,
        setSearch,
    } = useServerList(ENDPOINTS.CUSTOMERS);

    return (
        <div className="customer-list-container fade-in">
            <div className="customer-list-header">
                <div className="header-title-group">
                    <h1 className="customer-list-title">Customers</h1>
                    {totalCount > 0 && (
                        <span className="customer-count-badge">
                            {totalCount.toLocaleString()}
                        </span>
                    )}
                </div>
                <div className="header-actions">
                    <button
                        className="btn btn-secondary btn-icon"
                        onClick={() => navigate('/customers/settings')}
                        title="Customer Settings"
                    >
                        ⚙️
                    </button>
                    <button className="btn btn-primary" onClick={() => navigate('/customers/add')}>
                        + Add Customer
                    </button>
                </div>
            </div>

            <div className="customer-search-card card">
                <SearchTokenPalette
                    value={search}
                    onChange={setSearch}
                    placeholder="Search by name, phone, taluka:..., wallet:>0..."
                    suggestionsEndpoint={ENDPOINTS.CUSTOMERS_SEARCH_SUGGESTIONS}
                />
            </div>

            <div className="customer-table-card card">
                {loading ? (
                    <div className="customer-loading-container">
                        <LoadingSpinner />
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="customer-table">
                            <thead>
                                <tr>
                                    <th className="th-id">ID</th>
                                    <th className="th-name">Name</th>
                                    <th className="th-phone">Phone</th>
                                    <th className="th-email">Email</th>
                                    <th className="th-wallet">Wallet</th>
                                    <th className="th-action">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {customers.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="empty-state">
                                            <div className="empty-state-content">
                                                <span className="empty-state-icon">👥</span>
                                                <p>No customers found.</p>
                                                {search && (
                                                    <small className="text-muted">
                                                        No results matching "{search}". Try a different search term.
                                                    </small>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    customers.map((customer) => (
                                        <tr
                                            key={customer.id}
                                            onClick={() => navigate(`/customers/${customer.id}`)}
                                            className="clickable-row"
                                        >
                                            <td className="cell-id">
                                                <span className="id-badge">
                                                    #{customer.display_id || customer.id.slice(0, 8)}
                                                </span>
                                            </td>
                                            <td className="cell-name">
                                                <span className="customer-name-text">
                                                    {customer.full_name}
                                                </span>
                                            </td>
                                            <td className="cell-phone">
                                                {customer.phone ? (
                                                    <span className="phone-text">{customer.phone}</span>
                                                ) : (
                                                    <span className="text-muted">—</span>
                                                )}
                                            </td>
                                            <td className="cell-email">
                                                {customer.email ? (
                                                    <span className="email-text" title={customer.email}>
                                                        {customer.email}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted">—</span>
                                                )}
                                            </td>
                                            <td className="cell-wallet">
                                                <span className={`wallet-badge ${parseFloat(customer.wallet_balance || 0) > 0 ? 'positive' : ''}`}>
                                                    {currency}{parseFloat(customer.wallet_balance || 0).toFixed(2)}
                                                </span>
                                            </td>
                                            <td className="cell-action">
                                                <button
                                                    className="btn btn-sm btn-secondary btn-action-edit"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/customers/${customer.id}/edit`);
                                                    }}
                                                    title="Edit customer"
                                                >
                                                    Edit
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
            />
        </div>
    );
};

export default CustomerList;

