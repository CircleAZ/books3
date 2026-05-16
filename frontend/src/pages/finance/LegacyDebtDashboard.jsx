import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';
import ENDPOINTS from '../../config/api';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Wallet, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';
import './LegacyDebtDashboard.css';

export default function LegacyDebtDashboard() {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchSummary = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.LEGACY_DEBT}summary/`);
            if (!res.ok) throw new Error('Failed to fetch legacy debt summary');
            const data = await res.json();
            setSummary(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
    }, []);

    if (loading) {
        return (
            <div className="legacy-debt-dashboard loading-state">
                <div className="spinner"></div>
                <p>Calculating Debt Metrics...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="legacy-debt-dashboard error-state">
                <AlertCircle size={48} className="error-icon" />
                <p>{error}</p>
                <button onClick={fetchSummary} className="btn-retry">Retry</button>
            </div>
        );
    }

    const { total_imported, total_recovered, total_remaining, collection_rate_pct } = summary;

    const chartData = [
        { name: 'Recovered', value: parseFloat(total_recovered) },
        { name: 'Remaining', value: parseFloat(total_remaining) }
    ];
    
    const COLORS = ['#22c55e', '#ef4444']; // Green for recovered, Red for remaining

    return (
        <div className="legacy-debt-dashboard">
            <header className="dashboard-header">
                <div className="header-titles">
                    <h1>Legacy Debt Overview</h1>
                    <p>The Accountant's View \u2014 Recovery Tracking</p>
                </div>
                <button className="btn-refresh" onClick={fetchSummary}>
                    <RefreshCw size={20} /> Refresh
                </button>
            </header>

            <div className="metrics-grid">
                <div className="metric-card imported">
                    <div className="metric-icon"><Wallet size={24} /></div>
                    <div className="metric-data">
                        <span className="metric-label">Total Imported</span>
                        <h2 className="metric-value">₹{parseFloat(total_imported).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h2>
                    </div>
                </div>

                <div className="metric-card recovered">
                    <div className="metric-icon"><TrendingUp size={24} /></div>
                    <div className="metric-data">
                        <span className="metric-label">Total Recovered</span>
                        <h2 className="metric-value">₹{parseFloat(total_recovered).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h2>
                    </div>
                </div>

                <div className="metric-card remaining">
                    <div className="metric-icon"><AlertCircle size={24} /></div>
                    <div className="metric-data">
                        <span className="metric-label">Total Remaining</span>
                        <h2 className="metric-value">₹{parseFloat(total_remaining).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h2>
                    </div>
                </div>

                <div className="metric-card rate">
                    <div className="rate-circle-wrapper">
                        <svg viewBox="0 0 36 36" className="circular-chart">
                            <path className="circle-bg"
                                d="M18 2.0845
                                a 15.9155 15.9155 0 0 1 0 31.831
                                a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                            <path className="circle"
                                strokeDasharray={`${collection_rate_pct}, 100`}
                                d="M18 2.0845
                                a 15.9155 15.9155 0 0 1 0 31.831
                                a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                        </svg>
                        <div className="rate-text">{collection_rate_pct}%</div>
                    </div>
                    <div className="metric-data">
                        <span className="metric-label">Collection Rate</span>
                    </div>
                </div>
            </div>

            <div className="chart-section">
                <h2>Recovery vs. Remaining Distribution</h2>
                <div className="chart-container">
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={80}
                                outerRadius={120}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip 
                                formatter={(value) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="chart-legend">
                        <div className="legend-item">
                            <span className="legend-color" style={{ backgroundColor: COLORS[0] }}></span>
                            <span>Recovered</span>
                        </div>
                        <div className="legend-item">
                            <span className="legend-color" style={{ backgroundColor: COLORS[1] }}></span>
                            <span>Remaining</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
