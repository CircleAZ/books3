import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

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

const MapComponent = ({ position, onLocationSelect, height = '300px', readonly = false }) => {
    // Default center (Gujarat/India approx) if no position
    const defaultCenter = [22.2587, 71.1924];
    const center = position || defaultCenter;

    return (
        <MapContainer
            center={center}
            zoom={13}
            style={{ height: height, width: '100%', borderRadius: '8px', zIndex: 0 }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <LocationMarker
                position={position}
                onLocationSelect={onLocationSelect}
                readonly={readonly}
            />
        </MapContainer>
    );
};

export default MapComponent;
