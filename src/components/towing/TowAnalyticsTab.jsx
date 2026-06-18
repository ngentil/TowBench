import React, { useState, useEffect, useMemo } from 'react';
import { ACC, MUT, BRD, TXT, GRN, SURF } from '../../lib/styles';
import { getRecentAllocations } from '../../lib/db/towing';
import { findDepotsForAddress, REGION_LABELS, REGION_STYLE } from '../../lib/towDepots';

const ORANGE = '#e8870a';
const RED    = '#cc3333';
const PERIODS = [
  { label: '24h', ms: 864e5         },
  { label: '7d',  ms: 7  * 864e5   },
  { label: '31d', ms: 31 * 864e5   },
  { label: '3m',  ms: 90 * 864e5   },
  { label: '6m',  ms: 180 * 864e5  },
  { label: '12m', ms: 365 * 864e5  },
  { label: 'All', ms: Infinity      },
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Matches freeway / motorway names in road strings
const FREEWAY_RE = /\b(fwy|freeway|motorway|citylink|eastlink|ring\s*r(?:oa)?d|tollway)\b/i;

function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return w;
}

function tally(arr, keyFn) {
  const map = {};
  arr.forEach(item => { const k = keyFn(item) || 'Unknown'; map[k] = (map[k] || 0) + 1; });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function fmtDuration(mins) {
  if (mins == null) return '—';
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60); const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function KpiCard({ label, value, sub, color = TXT }) {
  return (
    <div style={{ background: SURF, border: '1px solid ' + BRD, borderTop: `2px solid ${color}`, borderRadius: 2, padding: '10px 12px', flex: 1, minWidth: 90 }}>
      <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'break-word' }}>{value}</div>
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

function DepotBarList({ depots }) {
  const max = Math.max(...depots.map(d => d.count), 1);
  if (!depots.length) return <div style={{ fontSize: 9, color: MUT, padding: '12px 0' }}>No data yet</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {depots.map(({ depot, region, count }) => {
        const st = REGION_STYLE[region] || {};
        return (
          <div key={depot} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 70, fontSize: 8, flexShrink: 0, textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
              <span style={{ fontSize: 7, color: MUT }}>{REGION_LABELS[region]?.slice(0, 1) || '?'}</span>
              <span style={{ color: st.color || TXT, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>{depot}</span>
            </div>
            <div style={{ flex: 1, background: '#1a1a1a', borderRadius: 1, height: 13, overflow: 'hidden' }}>
              <div style={{ width: `${(count / max) * 100}%`, height: '100%', background: st.color || ORANGE, borderRadius: 1, opacity: 0.7, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ width: 26, fontSize: 8, color: TXT, fontFamily: "'IBM Plex Mono',monospace", flexShrink: 0 }}>{count}</div>
          </div>
        );
      })}
    </div>
  );
}

function HourChart({ counts }) {
  const max = Math.max(...counts, 1);
  const BAR_H = 100;
  return (
    <div>
      <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', height: BAR_H, padding: '0 1px', position: 'relative' }}>
        {[0.25, 0.5, 0.75].map(pct => (
          <div key={pct} style={{ position: 'absolute', left: 0, right: 0, bottom: `${pct * BAR_H}px`, borderTop: '1px solid #1a1a1a', pointerEvents: 'none' }} />
        ))}
        {counts.map((v, h) => {
          const barH = Math.max((v / max) * BAR_H, v > 0 ? 3 : 0);
          return (
            <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative' }}>
              {v > 0 && (
                <span style={{ position: 'absolute', bottom: barH + 1, fontSize: 6, color: ORANGE, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>{v}</span>
              )}
              <div title={`${String(h).padStart(2,'0')}:00 — ${v} job${v!==1?'s':''}`}
                style={{ width: '100%', background: v > 0 ? ORANGE : '#181818', borderRadius: '1px 1px 0 0', height: `${barH}px`, transition: 'height 0.5s ease', cursor: 'default' }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 1, padding: '3px 1px 0', borderTop: '1px solid #252525' }}>
        {counts.map((_, h) => (
          <div key={h} style={{ flex: 1, textAlign: 'center' }}>
            {h % 3 === 0 && <span style={{ fontSize: 6, color: '#555', fontFamily: "'IBM Plex Mono',monospace" }}>{String(h).padStart(2,'0')}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function DowChart({ counts }) {
  const max = Math.max(...counts, 1);
  const BAR_H = 90;
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: BAR_H, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: BAR_H * 0.5, borderTop: '1px solid #1a1a1a', pointerEvents: 'none' }} />
        {counts.map((v, d) => {
          const barH = Math.max((v / max) * BAR_H, v > 0 ? 3 : 0);
          return (
            <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative' }}>
              {v > 0 && (
                <span style={{ position: 'absolute', bottom: barH + 2, fontSize: 7, color: ACC, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>{v}</span>
              )}
              <div title={`${DAYS[d]} — ${v} job${v!==1?'s':''}`}
                style={{ width: '100%', background: v > 0 ? ACC : '#181818', borderRadius: '1px 1px 0 0', height: `${barH}px`, transition: 'height 0.5s ease', cursor: 'default' }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '4px 0 0', borderTop: '1px solid #252525' }}>
        {counts.map((_, d) => (
          <div key={d} style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ fontSize: 7, color: MUT }}>{DAYS[d]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TowAnalyticsTab({ liveIds }) {
  const [periodMs,  setPeriodMs]  = useState(Infinity);
  const [history,   setHistory]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const winW = useWindowWidth(), isMobile = winW < 640;

  useEffect(() => {
    getRecentAllocations()
      .then(data => { setHistory(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const features = useMemo(() => {
    if (periodMs === Infinity) return history;
    const cutoff = Date.now() - periodMs;
    return history.filter(f => {
      const t = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated || 0).getTime();
      return t >= cutoff;
    });
  }, [history, periodMs]);

  // ── Existing KPIs ──────────────────────────────────────────────────────────

  const activeCount  = features.filter(f =>  liveIds.has(String(f.properties?.eventId))).length;
  const clearedCount = features.length - activeCount;
  const hourCounts   = Array(24).fill(0);
  const dowCounts    = Array(7).fill(0);
  features.forEach(f => {
    const d = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated);
    if (!isNaN(d)) { hourCounts[d.getHours()]++; dowCounts[d.getDay()]++; }
  });
  const peakHourIdx = hourCounts.indexOf(Math.max(...hourCounts));
  const peakHour    = hourCounts[peakHourIdx] > 0 ? `${String(peakHourIdx).padStart(2,'0')}:00–${String(peakHourIdx+1).padStart(2,'0')}:00` : '—';
  const topSuburbs  = tally(features, f => f.properties?.reference?.startIntersectionLocality);
  const topRoads    = tally(features, f => f.properties?.closedRoadName);
  const durations   = features.filter(f=>f._logMeta?.firstSeen).map(f=>(new Date(f._logMeta.clearedAt||f._logMeta.lastSeen)-new Date(f._logMeta.firstSeen))/60000).filter(m=>m>0&&m<1440);
  const avgDuration = durations.length ? durations.reduce((a,b)=>a+b,0)/durations.length : null;
  const days        = periodMs === Infinity ? null : Math.round(periodMs / 864e5);
  const avgPerDay   = days && features.length ? (features.length / days).toFixed(1) : '—';
  const topSuburb   = topSuburbs[0]?.[0] || '—';
  const periodLabel = PERIODS.find(p => p.ms === periodMs)?.label || '31d';

  // ── New KPIs ───────────────────────────────────────────────────────────────

  const nightCount   = features.filter(f => {
    const h = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated || 0).getHours();
    return h < 6 || h >= 18;
  }).length;
  const nightPct     = features.length ? Math.round((nightCount / features.length) * 100) : null;

  const weekendCount = features.filter(f => {
    const d = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated || 0).getDay();
    return d === 0 || d === 6;
  }).length;
  const weekendPct   = features.length ? Math.round((weekendCount / features.length) * 100) : null;

  const freewayCount = features.filter(f => FREEWAY_RE.test(f.properties?.closedRoadName || '')).length;
  const freewayPct   = features.length ? Math.round((freewayCount / features.length) * 100) : null;

  // ── Incident profile ───────────────────────────────────────────────────────

  const topSubTypes = tally(features, f => f.properties?.eventSubType)
    .filter(([k]) => k !== 'Unknown');

  const topImpacts  = tally(features, f => f.properties?.impact?.impactType)
    .filter(([k]) => k !== 'Unknown');

  // ── Severity ───────────────────────────────────────────────────────────────

  const laneBuckets = [
    ['1 lane',  features.filter(f => f.properties?.numberLanesImpacted === 1).length],
    ['2 lanes', features.filter(f => f.properties?.numberLanesImpacted === 2).length],
    ['3+ lanes',features.filter(f => (f.properties?.numberLanesImpacted || 0) >= 3).length],
  ].filter(([, v]) => v > 0);

  const durBuckets = [
    ['< 30m',  durations.filter(m => m < 30).length],
    ['30–60m', durations.filter(m => m >= 30  && m < 60).length],
    ['1–2hr',  durations.filter(m => m >= 60  && m < 120).length],
    ['2–4hr',  durations.filter(m => m >= 120 && m < 240).length],
    ['4–8hr',  durations.filter(m => m >= 240 && m < 480).length],
    ['8hr+',   durations.filter(m => m >= 480).length],
  ].filter(([, v]) => v > 0);

  // ── Depot proximity ────────────────────────────────────────────────────────

  const topDepots = useMemo(() => {
    const hits = {};
    features.forEach(f => {
      const sub = f.properties?.reference?.startIntersectionLocality || '';
      findDepotsForAddress(sub).forEach(({ depot, region }) => {
        const k = String(depot);
        if (!hits[k]) hits[k] = { depot, region, count: 0 };
        hits[k].count++;
      });
    });
    return Object.values(hits).sort((a, b) => b.count - a.count).slice(0, 12);
  }, [features]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>

      {/* Header + period selector */}
      <div style={{ marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>📊 Tow Analytics</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>{loading ? 'Loading…' : `${features.length} allocation${features.length !== 1 ? 's' : ''} · ${periodMs === Infinity ? 'all time' : `last ${periodLabel}`}`}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {PERIODS.map(p => (
            <button key={p.label} onClick={() => setPeriodMs(p.ms)}
              style={{ width: 60, height: 60, borderRadius: 4, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', border: `2px solid ${p.ms === periodMs ? ACC : '#2a2a2a'}`, color: p.ms === periodMs ? ACC : MUT, background: p.ms === periodMs ? ACC + '22' : '#0d0d0d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row 1 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <KpiCard label="Total"        value={features.length}          color={TXT}    />
        <KpiCard label="Active"       value={activeCount}              color={GRN}    />
        <KpiCard label="Cleared"      value={clearedCount}             color={MUT}    />
        <KpiCard label="Avg / Day"    value={avgPerDay}                color={ACC}    />
        <KpiCard label="Peak Hour"    value={peakHour}                 color={ORANGE} sub={hourCounts[peakHourIdx] > 0 ? `${hourCounts[peakHourIdx]} jobs` : undefined} />
        <KpiCard label="Avg Duration" value={fmtDuration(avgDuration)} color={MUT}    sub={durations.length ? `from ${durations.length} jobs` : 'insufficient data'} />
      </div>

      {/* KPI row 2 — shift / road type indicators */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <KpiCard label="Night shift"  value={nightPct   != null ? `${nightPct}%`   : '—'} color={ORANGE} sub="6pm – 6am" />
        <KpiCard label="Weekend"      value={weekendPct != null ? `${weekendPct}%` : '—'} color={ACC}    sub="Sat + Sun" />
        <KpiCard label="Freeway"      value={freewayPct != null ? `${freewayPct}%` : '—'} color={RED}    sub={freewayCount > 0 ? `${freewayCount} jobs` : undefined} />
      </div>

      {/* Top Suburb banner */}
      <div style={{ background: SURF, border: '1px solid ' + BRD, borderTop: `2px solid ${GRN}`, borderRadius: 2, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Top Suburb</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: GRN, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1.1 }}>{topSuburb}</div>
        </div>
        {topSuburbs[0] && <div style={{ fontSize: 13, fontWeight: 700, color: MUT, fontFamily: "'IBM Plex Mono',monospace", whiteSpace: 'nowrap' }}>{topSuburbs[0][1]} jobs</div>}
      </div>

      {/* Hour + DoW charts */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Jobs by Hour of Day</div>
          <HourChart counts={hourCounts} />
        </div>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Jobs by Day of Week</div>
          <DowChart counts={dowCounts} />
        </div>
      </div>

      {/* Hot Suburbs + Hot Roads */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Hot Suburbs</div>
          <BarList data={topSuburbs} color={GRN} maxBars={10} labelWidth={110} />
        </div>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Hot Roads</div>
          <BarList data={topRoads} color={ORANGE} maxBars={10} labelWidth={110} />
        </div>
      </div>

      {/* Incident type + Impact type */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Incident Type</div>
          <BarList data={topSubTypes} color={RED} maxBars={10} labelWidth={120} />
        </div>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Impact Type</div>
          <BarList data={topImpacts} color={ORANGE} maxBars={10} labelWidth={120} />
        </div>
      </div>

      {/* Lanes impacted + Duration distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Lanes Impacted</div>
          <BarList data={laneBuckets} color={ACC} maxBars={5} labelWidth={70} />
        </div>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Duration Distribution</div>
          <div style={{ fontSize: 7, color: MUT, marginBottom: 8 }}>cleared jobs only · {durations.length} with data</div>
          <BarList data={durBuckets} color={MUT} maxBars={6} labelWidth={60} />
        </div>
      </div>

      {/* Depot proximity */}
      <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>Depot Activity — Nearby Allocations</div>
        </div>
        <div style={{ fontSize: 7, color: MUT, marginBottom: 10, lineHeight: 1.6, borderLeft: '2px solid #2a2a2a', paddingLeft: 8 }}>
          Matched by suburb proximity — indicates which depots are closest to the work, not which ones got the job. Use as a leading indicator only.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          {(['S', 'N', 'E', 'W']).map(region => {
            const regionDepots = topDepots.filter(d => d.region === region);
            if (!regionDepots.length) return null;
            const st = REGION_STYLE[region];
            return (
              <div key={region}>
                <div style={{ fontSize: 7, fontWeight: 700, color: st.color, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{REGION_LABELS[region]}</div>
                <DepotBarList depots={regionDepots} />
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
