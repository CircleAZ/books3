import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import useServerList from '../../hooks/useServerList';
import Pagination from '../../components/common/Pagination';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import './CustomerList.css';

const CustomerList = () => {
    const { currency } = useCurrency();
    const navigate = useNavigate();

    const {
        data: customers,
        loading,
        totalPages,
        page,
        setPage,
        search,
        setSearch,
    } = useServerList(ENDPOINTS.CUSTOMERS);

    return (
        <div className="customer-list-container fade-in">
            <div className="page-header">
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                        className="btn btn-secondary btn-icon"
                        onClick={() => navigate('/customers/settings')}
                        title="Customer Settings"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '1.1rem', lineHeight: 1 }}
                    >
                        ⚙️
                    </button>
                    <button className="btn btn-primary" onClick={() => navigate('/customers/add')}>
                        + Add New Customer
                    </button>
                </div>
            </div>

            <div className="search-bar">
                <input
                    type="text"
                    placeholder="Search by name, phone, email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="form-input"
                />
            </div>

            {loading ? (
                <LoadingSpinner />
            ) : (
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Phone</th>
                                <th>Email</th>
                                <th>Wallet</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {customers.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="text-center">No customers found.</td>
                                </tr>
                            ) : (
                                customers.map((customer) => (
                                    <tr key={customer.id} onClick={() => navigate(`/customers/${customer.id}`)} className="clickable-row">
                                        <td>{customer.display_id || customer.id.slice(0, 8)}</td>
                                        <td>{customer.full_name}</td>
                                        <td>{customer.phone}</td>
                                        <td>{customer.email || '-'}</td>
                                        <td>{currency}{customer.wallet_balance}</td>
                                        <td>
                                            <button
                                                className="btn btn-sm btn-secondary"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/customers/${customer.id}/edit`);
                                                }}
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

            <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
            />
        </div>
    );
};

export default CustomerList;

