import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ACC, MUT, BRD, TXT, RED, SURF } from '../../lib/styles';
import { supabase } from '../../lib/supabase';
import { timeAgo } from '../../lib/utils';

const REFRESH_MS     = 60_000;
const WINDOW_MS      = 2 * 60 * 60 * 1000;
const EMERGENCY_URL  = '/.netlify/functions/vic-emergency';

const AGENCY_COLOR = {
  CFS:     '#af6a2a',
  MFS:     '#af2a2a',
  SES:     '#a89a20',
  SAAS:    '#2aaf5a',
  MEDSTAR: '#2a8faf',
  VIC:     '#5a7aaf',
};

function incidentIcon(sub = '') {
  const s = sub.toLowerCase();
  if (s.includes('fire'))                              return '🔥';
  if (s.includes('medic') || s.includes('ambulance')) return '🚑';
  if (s.includes('rescue') || s.includes('ses'))      return '⛑';
  if (s.includes('storm') || s.includes('flood'))     return '🌩';
  return '🚨';
}

function normaliseEmergency(raw) {
  const p = raw.properties || {};
  return {
    id:       String(raw.id || p.id || Math.random()),
    source:   'vic',
    agency:   'VIC',
    title:    p.title || p.name || p.headline || 'Emergency Incident',
    location: p.location || p.description || '',
    subType:  p.category1 || p.category2 || '',
    status:   p.status || '',
    message:  null,
    time:     new Date(p.updated || p.pubDate || Date.now()),
    geometry: raw.geometry || null,
  };
}

function normalisePagerMsg(row) {
  return {
    id:       String(row.id),
    source:   'pager',
    agency:   row.agency || 'OTHER',
    title:    row.incident_type || row.agency || 'Pager Message',
    location: row.address || '',
    subType:  row.incident_type || '',
    status:   '',
    message:  row.message,
    time:     new Date(row.received_at),
    geometry: null,
  };
}

function PagerCard({ item }) {
  const [open, setOpen] = useState(false);
  const color = AGENCY_COLOR[item.agency] || '#555';
  const ago   = timeAgo(item.time?.toISOString?.() || item.time);

  return (
    <div style={{ background: '#0d0d0d', border: '1px solid #252525', borderLeft: `3px solid ${color}`, borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', cursor: 'pointer' }}>
        <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>
          {item.source === 'vic' ? incidentIcon(item.subType) : '📟'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 8, fontWeight: 700, color, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.08em' }}>
              {item.agency}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: TXT }}>{item.title}</span>
            {item.status && (
              <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px', border: `1px solid ${color}55`, borderRadius: 2, color, textTransform: 'uppercase' }}>
                {item.status}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
            {item.location && <span style={{ fontSize: 8, color: MUT }}>{item.location}</span>}
            {item.subType  && <><span style={{ fontSize: 8, color: '#333' }}>·</span><span style={{ fontSize: 8, color: MUT }}>{item.subType}</span></>}
            {ago           && <><span style={{ fontSize: 8, color: '#333' }}>·</span><span style={{ fontSize: 8, color: '#7a7a7a' }}>{ago}</span></>}
          </div>
        </div>
        <span style={{ fontSize: 8, color: MUT, flexShrink: 0, marginTop: 2 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid #1a1a1a' }}>
          {item.message && (
            <div style={{ marginTop: 10, fontSize: 9, color: '#5a5a5a', fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1.6 }}>
              {item.message}
            </div>
          )}
          {item.geometry?.coordinates && (
            <a
              href={`https://www.google.com/maps?q=${item.geometry.coordinates[1]},${item.geometry.coordinates[0]}`}
              target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#5a7a9a', border: '1px solid #1e2e3e', borderRadius: 2, padding: '4px 8px', textDecoration: 'none', background: '#0a1520' }}
            >
              📍 Open in Google Maps
            </a>
          )}
        </div>
      )}
    </div>
  );
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'VIC', label: '🔥 VIC' },
  { id: 'CFS', label: 'CFS' },
  { id: 'MFS', label: 'MFS' },
  { id: 'SES', label: 'SES' },
  { id: 'SAAS', label: 'SAAS' },
  { id: 'MEDSTAR', label: 'MedStar' },
];

export default function PagerTab() {
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState('');
  const [filter,    setFilter]    = useState('all');
  const [lastFetch, setLastFetch] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const since = new Date(Date.now() - WINDOW_MS).toISOString();

      const [pagerRes, emergencyRes] = await Promise.allSettled([
        supabase
          .from('pager_messages')
          .select('*')
          .gte('received_at', since)
          .order('received_at', { ascending: false })
          .limit(200),
        fetch(EMERGENCY_URL).then(r => r.json()),
      ]);

      const pagerMsgs = pagerRes.status === 'fulfilled'
        ? (pagerRes.value.data || []).map(normalisePagerMsg)
        : [];

      const emergencyItems = emergencyRes.status === 'fulfilled'
        ? (emergencyRes.value?.features || [])
            .filter(f => f.properties?.feedType === 'incident' || f.properties?.category1)
            .map(normaliseEmergency)
            .filter(i => {
              const t = new Date(i.time);
              return !isNaN(t) && (Date.now() - t) <= WINDOW_MS;
            })
        : [];

      const merged = [...pagerMsgs, ...emergencyItems]
        .sort((a, b) => new Date(b.time) - new Date(a.time));

      setItems(merged);
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
    fetchAll();
    const poll = setInterval(fetchAll, REFRESH_MS);
    return () => clearInterval(poll);
  }, [fetchAll]);

  useEffect(() => {
    timerRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timerRef.current);
  }, [lastFetch]);

  const visible = filter === 'all' ? items : items.filter(i => i.agency === filter);
  const counts  = {};
  items.forEach(i => { counts[i.agency] = (counts[i.agency] || 0) + 1; });

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>📟 Pager</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            {loading ? 'Loading…' : err ? <span style={{ color: RED }}>{err}</span> : `${items.length} incident${items.length !== 1 ? 's' : ''} · last 2 hours`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastFetch && <span style={{ fontSize: 8, color: '#444', fontFamily: "'IBM Plex Mono',monospace" }}>refresh in {countdown}s</span>}
          <button onClick={fetchAll} style={{ fontSize: 8, fontWeight: 700, padding: '3px 9px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em', border: '1px solid #2a2a2a', color: MUT, background: '#0d0d0d' }}>↺ Refresh</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const cnt = f.id === 'all' ? items.length : (counts[f.id] || 0);
          const active = filter === f.id;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{ fontSize: 8, fontWeight: 700, padding: '3px 9px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em', border: `1px solid ${active ? ACC + '88' : '#2a2a2a'}`, color: active ? ACC : MUT, background: active ? ACC + '11' : '#0d0d0d' }}>
              {f.label}{cnt > 0 ? ` (${cnt})` : ''}
            </button>
          );
        })}
      </div>
      {loading && <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0' }}>Loading…</div>}
      {!loading && err && <div style={{ padding: '16px', background: '#1a0a0a', border: '1px solid #3a1a1a', borderRadius: 3, marginBottom: 12 }}><div style={{ fontSize: 10, color: RED, fontWeight: 700 }}>Could not load pager feed: {err}</div></div>}
      {!loading && !err && visible.length === 0 && <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '24px 0' }}>No incidents in the last 2 hours.</div>}
      {!loading && !err && visible.map((item, i) => <PagerCard key={item.id || i} item={item} />)}
    </div>
  );
}
