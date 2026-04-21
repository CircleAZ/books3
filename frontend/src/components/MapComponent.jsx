import { useEffect, useState } from 'react';
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
        }, 100);
        return () => clearTimeout(timer);
    }, [map, isFullscreen]);
    return null;
}

const MapComponent = ({ position, onLocationSelect, height = '300px', readonly = false }) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // Default center (Navsari/South Gujarat)
    const defaultCenter = [20.81746, 72.88007];
    const center = position || defaultCenter;

    const containerStyle = isFullscreen 
        ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, backgroundColor: '#000' }
        : { height: height, width: '100%', position: 'relative' };

    const mapStyle = { height: '100%', width: '100%', borderRadius: isFullscreen ? '0' : '8px', zIndex: 0 };

    return (
        <div style={containerStyle}>
            <button 
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    zIndex: 1000,
                    background: 'white',
                    border: '2px solid rgba(0,0,0,0.2)',
                    borderRadius: '4px',
                    padding: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
                title={isFullscreen ? "Minimize" : "Full Screen"}
            >
                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
            <MapContainer
                center={center}
                zoom={11}
                maxZoom={22}
                style={mapStyle}
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
        </div>
    );
};

export default MapComponent;
