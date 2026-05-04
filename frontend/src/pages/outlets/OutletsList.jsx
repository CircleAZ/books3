import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import Pagination from '../../components/common/Pagination';

export default function OutletsList() {
    const [outlets, setOutlets] = useState([]);
    const [loading, setLoading] = useState(true);
    const { fetchWithAuth } = useAuth();
    const { formatCurrency } = useCurrency();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const fetchOutlets = useCallback(async () => {
        try {
            setLoading(true);
            let url = `${ENDPOINTS.OUTLETS}?page=${page}`;
            if (debouncedSearch) {
                url += `&search=${encodeURIComponent(debouncedSearch)}`;
            }
            const response = await fetchWithAuth(url);
            if (response.ok) {
                const data = await response.json();
                setOutlets(data.results || data);
                if (data.count) {
                    setTotalPages(Math.ceil(data.count / 25)); // assuming default 25
                } else {
                    setTotalPages(1);
                }
            } else {
                showToast("Failed to load outlets", "error");
            }
        } catch (error) {
            console.error("Failed to fetch outlets:", error);
            showToast("Failed to load outlets", "error");
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, showToast, page, debouncedSearch]);

    useEffect(() => {
        fetchOutlets();
    }, [fetchOutlets, location.key]);

    if (loading && outlets.length === 0) return <div className="page-loading">Loading Outlets...</div>;

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Outlets & Consignment</h1>
                    <p className="page-subtitle">Manage B2B wholesale locations and their ledgers</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="Search outlets..."
                        className="form-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ width: '250px' }}
                    />
                    <button 
                        className="btn btn-primary"
                        onClick={() => navigate('/outlets/add')}
                    >
                        + Add Outlet
                    </button>
                </div>
            </div>

            <div className="table-card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Outlet Name</th>
                            <th>Contact Person</th>
                            <th className="text-right">Outstanding Balance</th>
                            <th className="text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {outlets.map(outlet => (
                            <tr 
                                key={outlet.id} 
                                onClick={() => navigate(`/outlets/${outlet.id}`)}
                                style={{ cursor: 'pointer' }}
                            >
                                <td>#{outlet.display_id}</td>
                                <td className="font-medium">{outlet.name}</td>
                                <td>{outlet.contact_person || '-'}</td>
                                <td className={`text-right font-bold ${parseFloat(outlet.outstanding_balance) > 0 ? 'text-danger' : 'text-success'}`}>
                                    {formatCurrency(outlet.outstanding_balance)}
                                </td>
                                <td className="text-center">
                                    <span className={`status-badge ${outlet.is_active ? 'status-active' : 'status-inactive'}`}>
                                        {outlet.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                        {outlets.length === 0 && (
                            <tr>
                                <td colSpan="5" className="text-center py-8 text-muted">
                                    No outlets found. Add one to get started.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                <div className="pagination-bar">
                    <Pagination 
                        currentPage={page} 
                        totalPages={totalPages} 
                        onPageChange={setPage} 
                    />
                </div>
            </div>
        </div>
    );
}
