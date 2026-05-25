import React, { useState, useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { MUT, BRD, TXT, GRN } from '../../lib/styles';
import useWeather from '../../hooks/useWeather';
import useDriverLocation from '../../hooks/useDriverLocation';
import { timeIn, haversineKm } from '../../lib/utils';
import { supabase } from '../../lib/supabase';

const ORANGE = '#e8670a';

function LayerBadge({ active, onClick, color, label }) {
  return (
    <button onClick={onClick}
      style={{ fontSize: 8, fontWeight: 700, padding: '3px 8px', borderRadius: 2, cursor: 'pointer',
        fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em',
        border: `1px solid ${active ? color + '88' : '#2a2a2a'}`,
        color: active ? color : '#444',
        background: active ? color + '11' : '#0d0d0d',
        flexShrink: 0 }}>
      {label}
    </button>
  );
}

export default function OpsTab({ allFeatures, liveIds, loading, lastFetch, countdown, isStale, acceptedJobs, userEmail, onAcceptJob, onReleaseJob }) {
  useDriverLocation(userEmail);
  const { rainSoon, maxProb, hoursUntil } = useWeather();

  const [showActive,   setShowActive]   = useState(true);
  const [showCleared,  setShowCleared]  = useState(true);
  const [showHotspots, setShowHotspots] = useState(true);
  const [showTruck,    setShowTruck]    = useState(true);
  const [routeInfo,    setRouteInfo]    = useState(null);
  const [userPos,      setUserPos]      = useState(null);
  const [driverLocations, setDriverLocations] = useState([]);

  const containerRef    = useRef(null);
  const mapRef          = useRef(null);
  const leafletRef      = useRef(null);
  const activeLayerRef  = useRef(null);
  const clearedLayerRef = useRef(null);
  const hotspotLayerRef = useRef(null);
  const truckLayerRef   = useRef(null);
  const routeLayerRef   = useRef(null);
  const userPosRef      = useRef(null);
  const drawRouteRef    = useRef(null);

  userPosRef.current = userPos;

  // GPS watch for route drawing
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      p => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Driver locations realtime
  useEffect(() => {
    const fetchDrivers = async () => {
      try {
        const { data } = await supabase.from('driver_locations').select('driver_email, lat, lng, updated_at');
        if (data) setDriverLocations(data);
      } catch { /* ignore */ }
    };
    fetchDrivers();
    const channel = supabase.channel('driver-locations-ops')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, fetchDrivers)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // Map init
  useEffect(() => {
    if (!containerRef.current) return;
    import('leaflet').then(mod => {
      const L = mod.default || mod;
      leafletRef.current = L;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      const map = L.map(containerRef.current, { center: [-37.814, 144.963], zoom: 11, zoomControl: true, attributionControl: false });
      map.getPanes().tilePane.style.filter = 'invert(100%) hue-rotate(180deg) brightness(90%) contrast(90%) saturate(60%)';
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { subdomains: 'abc', maxZoom: 19 }).addTo(map);
      L.control.attribution({ prefix: false }).addAttribution('© <a href="https://openstreetmap.org" style="color:#666">OpenStreetMap</a>').addTo(map);

      const activeLayer  = L.layerGroup().addTo(map);
      const clearedLayer = L.layerGroup().addTo(map);
      const hotspotLayer = L.layerGroup().addTo(map);
      const truckLayer   = L.layerGroup().addTo(map);
      const routeLayer   = L.layerGroup().addTo(map);

      activeLayerRef.current  = activeLayer;
      clearedLayerRef.current = clearedLayer;
      hotspotLayerRef.current = hotspotLayer;
      truckLayerRef.current   = truckLayer;
      routeLayerRef.current   = routeLayer;
      mapRef.current          = map;

      // Inject CSS for pulse and route animation
      if (!document.getElementById('ops-full-style')) {
        const s = document.createElement('style');
        s.id = 'ops-full-style';
        s.textContent = [
          '@keyframes ops-pulse{0%{transform:translate(-50%,-50%) scale(1);opacity:0.65}70%{transform:translate(-50%,-50%) scale(3.2);opacity:0}100%{transform:translate(-50%,-50%) scale(3.2);opacity:0}}',
          '@keyframes route-dash{to{stroke-dashoffset:-20}}',
          '.route-anim{stroke-dasharray:12 6;animation:route-dash 0.6s linear infinite}',
        ].join('');
        document.head.appendChild(s);
      }

      // Clear route on map background click
      map.on('click', () => {
        routeLayer.clearLayers();
        setRouteInfo(null);
      });

      // drawRoute function stored in ref so it's callable from marker click handlers
      drawRouteRef.current = async (allocLat, allocLng, eventId) => {
        const pos = userPosRef.current;
        routeLayer.clearLayers();
        setRouteInfo(null);
        if (!pos) return;
        try {
          const res = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${pos.lng},${pos.lat};${allocLng},${allocLat}?overview=full&geometries=geojson`
          );
          if (!res.ok) throw new Error('OSRM error');
          const data = await res.json();
          const route = data.routes?.[0];
          if (!route) throw new Error('No route');
          const coords   = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          const distKm   = route.distance / 1000;
          const durationMin = Math.round(route.duration / 60);
          L.polyline(coords, { color: '#cc2222', weight: 4, opacity: 0.85, className: 'route-anim' }).addTo(routeLayer);
          setRouteInfo({ distKm, durationMin, eventId });
        } catch {
          const distKm = haversineKm(pos.lat, pos.lng, allocLat, allocLng);
          L.polyline([[pos.lat, pos.lng], [allocLat, allocLng]], {
            color: '#cc2222', weight: 3, dashArray: '8 6', opacity: 0.7,
          }).addTo(routeLayer);
          setRouteInfo({ distKm, durationMin: null, eventId });
        }
      };
    });
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild active layer
  useEffect(() => {
    const L     = leafletRef.current;
    const layer = activeLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();

    allFeatures.forEach(feature => {
      const coords  = feature.geometry?.coordinates;
      const eventId = String(feature.properties?.eventId || '');
      if (!coords || !liveIds.has(eventId)) return;
      const lat      = coords[1], lng = coords[0];
      const accepted = acceptedJobs?.get(eventId);
      const isOverdue = accepted && (Date.now() - new Date(accepted.accepted_at).getTime()) >= 60 * 60 * 1000;
      const dotColor = isOverdue ? '#cc2222' : accepted ? '#cc4422' : GRN;
      const sz = isOverdue ? 12 : 10;
      const pulseHtml =
        `<div style="position:relative;width:${sz}px;height:${sz}px">` +
        `<div style="position:absolute;top:50%;left:50%;width:${sz}px;height:${sz}px;border-radius:50%;background:${dotColor};animation:ops-pulse 2s ease-out infinite"></div>` +
        `<div style="position:absolute;top:50%;left:50%;width:${sz}px;height:${sz}px;border-radius:50%;background:${dotColor};transform:translate(-50%,-50%);opacity:0.95"></div>` +
        `</div>`;
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({ className: '', html: pulseHtml, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] }),
        bubblingMouseEvents: false, zIndexOffset: 100,
      });
      marker.addTo(layer);
      marker.on('click', e => { L.DomEvent.stopPropagation(e); drawRouteRef.current?.(lat, lng, eventId); });
    });
  }, [allFeatures, liveIds, acceptedJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild cleared layer (last 24h only)
  useEffect(() => {
    const L     = leafletRef.current;
    const layer = clearedLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    allFeatures.forEach(feature => {
      const coords  = feature.geometry?.coordinates;
      const eventId = String(feature.properties?.eventId || '');
      if (!coords || liveIds.has(eventId)) return;
      const firstSeenMs = new Date(feature._logMeta?.firstSeen || feature.properties?.lastUpdated || 0).getTime();
      if (firstSeenMs < cutoff) return;
      L.circleMarker([coords[1], coords[0]], { radius: 5, fillColor: '#555', fillOpacity: 0.55, color: '#444', weight: 0.5 }).addTo(layer);
    });
  }, [allFeatures, liveIds]);

  // Rebuild hotspot layer (all-time data for density)
  useEffect(() => {
    const L     = leafletRef.current;
    const layer = hotspotLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    allFeatures.forEach(feature => {
      const coords = feature.geometry?.coordinates;
      if (!coords) return;
      const [lng, lat] = coords;
      L.circleMarker([lat, lng], { radius: 22, fillColor: ORANGE, fillOpacity: 0.07, stroke: false }).addTo(layer);
      L.circleMarker([lat, lng], { radius: 8,  fillColor: ORANGE, fillOpacity: 0.22, stroke: false }).addTo(layer);
      L.circleMarker([lat, lng], { radius: 3,  fillColor: '#ffcc66', fillOpacity: 0.6, stroke: false }).addTo(layer);
    });
  }, [allFeatures]);

  // Rebuild truck layer
  useEffect(() => {
    const L     = leafletRef.current;
    const layer = truckLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();

    // Own truck from local GPS
    if (userPos) {
      const truckHtml = `<div style="font-size:18px;line-height:1;text-shadow:0 1px 4px #000a;filter:drop-shadow(0 0 4px ${GRN})">🚛</div>`;
      L.marker([userPos.lat, userPos.lng], {
        icon: L.divIcon({ className: '', html: truckHtml, iconSize: [22, 22], iconAnchor: [11, 11] }),
        zIndexOffset: 500,
      }).bindTooltip('YOU', { permanent: false, direction: 'top', className: 'towbench-tooltip' }).addTo(layer);
    }

    // Other drivers
    driverLocations.forEach(d => {
      if (d.driver_email === userEmail) return;
      const label = d.driver_email.split('@')[0];
      const truckHtml = `<div style="font-size:16px;line-height:1;text-shadow:0 1px 4px #000a;opacity:0.75">🚛</div>`;
      L.marker([d.lat, d.lng], {
        icon: L.divIcon({ className: '', html: truckHtml, iconSize: [20, 20], iconAnchor: [10, 10] }),
        zIndexOffset: 400,
      }).bindTooltip(label, { permanent: false, direction: 'top', className: 'towbench-tooltip' }).addTo(layer);
    });
  }, [userPos, driverLocations, userEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show/hide layers based on toggles
  useEffect(() => {
    const map = mapRef.current;
    const al  = activeLayerRef.current;
    const cl  = clearedLayerRef.current;
    const hl  = hotspotLayerRef.current;
    const tl  = truckLayerRef.current;
    if (!map || !al || !cl || !hl || !tl) return;
    if (showActive)   map.addLayer(al);  else map.removeLayer(al);
    if (showCleared)  map.addLayer(cl);  else map.removeLayer(cl);
    if (showHotspots) map.addLayer(hl);  else map.removeLayer(hl);
    if (showTruck)    map.addLayer(tl);  else map.removeLayer(tl);
  }, [showActive, showCleared, showHotspots, showTruck]);

  const liveCount    = liveIds.size;
  const cutoff24h    = Date.now() - 24 * 60 * 60 * 1000;
  const clearedCount = allFeatures.filter(f => {
    const id = String(f.properties?.eventId || '');
    if (liveIds.has(id)) return false;
    const t = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated || 0).getTime();
    return t >= cutoff24h;
  }).length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Layer toggle bar */}
      <div style={{ padding: '6px 10px', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', background: '#0a0a0a', borderBottom: '1px solid ' + BRD }}>
        <LayerBadge active={showActive}   onClick={() => setShowActive(v  => !v)}  color={GRN}    label={`🟢 Active ${liveCount}`} />
        <LayerBadge active={showCleared}  onClick={() => setShowCleared(v => !v)}  color="#666"   label={`⚫ Cleared ${clearedCount}`} />
        <LayerBadge active={showHotspots} onClick={() => setShowHotspots(v => !v)} color={ORANGE} label="🟠 Hotspots" />
        <LayerBadge active={showTruck}    onClick={() => setShowTruck(v   => !v)}  color={GRN}    label="🚛 Trucks" />

        {routeInfo && (
          <span style={{ fontSize: 8, color: '#cc4444', border: '1px solid #cc222255', borderRadius: 2, padding: '2px 7px', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, flexShrink: 0 }}>
            📍 {routeInfo.distKm.toFixed(1)}km{routeInfo.durationMin != null ? ` · ~${routeInfo.durationMin}min` : ' straight'}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {rainSoon && (
            <span style={{ fontSize: 8, color: '#7ab0d0', border: '1px solid #1e3a5a', borderRadius: 2, padding: '2px 6px', fontFamily: "'IBM Plex Mono',monospace", flexShrink: 0 }}>
              🌧 {hoursUntil === 0 ? 'now' : `~${hoursUntil}h`} ({maxProb}%)
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: MUT, flexShrink: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
              background: !lastFetch ? '#555' : isStale ? '#cc2222' : GRN,
              boxShadow: !lastFetch ? 'none' : isStale ? '0 0 6px #cc2222aa' : `0 0 6px ${GRN}aa` }} />
            {lastFetch
              ? (isStale
                  ? `Stale · ${timeIn(lastFetch.toISOString())} ago`
                  : `${countdown}s`)
              : '…'}
          </span>
        </div>
      </div>

      {/* Full-screen map */}
      {loading && allFeatures.length === 0 && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 10, color: MUT, zIndex: 10, pointerEvents: 'none' }}>Loading…</div>
      )}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}
