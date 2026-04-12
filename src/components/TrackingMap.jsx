import { useCallback, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';

const containerStyle = {
  width: '100%',
  height: '330px',
  borderRadius: '24px',
};

const defaultCenter = {
  lat: 19.076,
  lng: 72.8777,
};

export function TrackingMap({ shipments = [], routePath = null }) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  });

  const [map, setMap] = useState(null);

  const onLoad = useCallback((map) => {
    setMap(map);
    if (routePath && routePath.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      routePath.forEach((point) => {
        bounds.extend(new google.maps.LatLng(point.lat, point.lon || point.lng));
      });
      map.fitBounds(bounds);
    }
  }, [routePath]);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  if (!isLoaded) {
    return <div className="h-[330px] rounded-[1.75rem] bg-slate-950/80 flex items-center justify-center text-slate-400">Loading map...</div>;
  }

  const mapPoints = shipments.map((s, idx) => ({
    id: s.id,
    lat: s.lat,
    lng: s.lon,
    title: `${s.id} - ${s.status}`,
  }));

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={defaultCenter}
      zoom={6}
      onLoad={onLoad}
      onUnmount={onUnmount}
      options={{
        mapTypeId: 'roadmap',
        disableDefaultUI: false,
      }}
    >
      {routePath && routePath.length > 0 && (
        <Polyline
          path={routePath.map((point) => ({ lat: point.lat, lng: point.lon || point.lng }))}
          options={{
            strokeColor: '#0EA5E9',
            strokeOpacity: 0.8,
            strokeWeight: 3,
          }}
        />
      )}

      {mapPoints.map((point) => (
        <Marker
          key={point.id}
          position={{ lat: point.lat, lng: point.lng }}
          title={point.title}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#F97316',
            fillOpacity: 0.9,
            strokeColor: '#FFFFFF',
            strokeWeight: 2,
          }}
        />
      ))}
    </GoogleMap>
  );
}
