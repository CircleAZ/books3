import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import { Crosshair, AlertTriangle } from 'lucide-react';
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
    const boundaryLayerRef = useRef(null);


    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [mapData, setMapData] = useState(null);
    const [filterOpen, setFilterOpen] = useState(false);

    // Live Location State & Refs
    const [locationError, setLocationError] = useState(null);
    const [userLocation, setUserLocation] = useState(null);
    const userMarkerRef = useRef(null);
    const userAccuracyCircleRef = useRef(null);

    // Phase 3: Add Target modal state
    const [addTargetOpen, setAddTargetOpen] = useState(false);
    const [placingPin, setPlacingPin] = useState(false);
    const [targetForm, setTargetForm] = useState({ name: '', latitude: '', longitude: '', target_season: '', notes: '' });
    const [canManageTargets, setCanManageTargets] = useState(false);



    // Phase 5: Potential Customer pins
    const [placingPotentialPin, setPlacingPotentialPin] = useState(false);
    const [potentialEditOpen, setPotentialEditOpen] = useState(false);
    const [potentialEditForm, setPotentialEditForm] = useState({ id: null, latitude: '', longitude: '', notes: '' });
    const [potentialSidebarOpen, setPotentialSidebarOpen] = useState(false);
    const [showPotentialPins, setShowPotentialPins] = useState(true);
    const [canManageCustomers, setCanManageCustomers] = useState(false);

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
        // Phase 5: Check if user can manage customers (for Drop Pin)
        setCanManageCustomers(
            rbac?.is_superuser || rbac?.permissions?.includes('customers.manage_customers') || false
        );
    }, [rbac]); // Re-run when RBAC loads

    // ── Initialize Leaflet map ──
    useEffect(() => {
        if (loading || !mapRef.current || mapInstanceRef.current) return;

        const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
        });

        const satelliteLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
            maxZoom: 22,
            maxNativeZoom: 20,
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

    // ── Live GPS Tracking ──
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return; // Wait until map initializes
        
        if (!navigator.geolocation) {
            setLocationError('Geolocation not supported by this browser.');
            return;
        }

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                const latlng = [latitude, longitude];
                setUserLocation(latlng);
                setLocationError(null);

                // Update or create accuracy circle
                if (userAccuracyCircleRef.current) {
                    userAccuracyCircleRef.current.setLatLng(latlng);
                    userAccuracyCircleRef.current.setRadius(accuracy);
                } else {
                    userAccuracyCircleRef.current = L.circle(latlng, {
                        radius: accuracy,
                        color: '#2196F3',
                        fillColor: '#2196F3',
                        fillOpacity: 0.15,
                        weight: 1
                    }).addTo(map);
                }

                // Update or create blue dot marker
                if (userMarkerRef.current) {
                    userMarkerRef.current.setLatLng(latlng);
                } else {
                    const icon = L.divIcon({
                        className: 'user-location-marker',
                        html: '<div class="blue-pulse"></div><div class="blue-dot"></div>',
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    });
                    userMarkerRef.current = L.marker(latlng, { icon, interactive: false, zIndexOffset: 1000 }).addTo(map);
                }
            },
            (err) => {
                console.warn('GPS Error:', err.message);
                setLocationError(err.message);
            },
            { enableHighAccuracy: true, timeout: 60000, maximumAge: 10000 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, [loading]); // Mount when loading finishes and map exists

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
                const standardMarkers = markers.filter(m => m.options.isStandard);
                const potentialMarkers = markers.filter(m => m.options.isPotential);
                
                const active = standardMarkers.filter(m => m.options.markerStatus === 'active').length;
                const totalStandard = standardMarkers.length;
                const totalPotential = potentialMarkers.length;
                
                let pct = 0;
                if (totalStandard > 0) {
                    pct = Math.round((active / totalStandard) * 100);
                }
                
                let clusterColor = '#ef4444'; // red < 50%
                if (pct >= 80) clusterColor = '#22c55e'; // green
                else if (pct >= 50) clusterColor = '#eab308'; // yellow
                
                // If it's ONLY potential customers
                if (totalStandard === 0 && totalPotential > 0) {
                    clusterColor = '#6b7280'; // gray for pure potential
                }
                
                let htmlContent = '';
                if (totalStandard > 0 && totalPotential > 0) {
                    htmlContent = `<span class="cluster-count" style="line-height: 1; margin-bottom: 2px; font-size: 13px;">${active}/${totalStandard}</span>
                                   <span style="font-size: 10.5px; opacity: 0.95; line-height: 1; font-weight: 700; color: #fff;">+${totalPotential}</span>`;
                } else if (totalStandard > 0) {
                    htmlContent = `<span class="cluster-count">${active}/${totalStandard}</span>`;
                } else {
                    htmlContent = `<span class="cluster-count">+${totalPotential}</span>`;
                }

                return L.divIcon({
                    html: `<div class="cluster-badge" style="background:${clusterColor}; width: 60px; height: 60px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0; flex-shrink: 0;">
                             ${htmlContent}
                           </div>`,
                    className: 'custom-cluster',
                    iconSize: [60, 60],
                });
            },
        });

        const bounds = [];
        
        // --- 1. Standard Customers ---
        if (mapData.customers && mapData.customers.length > 0) {
            mapData.customers.forEach(customer => {
                const lat = parseFloat(customer.latitude);
                const lng = parseFloat(customer.longitude);
                if (isNaN(lat) || isNaN(lng)) return;

                const icon = createMarkerIcon(customer.marker_status);
                const marker = L.marker([lat, lng], {
                    icon,
                    markerStatus: customer.marker_status,
                    isStandard: true
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
        }

        // --- 2. Potential Customers ---
        if (showPotentialPins && mapData.potential_customers) {
            mapData.potential_customers.forEach(pc => {
                const lat = parseFloat(pc.latitude);
                const lng = parseFloat(pc.longitude);
                if (isNaN(lat) || isNaN(lng)) return;

                const dissolved = pc.is_dissolved;
                
                // SVG icon for potential
                const potentialSvg = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%; filter: drop-shadow(0px 3px 4px rgba(0,0,0,0.6));">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M8 16L3.54223 12.3383C1.93278 11.0162 1 9.04287 1 6.96005C1 3.11612 4.15607 0 8 0C11.8439 0 15 3.11612 15 6.96005C15 9.04287 14.0672 11.0162 12.4578 12.3383L8 16ZM3 6H5C6.10457 6 7 6.89543 7 8V9L3 7.5V6ZM11 6C9.89543 6 9 6.89543 9 8V9L13 7.5V6H11Z" fill="currentColor"/>
                </svg>`;

                const icon = L.divIcon({
                    className: `custom-map-marker marker-potential ${dissolved ? 'marker-potential-dissolved' : ''}`,
                    html: `<div class="marker-pin-potential" aria-label="${dissolved ? 'Linked location' : 'Potential customer'}" style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; color: #ec4899; background: transparent; border: none; transform: none !important; box-shadow: none;">
                             ${potentialSvg}
                           </div>`,
                    iconSize: [36, 36],
                    iconAnchor: [18, 36],
                    popupAnchor: [0, -38],
                });

                const marker = L.marker([lat, lng], { 
                    icon,
                    isPotential: true 
                });

                // XSS-safe popup
                const container = document.createElement('div');
                container.className = 'map-popup-content';

                if (dissolved) {
                    const title = document.createElement('div');
                    title.className = 'popup-customer-name';
                    title.style.color = '#888';
                    title.textContent = `🔗 Linked → ${pc.dissolved_into_name || 'Customer'}`;
                    container.appendChild(title);
                }

                if (pc.notes) {
                    const notesRow = document.createElement('div');
                    notesRow.className = 'popup-row';
                    notesRow.textContent = `📝 ${pc.notes}`;
                    container.appendChild(notesRow);
                } else if (!dissolved) {
                    const noNote = document.createElement('div');
                    noNote.className = 'popup-row popup-landmark';
                    noNote.textContent = '(no note)';
                    container.appendChild(noNote);
                }

                const metaRow = document.createElement('div');
                metaRow.className = 'popup-row popup-group';
                metaRow.textContent = `👤 ${pc.created_by_name || 'Unknown'}`;
                if (pc.created_at) {
                    metaRow.textContent += ` · ${new Date(pc.created_at).toLocaleDateString()}`;
                }
                container.appendChild(metaRow);

                // Action buttons (only for active pins, with permission)
                if (!dissolved && canManageCustomers) {
                    const actions = document.createElement('div');
                    actions.className = 'popup-potential-actions';

                    const editBtn = document.createElement('button');
                    editBtn.textContent = '✏️ Edit';
                    editBtn.className = 'popup-edit-btn';
                    editBtn.addEventListener('click', () => {
                        map.closePopup();
                        setPotentialEditForm({
                            id: pc.id,
                            latitude: pc.latitude,
                            longitude: pc.longitude,
                            notes: pc.notes || '',
                        });
                        setPotentialEditOpen(true);
                    });
                    actions.appendChild(editBtn);

                    const deleteBtn = document.createElement('button');
                    deleteBtn.textContent = '🗑️ Delete';
                    deleteBtn.className = 'popup-delete-potential-btn';
                    deleteBtn.addEventListener('click', async () => {
                        if (!confirm('Delete this potential customer pin?')) return;
                        try {
                            const res = await fetchWithAuth(`${ENDPOINTS.POTENTIAL_CUSTOMERS}${pc.id}/`, { method: 'DELETE' });
                            if (res.ok || res.status === 204) {
                                fetchMapData(filters);
                            }
                        } catch (err) {
                            console.error('Delete potential pin failed:', err);
                        }
                    });
                    actions.appendChild(deleteBtn);
                    container.appendChild(actions);
                }

                marker.bindPopup(container, { maxWidth: 280, className: 'custom-map-popup' });
                clusterGroup.addLayer(marker);
                bounds.push([lat, lng]);
            });
        }

        map.addLayer(clusterGroup);
        clusterGroupRef.current = clusterGroup;

        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        }
    }, [mapData, showPotentialPins, canManageCustomers, fetchWithAuth, filters, navigate]);

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

    // ── Phase 5: Render Village Boundary ──
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        // Clean up previous boundary
        if (boundaryLayerRef.current) {
            map.removeLayer(boundaryLayerRef.current);
            boundaryLayerRef.current = null;
        }

        // Only draw if a specific village is filtered
        if (filters.village && mapData?.village_boundaries) {
            const boundaryCoords = mapData.village_boundaries[filters.village.toLowerCase()];
            if (boundaryCoords && boundaryCoords.length > 0) {
                const polygon = L.polygon(boundaryCoords, {
                    color: '#3b82f6',     // Tailwind blue-500
                    fillColor: '#3b82f6',
                    fillOpacity: 0.15,
                    weight: 2,
                    dashArray: '5, 5',
                });
                
                polygon.addTo(map);
                boundaryLayerRef.current = polygon;
                
                // Fit bounds to polygon with some padding
                map.fitBounds(polygon.getBounds(), { padding: [20, 20], maxZoom: 16 });
            }
        }
    }, [mapData, filters.village]);

    // Removed: Potential pins are now handled in the main cluster useEffect

    // ── Phase 5: Drop Pin handlers ──
    const handleStartDropPin = () => {
        setPlacingPotentialPin(true);
        const map = mapInstanceRef.current;
        if (!map) return;
        map.getContainer().style.cursor = 'crosshair';
        const onClick = (e) => {
            if (e.originalEvent) e.originalEvent.stopPropagation();
            map.getContainer().style.cursor = '';
            map.off('click', onClick);
            setTimeout(() => {
                setPotentialEditForm({
                    id: null,
                    latitude: e.latlng.lat.toFixed(7),
                    longitude: e.latlng.lng.toFixed(7),
                    notes: '',
                });
                setPlacingPotentialPin(false);
                setPotentialEditOpen(true);
            }, 50);
        };
        map.on('click', onClick);
    };

    const handleCancelDropPin = () => {
        setPlacingPotentialPin(false);
        const map = mapInstanceRef.current;
        if (map) map.getContainer().style.cursor = '';
    };

    const handleSavePotential = async () => {
        const { id, latitude, longitude, notes } = potentialEditForm;
        if (!latitude || !longitude) return;
        try {
            const payload = { latitude: parseFloat(latitude), longitude: parseFloat(longitude), notes };
            let res;
            if (id) {
                res = await fetchWithAuth(`${ENDPOINTS.POTENTIAL_CUSTOMERS}${id}/`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await fetchWithAuth(ENDPOINTS.POTENTIAL_CUSTOMERS, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }
            if (res.ok || res.status === 201) {
                setPotentialEditOpen(false);
                setPotentialEditForm({ id: null, latitude: '', longitude: '', notes: '' });
                fetchMapData(filters);
            } else {
                const err = await res.json().catch(() => ({}));
                const msg = err.location || err.detail || 'Failed to save pin.';
                alert(Array.isArray(msg) ? msg[0] : msg);
            }
        } catch (err) {
            console.error('Save potential pin failed:', err);
        }
    };

    const handleBulkPurge = async () => {
        const confirmText = prompt('Type PURGE to confirm deleting all previous season pins:');
        if (confirmText !== 'PURGE') return;
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.POTENTIAL_CUSTOMERS}bulk-purge/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirm: 'PURGE' }),
            });
            if (res.ok) {
                const data = await res.json();
                alert(data.detail || 'Purge complete.');
                fetchMapData(filters);
            } else {
                const err = await res.json().catch(() => ({}));
                alert(err.detail || 'Purge failed.');
            }
        } catch (err) {
            console.error('Bulk purge failed:', err);
        }
    };

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

                {/* Drop Pin button (potential customers) */}
                {canManageCustomers && (
                    <button
                        className="drop-pin-btn"
                        onClick={handleStartDropPin}
                        title="Drop Potential Customer Pin"
                    >
                        🧑+
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

            {/* Potential pin placing banner */}
            {placingPotentialPin && (
                <div className="placing-banner-potential">
                    <span>🧑 Tap on the map to mark a location</span>
                    <button onClick={handleCancelDropPin}>Cancel</button>
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

            {/* ── Locate Me Button ── */}
            <button
                className="map-locate-btn"
                onClick={() => {
                    if (locationError) {
                        alert(`GPS Error: ${locationError}\nPlease ensure location permissions are granted.`);
                        return;
                    }
                    if (userLocation && mapInstanceRef.current) {
                        mapInstanceRef.current.flyTo(userLocation, 16);
                    } else {
                        alert("Waiting for GPS signal...");
                    }
                }}
                title="Locate Me"
            >
                {locationError ? <AlertTriangle size={20} color="#ef4444" /> : <Crosshair size={20} color={userLocation ? "#2196F3" : "#666"} />}
            </button>

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
                <div className="legend-item">
                    <label style={{display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer'}}>
                        <input
                            type="checkbox"
                            checked={showPotentialPins}
                            onChange={(e) => setShowPotentialPins(e.target.checked)}
                            style={{width: '12px', height: '12px', accentColor: '#FF00D9', margin: 0}}
                        />
                        <span className="legend-dot" style={{background: '#FF00D9', border: '2px solid #F9F6C4'}}>🧑</span>
                        <span className="legend-label">Potential</span>
                    </label>
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

            {/* ── Phase 5: Potential Pin Sidebar Toggle ── */}
            {canManageCustomers && (
                <button
                    className="potential-sidebar-toggle"
                    onClick={() => setPotentialSidebarOpen(!potentialSidebarOpen)}
                    title="Potential Customer List"
                >
                    🧑
                </button>
            )}

            {/* ── Phase 5: Potential Customer Sidebar (M9) ── */}
            {potentialSidebarOpen && (() => {
                const activePins = (mapData?.potential_customers || []).filter(pc => !pc.is_dissolved);
                return (
                    <div className="potential-sidebar">
                        <div className="potential-sidebar-header">
                            <h3>
                                🧑 Marked Locations
                                <span className="sidebar-count">{activePins.length}</span>
                            </h3>
                            <button className="filter-close" onClick={() => setPotentialSidebarOpen(false)}>✕</button>
                        </div>
                        <div className="potential-sidebar-list">
                            {activePins.length === 0 ? (
                                <div className="potential-sidebar-empty">No marked locations yet</div>
                            ) : (
                                activePins.map(pc => (
                                    <div
                                        key={pc.id}
                                        className="potential-sidebar-item"
                                        onClick={() => {
                                            const map = mapInstanceRef.current;
                                            if (map) {
                                                map.flyTo([parseFloat(pc.latitude), parseFloat(pc.longitude)], 18);
                                            }
                                            setPotentialSidebarOpen(false);
                                        }}
                                    >
                                        <div className="potential-sidebar-item-note">
                                            {pc.notes || '(no note)'}
                                        </div>
                                        <div className="potential-sidebar-item-meta">
                                            <span>👤 {pc.created_by_name || 'Unknown'}</span>
                                            <span>📅 {pc.created_at ? new Date(pc.created_at).toLocaleDateString() : ''}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        {rbac?.is_superuser && (
                            <div className="potential-sidebar-purge">
                                <button className="btn-bulk-purge" onClick={handleBulkPurge}>
                                    🗑️ Clear Previous Season Pins
                                </button>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* ── Phase 5: Potential Customer Edit/Create Modal ── */}
            {potentialEditOpen && (
                <>
                    <div className="filter-backdrop" onClick={() => setPotentialEditOpen(false)}></div>
                    <div className="potential-edit-modal">
                        <div className="filter-header">
                            <h3 style={{color: '#FF00D9'}}>
                                🧑 {potentialEditForm.id ? 'Edit Location' : 'Mark Location'}
                            </h3>
                            <button className="filter-close" onClick={() => setPotentialEditOpen(false)}>✕</button>
                        </div>
                        <div className="filter-body">
                            <div className="filter-field">
                                <label>Coordinates</label>
                                <div className="coord-display">
                                    {potentialEditForm.latitude && potentialEditForm.longitude
                                        ? `${potentialEditForm.latitude}, ${potentialEditForm.longitude}`
                                        : 'Click map to set'
                                    }
                                </div>
                                {potentialEditForm.id && (
                                    <button
                                        className="btn-replace"
                                        onClick={() => {
                                            setPotentialEditOpen(false);
                                            setPlacingPotentialPin(true);
                                            const map = mapInstanceRef.current;
                                            if (!map) return;
                                            map.getContainer().style.cursor = 'crosshair';
                                            const onClick = (e) => {
                                                if (e.originalEvent) e.originalEvent.stopPropagation();
                                                map.getContainer().style.cursor = '';
                                                map.off('click', onClick);
                                                setTimeout(() => {
                                                    setPotentialEditForm(prev => ({
                                                        ...prev,
                                                        latitude: e.latlng.lat.toFixed(7),
                                                        longitude: e.latlng.lng.toFixed(7),
                                                    }));
                                                    setPlacingPotentialPin(false);
                                                    setPotentialEditOpen(true);
                                                }, 50);
                                            };
                                            map.on('click', onClick);
                                        }}
                                    >
                                        📍 Re-pick on map
                                    </button>
                                )}
                            </div>
                            <div className="filter-field">
                                <label>Notes (optional)</label>
                                <textarea
                                    value={potentialEditForm.notes}
                                    onChange={(e) => setPotentialEditForm(p => ({ ...p, notes: e.target.value }))}
                                    placeholder="e.g. Blue house near temple"
                                    rows={2}
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="filter-actions">
                            <button className="btn-filter-reset" onClick={() => setPotentialEditOpen(false)}>Cancel</button>
                            <button
                                className="btn-filter-apply"
                                style={{background: '#FF00D9'}}
                                onClick={handleSavePotential}
                                disabled={!potentialEditForm.latitude || !potentialEditForm.longitude}
                            >
                                {potentialEditForm.id ? 'Save Changes' : 'Drop Pin'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
