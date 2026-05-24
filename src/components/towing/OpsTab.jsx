import React, { useState, useEffect, useRef, useMemo } from 'react';
import 'leaflet/dist/leaflet.css';
import { ACC, MUT, BRD, TXT, GRN, SURF } from '../../lib/styles';
import useWeather from '../../hooks/useWeather';

const ORANGE = '#e8670a';
const POLL_MS = 60_000;

function timeIn(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return null;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

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
    <div
      ref={cardRef}
      onClick={onCardClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', cursor: 'pointer',
        borderLeft: `3px solid ${stripeColor}`,
        borderBottom: '1px solid #1a1a1a',
        borderRight: selected ? `2px solid ${ORANGE}` : '2px solid transparent',
        background: selected ? '#0d0a04' : 'transparent',
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {road}
        </span>
        <span style={{ fontSize: 7, color: MUT, fontFamily: "'IBM Plex Mono',monospace" }}>#{eventId}</span>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', gap: 4, alignItems: 'center' }}>
        {isLive && !acceptedJob && elapsed && (
          <span style={{ fontSize: 7, color: ORANGE, border: `1px solid ${ORANGE}44`, borderRadius: 2, padding: '1px 4px' }}>
            {elapsed}
          </span>
        )}
        {isLive && isOverdue && (
          <span style={{ fontSize: 7, color: '#cc2222', border: '1px solid #cc222255', borderRadius: 2, padding: '1px 4px', fontWeight: 700 }}>
            ⚠ {acceptedElapsed}
          </span>
        )}
        {isLive && acceptedJob && !isOverdue && (
          <span style={{ fontSize: 7, color: ORANGE, border: `1px solid ${ORANGE}44`, borderRadius: 2, padding: '1px 4px' }}>
            ✓ {acceptedElapsed}
          </span>
        )}
        {!isLive && (
          <span style={{ fontSize: 7, color: '#444', border: '1px solid #2a2a2a', borderRadius: 2, padding: '1px 4px' }}>✓</span>
        )}
      </div>
    </div>
  );
}

export default function OpsTab({ allFeatures, liveIds, lastFetch, countdown, isStale, acceptedJobs, userEmail }) {
  const { rainSoon, maxProb, hoursUntil } = useWeather();
  const [selectedId, setSelectedId] = useState(null);

  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const layerRef      = useRef(null);
  const leafletRef    = useRef(null);
  const flyToRef      = useRef(null);
  const cardRefsRef   = useRef(new Map());

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

  const healthColor = isStale
    ? '#cc2222'
    : lastFetch && (Date.now() - lastFetch.getTime()) > POLL_MS * 1.5
      ? '#cc8800'
      : '#3d9e50';

  // Map init — runs once on mount
  useEffect(() => {
    if (!containerRef.current) return;
    import('leaflet').then(mod => {
      const L = mod.default || mod;
      leafletRef.current = L;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

      const map = L.map(containerRef.current, {
        center: [-37.814, 144.963], zoom: 11,
        zoomControl: true, attributionControl: false,
      });
      map.getPanes().tilePane.style.filter = 'invert(100%) hue-rotate(180deg) brightness(90%) contrast(90%) saturate(60%)';
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { subdomains: 'abc', maxZoom: 19 }).addTo(map);
      L.control.attribution({ prefix: false })
        .addAttribution('© <a href="https://openstreetmap.org" style="color:#666">OpenStreetMap</a>')
        .addTo(map);

      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer;
      mapRef.current   = map;
      flyToRef.current = (lat, lng) => map.flyTo([lat, lng], 14, { duration: 0.5 });
      setTimeout(() => map.invalidateSize(), 150);
    });
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild markers when data changes
  useEffect(() => {
    const L     = leafletRef.current;
    const layer = layerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();

    allFeatures.forEach(feature => {
      const coords = feature.geometry?.coordinates;
      if (!coords) return;
      const lat      = coords[1], lng = coords[0];
      const eventId  = String(feature.properties?.eventId || '');
      const isLive   = liveIds.has(eventId);
      const accepted = acceptedJobs.get(eventId);
      const isOverdue = accepted && (Date.now() - new Date(accepted.accepted_at).getTime()) >= 60 * 60 * 1000;

      let color, radius, opacity;
      if (!isLive)        { color = '#555';    radius = 5; opacity = 0.5; }
      else if (isOverdue) { color = '#cc2222'; radius = 9; opacity = 0.95; }
      else if (accepted)  { color = '#cc4422'; radius = 8; opacity = 0.9; }
      else                { color = ORANGE;    radius = 7; opacity = 0.9; }

      const marker = L.circleMarker([lat, lng], {
        radius, fillColor: color, fillOpacity: opacity,
        color: color, weight: isLive ? 1.5 : 0.5,
      });
      marker.on('click', () => {
        setSelectedId(eventId);
        const el = cardRefsRef.current.get(eventId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      marker.addTo(layer);
    });
  }, [allFeatures, liveIds, acceptedJobs]);

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
      {/* Stats bar */}
      <div style={{ background: SURF, borderBottom: '1px solid ' + BRD, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0, flexWrap: 'wrap' }}>
        <Stat label="Active" value={liveIds.size} color={liveIds.size > 0 ? ACC : MUT} />
        <Stat label="Accepted" value={acceptedJobs.size} color={acceptedJobs.size > 0 ? ACC : MUT} />
        <Stat label="Cleared Today" value={clearedToday.length} color={MUT} />
        {rainSoon && (
          <span style={{ fontSize: 8, color: '#7ab0d0', paddingLeft: 4, borderLeft: '2px solid #1e3a5a' }}>
            🌧 Rain {hoursUntil === 0 ? 'now' : `~${hoursUntil}h`} ({maxProb}%)
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {lastFetch && (
            <span style={{ fontSize: 7, color: MUT, fontFamily: "'IBM Plex Mono',monospace" }}>
              {countdown}s
            </span>
          )}
          <span
            style={{ width: 7, height: 7, borderRadius: '50%', background: healthColor, display: 'inline-block', flexShrink: 0 }}
            title={isStale ? 'Feed stale' : 'Feed live'}
          />
        </div>
      </div>

      {/* Split view */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Map — 60% */}
        <div ref={containerRef} style={{ flex: '0 0 60%', minHeight: 0, position: 'relative' }} />

        {/* Card list — 40% */}
        <div style={{ flex: '0 0 40%', overflowY: 'auto', borderLeft: '1px solid ' + BRD, display: 'flex', flexDirection: 'column' }}>
          {activeFeatures.length === 0 && clearedToday.length === 0 && (
            <div style={{ padding: 24, color: MUT, fontSize: 9, textAlign: 'center', letterSpacing: '0.1em' }}>
              No allocations
            </div>
          )}

          {activeFeatures.map(f => {
            const eventId = String(f.properties?.eventId || '');
            return (
              <OpsCard
                key={eventId}
                feature={f}
                acceptedJob={acceptedJobs.get(eventId) || null}
                userEmail={userEmail}
                selected={selectedId === eventId}
                onCardClick={() => handleCardClick(f)}
                cardRef={setCardRef(eventId)}
              />
            );
          })}

          {clearedToday.length > 0 && (
            <>
              <div style={{ padding: '5px 10px', fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid #1a1a1a', borderTop: activeFeatures.length > 0 ? '1px solid #252525' : 'none', background: '#0a0a0a', flexShrink: 0 }}>
                Cleared Today — {clearedToday.length}
              </div>
              {clearedToday.map(f => {
                const eventId = String(f.properties?.eventId || '');
                return (
                  <OpsCard
                    key={eventId}
                    feature={f}
                    acceptedJob={null}
                    userEmail={userEmail}
                    selected={selectedId === eventId}
                    onCardClick={() => handleCardClick(f)}
                    cardRef={setCardRef(eventId)}
                  />
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
