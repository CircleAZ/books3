import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import { useAuth } from '../../context/AuthContext';

import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import './GeographicBoundaries.css';

// Fix for leaflet-draw missing icon issues if any (usually not an issue for polygons)

export default function GeographicBoundaries() {
    const [regions, setRegions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRegion, setEditingRegion] = useState(null);
    
    const [formData, setFormData] = useState({
        name: '',
        layer: 'village',
        pincode: '',
        color: '#ff0000',
        boundary: null
    });

    const fetchRegions = async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(ENDPOINTS.GEO_REGIONS_CRUD);
            if (response.ok) {
                const data = await response.json();
                setRegions(data);
            } else {
                showToast('Failed to fetch regions', 'error');
            }
        } catch (error) {
            showToast('Error fetching regions', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRegions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSyncCustomers = async () => {
        if (!window.confirm("Re-syncing customers might take a moment and run in the background. Proceed?")) {
            return;
        }
        setSyncing(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.GEO_REGIONS_CRUD}sync_customers/`, {
                method: 'POST'
            });
            if (response.ok) {
                showToast('Background sync started successfully.', 'success');
            } else {
                showToast('Failed to trigger sync', 'error');
            }
        } catch (err) {
            showToast('Error triggering sync', 'error');
        } finally {
            setSyncing(false);
        }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Are you sure you want to delete ${name}? This will soft-delete the boundary.`)) {
            return;
        }
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.GEO_REGIONS_CRUD}${id}/`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast('Region deleted', 'success');
                fetchRegions();
            } else {
                showToast('Failed to delete', 'error');
            }
        } catch (err) {
            showToast('Error deleting region', 'error');
        }
    };

    const openCreateModal = () => {
        setEditingRegion(null);
        setFormData({
            name: '',
            layer: 'village',
            pincode: '',
            color: '#ff0000',
            boundary: null
        });
        setIsModalOpen(true);
    };

    const openEditModal = (region) => {
        setEditingRegion(region);
        setFormData({
            name: region.name,
            layer: region.layer,
            pincode: region.pincode || '',
            color: region.color || '#ff0000',
            boundary: region.boundary // GeoJSON dict
        });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingRegion(null);
    };

    const handleSave = async () => {
        if (!formData.name) {
            showToast('Name is required', 'error');
            return;
        }
        if (!formData.boundary) {
            showToast('Please draw a boundary on the map', 'error');
            return;
        }

        const url = editingRegion 
            ? `${ENDPOINTS.GEO_REGIONS_CRUD}${editingRegion.id}/` 
            : ENDPOINTS.GEO_REGIONS_CRUD;
        
        const method = editingRegion ? 'PATCH' : 'POST';

        try {
            const response = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                showToast(`Region ${editingRegion ? 'updated' : 'created'} successfully`, 'success');
                closeModal();
                fetchRegions();
            } else {
                const text = await response.text();
                console.error(`[Boundaries] Save failed: ${response.status}`, text);
                let data;
                try { data = JSON.parse(text); } catch { data = {}; }
                // Extract error message
                let errorMsg = 'Failed to save region';
                if (data.boundary) {
                    errorMsg = Array.isArray(data.boundary) ? data.boundary[0] : data.boundary;
                } else if (data.non_field_errors) {
                    errorMsg = Array.isArray(data.non_field_errors) ? data.non_field_errors[0] : data.non_field_errors;
                } else if (data.detail) {
                    errorMsg = data.detail;
                } else if (text) {
                    errorMsg = text.substring(0, 200);
                }
                showToast(errorMsg, 'error');
            }
        } catch (err) {
            console.error('[Boundaries] Network error:', err);
            showToast('Network error while saving', 'error');
        }
    };

    const onCreated = (e, fg) => {
        const { layer } = e;
        const geojson = layer.toGeoJSON().geometry;
        
        // If there was an existing boundary, remove it so we only have one
        const layers = fg.getLayers();
        if (layers.length > 0) {
            layers.forEach(l => fg.removeLayer(l));
        }
        
        fg.addLayer(layer);
        setFormData(prev => ({ ...prev, boundary: geojson }));
    };

    const onEdited = (e) => {
        const { layers } = e;
        layers.eachLayer(layer => {
            const geojson = layer.toGeoJSON().geometry;
            setFormData(prev => ({ ...prev, boundary: geojson }));
        });
    };

    const onDeleted = () => {
        setFormData(prev => ({ ...prev, boundary: null }));
    };

    // Filter regions of the SAME layer to show as background context
    const backgroundRegions = regions.filter(r => 
        r.layer === formData.layer && (!editingRegion || r.id !== editingRegion.id)
    );

    // Initial map center (Navsari default)
    const mapCenter = [20.9467, 72.9322];
    const mapZoom = 12;

    return (
        <div className="boundaries-page">
            <div className="boundaries-header">
                <div>
                    <h1>Geocoding Boundaries</h1>
                    <p>Manage spatial polygons for districts, talukas, and villages</p>
                </div>
                <div className="boundaries-actions">
                    <button 
                        className={`sync-btn ${syncing ? 'loading' : ''}`} 
                        onClick={handleSyncCustomers}
                        disabled={syncing}
                    >
                        {syncing ? 'Syncing...' : 'Re-sync Customers'}
                    </button>
                    <button className="add-btn" onClick={openCreateModal}>
                        + Add Boundary
                    </button>
                </div>
            </div>

            <div className="boundaries-card">
                <table className="boundaries-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Layer</th>
                            <th>Pincode</th>
                            <th>Color</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="5" style={{textAlign: 'center'}}>Loading regions...</td></tr>
                        ) : regions.length === 0 ? (
                            <tr><td colSpan="5" style={{textAlign: 'center'}}>No boundaries found.</td></tr>
                        ) : (
                            regions.map(region => (
                                <tr key={region.id}>
                                    <td><strong>{region.name}</strong></td>
                                    <td style={{textTransform: 'capitalize'}}>{region.layer}</td>
                                    <td>{region.pincode || '-'}</td>
                                    <td>
                                        <span 
                                            className="color-indicator" 
                                            style={{ backgroundColor: region.color || '#ccc' }}
                                        ></span>
                                    </td>
                                    <td>
                                        <button className="action-btn" onClick={() => openEditModal(region)}>Edit</button>
                                        <button className="action-btn delete" onClick={() => handleDelete(region.id, region.name)}>Delete</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <div className="boundary-modal-overlay">
                    <div className="boundary-modal">
                        <div className="modal-header">
                            <h2>{editingRegion ? `Edit ${editingRegion.name}` : 'New Boundary'}</h2>
                            <button className="close-btn" onClick={closeModal}>&times;</button>
                        </div>
                        
                        <div className="modal-body">
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Name</label>
                                    <input 
                                        type="text" 
                                        value={formData.name} 
                                        onChange={e => setFormData({...formData, name: e.target.value})}
                                        placeholder="e.g. Krushnapur"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Layer</label>
                                    <select 
                                        value={formData.layer}
                                        onChange={e => setFormData({...formData, layer: e.target.value})}
                                    >
                                        <option value="village">Village</option>
                                        <option value="taluka">Taluka</option>
                                        <option value="district">District</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Pincode</label>
                                    <input 
                                        type="text" 
                                        value={formData.pincode} 
                                        onChange={e => setFormData({...formData, pincode: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Color</label>
                                    <input 
                                        type="color" 
                                        value={formData.color} 
                                        onChange={e => setFormData({...formData, color: e.target.value})}
                                        style={{padding: '0.25rem', height: '42px', width: '100%'}}
                                    />
                                </div>
                            </div>

                            <div className="map-container-wrapper">
                                <label>
                                    Boundary Map
                                    <span className="map-help">Existing {formData.layer}s are shown as context.</span>
                                </label>
                                <div className="map-container">
                                    <MapContainer 
                                        center={mapCenter} 
                                        zoom={mapZoom} 
                                        style={{ height: '100%', width: '100%' }}
                                    >
                                        <TileLayer
                                            url="https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}"
                                            maxZoom={20}
                                            subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
                                        />
                                        
                                        {/* Context Boundaries (Read-only) */}
                                        {backgroundRegions.map(r => (
                                            r.boundary && r.boundary.coordinates && (
                                                <Polygon 
                                                    key={`bg-${r.id}`}
                                                    positions={r.boundary.coordinates[0].map(coord => [coord[1], coord[0]])}
                                                    pathOptions={{ 
                                                        color: r.color || '#ffffff', 
                                                        fillOpacity: 0.1, 
                                                        weight: 2,
                                                        dashArray: '5, 10'
                                                    }}
                                                />
                                            )
                                        ))}

                                        <MapDrawControl 
                                            onCreated={onCreated}
                                            onEdited={onEdited}
                                            onDeleted={onDeleted}
                                            color={formData.color}
                                            initialGeoJSON={formData.boundary}
                                        />
                                        <MapBoundsUpdater editingRegion={editingRegion} />
                                    </MapContainer>
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="cancel-btn" onClick={closeModal}>Cancel</button>
                            <button className="save-btn" onClick={handleSave}>Save Boundary</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Native Leaflet-Draw integration
function MapDrawControl({ onCreated, onEdited, onDeleted, color, initialGeoJSON }) {
    const map = useMap();
    const featureGroupRef = useRef(null);
    
    // Use refs to always have the latest callbacks, preventing stale closures
    // in the Leaflet event handlers which persist across React re-renders.
    const onCreatedRef = useRef(onCreated);
    const onEditedRef = useRef(onEdited);
    const onDeletedRef = useRef(onDeleted);
    useEffect(() => { onCreatedRef.current = onCreated; }, [onCreated]);
    useEffect(() => { onEditedRef.current = onEdited; }, [onEdited]);
    useEffect(() => { onDeletedRef.current = onDeleted; }, [onDeleted]);

    useEffect(() => {
        if (!featureGroupRef.current) {
            featureGroupRef.current = new L.FeatureGroup();
            map.addLayer(featureGroupRef.current);
            
            // If editing an existing region, preload it
            if (initialGeoJSON && initialGeoJSON.coordinates) {
                try {
                    const polygon = L.polygon(
                        initialGeoJSON.coordinates[0].map(c => [c[1], c[0]]),
                        { color: color, weight: 3 }
                    );
                    featureGroupRef.current.addLayer(polygon);
                } catch(e) {}
            }
        }

        const drawControl = new L.Control.Draw({
            edit: {
                featureGroup: featureGroupRef.current,
                remove: true
            },
            draw: {
                polygon: {
                    allowIntersection: false,
                    drawError: {
                        color: '#e1e100',
                        message: '<strong>Error:</strong> polygon edges cannot cross!'
                    },
                    shapeOptions: {
                        color: color
                    }
                },
                polyline: false,
                circle: false,
                marker: false,
                circlemarker: false,
                rectangle: false
            }
        });
        
        map.addControl(drawControl);

        // Use stable handler functions that dereference the latest callback via ref
        const handleCreated = (e) => onCreatedRef.current(e, featureGroupRef.current);
        const handleEdited = (e) => onEditedRef.current(e);
        const handleDeleted = (e) => onDeletedRef.current(e);

        map.on(L.Draw.Event.CREATED, handleCreated);
        map.on(L.Draw.Event.EDITED, handleEdited);
        map.on(L.Draw.Event.DELETED, handleDeleted);

        return () => {
            map.removeControl(drawControl);
            map.off(L.Draw.Event.CREATED, handleCreated);
            map.off(L.Draw.Event.EDITED, handleEdited);
            map.off(L.Draw.Event.DELETED, handleDeleted);
        };
    }, [map, color]);

    return null;
}

// Helper component to auto-center map on the editing region
function MapBoundsUpdater({ editingRegion }) {
    const map = useMap();
    useEffect(() => {
        if (editingRegion && editingRegion.boundary && editingRegion.boundary.coordinates) {
            try {
                const coords = editingRegion.boundary.coordinates[0].map(c => [c[1], c[0]]);
                if (coords.length > 0) {
                    map.fitBounds(coords, { padding: [20, 20] });
                }
            } catch(e) {
                // Ignore bounds error
            }
        }
    }, [editingRegion, map]);
    return null;
}

