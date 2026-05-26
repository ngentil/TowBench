import React, { useState, useEffect, useRef, useCallback } from 'react';
import 'leaflet/dist/leaflet.css';
import { ACC, MUT, BRD, TXT, GRN } from '../../lib/styles';
import useWeather from '../../hooks/useWeather';
import useDriverLocation from '../../hooks/useDriverLocation';
import { timeIn, fmtTimer, haversineKm } from '../../lib/utils';
import { supabase } from '../../lib/supabase';

const ORANGE = '#e8670a';

const traceInp = {
  background: '#0a0a0a', border: '1px solid #252525', color: '#ccc',
  fontFamily: "'IBM Plex Mono',monospace", fontSize: 9,
  padding: '4px 6px', borderRadius: 2, outline: 'none', boxSizing: 'border-box',
};

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

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
      <span style={{ fontSize: 7, color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em', width: 46, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 8, color: MUT }}>{String(value)}</span>
    </div>
  );
}

function AllocationInfoCard({ feature, acceptedJob, isLive, userEmail, userPos, onAcceptJob, onReleaseJob, onClose, pos }) {
  const props   = feature.properties || {};
  const eventId = String(props.eventId || '');
  const road    = props.closedRoadName || '—';
  const suburb  = props.reference?.startIntersectionLocality || '';
  const subtype = props.eventSubType || '';
  const impact  = props.impact?.impactType || '';
  const lanes   = props.numberLanesImpacted;
  const firstSeen = feature._logMeta?.firstSeen || props.lastUpdated;

  const coords = feature.geometry?.coordinates;
  const lat = coords ? coords[1] : null;
  const lng = coords ? coords[0] : null;
  const distKm = (userPos && lat != null) ? haversineKm(userPos.lat, userPos.lng, lat, lng) : null;
  const mapsUrl = lat != null ? `https://www.google.com/maps?q=${lat},${lng}` : null;
  const svUrl   = lat != null ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}` : null;

  const isAcceptedByMe    = isLive && acceptedJob && acceptedJob.accepted_by === userEmail;
  const isAcceptedByOther = isLive && acceptedJob && acceptedJob.accepted_by !== userEmail;
  const isOverdue = acceptedJob && (Date.now() - new Date(acceptedJob.accepted_at).getTime()) >= 60 * 60 * 1000;
  const borderColor = isOverdue ? '#cc2222' : acceptedJob ? '#cc4422' : GRN;

  const linkStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 8, padding: '3px 8px', borderRadius: 2, textDecoration: 'none',
    fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700,
    color: '#5a8ab0', border: '1px solid #1e3a5a', background: '#0a1520',
  };

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute', left: pos.x + 14, top: pos.y - 8,
        zIndex: 1500, width: 218, pointerEvents: 'all',
        background: '#111', border: `1px solid ${borderColor}44`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 2, boxShadow: '0 4px 24px #000a',
        fontFamily: "'IBM Plex Mono',monospace",
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 8px 5px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: TXT, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{road}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 8, color: MUT }}>#{eventId}{suburb ? ` · ${suburb}` : ''}</span>
            {distKm != null && (
              <span style={{ fontSize: 8, fontWeight: 700, color: ORANGE, fontFamily: "'IBM Plex Mono',monospace" }}>
                📍 {distKm.toFixed(1)}km
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13, padding: '0 0 0 6px', lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>

      <div style={{ padding: '5px 8px 6px', borderTop: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {subtype       && <InfoRow label="Type"   value={subtype} />}
        {impact        && <InfoRow label="Impact" value={impact} />}
        {lanes != null && <InfoRow label="Lanes"  value={lanes} />}
        {firstSeen     && <InfoRow label="Age"    value={timeIn(firstSeen) || '—'} />}
      </div>

      {(mapsUrl || svUrl) && (
        <div style={{ padding: '5px 8px 7px', borderTop: '1px solid #1e1e1e', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>📍 Maps</a>}
          {svUrl   && <a href={svUrl}   target="_blank" rel="noopener noreferrer" style={linkStyle}>🔭 Street View</a>}
        </div>
      )}

      {isLive && (
        <div style={{ padding: '5px 8px 7px', borderTop: '1px solid #1e1e1e' }}>
          {!acceptedJob && (
            <button onClick={() => onAcceptJob(eventId)}
              style={{ fontSize: 8, padding: '3px 9px', background: GRN + '22', border: `1px solid ${GRN}55`, color: GRN, borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>
              ✓ Accept
            </button>
          )}
          {isAcceptedByMe && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 8, color: isOverdue ? '#cc2222' : GRN, fontFamily: "'IBM Plex Mono',monospace" }}>
                {isOverdue ? '⚠' : '✓'} {fmtTimer(acceptedJob.accepted_at)}
              </span>
              <button onClick={() => onReleaseJob(acceptedJob.id)}
                style={{ fontSize: 8, padding: '2px 7px', background: '#220000', border: '1px solid #cc222255', color: '#cc4444', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace" }}>
                ✕ Release
              </button>
            </div>
          )}
          {isAcceptedByOther && (
            <span style={{ fontSize: 8, color: '#555' }}>🔒 {acceptedJob.accepted_by.split('@')[0]}</span>
          )}
        </div>
      )}
    </div>
  );
}

function calcTracePrice(totalKm, cfg, towType, twoUpTrade, twoUpAccident, allowAccidentTwoUp) {
  if (!cfg || !totalKm) return null;
  const now   = new Date();
  const isWE  = now.getDay() === 0 || now.getDay() === 6;
  const t     = now.toTimeString().slice(0, 5);
  const start = isWE ? (cfg.after_hours_start_weekend ?? '18:00') : (cfg.after_hours_start_weekday ?? '18:00');
  const end   = isWE ? (cfg.after_hours_end_weekend   ?? '06:00') : (cfg.after_hours_end_weekday   ?? '06:00');
  const ah    = t >= start || t < end;
  const ahFee = parseFloat(isWE ? cfg.after_hours_fee_weekend : cfg.after_hours_fee_weekday) || 0;
  const ahSurcharge = ah ? ahFee : 0;
  const accBase = parseFloat(cfg.accident_base_fee) || 0;
  const trdBase = parseFloat(cfg.trade_base_fee)    || 0;
  const result = {};
  if ((towType === 'accident' || towType === 'both') && accBase > 0) {
    const km  = Math.max(0, totalKm - 8) * (parseFloat(cfg.accident_per_km_fee) || 0);
    const mul = (twoUpAccident && allowAccidentTwoUp) ? 2 : 1;
    result.accident = (accBase + km + ahSurcharge) * mul;
  }
  if ((towType === 'trade' || towType === 'both') && trdBase > 0) {
    const km  = Math.max(0, totalKm - 10) * (parseFloat(cfg.trade_per_km_fee) || 0);
    const mul = twoUpTrade ? 2 : 1;
    result.trade = (trdBase + km + ahSurcharge) * mul;
  }
  return Object.keys(result).length ? result : null;
}

export default function OpsTab({ allFeatures, liveIds, loading, lastFetch, countdown, isStale, acceptedJobs, userEmail, onAcceptJob, onReleaseJob, companyConfig }) {
  useDriverLocation(userEmail);
  const { rainSoon, maxProb, hoursUntil } = useWeather();

  // Layer toggles
  const [showActive,      setShowActive]      = useState(true);
  const [showCleared,     setShowCleared]     = useState(true);
  const [showHotspots,    setShowHotspots]    = useState(true);
  const [showTruck,       setShowTruck]       = useState(true);

  // Map state
  const [userPos,         setUserPos]         = useState(null);
  const [driverLocations, setDriverLocations] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [cardPos,         setCardPos]         = useState({ x: 0, y: 0 });
  const [mapReady,        setMapReady]        = useState(false);

  // Trace panel
  const [traceOpen,       setTraceOpen]       = useState(false);
  const [towType,         setTowType]         = useState('accident');
  const [fromDepot,       setFromDepot]       = useState(true);
  const [returnDepot,     setReturnDepot]     = useState(false);
  const [pointA,          setPointA]          = useState(null);
  const [pointB,          setPointB]          = useState(null);
  const [searchA,         setSearchA]         = useState('');
  const [searchB,         setSearchB]         = useState('');
  const [searchAResults,  setSearchAResults]  = useState([]);
  const [searchBResults,  setSearchBResults]  = useState([]);
  const [clickTarget,     setClickTarget]     = useState(null);
  const [twoUpTrade,      setTwoUpTrade]      = useState(false);
  const [twoUpAccident,   setTwoUpAccident]   = useState(false);
  const [traceRoute,      setTraceRoute]      = useState(null);
  const [depotPoint,      setDepotPoint]      = useState(null);

  // Refs
  const containerRef      = useRef(null);
  const mapRef            = useRef(null);
  const leafletRef        = useRef(null);
  const activeLayerRef    = useRef(null);
  const clearedLayerRef   = useRef(null);
  const hotspotLayerRef   = useRef(null);
  const truckLayerRef     = useRef(null);
  const routeLayerRef     = useRef(null);
  const tracePinLayerRef  = useRef(null);
  const userPosRef        = useRef(null);
  const selectedLatLngRef = useRef(null);
  const clickTargetRef    = useRef(null);

  userPosRef.current     = userPos;
  clickTargetRef.current = clickTarget;

  const selectedFeature     = selectedEventId ? allFeatures.find(f => String(f.properties?.eventId) === selectedEventId) || null : null;
  const selectedAcceptedJob = selectedEventId ? (acceptedJobs?.get(selectedEventId) || null) : null;
  const selectedIsLive      = selectedEventId ? liveIds.has(selectedEventId) : false;

  // GPS watch
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

  // Fetch depot when trace panel opens
  useEffect(() => {
    if (!traceOpen || !userEmail) return;
    supabase.from('tow_trucks')
      .select('depot:depots(name, lat, lng)')
      .eq('auth_email', userEmail)
      .maybeSingle()
      .then(({ data }) => setDepotPoint(data?.depot ?? null));
  }, [traceOpen, userEmail]);

  // Nominatim address search (debounced 300ms)
  const geocodeSearch = useCallback(async (query, setResults) => {
    if (query.length < 3) { setResults([]); return; }
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=au`);
      const data = await res.json();
      setResults(data.map(r => ({ label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) })));
    } catch { setResults([]); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => geocodeSearch(searchA, setSearchAResults), 300);
    return () => clearTimeout(t);
  }, [searchA, geocodeSearch]);

  useEffect(() => {
    const t = setTimeout(() => geocodeSearch(searchB, setSearchBResults), 300);
    return () => clearTimeout(t);
  }, [searchB, geocodeSearch]);

  // OSRM multi-leg routing (auto-calculates whenever inputs change)
  useEffect(() => {
    if (!traceOpen) { routeLayerRef.current?.clearLayers(); setTraceRoute(null); return; }
    const wps = [];
    if (fromDepot && depotPoint?.lat != null) wps.push(depotPoint);
    if (pointA) wps.push(pointA);
    if (pointB) wps.push(pointB);
    if (returnDepot && depotPoint?.lat != null) wps.push(depotPoint);
    if (wps.length < 2) { routeLayerRef.current?.clearLayers(); setTraceRoute(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const coords = wps.map(p => `${p.lng},${p.lat}`).join(';');
        const res    = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
        const json   = await res.json();
        if (cancelled) return;
        const route = json.routes?.[0];
        if (!route) { setTraceRoute(null); return; }
        const L = leafletRef.current, layer = routeLayerRef.current;
        if (L && layer && !cancelled) {
          layer.clearLayers();
          const lcoords = route.geometry.coordinates.map(([ln, la]) => [la, ln]);
          L.polyline(lcoords, { color: '#cc2222', weight: 4, opacity: 0.85, className: 'route-anim' }).addTo(layer);
        }
        if (!cancelled) setTraceRoute({ totalKm: route.distance / 1000, durationMin: Math.round(route.duration / 60) });
      } catch { if (!cancelled) setTraceRoute(null); }
    })();
    return () => { cancelled = true; };
  }, [traceOpen, fromDepot, returnDepot, depotPoint, pointA, pointB]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trace pin markers (depot=🔶, A=🟢, B=🔴)
  useEffect(() => {
    const L = leafletRef.current, layer = tracePinLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    if (!traceOpen) return;
    if ((fromDepot || returnDepot) && depotPoint?.lat != null) {
      L.marker([depotPoint.lat, depotPoint.lng], {
        icon: L.divIcon({ className: '', html: '<div style="font-size:16px;line-height:1">🔶</div>', iconSize: [16, 16], iconAnchor: [8, 14] }),
        zIndexOffset: 200,
      }).bindTooltip(depotPoint.name || 'Depot', { permanent: false, direction: 'top', className: 'towbench-tooltip' }).addTo(layer);
    }
    if (pointA) {
      L.marker([pointA.lat, pointA.lng], {
        icon: L.divIcon({ className: '', html: '<div style="font-size:16px;line-height:1">🟢</div>', iconSize: [16, 16], iconAnchor: [8, 14] }),
        zIndexOffset: 201,
      }).bindTooltip('A — Pickup', { permanent: false, direction: 'top', className: 'towbench-tooltip' }).addTo(layer);
    }
    if (pointB) {
      L.marker([pointB.lat, pointB.lng], {
        icon: L.divIcon({ className: '', html: '<div style="font-size:16px;line-height:1">🔴</div>', iconSize: [16, 16], iconAnchor: [8, 14] }),
        zIndexOffset: 202,
      }).bindTooltip('B — Destination', { permanent: false, direction: 'top', className: 'towbench-tooltip' }).addTo(layer);
    }
  }, [mapReady, traceOpen, fromDepot, returnDepot, depotPoint, pointA, pointB]);

  // Map cursor crosshair when placing A/B
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getContainer().style.cursor = clickTarget ? 'crosshair' : '';
  }, [clickTarget]);

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

      const activeLayer   = L.layerGroup().addTo(map);
      const clearedLayer  = L.layerGroup().addTo(map);
      const hotspotLayer  = L.layerGroup().addTo(map);
      const truckLayer    = L.layerGroup().addTo(map);
      const routeLayer    = L.layerGroup().addTo(map);
      const tracePinLayer = L.layerGroup().addTo(map);

      activeLayerRef.current   = activeLayer;
      clearedLayerRef.current  = clearedLayer;
      hotspotLayerRef.current  = hotspotLayer;
      truckLayerRef.current    = truckLayer;
      routeLayerRef.current    = routeLayer;
      tracePinLayerRef.current = tracePinLayer;
      mapRef.current           = map;

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

      const updateCardPos = () => {
        const ll = selectedLatLngRef.current;
        if (!ll) return;
        const pt = map.latLngToContainerPoint([ll.lat, ll.lng]);
        setCardPos({ x: pt.x, y: pt.y });
      };
      map.on('move zoom moveend zoomend', updateCardPos);

      map.on('click', e => {
        if (clickTargetRef.current) {
          const { lat, lng } = e.latlng;
          const label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          if (clickTargetRef.current === 'A') {
            setPointA({ lat, lng, label });
            setSearchA(label);
            setSearchAResults([]);
          } else {
            setPointB({ lat, lng, label });
            setSearchB(label);
            setSearchBResults([]);
          }
          setClickTarget(null);
          return;
        }
        setSelectedEventId(null);
        selectedLatLngRef.current = null;
      });

      setMapReady(true);
    });
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild active layer
  useEffect(() => {
    const L = leafletRef.current, layer = activeLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    allFeatures.forEach(feature => {
      const coords  = feature.geometry?.coordinates;
      const eventId = String(feature.properties?.eventId || '');
      if (!coords || !liveIds.has(eventId)) return;
      const lat = coords[1], lng = coords[0];
      const accepted  = acceptedJobs?.get(eventId);
      const isOverdue = accepted && (Date.now() - new Date(accepted.accepted_at).getTime()) >= 60 * 60 * 1000;
      const dotColor  = isOverdue ? '#cc2222' : accepted ? '#cc4422' : GRN;
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
      marker.on('click', e => {
        L.DomEvent.stopPropagation(e);
        const map = mapRef.current;
        if (!map) return;
        const pt = map.latLngToContainerPoint([lat, lng]);
        setCardPos({ x: pt.x, y: pt.y });
        setSelectedEventId(eventId);
        selectedLatLngRef.current = { lat, lng };
      });
    });
  }, [mapReady, allFeatures, liveIds, acceptedJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild cleared layer (last 24h)
  useEffect(() => {
    const L = leafletRef.current, layer = clearedLayerRef.current;
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
  }, [mapReady, allFeatures, liveIds]);

  // Rebuild hotspot layer
  useEffect(() => {
    const L = leafletRef.current, layer = hotspotLayerRef.current;
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
  }, [mapReady, allFeatures]);

  // Rebuild truck layer
  useEffect(() => {
    const L = leafletRef.current, layer = truckLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    if (userPos) {
      L.marker([userPos.lat, userPos.lng], {
        icon: L.divIcon({ className: '', html: `<div style="font-size:18px;line-height:1;text-shadow:0 1px 4px #000a;filter:drop-shadow(0 0 4px ${GRN})">🚛</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
        zIndexOffset: 500,
      }).bindTooltip('YOU', { permanent: false, direction: 'top', className: 'towbench-tooltip' }).addTo(layer);
    }
    driverLocations.forEach(d => {
      if (d.driver_email === userEmail) return;
      L.marker([d.lat, d.lng], {
        icon: L.divIcon({ className: '', html: '<div style="font-size:16px;line-height:1;text-shadow:0 1px 4px #000a;opacity:0.75">🚛</div>', iconSize: [20, 20], iconAnchor: [10, 10] }),
        zIndexOffset: 400,
      }).bindTooltip(d.driver_email.split('@')[0], { permanent: false, direction: 'top', className: 'towbench-tooltip' }).addTo(layer);
    });
  }, [mapReady, userPos, driverLocations, userEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show/hide layers
  useEffect(() => {
    const map = mapRef.current, al = activeLayerRef.current, cl = clearedLayerRef.current, hl = hotspotLayerRef.current, tl = truckLayerRef.current;
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

  const allowAccidentTwoUp = companyConfig?.allow_accident_twoUp ?? false;
  const tracePrice = traceRoute
    ? calcTracePrice(traceRoute.totalKm, companyConfig, towType, twoUpTrade, twoUpAccident, allowAccidentTwoUp)
    : null;

  const closeTrace = () => {
    setTraceOpen(false);
    setClickTarget(null);
    setTraceRoute(null);
    setPointA(null); setPointB(null);
    setSearchA(''); setSearchB('');
    setSearchAResults([]); setSearchBResults([]);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Layer toggle bar */}
      <div style={{ padding: '6px 10px', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', background: '#0a0a0a', borderBottom: '1px solid ' + BRD }}>
        <LayerBadge active={showActive}   onClick={() => setShowActive(v  => !v)}  color={GRN}    label={`🟢 Active ${liveCount}`} />
        <LayerBadge active={showCleared}  onClick={() => setShowCleared(v => !v)}  color="#666"   label={`⚫ Cleared ${clearedCount}`} />
        <LayerBadge active={showHotspots} onClick={() => setShowHotspots(v => !v)} color={ORANGE} label="🟠 Hotspots" />
        <LayerBadge active={showTruck}    onClick={() => setShowTruck(v   => !v)}  color={GRN}    label="🚛 Trucks" />
        <LayerBadge
          active={traceOpen}
          onClick={() => traceOpen ? closeTrace() : setTraceOpen(true)}
          color="#cc2222" label="🔴 Trace" />

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
              ? (isStale ? `Stale · ${timeIn(lastFetch.toISOString())} ago` : `${countdown}s`)
              : '…'}
          </span>
        </div>
      </div>

      {/* Map + overlays */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        {loading && allFeatures.length === 0 && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 10, color: MUT, zIndex: 10, pointerEvents: 'none' }}>Loading…</div>
        )}
        <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

        {/* Trace Panel */}
        {traceOpen && (
          <div onClick={e => e.stopPropagation()} style={{
            position: 'absolute', top: 8, left: 8, zIndex: 1200, width: 268,
            background: '#111', border: '1px solid #2a2a2a', borderRadius: 2,
            boxShadow: '0 4px 20px #000a', fontFamily: "'IBM Plex Mono',monospace",
            pointerEvents: 'all',
          }}>
            {/* Header */}
            <div style={{ padding: '7px 10px', borderBottom: '1px solid #1e1e1e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: '#cc4444', textTransform: 'uppercase' }}>Route Trace</span>
              <button onClick={closeTrace} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
            </div>

            {/* Tow type selector */}
            <div style={{ padding: '7px 10px', borderBottom: '1px solid #1a1a1a' }}>
              <div style={{ fontSize: 7, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>Type</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['accident', 'trade', 'both'].map(tp => (
                  <button key={tp} onClick={() => setTowType(tp)} style={{
                    flex: 1, fontSize: 8, padding: '3px 0', borderRadius: 2, cursor: 'pointer',
                    fontFamily: "'IBM Plex Mono',monospace",
                    border: `1px solid ${towType === tp ? '#cc444488' : '#2a2a2a'}`,
                    color: towType === tp ? '#cc4444' : '#555',
                    background: towType === tp ? '#cc444411' : 'transparent',
                  }}>
                    {tp.charAt(0).toUpperCase() + tp.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Waypoints */}
            <div style={{ padding: '7px 10px', borderBottom: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* From depot */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                <input type="checkbox" checked={fromDepot} onChange={e => setFromDepot(e.target.checked)} style={{ accentColor: ORANGE, flexShrink: 0 }} />
                <span style={{ fontSize: 8, color: depotPoint?.name ? ORANGE : (fromDepot ? '#888' : '#444') }}>
                  From depot{depotPoint?.name ? ` · ${depotPoint.name}` : ''}
                </span>
              </label>

              {/* Point A */}
              <div style={{ position: 'relative' }}>
                <div style={{ fontSize: 7, color: '#444', letterSpacing: '0.08em', marginBottom: 3 }}>A — Pickup</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    value={searchA}
                    onChange={e => { setSearchA(e.target.value); if (!e.target.value) setPointA(null); }}
                    placeholder="Search address…"
                    style={{ ...traceInp, flex: 1 }}
                  />
                  <button
                    onClick={() => setClickTarget(ct => ct === 'A' ? null : 'A')}
                    title="Click map to place A"
                    style={{
                      fontSize: 10, width: 26, borderRadius: 2, cursor: 'pointer', flexShrink: 0,
                      border: `1px solid ${clickTarget === 'A' ? GRN + '88' : '#2a2a2a'}`,
                      color: clickTarget === 'A' ? GRN : '#555',
                      background: clickTarget === 'A' ? GRN + '11' : 'transparent',
                      fontFamily: "'IBM Plex Mono',monospace",
                    }}>✛</button>
                </div>
                {pointA && (
                  <div style={{ fontSize: 7, color: GRN, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    🟢 {pointA.label}
                  </div>
                )}
                {searchAResults.length > 0 && !pointA && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 300, background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: 2, maxHeight: 130, overflowY: 'auto', marginTop: 2 }}>
                    {searchAResults.map((r, i) => (
                      <div key={i}
                        onClick={() => { setPointA(r); setSearchA(r.label.split(',')[0].trim()); setSearchAResults([]); }}
                        style={{ padding: '5px 8px', fontSize: 7, color: '#bbb', cursor: 'pointer', borderBottom: '1px solid #1a1a1a', lineHeight: 1.5 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        {r.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Point B */}
              <div style={{ position: 'relative' }}>
                <div style={{ fontSize: 7, color: '#444', letterSpacing: '0.08em', marginBottom: 3 }}>B — Destination</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    value={searchB}
                    onChange={e => { setSearchB(e.target.value); if (!e.target.value) setPointB(null); }}
                    placeholder="Search address…"
                    style={{ ...traceInp, flex: 1 }}
                  />
                  <button
                    onClick={() => setClickTarget(ct => ct === 'B' ? null : 'B')}
                    title="Click map to place B"
                    style={{
                      fontSize: 10, width: 26, borderRadius: 2, cursor: 'pointer', flexShrink: 0,
                      border: `1px solid ${clickTarget === 'B' ? '#cc444488' : '#2a2a2a'}`,
                      color: clickTarget === 'B' ? '#cc4444' : '#555',
                      background: clickTarget === 'B' ? '#cc444411' : 'transparent',
                      fontFamily: "'IBM Plex Mono',monospace",
                    }}>✛</button>
                </div>
                {pointB && (
                  <div style={{ fontSize: 7, color: '#cc4444', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    🔴 {pointB.label}
                  </div>
                )}
                {searchBResults.length > 0 && !pointB && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 300, background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: 2, maxHeight: 130, overflowY: 'auto', marginTop: 2 }}>
                    {searchBResults.map((r, i) => (
                      <div key={i}
                        onClick={() => { setPointB(r); setSearchB(r.label.split(',')[0].trim()); setSearchBResults([]); }}
                        style={{ padding: '5px 8px', fontSize: 7, color: '#bbb', cursor: 'pointer', borderBottom: '1px solid #1a1a1a', lineHeight: 1.5 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        {r.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Return to depot */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                <input type="checkbox" checked={returnDepot} onChange={e => setReturnDepot(e.target.checked)} style={{ accentColor: ORANGE, flexShrink: 0 }} />
                <span style={{ fontSize: 8, color: returnDepot && depotPoint?.name ? ORANGE : '#444' }}>Return to depot</span>
              </label>
            </div>

            {/* Two-up — Trade */}
            {(towType === 'trade' || towType === 'both') && (
              <div style={{ padding: '6px 10px', borderBottom: '1px solid #1a1a1a' }}>
                <div style={{ fontSize: 7, color: '#444', marginBottom: 4, letterSpacing: '0.08em' }}>Trade</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                  <input type="checkbox" checked={twoUpTrade} onChange={e => setTwoUpTrade(e.target.checked)} />
                  <span style={{ fontSize: 8, color: twoUpTrade ? ACC : '#555' }}>×2 Two-up / Swinger</span>
                </label>
              </div>
            )}

            {/* Two-up — Accident (only if enabled in company config) */}
            {(towType === 'accident' || towType === 'both') && allowAccidentTwoUp && (
              <div style={{ padding: '6px 10px', borderBottom: '1px solid #1a1a1a' }}>
                <div style={{ fontSize: 7, color: '#444', marginBottom: 4, letterSpacing: '0.08em' }}>Accident</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                  <input type="checkbox" checked={twoUpAccident} onChange={e => setTwoUpAccident(e.target.checked)} />
                  <span style={{ fontSize: 8, color: twoUpAccident ? ACC : '#555' }}>×2 Two-up / Swinger</span>
                </label>
              </div>
            )}

            {/* Result */}
            <div style={{ padding: '8px 10px' }}>
              {traceRoute ? (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#cc4444', marginBottom: 5, fontFamily: "'IBM Plex Mono',monospace" }}>
                    {traceRoute.totalKm.toFixed(1)} km · ~{traceRoute.durationMin} min
                  </div>
                  {tracePrice ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {tracePrice.accident != null && (
                        <div style={{ fontSize: 8, color: MUT }}>
                          Accident{' '}
                          <span style={{ color: '#ccc', fontWeight: 700 }}>${tracePrice.accident.toFixed(2)}</span>
                          {twoUpAccident && allowAccidentTwoUp && <span style={{ color: '#555', marginLeft: 4, fontSize: 7 }}>×2</span>}
                        </div>
                      )}
                      {tracePrice.trade != null && (
                        <div style={{ fontSize: 8, color: MUT }}>
                          Trade{' '}
                          <span style={{ color: '#ccc', fontWeight: 700 }}>${tracePrice.trade.toFixed(2)}</span>
                          {twoUpTrade && <span style={{ color: '#555', marginLeft: 4, fontSize: 7 }}>×2</span>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 7, color: '#333' }}>Set pricing in Settings to estimate cost</div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 7, color: '#2a2a2a' }}>
                  {clickTarget
                    ? `Click map to place ${clickTarget}`
                    : (pointA || pointB)
                      ? 'Set both A and B to calculate route…'
                      : 'Search or click ✛ to place points'}
                </div>
              )}
            </div>
          </div>
        )}

        {selectedFeature && (
          <AllocationInfoCard
            feature={selectedFeature}
            acceptedJob={selectedAcceptedJob}
            isLive={selectedIsLive}
            userEmail={userEmail}
            userPos={userPos}
            onAcceptJob={onAcceptJob}
            onReleaseJob={onReleaseJob}
            onClose={() => { setSelectedEventId(null); selectedLatLngRef.current = null; }}
            pos={cardPos}
          />
        )}
      </div>
    </div>
  );
}
