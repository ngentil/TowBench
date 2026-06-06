import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MUT, TXT, RED, SURF, BRD } from '../../lib/styles';
import { timeAgo } from '../../lib/utils';

const VESSELS_URL = '/.netlify/functions/ais-vessels';
const REFRESH_MS  = 60_000;

function vesselTypeInfo(type) {
  const t = parseInt(type) || 0;
  if (t >= 70 && t <= 79) return { label: 'Cargo',     color: '#5a9a6a', icon: '🚢' };
  if (t >= 80 && t <= 89) return { label: 'Tanker',    color: '#c46a1a', icon: '⛽' };
  if (t >= 60 && t <= 69) return { label: 'Passenger', color: '#4a80c4', icon: '🛳️' };
  if (t === 31 || t === 32 || t === 52) return { label: 'Tug', color: '#8a5ac4', icon: '⚓' };
  if (t === 30)            return { label: 'Fishing',  color: '#c4a43a', icon: '🎣' };
  if (t === 36 || t === 37) return { label: 'Sailing', color: '#3a9a9a', icon: '⛵' };
  return { label: 'Other', color: '#666', icon: '🚤' };
}

function navstatLabel(ns) {
  const n = parseInt(ns);
  if (n === 0) return 'Underway';
  if (n === 1) return 'Anchored';
  if (n === 5) return 'Moored';
  if (n === 8) return 'Sailing';
  return null;
}

const FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'Cargo',     label: '🚢 Cargo' },
  { id: 'Tanker',    label: '⛽ Tanker' },
  { id: 'Passenger', label: '🛳️ Passenger' },
  { id: 'Tug',       label: '⚓ Tug' },
  { id: 'Fishing',   label: '🎣 Fishing' },
];

function VesselCard({ vessel }) {
  const [open, setOpen] = useState(false);
  const name   = (vessel.NAME || '').trim() || `MMSI ${vessel.MMSI}`;
  const sog    = vessel.SOG ?? 0;
  const cog    = vessel.COG ?? 0;
  const dest   = (vessel.DEST || '').trim().replace(/[^A-Z0-9 ]/gi, '');
  const { label: typeLabel, color, icon } = vesselTypeInfo(vessel.TYPE);
  const navLabel = navstatLabel(vessel.NAVSTAT);
  const mapsUrl  = vessel.LATITUDE != null
    ? `https://www.google.com/maps?q=${vessel.LATITUDE},${vessel.LONGITUDE}`
    : null;

  return (
    <div style={{ background: '#0d0d0d', border: '1px solid #252525', borderLeft: `3px solid ${color}`, borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', cursor: 'pointer' }}>
        <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px', border: `1px solid ${color}55`, borderRadius: 2, color, textTransform: 'uppercase', flexShrink: 0 }}>
              {typeLabel}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
            <span style={{ fontSize: 8, fontFamily: "'IBM Plex Mono',monospace", color: sog > 0.5 ? '#8aaa8a' : MUT }}>{sog.toFixed(1)} kn</span>
            {navLabel && <><span style={{ fontSize: 8, color: '#333' }}>·</span><span style={{ fontSize: 8, color: MUT }}>{navLabel}</span></>}
            {dest      && <><span style={{ fontSize: 8, color: '#333' }}>·</span><span style={{ fontSize: 8, color: MUT }}>→ {dest}</span></>}
          </div>
        </div>
        <span style={{ fontSize: 8, color: MUT, flexShrink: 0, marginTop: 2 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              ['MMSI',     String(vessel.MMSI || '—')],
              ['Speed',    `${sog.toFixed(1)} kn`],
              ['Course',   `${cog.toFixed(0)}°`],
              ...(vessel.HEADING != null && vessel.HEADING < 360 ? [['Heading', `${vessel.HEADING}°`]] : []),
              ...(dest               ? [['Dest', dest]]           : []),
              ...(vessel.CALLSIGN    ? [['Call', vessel.CALLSIGN.trim()]] : []),
              ...(vessel.DRAUGHT > 0 ? [['Draft', `${vessel.DRAUGHT} m`]] : []),
              ...(navLabel           ? [['Status', navLabel]]     : []),
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '5px 8px' }}>
                <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 1 }}>{lbl}</div>
                <div style={{ fontSize: 10, color: TXT, fontFamily: "'IBM Plex Mono',monospace" }}>{val}</div>
              </div>
            ))}
          </div>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#5a7a9a', border: '1px solid #1e2e3e', borderRadius: 2, padding: '4px 8px', textDecoration: 'none', background: '#0a1520' }}>
              📍 Open in Google Maps
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function VesselsTab() {
  const [vessels,   setVessels]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState('');
  const [noKey,     setNoKey]     = useState(false);
  const [filter,    setFilter]    = useState('all');
  const [lastFetch, setLastFetch] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const timerRef = useRef(null);

  const fetchVessels = useCallback(async () => {
    try {
      const res  = await fetch(VESSELS_URL);
      if (res.status === 500) {
        const d = await res.json();
        if (d.error?.includes('AIS_HUB_USER')) { setNoKey(true); setLoading(false); return; }
        throw new Error(d.error || res.status);
      }
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setVessels((data.vessels || []).sort((a, b) => (b.SOG ?? 0) - (a.SOG ?? 0)));
      setNoKey(false);
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
    fetchVessels();
    const poll = setInterval(fetchVessels, REFRESH_MS);
    return () => clearInterval(poll);
  }, [fetchVessels]);

  useEffect(() => {
    timerRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timerRef.current);
  }, [lastFetch]);

  const counts = {};
  vessels.forEach(v => {
    const { label } = vesselTypeInfo(v.TYPE);
    counts[label] = (counts[label] || 0) + 1;
  });

  const visible = filter === 'all'
    ? vessels
    : vessels.filter(v => vesselTypeInfo(v.TYPE).label === filter);

  if (noKey) {
    return (
      <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em', marginBottom: 12 }}>⛵ AIS Vessels</div>
        <div style={{ padding: 14, background: '#0d1a0d', border: '1px solid #1e3a1e', borderRadius: 3 }}>
          <div style={{ fontSize: 10, color: '#5a9a6a', fontWeight: 700, marginBottom: 6 }}>Setup required</div>
          <div style={{ fontSize: 9, color: MUT, lineHeight: 1.6 }}>
            Register a free account at <strong style={{ color: '#7ab07a' }}>aishub.net</strong> to get a username, then set:
          </div>
          <div style={{ marginTop: 8, fontSize: 9, fontFamily: "'IBM Plex Mono',monospace", color: '#6a9a7a', background: '#0a0f0a', border: '1px solid #1e2e1e', borderRadius: 2, padding: '6px 10px' }}>
            AIS_HUB_USER = your-username
          </div>
          <div style={{ marginTop: 6, fontSize: 8, color: '#444' }}>in Netlify → Site settings → Environment variables</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>⛵ AIS Vessels</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            {loading ? 'Loading…' : err
              ? <span style={{ color: RED }}>{err}</span>
              : `${vessels.length} vessel${vessels.length !== 1 ? 's' : ''} · Port Phillip Bay`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastFetch && <span style={{ fontSize: 8, color: '#444', fontFamily: "'IBM Plex Mono',monospace" }}>refresh in {countdown}s</span>}
          <button onClick={fetchVessels} style={{ fontSize: 8, fontWeight: 700, padding: '3px 9px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em', border: '1px solid #2a2a2a', color: MUT, background: '#0d0d0d' }}>↺ Refresh</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const cnt    = f.id === 'all' ? vessels.length : (counts[f.id] || 0);
          const active = filter === f.id;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ fontSize: 8, fontWeight: 700, padding: '3px 9px', borderRadius: 2, cursor: 'pointer',
                fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em',
                border: `1px solid ${active ? '#5a9a6a88' : '#2a2a2a'}`,
                color: active ? '#5a9a6a' : MUT, background: active ? '#5a9a6a11' : '#0d0d0d' }}>
              {f.label}{cnt > 0 ? ` (${cnt})` : ''}
            </button>
          );
        })}
      </div>
      {loading && <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0' }}>Loading…</div>}
      {!loading && err && (
        <div style={{ padding: 16, background: '#1a0a0a', border: '1px solid #3a1a1a', borderRadius: 3, marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: RED, fontWeight: 700 }}>Could not load vessels: {err}</div>
        </div>
      )}
      {!loading && !err && visible.length === 0 && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '24px 0' }}>
          No {filter === 'all' ? '' : filter.toLowerCase() + ' '}vessels in Port Phillip Bay right now.
        </div>
      )}
      {!loading && !err && visible.map((v, i) => <VesselCard key={v.MMSI || i} vessel={v} />)}
    </div>
  );
}
