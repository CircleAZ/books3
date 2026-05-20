import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import { Plus, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import '../../styles/components/data-table.css';

export default function OtherIncomeList() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();
    const [incomeRecords, setIncomeRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const fetchIncome = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.FINANCE_OTHER_INCOME}?page=${page}&search=${search}`);
            if (res.ok) {
                const data = await res.json();
                setIncomeRecords(data.results || data);
                setTotalPages(Math.ceil((data.count || 0) / (data.page_size || 30)));
            }
        } catch (error) {
            toast.error("Failed to fetch other income records");
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, page, search]);

    useEffect(() => {
        fetchIncome();
    }, [fetchIncome]);

    return (
        <div className="page-container fade-in">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 600 }}>Other Income</h1>
                    <p style={{ color: 'var(--color-text-muted)' }}>Non-sales revenue (e.g., rent, interest).</p>
                </div>
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
                        <div className="pagination-controls" style={{ padding: '1.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="page-info" style={{ fontWeight: 500, color: 'var(--color-text-muted)' }}>
                                Page {page} of {totalPages || 1}
                            </span>
                            <div className="pagination-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                                    Previous
                                </button>
                                <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                                    Next
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
