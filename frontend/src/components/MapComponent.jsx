import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './MapComponent.css';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import { Maximize, Minimize } from 'lucide-react';

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

const FullscreenButton = ({ isFullscreen, onClick }) => (
    <button 
        type="button"
        onClick={onClick}
        className="map-fullscreen-btn"
        title={isFullscreen ? "Exit Full Screen" : "Full Screen"}
    >
        {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
    </button>
);

const MapContent = ({ center, isFullscreen, position, onLocationSelect, readonly }) => (
    <MapContainer
        center={center}
        zoom={11}
        maxZoom={22}
        style={{ height: '100%', width: '100%', borderRadius: isFullscreen ? '0' : '8px', zIndex: 0 }}
    >
        <MapResizer isFullscreen={isFullscreen} />
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
    </MapContainer>
);

const MapComponent = ({ position, onLocationSelect, height = '300px', readonly = false }) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // Default center (Navsari/South Gujarat)
    const defaultCenter = [20.81746, 72.88007];
    const center = position || defaultCenter;

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
                <FullscreenButton isFullscreen={false} onClick={() => setIsFullscreen(true)} />
                <MapContent
                    center={center}
                    isFullscreen={false}
                    position={position}
                    onLocationSelect={onLocationSelect}
                    readonly={readonly}
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
                    <FullscreenButton isFullscreen={true} onClick={() => setIsFullscreen(false)} />
                    <MapContent
                        center={center}
                        isFullscreen={true}
                        position={position}
                        onLocationSelect={onLocationSelect}
                        readonly={readonly}
                    />
                </div>,
                document.body
            )}
        </>
    );
};

export default MapComponent;
