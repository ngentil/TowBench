import React, { useState, useRef, useEffect } from 'react';
import { ACC, MUT, BRD, TXT } from '../../lib/styles';
import { useSignals } from '../../hooks/useSignals';

// ── Severity colours ──────────────────────────────────────────────────────────
const SEV = {
  info:  { dot: '#4a8a4a', bg: '#0a120a', border: '#1e2e1e', text: '#88bb88' },
  warn:  { dot: '#cc8822', bg: '#121008', border: '#2e2408', text: '#ccaa44' },
  alert: { dot: '#cc3333', bg: '#120808', border: '#2e1010', text: '#dd5555' },
};

const EV = {
  // VicRoads protocol
  HASH_CHANGED:    { icon: '🔄', label: 'Feed Updated'        },
  CACHE_HIT:       { icon: '💾', label: 'Cache Hit'           },
  CACHE_MISS:      { icon: '🔍', label: 'Cache Miss'          },
  HIGH_CDN_AGE:    { icon: '🕰',  label: 'CDN Stale'          },
  LATENCY_SPIKE:   { icon: '⏱',  label: 'Latency Spike'      },
  ENCODING_CHANGE: { icon: '🔀', label: 'Encoding Changed'    },
  API_WARNING:     { icon: '⚠️', label: 'API Warning'         },
  RATE_LIMIT_LOW:  { icon: '🚦', label: 'Rate Limit Low'      },
  FEED_ERROR:      { icon: '🔴', label: 'Feed Error'          },
  FEED_RECOVERED:  { icon: '🟢', label: 'Feed Recovered'      },
  SCHEMA_CHANGE:   { icon: '🔎', label: 'Schema Change'       },
  // VicRoads jobs
  NEW_JOB:         { icon: '🆕', label: 'New Job'             },
  JOB_CLEARED:     { icon: '✅', label: 'Cleared'             },
  BATCH_FLUSH:     { icon: '⚡', label: 'Batch Flush'         },
  SURGE:           { icon: '📈', label: 'Surge'               },
  JOB_FLICKERED:   { icon: '👻', label: 'Flickering'          },
  COORD_DRIFT:     { icon: '🗺️', label: 'Coord Drift'         },
  DESC_ESCALATION: { icon: '⬆️', label: 'Escalation'          },
  GHOST_JOB:       { icon: '🕰',  label: 'Ghost Job'          },
  DUPLICATE_JOBS:  { icon: '♊', label: 'Duplicate'           },
  PUBLICATION_LAG: { icon: '📡', label: 'Pub Lag'             },
  POLL_FAILED:     { icon: '🚫', label: 'Poll Failed'         },
  // VicEmergency
  VIC_EM_NEW:       { icon: '🚨', label: 'EM Incident'        },
  VIC_EM_CLEARED:   { icon: '✅', label: 'EM Cleared'         },
  VIC_EM_UPDATED:   { icon: '🔄', label: 'EM Updated'         },
  VIC_EM_ESCALATED: { icon: '⬆️', label: 'EM Escalated'       },
  VIC_EM_SURGE:     { icon: '📈', label: 'EM Surge'           },
  VIC_EM_ERROR:     { icon: '🔴', label: 'EM Error'           },
  VIC_EM_RECOVERED: { icon: '🟢', label: 'EM Recovered'       },
  VIC_EM_LATENCY:   { icon: '⏱',  label: 'EM Latency'        },
  // Waze
  WAZE_NEW:              { icon: '🗺️', label: 'Waze Alert'    },
  WAZE_CLEARED:          { icon: '✅', label: 'Waze Cleared'   },
  WAZE_SURGE:            { icon: '📈', label: 'Waze Surge'     },
  WAZE_ERROR:            { icon: '🔴', label: 'Waze Error'     },
  WAZE_RECOVERED:        { icon: '🟢', label: 'Waze Recovered' },
  WAZE_BUDGET_EXHAUSTED: { icon: '💸', label: 'Budget Gone'    },
  // Cross-source
  CROSS_CONFIRMED: { icon: '🔗', label: 'Multi-Source'        },
  WAZE_LEAD:       { icon: '⚡', label: 'Waze Lead'           },
  INFRA_CORR:      { icon: '🏗️', label: 'Infra Spike'        },
};

function evMeta(type) { return EV[type] || { icon: '·', label: type }; }

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
function fmtMs(ms) {
  if (ms == null) return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}
function fmtBytes(b) {
  if (!b) return null;
  if (b > 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  if (b > 1024)    return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, accent, now: nowText, watch }) {
  return (
    <div style={{ borderBottom: '1px solid #111', padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 8, color: MUT, letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
          {label}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent || TXT,
          fontFamily: "'IBM Plex Mono',monospace", textAlign: 'right' }}>
          {value ?? '—'}
        </span>
      </div>
      {nowText && (
        <div style={{ fontSize: 8, color: '#5a7a5a', marginTop: 3, lineHeight: 1.5 }}>{nowText}</div>
      )}
      {watch && (
        <div style={{ fontSize: 7, color: '#3a4a3a', marginTop: 2, lineHeight: 1.4, fontStyle: 'italic' }}>
          If it changes: {watch}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: '#334',
      textTransform: 'uppercase', margin: '14px 0 4px', paddingBottom: 4,
      borderBottom: '1px solid #1a1a1a' }}>
      {children}
    </div>
  );
}

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

// ── Interpretation functions — VicRoads ───────────────────────────────────────
function interpretTtfb(ttfb) {
  if (ttfb == null) return null;
  if (ttfb < 150)  return 'Server answered almost instantly. Very healthy.';
  if (ttfb < 300)  return 'Normal response speed. VicRoads server is healthy.';
  if (ttfb < 600)  return 'Slightly slower than ideal — could be routine load.';
  if (ttfb < 1500) return 'Slow. VicRoads server is under load right now.';
  return 'Very slow. Something is wrong on VicRoads\'s end — possibly a major incident driving heavy API traffic.';
}
function interpretCache(status) {
  if (!status) return 'No cache information in this response.';
  if (/HIT/i.test(status))     return 'VicRoads served this from their CDN cache — origin not queried. Good for performance, data may be slightly older.';
  if (/MISS/i.test(status))    return 'VicRoads\'s origin server was queried directly. You\'re getting the freshest possible data.';
  if (/EXPIRED/i.test(status)) return 'Cached copy had expired — a fresh copy was fetched from origin.';
  if (/BYPASS/i.test(status))  return 'Cache was bypassed — origin queried directly.';
  return `Cache status: ${status}`;
}
function interpretAge(age) {
  if (age == null) return 'Unknown — response didn\'t include cache age information.';
  if (age === 0)   return 'Brand new response — just fetched from the origin. Maximum freshness.';
  if (age < 30)    return `Only ${age}s old when served. Very fresh.`;
  if (age < 60)    return `Data was ${age}s old when served — within the normal cache window.`;
  if (age < 120)   return `Data was ${age}s old when served — getting toward the stale end.`;
  return `Data was already ${age}s old — CDN is serving stale content. May not reflect current reality.`;
}
function interpretMaxAge(maxAge) {
  if (maxAge == null) return 'VicRoads hasn\'t specified how long to cache this data.';
  return `VicRoads is telling CDN nodes to cache this data for up to ${maxAge} seconds before re-fetching.`;
}
function interpretHash(changed, hash) {
  if (!hash) return 'No hash available yet.';
  if (changed) return 'Content changed since the last poll — VicRoads just pushed a real update.';
  return 'Content is identical to the last poll — no changes since we last checked.';
}
function interpretCadence(ms) {
  if (!ms) return 'Still building a picture — need more polls with actual changes to estimate.';
  const s = Math.round(ms / 1000);
  if (s < 30)  return `VicRoads is updating roughly every ${s}s — very active feed.`;
  if (s < 90)  return `VicRoads updates approximately every ${s}s on average.`;
  if (s < 180) return `VicRoads is updating every ${s}s on average — moderate activity.`;
  return `VicRoads is only updating every ${s}s on average — quiet period or slow pipeline.`;
}
function interpretEncoding(enc) {
  if (!enc || enc === 'none') return 'No compression — data is sent as plain text.';
  if (/br/i.test(enc))   return 'Brotli compression — modern, efficient.';
  if (/gzip/i.test(enc)) return 'Gzip compression — standard. Data is compressed before sending.';
  return `Compressed using ${enc}.`;
}
function interpretRatio(ratio) {
  if (ratio == null) return 'Can\'t calculate — server didn\'t report compressed size.';
  const pct = Math.round(ratio * 100);
  if (pct < 15) return `Compressed to ${pct}% of its original size — very efficient.`;
  if (pct < 30) return `Compressed to ${pct}% — good compression. Normal for JSON with many similar records.`;
  if (pct < 50) return `Compressed to ${pct}% — moderate compression.`;
  return `Compressed to ${pct}% — poor compression. Content may have changed structure.`;
}
function interpretBodySize(bytes) {
  if (!bytes) return null;
  return `Response is ${(bytes / 1024).toFixed(1)} KB. Larger than usual means more active jobs or longer descriptions.`;
}
function interpretLag(avgMs) {
  if (avgMs == null) return 'No matches yet — waiting for a pager + VicRoads allocation for the same job.';
  const s = Math.round(avgMs / 1000);
  if (s < 30)  return `VicRoads publishes just ${s}s after the pager fires. Very fast pipeline.`;
  if (s < 90)  return `VicRoads typically publishes about ${s}s after the pager — a ${s}s head start.`;
  if (s < 180) return `Average lag is ${s}s — a meaningful window. Pager gives ${s}s advance notice.`;
  return `Average lag is ${s}s — VicRoads's pipeline is significantly behind the pager.`;
}
function interpretActiveJobs(count) {
  if (count == null) return null;
  if (count === 0)  return 'No active allocations on the feed right now.';
  if (count <= 5)   return `${count} active job${count > 1 ? 's' : ''} on the feed — quiet period.`;
  if (count <= 15)  return `${count} active jobs — normal activity level.`;
  if (count <= 25)  return `${count} active jobs — elevated. Busy period.`;
  return `${count} active jobs — high load. Could indicate a major event or peak period.`;
}

// ── Interpretation functions — VicEmergency ───────────────────────────────────
function interpretEmTtfb(ttfb) {
  if (ttfb == null) return null;
  if (ttfb < 200) return 'VicEmergency server responded quickly.';
  if (ttfb < 500) return 'Normal response speed for VicEmergency.';
  if (ttfb < 1200) return 'Slower than usual — VicEmergency server may be under load.';
  return 'Very slow. VicEmergency server is struggling — possible high-volume incident driving API traffic.';
}
function interpretEmActiveIncs(count) {
  if (count == null) return null;
  if (count === 0)  return 'No active incidents on the VicEmergency feed.';
  if (count <= 5)   return `${count} active incident${count > 1 ? 's' : ''} statewide — very quiet.`;
  if (count <= 20)  return `${count} active incidents — normal background activity for Victoria.`;
  if (count <= 40)  return `${count} active incidents — elevated. Multiple concurrent events.`;
  return `${count} active incidents — high. Major event, weather event, or widespread incident.`;
}
function interpretEmHash(changed, hash) {
  if (!hash) return 'No hash yet — waiting for first successful poll.';
  if (changed) return 'VicEmergency incident data changed since last check — new or resolved incidents.';
  return 'No changes to VicEmergency data since last check.';
}
function interpretEmAge(age) {
  if (age == null) return 'VicEmergency didn\'t include cache age in this response.';
  if (age === 0) return 'Brand new — fetched directly from the VicEmergency origin server.';
  if (age < 60)  return `Data was ${age}s old when served — fresh.`;
  return `Data was ${age}s old — VicEmergency CDN is serving a cached copy.`;
}

// ── Interpretation functions — Waze ───────────────────────────────────────────
function interpretWazeAlerts(count) {
  if (count == null) return null;
  if (count === 0)   return 'No Waze alerts in the Melbourne metro area right now.';
  if (count <= 30)   return `${count} Waze alerts in Melbourne — relatively quiet.`;
  if (count <= 80)   return `${count} Waze alerts — normal busy level for Melbourne.`;
  if (count <= 150)  return `${count} Waze alerts — elevated. Significant road activity.`;
  return `${count} Waze alerts — very high. Major incident or event driving crowd reports.`;
}
function interpretWazeBudget(count, max, exhausted) {
  if (exhausted) return `Budget exhausted (${count}/${max} used this month). Waze data is now served from the last cached snapshot — may be up to 10 minutes old.`;
  if (count == null) return 'Waze API is not configured with a budget-tracked key. Data comes from the Supabase cache.';
  const left = (max || 0) - (count || 0);
  if (left > 20) return `${left} requests remaining this month (${count}/${max} used). Budget is healthy.`;
  if (left > 5)  return `${left} requests remaining — getting low. Data may become stale near month end.`;
  return `Only ${left} requests left this month. Budget nearly exhausted.`;
}
function interpretWazeLag(avgMs) {
  if (avgMs == null) return 'No matched pairs yet — waiting for a Waze alert and VicRoads allocation at the same location.';
  const s = Math.round(avgMs / 1000);
  if (s < 60)   return `Waze reports incidents ${s}s before they appear in VicRoads on average — a useful lead signal.`;
  if (s < 180)  return `Waze leads VicRoads by about ${s}s on average. A meaningful window.`;
  if (s < 600)  return `Waze sees events ${s}s (${Math.round(s/60)}min) ahead of VicRoads — significant head start.`;
  return `Waze leads VicRoads by ${Math.round(s/60)} minutes on average. Waze is a very early indicator.`;
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
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em',
              color: s.dot, textTransform: 'uppercase', flexShrink: 0 }}>{m.label}</span>
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
  { key: 'all',       label: 'All' },
  { key: 'vicroads',  label: '🚦 VicRoads',
    types: ['HASH_CHANGED','CACHE_HIT','CACHE_MISS','HIGH_CDN_AGE','LATENCY_SPIKE','ENCODING_CHANGE','API_WARNING','RATE_LIMIT_LOW','FEED_ERROR','FEED_RECOVERED','SCHEMA_CHANGE','NEW_JOB','JOB_CLEARED','BATCH_FLUSH','SURGE','JOB_FLICKERED','COORD_DRIFT','DESC_ESCALATION','GHOST_JOB','DUPLICATE_JOBS','PUBLICATION_LAG','POLL_FAILED'] },
  { key: 'vicem',     label: '🚨 VicEmergency',
    types: ['VIC_EM_NEW','VIC_EM_CLEARED','VIC_EM_UPDATED','VIC_EM_ESCALATED','VIC_EM_SURGE','VIC_EM_ERROR','VIC_EM_RECOVERED','VIC_EM_LATENCY'] },
  { key: 'waze',      label: '🗺️ Waze',
    types: ['WAZE_NEW','WAZE_CLEARED','WAZE_SURGE','WAZE_ERROR','WAZE_RECOVERED','WAZE_BUDGET_EXHAUSTED'] },
  { key: 'cross',     label: '🔗 Cross-Source',
    types: ['CROSS_CONFIRMED','WAZE_LEAD','INFRA_CORR'] },
  { key: 'lag',       label: 'Lag',
    types: ['PUBLICATION_LAG','WAZE_LEAD'] },
  { key: 'alert',     label: '🔴 Alerts', sev: 'alert' },
];

// ── VicRoads metrics panel ────────────────────────────────────────────────────
function VicRoadsPanel({ m, jobSignals, lagStats }) {
  const cacheOk   = m?.cacheStatus ? /HIT/i.test(m.cacheStatus) : null;
  const ttfbColor = !m?.ttfb ? null : m.ttfb < 300 ? '#4a8a4a' : m.ttfb < 600 ? '#cc8822' : '#cc3333';
  const ageColor  = !m?.age ? null : m.age < 60 ? null : m.age < 120 ? '#cc8822' : '#cc3333';

  return (
    <>
      <SectionLabel>Server Speed</SectionLabel>
      <MetricCard label="Response time (TTFB)" value={fmtMs(m?.ttfb)} accent={ttfbColor}
        now={interpretTtfb(m?.ttfb)}
        watch="A spike — especially just before new jobs appear — often means VicRoads is processing a surge of incident data." />
      <MetricCard label="Your normal (avg)" value={fmtMs(m?.avgTtfb)}
        now={m?.avgTtfb ? `Baseline for this session. Anything well above ${fmtMs(m?.avgTtfb)} is abnormal.` : 'Still measuring — needs a few polls to establish a baseline.'}
        watch="If the average climbs over time, VicRoads infrastructure is degrading — not just a one-off spike." />
      <MetricCard label="Transfer time" value={fmtMs(m?.transferTime)}
        now={m?.transferTime ? 'Time to download the data after the server started responding.' : null}
        watch="Increases mean a larger response — more active jobs or longer incident descriptions." />

      <SectionLabel>Cache & Freshness</SectionLabel>
      <MetricCard label="Cache status" value={m?.cacheStatus || '—'}
        accent={cacheOk === true ? '#4a8a4a' : cacheOk === false ? '#cc8822' : null}
        now={interpretCache(m?.cacheStatus)}
        watch="HIT → MISS means the cache was purged and fresh data is incoming. Sustained MISSes during a busy period = high traffic bypassing cache." />
      <MetricCard label="Data age when served" value={m?.age != null ? `${m.age}s` : '—'} accent={ageColor}
        now={interpretAge(m?.age)}
        watch="Rising age means the CDN isn't refreshing. Sudden drop to 0 means a fresh fetch — this is the moment to trust the data most." />
      <MetricCard label="VicRoads cache window" value={m?.maxAge != null ? `${m.maxAge}s` : '—'}
        now={interpretMaxAge(m?.maxAge)}
        watch="If this drops, VicRoads is telling their CDN to refresh more often — they may have detected a need for faster updates." />

      <SectionLabel>Content</SectionLabel>
      <MetricCard label="Content changed" value={m?.bodyHash ? (m.hashChanged ? 'YES ↑' : 'No change') : '—'}
        accent={m?.hashChanged ? ACC : null}
        now={interpretHash(m?.hashChanged, m?.bodyHash)}
        watch="This is the most reliable signal of a real VicRoads update. Everything else is infrastructure noise." />
      <MetricCard label="VicRoads update rhythm" value={m?.cadenceMs ? `~${Math.round(m.cadenceMs / 1000)}s avg` : 'building…'}
        now={interpretCadence(m?.cadenceMs)}
        watch="If the rhythm shortens suddenly, VicRoads is in high-activity mode — possibly a major incident being processed." />
      <MetricCard label="Response size" value={fmtBytes(m?.uncompressedSize)}
        now={interpretBodySize(m?.uncompressedSize)}
        watch="Size changes generally track the number of active jobs." />
      <MetricCard label="Compression" value={m?.encoding || '—'}
        now={interpretEncoding(m?.encoding)}
        watch="A change means VicRoads reconfigured their CDN or backend — infrastructure signal, not content." />
      <MetricCard label="Compression efficiency" value={m?.compressionRatio != null ? `${Math.round(m.compressionRatio * 100)}% of raw` : '—'}
        now={interpretRatio(m?.compressionRatio)}
        watch="Efficiency drop without a size change = content structure changed, possibly new fields from VicRoads." />

      <SectionLabel>Infrastructure</SectionLabel>
      <MetricCard label="ETag (content fingerprint)" value={m?.etag?.slice(0, 12) || '—'}
        now={m?.etag ? 'VicRoads\'s fingerprint for this exact version of the data. If it changes, the content changed.' : 'No ETag — VicRoads isn\'t using cache validation fingerprints.'}
        watch="Format changes — not just value — mean VicRoads changed their backend platform or framework." />
      <MetricCard label="Trace ID" value={m?.traceId?.slice(0, 12) || '—'}
        now={m?.traceId ? 'VicRoads\'s internal tracking ID for this request. Useful for identifying which backend served it.' : 'No trace ID — CDN may be serving without forwarding to origin.'}
        watch="Consistent format = stable infrastructure. Format change = backend deployment." />
      <MetricCard label="Via (proxy chain)" value={m?.via?.slice(0, 20) || '—'}
        now={m?.via ? `Request travelled through: ${m.via}.` : 'No proxy chain in this response.'}
        watch="A change here is a significant infrastructure signal — routing or CDN configuration changed." />

      <SectionLabel>Active Jobs</SectionLabel>
      <MetricCard label="Current on feed" value={m?.activeJobs ?? '—'}
        now={interpretActiveJobs(m?.activeJobs)}
        watch="A sudden jump is a surge — possible major incident. A sudden drop is a mass clearance." />
      <MetricCard label="Stale jobs (2h+)" value={jobSignals?.ghosts.length || '0'}
        now={!jobSignals?.ghosts.length
          ? 'No jobs have been sitting on the feed unusually long.'
          : `${jobSignals.ghosts.length} job${jobSignals.ghosts.length > 1 ? 's have' : ' has'} been active for over 2 hours.`}
        watch="Accumulating ghost jobs can mean VicRoads's clearance pipeline is backed up, or complex scenes." />

      {lagStats?.samples.length > 0 && (
        <>
          <SectionLabel>Publication Lag</SectionLabel>
          <MetricCard label="Pager → VicRoads (avg)"
            value={lagStats.avg != null ? `${Math.round(lagStats.avg / 1000)}s` : '—'}
            accent={lagStats.avg < 60000 ? '#4a8a4a' : lagStats.avg < 180000 ? '#cc8822' : '#cc3333'}
            now={interpretLag(lagStats.avg)}
            watch="If lag shortens over time, VicRoads improved their pipeline. Widening = slowing down." />
          <MetricCard label="Fastest seen" value={lagStats.min != null ? `${Math.round(lagStats.min / 1000)}s` : '—'}
            now="The best their pipeline has managed this session."
            watch="Shortening across multiple sessions = systematic improvement." />
          <MetricCard label="Slowest seen" value={lagStats.max != null ? `${Math.round(lagStats.max / 1000)}s` : '—'}
            now="Worst-case lag observed this session. Some incident types route through a slower pipeline."
            watch="Outliers here can reveal incident types that go through a different, slower pipeline." />
          <MetricCard label="Sample size" value={lagStats.samples.length}
            now={`Based on ${lagStats.samples.length} matched pager-to-allocation pair${lagStats.samples.length > 1 ? 's' : ''}.`}
            watch="More samples = more reliable averages. Early in a session, treat the numbers with more caution." />
        </>
      )}
    </>
  );
}

// ── VicEmergency metrics panel ────────────────────────────────────────────────
function VicEmPanel({ m }) {
  const ttfbColor = !m?.ttfb ? null : m.ttfb < 300 ? '#4a8a4a' : m.ttfb < 600 ? '#cc8822' : '#cc3333';
  const ageColor  = !m?.age ? null : m.age < 60 ? null : m.age < 120 ? '#cc8822' : '#cc3333';
  const catCounts = m?.catCounts || {};
  const topCats   = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);

  if (!m) return (
    <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 8, color: '#334', lineHeight: 2 }}>
      Waiting for first VicEmergency poll…<br />
      <span style={{ color: '#223' }}>Polls every 60s alongside VicRoads.</span>
    </div>
  );

  return (
    <>
      <SectionLabel>Incident Activity</SectionLabel>
      <MetricCard label="Active incidents (statewide)" value={m.activeIncidents ?? '—'}
        now={interpretEmActiveIncs(m.activeIncidents)}
        watch="A surge here means Victoria is dealing with multiple concurrent events — road, fire, flood, or rescue. High counts often correlate with elevated VicRoads activity." />
      {topCats.length > 0 && (
        <MetricCard label="Incident breakdown"
          value={topCats.map(([k, v]) => `${k.slice(0,6)}:${v}`).join(' ')}
          now={`Most active types right now: ${topCats.map(([k, v]) => `${k} (${v})`).join(', ')}.`}
          watch="A new category appearing — especially HAZMAT, CRASH, or ENTRAPMENT — is significant for road conditions." />
      )}

      <SectionLabel>Feed Quality</SectionLabel>
      <MetricCard label="Content changed" value={m.bodyHash ? (m.hashChanged ? 'YES ↑' : 'No change') : '—'}
        accent={m.hashChanged ? ACC : null}
        now={interpretEmHash(m.hashChanged, m.bodyHash)}
        watch="Changes here confirm real incident updates. No change for a long time during high activity = VicEmergency may have a pipeline delay." />
      <MetricCard label="Server speed (TTFB)" value={fmtMs(m.ttfb)} accent={ttfbColor}
        now={interpretEmTtfb(m.ttfb)}
        watch="A spike here that also coincides with a VicRoads spike is a shared-infrastructure signal — both government data pipelines slowed together." />
      <MetricCard label="Avg speed" value={fmtMs(m.avgTtfb)}
        now={m.avgTtfb ? `Session baseline for VicEmergency. Compare to VicRoads to detect shared infrastructure behaviour.` : 'Still building baseline.'}
        watch="If VicRoads and VicEmergency averages diverge, they're on different infrastructure. If they track each other, they share it." />
      <MetricCard label="Data age when served" value={m.age != null ? `${m.age}s` : '—'} accent={ageColor}
        now={interpretEmAge(m.age)}
        watch="If VicEmergency age is high during an active incident, their CDN isn't keeping up — what you see may be outdated." />
      <MetricCard label="Response size" value={fmtBytes(m.uncompressedSize)}
        now={m.uncompressedSize ? `${(m.uncompressedSize / 1024).toFixed(1)} KB of incident data.` : null}
        watch="Growing response = more active incidents or longer descriptions. Track this during major events." />
    </>
  );
}

// ── Waze metrics panel ────────────────────────────────────────────────────────
function WazePanel({ m, wazeLagStats }) {
  const typeCounts = m?.typeCounts || {};
  const topTypes   = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const budgetPct  = (m?.budgetCount && m?.budgetMax) ? Math.round((m.budgetCount / m.budgetMax) * 100) : null;

  if (!m) return (
    <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 8, color: '#334', lineHeight: 2 }}>
      Waiting for first Waze poll…<br />
      <span style={{ color: '#223' }}>Polls every 120s alongside VicRoads.</span>
    </div>
  );

  return (
    <>
      <SectionLabel>Alert Activity (Melbourne Metro)</SectionLabel>
      <MetricCard label="Active Waze alerts" value={m.activeAlerts ?? '—'}
        now={interpretWazeAlerts(m.activeAlerts)}
        watch="A spike here — especially in ACCIDENT or HAZARD types — before a VicRoads allocation appears is a strong lead signal. Waze crowd-sources reports faster than official pipelines." />
      {topTypes.length > 0 && (
        <MetricCard label="Alert breakdown"
          value={topTypes.map(([k, v]) => `${k.slice(0,5)}:${v}`).join(' ')}
          now={`Most reported: ${topTypes.map(([k, v]) => `${k} (${v})`).join(', ')}.`}
          watch="A sudden shift toward ACCIDENT or HAZARD types means people are reporting road incidents crowd-sourced before any official data arrives." />
      )}

      <SectionLabel>Data Budget & Freshness</SectionLabel>
      <MetricCard label="API budget this month"
        value={m.budgetExhausted ? 'EXHAUSTED' : (m.budgetCount != null ? `${m.budgetCount}/${m.budgetMax}` : 'not configured')}
        accent={m.budgetExhausted ? '#cc3333' : budgetPct > 80 ? '#cc8822' : null}
        now={interpretWazeBudget(m.budgetCount, m.budgetMax, m.budgetExhausted)}
        watch="Once exhausted, all Waze data comes from the last snapshot. It may still be hours old — correlations with live VicRoads data become less reliable." />
      {m.cachedAt && (
        <MetricCard label="Cache snapshot age"
          value={`${Math.round((Date.now() - new Date(m.cachedAt).getTime()) / 60000)}min ago`}
          now="When the Waze data in the cache was last refreshed by the background job."
          watch="If this grows past 30 minutes during a busy period, Waze data may be significantly stale." />
      )}

      {wazeLagStats?.samples.length > 0 && (
        <>
          <SectionLabel>Waze Lead Time over VicRoads</SectionLabel>
          <MetricCard label="Waze → VicRoads (avg)"
            value={wazeLagStats.avg != null ? `${Math.round(wazeLagStats.avg / 1000)}s` : '—'}
            accent={wazeLagStats.avg < 120000 ? '#4a8a4a' : '#cc8822'}
            now={interpretWazeLag(wazeLagStats.avg)}
            watch="If this grows, either Waze is reporting faster or VicRoads pipeline is slowing. Either way, Waze becomes more valuable as a lead indicator." />
          <MetricCard label="Fastest Waze lead" value={wazeLagStats.min != null ? `${Math.round(wazeLagStats.min / 1000)}s` : '—'}
            now="The quickest Waze has beaten VicRoads to reporting an incident this session."
            watch="Repeated sub-30s leads means Waze crowd-reports are nearly instant — nearly as fast as the pager." />
          <MetricCard label="Sample size" value={wazeLagStats.samples.length}
            now={`Based on ${wazeLagStats.samples.length} Waze alert + VicRoads allocation pair${wazeLagStats.samples.length > 1 ? 's' : ''} at the same location.`}
            watch="More samples = more reliable lead time estimate." />
        </>
      )}
    </>
  );
}

// ── Cross-source correlation section (always shown) ───────────────────────────
function CorrelationSection({ events }) {
  const crossEvents = events.filter(ev => ['CROSS_CONFIRMED','WAZE_LEAD','INFRA_CORR'].includes(ev.type));
  const confirmed = crossEvents.filter(ev => ev.type === 'CROSS_CONFIRMED').length;
  const wazeLeads = crossEvents.filter(ev => ev.type === 'WAZE_LEAD').length;
  const infraSpikes = crossEvents.filter(ev => ev.type === 'INFRA_CORR').length;

  return (
    <>
      <SectionLabel>Cross-Source Correlation</SectionLabel>
      <MetricCard label="Multi-source confirmations" value={confirmed || '0'}
        accent={confirmed > 0 ? ACC : null}
        now={confirmed === 0
          ? 'No incidents confirmed by multiple sources yet this session.'
          : `${confirmed} incident${confirmed > 1 ? 's' : ''} appeared in both VicRoads and VicEmergency. These are the highest-confidence scenes.`}
        watch="Rising confirmed count = a complex, multi-agency response. These scenes are more likely to be extended jobs." />
      <MetricCard label="Waze leads on VicRoads" value={wazeLeads || '0'}
        accent={wazeLeads > 0 ? '#4a8a4a' : null}
        now={wazeLeads === 0
          ? 'No Waze-before-VicRoads correlations found yet.'
          : `${wazeLeads} time${wazeLeads > 1 ? 's' : ''} Waze crowd-reports appeared before the VicRoads allocation this session.`}
        watch="Increasing Waze leads = Waze is consistently ahead of official data. Correlate with pager lag to see the full information cascade." />
      <MetricCard label="Shared infra spikes" value={infraSpikes || '0'}
        accent={infraSpikes > 0 ? '#cc8822' : null}
        now={infraSpikes === 0
          ? 'No simultaneous latency spikes detected across sources.'
          : `${infraSpikes} time${infraSpikes > 1 ? 's' : ''} VicRoads and VicEmergency both slowed at the same moment — shared infrastructure.`}
        watch="Correlated spikes reveal that both feeds share CDN or upstream network infrastructure. A spike on both simultaneously = network event, not just VicRoads." />
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SignalsTab() {
  const { events, metrics: m, jobSignals, lagStats, vicEmMetrics, wazeMetrics, wazeLagStats } = useSignals(true);
  const [filter,  setFilter]  = useState('all');
  const [source,  setSource]  = useState('vicroads');
  const [paused,  setPaused]  = useState(false);
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'IBM Plex Mono',monospace" }}>

      {/* Header */}
      <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid ' + BRD, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>📡 Signals</div>
            <div style={{ fontSize: 8, color: MUT, marginTop: 2 }}>
              Multi-source traffic analysis · session only · VicRoads 30s · VicEmergency 60s · Waze 120s
              {m && <span style={{ marginLeft: 8, color: '#334' }}>#{m.pollCount} polls · {m.hashChangeCount} VR updates</span>}
              {crossCount > 0 && <span style={{ marginLeft: 8, color: ACC + 'aa' }}>🔗 {crossCount} correlations</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {m?.ts && <div style={{ fontSize: 8, color: '#334' }}>last {fmtTime(m.ts)}</div>}
            <button onClick={() => setPaused(p => !p)}
              style={{ fontSize: 8, fontWeight: 700, padding: '4px 8px', borderRadius: 2, cursor: 'pointer',
                background: paused ? '#cc882222' : '#0d0d0d',
                border: `1px solid ${paused ? '#cc8822' : '#2a2a2a'}`,
                color: paused ? '#cc8822' : MUT }}>
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ── Left: Metrics panel ── */}
        <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid ' + BRD, overflowY: 'auto', padding: '10px 14px' }}>

          {/* Source selector */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 2, flexWrap: 'wrap' }}>
            <SourceTab id="vicroads"    label="🚦 VicRoads"    active={source === 'vicroads'}    onClick={setSource} />
            <SourceTab id="vicemergency" label="🚨 VicEmergency" active={source === 'vicemergency'} onClick={setSource} />
            <SourceTab id="waze"        label="🗺️ Waze"         active={source === 'waze'}        onClick={setSource} />
          </div>

          {source === 'vicroads'     && <VicRoadsPanel m={m} jobSignals={jobSignals} lagStats={lagStats} />}
          {source === 'vicemergency' && <VicEmPanel m={vicEmMetrics} />}
          {source === 'waze'         && <WazePanel m={wazeMetrics} wazeLagStats={wazeLagStats} />}

          <CorrelationSection events={events} />
        </div>

        {/* ── Right: Event stream ── */}
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
              {visible.length} event{visible.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Stream */}
          <div ref={streamRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
            {events.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 0', fontSize: 9, color: '#334', lineHeight: 2 }}>
                Monitoring three sources…<br />
                VicRoads · VicEmergency · Waze<br />
                <span style={{ fontSize: 8, color: '#223' }}>
                  First signals appear within 30 seconds.<br />
                  Cross-source correlations appear when the same incident is seen in multiple feeds.
                </span>
              </div>
            )}
            {visible.map(ev => <EventRow key={ev.id} ev={ev} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
