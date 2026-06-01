import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ACC, MUT, BRD, TXT, SURF } from '../../lib/styles';
import { haversineKm } from '../../lib/utils';
import { BRIDGE_URL } from '../../lib/constants';

const SORT_OPTIONS = [
  { key: 'distance', label: 'Nearest First' },
  { key: 'h_asc',   label: 'Clearance (Low → High)' },
  { key: 'h_desc',  label: 'Clearance (High → Low)' },
  { key: 'name',    label: 'Road Name (A–Z)' },
];

const CLR_FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'critical', label: '< 4.0m',   color: '#cc3333', test: h => h < 4.0 },
  { key: 'tight',    label: '4.0–4.6m', color: '#cc8822', test: h => h >= 4.0 && h < 4.6 },
  { key: 'clear',    label: '≥ 4.6m',   color: '#5a9aee', test: h => h >= 4.6 },
];

function hColor(h) {
  return h < 4.0 ? '#cc3333' : h < 4.6 ? '#cc8822' : '#5a9aee';
}

function hLabel(h) {
  return h < 4.0 ? 'Critical' : h < 4.6 ? 'Tight' : 'Clear';
}

function BridgeCard({ rec, dist }) {
  const [open, setOpen] = useState(false);
  const [lat, lng, height, label, btype] = Array.isArray(rec) ? rec : [];
  const h          = parseFloat(height);
  const color      = hColor(h);
  const isCrit     = h < 4.0;
  const border     = isCrit ? '1px solid #cc222255' : '1px solid #252525';
  const borderLeft = isCrit ? '3px solid #cc2222'   : `3px solid ${color}`;
  const btypeClean = (btype && btype !== 'NULL') ? btype : null;
  const mapsUrl    = `https://www.google.com/maps?q=${lat},${lng}`;
  const svUrl      = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;

  return (
    <div className={isCrit ? 'nearby-pulse' : ''}
      style={{ background: '#0d0d0d', border, borderLeft, borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>

      {/* Collapsed row */}
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>🌉</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: TXT,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label || 'Bridge'}
            </span>
            <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px',
              border: `1px solid ${color}55`, borderRadius: 2, color, background: color + '15',
              textTransform: 'uppercase', flexShrink: 0 }}>
              {hLabel(h)}
            </span>
          </div>
          {!open && (
            <div style={{ marginTop: 3, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              {dist != null && (
                <span style={{
                  fontSize: 7, fontWeight: isCrit ? 700 : 400,
                  color: isCrit ? '#cc2222' : MUT,
                  border: `1px solid ${isCrit ? '#cc222255' : '#2a2a2a'}`,
                  borderRadius: 2, padding: '1px 4px', fontFamily: "'IBM Plex Mono',monospace",
                }}>
                  📍 {dist.toFixed(1)}km away
                </span>
              )}
              {btypeClean && (
                <span style={{ fontSize: 7, color: MUT, border: '1px solid #252525', borderRadius: 2, padding: '1px 4px' }}>
                  {btypeClean}
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "'IBM Plex Mono',monospace" }}>
            {h.toFixed(1)}m
          </span>
          <span style={{ fontSize: 8, color: MUT }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['Clearance',    `${h.toFixed(1)} m`],
              ...(dist != null ? [['Distance', `${dist.toFixed(2)} km`]] : []),
              ['Bridge Type',  btypeClean || '—'],
              ['Coordinates',  `${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}`],
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '6px 8px' }}>
                <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
                  {lbl}
                </div>
                <div style={{ fontSize: 10, color: TXT, fontFamily: "'IBM Plex Mono',monospace", wordBreak: 'break-all' }}>
                  {val}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#5a7a9a',
                border: '1px solid #1e2e3e', borderRadius: 2, padding: '4px 8px', textDecoration: 'none', background: '#0a1520' }}>
              📍 Maps
            </a>
            <a href={svUrl} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#5a6a7a',
                border: '1px solid #1e2a3a', borderRadius: 2, padding: '4px 8px', textDecoration: 'none', background: '#0a1018' }}>
              🔭 Street View
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BridgesTab({ userPos }) {
  const [bridges,    setBridges]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy,     setSortBy]     = useState('distance');
  const [clrFilter,  setClrFilter]  = useState('all');
  const [showSort,   setShowSort]   = useState(false);
  const sortRef = useRef(null);

  useEffect(() => {
    if (!BRIDGE_URL) { setLoading(false); return; }
    fetch(BRIDGE_URL)
      .then(r => r.json())
      .then(data => { setBridges(data.r || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Default to clearance-asc when GPS not available
  useEffect(() => {
    if (!userPos && sortBy === 'distance') setSortBy('h_asc');
  }, [userPos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = e => { if (sortRef.current && !sortRef.current.contains(e.target)) setShowSort(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const withDist = useMemo(() => bridges.map(rec => ({
    rec,
    dist: userPos ? haversineKm(userPos.lat, userPos.lng, rec[0], rec[1]) : null,
  })), [bridges, userPos]);

  const filtered = useMemo(() => {
    const q      = searchTerm.trim().toLowerCase();
    const clrOpt = CLR_FILTERS.find(f => f.key === clrFilter);
    return withDist.filter(({ rec }) => {
      const [, , height, label, btype] = rec;
      if (clrOpt?.test && !clrOpt.test(parseFloat(height))) return false;
      if (q) {
        const hay = [label, btype].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [withDist, searchTerm, clrFilter]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'distance': return (a.dist ?? Infinity) - (b.dist ?? Infinity);
      case 'h_asc':    return parseFloat(a.rec[2]) - parseFloat(b.rec[2]);
      case 'h_desc':   return parseFloat(b.rec[2]) - parseFloat(a.rec[2]);
      case 'name':     return (a.rec[3] || '').localeCompare(b.rec[3] || '');
      default:         return 0;
    }
  }), [filtered, sortBy]);

  const critCount  = filtered.filter(({ rec }) => parseFloat(rec[2]) < 4.0).length;
  const tightCount = filtered.filter(({ rec }) => { const h = parseFloat(rec[2]); return h >= 4.0 && h < 4.6; }).length;
  const nearCount  = filtered.filter(({ dist }) => dist != null && dist <= 2).length;
  const currentSort = SORT_OPTIONS.find(o => o.key === sortBy);

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>🌉 Bridge Heights</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            VicRoads bridge register · {filtered.length} structure{filtered.length !== 1 ? 's' : ''}
            {critCount  > 0 && <span style={{ color: '#cc3333', marginLeft: 8 }}>· {critCount} critical</span>}
            {tightCount > 0 && <span style={{ color: '#cc8822', marginLeft: 8 }}>· {tightCount} tight</span>}
            {nearCount  > 0 && <span style={{ color: '#cc2222', marginLeft: 8 }}>· {nearCount} within 2km</span>}
          </div>
        </div>

        {/* Sort dropdown */}
        <div ref={sortRef} style={{ position: 'relative' }}>
          <button onClick={() => setShowSort(s => !s)}
            style={{ fontSize: 8, color: showSort ? ACC : MUT,
              border: `1px solid ${showSort ? ACC + '66' : '#2a2a2a'}`,
              background: showSort ? ACC + '11' : '#0d0d0d',
              padding: '3px 8px', borderRadius: 2, cursor: 'pointer',
              fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 4 }}>
            ⇅ {currentSort?.label}
          </button>
          {showSort && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50,
              background: '#111', border: '1px solid #2a2a2a', borderRadius: 2, minWidth: 190,
              boxShadow: '0 4px 16px #000a' }}>
              {SORT_OPTIONS.filter(o => o.key !== 'distance' || userPos).map(opt => (
                <button key={opt.key} onClick={() => { setSortBy(opt.key); setShowSort(false); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 9,
                    background: sortBy === opt.key ? ACC + '22' : 'none',
                    color: sortBy === opt.key ? ACC : MUT,
                    border: 'none', cursor: 'pointer',
                    fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.04em' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <input
        value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
        placeholder="Search by road name or bridge type…"
        style={{ width: '100%', background: '#0d0d0d', border: '1px solid #2a2a2a', color: TXT,
          fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, padding: '7px 10px',
          borderRadius: 2, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
      />

      {/* Clearance filter pills — identical pattern to status badges in TowAllocationsTab */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 14, flexWrap: 'wrap' }}>
        {CLR_FILTERS.map(f => {
          const fColor = f.color || ACC;
          const active = clrFilter === f.key;
          return (
            <button key={f.key} onClick={() => setClrFilter(f.key)}
              style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 8px',
                border: `1px solid ${active ? fColor + '88' : '#2a2a2a'}`,
                color: active ? fColor : '#444',
                background: active ? fColor + '11' : 'transparent',
                borderRadius: 2, cursor: 'pointer',
                fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase' }}>
              {f.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 48, fontSize: 9, color: MUT }}>Loading bridge data…</div>
      )}
      {!loading && sorted.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, fontSize: 9, color: MUT }}>
          {searchTerm || clrFilter !== 'all' ? 'No bridges match that filter.' : 'No bridge data available.'}
        </div>
      )}
      {sorted.map(({ rec, dist }, i) => (
        <BridgeCard key={i} rec={rec} dist={dist} />
      ))}
    </div>
  );
}
