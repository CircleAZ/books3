import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import 'leaflet/dist/leaflet.css';
import './CustomerLocationMap.css';

export default function CustomerLocationMap() {
    const { fetchWithAuth } = useAuth();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [filterTag, setFilterTag] = useState('');
    const [filterPincode, setFilterPincode] = useState('');
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]);

    useEffect(() => {
        fetchLocations();
    }, [filterTag, filterPincode]);

    useEffect(() => {
        if (!data || data.locations.length === 0) return;

        // Dynamic import of leaflet to avoid SSR issues
        import('leaflet').then((L) => {
            if (mapInstanceRef.current) {
                // Clear existing markers
                markersRef.current.forEach(m => m.remove());
                markersRef.current = [];
            } else {
                // Initialize map centered on India
                mapInstanceRef.current = L.map(mapRef.current, { maxZoom: 22 }).setView([20.81746, 72.88007], 11);
                L.tileLayer('https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=BQQceBuFb4tKDPHoivOL', {
                    attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                    maxZoom: 22
                }).addTo(mapInstanceRef.current);
            }

            const map = mapInstanceRef.current;

            // Add markers
            data.locations.forEach(loc => {
                const color = loc.tag_color || '#388bfd';
                const icon = L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="
                        width: 12px; height: 12px; border-radius: 50%;
                        background: ${color}; border: 2px solid white;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                    "></div>`,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                });

                const marker = L.marker([loc.latitude, loc.longitude], { icon })
                    .bindPopup(`
                        <div style="color:#111;min-width:150px">
                            <strong>${loc.customer_name}</strong><br/>
                            <small>${loc.address}</small><br/>
                            ${loc.tag ? `<span style="color:${loc.tag_color}">● ${loc.tag}</span>` : ''}
                            ${loc.pincode ? `<br/>PIN: ${loc.pincode}` : ''}
                        </div>
                    `)
                    .addTo(map);

                markersRef.current.push(marker);
            });

            // Fit bounds to markers
            if (data.locations.length > 0) {
                const bounds = L.latLngBounds(data.locations.map(l => [l.latitude, l.longitude]));
                map.fitBounds(bounds, { padding: [30, 30] });
            }
        });

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, [data]);

    const fetchLocations = async () => {
        setLoading(true);
        try {
            let url = `${ENDPOINTS.REPORTS_CUSTOMERS}locations/`;
            const params = new URLSearchParams();
            if (filterTag) params.append('tag', filterTag);
            if (filterPincode) params.append('pincode', filterPincode);
            if (params.toString()) url += `?${params.toString()}`;

            const res = await fetchWithAuth(url);
            if (res.ok) setData(await res.json());
        } catch (error) {
            console.error('Error fetching locations:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="location-map-section">
            <div className="map-header">
                <h3>📍 Customer Locations</h3>
                <div className="map-filters">
                    <input
                        type="text"
                        placeholder="Filter by pincode..."
                        value={filterPincode}
                        onChange={(e) => setFilterPincode(e.target.value)}
                        className="map-filter-input"
                    />
                    {data?.by_tag && (
                        <select
                            value={filterTag}
                            onChange={(e) => setFilterTag(e.target.value)}
                            className="map-filter-select"
                        >
                            <option value="">All Tags</option>
                            {data.by_tag.map((t, i) => (
                                <option key={i} value={t.location_tags__name}>
                                    {t.location_tags__name || 'Untagged'} ({t.count})
                                </option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {loading && <div className="map-loading">Loading map data...</div>}

            <div
                ref={mapRef}
                className="leaflet-map-container"
                style={{ height: '400px', borderRadius: '12px', overflow: 'hidden' }}
            />

            {data && (
                <div className="map-stats">
                    <span className="map-stat">📍 {data.total} locations shown</span>
                    {data.by_tag?.slice(0, 5).map((t, i) => (
                        <span key={i} className="map-tag-badge" style={{
                            borderColor: t.location_tags__color || '#666'
                        }}>
                            <span className="tag-dot" style={{
                                backgroundColor: t.location_tags__color || '#666'
                            }} />
                            {t.location_tags__name || 'Untagged'}: {t.count}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
