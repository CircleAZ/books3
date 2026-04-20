import { useEffect } from 'react';
import './MapComponent.css';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, LayersControl } from 'react-leaflet';
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
    // Default center (Navsari/South Gujarat)
    const defaultCenter = [20.81746, 72.88007];
    const center = position || defaultCenter;

    return (
        <MapContainer
            center={center}
            zoom={11}
            maxZoom={22}
            style={{ height: height, width: '100%', borderRadius: '8px', zIndex: 0 }}
        >
            <LayersControl position="bottomright">
                <LayersControl.BaseLayer checked name="Satellite View">
                    <TileLayer
                        attribution="&copy; Google"
                        url="https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                        maxZoom={20}
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
};

export default MapComponent;
