import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';

export default function CoverageWidget() {
    const { fetchWithAuth } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [season, setSeason] = useState('');

    useEffect(() => {
        const fetchCoverage = async () => {
            try {
                const res = await fetchWithAuth(ENDPOINTS.CUSTOMERS_MAP);
                if (res.ok) {
                    const data = await res.json();
                    setStats(data.stats);
                    setSeason(data.season?.label || '');
                }
            } catch (err) {
                // Silent fail — widget is non-critical
            }
        };
        fetchCoverage();
    }, [fetchWithAuth]);

    if (!stats) return null;

    const covered = stats.active || 0;
    const total = stats.total_mapped || 0;
    const pct = stats.coverage_pct || 0;
    const villages = stats.total_villages || 0;
    const targets = stats.total_targets || 0;

    return (
        <div
            className="coverage-widget stat-card"
            onClick={() => navigate('/customers/map')}
            style={{ cursor: 'pointer' }}
            title="Open Customer Map"
        >
            <div className="stat-icon">🗺️</div>
            <div className="stat-content">
                <h4 className="stat-title">Season Coverage</h4>
                <p className="stat-value">{pct}% <span style={{ fontSize: '14px', opacity: 0.7 }}>({covered}/{total})</span></p>
                <p className="stat-subtext">{villages} villages{targets > 0 ? ` · ${targets} targets` : ''}</p>
                <p className="stat-subtext" style={{ fontSize: '11px', opacity: 0.6 }}>{season}</p>
            </div>
        </div>
    );
}
