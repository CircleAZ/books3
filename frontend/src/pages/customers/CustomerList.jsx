import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import './CustomerList.css';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const CustomerList = () => {
    const { currency } = useCurrency();
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const navigate = useNavigate();
    const location = useLocation();
    const { fetchWithAuth } = useAuth();
    const abortControllerRef = useRef(null);

    const fetchCustomers = useCallback(async (fetchPage, fetchSearch) => {
        // Cancel any in-flight request to prevent stale responses from winning the race
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setLoading(true);
        try {
            const response = await fetchWithAuth(
                `${ENDPOINTS.CUSTOMERS}?page=${fetchPage}&search=${fetchSearch}`,
                { signal: controller.signal }
            );
            if (controller.signal.aborted) return;
            if (response.ok) {
                const data = await response.json();
                setCustomers(data.results || []);
                setTotalPages(Math.ceil((data.count || 0) / 20));
            }
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('Error fetching customers:', error);
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            // Reset to page 1 when search term changes (batched with debounce)
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        fetchCustomers(page, debouncedSearch);
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [page, debouncedSearch, location.key, fetchCustomers]);

    const handleSearchChange = (e) => {
        setSearch(e.target.value);
        // Do NOT setPage(1) here — it's batched inside the debounce effect
        // to prevent an immediate unfiltered fetch with stale debouncedSearch
    };

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
                    onChange={handleSearchChange}
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

            <div className="pagination">
                <button
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                    className="btn btn-secondary"
                >
                    Previous
                </button>
                <span>Page {page} of {Math.max(1, totalPages)}</span>
                <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    className="btn btn-secondary"
                >
                    Next
                </button>
            </div>
        </div>
    );
};

export default CustomerList;
