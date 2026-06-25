import React, { useState, useRef, useEffect } from 'react';
import { ACC, MUT, BRD, TXT } from '../../lib/styles';
import { useSignals } from '../../hooks/useSignals';

// ── Severity / event meta ─────────────────────────────────────────────────────
const SEV = {
  info:  { dot: '#4a8a4a', bg: '#0a120a', border: '#1e2e1e' },
  warn:  { dot: '#cc8822', bg: '#121008', border: '#2e2408' },
  alert: { dot: '#cc3333', bg: '#120808', border: '#2e1010' },
};
const EV = {
  HASH_CHANGED:          { icon: '🔄', label: 'Feed Updated'     },
  CACHE_HIT:             { icon: '💾', label: 'Cache Hit'        },
  CACHE_MISS:            { icon: '🔍', label: 'Cache Miss'       },
  HIGH_CDN_AGE:          { icon: '🕰',  label: 'CDN Stale'       },
  LATENCY_SPIKE:         { icon: '⏱',  label: 'Latency Spike'   },
  ENCODING_CHANGE:       { icon: '🔀', label: 'Encoding Changed' },
  API_WARNING:           { icon: '⚠️', label: 'API Warning'      },
  RATE_LIMIT_LOW:        { icon: '🚦', label: 'Rate Limit Low'   },
  FEED_ERROR:            { icon: '🔴', label: 'Feed Error'       },
  FEED_RECOVERED:        { icon: '🟢', label: 'Feed Recovered'   },
  SCHEMA_CHANGE:         { icon: '🔎', label: 'Schema Change'    },
  NEW_JOB:               { icon: '🆕', label: 'New Job'          },
  JOB_CLEARED:           { icon: '✅', label: 'Cleared'          },
  BATCH_FLUSH:           { icon: '⚡', label: 'Batch Flush'      },
  SURGE:                 { icon: '📈', label: 'Surge'            },
  JOB_FLICKERED:         { icon: '👻', label: 'Flickering'       },
  COORD_DRIFT:           { icon: '🗺️', label: 'Coord Drift'      },
  DESC_ESCALATION:       { icon: '⬆️', label: 'Escalation'       },
  GHOST_JOB:             { icon: '🕰',  label: 'Ghost Job'       },
  DUPLICATE_JOBS:        { icon: '♊', label: 'Duplicate'        },
  PUBLICATION_LAG:       { icon: '📡', label: 'Pub Lag'          },
  POLL_FAILED:           { icon: '🚫', label: 'Poll Failed'      },
  VIC_EM_NEW:            { icon: '🚨', label: 'EM Incident'      },
  VIC_EM_CLEARED:        { icon: '✅', label: 'EM Cleared'       },
  VIC_EM_UPDATED:        { icon: '🔄', label: 'EM Updated'       },
  VIC_EM_ESCALATED:      { icon: '⬆️', label: 'EM Escalated'     },
  VIC_EM_SURGE:          { icon: '📈', label: 'EM Surge'         },
  VIC_EM_ERROR:          { icon: '🔴', label: 'EM Error'         },
  VIC_EM_RECOVERED:      { icon: '🟢', label: 'EM Recovered'     },
  VIC_EM_LATENCY:        { icon: '⏱',  label: 'EM Latency'      },
  WAZE_NEW:              { icon: '🗺️', label: 'Waze Alert'       },
  WAZE_CLEARED:          { icon: '✅', label: 'Waze Cleared'     },
  WAZE_SURGE:            { icon: '📈', label: 'Waze Surge'       },
  WAZE_ERROR:            { icon: '🔴', label: 'Waze Error'       },
  WAZE_RECOVERED:        { icon: '🟢', label: 'Waze Recovered'   },
  WAZE_BUDGET_EXHAUSTED: { icon: '💸', label: 'Budget Gone'      },
  CROSS_CONFIRMED:       { icon: '🔗', label: 'Multi-Source'     },
  WAZE_LEAD:             { icon: '⚡', label: 'Waze Lead'        },
  INFRA_CORR:            { icon: '🏗️', label: 'Infra Spike'      },
};

function evMeta(type) { return EV[type] || { icon: '·', label: type }; }
function fmtTime(ts)  { return new Date(ts).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }
function fmtMs(ms)    { return ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`; }
function fmtAge(ms)   {
  if (ms == null) return null;
  if (ms < 60000)    return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000)  return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h ${Math.round((ms % 3600000) / 60000)}m`;
}

// ── Shared style helpers ──────────────────────────────────────────────────────
const CARD_BASE = {
  background: '#0d0d0d', borderRadius: 4,
  padding: '10px 12px', fontFamily: "'IBM Plex Mono',monospace",
};

// ── Big stat cards ────────────────────────────────────────────────────────────
function StatCard({ label, value, color, sub, dim }) {
  const col = color || (dim ? '#334' : TXT);
  return (
    <div style={{ ...CARD_BASE, border: `1px solid ${col}33`, flex: 1, minWidth: 60 }}>
      <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: col, lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 8, color: '#4a6a4a', marginTop: 5, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

// ── Source badge ──────────────────────────────────────────────────────────────
function SourceBadge({ src, label, detail }) {
  const COLORS = {
    vicroads:    { bg: '#0d1a2a', border: '#1e3a5a', text: '#4a8abb' },
    vicemergency:{ bg: '#2a0d0d', border: '#4a1010', text: '#cc5544' },
    waze:        { bg: '#0d1a0d', border: '#1a3a1a', text: '#4a8a4a' },
  };
  const c = COLORS[src] || { bg: '#111', border: '#222', text: MUT };
  return (
    <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 7px', borderRadius: 2,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text, whiteSpace: 'nowrap' }}>
      {label}{detail ? ` · ${detail}` : ''}
    </span>
  );
}

// ── Incident card (VicRoads job cross-referenced with other sources) ───────────
function IncidentCard({ job, now }) {
  const [open, setOpen] = useState(false);
  const ageMs  = now - job.firstSeen;
  const multi  = job.sources.length >= 2;
  const triple = job.sources.length >= 3;
  const borderCol = triple ? '#cc4433' : multi ? '#cc8822' : '#1e2a3a';
  const sev    = job.emMatch?.severity;
  const isSerious = sev === 'Emergency Warning' || sev === 'Watch and Act';

  return (
    <div style={{ ...CARD_BASE, border: `1px solid ${borderCol}`, borderLeft: `3px solid ${borderCol}`,
      marginBottom: 8, cursor: 'pointer' }}
      onClick={() => setOpen(o => !o)}>

      {/* Top row: road + age */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job.road || 'Unknown Road'}
          </div>
          {job.suburb && <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>{job.suburb}</div>}
        </div>
        <div style={{ fontSize: 9, color: '#444', flexShrink: 0, fontWeight: 700 }}>
          {fmtAge(ageMs)}
        </div>
      </div>

      {/* Source badges */}
      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
        <SourceBadge src="vicroads" label="🚦 VicRoads" />
        {job.emMatch && (
          <SourceBadge src="vicemergency" label={`🚨 ${job.emMatch.cat || 'VicEmergency'}`} />
        )}
        {job.wazeMatch && (
          <SourceBadge src="waze" label={`🗺️ ${job.wazeMatch.type || 'Waze'}`} detail={job.wazeMatch.subtype} />
        )}
      </div>

      {/* Severity */}
      {isSerious && (
        <div style={{ fontSize: 8, fontWeight: 700, color: '#cc3333', marginTop: 6 }}>
          ⚠️ {sev}
        </div>
      )}

      {/* Description (collapsed by default) */}
      {open && job.desc && (
        <div style={{ fontSize: 8, color: '#556', marginTop: 8, lineHeight: 1.5, borderTop: '1px solid #1a1a1a', paddingTop: 8 }}>
          {job.desc}
        </div>
      )}
      {open && job.emMatch?.name && (
        <div style={{ fontSize: 8, color: '#556', marginTop: 4, lineHeight: 1.5 }}>
          EM: {job.emMatch.name}
        </div>
      )}
    </div>
  );
}

// ── VicEmergency-only card (no VicRoads allocation yet) ──────────────────────
function EmOnlyCard({ inc }) {
  const sev = inc.severity || '';
  const isSerious = sev === 'Emergency Warning' || sev === 'Watch and Act';
  return (
    <div style={{ ...CARD_BASE, border: '1px solid #3a1a0a', borderLeft: '3px solid #cc5522', marginBottom: 8 }}>
      <div style={{ fontSize: 7, fontWeight: 700, color: '#cc5522', letterSpacing: '0.1em', marginBottom: 6 }}>
        🔮 POTENTIAL INCOMING — NO VicRoads YET
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: TXT }}>{inc.name || inc.cat}</div>
      {inc.suburb && <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>{inc.suburb}</div>}
      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
        <SourceBadge src="vicemergency" label="🚨 VicEmergency" detail={inc.cat} />
      </div>
      {(isSerious || sev) && (
        <div style={{ fontSize: 8, color: isSerious ? '#cc3333' : '#cc8822', marginTop: 6, fontWeight: isSerious ? 700 : 400 }}>
          {isSerious ? '⚠️ ' : ''}{sev}
        </div>
      )}
    </div>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────
function SectionLabel({ children, count, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', color: color || '#334',
      textTransform: 'uppercase', margin: '14px 0 8px', paddingBottom: 4,
      borderBottom: '1px solid #1a1a1a' }}>
      {children}
      {count != null && <span style={{ fontSize: 9, color: color || '#445', fontWeight: 400 }}>({count})</span>}
    </div>
  );
}

// ── Live panel — the real-time picture ───────────────────────────────────────
function LivePanel({ liveJobs, liveEm, metrics: m, vicEmMetrics: em, wazeMetrics: waze, events, wazeLagStats, lagStats }) {
  const now = Date.now();
  const confirmed   = liveJobs.filter(j => j.sources.length >= 2);
  const vrOnly      = liveJobs.filter(j => j.sources.length === 1);
  const crossEvents = events.filter(ev => ['CROSS_CONFIRMED','WAZE_LEAD','INFRA_CORR'].includes(ev.type)).length;

  // Stat card values
  const vrJobCount = m?.activeJobs ?? '—';
  const emCount    = em?.activeIncidents ?? '—';
  const wazeCount  = waze?.activeAlerts ?? '—';
  const vrColor    = m?.activeJobs > 25 ? '#cc3333' : m?.activeJobs > 10 ? '#cc8822' : '#4a8a4a';
  const emColor    = em?.activeIncidents > 30 ? '#cc3333' : em?.activeIncidents > 15 ? '#cc8822' : '#4a8a4a';
  const wazeColor  = waze?.activeAlerts > 150 ? '#cc3333' : waze?.activeAlerts > 80 ? '#cc8822' : TXT;

  const vrSub  = m ? (m.activeJobs === 0 ? 'no active allocations' : m.activeJobs <= 5 ? 'quiet' : m.activeJobs <= 15 ? 'normal' : 'elevated') : null;
  const emSub  = em ? (em.activeIncidents === 0 ? 'quiet statewide' : em.activeIncidents <= 10 ? 'normal' : 'elevated') : null;
  const wazeSub = waze ? (waze.activeAlerts <= 30 ? 'low traffic reports' : waze.activeAlerts <= 80 ? 'normal metro' : 'elevated reports') : null;

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <StatCard label="VicRoads" value={vrJobCount} color={typeof vrJobCount === 'number' ? vrColor : null}
          sub={vrSub} dim={vrJobCount === '—'} />
        <StatCard label="VicEmerg" value={emCount} color={typeof emCount === 'number' ? emColor : null}
          sub={emSub} dim={emCount === '—'} />
        <StatCard label="Waze" value={wazeCount} color={typeof wazeCount === 'number' ? wazeColor : null}
          sub={wazeSub} dim={wazeCount === '—'} />
        <StatCard label="Corr'd" value={crossEvents || '0'}
          color={crossEvents > 0 ? ACC : null} dim={!crossEvents}
          sub={crossEvents > 0 ? 'multi-source' : 'this session'} />
      </div>

      {/* Server health row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <div style={{ flex: 1, background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 4, padding: '8px 10px' }}>
          <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase' }}>VicRoads speed</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 3,
            color: !m?.ttfb ? '#334' : m.ttfb < 300 ? '#4a8a4a' : m.ttfb < 600 ? '#cc8822' : '#cc3333' }}>
            {fmtMs(m?.ttfb)}
          </div>
          <div style={{ fontSize: 7, color: '#334', marginTop: 2 }}>avg {fmtMs(m?.avgTtfb)}</div>
        </div>
        <div style={{ flex: 1, background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 4, padding: '8px 10px' }}>
          <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Feed updated</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 3, color: m?.hashChanged ? ACC : '#334' }}>
            {m?.hashChanged ? 'just now' : m?.lastHashChangeTs ? fmtAge(Date.now() - m.lastHashChangeTs) + ' ago' : '—'}
          </div>
          <div style={{ fontSize: 7, color: '#334', marginTop: 2 }}>{m?.hashChangeCount ?? 0} updates this session</div>
        </div>
        {lagStats?.avg && (
          <div style={{ flex: 1, background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 4, padding: '8px 10px' }}>
            <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pager lead</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 3, color: '#4a8a4a' }}>
              {Math.round(lagStats.avg / 1000)}s
            </div>
            <div style={{ fontSize: 7, color: '#334', marginTop: 2 }}>pager before VicRoads</div>
          </div>
        )}
      </div>

      {/* Confirmed multi-source incidents */}
      {confirmed.length > 0 && (
        <>
          <SectionLabel count={confirmed.length} color="#cc8822">🔗 Multi-source confirmed</SectionLabel>
          {confirmed.map(j => <IncidentCard key={j.id} job={j} now={now} />)}
        </>
      )}

      {/* VicEmergency incidents not yet in VicRoads */}
      {liveEm.length > 0 && (
        <>
          <SectionLabel count={liveEm.length} color="#cc5522">🔮 VicEmergency — no allocation yet</SectionLabel>
          <div style={{ fontSize: 8, color: '#556', marginBottom: 8, lineHeight: 1.5 }}>
            These incidents are in the VicEmergency feed but VicRoads hasn't created an allocation yet. Could be incoming work.
          </div>
          {liveEm.map(inc => <EmOnlyCard key={inc.id} inc={inc} />)}
        </>
      )}

      {/* VicRoads-only jobs */}
      {vrOnly.length > 0 && (
        <>
          <SectionLabel count={vrOnly.length}>🚦 VicRoads allocations</SectionLabel>
          {vrOnly.map(j => <IncidentCard key={j.id} job={j} now={now} />)}
        </>
      )}

      {liveJobs.length === 0 && liveEm.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 9, color: '#334', lineHeight: 2 }}>
          {m ? 'No active incidents on any feed.' : 'Waiting for first poll…'}
          {m && <><br /><span style={{ fontSize: 8, color: '#223' }}>Last checked {fmtTime(m.ts)}</span></>}
        </div>
      )}
    </div>
  );
}

// ── Compact metric card (for VicRoads/VicEmergency/Waze technical panels) ─────
function MetricCard({ label, value, accent, now: nowText, watch }) {
  return (
    <div style={{ ...CARD_BASE, border: '1px solid #1a1a1a', marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 8, color: MUT, letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
          {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: accent || TXT, textAlign: 'right' }}>
          {value ?? '—'}
        </span>
      </div>
      {nowText && <div style={{ fontSize: 8, color: '#5a7a5a', marginTop: 4, lineHeight: 1.5 }}>{nowText}</div>}
      {watch && <div style={{ fontSize: 7, color: '#3a4a3a', marginTop: 2, lineHeight: 1.4, fontStyle: 'italic' }}>If it changes: {watch}</div>}
    </div>
  );
}

// ── Interpretation functions ──────────────────────────────────────────────────
function interpretTtfb(ttfb) {
  if (ttfb == null) return null;
  if (ttfb < 150)  return 'Server answered almost instantly.';
  if (ttfb < 300)  return 'Normal response speed. Server is healthy.';
  if (ttfb < 600)  return 'Slightly slower than ideal — possible load.';
  if (ttfb < 1500) return 'Slow. Server is under load right now.';
  return 'Very slow — possible major incident driving heavy API traffic.';
}
function interpretCache(s) {
  if (!s) return 'No cache info in this response.';
  if (/HIT/i.test(s))     return 'Served from CDN cache — origin not queried. Data may be slightly older.';
  if (/MISS/i.test(s))    return 'Origin server queried directly — freshest possible data.';
  if (/EXPIRED/i.test(s)) return 'Cached copy expired — fresh copy fetched.';
  if (/BYPASS/i.test(s))  return 'Cache bypassed — origin queried directly.';
  return `Status: ${s}`;
}
function interpretAge(age) {
  if (age == null) return 'Cache age not reported.';
  if (age === 0)   return 'Just fetched from origin. Maximum freshness.';
  if (age < 30)    return `Only ${age}s old when served — very fresh.`;
  if (age < 60)    return `${age}s old when served — within normal cache window.`;
  if (age < 120)   return `${age}s old — getting toward stale end.`;
  return `${age}s old — CDN is serving stale content.`;
}
function interpretHash(changed, hash) {
  if (!hash) return 'No hash yet.';
  return changed ? 'Content changed — real update just pushed.' : 'No change since last poll.';
}
function interpretCadence(ms) {
  if (!ms) return 'Building estimate — need more hash changes.';
  const s = Math.round(ms / 1000);
  if (s < 30)  return `Updating every ~${s}s — very active.`;
  if (s < 90)  return `Updates every ~${s}s on average.`;
  if (s < 180) return `Updates every ~${s}s — moderate activity.`;
  return `Updates every ~${s}s — quiet period or slow pipeline.`;
}
function interpretLag(avgMs) {
  if (avgMs == null) return 'Waiting for matched pager + VicRoads allocation.';
  const s = Math.round(avgMs / 1000);
  if (s < 30)  return `Pager fires ${s}s before VicRoads on avg — fast pipeline.`;
  if (s < 90)  return `~${s}s advance notice from pager before VicRoads publishes.`;
  if (s < 180) return `${s}s window — pager gives meaningful advance warning.`;
  return `${s}s lag — VicRoads pipeline is significantly behind the pager.`;
}
function interpretEmActiveIncs(count) {
  if (count == null) return null;
  if (count === 0)  return 'No active incidents statewide.';
  if (count <= 5)   return `${count} active — very quiet.`;
  if (count <= 20)  return `${count} active — normal background activity.`;
  if (count <= 40)  return `${count} active — elevated, multiple concurrent events.`;
  return `${count} active — high. Major or widespread event.`;
}
function interpretWazeAlerts(count) {
  if (count == null) return null;
  if (count === 0)  return 'No alerts in Melbourne metro right now.';
  if (count <= 30)  return `${count} alerts — relatively quiet.`;
  if (count <= 80)  return `${count} alerts — normal busy level.`;
  if (count <= 150) return `${count} alerts — elevated road activity.`;
  return `${count} alerts — very high. Major incident or event.`;
}
function interpretWazeLag(avgMs) {
  if (avgMs == null) return 'Waiting for Waze alert + VicRoads allocation at same location.';
  const s = Math.round(avgMs / 1000);
  if (s < 60)  return `Waze reports ${s}s before VicRoads on avg — strong lead signal.`;
  if (s < 180) return `Waze leads VicRoads by ~${s}s on average.`;
  return `Waze leads VicRoads by ~${Math.round(s/60)}min — very early indicator.`;
}

// ── VicRoads technical panel ──────────────────────────────────────────────────
function VicRoadsPanel({ m, jobSignals, lagStats }) {
  const ttfbColor = !m?.ttfb ? null : m.ttfb < 300 ? '#4a8a4a' : m.ttfb < 600 ? '#cc8822' : '#cc3333';
  const ageColor  = !m?.age ? null : m.age < 60 ? null : m.age < 120 ? '#cc8822' : '#cc3333';
  const cacheOk   = m?.cacheStatus ? /HIT/i.test(m.cacheStatus) : null;

  if (!m) return <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 9, color: '#334' }}>Waiting for first poll…</div>;

  return (
    <>
      <SectionLabel>Server Speed</SectionLabel>
      <MetricCard label="TTFB" value={fmtMs(m.ttfb)} accent={ttfbColor} now={interpretTtfb(m.ttfb)}
        watch="Spike just before new jobs = VicRoads processing a surge." />
      <MetricCard label="Avg TTFB" value={fmtMs(m.avgTtfb)}
        now={m.avgTtfb ? `Session baseline. Anything well above ${fmtMs(m.avgTtfb)} is abnormal.` : 'Still measuring.'}
        watch="Rising average = infrastructure degrading across the session." />
      <MetricCard label="Transfer time" value={fmtMs(m.transferTime)}
        now="Time to download payload after server started responding."
        watch="Increases = more active jobs or longer descriptions." />

      <SectionLabel>Cache & Freshness</SectionLabel>
      <MetricCard label="Cache status" value={m.cacheStatus || '—'}
        accent={cacheOk === true ? '#4a8a4a' : cacheOk === false ? '#cc8822' : null}
        now={interpretCache(m.cacheStatus)}
        watch="HIT → MISS = cache purged, fresh data incoming." />
      <MetricCard label="Data age" value={m.age != null ? `${m.age}s` : '—'} accent={ageColor}
        now={interpretAge(m.age)}
        watch="Rising = CDN not refreshing. Drop to 0 = just fetched." />
      <MetricCard label="Cache window" value={m.maxAge != null ? `${m.maxAge}s` : '—'}
        now={m.maxAge ? `CDN refreshes every ${m.maxAge}s max.` : 'Not specified by VicRoads.'}
        watch="Drops = VicRoads asking for more frequent refreshes." />

      <SectionLabel>Content</SectionLabel>
      <MetricCard label="Content changed" value={m.bodyHash ? (m.hashChanged ? 'YES ↑' : 'No change') : '—'}
        accent={m.hashChanged ? ACC : null}
        now={interpretHash(m.hashChanged, m.bodyHash)}
        watch="The most reliable signal of a real VicRoads update." />
      <MetricCard label="Update rhythm" value={m.cadenceMs ? `~${Math.round(m.cadenceMs / 1000)}s` : 'building…'}
        now={interpretCadence(m.cadenceMs)}
        watch="Shortening = high-activity mode. Lengthening = quieting down." />
      <MetricCard label="Response size"
        value={m.uncompressedSize ? `${(m.uncompressedSize / 1024).toFixed(1)} KB` : '—'}
        now="Larger = more active jobs or longer descriptions."
        watch="Sudden jump without hash change is unusual." />
      <MetricCard label="Encoding" value={m.encoding || '—'}
        now={m.encoding === 'none' || !m.encoding ? 'No compression.' : m.encoding.includes('br') ? 'Brotli — modern efficient compression.' : 'Gzip compression.'}
        watch="Change = CDN reconfigured — infrastructure signal." />
      <MetricCard label="Compression"
        value={m.compressionRatio != null ? `${Math.round(m.compressionRatio * 100)}% of raw` : '—'}
        now={m.compressionRatio != null ? `Compressed to ${Math.round(m.compressionRatio * 100)}% — ${m.compressionRatio < 0.3 ? 'excellent' : m.compressionRatio < 0.5 ? 'good' : 'poor'}.` : null}
        watch="Efficiency drop = content structure changed, possibly new fields." />

      <SectionLabel>Infrastructure</SectionLabel>
      <MetricCard label="ETag" value={m.etag?.slice(0, 14) || '—'}
        now={m.etag ? 'Content fingerprint. Value change = content changed.' : 'No ETag in this response.'}
        watch="Format change (not just value) = VicRoads changed backend platform." />
      <MetricCard label="Trace ID" value={m.traceId?.slice(0, 14) || '—'}
        now={m.traceId ? 'VicRoads internal tracking for this request.' : 'No trace ID — CDN may be fully caching.'}
        watch="Format change = backend deployment. Disappears = CDN fully handling." />
      <MetricCard label="Via" value={m.via?.slice(0, 22) || '—'}
        now={m.via ? `Routed through: ${m.via}` : 'No proxy chain reported.'}
        watch="Changes here = routing or CDN configuration changed." />

      <SectionLabel>Active Jobs</SectionLabel>
      <MetricCard label="On feed now" value={m.activeJobs ?? '—'}
        now={m.activeJobs === 0 ? 'No active allocations.' : m.activeJobs <= 10 ? `${m.activeJobs} jobs — quiet.` : m.activeJobs <= 20 ? `${m.activeJobs} jobs — normal.` : `${m.activeJobs} jobs — elevated.`}
        watch="Sudden jump = surge. Sudden drop = mass clearance." />
      <MetricCard label="Ghost jobs (2h+)" value={jobSignals?.ghosts.length || 0}
        now={jobSignals?.ghosts.length ? `${jobSignals.ghosts.length} jobs open 2h+ — complex scene or data issue.` : 'No unusually long-running jobs.'}
        watch="Accumulation = VicRoads clearance pipeline backed up." />

      {lagStats?.samples.length > 0 && (
        <>
          <SectionLabel>Publication Lag (Pager → VicRoads)</SectionLabel>
          <MetricCard label="Avg lag" value={lagStats.avg ? `${Math.round(lagStats.avg / 1000)}s` : '—'}
            accent={lagStats.avg < 60000 ? '#4a8a4a' : lagStats.avg < 180000 ? '#cc8822' : '#cc3333'}
            now={interpretLag(lagStats.avg)}
            watch="Widens = VicRoads pipeline slowing or under load." />
          <MetricCard label="Best" value={lagStats.min ? `${Math.round(lagStats.min / 1000)}s` : '—'}
            now="Fastest pager-to-VicRoads observed this session." />
          <MetricCard label="Worst" value={lagStats.max ? `${Math.round(lagStats.max / 1000)}s` : '—'}
            now="Slowest observed — some incident types route through a slower pipeline." />
          <MetricCard label="Samples" value={lagStats.samples.length}
            now={`${lagStats.samples.length} matched pair${lagStats.samples.length > 1 ? 's' : ''} this session.`} />
        </>
      )}
    </>
  );
}

// ── VicEmergency technical panel ──────────────────────────────────────────────
function VicEmPanel({ m }) {
  if (!m) return <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 9, color: '#334' }}>Waiting for first VicEmergency poll… (every 60s)</div>;

  const ttfbColor = !m.ttfb ? null : m.ttfb < 300 ? '#4a8a4a' : m.ttfb < 600 ? '#cc8822' : '#cc3333';
  const catCounts = m.catCounts || {};
  const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <>
      <SectionLabel>Incident Activity</SectionLabel>
      <MetricCard label="Active incidents (statewide)" value={m.activeIncidents ?? '—'}
        now={interpretEmActiveIncs(m.activeIncidents)}
        watch="Surge = Victoria dealing with multiple concurrent events. High counts often precede VicRoads activity." />
      {topCats.length > 0 && (
        <MetricCard label="Active types"
          value={topCats.map(([k, v]) => `${k.slice(0,5)}:${v}`).join(' ')}
          now={`Most active: ${topCats.map(([k, v]) => `${k} (${v})`).join(', ')}`}
          watch="CRASH or HAZMAT appearing = road-related, watch for VicRoads allocation to follow." />
      )}

      <SectionLabel>Feed Quality</SectionLabel>
      <MetricCard label="Content changed" value={m.bodyHash ? (m.hashChanged ? 'YES ↑' : 'No change') : '—'}
        accent={m.hashChanged ? ACC : null}
        now={interpretHash(m.hashChanged, m.bodyHash)}
        watch="No change during high activity = VicEmergency may have a pipeline delay." />
      <MetricCard label="TTFB" value={fmtMs(m.ttfb)} accent={ttfbColor}
        now={interpretTtfb(m.ttfb)}
        watch="Spike here AND on VicRoads simultaneously = shared infrastructure event." />
      <MetricCard label="Avg TTFB" value={fmtMs(m.avgTtfb)}
        now={m.avgTtfb ? `Compare to VicRoads avg (${fmtMs(m.avgTtfb)}) to detect shared infra.` : 'Still building baseline.'}
        watch="If VicRoads and VicEmergency track each other, they share infrastructure." />
      <MetricCard label="Cache status" value={m.cacheStatus || '—'}
        now={interpretCache(m.cacheStatus)} />
      <MetricCard label="Data age" value={m.age != null ? `${m.age}s` : '—'}
        now={interpretAge(m.age)}
        watch="High age during active incident = CDN not keeping up — what you see may be outdated." />
      <MetricCard label="Response size" value={m.uncompressedSize ? `${(m.uncompressedSize / 1024).toFixed(1)} KB` : '—'}
        now="Track this during major events — grows as more incidents are added." />
    </>
  );
}

// ── Waze technical panel ──────────────────────────────────────────────────────
function WazePanel({ m, wazeLagStats }) {
  if (!m) return <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 9, color: '#334' }}>Waiting for first Waze poll… (every 120s)</div>;

  const typeCounts = m.typeCounts || {};
  const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const budgetPct = (m.budgetCount && m.budgetMax) ? Math.round((m.budgetCount / m.budgetMax) * 100) : null;

  return (
    <>
      <SectionLabel>Alert Activity (Melbourne Metro)</SectionLabel>
      <MetricCard label="Active alerts" value={m.activeAlerts ?? '—'}
        now={interpretWazeAlerts(m.activeAlerts)}
        watch="Spike in ACCIDENT/HAZARD types before VicRoads allocation = strong lead signal." />
      {topTypes.length > 0 && (
        <MetricCard label="Type breakdown"
          value={topTypes.map(([k, v]) => `${k.slice(0,5)}:${v}`).join(' ')}
          now={`Most reported: ${topTypes.map(([k, v]) => `${k} (${v})`).join(', ')}`}
          watch="Shift toward ACCIDENT/HAZARD = crowd-reported road incidents arriving before official data." />
      )}

      <SectionLabel>Budget & Freshness</SectionLabel>
      <MetricCard label="API budget"
        value={m.budgetExhausted ? 'EXHAUSTED' : m.budgetCount != null ? `${m.budgetCount}/${m.budgetMax}` : 'not configured'}
        accent={m.budgetExhausted ? '#cc3333' : budgetPct > 80 ? '#cc8822' : null}
        now={m.budgetExhausted
          ? `Budget exhausted — data is from last cached snapshot.`
          : m.budgetCount != null ? `${(m.budgetMax || 0) - (m.budgetCount || 0)} requests left this month.`
          : 'Data served from Supabase cache.'}
        watch="Exhausted = all Waze data is stale snapshot. Correlations become less reliable." />
      {m.cachedAt && (
        <MetricCard label="Snapshot age"
          value={`${Math.round((Date.now() - new Date(m.cachedAt).getTime()) / 60000)}min`}
          now="When the Waze cache was last refreshed by the background job."
          watch="Past 30min during busy period = Waze data significantly stale." />
      )}

      {wazeLagStats?.samples.length > 0 && (
        <>
          <SectionLabel>Waze Lead Time over VicRoads</SectionLabel>
          <MetricCard label="Avg lead" value={wazeLagStats.avg ? `${Math.round(wazeLagStats.avg / 1000)}s` : '—'}
            accent={wazeLagStats.avg < 120000 ? '#4a8a4a' : '#cc8822'}
            now={interpretWazeLag(wazeLagStats.avg)}
            watch="Grows = Waze becoming more valuable as a lead indicator." />
          <MetricCard label="Fastest lead" value={wazeLagStats.min ? `${Math.round(wazeLagStats.min / 1000)}s` : '—'}
            now="Quickest Waze has beaten VicRoads this session." />
          <MetricCard label="Samples" value={wazeLagStats.samples.length}
            now={`${wazeLagStats.samples.length} matched Waze+VicRoads pair${wazeLagStats.samples.length > 1 ? 's' : ''}.`} />
        </>
      )}
    </>
  );
}

// ── Event stream row ──────────────────────────────────────────────────────────
function EventRow({ ev }) {
  const [open, setOpen] = useState(false);
  const s = SEV[ev.severity] || SEV.info;
  const m = evMeta(ev.type);

  return (
    <div onClick={() => setOpen(o => !o)}
      style={{ background: s.bg, border: `1px solid ${s.border}`, borderLeft: `3px solid ${s.dot}`,
        borderRadius: 2, marginBottom: 3, padding: '6px 10px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, flexShrink: 0 }}>{m.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: s.dot,
              textTransform: 'uppercase', flexShrink: 0 }}>{m.label}</span>
            <span style={{ fontSize: 9, color: TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ev.title}
            </span>
          </div>
          <div style={{ fontSize: 8, color: MUT, marginTop: 2, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: open ? 'normal' : 'nowrap' }}>
            {ev.detail}
          </div>
        </div>
        <span style={{ fontSize: 8, color: '#333', flexShrink: 0, fontFamily: "'IBM Plex Mono',monospace" }}>
          {fmtTime(ev.ts)}
        </span>
      </div>
      {open && ev.data && Object.keys(ev.data).length > 0 && (
        <pre style={{ margin: '6px 0 0', fontSize: 8, color: '#556', background: '#0a0a0a',
          border: '1px solid #1a1a1a', borderRadius: 2, padding: 6, overflowX: 'auto',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {JSON.stringify(ev.data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Filter definitions ────────────────────────────────────────────────────────
const FILTERS = [
  { key: 'all',     label: 'All' },
  { key: 'vicroads',label: '🚦 VicRoads',
    types: ['HASH_CHANGED','CACHE_HIT','CACHE_MISS','HIGH_CDN_AGE','LATENCY_SPIKE','ENCODING_CHANGE','API_WARNING','RATE_LIMIT_LOW','FEED_ERROR','FEED_RECOVERED','SCHEMA_CHANGE','NEW_JOB','JOB_CLEARED','BATCH_FLUSH','SURGE','JOB_FLICKERED','COORD_DRIFT','DESC_ESCALATION','GHOST_JOB','DUPLICATE_JOBS','PUBLICATION_LAG','POLL_FAILED'] },
  { key: 'vicem',   label: '🚨 VicEmerg',
    types: ['VIC_EM_NEW','VIC_EM_CLEARED','VIC_EM_UPDATED','VIC_EM_ESCALATED','VIC_EM_SURGE','VIC_EM_ERROR','VIC_EM_RECOVERED','VIC_EM_LATENCY'] },
  { key: 'waze',    label: '🗺️ Waze',
    types: ['WAZE_NEW','WAZE_CLEARED','WAZE_SURGE','WAZE_ERROR','WAZE_RECOVERED','WAZE_BUDGET_EXHAUSTED'] },
  { key: 'cross',   label: '🔗 Cross-Source',
    types: ['CROSS_CONFIRMED','WAZE_LEAD','INFRA_CORR'] },
  { key: 'alert',   label: '🔴 Alerts', sev: 'alert' },
];

function SourceTab({ id, label, active, onClick }) {
  return (
    <button onClick={() => onClick(id)}
      style={{ fontSize: 8, fontWeight: 700, padding: '4px 8px', borderRadius: 2, cursor: 'pointer',
        border: `1px solid ${active ? ACC + '66' : '#2a2a2a'}`,
        background: active ? ACC + '22' : '#0d0d0d',
        color: active ? ACC : MUT, letterSpacing: '0.05em' }}>
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SignalsTab() {
  const { events, metrics: m, jobSignals, lagStats,
    vicEmMetrics, wazeMetrics, wazeLagStats,
    liveJobs, liveEm } = useSignals(true);

  const [filter, setFilter] = useState('all');
  const [source, setSource] = useState('live');
  const [paused, setPaused] = useState(false);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!paused && streamRef.current) streamRef.current.scrollTop = 0;
  }, [events.length, paused]);

  const activeFilter = FILTERS.find(f => f.key === filter) || FILTERS[0];
  const visible = events.filter(ev => {
    if (activeFilter.key === 'all') return true;
    if (activeFilter.sev)   return ev.severity === activeFilter.sev;
    return activeFilter.types?.includes(ev.type);
  });

  const crossCount = events.filter(ev => ['CROSS_CONFIRMED','WAZE_LEAD','INFRA_CORR'].includes(ev.type)).length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: "'IBM Plex Mono',monospace" }}>

      {/* Header */}
      <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid ' + BRD, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>📡 Signals</div>
            <div style={{ fontSize: 8, color: MUT, marginTop: 1 }}>
              VicRoads 30s · VicEmergency 60s · Waze 120s
              {m && <span style={{ color: '#334', marginLeft: 8 }}>#{m.pollCount} polls</span>}
              {crossCount > 0 && <span style={{ color: ACC + 'aa', marginLeft: 8 }}>🔗 {crossCount} cross-source</span>}
              {m?.ts && <span style={{ color: '#334', marginLeft: 8 }}>{fmtTime(m.ts)}</span>}
            </div>
          </div>
          <button onClick={() => setPaused(p => !p)}
            style={{ fontSize: 8, fontWeight: 700, padding: '4px 8px', borderRadius: 2, cursor: 'pointer',
              background: paused ? '#cc882222' : '#0d0d0d',
              border: `1px solid ${paused ? '#cc8822' : '#2a2a2a'}`,
              color: paused ? '#cc8822' : MUT }}>
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ── Left: dashboard panel ── */}
        <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid ' + BRD,
          overflowY: 'auto', padding: '10px 14px' }}>

          {/* Source selector */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
            <SourceTab id="live"        label="📍 Live"        active={source === 'live'}        onClick={setSource} />
            <SourceTab id="vicroads"    label="🚦 VicRoads"    active={source === 'vicroads'}    onClick={setSource} />
            <SourceTab id="vicemergency" label="🚨 VicEmerg"   active={source === 'vicemergency'} onClick={setSource} />
            <SourceTab id="waze"        label="🗺️ Waze"         active={source === 'waze'}        onClick={setSource} />
          </div>

          {source === 'live' && (
            <LivePanel
              liveJobs={liveJobs} liveEm={liveEm}
              metrics={m} vicEmMetrics={vicEmMetrics} wazeMetrics={wazeMetrics}
              events={events} wazeLagStats={wazeLagStats} lagStats={lagStats}
            />
          )}
          {source === 'vicroads'     && <VicRoadsPanel m={m} jobSignals={jobSignals} lagStats={lagStats} />}
          {source === 'vicemergency' && <VicEmPanel m={vicEmMetrics} />}
          {source === 'waze'         && <WazePanel m={wazeMetrics} wazeLagStats={wazeLagStats} />}
        </div>

        {/* ── Right: event stream ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Filter bar */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid ' + BRD, flexShrink: 0,
            display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{ flexShrink: 0, fontSize: 8, fontWeight: 700, letterSpacing: '0.06em',
                  padding: '3px 8px', borderRadius: 2, cursor: 'pointer',
                  background: filter === f.key ? ACC + '22' : '#0d0d0d',
                  border: `1px solid ${filter === f.key ? ACC + '66' : '#2a2a2a'}`,
                  color: filter === f.key ? ACC : MUT }}>
                {f.label}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 8, color: '#334', flexShrink: 0, alignSelf: 'center' }}>
              {visible.length}
            </span>
          </div>

          {/* Stream */}
          <div ref={streamRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
            {events.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 0', fontSize: 9, color: '#334', lineHeight: 2 }}>
                Monitoring VicRoads · VicEmergency · Waze<br />
                <span style={{ fontSize: 8, color: '#223' }}>First signals within 30s. Cross-source events appear when the same incident is seen in multiple feeds.</span>
              </div>
            )}
            {visible.map(ev => <EventRow key={ev.id} ev={ev} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
