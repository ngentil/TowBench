import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import 'leaflet/dist/leaflet.css';
import { ACC, MUT, BRD, TXT, GRN, SURF } from '../../lib/styles';
import useWeather from '../../hooks/useWeather';
import { timeIn, fmtTimer, haversineKm } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { BRIDGE_URL } from '../../lib/constants';

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
  if ((towType === 'accident' || towType === 'custom') && accBase > 0) {
    const km  = Math.max(0, totalKm - 8) * (parseFloat(cfg.accident_per_km_fee) || 0);
    const mul = (twoUpAccident && allowAccidentTwoUp) ? 2 : 1;
    result.accident = (accBase + km + ahSurcharge) * mul;
  }
  if ((towType === 'trade' || towType === 'custom') && trdBase > 0) {
    const km  = Math.max(0, totalKm - 10) * (parseFloat(cfg.trade_per_km_fee) || 0);
    const mul = twoUpTrade ? 2 : 1;
    result.trade = (trdBase + km + ahSurcharge) * mul;
  }
  return Object.keys(result).length ? result : null;
}

function calcCustomPrice(legs, legTypes, legPcts, totalAdjPct, cfg, twoUpTrade, twoUpAccident, allowAccidentTwoUp) {
  if (!cfg || !legs?.length) return null;
  const now   = new Date();
  const isWE  = now.getDay() === 0 || now.getDay() === 6;
  const t     = now.toTimeString().slice(0, 5);
  const start = isWE ? (cfg.after_hours_start_weekend ?? '18:00') : (cfg.after_hours_start_weekday ?? '18:00');
  const end   = isWE ? (cfg.after_hours_end_weekend   ?? '06:00') : (cfg.after_hours_end_weekday   ?? '06:00');
  const ah    = t >= start || t < end;
  const ahFee = parseFloat(isWE ? cfg.after_hours_fee_weekend : cfg.after_hours_fee_weekday) || 0;
  const ahSurcharge = ah ? ahFee : 0;

  let subtotal = 0;
  const legResults = legs.map((leg, i) => {
    const type = legTypes[i] || 'accident';
    let price;
    if (type === 'accident') {
      const base = parseFloat(cfg.accident_base_fee) || 0;
      const km   = Math.max(0, leg.km - 8) * (parseFloat(cfg.accident_per_km_fee) || 0);
      const mul  = (twoUpAccident && allowAccidentTwoUp) ? 2 : 1;
      price = (base + km + ahSurcharge) * mul;
    } else {
      const base = parseFloat(cfg.trade_base_fee) || 0;
      const km   = Math.max(0, leg.km - 10) * (parseFloat(cfg.trade_per_km_fee) || 0);
      const mul  = twoUpTrade ? 2 : 1;
      price = (base + km + ahSurcharge) * mul;
    }
    const pct = legPcts[i] || 0;
    const adjusted = price * (1 + pct / 100);
    subtotal += adjusted;
    return { label: leg.label, km: leg.km, type, price, pct, adjusted };
  });
  const total = subtotal * (1 + (totalAdjPct || 0) / 100);
  return { legResults, subtotal, total, totalAdjPct: totalAdjPct || 0 };
}

function BridgeCard({ rec, dist }) {
  const [open, setOpen] = useState(false);
  const [lat, lng, height, label, btype, maxweight] = Array.isArray(rec) ? rec : [
    rec.geometry?.coordinates[1], rec.geometry?.coordinates[0],
    rec.properties?.height ?? null, rec.properties?.road_name || '', '', null,
  ];
  const h         = parseFloat(height);
  const wt        = maxweight != null ? parseFloat(maxweight) : null;
  const hColor    = h < 4.0 ? '#cc3333' : h < 4.6 ? '#cc8822' : '#5a9aee';
  const isCrit    = dist <= 0.5;
  const borderLeft = isCrit ? '3px solid #cc2222' : `3px solid ${hColor}`;
  const border     = isCrit ? '1px solid #cc222255' : '1px solid #252525';
  const mapsUrl   = `https://www.google.com/maps?q=${lat},${lng}`;
  const svUrl     = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
  const btypeClean = (btype && btype !== 'NULL') ? btype : null;

  return (
    <div className={isCrit ? 'nearby-pulse' : ''}
      style={{ background: '#0d0d0d', border, borderLeft, borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>🌉</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label || 'Bridge'}
            </span>
            <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px',
              border: `1px solid ${hColor}55`, borderRadius: 2, color: hColor, background: hColor + '15',
              textTransform: 'uppercase', flexShrink: 0 }}>
              {h.toFixed(1)}m
            </span>
            {wt != null && (
              <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px',
                border: '1px solid #4a6a2255', borderRadius: 2, color: '#7aaa33', background: '#4a6a2215',
                textTransform: 'uppercase', flexShrink: 0 }}>
                ⚖ {wt % 1 === 0 ? wt : wt.toFixed(1)}t
              </span>
            )}
          </div>
          {!open && (
            <div style={{ marginTop: 3, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 7, fontWeight: isCrit ? 700 : 400,
                color: isCrit ? '#cc2222' : MUT,
                border: `1px solid ${isCrit ? '#cc222255' : '#2a2a2a'}`,
                borderRadius: 2, padding: '1px 4px', fontFamily: "'IBM Plex Mono',monospace" }}>
                📍 {dist.toFixed(1)}km away
              </span>
              {btypeClean && (
                <span style={{ fontSize: 7, color: MUT, border: '1px solid #252525', borderRadius: 2, padding: '1px 4px' }}>
                  {btypeClean}
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: hColor, fontFamily: "'IBM Plex Mono',monospace" }}>
            {h.toFixed(1)}m
          </span>
          <span style={{ fontSize: 8, color: MUT }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['Clearance',    `${h.toFixed(1)} m`],
              ...(wt != null ? [['Weight limit', `${wt % 1 === 0 ? wt : wt.toFixed(1)} t`]] : []),
              ['Distance',     `${dist.toFixed(2)} km`],
              ['Bridge Type',  btypeClean || '—'],
              ['Coordinates',  `${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}`],
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '6px 8px' }}>
                <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>{lbl}</div>
                <div style={{ fontSize: 10, color: TXT, fontFamily: "'IBM Plex Mono',monospace", wordBreak: 'break-all' }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#5a7a9a', border: '1px solid #1e2e3e', borderRadius: 2, padding: '4px 8px', textDecoration: 'none', background: '#0a1520' }}>
              📍 Maps
            </a>
            <a href={svUrl} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#5a6a7a', border: '1px solid #1e2a3a', borderRadius: 2, padding: '4px 8px', textDecoration: 'none', background: '#0a1018' }}>
              🔭 Street View
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function BridgeInfoCard({ rec, dist, onClose, pos }) {
  const [lat, lng, height, label, btype, maxweight] = Array.isArray(rec) ? rec : [];
  const h          = parseFloat(height);
  const hColor     = h < 4.0 ? '#cc3333' : h < 4.6 ? '#cc8822' : '#5a9aee';
  const hLabel     = h < 4.0 ? 'Critical' : h < 4.6 ? 'Tight' : 'Clear';
  const btypeClean = (btype && btype !== 'NULL') ? btype : null;
  const mapsUrl    = `https://www.google.com/maps?q=${lat},${lng}`;
  const svUrl      = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
  const linkStyle  = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 8, padding: '3px 8px', borderRadius: 2, textDecoration: 'none',
    fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700,
    color: '#5a8ab0', border: '1px solid #1e3a5a', background: '#0a1520',
  };
  return (
    <div onClick={e => e.stopPropagation()} style={{
      position: 'absolute', left: pos.x + 14, top: pos.y - 8,
      zIndex: 1500, width: 220, pointerEvents: 'all',
      background: '#111', border: `1px solid ${hColor}44`,
      borderLeft: `3px solid ${hColor}`,
      borderRadius: 2, boxShadow: '0 4px 24px #000a',
      fontFamily: "'IBM Plex Mono',monospace",
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 8px 5px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: TXT, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label || 'Bridge'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 7, fontWeight: 700, color: hColor, border: `1px solid ${hColor}55`, borderRadius: 2, padding: '1px 5px', background: hColor + '15', textTransform: 'uppercase' }}>
              {h.toFixed(1)}m · {hLabel}
            </span>
            {dist != null && (
              <span style={{ fontSize: 8, fontWeight: 700, color: ORANGE }}>📍 {dist.toFixed(1)}km</span>
            )}
          </div>
        </div>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13, padding: '0 0 0 6px', lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>
      <div style={{ padding: '5px 8px 6px', borderTop: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {btypeClean && <InfoRow label="Type"   value={btypeClean} />}
        <InfoRow label="Clear"  value={`${h.toFixed(1)} m`} />
        {maxweight != null && <InfoRow label="Weight" value={`${parseFloat(maxweight) % 1 === 0 ? parseFloat(maxweight) : parseFloat(maxweight).toFixed(1)} t`} />}
        <InfoRow label="Coords" value={`${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}`} />
      </div>
      <div style={{ padding: '5px 8px 7px', borderTop: '1px solid #1e1e1e', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>📍 Maps</a>
        <a href={svUrl}   target="_blank" rel="noopener noreferrer" style={linkStyle}>🔭 Street View</a>
      </div>
    </div>
  );
}

export default function OpsTab({ allFeatures, liveIds, loading, lastFetch, countdown, isStale, acceptedJobs, userEmail, onAcceptJob, onReleaseJob, companyConfig, companyId, userPos }) {
  const { rainSoon, maxProb, hoursUntil } = useWeather();

  // Layer toggles
  const [showActive,      setShowActive]      = useState(true);
  const [showCleared,     setShowCleared]     = useState(true);
  const [showHotspots,    setShowHotspots]    = useState(true);
  const [showTruck,       setShowTruck]       = useState(true);
  const [showBridges,     setShowBridges]     = useState(false);
  const [bridgeData,      setBridgeData]      = useState([]); // array of [lat,lng,h,label,btype]

  // Map state
  const [driverLocations, setDriverLocations] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [cardPos,         setCardPos]         = useState({ x: 0, y: 0 });
  const [mapReady,        setMapReady]        = useState(false);

  // Trace panel
  const [traceOpen,          setTraceOpen]          = useState(false);
  const [towType,            setTowType]            = useState('accident');
  const [fromDepot,          setFromDepot]          = useState(true);
  const [returnDepot,        setReturnDepot]        = useState(true);
  const [destinationEnabled, setDestinationEnabled] = useState(false);
  const [pointA,             setPointA]             = useState(null);
  const [pointB,             setPointB]             = useState(null);
  const [searchA,            setSearchA]            = useState('');
  const [searchB,            setSearchB]            = useState('');
  const [searchAResults,     setSearchAResults]     = useState([]);
  const [searchBResults,     setSearchBResults]     = useState([]);
  const [extraLegs,          setExtraLegs]          = useState([]); // [{point,search,results}]
  const [clickTarget,        setClickTarget]        = useState(null); // 'A'|'B'|number|null
  const [twoUpTrade,         setTwoUpTrade]         = useState(false);
  const [twoUpAccident,      setTwoUpAccident]      = useState(false);
  const [traceRoute,         setTraceRoute]         = useState(null);
  const [companyDepots,      setCompanyDepots]      = useState([]);
  const [selectedDepotId,       setSelectedDepotId]       = useState('');
  const [depotPoint,            setDepotPoint]            = useState(null);
  const [selectedReturnDepotId, setSelectedReturnDepotId] = useState('');
  const [returnDepotPoint,      setReturnDepotPoint]      = useState(null);
  const [routeTrigger,          setRouteTrigger]          = useState(0);
  const [locatingA,             setLocatingA]             = useState(false);
  const [locatingB,             setLocatingB]             = useState(false);
  // Custom tab state
  const [customLegTypes,     setCustomLegTypes]     = useState([]);
  const [customLegPcts,      setCustomLegPcts]      = useState([]);
  const [customLegPctInputs, setCustomLegPctInputs] = useState([]);
  const [totalAdjPct,        setTotalAdjPct]        = useState(0);
  const [totalAdjInput,      setTotalAdjInput]      = useState('');

  const [selectedBridge,        setSelectedBridge]        = useState(null); // [lat,lng,h,label,btype]
  const [bridgeCardPos,         setBridgeCardPos]         = useState({ x: 0, y: 0 });

  // Refs
  const containerRef            = useRef(null);
  const mapRef                  = useRef(null);
  const leafletRef              = useRef(null);
  const activeLayerRef          = useRef(null);
  const clearedLayerRef         = useRef(null);
  const hotspotLayerRef         = useRef(null);
  const truckLayerRef           = useRef(null);
  const routeLayerRef           = useRef(null);
  const tracePinLayerRef        = useRef(null);
  const bridgeLayerRef          = useRef(null);
  const userPosRef              = useRef(null);
  const selectedLatLngRef       = useRef(null);
  const selectedBridgeLatLngRef = useRef(null);
  const clickTargetRef          = useRef(null);

  userPosRef.current     = userPos;
  clickTargetRef.current = clickTarget;

  const selectedFeature     = selectedEventId ? allFeatures.find(f => String(f.properties?.eventId) === selectedEventId) || null : null;
  const selectedAcceptedJob = selectedEventId ? (acceptedJobs?.get(selectedEventId) || null) : null;
  const selectedIsLive      = selectedEventId ? liveIds.has(selectedEventId) : false;

  // Driver locations — scoped to this company, debounced to avoid a full fetch per GPS ping
  useEffect(() => {
    if (!companyId) return;
    let debounceTimer;

    const fetchDrivers = async () => {
      try {
        const { data } = await supabase.from('driver_locations')
          .select('driver_email, lat, lng, updated_at')
          .eq('company_id', companyId);
        if (data) setDriverLocations(data);
      } catch { /* ignore */ }
    };

    const debouncedFetch = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchDrivers, 300);
    };

    fetchDrivers();
    const channel = supabase.channel(`driver-locations-${companyId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'driver_locations',
        filter: `company_id=eq.${companyId}`,
      }, debouncedFetch)
      .subscribe();

    return () => { clearTimeout(debounceTimer); supabase.removeChannel(channel); };
  }, [companyId]);

  // Fetch all company depots with coords when trace panel opens
  useEffect(() => {
    if (!traceOpen || !companyId) return;
    (async () => {
      const { data: depots } = await supabase.from('depots')
        .select('id, name, lat, lng')
        .eq('company_id', companyId)
        .not('lat', 'is', null)
        .order('name');
      if (!depots?.length) { setCompanyDepots([]); setDepotPoint(null); return; }
      setCompanyDepots(depots);
      // Auto-select: prefer user's own truck's depot, else first
      let preferred = depots[0];
      if (userEmail) {
        const { data: truck } = await supabase.from('tow_trucks')
          .select('depot_id')
          .eq('auth_email', userEmail)
          .maybeSingle();
        if (truck?.depot_id) {
          const match = depots.find(d => d.id === truck.depot_id);
          if (match) preferred = match;
        }
      }
      setSelectedDepotId(preferred.id);
      setDepotPoint(preferred);
      setSelectedReturnDepotId(preferred.id);
      setReturnDepotPoint(preferred);
    })();
  }, [traceOpen, companyId, userEmail]);

  // Nominatim address search (debounced 300ms)
  const geocodeSearch = useCallback(async (query, setResults) => {
    if (query.length < 3) { setResults([]); return; }
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=au`);
      const data = await res.json();
      setResults(data.map(r => ({ label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) })));
    } catch { setResults([]); }
  }, []);

  // Reverse geocode GPS coords to a short address label
  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      const a    = data.address || {};
      const road = a.road || a.pedestrian || a.path || '';
      const suburb = a.suburb || a.town || a.city || a.county || '';
      return { lat, lng, label: [road, suburb].filter(Boolean).join(', ') || data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
    } catch {
      return { lat, lng, label: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
    }
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
    const wps = [], wpLabels = [];
    const depotName = depotPoint?.name || 'Depot';
    if (fromDepot && depotPoint?.lat != null) { wps.push(depotPoint); wpLabels.push(depotName); }
    if (pointA) { wps.push(pointA); wpLabels.push(pointA.label?.split(',')[0] || 'Pickup'); }
    if (destinationEnabled && pointB) { wps.push(pointB); wpLabels.push(pointB.label?.split(',')[0] || 'Dest'); }
    extraLegs.forEach((el, i) => { if (el.point) { wps.push(el.point); wpLabels.push(el.point.label?.split(',')[0] || `Stop ${i + 1}`); } });
    if (returnDepot && returnDepotPoint?.lat != null) { wps.push(returnDepotPoint); wpLabels.push(returnDepotPoint.name || 'Return Depot'); }
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
        if (!cancelled) {
          const legs = route.legs.map((l, i) => ({
            km:    l.distance / 1000,
            label: `${wpLabels[i] || `Pt ${i+1}`} → ${wpLabels[i+1] || `Pt ${i+2}`}`,
          }));
          setTraceRoute({ totalKm: route.distance / 1000, durationMin: Math.round(route.duration / 60), legs });
          setCustomLegTypes(legs.map(() => 'accident'));
          setCustomLegPcts(legs.map(() => 0));
          setCustomLegPctInputs(legs.map(() => ''));
        }
      } catch { if (!cancelled) setTraceRoute(null); }
    })();
    return () => { cancelled = true; };
  }, [traceOpen, fromDepot, returnDepot, destinationEnabled, depotPoint, returnDepotPoint, pointA, pointB, extraLegs, routeTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trace pin markers (depot=🔶, A=🟢, B=🔴)
  useEffect(() => {
    const L = leafletRef.current, layer = tracePinLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    if (!traceOpen) return;
    if (fromDepot && depotPoint?.lat != null) {
      L.marker([depotPoint.lat, depotPoint.lng], {
        icon: L.divIcon({ className: '', html: '<div style="font-size:16px;line-height:1">🔶</div>', iconSize: [16, 16], iconAnchor: [8, 14] }),
        zIndexOffset: 200,
      }).bindTooltip(`From: ${depotPoint.name || 'Depot'}`, { permanent: false, direction: 'top', className: 'towbench-tooltip' }).addTo(layer);
    }
    if (returnDepot && returnDepotPoint?.lat != null && (!fromDepot || returnDepotPoint.id !== depotPoint?.id)) {
      L.marker([returnDepotPoint.lat, returnDepotPoint.lng], {
        icon: L.divIcon({ className: '', html: '<div style="font-size:16px;line-height:1">🔷</div>', iconSize: [16, 16], iconAnchor: [8, 14] }),
        zIndexOffset: 200,
      }).bindTooltip(`Return: ${returnDepotPoint.name || 'Depot'}`, { permanent: false, direction: 'top', className: 'towbench-tooltip' }).addTo(layer);
    }
    if (pointA) {
      L.marker([pointA.lat, pointA.lng], {
        icon: L.divIcon({ className: '', html: '<div style="font-size:16px;line-height:1">🟢</div>', iconSize: [16, 16], iconAnchor: [8, 14] }),
        zIndexOffset: 201,
      }).bindTooltip('A — Pickup', { permanent: false, direction: 'top', className: 'towbench-tooltip' }).addTo(layer);
    }
    if (destinationEnabled && pointB) {
      L.marker([pointB.lat, pointB.lng], {
        icon: L.divIcon({ className: '', html: '<div style="font-size:16px;line-height:1">🔴</div>', iconSize: [16, 16], iconAnchor: [8, 14] }),
        zIndexOffset: 202,
      }).bindTooltip('B — Destination', { permanent: false, direction: 'top', className: 'towbench-tooltip' }).addTo(layer);
    }
    extraLegs.forEach((el, i) => {
      if (!el.point) return;
      L.marker([el.point.lat, el.point.lng], {
        icon: L.divIcon({ className: '', html: '<div style="font-size:16px;line-height:1">🟡</div>', iconSize: [16, 16], iconAnchor: [8, 14] }),
        zIndexOffset: 203 + i,
      }).bindTooltip(`Stop ${i + 1}`, { permanent: false, direction: 'top', className: 'towbench-tooltip' }).addTo(layer);
    });
  }, [mapReady, traceOpen, fromDepot, returnDepot, destinationEnabled, depotPoint, returnDepotPoint, pointA, pointB, extraLegs]);

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
      const bridgeLayer   = L.layerGroup(); // not added by default — toggled on demand

      activeLayerRef.current   = activeLayer;
      clearedLayerRef.current  = clearedLayer;
      hotspotLayerRef.current  = hotspotLayer;
      truckLayerRef.current    = truckLayer;
      routeLayerRef.current    = routeLayer;
      tracePinLayerRef.current = tracePinLayer;
      bridgeLayerRef.current   = bridgeLayer;
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
        if (ll) {
          const pt = map.latLngToContainerPoint([ll.lat, ll.lng]);
          setCardPos({ x: pt.x, y: pt.y });
        }
        const bll = selectedBridgeLatLngRef.current;
        if (bll) {
          const bpt = map.latLngToContainerPoint([bll.lat, bll.lng]);
          setBridgeCardPos({ x: bpt.x, y: bpt.y });
        }
      };
      map.on('move zoom moveend zoomend', updateCardPos);

      map.on('click', e => {
        if (clickTargetRef.current != null) {
          const { lat, lng } = e.latlng;
          const label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          if (clickTargetRef.current === 'A') {
            setPointA({ lat, lng, label });
            setSearchA(label);
            setSearchAResults([]);
          } else if (clickTargetRef.current === 'B') {
            setPointB({ lat, lng, label });
            setSearchB(label);
            setSearchBResults([]);
          } else if (typeof clickTargetRef.current === 'number') {
            const idx = clickTargetRef.current;
            setExtraLegs(prev => prev.map((el, i) => i === idx ? { ...el, point: { lat, lng, label }, search: label, results: [] } : el));
          }
          setClickTarget(null);
          return;
        }
        setSelectedEventId(null);
        selectedLatLngRef.current = null;
        setSelectedBridge(null);
        selectedBridgeLatLngRef.current = null;
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

  // Fetch bridge data once when layer is first enabled
  useEffect(() => {
    if (!showBridges || !BRIDGE_URL || bridgeData.length > 0) return;
    fetch(BRIDGE_URL)
      .then(r => r.json())
      .then(data => {
        const records = data.r || data.records || data.features || [];
        setBridgeData(records);
      })
      .catch(e => console.warn('Bridge data fetch failed:', e.message));
  }, [showBridges]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render bridge markers on map from bridgeData
  useEffect(() => {
    const map = mapRef.current, layer = bridgeLayerRef.current;
    if (!map || !layer) return;
    if (!showBridges || bridgeData.length === 0) { map.removeLayer(layer); layer.clearLayers(); return; }
    const L = leafletRef.current;
    if (!L) return;
    layer.clearLayers();
    map.addLayer(layer);
    bridgeData.forEach(rec => {
      let lat, lng, height, label, btype;
      if (Array.isArray(rec)) {
        [lat, lng, height, label, btype] = rec;
      } else {
        const coords = rec.geometry?.coordinates;
        if (!coords) return;
        [lng, lat] = Array.isArray(coords[0]) ? coords[0] : coords;
        const p = rec.properties || {};
        height = p.height_limit ?? p.height ?? p.clearance ?? p.max_height ?? null;
        label  = p.road_name || p.name || '';
      }
      if (lat == null || lng == null || height == null) return;
      const h    = parseFloat(height);
      const sz   = h < 4.0 ? 10 : 7;
      const tip  = [label, btype].filter(v => v && v !== 'NULL').join(' · ') || `${h.toFixed(1)}m`;
      // Critical bridges pulse like active allocations; others are solid red dots
      const dotHtml = h < 4.0
        ? `<div style="position:relative;width:${sz}px;height:${sz}px">` +
          `<div style="position:absolute;top:50%;left:50%;width:${sz}px;height:${sz}px;border-radius:50%;background:#cc2222;animation:ops-pulse 2s ease-out infinite"></div>` +
          `<div style="position:absolute;top:50%;left:50%;width:${sz}px;height:${sz}px;border-radius:50%;background:#cc2222;transform:translate(-50%,-50%);opacity:0.95"></div>` +
          `</div>`
        : `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:#cc2222;opacity:0.65"></div>`;
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({ className: '', html: dotHtml, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] }),
        bubblingMouseEvents: false,
        zIndexOffset: h < 4.0 ? 90 : 80,
      });
      marker.addTo(layer);
      marker.bindTooltip(tip, { direction: 'top', className: 'towbench-tooltip' });
      marker.on('click', e => {
        L.DomEvent.stopPropagation(e);
        const m = mapRef.current;
        if (!m) return;
        const pt = m.latLngToContainerPoint([lat, lng]);
        setBridgeCardPos({ x: pt.x, y: pt.y });
        setSelectedBridge(rec);
        selectedBridgeLatLngRef.current = { lat, lng };
      });
    });
  }, [showBridges, bridgeData, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveCount    = liveIds.size;
  const cutoff24h    = Date.now() - 24 * 60 * 60 * 1000;
  const clearedCount = allFeatures.filter(f => {
    const id = String(f.properties?.eventId || '');
    if (liveIds.has(id)) return false;
    const t = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated || 0).getTime();
    return t >= cutoff24h;
  }).length;

  const allowAccidentTwoUp = companyConfig?.allow_accident_twoup ?? false;
  const tracePrice = (traceRoute && towType !== 'custom')
    ? calcTracePrice(traceRoute.totalKm, companyConfig, towType, twoUpTrade, twoUpAccident, allowAccidentTwoUp)
    : null;
  const customPrice = (traceRoute && towType === 'custom' && traceRoute.legs)
    ? calcCustomPrice(traceRoute.legs, customLegTypes, customLegPcts, totalAdjPct, companyConfig, twoUpTrade, twoUpAccident, allowAccidentTwoUp)
    : null;

  const BRIDGE_LIST_KM  = 2.0;
  const BRIDGE_FLASH_KM = 0.5;

  const nearbyBridges = useMemo(() => {
    if (!showBridges || !userPos || !bridgeData.length) return [];
    return bridgeData
      .map(rec => {
        const [lat, lng] = Array.isArray(rec) ? rec : [rec.geometry?.coordinates[1], rec.geometry?.coordinates[0]];
        const dist = haversineKm(userPos.lat, userPos.lng, lat, lng);
        return { rec, dist };
      })
      .filter(({ dist }) => dist <= BRIDGE_LIST_KM)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 10);
  }, [showBridges, userPos, bridgeData]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeTrace = () => {
    setTraceOpen(false);
    setClickTarget(null);
    setTraceRoute(null);
    setDestinationEnabled(false);
    setPointA(null); setPointB(null);
    setSearchA(''); setSearchB('');
    setSearchAResults([]); setSearchBResults([]);
    setExtraLegs([]);
    setCompanyDepots([]); setSelectedDepotId(''); setSelectedReturnDepotId(''); setReturnDepotPoint(null);
    setRouteTrigger(0);
    setCustomLegTypes([]); setCustomLegPcts([]); setCustomLegPctInputs([]);
    setTotalAdjPct(0); setTotalAdjInput('');
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
        {BRIDGE_URL && (
          <LayerBadge active={showBridges} onClick={() => setShowBridges(v => !v)} color="#5a9aee" label="🌉 Bridges" />
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
                {['accident', 'trade', 'custom'].map(tp => (
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
                <span style={{ fontSize: 8, color: fromDepot ? ORANGE : '#444' }}>From depot</span>
              </label>
              {/* Departure depot picker */}
              {fromDepot && companyDepots.length > 0 && (
                <select
                  value={selectedDepotId}
                  onChange={e => {
                    setSelectedDepotId(e.target.value);
                    const d = companyDepots.find(d => d.id === e.target.value);
                    setDepotPoint(d ?? null);
                  }}
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #252525', color: ORANGE, fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, padding: '4px 6px', borderRadius: 2, outline: 'none' }}>
                  {companyDepots.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}

              {/* Point A */}
              <div style={{ position: 'relative' }}>
                <div style={{ fontSize: 7, color: '#444', letterSpacing: '0.08em', marginBottom: 3 }}>A — Pickup</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    value={searchA}
                    onChange={e => { setSearchA(e.target.value); if (!e.target.value) setPointA(null); }}
                    onBlur={() => setTimeout(() => setSearchAResults([]), 150)}
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
                {navigator.geolocation && !pointA && (
                  <button
                    onClick={async () => {
                      setLocatingA(true);
                      try {
                        const coords = userPos ?? await new Promise((res, rej) =>
                          navigator.geolocation.getCurrentPosition(
                            p => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
                            rej, { enableHighAccuracy: true, timeout: 10_000 }
                          )
                        );
                        const p = await reverseGeocode(coords.lat, coords.lng);
                        setPointA(p); setSearchA(p.label.split(',')[0].trim()); setSearchAResults([]);
                      } catch { /* permission denied / timeout */ }
                      setLocatingA(false);
                    }}
                    disabled={locatingA}
                    style={{
                      marginTop: 5, width: '100%', padding: '5px 0', borderRadius: 2, cursor: 'pointer',
                      border: '1px solid #2a4a2a', color: locatingA ? '#444' : GRN,
                      background: '#0a150a', fontSize: 9, fontWeight: 700,
                      fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em',
                    }}>
                    {locatingA ? '…locating' : '📍 Use my location'}
                  </button>
                )}
                {pointA && (
                  <div style={{ fontSize: 7, color: GRN, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    🟢 {pointA.label}
                  </div>
                )}
                {searchAResults.length > 0 && !pointA && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 300, background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: 2, maxHeight: 130, overflowY: 'auto', marginTop: 2 }}>
                    {searchAResults.map((r, i) => (
                      <div key={i}
                        onMouseDown={e => { e.preventDefault(); setPointA(r); setSearchA(r.label.split(',')[0].trim()); setSearchAResults([]); }}
                        style={{ padding: '5px 8px', fontSize: 7, color: '#bbb', cursor: 'pointer', borderBottom: '1px solid #1a1a1a', lineHeight: 1.5 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        {r.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Destination toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                <input type="checkbox" checked={destinationEnabled}
                  onChange={e => {
                    setDestinationEnabled(e.target.checked);
                    if (!e.target.checked) {
                      setPointB(null); setSearchB(''); setSearchBResults([]);
                      setClickTarget(ct => ct === 'B' ? null : ct);
                    }
                  }}
                  style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 8, color: destinationEnabled ? '#cc4444' : '#444' }}>
                  Destination (optional)
                </span>
              </label>

              {/* Point B — only when destination enabled */}
              {destinationEnabled && (
                <div style={{ position: 'relative' }}>
                  <div style={{ fontSize: 7, color: '#444', letterSpacing: '0.08em', marginBottom: 3 }}>B — Destination</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      value={searchB}
                      onChange={e => { setSearchB(e.target.value); if (!e.target.value) setPointB(null); }}
                      onBlur={() => setTimeout(() => setSearchBResults([]), 150)}
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
                  {navigator.geolocation && !pointB && (
                    <button
                      onClick={async () => {
                        setLocatingB(true);
                        try {
                          const coords = userPos ?? await new Promise((res, rej) =>
                            navigator.geolocation.getCurrentPosition(
                              p => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
                              rej, { enableHighAccuracy: true, timeout: 10_000 }
                            )
                          );
                          const p = await reverseGeocode(coords.lat, coords.lng);
                          setPointB(p); setSearchB(p.label.split(',')[0].trim()); setSearchBResults([]);
                        } catch { /* permission denied / timeout */ }
                        setLocatingB(false);
                      }}
                      disabled={locatingB}
                      style={{
                        marginTop: 5, width: '100%', padding: '5px 0', borderRadius: 2, cursor: 'pointer',
                        border: '1px solid #4a1a1a', color: locatingB ? '#444' : '#cc4444',
                        background: '#150a0a', fontSize: 9, fontWeight: 700,
                        fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em',
                      }}>
                      {locatingB ? '…locating' : '📍 Use my location'}
                    </button>
                  )}
                  {pointB && (
                    <div style={{ fontSize: 7, color: '#cc4444', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      🔴 {pointB.label}
                    </div>
                  )}
                  {searchBResults.length > 0 && !pointB && (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 300, background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: 2, maxHeight: 130, overflowY: 'auto', marginTop: 2 }}>
                      {searchBResults.map((r, i) => (
                        <div key={i}
                          onMouseDown={e => { e.preventDefault(); setPointB(r); setSearchB(r.label.split(',')[0].trim()); setSearchBResults([]); }}
                          style={{ padding: '5px 8px', fontSize: 7, color: '#bbb', cursor: 'pointer', borderBottom: '1px solid #1a1a1a', lineHeight: 1.5 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          {r.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Extra legs (dynamic stops) */}
              {extraLegs.map((el, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <div style={{ fontSize: 7, color: '#444', letterSpacing: '0.08em', marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Stop {i + 1}</span>
                    <button onClick={() => setExtraLegs(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 10, padding: 0, lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      value={el.search}
                      onChange={e => {
                        const v = e.target.value;
                        setExtraLegs(prev => prev.map((x, j) => j === i ? { ...x, search: v, point: v ? x.point : null } : x));
                        if (v.length >= 3) {
                          setTimeout(() => geocodeSearch(v, results =>
                            setExtraLegs(prev => prev.map((x, j) => j === i ? { ...x, results } : x))
                          ), 300);
                        } else {
                          setExtraLegs(prev => prev.map((x, j) => j === i ? { ...x, results: [] } : x));
                        }
                      }}
                      onBlur={() => setTimeout(() => setExtraLegs(prev => prev.map((x, j) => j === i ? { ...x, results: [] } : x)), 150)}
                      placeholder="Search address…"
                      style={{ ...traceInp, flex: 1 }}
                    />
                    <button
                      onClick={() => setClickTarget(ct => ct === i ? null : i)}
                      title="Click map to place stop"
                      style={{
                        fontSize: 10, width: 26, borderRadius: 2, cursor: 'pointer', flexShrink: 0,
                        border: `1px solid ${clickTarget === i ? '#ccaa0088' : '#2a2a2a'}`,
                        color: clickTarget === i ? '#ccaa00' : '#555',
                        background: clickTarget === i ? '#ccaa0011' : 'transparent',
                        fontFamily: "'IBM Plex Mono',monospace",
                      }}>✛</button>
                  </div>
                  {el.point && (
                    <div style={{ fontSize: 7, color: '#ccaa00', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      🟡 {el.point.label}
                    </div>
                  )}
                  {el.results?.length > 0 && !el.point && (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 300, background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: 2, maxHeight: 130, overflowY: 'auto', marginTop: 2 }}>
                      {el.results.map((r, ri) => (
                        <div key={ri}
                          onMouseDown={e => { e.preventDefault(); setExtraLegs(prev => prev.map((x, j) => j === i ? { ...x, point: r, search: r.label.split(',')[0].trim(), results: [] } : x)); }}
                          style={{ padding: '5px 8px', fontSize: 7, color: '#bbb', cursor: 'pointer', borderBottom: '1px solid #1a1a1a', lineHeight: 1.5 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          {r.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Add Leg button */}
              <button
                onClick={() => setExtraLegs(prev => [...prev, { point: null, search: '', results: [] }])}
                style={{ fontSize: 7, color: '#444', border: '1px dashed #2a2a2a', borderRadius: 2, background: 'transparent', padding: '3px 8px', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", textAlign: 'left' }}>
                + Add Stop
              </button>

              {/* Return to depot */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                <input type="checkbox" checked={returnDepot} onChange={e => setReturnDepot(e.target.checked)} style={{ accentColor: ORANGE, flexShrink: 0 }} />
                <span style={{ fontSize: 8, color: returnDepot ? ORANGE : '#444' }}>Return to depot</span>
              </label>
              {/* Return depot picker */}
              {returnDepot && companyDepots.length > 0 && (
                <select
                  value={selectedReturnDepotId}
                  onChange={e => {
                    setSelectedReturnDepotId(e.target.value);
                    const d = companyDepots.find(d => d.id === e.target.value);
                    setReturnDepotPoint(d ?? null);
                  }}
                  style={{ width: '100%', background: '#0a0a0a', border: '1px solid #252525', color: ORANGE, fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, padding: '4px 6px', borderRadius: 2, outline: 'none' }}>
                  {companyDepots.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
            </div>

            {/* Custom pricing panel */}
            {towType === 'custom' && traceRoute?.legs && (() => {
              const PCT_BADGES = [10, 30, 50];
              return (
                <div style={{ padding: '7px 10px', borderBottom: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 7, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Custom Pricing</div>

                  {/* Per-leg rows */}
                  {traceRoute.legs.map((leg, i) => (
                    <div key={i} style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 2, padding: '6px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 7, color: '#555' }}>{leg.label}</span>
                        <span style={{ fontSize: 7, color: '#3a3a3a' }}>{leg.km.toFixed(1)} km</span>
                      </div>
                      {/* Type toggle */}
                      <div style={{ display: 'flex', gap: 3, marginBottom: 5 }}>
                        {['accident', 'trade'].map(tp => (
                          <button key={tp} onClick={() => setCustomLegTypes(prev => prev.map((v, j) => j === i ? tp : v))}
                            style={{ flex: 1, fontSize: 7, padding: '2px 0', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace",
                              border: `1px solid ${customLegTypes[i] === tp ? '#cc444466' : '#1e1e1e'}`,
                              color: customLegTypes[i] === tp ? '#cc4444' : '#444',
                              background: customLegTypes[i] === tp ? '#cc444411' : 'transparent' }}>
                            {tp.charAt(0).toUpperCase() + tp.slice(1)}
                          </button>
                        ))}
                      </div>
                      {/* Per-leg % badges */}
                      <div style={{ fontSize: 7, color: '#333', marginBottom: 3 }}>Leg adjustment</div>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {[0, ...PCT_BADGES].map(p => (
                          <button key={p} onClick={() => { setCustomLegPcts(prev => prev.map((v, j) => j === i ? p : v)); setCustomLegPctInputs(prev => prev.map((v, j) => j === i ? '' : v)); }}
                            style={{ fontSize: 7, padding: '2px 5px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace",
                              border: `1px solid ${customLegPcts[i] === p && customLegPctInputs[i] === '' ? '#cc444466' : '#1e1e1e'}`,
                              color: customLegPcts[i] === p && customLegPctInputs[i] === '' ? '#cc4444' : '#444',
                              background: customLegPcts[i] === p && customLegPctInputs[i] === '' ? '#cc444411' : 'transparent' }}>
                            {p === 0 ? '—' : `+${p}%`}
                          </button>
                        ))}
                        {/* Custom % input */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <input
                            type="number" min="0" max="999" placeholder="%" value={customLegPctInputs[i] || ''}
                            onChange={e => {
                              const v = e.target.value;
                              setCustomLegPctInputs(prev => prev.map((x, j) => j === i ? v : x));
                              const n = parseFloat(v);
                              if (!isNaN(n)) setCustomLegPcts(prev => prev.map((x, j) => j === i ? n : x));
                            }}
                            style={{ width: 36, fontSize: 7, padding: '2px 4px', background: '#0a0a0a', border: `1px solid ${customLegPctInputs[i] ? '#cc444466' : '#1e1e1e'}`, color: customLegPctInputs[i] ? '#cc4444' : '#444', borderRadius: 2, fontFamily: "'IBM Plex Mono',monospace", outline: 'none' }}
                          />
                          <span style={{ fontSize: 7, color: '#333' }}>%</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Grand total adjustment */}
                  <div>
                    <div style={{ fontSize: 7, color: '#444', marginBottom: 4 }}>Grand total adjustment</div>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                      {[0, ...PCT_BADGES].map(p => (
                        <button key={p} onClick={() => { setTotalAdjPct(p); setTotalAdjInput(''); }}
                          style={{ fontSize: 7, padding: '2px 6px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace",
                            border: `1px solid ${totalAdjPct === p && totalAdjInput === '' ? '#cc444466' : '#1e1e1e'}`,
                            color: totalAdjPct === p && totalAdjInput === '' ? '#cc4444' : '#444',
                            background: totalAdjPct === p && totalAdjInput === '' ? '#cc444411' : 'transparent' }}>
                          {p === 0 ? '—' : `+${p}%`}
                        </button>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <input
                          type="number" min="0" max="999" placeholder="%" value={totalAdjInput}
                          onChange={e => { setTotalAdjInput(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n)) setTotalAdjPct(n); }}
                          style={{ width: 36, fontSize: 7, padding: '2px 4px', background: '#0a0a0a', border: `1px solid ${totalAdjInput ? '#cc444466' : '#1e1e1e'}`, color: totalAdjInput ? '#cc4444' : '#444', borderRadius: 2, fontFamily: "'IBM Plex Mono',monospace", outline: 'none' }}
                        />
                        <span style={{ fontSize: 7, color: '#333' }}>%</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Result */}
            <div style={{ padding: '8px 10px' }}>
              {/* Depot warning */}
              {(fromDepot || returnDepot) && depotPoint !== undefined && !depotPoint?.lat && (
                <div style={{ fontSize: 7, color: '#7a5500', background: '#1a1200', border: '1px solid #2a2000', borderRadius: 2, padding: '4px 6px', marginBottom: 6 }}>
                  ⚠ Depot has no address — add one in Fleet settings
                </div>
              )}

              {traceRoute ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#cc4444', fontFamily: "'IBM Plex Mono',monospace" }}>
                      {traceRoute.totalKm.toFixed(1)} km · ~{traceRoute.durationMin} min
                    </div>
                    <button
                      onClick={() => setRouteTrigger(t => t + 1)}
                      style={{
                        fontSize: 8, padding: '2px 8px', borderRadius: 2, cursor: 'pointer',
                        fontFamily: "'IBM Plex Mono',monospace", border: '1px solid #cc444488',
                        color: '#cc4444', background: '#cc444411',
                      }}>Go!</button>
                  </div>
                  {towType === 'custom' ? (
                    customPrice ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {customPrice.legResults.map((lr, i) => (
                          <div key={i} style={{ fontSize: 7, color: MUT }}>
                            <span style={{ color: '#444' }}>{lr.label}</span>
                            {' · '}
                            <span style={{ color: lr.pct ? '#aaa' : '#888' }}>{lr.type === 'accident' ? 'Acc' : 'Trd'}</span>
                            {' '}
                            {lr.pct > 0
                              ? <><span style={{ color: '#555', textDecoration: 'line-through', fontSize: 6 }}>${lr.price.toFixed(2)}</span>{' '}<span style={{ color: '#ccc', fontWeight: 700 }}>${lr.adjusted.toFixed(2)}</span><span style={{ color: '#555', fontSize: 6, marginLeft: 2 }}>+{lr.pct}%</span></>
                              : <span style={{ color: '#ccc', fontWeight: 700 }}>${lr.adjusted.toFixed(2)}</span>
                            }
                          </div>
                        ))}
                        <div style={{ borderTop: '1px solid #1e1e1e', paddingTop: 4, marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: 7, color: '#555' }}>
                            {customPrice.totalAdjPct > 0 && <span style={{ color: '#444', marginRight: 4 }}>+{customPrice.totalAdjPct}%</span>}
                            Total
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#cc4444' }}>${customPrice.total.toFixed(2)}</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 7, color: '#333' }}>Set pricing in Settings to estimate cost</div>
                    )
                  ) : tracePrice ? (
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 7, color: '#2a2a2a' }}>
                    {clickTarget
                      ? `Click map to place ${clickTarget}`
                      : pointA
                        ? 'Set a second waypoint or tap Go!'
                        : 'Search or click ✛ to place pickup'}
                  </div>
                  {pointA && !clickTarget && (
                    <button
                      onClick={() => setRouteTrigger(t => t + 1)}
                      style={{
                        fontSize: 9, padding: '4px 12px', borderRadius: 2, cursor: 'pointer', flexShrink: 0,
                        fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, letterSpacing: '0.06em',
                        border: '1px solid #cc444488', color: '#cc4444', background: '#cc444411',
                      }}>Go!</button>
                  )}
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
        {selectedBridge && (
          <BridgeInfoCard
            rec={selectedBridge}
            dist={userPos ? haversineKm(userPos.lat, userPos.lng, selectedBridge[0], selectedBridge[1]) : null}
            onClose={() => { setSelectedBridge(null); selectedBridgeLatLngRef.current = null; }}
            pos={bridgeCardPos}
          />
        )}
      </div>

      {/* Nearby Bridges panel */}
      {showBridges && nearbyBridges.length > 0 && (
        <div style={{ flexShrink: 0, maxHeight: 240, overflowY: 'auto', background: '#0a0a0a', borderTop: '1px solid ' + BRD }}>
          <div style={{ padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 8, position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 10, borderBottom: '1px solid #1a1a1a' }}>
            <span style={{ fontSize: 7, fontWeight: 700, color: '#5a9aee', letterSpacing: '0.12em', textTransform: 'uppercase', flex: 1 }}>
              🌉 Bridges Nearby
            </span>
            <span style={{ fontSize: 7, color: MUT, fontFamily: "'IBM Plex Mono',monospace" }}>
              {nearbyBridges.length} within {BRIDGE_LIST_KM}km
            </span>
          </div>
          <div style={{ padding: '8px 12px' }}>
            {nearbyBridges.map(({ rec, dist }, i) => (
              <BridgeCard key={i} rec={rec} dist={dist} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
