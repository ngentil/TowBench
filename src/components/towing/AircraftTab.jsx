import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MUT, TXT, RED, SURF, BRD } from '../../lib/styles';

const AIRCRAFT_URL = '/.netlify/functions/adsb-aircraft';
const REFRESH_MS   = 30_000;

function altColor(alt) {
  if (alt == null || alt === 'ground') return '#555';
  if (alt >= 20000) return '#4a6a9a';
  if (alt >=  5000) return '#3d9e50';
  if (alt >=  1000) return '#c4a43a';
  return '#c46a1a';
}

function categoryLabel(cat) {
  const map = {
    A1: 'Light', A2: 'Small', A3: 'Large',
    A4: 'Hi-Vortex', A5: 'Heavy', A6: 'Hi-Perf', A7: 'Heli',
    B1: 'Glider', B2: 'Balloon', B4: 'Skydiver',
    C1: 'UAV',
  };
  return map[cat] || cat || '—';
}

function filterCategory(ac, filterId) {
  const cat = ac.category || '';
  if (filterId === 'heavy')   return cat === 'A4' || cat === 'A5';
  if (filterId === 'heli')    return cat === 'A7';
  if (filterId === 'light')   return cat === 'A1' || cat === 'A2';
  if (filterId === 'airliner') return cat === 'A3' || cat === 'A4' || cat === 'A5';
  return true;
}

const FILTERS = [
  { id: 'all',      label: 'All' },
  { id: 'airliner', label: '✈ Airliner' },
  { id: 'heavy',    label: '⬛ Heavy' },
  { id: 'heli',     label: '🚁 Heli' },
  { id: 'light',    label: '🛩️ Light' },
];

function AircraftCard({ ac }) {
  const [open, setOpen] = useState(false);
  const callsign = (ac.flight || '').trim() || '—';
  const reg      = ac.r || '—';
  const type     = ac.t || '—';
  const alt      = typeof ac.alt_baro === 'number' ? ac.alt_baro : null;
  const gs       = ac.gs != null ? Math.round(ac.gs) : null;
  const track    = ac.track != null ? Math.round(ac.track) : null;
  const color    = altColor(alt ?? ac.alt_baro);
  const cat      = categoryLabel(ac.category);
  const mapsUrl  = ac.lat != null ? `https://www.google.com/maps?q=${ac.lat},${ac.lon}` : null;
  const flightUrl = callsign !== '—' ? `https://www.flightradar24.com/${callsign.replace(/\s/g, '')}` : null;

  return (
    <div style={{ background: '#0d0d0d', border: '1px solid #252525', borderLeft: `3px solid ${color}`, borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', cursor: 'pointer' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: TXT }}>{callsign}</span>
            <span style={{ fontSize: 8, color: MUT }}>{reg}</span>
            {ac.category && (
              <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px', border: `1px solid ${color}55`, borderRadius: 2, color, textTransform: 'uppercase', flexShrink: 0 }}>
                {cat}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
            <span style={{ fontSize: 8, color, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>
              {alt != null ? `${alt.toLocaleString()} ft` : (ac.alt_baro === 'ground' ? 'Ground' : '—')}
            </span>
            {gs    != null && <><span style={{ fontSize: 8, color: '#333' }}>·</span><span style={{ fontSize: 8, color: MUT, fontFamily: "'IBM Plex Mono',monospace" }}>{gs} kn</span></>}
            {track != null && <><span style={{ fontSize: 8, color: '#333' }}>·</span><span style={{ fontSize: 8, color: '#444', fontFamily: "'IBM Plex Mono',monospace" }}>{track}°</span></>}
            {type  !== '—' && <><span style={{ fontSize: 8, color: '#333' }}>·</span><span style={{ fontSize: 8, color: '#555' }}>{type}</span></>}
          </div>
        </div>
        <span style={{ fontSize: 8, color: MUT, flexShrink: 0, marginTop: 2 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              ['Callsign', callsign],
              ['Reg',  reg],
              ['Type', type],
              ['Category', cat],
              ...(alt != null       ? [['Altitude', `${alt.toLocaleString()} ft`]] : []),
              ...(gs  != null       ? [['Speed',    `${gs} kn`]] : []),
              ...(track != null     ? [['Track',    `${track}°`]] : []),
              ...(ac.squawk         ? [['Squawk', ac.squawk]] : []),
              ...(ac.emergency && ac.emergency !== 'none' ? [['Emergency', ac.emergency]] : []),
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '5px 8px' }}>
                <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 1 }}>{lbl}</div>
                <div style={{ fontSize: 10, color: lbl === 'Emergency' ? '#cc4444' : TXT, fontFamily: "'IBM Plex Mono',monospace" }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#5a7a9a', border: '1px solid #1e2e3e', borderRadius: 2, padding: '4px 8px', textDecoration: 'none', background: '#0a1520' }}>
                📍 Maps
              </a>
            )}
            {flightUrl && (
              <a href={flightUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#6a7a9a', border: '1px solid #1e253a', borderRadius: 2, padding: '4px 8px', textDecoration: 'none', background: '#0a0f1a' }}>
                ✈ FlightRadar24
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AircraftTab() {
  const [aircraft,  setAircraft]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState('');
  const [filter,    setFilter]    = useState('all');
  const [lastFetch, setLastFetch] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const timerRef = useRef(null);

  const fetchAircraft = useCallback(async () => {
    try {
      const res  = await fetch(AIRCRAFT_URL);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // Sort: airborne first by altitude desc, then ground
      const sorted = (data.aircraft || []).sort((a, b) => {
        const aA = typeof a.alt_baro === 'number' ? a.alt_baro : -1;
        const bA = typeof b.alt_baro === 'number' ? b.alt_baro : -1;
        return bA - aA;
      });
      setAircraft(sorted);
      setErr('');
      setLastFetch(new Date());
      setCountdown(REFRESH_MS / 1000);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAircraft();
    const poll = setInterval(fetchAircraft, REFRESH_MS);
    return () => clearInterval(poll);
  }, [fetchAircraft]);

  useEffect(() => {
    timerRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timerRef.current);
  }, [lastFetch]);

  const counts = {};
  FILTERS.slice(1).forEach(f => {
    counts[f.id] = aircraft.filter(ac => filterCategory(ac, f.id)).length;
  });

  const visible = filter === 'all' ? aircraft : aircraft.filter(ac => filterCategory(ac, filter));

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>✈ ADS-B Aircraft</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            {loading ? 'Loading…' : err
              ? <span style={{ color: RED }}>{err}</span>
              : `${aircraft.length} aircraft · Melbourne 150 nm`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastFetch && <span style={{ fontSize: 8, color: '#444', fontFamily: "'IBM Plex Mono',monospace" }}>refresh in {countdown}s</span>}
          <button onClick={fetchAircraft} style={{ fontSize: 8, fontWeight: 700, padding: '3px 9px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em', border: '1px solid #2a2a2a', color: MUT, background: '#0d0d0d' }}>↺ Refresh</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const cnt    = f.id === 'all' ? aircraft.length : (counts[f.id] || 0);
          const active = filter === f.id;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ fontSize: 8, fontWeight: 700, padding: '3px 9px', borderRadius: 2, cursor: 'pointer',
                fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em',
                border: `1px solid ${active ? '#4a6a9a88' : '#2a2a2a'}`,
                color: active ? '#4a6a9a' : MUT, background: active ? '#4a6a9a11' : '#0d0d0d' }}>
              {f.label}{cnt > 0 ? ` (${cnt})` : ''}
            </button>
          );
        })}
      </div>
      {loading && <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0' }}>Loading…</div>}
      {!loading && err && (
        <div style={{ padding: 16, background: '#1a0a0a', border: '1px solid #3a1a1a', borderRadius: 3, marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: RED, fontWeight: 700 }}>Could not load aircraft: {err}</div>
        </div>
      )}
      {!loading && !err && visible.length === 0 && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '24px 0' }}>
          No {filter === 'all' ? '' : filter + ' '}aircraft tracked right now.
        </div>
      )}
      {!loading && !err && visible.map((ac, i) => <AircraftCard key={ac.hex || i} ac={ac} />)}
    </div>
  );
}
