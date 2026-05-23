import React, { useState, useEffect, useCallback, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { ACC, MUT, BRD, TXT, GRN, SURF } from '../../lib/styles';
import { logAllocations, markAllocationsCleared, getRecentAllocations } from '../../lib/db/towing';

const API_URL = 'https://api.opendata.transport.vic.gov.au/api/opendata/roads/disruptions/unplanned/v3';
const API_KEY = import.meta.env.VITE_VICROADS_KEY || 'bb7fc352-3ce6-44d2-9628-63fefb64278d';
const POLL_MS = 60_000;
const ORANGE  = '#e8870a';

const suburb = f => f.properties?.reference?.startIntersectionLocality || '';

const SORT_OPTIONS = [
  { key: 'recent',  label: 'Most Recent',     fn: (a, b) => new Date(b.properties?.lastUpdated || 0) - new Date(a.properties?.lastUpdated || 0) },
  { key: 'oldest',  label: 'Oldest First',    fn: (a, b) => new Date(a.properties?.lastUpdated || 0) - new Date(b.properties?.lastUpdated || 0) },
  { key: 'road',    label: 'Road Name (A–Z)', fn: (a, b) => (a.properties?.closedRoadName || '').localeCompare(b.properties?.closedRoadName || '') },
  { key: 'suburb',  label: 'Suburb (A–Z)',    fn: (a, b) => suburb(a).localeCompare(suburb(b)) },
  { key: 'lanes',   label: 'Lanes Impacted',  fn: (a, b) => (b.properties?.numberLanesImpacted || 0) - (a.properties?.numberLanesImpacted || 0) },
  { key: 'eventId', label: 'Event ID',        fn: (a, b) => Number(a.properties?.eventId || 0) - Number(b.properties?.eventId || 0) },
];

const EXPORT_PERIODS = [
  { label: 'Last 15 min',  hours: 0.25 },
  { label: 'Last 30 min',  hours: 0.5  },
  { label: 'Last 1 hour',  hours: 1    },
  { label: 'Last 2 hours', hours: 2    },
  { label: 'Last 4 hours', hours: 4    },
  { label: 'Last 8 hours', hours: 8    },
  { label: 'Last 12 hours',hours: 12   },
  { label: 'Last 24 hours',hours: 24   },
  { label: 'Last 2 days',  hours: 48   },
  { label: 'Last 7 days',  hours: 168  },
  { label: 'Last 14 days', hours: 336  },
  { label: 'Last 31 days', hours: 744  },
];

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function fmtShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function timeIn(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return null;
  const m = Math.floor(diff / 60000);
  if (m < 60)  return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24)  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

const NEARBY_KM = 10;

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function StatusBadge({ live }) {
  const color = live ? GRN : '#555';
  return (
    <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px', border: `1px solid ${color}55`, borderRadius: 2, color, background: color + '15', textTransform: 'uppercase' }}>
      {live ? 'Active' : 'Cleared'}
    </span>
  );
}

function AllocationCard({ feature, fromLog, userPos }) {
  const [open, setOpen] = useState(false);
  const p          = feature.properties || {};
  const road       = p.closedRoadName || '—';
  const sub        = suburb(feature);
  const crossSt    = p.reference?.startIntersectionRoadName || '';
  const eventId    = p.eventId || '—';
  const desc       = p.description || '';
  const lanes      = p.numberLanesImpacted;
  const impact     = p.impact?.impactType || '';
  const subType    = p.eventSubType || '';
  const eventType  = p.eventType || '';
  const melway     = p.melway || '';
  const created    = p.lastUpdated;
  const coords     = feature.geometry?.coordinates; // [lng, lat]
  const logMeta    = feature._logMeta;
  const elapsed    = timeIn(logMeta?.firstSeen || p.lastUpdated);
  const isLive     = !fromLog;

  const distKm = (userPos && coords)
    ? haversineKm(userPos.lat, userPos.lng, coords[1], coords[0])
    : null;
  const isNearby = distKm !== null && distKm <= NEARBY_KM && isLive;

  const mapsUrl = coords
    ? `https://www.google.com/maps?q=${coords[1]},${coords[0]}`
    : null;

  const borderLeft = isNearby ? '3px solid #cc2222' : `3px solid ${isLive ? GRN : '#333'}`;
  const border     = isNearby ? '1px solid #cc2222' : '1px solid #252525';

  return (
    <div className={isNearby ? 'nearby-pulse' : ''}
      style={{ background: '#0d0d0d', border, borderLeft, borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>🚛</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: TXT }}>{road}</span>
            <StatusBadge live={isLive} />
            {subType && (
              <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', padding: '1px 5px', border: '1px solid #3a3a2a', borderRadius: 2, color: '#c8a84b', background: '#c8a84b11', textTransform: 'uppercase' }}>
                {subType}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
            {sub && <span style={{ fontSize: 8, color: MUT }}>{sub}</span>}
            {crossSt && <><span style={{ fontSize: 8, color: '#333' }}>@</span><span style={{ fontSize: 8, color: MUT }}>{crossSt}</span></>}
            {(sub || crossSt) && <span style={{ fontSize: 8, color: '#333' }}>·</span>}
            <span style={{ fontSize: 8, color: ACC, fontFamily: "'IBM Plex Mono',monospace" }}>#{eventId}</span>
          </div>
          {!open && (
            <div style={{ marginTop: 3, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              {isNearby && (
                <span style={{ fontSize: 7, fontWeight: 700, color: '#cc2222', border: '1px solid #cc222255', borderRadius: 2, padding: '1px 4px', fontFamily: "'IBM Plex Mono',monospace" }}>
                  📍 {distKm.toFixed(1)}km away
                </span>
              )}
              {elapsed && (
                <span style={{ fontSize: 7, color: ORANGE, border: `1px solid ${ORANGE}44`, borderRadius: 2, padding: '1px 4px', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>
                  ⏱ {elapsed}
                </span>
              )}
              {lanes != null && (
                <span style={{ fontSize: 7, color: MUT, border: '1px solid #2a2a2a', borderRadius: 2, padding: '1px 4px' }}>
                  {lanes} lane{lanes !== 1 ? 's' : ''} impacted
                </span>
              )}
              {impact && <span style={{ fontSize: 7, color: MUT, border: '1px solid #252525', borderRadius: 2, padding: '1px 4px' }}>{impact}</span>}
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <button disabled title="Coming in Phase 2"
            style={{ background: '#111', border: '1px dashed #333', borderRadius: 2, color: '#444', fontSize: 8, padding: '3px 7px', cursor: 'not-allowed', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
            🚛 Assign Truck
          </button>
          <span style={{ fontSize: 8, color: MUT }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid #1a1a1a' }}>
          {desc && (
            <div style={{ marginTop: 10, fontSize: 10, color: MUT, lineHeight: 1.6, background: '#0a0a0a', padding: '6px 8px', borderRadius: 2, border: '1px solid #1a1a1a' }}>
              {desc}
            </div>
          )}
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['AAC Job ID',     `#${eventId}`],
              ['Status',         isLive ? 'Active' : 'Cleared'],
              ['Event Type',     eventType || '—'],
              ['Incident Type',  subType   || '—'],
              ['Lanes Impacted', lanes != null ? `${lanes} lane${lanes !== 1 ? 's' : ''}` : '—'],
              ['Impact Type',    impact    || '—'],
              ['Cross Street',   crossSt   || '—'],
              ['Melway',         melway    || '—'],
              ['Time In',        elapsed   || '—'],
              ['Last Updated',   fmt(created)],
              ...(logMeta ? [
                ['First Seen', fmt(logMeta.firstSeen)],
                ['Last Seen',  fmt(logMeta.lastSeen)],
                ...(logMeta.clearedAt ? [['Cleared', fmt(logMeta.clearedAt)]] : []),
              ] : []),
              ...(coords ? [['Coordinates', `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`]] : []),
            ].map(([label, val]) => (
              <div key={label} style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '6px 8px' }}>
                <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 10, color: TXT, fontFamily: "'IBM Plex Mono',monospace", wordBreak: 'break-all' }}>{val}</div>
              </div>
            ))}
          </div>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#5a7a9a', border: '1px solid #1e2e3e', borderRadius: 2, padding: '4px 8px', textDecoration: 'none', background: '#0a1520' }}>
              📍 Open in Google Maps
            </a>
          )}
          <div style={{ marginTop: 10, padding: '8px 10px', border: '1px dashed #2a2a2a', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>🚛</span>
            <div>
              <div style={{ fontSize: 8, color: '#444', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Assign Truck</div>
              <div style={{ fontSize: 8, color: '#333', marginTop: 1 }}>Fleet assignment coming in Phase 2</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────────────────────────────
export default function TowAllocationsTab() {
  const [allFeatures,  setAllFeatures]  = useState([]);
  const [liveIds,      setLiveIds]      = useState(new Set());
  const [loading,      setLoading]      = useState(true);
  const [err,          setErr]          = useState('');
  const [lastFetch,    setLastFetch]    = useState(null);
  const [countdown,    setCountdown]    = useState(POLL_MS / 1000);
  const [userPos,      setUserPos]      = useState(null);
  const prevLiveIdsRef = useRef(new Set());

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      p => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  const [sortBy,       setSortBy]       = useState('recent');
  const [showSort,     setShowSort]     = useState(false);
  const [showExport,   setShowExport]   = useState(false);
  const [exportHours,  setExportHours]  = useState(24);
  const [exporting,    setExporting]    = useState(false);
  const sortRef   = useRef(null);
  const exportRef = useRef(null);

  useEffect(() => {
    const handler = e => {
      if (sortRef.current   && !sortRef.current.contains(e.target))   setShowSort(false);
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const mergeFeatures = (live, logged) => {
    const map = new Map();
    logged.forEach(f => { if (f.properties?.eventId) map.set(String(f.properties.eventId), f); });
    live.forEach(f => {
      if (!f.properties?.eventId) return;
      const id = String(f.properties.eventId);
      const prev = map.get(id);
      // Preserve _logMeta (firstSeen/lastSeen) from the DB-loaded version so time-in stays accurate
      map.set(id, prev?._logMeta ? { ...f, _logMeta: prev._logMeta } : f);
    });
    return [...map.values()];
  };

  useEffect(() => {
    getRecentAllocations(744)
      .then(logged => {
        setAllFeatures(prev => mergeFeatures([], [...prev, ...logged]));
        setLoading(false);
      })
      .catch(e => { console.warn('getRecentAllocations:', e.message); setLoading(false); });
  }, []);

  const fetchAllocations = useCallback(async () => {
    try {
      const res  = await fetch(API_URL, { headers: { KeyID: API_KEY } });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      const all  = data.data?.features || data.features || [];
      const live = all.filter(f => f.properties?.source?.sourceName === 'TowAllocation');
      const newLiveIds = new Set(live.map(f => String(f.properties?.eventId)));
      const justCleared = [...prevLiveIdsRef.current].filter(id => !newLiveIds.has(id));
      if (justCleared.length) markAllocationsCleared(justCleared).catch(e => console.warn('markAllocationsCleared:', e));
      prevLiveIdsRef.current = newLiveIds;
      setLiveIds(newLiveIds);
      logAllocations(live).catch(e => console.warn('logAllocations:', e));
      setAllFeatures(prev => mergeFeatures(live, prev));
      setErr('');
      setLastFetch(new Date());
      setCountdown(POLL_MS / 1000);
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => {
    fetchAllocations();
    const poll = setInterval(fetchAllocations, POLL_MS);
    return () => clearInterval(poll);
  }, [fetchAllocations]);

  useEffect(() => {
    const t = setInterval(() => setCountdown(c => (c > 0 ? c - 1 : POLL_MS / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // ── PDF Export ───────────────────────────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const period   = EXPORT_PERIODS.find(p => p.hours === exportHours);
      const features = await getRecentAllocations(exportHours);
      features.sort((a, b) => new Date(b.properties?.lastUpdated || 0) - new Date(a.properties?.lastUpdated || 0));

      const doc   = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' });
      const W     = 210, ML = 12, CW = 186;
      const now   = new Date();
      const liveSet     = liveIds;
      const activeCount  = features.filter(f => liveSet.has(String(f.properties?.eventId))).length;
      const clearedCount = features.length - activeCount;

      const clip = (text, maxW) => {
        const lines = doc.splitTextToSize(String(text || '—'), maxW);
        return lines.length > 1 ? lines[0].replace(/.$/, '…') : lines[0];
      };

      doc.setFillColor(15, 15, 15);
      doc.rect(0, 0, W, 30, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text('TOW ALLOCATION REPORT', ML, 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 160);
      doc.text(`${period.label}  ·  ${features.length} allocation${features.length !== 1 ? 's' : ''}`, ML, 19);
      doc.text(
        `Generated: ${now.toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}`,
        ML, 25,
      );

      let y = 35;
      const bw = CW / 3 - 2;
      [
        ['TOTAL',   String(features.length),  [60,  60,  60]],
        ['ACTIVE',  String(activeCount),       [50,  160, 100]],
        ['CLEARED', String(clearedCount),      [100, 100, 100]],
      ].forEach(([lbl, val, rgb], i) => {
        const bx = ML + i * (bw + 3);
        doc.setFillColor(247, 247, 247);
        doc.rect(bx, y, bw, 14, 'F');
        doc.setDrawColor(220, 220, 220);
        doc.rect(bx, y, bw, 14, 'S');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(140, 140, 140);
        doc.text(lbl, bx + bw / 2, y + 5, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(...rgb);
        doc.text(val, bx + bw / 2, y + 11.5, { align: 'center' });
      });
      y += 18;

      const COLS = [
        { label: 'ROAD NAME',    w: 50 },
        { label: 'SUBURB',       w: 38 },
        { label: 'STATUS',       w: 18 },
        { label: 'EVENT ID',     w: 22 },
        { label: 'LANES',        w: 13 },
        { label: 'LAST UPDATED', w: 45 },
      ];
      let cx = ML;
      COLS.forEach(c => { c.x = cx; cx += c.w; });
      const ROW_H = 7;

      const drawHeader = (yy) => {
        doc.setFillColor(25, 25, 25);
        doc.rect(ML, yy, CW, ROW_H, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(180, 180, 180);
        COLS.forEach(c => doc.text(c.label, c.x + 2, yy + 4.5));
      };

      drawHeader(y);
      y += ROW_H;

      features.forEach((f, i) => {
        if (y + ROW_H > 283) {
          doc.addPage();
          y = 15;
          drawHeader(y);
          y += ROW_H;
        }

        const p      = f.properties || {};
        const isLive = liveSet.has(String(p.eventId));

        if (i % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(ML, y, CW, ROW_H, 'F'); }
        doc.setDrawColor(230, 230, 230);
        doc.line(ML, y + ROW_H, ML + CW, y + ROW_H);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(30, 30, 30);
        doc.text(clip(p.closedRoadName, COLS[0].w - 4), COLS[0].x + 2, y + 4.5);
        doc.text(clip(suburb(f),        COLS[1].w - 4), COLS[1].x + 2, y + 4.5);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(isLive ? [50, 160, 100] : [110, 110, 110]));
        doc.text(isLive ? 'Active' : 'Cleared', COLS[2].x + 2, y + 4.5);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 30, 30);
        doc.text(String(p.eventId || '—'),                       COLS[3].x + 2, y + 4.5);
        doc.text(p.numberLanesImpacted != null ? String(p.numberLanesImpacted) : '—', COLS[4].x + 2, y + 4.5);
        doc.text(fmtShort(p.lastUpdated),                        COLS[5].x + 2, y + 4.5);

        y += ROW_H;
      });

      const pages = doc.getNumberOfPages();
      for (let pg = 1; pg <= pages; pg++) {
        doc.setPage(pg);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(170, 170, 170);
        doc.text(`TowBench · Tow Allocation Report · Page ${pg} of ${pages}`, W / 2, 293, { align: 'center' });
      }

      const filename = `tow-allocations-${period.label.replace(/\s+/g, '-').toLowerCase()}-${now.toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
      setShowExport(false);
    } catch (e) {
      console.error('exportPDF failed:', e);
    } finally {
      setExporting(false);
    }
  }, [exportHours, liveIds]);

  // ── Render ─────────────────────────────────────────────────────────────────────────────────────
  const sortFn      = SORT_OPTIONS.find(o => o.key === sortBy)?.fn;
  const sorted      = [...allFeatures].sort(sortFn);
  const active      = sorted.filter(f =>  liveIds.has(String(f.properties?.eventId)));
  const cleared     = sorted.filter(f => !liveIds.has(String(f.properties?.eventId)));
  const currentSort = SORT_OPTIONS.find(o => o.key === sortBy);

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>🚛 Tow Allocations</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            VicRoads feed · last 31 days · {allFeatures.length} allocation{allFeatures.length !== 1 ? 's' : ''}
            {active.length > 0 && <span style={{ color: GRN, marginLeft: 8 }}>· {active.length} active · {cleared.length} cleared</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {lastFetch && (
            <span style={{ fontSize: 8, color: MUT }}>
              Live {lastFetch.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              {' · '}next in {countdown}s
            </span>
          )}

          <div ref={sortRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowSort(s => !s)}
              style={{ fontSize: 8, color: showSort ? ACC : MUT, border: `1px solid ${showSort ? ACC + '66' : '#2a2a2a'}`, background: showSort ? ACC + '11' : '#0d0d0d', padding: '3px 8px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
              ⇅ {currentSort?.label}
            </button>
            {showSort && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50, background: '#111', border: '1px solid #2a2a2a', borderRadius: 2, minWidth: 160, boxShadow: '0 4px 16px #000a' }}>
                {SORT_OPTIONS.map(opt => (
                  <div key={opt.key} onClick={() => { setSortBy(opt.key); setShowSort(false); }}
                    style={{ padding: '7px 12px', fontSize: 9, color: opt.key === sortBy ? ACC : TXT, background: opt.key === sortBy ? ACC + '11' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #1a1a1a', fontFamily: "'IBM Plex Mono',monospace" }}>
                    <span style={{ color: opt.key === sortBy ? ACC : '#333', width: 8 }}>{opt.key === sortBy ? '✓' : ''}</span>
                    {opt.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div ref={exportRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowExport(s => !s)}
              style={{ fontSize: 8, color: showExport ? ACC : MUT, border: `1px solid ${showExport ? ACC + '66' : '#2a2a2a'}`, background: showExport ? ACC + '11' : '#0d0d0d', padding: '3px 8px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>
              ⬇ Export PDF
            </button>
            {showExport && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50, background: '#111', border: '1px solid #2a2a2a', borderRadius: 2, minWidth: 180, boxShadow: '0 4px 16px #000a' }}>
                <div style={{ padding: '8px 12px 6px', fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid #1a1a1a' }}>
                  Select period
                </div>
                {EXPORT_PERIODS.map(p => (
                  <div key={p.hours} onClick={() => setExportHours(p.hours)}
                    style={{ padding: '6px 12px', fontSize: 9, color: p.hours === exportHours ? ACC : TXT, background: p.hours === exportHours ? ACC + '11' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #1a1a1a', fontFamily: "'IBM Plex Mono',monospace" }}>
                    <span style={{ color: p.hours === exportHours ? ACC : '#333', width: 8 }}>{p.hours === exportHours ? '✓' : ''}</span>
                    {p.label}
                  </div>
                ))}
                <div style={{ padding: '8px 12px' }}>
                  <button onClick={handleExport} disabled={exporting}
                    style={{ width: '100%', padding: '5px 0', fontSize: 9, fontWeight: 700, color: exporting ? MUT : '#000', background: exporting ? '#222' : ACC, border: 'none', borderRadius: 2, cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em' }}>
                    {exporting ? 'Generating…' : '⬇ Generate PDF'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <button onClick={fetchAllocations}
            style={{ fontSize: 8, color: ACC, border: `1px solid ${ACC}44`, background: ACC + '11', padding: '3px 8px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {allFeatures.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          {[
            ['31d Total', allFeatures.length, TXT],
            ['Active',    active.length,      GRN],
            ['Cleared',   cleared.length,     MUT],
          ].map(([l, v, c]) => (
            <div key={l} style={{ background: SURF, border: '1px solid ' + BRD, borderTop: `2px solid ${c}`, borderRadius: 2, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>{l}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: c, fontFamily: "'IBM Plex Mono',monospace" }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {err && (
        <div style={{ marginBottom: 12, fontSize: 9, padding: '8px 12px', borderRadius: 2, color: ORANGE, background: ORANGE + '11', border: `1px solid ${ORANGE}44`, lineHeight: 1.6 }}>
          ⚠ Live feed error: {err}
          <br />
          <span style={{ color: MUT }}>Showing logged history. Feed updates every 60 seconds.</span>
        </div>
      )}

      {loading && allFeatures.length === 0 && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0' }}>Loading…</div>
      )}

      {!loading && allFeatures.length === 0 && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0', lineHeight: 1.8 }}>
          No tow allocations in the last 31 days.<br />
          <span style={{ fontSize: 8 }}>Feed updates every 60 seconds.</span>
        </div>
      )}

      {active.length > 0 && (
        <>
          <div style={{ fontSize: 8, color: GRN, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6, borderLeft: `2px solid ${GRN}`, paddingLeft: 6 }}>
            Active ({active.length})
          </div>
          {active.map((f, i) => (
            <AllocationCard key={f.properties?.eventId || i} feature={f} fromLog={false} userPos={userPos} />
          ))}
          {cleared.length > 0 && <div style={{ marginTop: 12 }} />}
        </>
      )}

      {cleared.length > 0 && (
        <>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6, borderLeft: '2px solid #444', paddingLeft: 6 }}>
            Cleared ({cleared.length})
          </div>
          {cleared.map((f, i) => (
            <AllocationCard key={f.properties?.eventId || i} feature={f} fromLog={true} userPos={userPos} />
          ))}
        </>
      )}
    </div>
  );
}
