import React, { useState, useEffect, useMemo } from 'react';
import { ACC, MUT, BRD, TXT, GRN, SURF } from '../../lib/styles';
import { getRecentAllocations } from '../../lib/db/towing';
import { findDepotsForAddress, REGION_LABELS, REGION_STYLE } from '../../lib/towDepots';

const ORANGE = '#e8870a';
const RED    = '#cc3333';

const PERIODS = [
  { label: '24h', ms: 864e5        },
  { label: '7d',  ms: 7   * 864e5  },
  { label: '31d', ms: 31  * 864e5  },
  { label: '3m',  ms: 90  * 864e5  },
  { label: '6m',  ms: 180 * 864e5  },
  { label: '12m', ms: 365 * 864e5  },
  { label: 'All', ms: Infinity     },
];

const DOW       = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const HMAP_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; // 0=Mon

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
  arr.forEach(item => { const k = keyFn(item); if (k) map[k] = (map[k] || 0) + 1; });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function fmtDuration(mins) {
  if (mins == null) return '—';
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// ── Shared UI components ────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = TXT }) {
  return (
    <div style={{ background: SURF, border: '1px solid ' + BRD, borderTop: `2px solid ${color}`, borderRadius: 2, padding: '10px 12px', flex: 1, minWidth: 90 }}>
      <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1.2, wordBreak: 'break-word' }}>{value}</div>
      {sub && <div style={{ fontSize: 8, color: MUT, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BarList({ data, color = ORANGE, maxBars = 20, labelWidth = 120 }) {
  const max = Math.max(...data.map(([, v]) => v), 1);
  if (!data.length) return <div style={{ fontSize: 9, color: MUT, padding: '10px 0' }}>No data yet</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {data.slice(0, maxBars).map(([label, val]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: labelWidth, fontSize: 8, color: MUT, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }} title={label}>{label}</div>
          <div style={{ flex: 1, background: '#1a1a1a', borderRadius: 1, height: 12, overflow: 'hidden' }}>
            <div style={{ width: `${(val / max) * 100}%`, height: '100%', background: color, borderRadius: 1, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ width: 28, fontSize: 8, color: TXT, fontFamily: "'IBM Plex Mono',monospace", flexShrink: 0 }}>{val}</div>
        </div>
      ))}
    </div>
  );
}

function DurationBarList({ data, maxBars = 12 }) {
  const maxMins = Math.max(...data.map(([, m]) => m), 1);
  if (!data.length) return <div style={{ fontSize: 9, color: MUT, padding: '10px 0' }}>No data yet</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {data.slice(0, maxBars).map(([label, avgMins, count]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 130, fontSize: 8, color: MUT, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }} title={label}>{label}</div>
          <div style={{ flex: 1, background: '#1a1a1a', borderRadius: 1, height: 12, overflow: 'hidden' }}>
            <div style={{ width: `${(avgMins / maxMins) * 100}%`, height: '100%', background: MUT, borderRadius: 1 }} />
          </div>
          <div style={{ width: 72, fontSize: 8, color: TXT, fontFamily: "'IBM Plex Mono',monospace", flexShrink: 0, textAlign: 'right' }}>
            {fmtDuration(avgMins)} <span style={{ color: '#444' }}>×{count}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Charts ──────────────────────────────────────────────────────────────────

function HeatmapChart({ heatmap, heatMax }) {
  const CELL_H = 17;
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 460 }}>
        {/* Hour axis */}
        <div style={{ display: 'flex', marginLeft: 32, marginBottom: 3 }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{ flex: 1, textAlign: 'center' }}>
              {h % 3 === 0 && <span style={{ fontSize: 6, color: '#555', fontFamily: "'IBM Plex Mono',monospace" }}>{String(h).padStart(2,'0')}</span>}
            </div>
          ))}
        </div>
        {/* Day rows */}
        {HMAP_DAYS.map((day, di) => (
          <div key={day} style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
            <div style={{ width: 28, fontSize: 7, color: MUT, textAlign: 'right', paddingRight: 4, flexShrink: 0 }}>{day}</div>
            {heatmap[di].map((v, h) => {
              const intensity = v / heatMax;
              const bg = v === 0 ? '#111' : `rgba(232,135,10,${(0.15 + intensity * 0.85).toFixed(2)})`;
              return (
                <div key={h} title={`${day} ${String(h).padStart(2,'0')}:00 — ${v} job${v !== 1 ? 's' : ''}`}
                  style={{ flex: 1, height: CELL_H, background: bg, marginLeft: 1, borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {v > 0 && <span style={{ fontSize: 6, color: intensity > 0.55 ? '#000' : ORANGE, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1, userSelect: 'none' }}>{v}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function HourChart({ counts }) {
  const max = Math.max(...counts, 1);
  const BAR_H = 90;
  return (
    <div>
      <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', height: BAR_H, padding: '0 1px', position: 'relative' }}>
        {[0.25, 0.5, 0.75].map(p => (
          <div key={p} style={{ position: 'absolute', left: 0, right: 0, bottom: `${p * BAR_H}px`, borderTop: '1px solid #1a1a1a', pointerEvents: 'none' }} />
        ))}
        {counts.map((v, h) => {
          const barH = Math.max((v / max) * BAR_H, v > 0 ? 2 : 0);
          return (
            <div key={h} title={`${String(h).padStart(2,'0')}:00 — ${v} job${v !== 1 ? 's' : ''}`}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative' }}>
              {v > 0 && <span style={{ position: 'absolute', bottom: barH + 1, fontSize: 6, color: ORANGE, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>{v}</span>}
              <div style={{ width: '100%', background: v > 0 ? ORANGE : '#181818', borderRadius: '1px 1px 0 0', height: `${barH}px` }} />
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
  const BAR_H = 80;
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: BAR_H, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: BAR_H * 0.5, borderTop: '1px solid #1a1a1a', pointerEvents: 'none' }} />
        {counts.map((v, d) => {
          const barH = Math.max((v / max) * BAR_H, v > 0 ? 2 : 0);
          return (
            <div key={d} title={`${DOW[d]} — ${v} job${v !== 1 ? 's' : ''}`}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative' }}>
              {v > 0 && <span style={{ position: 'absolute', bottom: barH + 2, fontSize: 7, color: ACC, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>{v}</span>}
              <div style={{ width: '100%', background: v > 0 ? ACC : '#181818', borderRadius: '1px 1px 0 0', height: `${barH}px` }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '4px 0 0', borderTop: '1px solid #252525' }}>
        {counts.map((_, d) => (
          <div key={d} style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ fontSize: 7, color: MUT }}>{DOW[d]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendChart({ data }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const BAR_H = 72;
  if (!data.length) return <div style={{ fontSize: 9, color: MUT, padding: '10px 0' }}>No data yet</div>;
  const showEvery = data.length <= 14 ? 1 : data.length <= 31 ? 7 : data.length <= 52 ? 4 : 3;
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: Math.max(300, data.length * 10), display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', height: BAR_H }}>
          {data.map(({ label, count }) => {
            const barH = Math.max((count / max) * BAR_H, count > 0 ? 2 : 0);
            return (
              <div key={label} title={`${label}: ${count} job${count !== 1 ? 's' : ''}`}
                style={{ flex: 1, minWidth: 3, display: 'flex', alignItems: 'flex-end', height: '100%' }}>
                <div style={{ width: '100%', height: barH, background: count > 0 ? ACC : '#181818', borderRadius: '1px 1px 0 0' }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 1, borderTop: '1px solid #252525', paddingTop: 3 }}>
          {data.map(({ label }, i) => (
            <div key={label} style={{ flex: 1, minWidth: 3, textAlign: 'center' }}>
              {i % showEvery === 0 && <span style={{ fontSize: 6, color: '#555', fontFamily: "'IBM Plex Mono',monospace", whiteSpace: 'nowrap' }}>{label.slice(5)}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function TowAnalyticsTab({ liveIds }) {
  const [periodMs, setPeriodMs] = useState(Infinity);
  const [history,  setHistory]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const winW = useWindowWidth(), isMobile = winW < 640;

  useEffect(() => {
    getRecentAllocations()
      .then(data => { setHistory(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const features = useMemo(() => {
    if (periodMs === Infinity) return history;
    const cutoff = Date.now() - periodMs;
    return history.filter(f => new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated || 0).getTime() >= cutoff);
  }, [history, periodMs]);

  // ── KPI row 1 ─────────────────────────────────────────────────────────────

  const activeCount  = features.filter(f => liveIds.has(String(f.properties?.eventId))).length;
  const clearedCount = features.length - activeCount;

  const durations = features
    .filter(f => f._logMeta?.firstSeen)
    .map(f => (new Date(f._logMeta.clearedAt || f._logMeta.lastSeen) - new Date(f._logMeta.firstSeen)) / 60000)
    .filter(m => m > 0 && m < 1440);
  const avgDuration  = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  const longestJob   = durations.length ? Math.max(...durations) : null;

  const clearedWithTs  = features.filter(f => f._logMeta?.clearedAt).length;
  const clearanceRate  = features.length ? Math.round((clearedWithTs / features.length) * 100) : null;

  const days      = periodMs === Infinity ? null : Math.round(periodMs / 864e5);
  const avgPerDay = days && features.length ? (features.length / days).toFixed(1) : '—';

  const hourCounts = Array(24).fill(0);
  const dowCounts  = Array(7).fill(0);
  features.forEach(f => {
    const d = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated);
    if (!isNaN(d)) { hourCounts[d.getHours()]++; dowCounts[d.getDay()]++; }
  });
  const peakHourIdx = hourCounts.indexOf(Math.max(...hourCounts));
  const peakHour    = hourCounts[peakHourIdx] > 0
    ? `${String(peakHourIdx).padStart(2,'0')}–${String(peakHourIdx + 1).padStart(2,'0')}`
    : '—';

  // ── KPI row 2 ─────────────────────────────────────────────────────────────

  const nightCount   = features.filter(f => { const h = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated || 0).getHours(); return h < 6 || h >= 18; }).length;
  const nightPct     = features.length ? Math.round((nightCount   / features.length) * 100) : null;
  const weekendCount = features.filter(f => { const d = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated || 0).getDay(); return d === 0 || d === 6; }).length;
  const weekendPct   = features.length ? Math.round((weekendCount / features.length) * 100) : null;
  const freewayCount = features.filter(f => FREEWAY_RE.test(f.properties?.closedRoadName || '')).length;
  const freewayPct   = features.length ? Math.round((freewayCount / features.length) * 100) : null;

  // ── Heatmap ───────────────────────────────────────────────────────────────

  const heatmap = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    features.forEach(f => {
      const d = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated);
      if (!isNaN(d)) grid[(d.getDay() + 6) % 7][d.getHours()]++;
    });
    return grid;
  }, [features]);
  const heatMax = Math.max(...heatmap.flat(), 1);

  // ── Trend (daily / weekly / monthly) ─────────────────────────────────────

  const dailyTrend = useMemo(() => {
    const buckets = {};
    features.forEach(f => {
      const d = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated);
      if (isNaN(d)) return;
      let key;
      if (periodMs > 90 * 864e5 || periodMs === Infinity) {
        key = d.toISOString().slice(0, 7); // YYYY-MM (monthly)
      } else if (periodMs > 14 * 864e5) {
        const mon = new Date(d); mon.setDate(d.getDate() - (d.getDay() + 6) % 7);
        key = mon.toISOString().slice(0, 10); // week starting Monday
      } else {
        key = d.toISOString().slice(0, 10); // YYYY-MM-DD (daily)
      }
      buckets[key] = (buckets[key] || 0) + 1;
    });
    return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => ({ label, count }));
  }, [features, periodMs]);

  const busiestDay = useMemo(() => {
    const daily = {};
    features.forEach(f => {
      const d = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated);
      if (!isNaN(d)) { const k = d.toISOString().slice(0, 10); daily[k] = (daily[k] || 0) + 1; }
    });
    return Object.entries(daily).sort(([, a], [, b]) => b - a)[0] || null;
  }, [features]);

  const trendLabel = periodMs > 90 * 864e5 || periodMs === Infinity ? 'Monthly' : periodMs > 14 * 864e5 ? 'Weekly' : 'Daily';

  // ── Lists ─────────────────────────────────────────────────────────────────

  const topSuburbs      = tally(features, f => f.properties?.reference?.startIntersectionLocality);
  const topSuburb       = topSuburbs[0]?.[0] || '—';
  const topRoads        = tally(features, f => f.properties?.closedRoadName);
  const topIntersections = tally(
    features.filter(f => f.properties?.reference?.startIntersectionRoadName),
    f => {
      const r = f.properties?.closedRoadName || '';
      const x = f.properties?.reference?.startIntersectionRoadName || '';
      return x ? `${r} @ ${x}` : null;
    }
  );
  const topSubTypes = tally(features, f => f.properties?.eventSubType);
  const topImpacts  = tally(features, f => f.properties?.impact?.impactType);

  // ── Severity ──────────────────────────────────────────────────────────────

  const laneBuckets = [1, 2, 3, 4, 5].map(n => {
    const label = n === 5 ? '5+ lanes' : `${n} lane${n > 1 ? 's' : ''}`;
    const count = n === 5
      ? features.filter(f => (f.properties?.numberLanesImpacted || 0) >= 5).length
      : features.filter(f => f.properties?.numberLanesImpacted === n).length;
    return [label, count];
  }).filter(([, v]) => v > 0);

  const durBuckets = [
    ['< 15m',   durations.filter(m => m < 15).length],
    ['15–30m',  durations.filter(m => m >= 15  && m < 30).length],
    ['30–60m',  durations.filter(m => m >= 30  && m < 60).length],
    ['1–2hr',   durations.filter(m => m >= 60  && m < 120).length],
    ['2–4hr',   durations.filter(m => m >= 120 && m < 240).length],
    ['4–8hr',   durations.filter(m => m >= 240 && m < 480).length],
    ['8–12hr',  durations.filter(m => m >= 480 && m < 720).length],
    ['12–24hr', durations.filter(m => m >= 720).length],
  ].filter(([, v]) => v > 0);

  const durationByType = useMemo(() => {
    const map = {};
    features.filter(f => f._logMeta?.firstSeen && f.properties?.eventSubType).forEach(f => {
      const type = f.properties.eventSubType;
      const mins = (new Date(f._logMeta.clearedAt || f._logMeta.lastSeen) - new Date(f._logMeta.firstSeen)) / 60000;
      if (mins <= 0 || mins >= 1440) return;
      if (!map[type]) map[type] = { total: 0, count: 0 };
      map[type].total += mins; map[type].count++;
    });
    return Object.entries(map)
      .filter(([, v]) => v.count >= 2)
      .map(([label, { total, count }]) => [label, total / count, count])
      .sort((a, b) => b[1] - a[1]);
  }, [features]);

  // ── Depot proximity ───────────────────────────────────────────────────────

  const regionActivity = useMemo(() => {
    const data = {};
    features.forEach(f => {
      const sub = f.properties?.reference?.startIntersectionLocality || '';
      if (!sub) return;
      [...new Set(findDepotsForAddress(sub).map(h => h.region))].forEach(region => {
        if (!data[region]) data[region] = {};
        data[region][sub] = (data[region][sub] || 0) + 1;
      });
    });
    return Object.fromEntries(
      Object.entries(data).map(([r, subs]) => [r, Object.entries(subs).sort((a, b) => b[1] - a[1])])
    );
  }, [features]);

  const periodLabel = PERIODS.find(p => p.ms === periodMs)?.label || '31d';

  // ── Render ────────────────────────────────────────────────────────────────

  const Section = ({ title, children, full }) => (
    <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px', ...(full ? { marginBottom: 14 } : {}) }}>
      <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>

      {/* Header + period selector */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>📊 Tow Analytics</div>
        <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
          {loading ? 'Loading…' : `${features.length} allocation${features.length !== 1 ? 's' : ''} · ${periodMs === Infinity ? 'all time' : `last ${periodLabel}`}`}
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
        <KpiCard label="Total"          value={features.length}                                                   color={TXT}    />
        <KpiCard label="Active"         value={activeCount}                                                       color={GRN}    />
        <KpiCard label="Cleared"        value={clearedCount}                                                      color={MUT}    />
        <KpiCard label="Clearance Rate" value={clearanceRate != null ? `${clearanceRate}%` : '—'}                 color={GRN}    sub={clearedWithTs > 0 ? `${clearedWithTs} with data` : undefined} />
        <KpiCard label="Avg / Day"      value={avgPerDay}                                                         color={ACC}    />
        <KpiCard label="Peak Hour"      value={peakHour}                                                          color={ORANGE} sub={hourCounts[peakHourIdx] > 0 ? `${hourCounts[peakHourIdx]} jobs` : undefined} />
        <KpiCard label="Avg Duration"   value={fmtDuration(avgDuration)}                                          color={MUT}    sub={durations.length ? `from ${durations.length} jobs` : 'no data'} />
        <KpiCard label="Longest Job"    value={fmtDuration(longestJob)}                                           color={RED}    />
      </div>

      {/* KPI row 2 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <KpiCard label="Night shift"  value={nightPct   != null ? `${nightPct}%`   : '—'} color={ORANGE} sub="6pm–6am" />
        <KpiCard label="Weekend"      value={weekendPct != null ? `${weekendPct}%` : '—'} color={ACC}    sub="Sat + Sun" />
        <KpiCard label="Freeway"      value={freewayPct != null ? `${freewayPct}%` : '—'} color={RED}    sub={freewayCount > 0 ? `${freewayCount} jobs` : undefined} />
        <KpiCard label="Busiest Day"  value={busiestDay ? fmtDate(busiestDay[0]) : '—'}   color={GRN}    sub={busiestDay ? `${busiestDay[1]} jobs` : undefined} />
      </div>

      {/* Top Suburb banner */}
      <div style={{ background: SURF, border: '1px solid ' + BRD, borderTop: `2px solid ${GRN}`, borderRadius: 2, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Top Suburb</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: GRN, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1.1 }}>{topSuburb}</div>
        </div>
        {topSuburbs[0] && <div style={{ fontSize: 13, fontWeight: 700, color: MUT, fontFamily: "'IBM Plex Mono',monospace", whiteSpace: 'nowrap' }}>{topSuburbs[0][1]} jobs</div>}
      </div>

      {/* Day × Hour heatmap */}
      <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px', marginBottom: 14 }}>
        <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Day × Hour Heatmap</div>
        <HeatmapChart heatmap={heatmap} heatMax={heatMax} />
      </div>

      {/* Trend chart */}
      <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px', marginBottom: 14 }}>
        <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>{trendLabel} Job Volume</div>
        <TrendChart data={dailyTrend} />
      </div>

      {/* Hour + DoW */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <Section title="Jobs by Hour of Day"><HourChart counts={hourCounts} /></Section>
        <Section title="Jobs by Day of Week"><DowChart counts={dowCounts} /></Section>
      </div>

      {/* Hot Suburbs + Hot Roads */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <Section title="Hot Suburbs"><BarList data={topSuburbs} color={GRN}    maxBars={20} labelWidth={120} /></Section>
        <Section title="Hot Roads">  <BarList data={topRoads}   color={ORANGE} maxBars={20} labelWidth={120} /></Section>
      </div>

      {/* Top Intersections + Incident Type */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <Section title="Top Intersections"><BarList data={topIntersections} color={ACC}    maxBars={15} labelWidth={130} /></Section>
        <Section title="Incident Type">    <BarList data={topSubTypes}      color={RED}    maxBars={15} labelWidth={130} /></Section>
      </div>

      {/* Impact Type + Lanes Impacted */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <Section title="Impact Type">      <BarList data={topImpacts}   color={ORANGE} maxBars={10} labelWidth={120} /></Section>
        <Section title="Lanes Impacted">   <BarList data={laneBuckets}  color={ACC}    maxBars={6}  labelWidth={80}  /></Section>
      </div>

      {/* Duration Distribution + Avg Duration by Type */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Duration Distribution</div>
          <div style={{ fontSize: 7, color: MUT, marginBottom: 8 }}>cleared jobs only · {durations.length} with data</div>
          <BarList data={durBuckets} color={MUT} maxBars={8} labelWidth={65} />
        </div>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Avg Duration by Type</div>
          <div style={{ fontSize: 7, color: MUT, marginBottom: 8 }}>types with ≥2 cleared jobs</div>
          <DurationBarList data={durationByType} maxBars={10} />
        </div>
      </div>

      {/* Depot activity */}
      <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
        <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Depot Activity — Nearby Suburbs by Region</div>
        <div style={{ fontSize: 7, color: MUT, marginBottom: 12, lineHeight: 1.6, borderLeft: '2px solid #2a2a2a', paddingLeft: 8 }}>
          Suburb proximity match — leading indicator of which regions are busiest, not confirmed job assignment.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
          {['S', 'N', 'E', 'W'].map(region => {
            const suburbs = regionActivity[region] || [];
            const total   = suburbs.reduce((s, [, v]) => s + v, 0);
            const st      = REGION_STYLE[region];
            return (
              <div key={region}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: st.color, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{REGION_LABELS[region]}</span>
                  {total > 0 && <span style={{ fontSize: 8, color: MUT, fontFamily: "'IBM Plex Mono',monospace" }}>{total} nearby</span>}
                </div>
                {suburbs.length === 0
                  ? <div style={{ fontSize: 8, color: MUT }}>No data</div>
                  : <BarList data={suburbs} color={st.color} maxBars={15} labelWidth={110} />
                }
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
