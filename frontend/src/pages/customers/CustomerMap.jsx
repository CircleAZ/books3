import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { saveFilters, loadFilters, buildFilterQuery } from './mapUtils';
import './CustomerMap.css';

// ── Marker config ──
const MARKER_CONFIG = {
    active:   { bg: '#22c55e', border: '#16a34a', icon: '✓', label: 'Ordered this season', borderStyle: 'solid' },
    followup: { bg: '#eab308', border: '#ca8a04', icon: '⏳', label: 'Last season — needs visit', borderStyle: 'dashed' },
    lapsed:   { bg: '#ef4444', border: '#dc2626', icon: '✗', label: 'Lapsed (2+ seasons)', borderStyle: 'dotted' },
    prospect: { bg: '#3b82f6', border: '#2563eb', icon: '★', label: 'Never ordered', borderStyle: 'double' },
};

const ALL_STATUSES = ['active', 'followup', 'lapsed', 'prospect'];

function createMarkerIcon(status) {
    const config = MARKER_CONFIG[status] || MARKER_CONFIG.prospect;
    return L.divIcon({
        className: 'custom-map-marker',
        html: `<div class="marker-pin marker-${status}" style="background:${config.bg};border-color:${config.border};border-style:${config.borderStyle}" aria-label="${config.label}">
                 <span class="marker-icon">${config.icon}</span>
               </div>`,
        iconSize: [32, 42],
        iconAnchor: [16, 42],
        popupAnchor: [0, -44],
    });
}

// ── XSS-safe popup via DOM API ──
function createPopupContent(customer, navigate) {
    const container = document.createElement('div');
    container.className = 'map-popup-content';

    const nameLink = document.createElement('a');
    nameLink.textContent = customer.full_name;
    nameLink.href = `/customers/${customer.id}`;
    nameLink.className = 'popup-customer-name';
    nameLink.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(`/customers/${customer.id}`);
    });
    container.appendChild(nameLink);

    const displayId = document.createElement('div');
    displayId.className = 'popup-display-id';
    displayId.textContent = customer.display_id;
    container.appendChild(displayId);

    if (customer.phone) {
        const phoneRow = document.createElement('div');
        phoneRow.className = 'popup-row';
        const phoneIcon = document.createElement('span');
        phoneIcon.textContent = '📞 ';
        const phoneLink = document.createElement('a');
        phoneLink.href = `tel:${customer.phone}`;
        phoneLink.textContent = customer.phone;
        phoneRow.appendChild(phoneIcon);
        phoneRow.appendChild(phoneLink);
        container.appendChild(phoneRow);
    }

    const locationParts = [];
    if (customer.village) locationParts.push(customer.village);
    if (customer.faliya) locationParts.push(customer.faliya);
    if (locationParts.length > 0) {
        const locRow = document.createElement('div');
        locRow.className = 'popup-row';
        locRow.textContent = `📍 ${locationParts.join(', ')}`;
        container.appendChild(locRow);
    }

    if (customer.landmark) {
        const landmarkRow = document.createElement('div');
        landmarkRow.className = 'popup-row popup-landmark';
        landmarkRow.textContent = `🏠 ${customer.landmark}`;
        container.appendChild(landmarkRow);
    }

    const orderRow = document.createElement('div');
    orderRow.className = 'popup-row popup-orders';
    if (customer.total_orders > 0) {
        orderRow.textContent = `📦 ${customer.total_orders} orders · ₹${Number(customer.total_spent).toLocaleString('en-IN')}`;
        container.appendChild(orderRow);
        if (customer.last_order_date) {
            const lastOrder = document.createElement('div');
            lastOrder.className = 'popup-row';
            lastOrder.textContent = `🗓️ Last: ${customer.last_order_date}`;
            if (customer.last_order_id) lastOrder.textContent += ` (${customer.last_order_id})`;
            container.appendChild(lastOrder);
        }
    } else {
        orderRow.textContent = '📦 No orders yet';
        container.appendChild(orderRow);
    }

    if (customer.customer_group) {
        const groupRow = document.createElement('div');
        groupRow.className = 'popup-row popup-group';
        groupRow.textContent = `👥 ${customer.customer_group}`;
        container.appendChild(groupRow);
    }

    return container;
}

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════

export default function CustomerMap() {
    const { fetchWithAuth, user, rbac } = useAuth();
    const navigate = useNavigate();
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const clusterGroupRef = useRef(null);
    const targetLayerRef = useRef(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [mapData, setMapData] = useState(null);
    const [filterOpen, setFilterOpen] = useState(false);

    // Phase 3: Add Target modal state
    const [addTargetOpen, setAddTargetOpen] = useState(false);
    const [placingPin, setPlacingPin] = useState(false);
    const [targetForm, setTargetForm] = useState({ name: '', latitude: '', longitude: '', target_season: '', notes: '' });
    const [canManageTargets, setCanManageTargets] = useState(false);

    // Filter state
    const savedFilters = loadFilters();
    const [filters, setFilters] = useState({
        season: savedFilters?.season || '',
        village: savedFilters?.village || '',
        status: savedFilters?.status || [...ALL_STATUSES],
        group: savedFilters?.group || '',
    });
    // Pending filters (edited but not yet applied)
    const [pendingFilters, setPendingFilters] = useState({ ...filters });

    // ── Fetch data ──
    const fetchMapData = useCallback(async (activeFilters) => {
        try {
            setLoading(true);
            setError(null);
            const queryString = buildFilterQuery(activeFilters);
            const url = ENDPOINTS.CUSTOMERS_MAP + queryString;
            const res = await fetchWithAuth(url);
            if (!res.ok) {
                if (res.status === 403) {
                    setError('You do not have permission to view the customer map.');
                } else {
                    setError('Failed to load map data.');
                }
                return;
            }
            const data = await res.json();
            setMapData(data);
        } catch (err) {
            setError('Network error loading map data.');
            console.error('Map data fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    // Initial fetch
    useEffect(() => {
        fetchMapData(filters);
        // Check if user can manage targets via RBAC
        if (rbac?.is_superuser || rbac?.permissions?.includes('customers.manage_targets')) {
            setCanManageTargets(true);
        } else {
            setCanManageTargets(false);
        }
    }, [rbac]); // Re-run when RBAC loads

    // ── Initialize Leaflet map ──
    useEffect(() => {
        if (loading || !mapRef.current || mapInstanceRef.current) return;

        const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
        });

        const satelliteLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: '&copy; Google'
        });

        const map = L.map(mapRef.current, {
            center: [20.95, 72.95],
            zoom: 10,
            zoomControl: true,
            attributionControl: true,
            layers: [satelliteLayer] // Default to satellite
        });

        L.control.layers({
            "Satellite View": satelliteLayer,
            "Street View": streetLayer
        }, null, { position: 'bottomright' }).addTo(map);

        mapInstanceRef.current = map;
        setTimeout(() => map.invalidateSize(), 100);

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, [loading]);

    // ── Render markers with clustering ──
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || !mapData || !mapData.customers) return;

        // Remove previous cluster group
        if (clusterGroupRef.current) {
            map.removeLayer(clusterGroupRef.current);
        }

        const clusterGroup = L.markerClusterGroup({
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: true,
            maxClusterRadius: 60,
            iconCreateFunction: (cluster) => {
                const markers = cluster.getAllChildMarkers();
                const active = markers.filter(m => m.options.markerStatus === 'active').length;
                const total = markers.length;
                const pct = Math.round((active / total) * 100);
                // Color based on coverage
                let clusterColor = '#ef4444'; // red < 50%
                if (pct >= 80) clusterColor = '#22c55e'; // green
                else if (pct >= 50) clusterColor = '#eab308'; // yellow
                return L.divIcon({
                    html: `<div class="cluster-badge" style="background:${clusterColor}">
                             <span class="cluster-count">${active}/${total}</span>
                           </div>`,
                    className: 'custom-cluster',
                    iconSize: [52, 52],
                });
            },
        });

        if (mapData.customers.length === 0) {
            clusterGroupRef.current = clusterGroup;
            return;
        }

        const bounds = [];
        mapData.customers.forEach(customer => {
            const lat = parseFloat(customer.latitude);
            const lng = parseFloat(customer.longitude);
            if (isNaN(lat) || isNaN(lng)) return;

            const icon = createMarkerIcon(customer.marker_status);
            const marker = L.marker([lat, lng], {
                icon,
                markerStatus: customer.marker_status,
            });

            const popupContent = createPopupContent(customer, navigate);
            marker.bindPopup(popupContent, {
                maxWidth: 280,
                minWidth: 200,
                className: 'custom-map-popup',
            });

            clusterGroup.addLayer(marker);
            bounds.push([lat, lng]);
        });

        map.addLayer(clusterGroup);
        clusterGroupRef.current = clusterGroup;

        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        }
    }, [mapData, navigate]);

    // ── Render target village pins (separate layer, not clustered) ──
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || !mapData || !mapData.target_villages) return;

        // Remove previous target layer
        if (targetLayerRef.current) {
            map.removeLayer(targetLayerRef.current);
        }

        const targetLayer = L.layerGroup();

        mapData.target_villages.forEach(tv => {
            const lat = parseFloat(tv.latitude);
            const lng = parseFloat(tv.longitude);
            if (isNaN(lat) || isNaN(lng)) return;

            const icon = L.divIcon({
                className: 'custom-map-marker',
                html: `<div class="marker-pin marker-target" style="background:#f97316;border-color:#ea580c;border-style:dashed" aria-label="Target Village">
                         <span class="marker-icon">📌</span>
                       </div>`,
                iconSize: [32, 42],
                iconAnchor: [16, 42],
                popupAnchor: [0, -44],
            });

            const marker = L.marker([lat, lng], { icon });

            // XSS-safe popup
            const container = document.createElement('div');
            container.className = 'map-popup-content';

            const title = document.createElement('div');
            title.className = 'popup-customer-name';
            title.style.color = '#f97316';
            title.textContent = `📌 ${tv.name}`;
            container.appendChild(title);

            const seasonRow = document.createElement('div');
            seasonRow.className = 'popup-row';
            seasonRow.textContent = `🗓️ Target: ${tv.season_label}`;
            container.appendChild(seasonRow);

            if (tv.notes) {
                const notesRow = document.createElement('div');
                notesRow.className = 'popup-row popup-landmark';
                notesRow.textContent = `📝 ${tv.notes}`;
                container.appendChild(notesRow);
            }

            if (tv.created_by_name) {
                const byRow = document.createElement('div');
                byRow.className = 'popup-row popup-group';
                byRow.textContent = `Added by ${tv.created_by_name}`;
                container.appendChild(byRow);
            }

            if (canManageTargets) {
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = '🗑️ Remove Target';
                deleteBtn.className = 'popup-delete-btn';
                deleteBtn.addEventListener('click', async () => {
                    if (!confirm(`Remove target village "${tv.name}"?`)) return;
                    try {
                        const res = await fetchWithAuth(`${ENDPOINTS.TARGET_VILLAGES}${tv.id}/`, { method: 'DELETE' });
                        if (res.ok || res.status === 204) {
                            fetchMapData(filters);
                        }
                    } catch (err) {
                        console.error('Delete target failed:', err);
                    }
                });
                container.appendChild(deleteBtn);
            }

            marker.bindPopup(container, { maxWidth: 280, className: 'custom-map-popup' });
            targetLayer.addLayer(marker);
        });

        targetLayer.addTo(map);
        targetLayerRef.current = targetLayer;
    }, [mapData, canManageTargets, fetchWithAuth, filters]);

    // ── Filter handlers ──
    const handleApplyFilters = () => {
        setFilters({ ...pendingFilters });
        saveFilters(pendingFilters);
        fetchMapData(pendingFilters);
        setFilterOpen(false);
    };

    const handleResetFilters = () => {
        const defaults = { season: '', village: '', status: [...ALL_STATUSES], group: '' };
        setPendingFilters(defaults);
        setFilters(defaults);
        saveFilters(defaults);
        fetchMapData(defaults);
        setFilterOpen(false);
    };

    const toggleStatus = (statusKey) => {
        setPendingFilters(prev => {
            const current = prev.status || [...ALL_STATUSES];
            if (current.includes(statusKey)) {
                // Don't allow deselecting all
                if (current.length <= 1) return prev;
                return { ...prev, status: current.filter(s => s !== statusKey) };
            }
            return { ...prev, status: [...current, statusKey] };
        });
    };

    // ── Phase 3: Add Target handlers ──
    const handleStartPlacing = () => {
        setPlacingPin(true);
        setAddTargetOpen(false);
        const map = mapInstanceRef.current;
        if (!map) return;
        map.getContainer().style.cursor = 'crosshair';
        const onClick = (e) => {
            if (e.originalEvent) {
                e.originalEvent.stopPropagation();
            }
            map.getContainer().style.cursor = '';
            map.off('click', onClick);

            // Defer React state updates slightly to prevent current click event
            // from immediately bubbling to the newly rendered backdrop
            setTimeout(() => {
                setTargetForm(prev => ({
                    ...prev,
                    latitude: e.latlng.lat.toFixed(7),
                    longitude: e.latlng.lng.toFixed(7),
                }));
                setPlacingPin(false);
                setAddTargetOpen(true);
            }, 50);
        };
        map.on('click', onClick);
    };

    const handleCancelPlacing = () => {
        setPlacingPin(false);
        const map = mapInstanceRef.current;
        if (map) map.getContainer().style.cursor = '';
    };

    const handleSaveTarget = async () => {
        if (!targetForm.name || !targetForm.latitude || !targetForm.longitude || !targetForm.target_season) return;
        try {
            const res = await fetchWithAuth(ENDPOINTS.TARGET_VILLAGES, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(targetForm),
            });
            if (res.ok || res.status === 201) {
                setAddTargetOpen(false);
                setTargetForm({ name: '', latitude: '', longitude: '', target_season: '', notes: '' });
                fetchMapData(filters);
            }
        } catch (err) {
            console.error('Save target failed:', err);
        }
    };

    // ── Render ──
    if (loading && !mapData) {
        return (
            <div className="customer-map-page">
                <div className="map-loading">
                    <div className="spinner-large"></div>
                    <p>Loading customer map data...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="customer-map-page">
                <div className="map-error">
                    <span className="error-icon">⚠️</span>
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    const stats = mapData?.stats || {};
    const season = mapData?.season || {};
    const filterOptions = mapData?.filter_options || {};

    return (
        <div className="customer-map-page">
            {/* ── Enhanced Stats Bar ── */}
            <div className="map-stats-bar">
                <span className="stats-season">{season.label}</span>
                <span className="stats-divider">|</span>
                <span className="stats-item">
                    <span className="stats-label">Villages</span>
                    <span className="stats-value">{stats.total_villages || 0}</span>
                </span>
                <span className="stats-divider">|</span>
                <span className="stats-item">
                    <span className="stats-label">Coverage</span>
                    <span className="stats-value stats-pct">{stats.coverage_pct || 0}%</span>
                </span>
                <span className="stats-divider">|</span>
                <span className="stats-item stats-active">
                    <span className="stats-dot" style={{background: '#22c55e'}}></span>
                    {stats.active || 0}
                </span>
                <span className="stats-item stats-followup">
                    <span className="stats-dot" style={{background: '#eab308'}}></span>
                    {stats.followup || 0}
                </span>
                <span className="stats-item stats-lapsed">
                    <span className="stats-dot" style={{background: '#ef4444'}}></span>
                    {stats.lapsed || 0}
                </span>
                <span className="stats-item stats-prospect">
                    <span className="stats-dot" style={{background: '#3b82f6'}}></span>
                    {stats.prospect || 0}
                </span>
                <span className="stats-divider">|</span>
                <span className="stats-total">{stats.total_mapped || 0} total</span>

                {/* Filter toggle */}
                <button
                    className={`map-filter-btn ${filterOpen ? 'active' : ''}`}
                    onClick={() => { setFilterOpen(!filterOpen); setPendingFilters({ ...filters }); }}
                    title="Toggle filters"
                >
                    <span className="filter-icon">⚙</span>
                    {(filters.village || filters.group || filters.status.length < 4 || filters.season) && (
                        <span className="map-filter-badge"></span>
                    )}
                </button>

                {/* + Target button (manager only) */}
                {canManageTargets && (
                    <button
                        className="add-target-btn"
                        onClick={() => {
                            setTargetForm({ name: '', latitude: '', longitude: '', target_season: '', notes: '' });
                            handleStartPlacing();
                        }}
                        title="Add Target Village"
                    >
                        📌+
                    </button>
                )}
            </div>

            {/* Pin placing banner */}
            {placingPin && (
                <div className="placing-banner">
                    <span>📌 Click on the map to place target village pin</span>
                    <button onClick={handleCancelPlacing}>Cancel</button>
                </div>
            )}

            {/* ── Filter Panel ── */}
            {filterOpen && (
                <>
                    <div className="filter-backdrop" onClick={() => setFilterOpen(false)}></div>
                    <div className="filter-panel">
                        <div className="filter-header">
                            <h3>Filters</h3>
                            <button className="filter-close" onClick={() => setFilterOpen(false)}>✕</button>
                        </div>

                        <div className="filter-body">
                            {/* Season */}
                            <div className="filter-field">
                                <label>Season</label>
                                <select
                                    value={pendingFilters.season}
                                    onChange={(e) => setPendingFilters(p => ({ ...p, season: e.target.value }))}
                                >
                                    <option value="">Current Season</option>
                                    {(filterOptions.seasons || []).map(s => (
                                        <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Village */}
                            <div className="filter-field">
                                <label>Village</label>
                                <select
                                    value={pendingFilters.village}
                                    onChange={(e) => setPendingFilters(p => ({ ...p, village: e.target.value }))}
                                >
                                    <option value="">All Villages</option>
                                    {(filterOptions.villages || []).map(v => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Status checkboxes */}
                            <div className="filter-field">
                                <label>Status</label>
                                <div className="status-checkboxes">
                                    {ALL_STATUSES.map(s => (
                                        <label key={s} className={`status-check ${s}`}>
                                            <input
                                                type="checkbox"
                                                checked={(pendingFilters.status || ALL_STATUSES).includes(s)}
                                                onChange={() => toggleStatus(s)}
                                            />
                                            <span className="check-dot" style={{background: MARKER_CONFIG[s].bg}}>
                                                {MARKER_CONFIG[s].icon}
                                            </span>
                                            <span className="check-label">{MARKER_CONFIG[s].label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Customer Group */}
                            <div className="filter-field">
                                <label>Customer Group</label>
                                <select
                                    value={pendingFilters.group}
                                    onChange={(e) => setPendingFilters(p => ({ ...p, group: e.target.value }))}
                                >
                                    <option value="">All Groups</option>
                                    {(filterOptions.customer_groups || []).map(g => (
                                        <option key={g} value={g}>{g}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="filter-actions">
                            <button className="btn-filter-reset" onClick={handleResetFilters}>Reset</button>
                            <button className="btn-filter-apply" onClick={handleApplyFilters}>Apply</button>
                        </div>
                    </div>
                </>
            )}

            {/* ── Map Container ── */}
            <div ref={mapRef} className="map-container" id="customer-map"></div>

            {/* ── Legend ── */}
            <div className="map-legend">
                <div className="legend-title">Legend</div>
                {Object.entries(MARKER_CONFIG).map(([key, cfg]) => (
                    <div key={key} className="legend-item">
                        <span className="legend-dot" style={{background: cfg.bg, borderStyle: cfg.borderStyle}}>{cfg.icon}</span>
                        <span className="legend-label">{cfg.label}</span>
                    </div>
                ))}
                <div className="legend-item">
                    <span className="legend-dot" style={{background: '#f97316', borderStyle: 'dashed'}}>📌</span>
                    <span className="legend-label">Target Village</span>
                </div>
            </div>

            {/* ── Loading overlay (for filter fetches) ── */}
            {loading && mapData && (
                <div className="map-loading-overlay">
                    <div className="spinner-small"></div>
                </div>
            )}

            {/* ── Empty state ── */}
            {mapData && mapData.customers.length === 0 && !loading && (
                <div className="map-empty-overlay">
                    <div className="map-empty-card">
                        <span className="empty-icon">🗺️</span>
                        <h3>No Customers Found</h3>
                        <p>
                            {filters.village || filters.group || filters.status.length < 4
                                ? 'No customers match the current filters. Try adjusting your filters.'
                                : 'Add GPS coordinates to customer addresses to see them here.'
                            }
                        </p>
                        {(filters.village || filters.group || filters.status.length < 4) && (
                            <button className="btn-reset-empty" onClick={handleResetFilters}>Reset Filters</button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Add Target Modal ── */}
            {addTargetOpen && (
                <>
                    <div className="filter-backdrop" onClick={() => setAddTargetOpen(false)}></div>
                    <div className="add-target-modal">
                        <div className="filter-header">
                            <h3>📌 Add Target Village</h3>
                            <button className="filter-close" onClick={() => setAddTargetOpen(false)}>✕</button>
                        </div>
                        <div className="filter-body">
                            <div className="filter-field">
                                <label>Village Name</label>
                                <input
                                    type="text"
                                    value={targetForm.name}
                                    onChange={(e) => setTargetForm(p => ({ ...p, name: e.target.value }))}
                                    placeholder="e.g. Khergam"
                                    autoFocus
                                />
                            </div>
                            <div className="filter-field">
                                <label>Coordinates</label>
                                <div className="coord-display">
                                    {targetForm.latitude && targetForm.longitude
                                        ? `${targetForm.latitude}, ${targetForm.longitude}`
                                        : 'Click map to set'
                                    }
                                </div>
                                <button className="btn-replace" onClick={handleStartPlacing}>📍 Re-pick on map</button>
                            </div>
                            <div className="filter-field">
                                <label>Target Season</label>
                                <select
                                    value={targetForm.target_season}
                                    onChange={(e) => setTargetForm(p => ({ ...p, target_season: e.target.value }))}
                                >
                                    <option value="">Select season...</option>
                                    {(filterOptions.seasons || []).map(s => (
                                        <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                    {/* Also offer next few years */}
                                    {[1, 2, 3].map(offset => {
                                        const y = new Date().getFullYear() + offset;
                                        return <option key={y} value={String(y)}>Dec {y} – Nov {y + 1}</option>;
                                    })}
                                </select>
                            </div>
                            <div className="filter-field">
                                <label>Notes (optional)</label>
                                <textarea
                                    value={targetForm.notes}
                                    onChange={(e) => setTargetForm(p => ({ ...p, notes: e.target.value }))}
                                    placeholder="e.g. 200+ homes, school nearby"
                                    rows={2}
                                />
                            </div>
                        </div>
                        <div className="filter-actions">
                            <button className="btn-filter-reset" onClick={() => setAddTargetOpen(false)}>Cancel</button>
                            <button
                                className="btn-filter-apply"
                                onClick={handleSaveTarget}
                                disabled={!targetForm.name || !targetForm.latitude || !targetForm.target_season}
                            >
                                Save Target
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
