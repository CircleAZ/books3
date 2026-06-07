import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import {
    saveFilters, loadFilters, buildFilterQuery,
    saveCoverageCache, loadCoverageCache, formatCacheAge
} from './mapUtils';
import './CoverageList.css';

const STATUS_CONFIG = {
    active:   { icon: '✓', label: 'Covered', color: '#22c55e' },
    followup: { icon: '⏳', label: 'Follow-up', color: '#eab308' },
    lapsed:   { icon: '✗', label: 'Lapsed', color: '#ef4444' },
    prospect: { icon: '★', label: 'New', color: '#3b82f6' },
};

export default function CoverageList() {
    const { fetchWithAuth } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [isOffline, setIsOffline] = useState(false);
    const [cacheAge, setCacheAge] = useState('');

    // Filters — shared with map page via localStorage
    const savedFilters = loadFilters();
    const [season, setSeason] = useState(savedFilters?.season || '');
    const [village, setVillage] = useState(savedFilters?.village || '');

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            setIsOffline(false);

            // Fetch uncovered customers (followup, lapsed, prospect)
            const filters = {
                season,
                village,
                status: ['followup', 'lapsed', 'prospect'],
                group: '',
            };
            const queryString = buildFilterQuery(filters);
            const url = ENDPOINTS.CUSTOMERS_MAP + queryString;
            const res = await fetchWithAuth(url);

            if (!res.ok) {
                if (res.status === 403) {
                    setError('You do not have permission to view coverage data.');
                    return;
                }
                throw new Error('API error');
            }

            const result = await res.json();
            setData(result);

            // Cache for offline use
            saveCoverageCache(result);
        } catch (err) {
            console.error('Coverage data fetch error:', err);

            // Try offline cache
            const cached = loadCoverageCache();
            if (cached) {
                setData(cached.data);
                setIsOffline(true);
                setCacheAge(formatCacheAge(cached.age));
            } else {
                setError('Unable to load coverage data. No cached data available.');
            }
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, season, village]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Save filter changes
    const handleSeasonChange = (val) => {
        setSeason(val);
        const current = loadFilters() || {};
        saveFilters({ ...current, season: val });
    };

    const handleVillageChange = (val) => {
        setVillage(val);
        const current = loadFilters() || {};
        saveFilters({ ...current, village: val });
    };

    // Sort customers: village → faliya → name
    const sortedCustomers = data?.customers
        ? [...data.customers].sort((a, b) => {
            const va = (a.village || '').toLowerCase();
            const vb = (b.village || '').toLowerCase();
            if (va !== vb) return va.localeCompare(vb);
            const fa = (a.faliya || '').toLowerCase();
            const fb = (b.faliya || '').toLowerCase();
            if (fa !== fb) return fa.localeCompare(fb);
            return (a.full_name || '').localeCompare(b.full_name || '');
        })
        : [];

    const filterOptions = data?.filter_options || {};

    if (loading) {
        return (
            <div className="coverage-page">
                <div className="coverage-loading">
                    <div className="spinner-large"></div>
                    <p>Loading coverage data...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="coverage-page">
                <div className="coverage-error">
                    <span className="error-icon">⚠️</span>
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="coverage-page">
            {/* Offline banner */}
            {isOffline && (
                <div className="offline-banner">
                    <span>📡 Offline — showing cached data from {cacheAge}</span>
                    <button onClick={fetchData} className="retry-btn">Retry</button>
                </div>
            )}

            {/* Header with filters */}
            <div className="coverage-header">
                <div className="coverage-title-row">
                    <h2>Coverage List</h2>
                    <span className="coverage-count">{sortedCustomers.length} uncovered</span>
                </div>

                <div className="coverage-filters">
{/* fallow-ignore-next-line code-duplication */}
                    <select value={season} onChange={(e) => handleSeasonChange(e.target.value)}>
                        <option value="">Current Season</option>
                        {(filterOptions.seasons || []).map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </select>

                    <select value={village} onChange={(e) => handleVillageChange(e.target.value)}>
                        <option value="">All Villages</option>
                        {(filterOptions.villages || []).map(v => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </select>

                    <Link to="/customers/map" className="btn-map-link">🗺️ Map View</Link>
                </div>
            </div>

            {/* Village summary */}
            {data?.villages && data.villages.length > 0 && (
                <div className="village-summary-row">
                    {data.villages.map(v => (
                        <div key={v.name} className="village-chip" onClick={() => handleVillageChange(v.name)}>
                            <span className="chip-name">{v.name}</span>
                            <span className="chip-coverage" style={{
                                color: v.coverage_pct >= 80 ? '#22c55e' : v.coverage_pct >= 50 ? '#eab308' : '#ef4444'
                            }}>
                                {v.ordered_this_season}/{v.total_customers}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* All covered state */}
            {sortedCustomers.length === 0 && (
                <div className="coverage-empty">
                    <span className="empty-icon">🎉</span>
                    <h3>All Customers Covered!</h3>
                    <p>Every customer in {village || 'all villages'} has ordered this season.</p>
                </div>
            )}

            {/* Desktop table */}
            {sortedCustomers.length > 0 && (
                <div className="coverage-table-wrap">
                    <table className="coverage-table">
                        <thead>
                            <tr>
                                <th>Village</th>
                                <th>Faliya</th>
                                <th>Customer</th>
                                <th>Phone</th>
                                <th>Last Order</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedCustomers.map(c => {
                                const sc = STATUS_CONFIG[c.marker_status] || STATUS_CONFIG.prospect;
                                return (
                                    <tr key={c.id}>
                                        <td className="td-village">{c.village || '—'}</td>
                                        <td className="td-faliya">{c.faliya || '—'}</td>
                                        <td className="td-name">
                                            <Link to={`/customers/${c.id}`}>{c.full_name}</Link>
                                        </td>
                                        <td className="td-phone">
                                            {c.phone ? (
                                                <a href={`tel:${c.phone}`}>{c.phone}</a>
                                            ) : '—'}
                                        </td>
                                        <td className="td-order">
                                            {c.last_order_date || 'Never'}
                                        </td>
                                        <td className="td-status">
                                            <span className="status-badge" style={{
                                                background: sc.color + '20',
                                                color: sc.color,
                                                borderColor: sc.color,
                                            }}>
                                                {sc.icon} {sc.label}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Mobile cards (shown instead of table on small screens) */}
            {sortedCustomers.length > 0 && (
                <div className="coverage-cards">
                    {sortedCustomers.map(c => {
                        const sc = STATUS_CONFIG[c.marker_status] || STATUS_CONFIG.prospect;
                        return (
                            <div key={c.id} className="coverage-card">
                                <div className="card-top">
                                    <Link to={`/customers/${c.id}`} className="card-name">{c.full_name}</Link>
                                    <span className="status-badge" style={{
                                        background: sc.color + '20',
                                        color: sc.color,
                                        borderColor: sc.color,
                                    }}>
                                        {sc.icon} {sc.label}
                                    </span>
                                </div>
                                <div className="card-info">
                                    <span>📍 {c.village || '—'}{c.faliya ? `, ${c.faliya}` : ''}</span>
                                    {c.phone && <a href={`tel:${c.phone}`}>📞 {c.phone}</a>}
                                    <span>🗓️ {c.last_order_date || 'Never ordered'}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
