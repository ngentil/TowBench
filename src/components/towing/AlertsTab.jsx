import React, { useState, useCallback } from 'react';
import { ACC, MUT, TXT, RED, SURF, BRD } from '../../lib/styles';
import { timeAgo } from '../../lib/utils';

const WAZE_URL = '/.netlify/functions/waze-alerts';
const MONO     = "'IBM Plex Mono', monospace";

const TYPE_COLOR = {
  ACCIDENT:      '#af3a3a',
  JAM:           '#af7a2a',
  HAZARD:        '#9a8a20',
  ROAD_CLOSED:   '#3a5aaf',
  WEATHERHAZARD: '#2a8aaf',
};

const TYPE_EMOJI = {
  ACCIDENT:      '💥',
  JAM:           '🚗',
  HAZARD:        '⚠️',
  ROAD_CLOSED:   '🚧',
  WEATHERHAZARD: '🌧️',
};

const FILTERS = [
  { id: 'all',         label: 'All' },
  { id: 'ACCIDENT',    label: '💥 Accident' },
  { id: 'HAZARD',      label: '⚠️ Hazard' },
  { id: 'JAM',         label: '🚗 Jam' },
  { id: 'ROAD_CLOSED', label: '🚧 Road Closed' },
];

function wazeTitle(alert) {
  return (alert.subtype || alert.type || 'HAZARD')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function WazeCard({ alert }) {
  const [open, setOpen] = useState(false);
  const color  = TYPE_COLOR[alert.type] || '#555';
  const emoji  = TYPE_EMOJI[alert.type] || '⚠️';
  const ago    = timeAgo(alert.pubMillis);
  const suburb = alert.city ? alert.city.split(',')[0].trim() : '';
  const loc    = alert.location || {};

  return (
    <div style={{ background: '#0d0d0d', border: '1px solid #252525', borderLeft: `3px solid ${color}`, borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: TXT }}>{wazeTitle(alert)}</span>
          </div>
          {/* Subtitle: street · suburb */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
            {alert.street && <span style={{ fontSize: 8, color: MUT }}>{alert.street}</span>}
            {suburb && alert.street && <span style={{ fontSize: 8, color: '#333' }}>·</span>}
            {suburb && <span style={{ fontSize: 8, color: MUT }}>{suburb}</span>}
          </div>
          {/* Collapsed mini-tags */}
          {!open && (
            <div style={{ marginTop: 3, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              {ago && (
                <span style={{ fontSize: 7, color: MUT, border: '1px solid #2a2a2a', borderRadius: 2, padding: '1px 4px', fontFamily: MONO }}>
                  ⏱ {ago}
                </span>
              )}
              {alert.reportedBy && (
                <span style={{ fontSize: 7, color: MUT, border: '1px solid #2a2a2a', borderRadius: 2, padding: '1px 4px' }}>
                  {alert.reportedBy}
                </span>
              )}
            </div>
          )}
        </div>
        <span style={{ fontSize: 13, color: MUT, flexShrink: 0, paddingLeft: 4 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ borderTop: '1px solid #1a1a1a', padding: '0 12px 12px' }}>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              ['Type',        wazeTitle(alert)],
              ...(alert.reportedBy ? [['Reported By', alert.reportedBy]] : []),
              ...(suburb           ? [['Suburb',      suburb]]           : []),
              ...(alert.pubMillis  ? [['Time',        new Date(alert.pubMillis).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })]] : []),
            ].map(([label, val]) => (
              <div key={label} style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '5px 8px' }}>
                <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 1 }}>{label}</div>
                <div style={{ fontSize: 10, color: TXT, fontFamily: MONO }}>{val}</div>
              </div>
            ))}
          </div>
          {loc.x && loc.y && (
            <a href={`https://www.google.com/maps?q=${loc.y},${loc.x}`} target="_blank" rel="noopener noreferrer"
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

export default function AlertsTab() {
  const [alerts,   setAlerts]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState('');
  const [filter,   setFilter]   = useState('all');
  const [budget,   setBudget]   = useState({ count: null, max: 50, exhausted: false });
  const [lastFetch, setLastFetch] = useState(null);

  const fetchAlerts = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(WAZE_URL);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAlerts((data.alerts || []).sort((a, b) => (b.pubMillis || 0) - (a.pubMillis || 0)));
      if (data.budgetMax != null) {
        setBudget({
          count: data.budgetCount ?? null,
          max: data.budgetMax,
          exhausted: data.budgetExhausted ?? false,
        });
      }
      setLastFetch(new Date());
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const visible = filter === 'all' ? alerts : alerts.filter(a => a.type === filter);
  const counts  = {};
  alerts.forEach(a => { counts[a.type] = (counts[a.type] || 0) + 1; });

  const budgetKnown    = budget.count != null;
  const budgetLeft     = budgetKnown ? budget.max - budget.count : null;
  const budgetLow      = budgetLeft != null && budgetLeft <= 5;
  const canRefresh     = !loading && !budget.exhausted;

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>🚗 Waze</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            {loading ? 'Loading…' : err
              ? <span style={{ color: RED }}>{err}</span>
              : lastFetch
                ? `${alerts.length} alert${alerts.length !== 1 ? 's' : ''} · Melbourne metro`
                : 'Tap refresh to load alerts'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {/* Budget indicator */}
          {budgetKnown && (
            <div style={{ fontSize: 8, fontFamily: MONO, color: budgetLow ? '#cc4444' : '#444' }}>
              {budgetLeft} / {budget.max} req remaining this month
            </div>
          )}
          {budget.exhausted && (
            <div style={{ fontSize: 8, color: '#cc4444', maxWidth: 200, textAlign: 'right' }}>
              Monthly budget exhausted — showing cached data
            </div>
          )}
          <button
            onClick={fetchAlerts}
            disabled={!canRefresh}
            style={{
              fontSize: 8, fontWeight: 700, padding: '7px 12px', minHeight: 36,
              borderRadius: 2, cursor: canRefresh ? 'pointer' : 'not-allowed',
              fontFamily: MONO, letterSpacing: '0.06em',
              border: `1px solid ${canRefresh ? '#2a2a2a' : '#1a1a1a'}`,
              color: canRefresh ? MUT : '#333',
              background: '#0d0d0d',
            }}>
            {loading ? '…' : '↺ Refresh'}
          </button>
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const cnt    = f.id === 'all' ? alerts.length : (counts[f.id] || 0);
          const active = filter === f.id;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ fontSize: 8, fontWeight: 700, padding: '7px 12px', minHeight: 36, borderRadius: 2, cursor: 'pointer', fontFamily: MONO, letterSpacing: '0.06em', border: `1px solid ${active ? ACC + '88' : '#2a2a2a'}`, color: active ? ACC : MUT, background: active ? ACC + '11' : '#0d0d0d' }}>
              {f.label}{cnt > 0 ? ` (${cnt})` : ''}
            </button>
          );
        })}
      </div>

      {/* Empty / error states */}
      {!loading && !lastFetch && !err && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0' }}>
          Press refresh to fetch Waze alerts.
        </div>
      )}
      {loading && <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0' }}>Loading…</div>}
      {!loading && err && (
        <div style={{ padding: '16px', background: '#1a0a0a', border: '1px solid #3a1a1a', borderRadius: 3, marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: RED, fontWeight: 700 }}>Could not load alerts: {err}</div>
        </div>
      )}
      {!loading && lastFetch && !err && visible.length === 0 && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '24px 0' }}>
          No {filter === 'all' ? '' : filter.replace(/_/g, ' ').toLowerCase() + ' '}alerts right now.
        </div>
      )}
      {!loading && visible.map((alert, i) => <WazeCard key={alert.uuid || i} alert={alert} />)}
    </div>
  );
}
