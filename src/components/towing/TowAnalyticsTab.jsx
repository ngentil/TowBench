import React, { useState, useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { ACC, MUT, BRD, TXT, GRN, SURF } from '../../lib/styles';

const ORANGE = '#e8870a';
const PERIODS = [
  { label: '24h', ms: 864e5   },
  { label: '7d',  ms: 6048e5  },
  { label: '31d', ms: Infinity },
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function tally(arr, keyFn) {
  const map = {};
  arr.forEach(item => {
    const k = keyFn(item) || 'Unknown';
    map[k] = (map[k] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function fmtDuration(mins) {
  if (mins == null) return '—';
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = TXT }) {
  return (
    <div style={{ background: SURF, border: '1px solid ' + BRD, borderTop: `2px solid ${color}`, borderRadius: 2, padding: '10px 12px', flex: 1, minWidth: 90 }}>
      <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 8, color: MUT, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BarList({ data, color = ORANGE, maxBars = 10, labelWidth = 110 }) {
  const max = Math.max(...data.map(([, v]) => v), 1);
  if (!data.length) return <div style={{ fontSize: 9, color: MUT, padding: '12px 0' }}>No data yet</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {data.slice(0, maxBars).map(([label, val]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: labelWidth, fontSize: 8, color: MUT, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }} title={label}>{label}</div>
          <div style={{ flex: 1, background: '#1a1a1a', borderRadius: 1, height: 13, overflow: 'hidden' }}>
            <div style={{ width: `${(val / max) * 100}%`, height: '100%', background: color, borderRadius: 1, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ width: 26, fontSize: 8, color: TXT, fontFamily: "'IBM Plex Mono',monospace", flexShrink: 0 }}>{val}</div>
        </div>
      ))}
    </div>
  );
}

function HourChart({ counts }) {
  const max = Math.max(...counts, 1);
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 70, padding: '0 2px' }}>
      {counts.map((v, h) => (
        <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            title={`${String(h).padStart(2, '0')}:00 — ${v} job${v !== 1 ? 's' : ''}`}
            style={{ width: '100%', background: v > 0 ? ORANGE : '#1c1c1c', borderRadius: '1px 1px 0 0', height: `${Math.max((v / max) * 58, v > 0 ? 3 : 0)}px`, transition: 'height 0.5s ease', cursor: 'default' }}
          />
          {h % 6 === 0 && <span style={{ fontSize: 6, color: '#444', fontFamily: "'IBM Plex Mono',monospace", marginTop: 2 }}>{String(h).padStart(2, '0')}</span>}
        </div>
      ))}
    </div>
  );
}

function DowChart({ counts }) {
  const max = Math.max(...counts, 1);
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 70 }}>
      {counts.map((v, d) => (
        <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div
            title={`${DAYS[d]} — ${v} job${v !== 1 ? 's' : ''}`}
            style={{ width: '100%', background: v > 0 ? ACC : '#1c1c1c', borderRadius: '1px 1px 0 0', height: `${Math.max((v / max) * 58, v > 0 ? 3 : 0)}px`, transition: 'height 0.5s ease', cursor: 'default' }}
          />
          <span style={{ fontSize: 7, color: MUT }}>{DAYS[d]}</span>
        </div>
      ))}
    </div>
  );
}

// ── Map ───────────────────────────────────────────────────────────────────────

function HeatMap({ points }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    import('leaflet').then(mod => {
      const L = mod.default || mod;

      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

      const map = L.map(containerRef.current, {
        center: [-37.814, 144.963],
        zoom: 11,
        zoomControl: true,
        attributionControl: false,
      });

      const tilePane = map.getPanes().tilePane;
      tilePane.style.filter = 'invert(100%) hue-rotate(180deg) brightness(90%) contrast(90%) saturate(60%)';

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        subdomains: 'abc',
        maxZoom: 19,
      }).addTo(map);

      L.control.attribution({ prefix: false })
        .addAttribution('© <a href="https://openstreetmap.org" style="color:#666">OpenStreetMap</a>')
        .addTo(map);

      points.forEach(([lat, lng]) => {
        L.circleMarker([lat, lng], { radius: 28, fillColor: ORANGE, fillOpacity: 0.07, stroke: false }).addTo(map);
        L.circleMarker([lat, lng], { radius: 10, fillColor: ORANGE, fillOpacity: 0.22, stroke: false }).addTo(map);
        L.circleMarker([lat, lng], { radius: 4,  fillColor: '#ffcc66', fillOpacity: 0.6,  stroke: false }).addTo(map);
      });

      if (points.length > 0) {
        const lats = points.map(p => p[0]);
        const lngs = points.map(p => p[1]);
        map.fitBounds([
          [Math.min(...lats) - 0.04, Math.min(...lngs) - 0.06],
          [Math.max(...lats) + 0.04, Math.max(...lngs) + 0.06],
        ], { maxZoom: 13 });
      }

      mapRef.current = map;
    });

    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [points]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 2 }} />
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function TowAnalyticsTab({ allFeatures, liveIds, loading }) {
  const [periodMs, setPeriodMs] = useState(Infinity);

  // ── Client-side period filter ────────────────────────────────────────────────
  const since    = Date.now() - periodMs;
  const features = allFeatures.filter(f => {
    if (periodMs === Infinity) return true;
    const t = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated || 0).getTime();
    return t >= since;
  });

  // ── Active / Cleared split ───────────────────────────────────────────────────
  const activeCount  = features.filter(f =>  liveIds.has(String(f.properties?.eventId))).length;
  const clearedCount = features.length - activeCount;

  // ── Time-of-day / day-of-week ────────────────────────────────────────────────
  const hourCounts = Array(24).fill(0);
  const dowCounts  = Array(7).fill(0);
  features.forEach(f => {
    const d = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated);
    if (!isNaN(d)) { hourCounts[d.getHours()]++; dowCounts[d.getDay()]++; }
  });

  const peakHourIdx = hourCounts.indexOf(Math.max(...hourCounts));
  const peakHour    = hourCounts[peakHourIdx] > 0
    ? `${String(peakHourIdx).padStart(2, '0')}:00–${String(peakHourIdx + 1).padStart(2, '0')}:00`
    : '—';

  // ── Tallies ──────────────────────────────────────────────────────────────────
  const topSuburbs = tally(features, f => f.properties?.reference?.startIntersectionLocality);
  const topRoads   = tally(features, f => f.properties?.closedRoadName);
  const incTypes   = tally(features, f => f.properties?.eventSubType);
  const impTypes   = tally(features, f => f.properties?.impact?.impactType);

  // ── Duration (firstSeen → clearedAt or lastSeen) ─────────────────────────────
  const durations = features
    .filter(f => f._logMeta?.firstSeen)
    .map(f => {
      const start = new Date(f._logMeta.firstSeen);
      const end   = new Date(f._logMeta.clearedAt || f._logMeta.lastSeen);
      return (end - start) / 60000;
    })
    .filter(m => m > 0 && m < 60 * 24);
  const avgDuration = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : null;

  // ── Lanes impacted ───────────────────────────────────────────────────────────
  const laneValues = features.map(f => f.properties?.numberLanesImpacted).filter(n => n != null && n > 0);
  const avgLanes   = laneValues.length
    ? (laneValues.reduce((a, b) => a + b, 0) / laneValues.length).toFixed(1)
    : '—';

  // ── Summary ──────────────────────────────────────────────────────────────────
  const days      = periodMs === Infinity ? 31 : Math.round(periodMs / 864e5);
  const avgPerDay = features.length ? (features.length / days).toFixed(1) : '0';
  const topSuburb = topSuburbs[0]?.[0] || '—';
  const mapPoints = features
    .filter(f => f.geometry?.coordinates)
    .map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);

  const periodLabel = PERIODS.find(p => p.ms === periodMs)?.label || '31d';

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>📊 Tow Analytics</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            {loading && allFeatures.length === 0
              ? 'Loading…'
              : `${features.length} allocation${features.length !== 1 ? 's' : ''} · ${periodMs === Infinity ? 'last 31 days' : `last ${periodLabel}`}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {PERIODS.map(p => (
            <button key={p.label} onClick={() => setPeriodMs(p.ms)}
              style={{ fontSize: 8, fontWeight: 700, padding: '3px 9px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em', border: `1px solid ${p.ms === periodMs ? ACC + '88' : '#2a2a2a'}`, color: p.ms === periodMs ? ACC : MUT, background: p.ms === periodMs ? ACC + '11' : '#0d0d0d' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <KpiCard label="Total"        value={features.length}           color={TXT}    />
        <KpiCard label="Active"       value={activeCount}               color={GRN}    />
        <KpiCard label="Cleared"      value={clearedCount}              color={MUT}    />
        <KpiCard label="Avg / Day"    value={avgPerDay}                 color={ACC}    />
        <KpiCard label="Peak Hour"    value={peakHour}                  color={ORANGE} sub={hourCounts[peakHourIdx] > 0 ? `${hourCounts[peakHourIdx]} jobs` : undefined} />
        <KpiCard label="Top Suburb"   value={topSuburb}                 color={GRN}    sub={topSuburbs[0] ? `${topSuburbs[0][1]} jobs` : undefined} />
        <KpiCard label="Avg Duration" value={fmtDuration(avgDuration)}  color={MUT}    sub={durations.length ? `from ${durations.length} jobs` : 'insufficient data'} />
        <KpiCard label="Avg Lanes"    value={avgLanes}                  color={ORANGE} sub={laneValues.length ? `${laneValues.length} jobs` : undefined} />
      </div>

      {/* Map + side stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 12, marginBottom: 14 }}>

        {/* Heat map */}
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, overflow: 'hidden', minHeight: 340 }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid ' + BRD, fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
            Incident Heat Map · {mapPoints.length} plotted
          </div>
          <div style={{ height: 300, position: 'relative' }}>
            {loading && allFeatures.length === 0
              ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 9, color: MUT }}>Loading…</div>
              : mapPoints.length === 0
                ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 9, color: MUT }}>No coordinate data yet</div>
                : <HeatMap points={mapPoints} />
            }
          </div>
        </div>

        {/* Side stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px', flex: 1 }}>
            <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Incident Type</div>
            <BarList data={incTypes} color={ORANGE} maxBars={6} labelWidth={130} />
          </div>
          <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px', flex: 1 }}>
            <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Impact Type</div>
            <BarList data={impTypes} color='#5a7a9a' maxBars={5} labelWidth={130} />
          </div>
        </div>
      </div>

      {/* Peak hours + day of week */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Jobs by Hour of Day</div>
          <HourChart counts={hourCounts} />
        </div>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Jobs by Day of Week</div>
          <DowChart counts={dowCounts} />
        </div>
      </div>

      {/* Top suburbs + top roads */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Hot Suburbs</div>
          <BarList data={topSuburbs} color={GRN} maxBars={10} labelWidth={110} />
        </div>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Hot Roads</div>
          <BarList data={topRoads} color={ORANGE} maxBars={10} labelWidth={110} />
        </div>
      </div>

    </div>
  );
}
