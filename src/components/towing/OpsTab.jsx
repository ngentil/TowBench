import React, { useState, useEffect, useRef, useMemo } from 'react';
import 'leaflet/dist/leaflet.css';
import { ACC, MUT, BRD, TXT, GRN, SURF } from '../../lib/styles';
import useWeather from '../../hooks/useWeather';
import useDriverLocation from '../../hooks/useDriverLocation';
import { timeIn, fmtTimer, haversineKm } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import TowAnalyticsTab from './TowAnalyticsTab';

const ORANGE   = '#e8670a';
const POLL_MS  = 60_000;
const STALE_MS = 10 * 60 * 1000;

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontSize: 15, fontWeight: 700, color, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}

function OpsCard({ feature, acceptedJob, selected, nearestDriver, onCardClick, cardRef, userEmail, onAcceptJob, onReleaseJob }) {
  const p       = feature.properties || {};
  const road    = p.closedRoadName || '—';
  const eventId = String(p.eventId || '');
  const logMeta = feature._logMeta;
  const isLive  = feature._isLive;
  const elapsed = timeIn(logMeta?.firstSeen || p.lastUpdated);

  const isOverdue       = isLive && acceptedJob && (Date.now() - new Date(acceptedJob.accepted_at).getTime()) >= 60 * 60 * 1000;
  const acceptedElapsed = acceptedJob ? fmtTimer(acceptedJob.accepted_at) : null;
  const isAcceptedByMe    = isLive && acceptedJob && acceptedJob.accepted_by === userEmail;
  const isAcceptedByOther = isLive && acceptedJob && acceptedJob.accepted_by !== userEmail;

  let stripeColor;
  if (!isLive)          stripeColor = '#333';
  else if (isOverdue)   stripeColor = '#cc2222';
  else if (acceptedJob) stripeColor = ORANGE;
  else                  stripeColor = GRN;

  return (
    <div ref={cardRef} onClick={onCardClick} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', borderLeft: `3px solid ${stripeColor}`, borderBottom: '1px solid #1a1a1a', borderRight: selected ? `2px solid ${ORANGE}` : '2px solid transparent', background: selected ? '#0d0a04' : 'transparent', flexShrink: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{road}</span>
        <div style={{ marginTop: 2 }}>
          <span style={{ fontSize: 7, color: MUT, fontFamily: "'IBM Plex Mono',monospace", display: 'block' }}>#{eventId}</span>
          {isLive && nearestDriver && (
            <span style={{ fontSize: 7, color: '#5a7a9a', fontFamily: "'IBM Plex Mono',monospace", display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              🚛 {nearestDriver.label} {nearestDriver.dist.toFixed(1)}km
            </span>
          )}
        </div>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
        {isLive && !acceptedJob && onAcceptJob && (
          <button onClick={e => { e.stopPropagation(); onAcceptJob(eventId); }}
            style={{ background: GRN + '11', border: `1px solid ${GRN}55`, borderRadius: 2, color: GRN, fontSize: 8, padding: '3px 7px', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
            ✓ Accept
          </button>
        )}
        {isLive && !acceptedJob && !onAcceptJob && elapsed && (
          <span style={{ fontSize: 7, color: ORANGE, border: `1px solid ${ORANGE}44`, borderRadius: 2, padding: '1px 4px' }}>{elapsed}</span>
        )}
        {isAcceptedByMe && (
          <>
            <span style={{ fontSize: 8, color: isOverdue ? '#cc4444' : ACC, fontFamily: "'IBM Plex Mono',monospace", whiteSpace: 'nowrap', fontWeight: 700 }}>
              {isOverdue ? `⚠ ${acceptedElapsed}` : `✓ ${acceptedElapsed}`}
            </span>
            {onReleaseJob && (
              <button onClick={e => { e.stopPropagation(); onReleaseJob(acceptedJob.id); }}
                style={{ background: '#1a0000', border: '1px solid #cc222255', borderRadius: 2, color: '#cc6666', fontSize: 8, padding: '3px 7px', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                ✕ Release
              </button>
            )}
          </>
        )}
        {isAcceptedByOther && (
          <span style={{ fontSize: 7, color: MUT, border: '1px solid #2a2a2a', borderRadius: 2, padding: '2px 5px', whiteSpace: 'nowrap', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
            title={`Accepted by ${acceptedJob.accepted_by}`}>
            🔒 {acceptedJob.accepted_by.split('@')[0]}
          </span>
        )}
        {!isLive && <span style={{ fontSize: 7, color: '#444', border: '1px solid #2a2a2a', borderRadius: 2, padding: '1px 4px' }}>✓</span>}
      </div>
    </div>
  );
}

function OpsMap({ allFeatures, liveIds, acceptedJobs, driverLocations, onMarkerClick, flyToRef }) {
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const layerRef      = useRef(null);
  const truckLayerRef = useRef(null);
  const leafletRef    = useRef(null);

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
      const layer      = L.layerGroup().addTo(map);
      const truckLayer = L.layerGroup().addTo(map);
      layerRef.current      = layer;
      truckLayerRef.current = truckLayer;
      mapRef.current        = map;
      if (flyToRef) flyToRef.current = (lat, lng) => map.flyTo([lat, lng], 14, { duration: 0.5 });
      if (!document.getElementById('ops-pulse-style')) {
        const s = document.createElement('style');
        s.id = 'ops-pulse-style';
        s.textContent = '@keyframes ops-pulse{0%{transform:translate(-50%,-50%) scale(1);opacity:0.65}70%{transform:translate(-50%,-50%) scale(3.2);opacity:0}100%{transform:translate(-50%,-50%) scale(3.2);opacity:0}}';
        document.head.appendChild(s);
      }
    });
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Allocation markers
  useEffect(() => {
    const L     = leafletRef.current;
    const layer = layerRef.current;
    const map   = mapRef.current;
    if (!L || !layer || !map) return;
    layer.clearLayers();

    allFeatures.forEach(feature => {
      const coords = feature.geometry?.coordinates;
      if (!coords) return;
      const lat     = coords[1], lng = coords[0];
      const eventId = String(feature.properties?.eventId || '');
      const isLive  = liveIds.has(eventId);
      const accepted  = acceptedJobs.get(eventId);
      const isOverdue = accepted && (Date.now() - new Date(accepted.accepted_at).getTime()) >= 60 * 60 * 1000;
      const p = feature.properties || {};

      if (!isLive) {
        L.circleMarker([lat, lng], { radius: 5, fillColor: '#555', fillOpacity: 0.5, color: '#555', weight: 0.5 }).addTo(layer);
        return;
      }

      const dotColor = isOverdue ? '#cc2222' : accepted ? '#cc4422' : GRN;
      const sz = isOverdue ? 12 : 10;
      const pulseHtml =
        `<div style="position:relative;width:${sz}px;height:${sz}px">` +
        `<div style="position:absolute;top:50%;left:50%;width:${sz}px;height:${sz}px;border-radius:50%;background:${dotColor};animation:ops-pulse 2s ease-out infinite"></div>` +
        `<div style="position:absolute;top:50%;left:50%;width:${sz}px;height:${sz}px;border-radius:50%;background:${dotColor};transform:translate(-50%,-50%);opacity:0.95"></div>` +
        `</div>`;
      const activeM = L.marker([lat, lng], {
        icon: L.divIcon({ className: '', html: pulseHtml, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] }),
        bubblingMouseEvents: false,
        zIndexOffset: 100,
      });
      activeM.addTo(layer);

      const road    = p.closedRoadName || '—';
      const sub     = p.reference?.startIntersectionLocality || '';
      const cross   = p.reference?.startIntersectionRoadName || '';
      const subType = p.eventSubType || '';
      const lanes   = p.numberLanesImpacted;
      const impact  = p.impact?.impactType || '';
      const elapsed = timeIn(feature._logMeta?.firstSeen || p.lastUpdated);
      const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
      const statusLabel = isOverdue ? 'Overdue' : accepted ? 'Accepted' : 'Active';
      const statusColor = isOverdue ? '#cc2222' : accepted ? '#cc4422' : '#3a8a5a';

      const infoRows = [
        ['Event ID', '#' + eventId],
        ...(lanes != null ? [['Lanes', `${lanes} lane${lanes !== 1 ? 's' : ''}`]] : []),
        ...(impact  ? [['Impact',  impact]]  : []),
        ...(elapsed ? [['Time in', elapsed]] : []),
      ];

      const popupHtml = `
        <div style="font-family:'IBM Plex Mono',monospace;min-width:210px;max-width:270px;color:#d8d8d8;padding:10px 12px">
          <div style="font-size:11px;font-weight:700;color:#e8e8e8;margin-bottom:4px;line-height:1.3">${road}</div>
          ${sub ? `<div style="font-size:8px;color:#555;margin-bottom:8px">${sub}${cross ? ' @ ' + cross : ''}</div>` : '<div style="margin-bottom:8px"></div>'}
          <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">
            <span style="font-size:7px;font-weight:700;padding:1px 5px;border:1px solid ${statusColor}55;border-radius:2px;color:${statusColor};background:${statusColor}18;text-transform:uppercase;letter-spacing:.08em">${statusLabel}</span>
            ${subType ? `<span style="font-size:7px;font-weight:700;padding:1px 5px;border:1px solid #3a3a2a;border-radius:2px;color:#c8a84b;background:#c8a84b11;text-transform:uppercase;letter-spacing:.08em">${subType}</span>` : ''}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px">
            ${infoRows.map(([lbl, val]) => `<div style="background:#111;border:1px solid #1e1e1e;border-radius:2px;padding:4px 6px"><div style="font-size:6px;color:#444;letter-spacing:.1em;text-transform:uppercase;margin-bottom:2px">${lbl}</div><div style="font-size:8px;color:#bbb;word-break:break-all">${val}</div></div>`).join('')}
          </div>
          <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;font-size:7px;color:#4a6a8a;border:1px solid #1e2e3e;border-radius:2px;padding:3px 7px;text-decoration:none;background:#0a1520;text-transform:uppercase;letter-spacing:.08em;font-family:'IBM Plex Mono',monospace">📍 Maps</a>
        </div>`;

      const handleClick = () => {
        L.popup({ closeButton: true, className: 'towbench-popup', maxWidth: 300, offset: [0, -5] })
          .setLatLng([lat, lng]).setContent(popupHtml).openOn(map);
        onMarkerClick(eventId);
      };
      activeM.on('click', handleClick);
    });
  }, [allFeatures, liveIds, acceptedJobs, onMarkerClick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Truck markers
  useEffect(() => {
    const L     = leafletRef.current;
    const layer = truckLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    const now = Date.now();
    (driverLocations || []).forEach(d => {
      const staleMs = now - new Date(d.updated_at).getTime();
      if (staleMs > STALE_MS) return;
      const fresh  = staleMs < 2 * 60 * 1000;
      const color  = fresh ? '#3d9e50' : '#cc8800';
      const plate  = d.plate || null;
      const name   = d.name  || null;
      const short  = d.driver_email.split('@')[0];
      const label  = plate || name || short;
      const rotate = d.heading != null ? `transform:rotate(${d.heading}deg);` : '';
      const ago    = Math.floor(staleMs / 60000);
      const agoStr = ago === 0 ? 'just now' : `${ago}m ago`;

      const html =
        `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none">` +
        `<div style="font-size:20px;line-height:1;${rotate}filter:drop-shadow(0 2px 6px rgba(0,0,0,0.9))">🚛</div>` +
        `<div style="background:${color};color:#000;font-family:'IBM Plex Mono',monospace;font-size:7px;font-weight:700;padding:2px 6px;border-radius:2px;white-space:nowrap;letter-spacing:0.08em;box-shadow:0 1px 4px rgba(0,0,0,0.7)">${label}</div>` +
        (name && plate ? `<div style="background:#0d0d0d;color:#5a5a5a;font-family:'IBM Plex Mono',monospace;font-size:6px;padding:1px 4px;border-radius:2px;white-space:nowrap">${name}</div>` : '') +
        `</div>`;

      const popupRows = [
        plate  ? ['Plate',    plate]  : null,
        name   ? ['Driver',   name]   : null,
        ['Email',    d.driver_email],
        ['Updated',  agoStr],
        d.accuracy ? ['Accuracy', `±${Math.round(d.accuracy)}m`] : null,
      ].filter(Boolean);

      const popupHtml =
        `<div style="font-family:'IBM Plex Mono',monospace;padding:10px 12px;color:#d8d8d8;min-width:160px">` +
        `<div style="font-size:11px;font-weight:700;color:#e8e8e8;margin-bottom:8px">${label}</div>` +
        `<div style="display:grid;grid-template-columns:auto 1fr;gap:3px 10px">` +
        popupRows.map(([k, v]) =>
          `<span style="font-size:7px;color:#555;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap">${k}</span>` +
          `<span style="font-size:8px;color:#aaa;word-break:break-all">${v}</span>`
        ).join('') +
        `</div></div>`;

      const marker = L.marker([d.lat, d.lng], {
        icon: L.divIcon({ className: '', html, iconSize: [50, 40], iconAnchor: [25, 40] }),
        zIndexOffset: 500,
      });
      marker.bindPopup(popupHtml, { className: 'towbench-popup', closeButton: false });
      marker.addTo(layer);
    });
  }, [driverLocations]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

const VIEW_ORDER  = ['ops', 'analytics', 'map', 'board'];
const VIEW_LABELS = { ops: '🖥 Ops', analytics: '📊', map: '🗺', board: '📋' };
const MAP_POS_ORDER = ['left', 'right', 'top', 'bottom'];
const MAP_POS_ICONS = { left: '◧', right: '◨', top: '⬒', bottom: '⬓' };

export default function OpsTab({ allFeatures, liveIds, lastFetch, countdown, isStale, loading, acceptedJobs, userEmail, onAcceptJob, onReleaseJob }) {
  const { rainSoon, maxProb, hoursUntil } = useWeather();
  const [selectedId,      setSelectedId]      = useState(null);
  const [driverLocations, setDriverLocations] = useState([]);
  const [view,            setView]            = useState(() => localStorage.getItem('ops-view') || 'ops');
  const [mapPos,          setMapPos]          = useState(() => localStorage.getItem('ops-map-pos') || 'left');
  const [boardSearch,     setBoardSearch]     = useState('');
  const flyToRef    = useRef(null);
  const cardRefsRef = useRef(new Map());

  useDriverLocation(userEmail);

  useEffect(() => { localStorage.setItem('ops-view', view); }, [view]);
  useEffect(() => { localStorage.setItem('ops-map-pos', mapPos); }, [mapPos]);

  const cycleView = () => setView(v => VIEW_ORDER[(VIEW_ORDER.indexOf(v) + 1) % VIEW_ORDER.length]);

  // Driver location realtime
  useEffect(() => {
    supabase.from('driver_locations').select('*')
      .then(({ data }) => { if (data) setDriverLocations(data); })
      .catch(() => {});

    const ch = supabase
      .channel('driver-locs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations' }, payload => {
        const key = payload.new?.driver_email || payload.old?.driver_email;
        setDriverLocations(prev => {
          const without = prev.filter(d => d.driver_email !== key);
          if (payload.eventType !== 'DELETE' && payload.new) return [...without, payload.new];
          return without;
        });
      })
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, []);

  const { activeFeatures, clearedToday } = useMemo(() => {
    const active = [], cleared = [];
    allFeatures.forEach(f => {
      const id      = String(f.properties?.eventId || '');
      const live    = liveIds.has(id);
      const enriched = { ...f, _isLive: live };
      if (live) active.push(enriched);
      else if (isToday(f._logMeta?.firstSeen || f.properties?.lastUpdated)) cleared.push(enriched);
    });
    active.sort((a, b) => new Date(b.properties?.lastUpdated || 0) - new Date(a.properties?.lastUpdated || 0));
    cleared.sort((a, b) => new Date(b._logMeta?.clearedAt || b.properties?.lastUpdated || 0) - new Date(a._logMeta?.clearedAt || a.properties?.lastUpdated || 0));
    return { activeFeatures: active, clearedToday: cleared };
  }, [allFeatures, liveIds]);

  const nearestDrivers = useMemo(() => {
    const now = Date.now();
    const activeDrvs = driverLocations.filter(d => now - new Date(d.updated_at).getTime() < STALE_MS);
    if (!activeDrvs.length) return new Map();
    const map = new Map();
    activeFeatures.forEach(f => {
      const coords = f.geometry?.coordinates;
      if (!coords) return;
      const [lng, lat] = coords;
      let best = null;
      activeDrvs.forEach(d => {
        const dist  = haversineKm(lat, lng, d.lat, d.lng);
        const label = d.plate || d.name || d.driver_email.split('@')[0];
        if (!best || dist < best.dist) best = { label, dist };
      });
      if (best) map.set(String(f.properties?.eventId), best);
    });
    return map;
  }, [activeFeatures, driverLocations]);

  const filterCards = (arr) => {
    if (!boardSearch.trim()) return arr;
    const q = boardSearch.toLowerCase();
    return arr.filter(f => {
      const p = f.properties || {};
      return [p.closedRoadName, p.reference?.startIntersectionLocality, p.eventId].join(' ').toLowerCase().includes(q);
    });
  };
  const filteredActive  = filterCards(activeFeatures);
  const filteredCleared = filterCards(clearedToday);

  const activeTrucks = driverLocations.filter(d => Date.now() - new Date(d.updated_at).getTime() < STALE_MS).length;
  const healthColor  = isStale ? '#cc2222' : lastFetch && (Date.now() - lastFetch.getTime()) > POLL_MS * 1.5 ? '#cc8800' : '#3d9e50';

  const handleMarkerClick = (eventId) => {
    setSelectedId(eventId);
    const el = cardRefsRef.current.get(eventId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleCardClick = (feature) => {
    const coords  = feature.geometry?.coordinates;
    const eventId = String(feature.properties?.eventId || '');
    setSelectedId(eventId);
    if (coords && flyToRef.current) flyToRef.current(coords[1], coords[0]);
  };

  const setCardRef = (eventId) => (el) => {
    if (el) cardRefsRef.current.set(eventId, el);
    else    cardRefsRef.current.delete(eventId);
  };

  const renderCardList = (showSearch) => (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {showSearch && (
        <div style={{ padding: '6px 10px', borderBottom: '1px solid ' + BRD, flexShrink: 0 }}>
          <input
            type="text" value={boardSearch} onChange={e => setBoardSearch(e.target.value)}
            placeholder="Filter road, suburb, event ID…"
            style={{ width: '100%', background: '#0a0a0a', border: '1px solid #252525', color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, padding: '5px 8px', borderRadius: 2, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredActive.length === 0 && filteredCleared.length === 0 && (
          <div style={{ padding: 24, color: MUT, fontSize: 9, textAlign: 'center', letterSpacing: '0.1em' }}>No allocations</div>
        )}
        {filteredActive.map(f => {
          const eventId = String(f.properties?.eventId || '');
          return (
            <OpsCard
              key={eventId} feature={f}
              acceptedJob={acceptedJobs.get(eventId) || null}
              nearestDriver={nearestDrivers.get(eventId) || null}
              selected={selectedId === eventId}
              onCardClick={() => handleCardClick(f)}
              cardRef={setCardRef(eventId)}
              userEmail={userEmail}
              onAcceptJob={onAcceptJob}
              onReleaseJob={onReleaseJob}
            />
          );
        })}
        {filteredCleared.length > 0 && (
          <>
            <div style={{ padding: '5px 10px', fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid #1a1a1a', borderTop: filteredActive.length > 0 ? '1px solid #252525' : 'none', background: '#0a0a0a', flexShrink: 0 }}>
              Cleared Today — {filteredCleared.length}
            </div>
            {filteredCleared.map(f => {
              const eventId = String(f.properties?.eventId || '');
              return (
                <OpsCard
                  key={eventId} feature={f}
                  acceptedJob={null} nearestDriver={null}
                  selected={selectedId === eventId}
                  onCardClick={() => handleCardClick(f)}
                  cardRef={setCardRef(eventId)}
                  userEmail={userEmail}
                  onAcceptJob={null}
                  onReleaseJob={null}
                />
              );
            })}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Row 1 — stats */}
      <div style={{ background: SURF, borderBottom: '1px solid #1a1a1a', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, flexWrap: 'wrap' }}>
        <Stat label="Active"        value={liveIds.size}        color={liveIds.size > 0      ? ACC : MUT} />
        <Stat label="Accepted"      value={acceptedJobs.size}   color={acceptedJobs.size > 0 ? ACC : MUT} />
        <Stat label="Cleared Today" value={clearedToday.length} color={MUT} />
        <Stat label="Trucks Live"   value={activeTrucks}        color={activeTrucks > 0 ? GRN : MUT} />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 7, color: GRN, fontFamily: "'IBM Plex Mono',monospace", opacity: 0.6 }} title="Location sharing active">📍</span>
          {lastFetch && <span style={{ fontSize: 7, color: MUT, fontFamily: "'IBM Plex Mono',monospace" }}>{countdown}s</span>}
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: healthColor, display: 'inline-block', flexShrink: 0 }} title={isStale ? 'Feed stale' : 'Feed live'} />
        </div>
      </div>

      {/* Row 2 — view selector + weather */}
      <div style={{ background: '#0a0a0a', borderBottom: '1px solid ' + BRD, padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
        {VIEW_ORDER.map(v => (
          <button key={v} onClick={() => setView(v)}
            style={{ fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", background: view === v ? ACC + '22' : 'none', border: `1px solid ${view === v ? ACC + '66' : '#2a2a2a'}`, color: view === v ? ACC : MUT, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
            {VIEW_LABELS[v]}
          </button>
        ))}
        <button onClick={cycleView}
          style={{ fontSize: 10, color: MUT, border: '1px solid #2a2a2a', borderRadius: 2, padding: '3px 8px', cursor: 'pointer', background: 'none', fontFamily: "'IBM Plex Mono',monospace" }}
          title="Cycle views">
          ⟳
        </button>
        {view === 'ops' && (
          <>
            <div style={{ width: 1, height: 14, background: '#2a2a2a', margin: '0 4px', flexShrink: 0 }} />
            {MAP_POS_ORDER.map(pos => (
              <button key={pos} onClick={() => setMapPos(pos)} title={`Map ${pos}`}
                style={{ fontSize: 11, padding: '2px 7px', borderRadius: 2, cursor: 'pointer', background: mapPos === pos ? ACC + '22' : 'none', border: `1px solid ${mapPos === pos ? ACC + '66' : '#2a2a2a'}`, color: mapPos === pos ? ACC : MUT }}>
                {MAP_POS_ICONS[pos]}
              </button>
            ))}
          </>
        )}
        {rainSoon && (
          <span style={{ marginLeft: 'auto', fontSize: 8, color: '#7ab0d0', padding: '2px 8px', background: '#0a1520', border: '1px solid #1e3a5a', borderRadius: 2 }}>
            🌧 Rain {hoursUntil === 0 ? 'now' : `~${hoursUntil}h`} ({maxProb}%)
          </span>
        )}
      </div>

      {/* Analytics view — unmount map, render TowAnalyticsTab full-height */}
      {view === 'analytics' && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <TowAnalyticsTab allFeatures={allFeatures} liveIds={liveIds} loading={loading} userEmail={userEmail} />
        </div>
      )}

      {/* Ops / Map / Board views */}
      {view !== 'analytics' && (() => {
        const isRow      = view !== 'ops' || mapPos === 'left' || mapPos === 'right';
        const reversed   = view === 'ops' && (mapPos === 'right' || mapPos === 'bottom');
        const flexDir    = isRow ? (reversed ? 'row-reverse' : 'row') : (reversed ? 'column-reverse' : 'column');
        const mapFlex    = view === 'map'   ? '1 1 100%' : isRow ? '0 0 60%' : '0 0 50%';
        const cardFlex   = view === 'board' ? '1 1 100%' : isRow ? '0 0 40%' : '0 0 50%';
        const cardBorder = view === 'board' ? {} : isRow
          ? (reversed ? { borderRight: '1px solid ' + BRD } : { borderLeft: '1px solid ' + BRD })
          : (reversed ? { borderBottom: '1px solid ' + BRD } : { borderTop: '1px solid ' + BRD });

        return (
          <div style={{ display: 'flex', flexDirection: flexDir, flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {view !== 'board' && (
              <div style={{ flex: mapFlex, position: 'relative', minHeight: 0, minWidth: 0 }}>
                <OpsMap
                  allFeatures={allFeatures} liveIds={liveIds} acceptedJobs={acceptedJobs}
                  driverLocations={driverLocations}
                  onMarkerClick={handleMarkerClick} flyToRef={flyToRef}
                />
              </div>
            )}
            {view !== 'map' && (
              <div style={{ flex: cardFlex, display: 'flex', flexDirection: 'column', ...cardBorder, minHeight: 0, overflow: 'hidden' }}>
                {renderCardList(view === 'board')}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
