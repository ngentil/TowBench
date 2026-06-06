import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MUT, TXT, RED, SURF, BRD } from '../../lib/styles';
import { timeAgo } from '../../lib/utils';

const EMERGENCY_URL = '/.netlify/functions/vic-emergency';
const REFRESH_MS    = 60_000;

const CAT_COLOR = {
  ACCIDENT: '#af3a3a',
  HAZMAT:   '#c46a1a',
  FIRE:     '#c45a10',
  STORM:    '#4a80c4',
  FLOOD:    '#2a7ac4',
  RESCUE:   '#8a5ac4',
};

function catColor(cat) {
  const c = (cat || '').toUpperCase();
  for (const [key, color] of Object.entries(CAT_COLOR)) {
    if (c.includes(key)) return color;
  }
  return '#555';
}

const SEVERITY_ORDER = ['Emergency Warning', 'Watch and Act', 'Advice', 'No Rating', ''];

const FILTERS = [
  { id: 'all',      label: 'All' },
  { id: 'ACCIDENT', label: '💥 Accident' },
  { id: 'HAZMAT',   label: '☣️ Hazmat' },
  { id: 'FIRE',     label: '🔥 Fire' },
  { id: 'STORM',    label: '⛈️ Storm' },
  { id: 'FLOOD',    label: '🌊 Flood' },
];

function IncidentCard({ inc }) {
  const [open, setOpen] = useState(false);
  const cat    = inc.category1 || inc.category2 || 'OTHER';
  const color  = catColor(cat);
  const ago    = inc.updated ? timeAgo(new Date(inc.updated).getTime()) : null;
  const suburb = inc.location?.suburb || '';
  const region = inc.location?.region || '';

  return (
    <div style={{ background: '#0d0d0d', border: '1px solid #252525', borderLeft: `3px solid ${color}`, borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', cursor: 'pointer' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: TXT }}>{inc.name || inc.title || '—'}</span>
            {inc.severity && inc.severity !== 'No Rating' && (
              <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px', border: `1px solid ${color}55`, borderRadius: 2, color, textTransform: 'uppercase' }}>
                {inc.severity}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
            <span style={{ fontSize: 8, color }}>{cat}</span>
            {suburb && <><span style={{ fontSize: 8, color: '#333' }}>·</span><span style={{ fontSize: 8, color: MUT }}>{suburb}</span></>}
            {ago    && <><span style={{ fontSize: 8, color: '#333' }}>·</span><span style={{ fontSize: 8, color: '#7a7a7a' }}>{ago}</span></>}
          </div>
        </div>
        <span style={{ fontSize: 8, color: MUT, flexShrink: 0, marginTop: 2 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              ['Category', cat],
              ['Status',   inc.status || '—'],
              ...(inc.sourceOrg ? [['Agency',  inc.sourceOrg]] : []),
              ...(region        ? [['Region',  region]] : []),
              ...(inc.updated   ? [['Updated', new Date(inc.updated).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })]] : []),
            ].map(([label, val]) => (
              <div key={label} style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '5px 8px' }}>
                <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 1 }}>{label}</div>
                <div style={{ fontSize: 10, color: TXT, fontFamily: "'IBM Plex Mono',monospace" }}>{val}</div>
              </div>
            ))}
          </div>
          {inc.description && (
            <div style={{ marginTop: 8, fontSize: 9, color: MUT, lineHeight: 1.5 }}>{inc.description}</div>
          )}
          {inc.location?.latitude && inc.location?.longitude && (
            <a href={`https://www.google.com/maps?q=${inc.location.latitude},${inc.location.longitude}`}
               target="_blank" rel="noopener noreferrer"
               onClick={e => e.stopPropagation()}
               style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#5a7a9a', border: '1px solid #1e2e3e', borderRadius: 2, padding: '4px 8px', textDecoration: 'none', background: '#0a1520' }}>
              📍 Open in Google Maps
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function EmergencyTab() {
  const [incidents, setIncidents] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState('');
  const [filter,    setFilter]    = useState('all');
  const [lastFetch, setLastFetch] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const timerRef = useRef(null);

  const fetchIncidents = useCallback(async () => {
    try {
      const res  = await fetch(EMERGENCY_URL);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const list = Array.isArray(data) ? data : (data.results || data.incidents || []);
      list.sort((a, b) => {
        const si = SEVERITY_ORDER.indexOf(a.severity || '');
        const sj = SEVERITY_ORDER.indexOf(b.severity || '');
        return (si === -1 ? 99 : si) - (sj === -1 ? 99 : sj);
      });
      setIncidents(list);
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
    fetchIncidents();
    const poll = setInterval(fetchIncidents, REFRESH_MS);
    return () => clearInterval(poll);
  }, [fetchIncidents]);

  useEffect(() => {
    timerRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timerRef.current);
  }, [lastFetch]);

  const counts = {};
  incidents.forEach(i => {
    const c = (i.category1 || 'OTHER').toUpperCase();
    for (const f of FILTERS.slice(1)) {
      if (c.includes(f.id)) { counts[f.id] = (counts[f.id] || 0) + 1; return; }
    }
  });

  const visible = filter === 'all'
    ? incidents
    : incidents.filter(i => ((i.category1 || '') + ' ' + (i.category2 || '')).toUpperCase().includes(filter));

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>🚨 VicEmergency</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            {loading ? 'Loading…' : err
              ? <span style={{ color: RED }}>{err}</span>
              : `${incidents.length} active incident${incidents.length !== 1 ? 's' : ''} · Victoria`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastFetch && <span style={{ fontSize: 8, color: '#444', fontFamily: "'IBM Plex Mono',monospace" }}>refresh in {countdown}s</span>}
          <button onClick={fetchIncidents} style={{ fontSize: 8, fontWeight: 700, padding: '3px 9px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em', border: '1px solid #2a2a2a', color: MUT, background: '#0d0d0d' }}>↺ Refresh</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const cnt    = f.id === 'all' ? incidents.length : (counts[f.id] || 0);
          const active = filter === f.id;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ fontSize: 8, fontWeight: 700, padding: '3px 9px', borderRadius: 2, cursor: 'pointer',
                fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em',
                border: `1px solid ${active ? RED + '88' : '#2a2a2a'}`,
                color: active ? RED : MUT, background: active ? RED + '11' : '#0d0d0d' }}>
              {f.label}{cnt > 0 ? ` (${cnt})` : ''}
            </button>
          );
        })}
      </div>
      {loading && <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0' }}>Loading…</div>}
      {!loading && err && (
        <div style={{ padding: '16px', background: '#1a0a0a', border: '1px solid #3a1a1a', borderRadius: 3, marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: RED, fontWeight: 700 }}>Could not load incidents: {err}</div>
        </div>
      )}
      {!loading && !err && visible.length === 0 && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '24px 0' }}>
          No {filter === 'all' ? '' : filter.toLowerCase() + ' '}incidents right now.
        </div>
      )}
      {!loading && !err && visible.map((inc, i) => <IncidentCard key={inc.id || i} inc={inc} />)}
    </div>
  );
}
