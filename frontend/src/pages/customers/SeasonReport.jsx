import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import { loadFilters } from './mapUtils';
import './SeasonReport.css';

export default function SeasonReport() {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [pdfLoading, setPdfLoading] = useState(false);

    const savedFilters = loadFilters();
    const [season, setSeason] = useState(savedFilters?.season || '');
    const [pdfVillage, setPdfVillage] = useState('');

    const fetchReport = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const url = season
                ? `${ENDPOINTS.SEASON_REPORT}?season=${season}`
                : ENDPOINTS.SEASON_REPORT;
            const res = await fetchWithAuth(url);
            if (!res.ok) {
                if (res.status === 403) {
                    setError('You do not have permission to view the season report.');
                    return;
                }
                throw new Error('API error');
            }
            setData(await res.json());
        } catch (err) {
            setError('Failed to load season report.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, season]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    const handleDownloadPdf = async () => {
        setPdfLoading(true);
        try {
            const params = new URLSearchParams();
            if (season) params.set('season', season);
            if (pdfVillage) params.set('village', pdfVillage);
            const url = `${ENDPOINTS.COVERAGE_PDF}?${params.toString()}`;
            const res = await fetchWithAuth(url);
            if (!res.ok) throw new Error('PDF generation failed');
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `checklist_${pdfVillage || 'all'}_${season || 'current'}.pdf`;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (err) {
            console.error('PDF download error:', err);
            showToast('Failed to download PDF.', 'error');
        } finally {
            setPdfLoading(false);
        }
    };

    if (loading) {
        return <div className="report-page"><div className="report-loading"><div className="spinner-large"></div><p>Loading season report...</p></div></div>;
    }

    if (error) {
        return <div className="report-page"><div className="report-error"><span className="error-icon">⚠️</span><p>{error}</p></div></div>;
    }

    const { current, previous, yoy } = data || {};
    const deltaClass = (val) => {
        if (!val) return '';
        return val.startsWith('+') ? 'delta-positive' : val.startsWith('-') ? 'delta-negative' : '';
    };

    return (
        <div className="report-page">
            <div className="report-header">
                <div className="report-title-row">
                    <h2>Season Report</h2>
                    <Link to="/customers/map" className="btn-map-link">🗺️ Map View</Link>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="report-cards">
                <div className="report-card">
                    <div className="card-stat">{current?.total_villages || 0}</div>
                    <div className="card-label">Villages</div>
                    <div className={`card-delta ${deltaClass(yoy?.villages_delta)}`}>{yoy?.villages_delta || '—'} vs last</div>
                </div>
                <div className="report-card">
                    <div className="card-stat">{current?.coverage_pct || 0}%</div>
                    <div className="card-label">Coverage</div>
                    <div className={`card-delta ${deltaClass(yoy?.coverage_delta)}`}>{yoy?.coverage_delta || '—'} vs last</div>
                </div>
                <div className="report-card">
                    <div className="card-stat">₹{Number(current?.total_revenue || 0).toLocaleString('en-IN')}</div>
                    <div className="card-label">Revenue</div>
                    <div className={`card-delta ${deltaClass(yoy?.revenue_delta)}`}>{yoy?.revenue_delta || '—'} vs last</div>
                </div>
                <div className="report-card">
                    <div className="card-stat">{current?.covered || 0}/{current?.total_customers || 0}</div>
                    <div className="card-label">Homes Covered</div>
                    <div className={`card-delta ${deltaClass(yoy?.customers_delta)}`}>{yoy?.customers_delta || '—'} vs last</div>
                </div>
            </div>

            {/* Season label */}
            <div className="report-season-label">{current?.season_label || ''}</div>

            {/* Village Breakdown Table */}
            <div className="report-section">
                <h3>Village Breakdown</h3>
                {current?.villages?.length > 0 ? (
                    <div className="report-table-wrap">
                        <table className="report-table">
                            <thead>
                                <tr>
                                    <th>Village</th>
                                    <th>Total</th>
                                    <th>Covered</th>
                                    <th>Coverage</th>
                                    <th>Revenue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {current.villages.map(v => (
                                    <tr key={v.name}>
                                        <td className="td-name">{v.name}</td>
                                        <td>{v.total}</td>
                                        <td>{v.covered}</td>
                                        <td>
                                            <div className="pct-bar">
                                                <div className="pct-fill" style={{
                                                    width: `${v.pct}%`,
                                                    background: v.pct >= 80 ? '#22c55e' : v.pct >= 50 ? '#eab308' : '#ef4444'
                                                }}></div>
                                                <span>{v.pct}%</span>
                                            </div>
                                        </td>
                                        <td>₹{Number(v.revenue).toLocaleString('en-IN')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="no-data">No village data for this season.</p>
                )}
            </div>

            {/* PDF Export */}
            <div className="report-section pdf-section">
                <h3>📥 Export Checklist</h3>
                <div className="pdf-controls">
                    <select value={pdfVillage} onChange={(e) => setPdfVillage(e.target.value)}>
                        <option value="">All Villages</option>
                        {(current?.villages || []).map(v => (
                            <option key={v.name} value={v.name}>{v.name}</option>
                        ))}
                    </select>
                    <button className="btn-pdf" onClick={handleDownloadPdf} disabled={pdfLoading}>
                        {pdfLoading ? 'Generating...' : '📄 Download PDF'}
                    </button>
                </div>
            </div>

            {/* Previous Season Comparison */}
            {previous && previous.total_customers > 0 && (
                <div className="report-section">
                    <h3>Previous Season: {previous.season_label}</h3>
                    <div className="prev-summary">
                        {previous.total_villages} villages · {previous.covered}/{previous.total_customers} covered ({previous.coverage_pct}%) · ₹{Number(previous.total_revenue).toLocaleString('en-IN')}
                    </div>
                </div>
            )}
        </div>
    );
}
