import { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { createPortal } from 'react-dom';
import './MapComponent.css';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import { Maximize, Minimize, Crosshair, AlertTriangle } from 'lucide-react';

// Fix for default marker icons in React Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom DivIcon for the pulsating blue dot (User's live location)
const userLocationIcon = L.divIcon({
    className: 'user-location-marker',
    html: '<div class="blue-dot"></div><div class="blue-pulse"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
});

// Component to handle map clicks
function LocationMarker({ position, onLocationSelect, readonly }) {
    const map = useMap();

    useEffect(() => {
        if (position) {
            map.flyTo(position, map.getZoom());
        }
    }, [position, map]);

    useMapEvents({
        click(e) {
            if (!readonly && onLocationSelect) {
                onLocationSelect(e.latlng);
            }
        },
    });

    return position === null ? null : (
        <Marker position={position}></Marker>
    );
}

// Component to handle auto-centering when "Locate Me" is clicked
function MapCenterer({ userLocation, triggerCenter }) {
    const map = useMap();
    useEffect(() => {
        if (userLocation && triggerCenter > 0) {
            map.flyTo(userLocation, Math.max(map.getZoom(), 15));
        }
    }, [triggerCenter, userLocation, map]); 
    return null;
}

function MapResizer({ isFullscreen }) {
    const map = useMap();
    useEffect(() => {
        const timer = setTimeout(() => {
            map.invalidateSize();
        }, 150);
        return () => clearTimeout(timer);
    }, [map, isFullscreen]);
    return null;
}

const MapOverlayButtons = ({ isFullscreen, onToggleFullscreen, onLocateMe, locationError, hasLocation }) => (
    <>
        <button 
            type="button"
            onClick={onToggleFullscreen}
            className="map-fullscreen-btn"
            title={isFullscreen ? "Exit Full Screen" : "Full Screen"}
        >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
        <button 
            type="button"
            onClick={onLocateMe}
            className={`map-locate-btn ${locationError ? 'error' : (hasLocation ? 'tracking' : '')}`}
            title={locationError ? `GPS Error: ${locationError}` : "Locate Me"}
        >
            {locationError ? <AlertTriangle size={18} /> : <Crosshair size={18} />}
        </button>
    </>
);

const MapContent = ({ center, isFullscreen, position, onLocationSelect, readonly, userLocation, accuracy, centerTrigger }) => (
    <MapContainer
        center={center}
        zoom={11}
        maxZoom={22}
        style={{ height: '100%', width: '100%', borderRadius: isFullscreen ? '0' : '8px', zIndex: 0 }}
    >
        <MapResizer isFullscreen={isFullscreen} />
        <MapCenterer userLocation={userLocation} triggerCenter={centerTrigger} />
        <LayersControl position="bottomright">
            <LayersControl.BaseLayer checked name="Satellite View">
                <TileLayer
                    attribution="&copy; Google"
                    url="https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                    maxZoom={22}
                    maxNativeZoom={20}
                    subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
                />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Street View">
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maxZoom={19}
                />
            </LayersControl.BaseLayer>
        </LayersControl>
        <LocationMarker
            position={position}
            onLocationSelect={onLocationSelect}
            readonly={readonly}
        />
        
        {/* Live User Location Overlay */}
        {userLocation && (
            <>
                <Circle 
                    center={userLocation} 
                    radius={accuracy} 
                    pathOptions={{ color: '#2196F3', fillColor: '#2196F3', fillOpacity: 0.15, weight: 1 }} 
                />
                <Marker position={userLocation} icon={userLocationIcon} interactive={false} />
            </>
        )}
    </MapContainer>
);

const MapComponent = ({ position, onLocationSelect, height = '300px', readonly = false }) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const { showToast } = useToast();
    
    // Live Location State
    const [userLocation, setUserLocation] = useState(null);
    const [accuracy, setAccuracy] = useState(0);
    const [locationError, setLocationError] = useState(null);
    const [centerTrigger, setCenterTrigger] = useState(0); // Incremented to trigger flyTo
    
    // Default center (Navsari/South Gujarat)
    const defaultCenter = [20.81746, 72.88007];
    const center = position || defaultCenter;

    // Watch user's live location
    useEffect(() => {
        if (!navigator.geolocation) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLocationError('Geolocation not supported by this browser.');
            return;
        }

        // UNMOUNTING EXPLANATION:
        // When the map is closed/removed from screen, the return function below 
        // calls `clearWatch`. This stops the GPS hardware from actively tracking, 
        // saving the salesman's battery life.
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                setUserLocation([latitude, longitude]);
                setAccuracy(accuracy);
                setLocationError(null);
// fallow-ignore-next-line code-duplication
            },
            (err) => {
                console.warn('GPS Error:', err.message);
                setLocationError(err.message);
            },
            {
                enableHighAccuracy: true,
                timeout: 60000, // 60 seconds to allow mobile GPS cold start
                maximumAge: 10000 // 10 seconds cache to speed up initial lock
            }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    const handleLocateMe = () => {
        if (locationError) {
            showToast(`GPS Error: ${locationError}\nPlease ensure location permissions are granted.`, 'error');
            return;
        }
        if (userLocation) {
            setCenterTrigger(prev => prev + 1);
        } else {
            showToast("Waiting for GPS signal...", 'info');
        }
    };

    // Lock body scroll when fullscreen
    useEffect(() => {
        if (isFullscreen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isFullscreen]);

    // Escape key to exit fullscreen
    useEffect(() => {
        if (!isFullscreen) return;
        const handler = (e) => { if (e.key === 'Escape') setIsFullscreen(false); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isFullscreen]);

    // Normal (inline) view
    if (!isFullscreen) {
        return (
            <div style={{ height, width: '100%', position: 'relative' }}>
                <MapOverlayButtons 
                    isFullscreen={false} 
                    onToggleFullscreen={() => setIsFullscreen(true)}
                    onLocateMe={handleLocateMe}
                    locationError={locationError}
                    hasLocation={!!userLocation}
                />
                <MapContent
                    center={center}
                    isFullscreen={false}
                    position={position}
                    onLocationSelect={onLocationSelect}
                    readonly={readonly}
                    userLocation={userLocation}
                    accuracy={accuracy}
                    centerTrigger={centerTrigger}
                />
            </div>
        );
    }

    // Fullscreen view — portaled to document.body to escape all stacking contexts
    return (
        <>
            {/* Keep a placeholder so layout doesn't collapse */}
            <div style={{ height, width: '100%' }} />
            {createPortal(
                <div className="map-fullscreen-overlay">
                    <MapOverlayButtons 
                        isFullscreen={true} 
                        onToggleFullscreen={() => setIsFullscreen(false)}
                        onLocateMe={handleLocateMe}
                        locationError={locationError}
                        hasLocation={!!userLocation}
                    />
                    <MapContent
                        center={center}
                        isFullscreen={true}
                        position={position}
                        onLocationSelect={onLocationSelect}
                        readonly={readonly}
                        userLocation={userLocation}
                        accuracy={accuracy}
                        centerTrigger={centerTrigger}
                    />
                </div>,
                document.body
            )}
        </>
    );
};

export default MapComponent;
