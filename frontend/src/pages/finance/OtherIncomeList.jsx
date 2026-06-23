import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import { Plus, Search } from 'lucide-react';
import useServerList from '../../hooks/useServerList';
import Pagination from '../../components/common/Pagination';
import '../../styles/components/data-table.css';

export default function OtherIncomeList() {
    const { currency } = useCurrency();
    const navigate = useNavigate();

    const {
        data: incomeRecords,
        loading,
        totalPages,
        page,
        setPage,
        search,
        setSearch,
    } = useServerList(ENDPOINTS.FINANCE_OTHER_INCOME);

    return (
        <div className="page-container fade-in">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 600 }}>Other Income</h1>
                    <p style={{ color: 'var(--color-text-muted)' }}>Non-sales revenue (e.g., rent, interest).</p>
                </div>
{/* fallow-ignore-next-line code-duplication */}
                <button className="btn btn-primary" onClick={() => navigate('/finance/other-income/add')} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Plus size={18} /> Record Income
                </button>
            </div>

            <div className="data-controls" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
                <div className="search-bar" style={{ flex: 1, position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input 
                        type="text" 
                        placeholder="Search by source or description..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
                    />
                </div>
            </div>

            <div className="table-card">
                {loading ? (
                    <div style={{ padding: '4rem', textAlign: 'center' }}><div className="spinner-large"></div></div>
                ) : (
                    <>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Source</th>
                                    <th>Description</th>
                                    <th style={{ textAlign: 'right' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {incomeRecords.length > 0 ? (
                                    incomeRecords.map(inc => (
                                        <tr key={inc.id}>
                                            <td>{new Date(inc.date).toLocaleDateString()}</td>
                                            <td style={{ fontWeight: 500 }}>{inc.source}</td>
                                            <td style={{ color: 'var(--color-text-muted)' }}>{inc.description || '-'}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-success)' }}>
                                                +{currency}{Number(inc.amount).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                                            No income records found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        <Pagination
                            currentPage={page}
                            totalPages={totalPages}
                            onPageChange={setPage}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
