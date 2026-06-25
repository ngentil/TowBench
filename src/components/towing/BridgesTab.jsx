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

const NEARBY_OPTS = [0, 5, 10, 15, 20, 30];

const TYPE_LABELS = {
  'ROAD BRIDGE':    'Road Bridge',
  'RAIL OVER ROAD': 'Rail Bridge',
  'TUNNEL':         'Tunnel',
  'LOW CLEARANCE':  'Low Clearance',
};

function BridgeCard({ rec, dist, nearbyKm }) {
  const [open, setOpen] = useState(false);
  const [lat, lng, height, label, btype, maxweight] = Array.isArray(rec) ? rec : [];
  const h          = parseFloat(height);
  const wt         = maxweight != null ? parseFloat(maxweight) : null;
  const isTight    = h < 4.6;
  const isCrit     = isTight && dist != null && nearbyKm > 0 && dist <= nearbyKm;
  const border     = isCrit ? '1px solid #cc222255' : '1px solid #252525';
  const borderLeft = isCrit ? '3px solid #cc2222' : isTight ? '3px solid #cc3333' : '3px solid #444';
  const typeLabel  = TYPE_LABELS[btype] || btype || null;
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
              border: `1px solid ${h < 4.0 ? '#cc333355' : h < 4.6 ? '#cc882255' : '#33333355'}`,
              borderRadius: 2,
              color:      h < 4.0 ? '#cc3333' : h < 4.6 ? '#cc8822' : '#666',
              background: h < 4.0 ? '#cc333315' : h < 4.6 ? '#cc882215' : '#33333315',
              textTransform: 'uppercase', flexShrink: 0 }}>
              {h.toFixed(1)}m
            </span>
            {wt != null && (
              <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px',
                border: '1px solid #4a6a2255', borderRadius: 2,
                color: '#7aaa33', background: '#4a6a2215',
                textTransform: 'uppercase', flexShrink: 0 }}>
                ⚖ {wt % 1 === 0 ? wt : wt.toFixed(1)}t
              </span>
            )}
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
              {typeLabel && (
                <span style={{ fontSize: 7, color: MUT, border: '1px solid #252525', borderRadius: 2, padding: '1px 4px' }}>
                  {typeLabel}
                </span>
              )}
            </div>
          )}
        </div>

        <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace",
            color: h < 4.0 ? '#cc3333' : h < 4.6 ? '#cc8822' : '#666' }}>
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
              ...(wt != null ? [['Weight limit', `${wt % 1 === 0 ? wt : wt.toFixed(1)} t`]] : []),
              ...(dist != null ? [['Distance', `${dist.toFixed(2)} km`]] : []),
              ['Type',         typeLabel || '—'],
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

export default function BridgesTab({ userPos, effectiveAlertH = 0, truckConfigured = false }) {
  const [bridges,    setBridges]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy,     setSortBy]     = useState('distance');
  const [showSort,   setShowSort]   = useState(false);
  const [nearbyKm,   setNearbyKm]   = useState(() => Number(localStorage.getItem('towbench_bridge_nearby_km') ?? 10));
  const [subTab,     setSubTab]     = useState('bridges'); // 'bridges' | 'service'
  const sortRef = useRef(null);

  const setRadius = km => { setNearbyKm(km); localStorage.setItem('towbench_bridge_nearby_km', km); };

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
    isService: String(rec[3] || '').trim().toUpperCase() === 'SERVICE',
  })), [bridges, userPos]);

  const serviceCount = useMemo(() => withDist.filter(e => e.isService).length, [withDist]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return withDist.filter(({ rec, isService }) => {
      if (subTab === 'service'  && !isService) return false;
      if (subTab === 'bridges'  &&  isService) return false;
      if (!q) return true;
      const [, , , label, btype] = rec;
      return [label, btype].join(' ').toLowerCase().includes(q);
    });
  }, [withDist, searchTerm, subTab]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'distance': return (a.dist ?? Infinity) - (b.dist ?? Infinity);
      case 'h_asc':    return parseFloat(a.rec[2]) - parseFloat(b.rec[2]);
      case 'h_desc':   return parseFloat(b.rec[2]) - parseFloat(a.rec[2]);
      case 'name':     return (a.rec[3] || '').localeCompare(b.rec[3] || '');
      default:         return 0;
    }
  }), [filtered, sortBy]);

  const critCount     = filtered.filter(({ rec }) => parseFloat(rec[2]) < 4.0).length;
  const tightCount    = filtered.filter(({ rec }) => { const h = parseFloat(rec[2]); return h >= 4.0 && h < 4.6; }).length;
  const critNearCount = nearbyKm > 0 ? filtered.filter(({ rec, dist }) => dist != null && dist <= nearbyKm && parseFloat(rec[2]) < 4.6).length : 0;
  const currentSort = SORT_OPTIONS.find(o => o.key === sortBy);

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>

      {/* Truck height reference */}
      {truckConfigured ? (
        <div style={{ fontSize: 8, color: MUT, marginBottom: 12, fontFamily: "'IBM Plex Mono',monospace" }}>
          🚛 Alerts active for bridges below <span style={{ color: ACC, fontWeight: 700 }}>{effectiveAlertH.toFixed(2)} m</span>
          <span style={{ color: '#444', marginLeft: 8 }}>· Edit in My Vehicles</span>
        </div>
      ) : (
        <div style={{ fontSize: 8, color: '#444', marginBottom: 12, fontFamily: "'IBM Plex Mono',monospace" }}>
          🚛 Set your truck heights in <span style={{ color: MUT }}>My Vehicles</span> to personalise bridge alerts
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>🌉 Bridge Heights</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            OpenStreetMap · {filtered.length} {subTab === 'service' ? 'service entr' : 'clearance restriction'}{filtered.length !== 1 ? (subTab === 'service' ? 'ies' : 's') : (subTab === 'service' ? 'y' : '')}
            {critCount  > 0 && <span style={{ color: '#cc3333', marginLeft: 8 }}>· {critCount} &lt;4m</span>}
            {tightCount > 0 && <span style={{ color: '#cc8822', marginLeft: 8 }}>· {tightCount} tight</span>}
            {critNearCount > 0 && <span style={{ color: '#cc2222', marginLeft: 8 }}>· {critNearCount} nearby</span>}
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

      {/* Sub-tab switcher */}
      <div style={{ display: 'flex', borderRadius: 2, overflow: 'hidden', border: '1px solid #2a2a2a', marginBottom: 10 }}>
        {[
          { id: 'bridges', label: `🌉 Bridges (${withDist.length - serviceCount})` },
          { id: 'service', label: `🏪 Service Entries (${serviceCount})` },
        ].map(st => (
          <button key={st.id} onClick={() => { setSubTab(st.id); setSearchTerm(''); }}
            style={{ flex: 1, padding: '7px 0', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace", cursor: 'pointer',
              border: 'none', background: subTab === st.id ? ACC + '22' : 'transparent',
              color: subTab === st.id ? ACC : MUT,
              borderBottom: subTab === st.id ? `2px solid ${ACC}` : '2px solid transparent' }}>
            {st.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
        placeholder="Search by road name or bridge type…"
        style={{ width: '100%', background: '#0d0d0d', border: '1px solid #2a2a2a', color: TXT,
          fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, padding: '7px 10px',
          borderRadius: 2, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
      />

      {/* Nearby pulse radius — identical to TowAllocationsTab */}
      {userPos && (
        <div style={{ marginBottom: 14, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 8, color: MUT, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>📍 Nearby pulse</span>
          {NEARBY_OPTS.map(km => (
            <button key={km} onClick={() => setRadius(km)}
              style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 7px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace",
                background: nearbyKm === km ? '#cc222222' : '#0d0d0d',
                border: `1px solid ${nearbyKm === km ? '#cc2222' : '#2a2a2a'}`,
                color: nearbyKm === km ? '#cc2222' : MUT }}>
              {km === 0 ? 'Off' : `${km}km`}
            </button>
          ))}
          <input
            type="number" min="1" max="999" placeholder="km"
            value={nearbyKm > 0 && !NEARBY_OPTS.includes(nearbyKm) ? nearbyKm : ''}
            onChange={e => { const v = Number(e.target.value); if (v > 0) setRadius(v); }}
            style={{ width: 44, background: '#0a0a0a',
              border: `1px solid ${nearbyKm > 0 && !NEARBY_OPTS.includes(nearbyKm) ? '#cc2222' : '#2a2a2a'}`,
              color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, padding: '3px 5px',
              borderRadius: 2, outline: 'none', textAlign: 'center' }}
          />
        </div>
      )}

      {/* List */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 48, fontSize: 9, color: MUT }}>Loading bridge data…</div>
      )}
      {!loading && sorted.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, fontSize: 9, color: MUT }}>
          {searchTerm ? 'No bridges match that search.' : 'No bridge data available.'}
        </div>
      )}
      {sorted.map(({ rec, dist }, i) => (
        <BridgeCard key={i} rec={rec} dist={dist} nearbyKm={nearbyKm} />
      ))}
    </div>
  );
}
