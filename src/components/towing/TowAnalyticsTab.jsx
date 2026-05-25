import React, { useState, useEffect, useMemo } from 'react';
import { ACC, MUT, BRD, TXT, GRN, SURF } from '../../lib/styles';

const ORANGE = '#e8870a';
const PERIODS = [
  { label: '24h', ms: 864e5   },
  { label: '7d',  ms: 6048e5  },
  { label: '31d', ms: Infinity },
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

export default function TowAnalyticsTab({ allFeatures, liveIds, loading }) {
  const [periodMs, setPeriodMs] = useState(Infinity);
  const winW = useWindowWidth(), isMobile = winW < 640;

  const features = useMemo(() => {
    const cutoff = Date.now() - periodMs;
    return allFeatures.filter(f => {
      if (periodMs === Infinity) return true;
      const t = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated || 0).getTime();
      return t >= cutoff;
    });
  }, [allFeatures, periodMs]);

  const activeCount  = features.filter(f =>  liveIds.has(String(f.properties?.eventId))).length;
  const clearedCount = features.length - activeCount;
  const hourCounts = Array(24).fill(0);
  const dowCounts  = Array(7).fill(0);
  features.forEach(f => {
    const d = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated);
    if (!isNaN(d)) { hourCounts[d.getHours()]++; dowCounts[d.getDay()]++; }
  });
  const peakHourIdx = hourCounts.indexOf(Math.max(...hourCounts));
  const peakHour    = hourCounts[peakHourIdx] > 0 ? `${String(peakHourIdx).padStart(2,'0')}:00–${String(peakHourIdx+1).padStart(2,'0')}:00` : '—';
  const topSuburbs = tally(features, f => f.properties?.reference?.startIntersectionLocality);
  const topRoads   = tally(features, f => f.properties?.closedRoadName);
  const incTypes   = tally(features, f => f.properties?.eventSubType);
  const impTypes   = tally(features, f => f.properties?.impact?.impactType);
  const durations  = features.filter(f=>f._logMeta?.firstSeen).map(f=>(new Date(f._logMeta.clearedAt||f._logMeta.lastSeen)-new Date(f._logMeta.firstSeen))/60000).filter(m=>m>0&&m<1440);
  const avgDuration = durations.length ? durations.reduce((a,b)=>a+b,0)/durations.length : null;
  const laneValues = features.map(f=>f.properties?.numberLanesImpacted).filter(n=>n!=null&&n>0);
  const avgLanes   = laneValues.length ? (laneValues.reduce((a,b)=>a+b,0)/laneValues.length).toFixed(1) : '—';
  const days        = periodMs === Infinity ? 31 : Math.round(periodMs / 864e5);
  const avgPerDay   = features.length ? (features.length / days).toFixed(1) : '0';
  const topSuburb   = topSuburbs[0]?.[0] || '—';
  const periodLabel = PERIODS.find(p => p.ms === periodMs)?.label || '31d';

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8 }}>
        <div>
          <div style={{ fontSize:13,fontWeight:700,color:TXT,letterSpacing:'0.06em' }}>📊 Tow Analytics</div>
          <div style={{ fontSize:9,color:MUT,marginTop:2 }}>{loading&&allFeatures.length===0?'Loading…':`${features.length} allocation${features.length!==1?'s':''} · ${periodMs===Infinity?'last 31 days':`last ${periodLabel}`}`}</div>
        </div>
        <div style={{ display:'flex',gap:4 }}>
          {PERIODS.map(p=>(
            <button key={p.label} onClick={()=>setPeriodMs(p.ms)}
              style={{ fontSize:8,fontWeight:700,padding:'3px 9px',borderRadius:2,cursor:'pointer',fontFamily:"'IBM Plex Mono',monospace",letterSpacing:'0.06em',border:`1px solid ${p.ms===periodMs?ACC+'88':'#2a2a2a'}`,color:p.ms===periodMs?ACC:MUT,background:p.ms===periodMs?ACC+'11':'#0d0d0d' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:'flex',gap:8,marginBottom:14,flexWrap:'wrap' }}>
        <KpiCard label="Total"        value={features.length}          color={TXT}    />
        <KpiCard label="Active"       value={activeCount}              color={GRN}    />
        <KpiCard label="Cleared"      value={clearedCount}             color={MUT}    />
        <KpiCard label="Avg / Day"    value={avgPerDay}                color={ACC}    />
        <KpiCard label="Peak Hour"    value={peakHour}                 color={ORANGE} sub={hourCounts[peakHourIdx]>0?`${hourCounts[peakHourIdx]} jobs`:undefined} />
        <KpiCard label="Top Suburb"   value={topSuburb}                color={GRN}    sub={topSuburbs[0]?`${topSuburbs[0][1]} jobs`:undefined} />
        <KpiCard label="Avg Duration" value={fmtDuration(avgDuration)} color={MUT}    sub={durations.length?`from ${durations.length} jobs`:'insufficient data'} />
        <KpiCard label="Avg Lanes"    value={avgLanes}                 color={ORANGE} sub={laneValues.length?`${laneValues.length} jobs`:undefined} />
      </div>

      <div style={{ display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:12,marginBottom:14 }}>
        <div style={{ background:SURF,border:'1px solid '+BRD,borderRadius:2,padding:'10px 12px' }}>
          <div style={{ fontSize:8,color:MUT,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:700,marginBottom:10 }}>Jobs by Hour of Day</div>
          <HourChart counts={hourCounts} />
        </div>
        <div style={{ background:SURF,border:'1px solid '+BRD,borderRadius:2,padding:'10px 12px' }}>
          <div style={{ fontSize:8,color:MUT,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:700,marginBottom:10 }}>Jobs by Day of Week</div>
          <DowChart counts={dowCounts} />
        </div>
      </div>

      <div style={{ display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:12,marginBottom:14 }}>
        <div style={{ background:SURF,border:'1px solid '+BRD,borderRadius:2,padding:'10px 12px' }}>
          <div style={{ fontSize:8,color:MUT,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:700,marginBottom:10 }}>Incident Type</div>
          <BarList data={incTypes} color={ORANGE} maxBars={8} labelWidth={130} />
        </div>
        <div style={{ background:SURF,border:'1px solid '+BRD,borderRadius:2,padding:'10px 12px' }}>
          <div style={{ fontSize:8,color:MUT,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:700,marginBottom:10 }}>Impact Type</div>
          <BarList data={impTypes} color='#5a7a9a' maxBars={6} labelWidth={130} />
        </div>
      </div>

      <div style={{ display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:12 }}>
        <div style={{ background:SURF,border:'1px solid '+BRD,borderRadius:2,padding:'10px 12px' }}>
          <div style={{ fontSize:8,color:MUT,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:700,marginBottom:10 }}>Hot Suburbs</div>
          <BarList data={topSuburbs} color={GRN} maxBars={10} labelWidth={110} />
        </div>
        <div style={{ background:SURF,border:'1px solid '+BRD,borderRadius:2,padding:'10px 12px' }}>
          <div style={{ fontSize:8,color:MUT,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:700,marginBottom:10 }}>Hot Roads</div>
          <BarList data={topRoads} color={ORANGE} maxBars={10} labelWidth={110} />
        </div>
      </div>
    </div>
  );
}
