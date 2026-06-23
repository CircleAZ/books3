import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import Pagination from '../../components/common/Pagination';
import useServerList from '../../hooks/useServerList';
import './OutletsList.css';

export default function OutletsList() {
    const { formatCurrency } = useCurrency();
    const navigate = useNavigate();

    const {
        data: outlets,
        loading,
        page,
        setPage,
        totalPages,
        search: searchTerm,
        setSearch: setSearchTerm,
    } = useServerList(ENDPOINTS.OUTLETS, {
        pageSize: 20
    });

    if (loading && outlets.length === 0) return <div className="page-loading">Loading Outlets...</div>;

    return (
        <div className="outlets-container">
            <div className="outlets-header">
                <div>
                    <h1 className="outlets-title">Outlets & Consignment</h1>
                    <p className="outlets-subtitle">Manage B2B wholesale locations and their ledgers</p>
                </div>
                <div className="outlets-actions">
                    <input
                        type="text"
                        placeholder="Search outlets..."
                        className="form-input outlets-search"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <button 
                        className="btn btn-primary"
                        onClick={() => navigate('/outlets/add')}
                    >
                        + Add Outlet
                    </button>
                </div>
            </div>

            <div className="outlets-table-container">
                <table className="outlets-table">
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
                            >
                                <td className="outlet-id">#{outlet.display_id}</td>
                                <td className="outlet-name">{outlet.name}</td>
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
                                <td colSpan="5" className="outlets-empty">
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
