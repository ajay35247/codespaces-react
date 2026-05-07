import { useCallback, useEffect, useState } from 'react';
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

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAP_API_KEY || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

function MapStatusCard({ tone = 'neutral', title, body }) {
  const toneClass = tone === 'error'
    ? 'border-rose-400/30 text-rose-200'
    : tone === 'warn'
      ? 'border-amber-400/30 text-amber-200'
      : 'border-white/10 text-slate-300';
  return (
    <div className={`h-[330px] rounded-[1.75rem] bg-slate-950/80 border ${toneClass} p-6 flex flex-col items-center justify-center text-center`}>
      <p className="text-sm font-semibold uppercase tracking-[0.18em]">{title}</p>
      {body && <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-400">{body}</p>}
    </div>
  );
}

export function TrackingMap({ shipments = [], routePath = null }) {
  // Capture Google Maps auth failures (`gm_authFailure` is the documented
  // global hook fired by the Maps JS API when the API key is missing,
  // unauthorised for the current referrer/package, or billing is disabled).
  // Without this hook the user sees an empty grey tile with no clue why.
  const [authFailed, setAuthFailed] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const previous = window.gm_authFailure;
    window.gm_authFailure = () => {
      setAuthFailed(true);
      if (typeof previous === 'function') {
        try { previous(); } catch { /* ignore */ }
      }
    };
    return () => {
      // Restore previous handler on unmount so we don't leak across pages.
      window.gm_authFailure = previous;
    };
  }, []);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
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

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <MapStatusCard
        tone="warn"
        title="Map unavailable"
        body="Google Maps API key is not configured for this build. Set VITE_GOOGLE_MAP_API_KEY (or VITE_GOOGLE_MAPS_API_KEY) and rebuild."
      />
    );
  }

  if (authFailed) {
    return (
      <MapStatusCard
        tone="error"
        title="Map authorization failed"
        body="Google rejected the Maps API key for this app. Check key restrictions (HTTP referrers / Android package + SHA-1) and that billing is enabled on the GCP project."
      />
    );
  }

  if (loadError) {
    return (
      <MapStatusCard
        tone="error"
        title="Map failed to load"
        body={loadError?.message || 'Unable to reach Google Maps. Check your network connection and try again.'}
      />
    );
  }

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
