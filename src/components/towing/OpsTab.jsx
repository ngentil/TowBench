import React, { useState, useEffect, useRef, useMemo } from 'react';
import 'leaflet/dist/leaflet.css';
import { ACC, MUT, BRD, TXT, GRN, SURF } from '../../lib/styles';
import useWeather from '../../hooks/useWeather';
import { timeIn } from '../../lib/utils';

const ORANGE = '#e8670a';
const POLL_MS = 60_000;

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

function OpsCard({ feature, acceptedJob, selected, onCardClick, cardRef }) {
  const p       = feature.properties || {};
  const road    = p.closedRoadName || '—';
  const eventId = String(p.eventId || '');
  const logMeta = feature._logMeta;
  const isLive  = feature._isLive;
  const elapsed = timeIn(logMeta?.firstSeen || p.lastUpdated);
  const isOverdue = isLive && acceptedJob && (Date.now() - new Date(acceptedJob.accepted_at).getTime()) >= 60 * 60 * 1000;
  const acceptedElapsed = acceptedJob ? timeIn(acceptedJob.accepted_at) : null;

  let stripeColor;
  if (!isLive)          stripeColor = '#333';
  else if (isOverdue)   stripeColor = '#cc2222';
  else if (acceptedJob) stripeColor = ORANGE;
  else                  stripeColor = GRN;

  return (
    <div ref={cardRef} onClick={onCardClick} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', borderLeft: `3px solid ${stripeColor}`, borderBottom: '1px solid #1a1a1a', borderRight: selected ? `2px solid ${ORANGE}` : '2px solid transparent', background: selected ? '#0d0a04' : 'transparent', flexShrink: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{road}</span>
        <span style={{ fontSize: 7, color: MUT, fontFamily: "'IBM Plex Mono',monospace" }}>#{eventId}</span>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', gap: 4, alignItems: 'center' }}>
        {isLive && !acceptedJob && elapsed && <span style={{ fontSize: 7, color: ORANGE, border: `1px solid ${ORANGE}44`, borderRadius: 2, padding: '1px 4px' }}>{elapsed}</span>}
        {isLive && isOverdue && <span style={{ fontSize: 7, color: '#cc2222', border: '1px solid #cc222255', borderRadius: 2, padding: '1px 4px', fontWeight: 700 }}>⚠ {acceptedElapsed}</span>}
        {isLive && acceptedJob && !isOverdue && <span style={{ fontSize: 7, color: ORANGE, border: `1px solid ${ORANGE}44`, borderRadius: 2, padding: '1px 4px' }}>✓ {acceptedElapsed}</span>}
        {!isLive && <span style={{ fontSize: 7, color: '#444', border: '1px solid #2a2a2a', borderRadius: 2, padding: '1px 4px' }}>✓</span>}
      </div>
    </div>
  );
}

function OpsMap({ allFeatures, liveIds, acceptedJobs, onMarkerClick, flyToRef }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const layerRef     = useRef(null);
  const leafletRef   = useRef(null);

  // Init once — parent has explicit pixel height so container has real dimensions immediately
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
      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer;
      mapRef.current   = map;
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

  // Rebuild markers only — no map reinit, zoom/pan preserved
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
      const accepted = acceptedJobs.get(eventId);
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

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

export default function OpsTab({ allFeatures, liveIds, lastFetch, countdown, isStale, acceptedJobs, userEmail }) {
  const { rainSoon, maxProb, hoursUntil } = useWeather();
  const [selectedId,  setSelectedId]  = useState(null);
  const [splitHeight, setSplitHeight] = useState(window.innerHeight - 120);
  const flyToRef    = useRef(null);
  const cardRefsRef = useRef(new Map());

  useEffect(() => {
    const h = () => setSplitHeight(window.innerHeight - 120);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const { activeFeatures, clearedToday } = useMemo(() => {
    const active = [], cleared = [];
    allFeatures.forEach(f => {
      const id   = String(f.properties?.eventId || '');
      const live = liveIds.has(id);
      const enriched = { ...f, _isLive: live };
      if (live) active.push(enriched);
      else if (isToday(f._logMeta?.firstSeen || f.properties?.lastUpdated)) cleared.push(enriched);
    });
    active.sort((a, b) => new Date(b.properties?.lastUpdated || 0) - new Date(a.properties?.lastUpdated || 0));
    cleared.sort((a, b) => new Date(b._logMeta?.clearedAt || b.properties?.lastUpdated || 0) - new Date(a._logMeta?.clearedAt || a.properties?.lastUpdated || 0));
    return { activeFeatures: active, clearedToday: cleared };
  }, [allFeatures, liveIds]);

  const healthColor = isStale ? '#cc2222' : lastFetch && (Date.now() - lastFetch.getTime()) > POLL_MS * 1.5 ? '#cc8800' : '#3d9e50';

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ background: SURF, borderBottom: '1px solid ' + BRD, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0, flexWrap: 'wrap' }}>
        <Stat label="Active"        value={liveIds.size}        color={liveIds.size > 0      ? ACC : MUT} />
        <Stat label="Accepted"      value={acceptedJobs.size}   color={acceptedJobs.size > 0 ? ACC : MUT} />
        <Stat label="Cleared Today" value={clearedToday.length} color={MUT} />
        {rainSoon && <span style={{ fontSize: 8, color: '#7ab0d0', paddingLeft: 4, borderLeft: '2px solid #1e3a5a' }}>🌧 Rain {hoursUntil === 0 ? 'now' : `~${hoursUntil}h`} ({maxProb}%)</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {lastFetch && <span style={{ fontSize: 7, color: MUT, fontFamily: "'IBM Plex Mono',monospace" }}>{countdown}s</span>}
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: healthColor, display: 'inline-block', flexShrink: 0 }} title={isStale ? 'Feed stale' : 'Feed live'} />
        </div>
      </div>

      <div style={{ display: 'flex', height: splitHeight, overflow: 'hidden' }}>
        <div style={{ flex: '0 0 60%', position: 'relative' }}>
          <OpsMap allFeatures={allFeatures} liveIds={liveIds} acceptedJobs={acceptedJobs} onMarkerClick={handleMarkerClick} flyToRef={flyToRef} />
        </div>
        <div style={{ flex: '0 0 40%', overflowY: 'auto', borderLeft: '1px solid ' + BRD, display: 'flex', flexDirection: 'column' }}>
          {activeFeatures.length === 0 && clearedToday.length === 0 && (
            <div style={{ padding: 24, color: MUT, fontSize: 9, textAlign: 'center', letterSpacing: '0.1em' }}>No allocations</div>
          )}
          {activeFeatures.map(f => {
            const eventId = String(f.properties?.eventId || '');
            return <OpsCard key={eventId} feature={f} acceptedJob={acceptedJobs.get(eventId) || null} userEmail={userEmail} selected={selectedId === eventId} onCardClick={() => handleCardClick(f)} cardRef={setCardRef(eventId)} />;
          })}
          {clearedToday.length > 0 && (
            <>
              <div style={{ padding: '5px 10px', fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid #1a1a1a', borderTop: activeFeatures.length > 0 ? '1px solid #252525' : 'none', background: '#0a0a0a', flexShrink: 0 }}>
                Cleared Today — {clearedToday.length}
              </div>
              {clearedToday.map(f => {
                const eventId = String(f.properties?.eventId || '');
                return <OpsCard key={eventId} feature={f} acceptedJob={null} userEmail={userEmail} selected={selectedId === eventId} onCardClick={() => handleCardClick(f)} cardRef={setCardRef(eventId)} />;
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
