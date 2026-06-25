import React, { useState, useRef, useEffect } from 'react';
import { ACC, MUT, BRD, TXT } from '../../lib/styles';
import { useSignals } from '../../hooks/useSignals';

// ── Severity colours ──────────────────────────────────────────
const SEV = {
  info:  { dot: '#4a8a4a', bg: '#0a120a', border: '#1e2e1e', text: '#88bb88' },
  warn:  { dot: '#cc8822', bg: '#121008', border: '#2e2408', text: '#ccaa44' },
  alert: { dot: '#cc3333', bg: '#120808', border: '#2e1010', text: '#dd5555' },
};

const EV = {
  HASH_CHANGED:      { icon: '🔄', label: 'Feed Updated'        },
  CACHE_HIT:         { icon: '💾', label: 'Cache Hit'           },
  CACHE_MISS:        { icon: '🔍', label: 'Cache Miss'          },
  HIGH_CDN_AGE:      { icon: '🕰', label: 'CDN Stale'           },
  LATENCY_SPIKE:     { icon: '⏱', label: 'Latency Spike'       },
  ENCODING_CHANGE:   { icon: '🔀', label: 'Encoding Changed'    },
  API_WARNING:       { icon: '⚠️', label: 'API Warning'         },
  RATE_LIMIT_LOW:    { icon: '🚦', label: 'Rate Limit Low'      },
  FEED_ERROR:        { icon: '🔴', label: 'Feed Error'          },
  FEED_RECOVERED:    { icon: '🟢', label: 'Feed Recovered'      },
  SCHEMA_CHANGE:     { icon: '🔎', label: 'Schema Change'       },
  NEW_JOB:           { icon: '🆕', label: 'New Job'             },
  JOB_CLEARED:       { icon: '✅', label: 'Cleared'             },
  BATCH_FLUSH:       { icon: '⚡', label: 'Batch Flush'         },
  SURGE:             { icon: '📈', label: 'Surge'               },
  JOB_FLICKERED:     { icon: '👻', label: 'Flickering'          },
  COORD_DRIFT:       { icon: '🗺️', label: 'Coord Drift'         },
  DESC_ESCALATION:   { icon: '⬆️', label: 'Escalation'          },
  GHOST_JOB:         { icon: '🕰', label: 'Ghost Job'           },
  DUPLICATE_JOBS:    { icon: '♊', label: 'Duplicate'           },
  PUBLICATION_LAG:   { icon: '📡', label: 'Pub Lag'             },
  POLL_FAILED:       { icon: '🚫', label: 'Poll Failed'         },
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

// ── Metric card with plain-English interpretation ─────────────
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
        <div style={{ fontSize: 8, color: '#5a7a5a', marginTop: 3, lineHeight: 1.5 }}>
          {nowText}
        </div>
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

// ── Derive plain-English interpretation for each metric ───────
function interpretTtfb(ttfb, avg) {
  if (ttfb == null) return null;
  if (ttfb < 150)  return 'Server answered almost instantly. Very healthy.';
  if (ttfb < 300)  return 'Normal response speed. VicRoads server is healthy.';
  if (ttfb < 600)  return 'Slightly slower than ideal — could be routine load.';
  if (ttfb < 1500) return 'Slow. VicRoads server is under load right now.';
  return 'Very slow. Something is wrong on VicRoads\'s end — possibly a major incident driving heavy API traffic.';
}

function interpretCache(status) {
  if (!status) return 'No cache information in this response.';
  if (/HIT/i.test(status))  return 'VicRoads served this from their CDN cache — their origin server wasn\'t queried. Good for performance, but data may be slightly older.';
  if (/MISS/i.test(status)) return 'VicRoads\'s origin server was queried directly. You\'re getting the freshest possible data.';
  if (/EXPIRED/i.test(status)) return 'Cached copy had expired — a fresh copy was fetched from the origin.';
  if (/BYPASS/i.test(status)) return 'Cache was bypassed — origin queried directly, possibly due to request headers or server config.';
  return `Cache status: ${status}`;
}

function interpretAge(age) {
  if (age == null) return 'Unknown — response didn\'t include cache age information.';
  if (age === 0)   return 'Brand new response — just fetched from the origin. Maximum freshness.';
  if (age < 30)    return `This data was only ${age}s old when served. Very fresh.`;
  if (age < 60)    return `Data was ${age}s old when served — within the normal cache window.`;
  if (age < 120)   return `Data was ${age}s old when served — getting toward the stale end.`;
  return `Data was already ${age}s old when it reached us — CDN is serving stale content. What you're seeing may not reflect current reality.`;
}

function interpretMaxAge(maxAge) {
  if (maxAge == null) return 'VicRoads hasn\'t specified how long to cache this data.';
  return `VicRoads is telling CDN nodes to cache this data for up to ${maxAge} seconds before re-fetching from the source.`;
}

function interpretHash(changed, hash) {
  if (!hash) return 'No hash available yet.';
  if (changed) return 'Content changed since the last poll — VicRoads just pushed a real update.';
  return 'Content is identical to the last poll — VicRoads hasn\'t pushed any changes since we last checked.';
}

function interpretCadence(ms) {
  if (!ms) return 'Still building a picture — need more polls with actual changes to estimate.';
  const s = Math.round(ms / 1000);
  if (s < 30)  return `VicRoads is updating their data roughly every ${s}s — very active feed.`;
  if (s < 90)  return `VicRoads updates approximately every ${s}s on average during this session.`;
  if (s < 180) return `VicRoads is updating every ${s}s on average — moderate activity.`;
  return `VicRoads is only updating every ${s}s on average — quiet period or slow pipeline.`;
}

function interpretEncoding(enc) {
  if (!enc || enc === 'none') return 'No compression — data is sent as plain text.';
  if (/br/i.test(enc))   return 'Brotli compression — modern, efficient. Less data over the wire.';
  if (/gzip/i.test(enc)) return 'Gzip compression — standard. Data is compressed before sending.';
  return `Compressed using ${enc}.`;
}

function interpretRatio(ratio) {
  if (ratio == null) return 'Can\'t calculate — server didn\'t report compressed size.';
  const pct = Math.round(ratio * 100);
  if (pct < 15) return `Compressed to ${pct}% of its original size — very efficient. Lots of repetitive data.`;
  if (pct < 30) return `Compressed to ${pct}% — good compression. Data is quite repetitive (normal for JSON with many similar records).`;
  if (pct < 50) return `Compressed to ${pct}% — moderate compression. Data has reasonable variety.`;
  return `Compressed to ${pct}% — poor compression. Content may have changed structure or become more varied.`;
}

function interpretBodySize(bytes) {
  if (!bytes) return null;
  const kb = (bytes / 1024).toFixed(1);
  return `Response is ${kb} KB of data. Larger than usual means more active jobs or longer descriptions.`;
}

function interpretEtag(etag) {
  if (!etag) return 'No ETag — VicRoads isn\'t using cache validation fingerprints on this response.';
  return 'VicRoads\'s fingerprint for this exact version of the data. If it changes, the content changed.';
}

function interpretVia(via) {
  if (!via) return 'No proxy chain information in this response.';
  return `Request travelled through: ${via}. This is the infrastructure chain between you and VicRoads.`;
}

function interpretTraceId(id) {
  if (!id) return 'No trace ID — either CDN is serving without touching the origin, or VicRoads doesn\'t expose request tracking.';
  return `VicRoads\'s internal tracking ID for this specific request. Useful for identifying which backend server handled it.`;
}

function interpretLag(avgMs) {
  if (avgMs == null) return 'No matches yet — waiting for a pager message and VicRoads allocation to appear for the same job.';
  const s = Math.round(avgMs / 1000);
  if (s < 30)  return `On average, VicRoads publishes a job just ${s}s after the pager fires. Very fast pipeline.`;
  if (s < 90)  return `VicRoads typically publishes about ${s}s after the pager. You have roughly a ${s}s head start from the pager.`;
  if (s < 180) return `Average lag is ${s}s — a meaningful window. Pager gives you ${s}s advance notice before VicRoads.`;
  return `Average lag is ${s}s — VicRoads's pipeline is significantly behind the pager. A lot can happen in that window.`;
}

function interpretActiveJobs(count) {
  if (count == null) return null;
  if (count === 0) return 'No active allocations on the feed right now.';
  if (count <= 5)  return `${count} active job${count > 1 ? 's' : ''} on the feed — quiet period.`;
  if (count <= 15) return `${count} active jobs — normal activity level.`;
  if (count <= 25) return `${count} active jobs — elevated. Busy period.`;
  return `${count} active jobs — high load. Could indicate a major event or peak period.`;
}

// ── Event stream row ──────────────────────────────────────────
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

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'protocol', label: 'Protocol', types: ['HASH_CHANGED','CACHE_HIT','CACHE_MISS','HIGH_CDN_AGE','LATENCY_SPIKE','ENCODING_CHANGE','API_WARNING','RATE_LIMIT_LOW','FEED_ERROR','FEED_RECOVERED','SCHEMA_CHANGE'] },
  { key: 'jobs',     label: 'Jobs',     types: ['NEW_JOB','JOB_CLEARED','BATCH_FLUSH','SURGE','JOB_FLICKERED','COORD_DRIFT','DESC_ESCALATION','GHOST_JOB','DUPLICATE_JOBS'] },
  { key: 'lag',      label: 'Lag',      types: ['PUBLICATION_LAG'] },
  { key: 'alert',    label: '🔴 Alerts', sev: 'alert' },
];

export default function SignalsTab() {
  const { events, metrics: m, jobSignals, lagStats } = useSignals(true);
  const [filter, setFilter] = useState('all');
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

  const cacheOk   = m?.cacheStatus ? /HIT/i.test(m.cacheStatus) : null;
  const ttfbColor = !m?.ttfb ? null : m.ttfb < 300 ? '#4a8a4a' : m.ttfb < 600 ? '#cc8822' : '#cc3333';
  const ageColor  = !m?.age ? null : m.age < 60 ? null : m.age < 120 ? '#cc8822' : '#cc3333';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'IBM Plex Mono',monospace" }}>

      {/* Header */}
      <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid ' + BRD, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>📡 Signals</div>
            <div style={{ fontSize: 8, color: MUT, marginTop: 2 }}>
              VicRoads traffic analysis · session only · polls every 30s
              {m && <span style={{ marginLeft: 8, color: '#334' }}>#{m.pollCount} polls · {m.hashChangeCount} real updates</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {m?.ts && <div style={{ fontSize: 8, color: '#334' }}>last poll {fmtTime(m.ts)}</div>}
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
        <div style={{ width: 270, flexShrink: 0, borderRight: '1px solid ' + BRD, overflowY: 'auto', padding: '10px 14px' }}>

          <SectionLabel>Server Speed</SectionLabel>
          <MetricCard
            label="Response time (TTFB)"
            value={fmtMs(m?.ttfb)}
            accent={ttfbColor}
            now={interpretTtfb(m?.ttfb, m?.avgTtfb)}
            watch="A spike here — especially one that lands just before new jobs appear — often means VicRoads is processing a surge of incident data on their end."
          />
          <MetricCard
            label="Your normal (avg)"
            value={fmtMs(m?.avgTtfb)}
            now={m?.avgTtfb ? `Baseline for this session. Anything well above ${fmtMs(m?.avgTtfb)} is abnormal.` : 'Still measuring — needs a few polls to establish a baseline.'}
            watch="If the average starts climbing over time, VicRoads infrastructure is degrading across the session — not just a one-off spike."
          />
          <MetricCard
            label="Transfer time"
            value={fmtMs(m?.transferTime)}
            now={m?.transferTime ? 'Time to download the data after the server started responding. Driven by payload size.' : null}
            watch="Increases mean a larger response — more active jobs on the feed, or longer incident descriptions. A sudden jump is worth noting."
          />

          <SectionLabel>Cache & Freshness</SectionLabel>
          <MetricCard
            label="Cache status"
            value={m?.cacheStatus || '—'}
            accent={cacheOk === true ? '#4a8a4a' : cacheOk === false ? '#cc8822' : null}
            now={interpretCache(m?.cacheStatus)}
            watch="A switch from HIT to MISS means the cache was purged — fresh data is incoming. Sustained MISSes during a busy period means high traffic is bypassing the cache."
          />
          <MetricCard
            label="Data age when served"
            value={m?.age != null ? `${m.age}s` : '—'}
            accent={ageColor}
            now={interpretAge(m?.age)}
            watch="Rising age means the CDN isn't refreshing. Sudden drop to 0 means a fresh fetch just happened — this is the moment to trust the data most."
          />
          <MetricCard
            label="VicRoads cache window"
            value={m?.maxAge != null ? `${m.maxAge}s` : '—'}
            now={interpretMaxAge(m?.maxAge)}
            watch="If this number drops, VicRoads is telling their CDN to refresh more often — they may have detected they need faster updates. If it rises, they're throttling."
          />

          <SectionLabel>Content</SectionLabel>
          <MetricCard
            label="Content changed"
            value={m?.bodyHash ? (m.hashChanged ? 'YES ↑' : 'No change') : '—'}
            accent={m?.hashChanged ? ACC : null}
            now={interpretHash(m?.hashChanged, m?.bodyHash)}
            watch="This is the most reliable signal of a real VicRoads update. Everything else (cache, age, timing) is infrastructure noise — this is actual data changing."
          />
          <MetricCard
            label="VicRoads update rhythm"
            value={m?.cadenceMs ? `~${Math.round(m.cadenceMs / 1000)}s avg` : 'building…'}
            now={interpretCadence(m?.cadenceMs)}
            watch="If the rhythm suddenly shortens, VicRoads is in a high-activity mode — possibly a major incident being processed. Lengthening means things are quieting down."
          />
          <MetricCard
            label="Response size"
            value={fmtBytes(m?.uncompressedSize)}
            now={interpretBodySize(m?.uncompressedSize)}
            watch="A size increase without a hash change is unusual — shouldn't happen. Size changes generally track the number of active jobs."
          />
          <MetricCard
            label="Compression"
            value={m?.encoding || '—'}
            now={interpretEncoding(m?.encoding)}
            watch="A change here means VicRoads reconfigured their CDN or backend. Not content-related — infrastructure-related. Worth noting alongside any other infrastructure signals."
          />
          <MetricCard
            label="Compression efficiency"
            value={m?.compressionRatio != null ? `${Math.round(m.compressionRatio * 100)}% of raw` : '—'}
            now={interpretRatio(m?.compressionRatio)}
            watch="If efficiency drops significantly without the payload shrinking, the content structure changed — possibly new fields or a different response format from VicRoads."
          />

          <SectionLabel>Infrastructure</SectionLabel>
          <MetricCard
            label="ETag (content fingerprint)"
            value={m?.etag?.slice(0, 12) || '—'}
            now={interpretEtag(m?.etag)}
            watch="Format changes — not just value — mean VicRoads changed their backend platform or framework. A new ETag format after months of consistency is a meaningful infrastructure signal."
          />
          <MetricCard
            label="Trace ID"
            value={m?.traceId?.slice(0, 12) || '—'}
            now={interpretTraceId(m?.traceId)}
            watch="Consistent format = stable infrastructure. A format change means a backend deployment. Disappearance means the CDN is now handling requests without forwarding to the origin at all."
          />
          <MetricCard
            label="Via (proxy chain)"
            value={m?.via?.slice(0, 20) || '—'}
            now={interpretVia(m?.via)}
            watch="A change here is a significant infrastructure signal — VicRoads changed their routing, CDN configuration, or something was rerouted through different infrastructure."
          />
          {m?.serverTiming && (
            <MetricCard
              label="Server-Timing"
              value="present"
              accent="#4a6a4a"
              now="VicRoads is exposing internal server timing data in this response — rare for government APIs."
              watch="Disappearance means they removed it (probably intentionally). Changes in the timing values reveal how different backend components are performing."
            />
          )}

          <SectionLabel>Active Jobs</SectionLabel>
          <MetricCard
            label="Current on feed"
            value={m?.activeJobs ?? '—'}
            now={interpretActiveJobs(m?.activeJobs)}
            watch="A sudden jump is a surge — possibly a major incident or peak period. A sudden drop is a mass clearance — scenes resolved or a data reset."
          />
          <MetricCard
            label="Stale jobs (2h+)"
            value={jobSignals.ghosts.length || '0'}
            now={jobSignals.ghosts.length === 0
              ? 'No jobs have been sitting on the feed unusually long.'
              : `${jobSignals.ghosts.length} job${jobSignals.ghosts.length > 1 ? 's have' : ' has'} been active for over 2 hours — either a complex scene or a VicRoads data issue.`}
            watch="Accumulating ghost jobs can mean VicRoads's clearance pipeline is backed up, or jobs are being held open deliberately for complex scenes."
          />

          {lagStats.samples.length > 0 && (
            <>
              <SectionLabel>Publication Lag</SectionLabel>
              <MetricCard
                label="Pager → VicRoads (avg)"
                value={lagStats.avg != null ? `${Math.round(lagStats.avg / 1000)}s` : '—'}
                accent={lagStats.avg < 60000 ? '#4a8a4a' : lagStats.avg < 180000 ? '#cc8822' : '#cc3333'}
                now={interpretLag(lagStats.avg)}
                watch="If lag shortens over time, VicRoads may have improved their pipeline or gained more direct ESTA integration. If it widens, their pipeline is slowing — possibly under load."
              />
              <MetricCard
                label="Fastest seen"
                value={lagStats.min != null ? `${Math.round(lagStats.min / 1000)}s` : '—'}
                now="The shortest observed gap between a pager message and the allocation appearing on VicRoads. This is the best their pipeline can do."
                watch="If this shortens over multiple sessions, VicRoads is systematically improving their pipeline speed."
              />
              <MetricCard
                label="Slowest seen"
                value={lagStats.max != null ? `${Math.round(lagStats.max / 1000)}s` : '—'}
                now="The worst-case lag observed this session. Some incident types or busy periods cause delays."
                watch="Outliers here can reveal specific incident types that route through a slower pipeline — worth correlating against event type."
              />
              <MetricCard
                label="Sample size"
                value={lagStats.samples.length}
                now={`Based on ${lagStats.samples.length} matched pager-to-allocation pair${lagStats.samples.length > 1 ? 's' : ''} this session.`}
                watch="More samples means more reliable averages. Early in a session, treat the lag numbers with more caution."
              />
            </>
          )}
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
                Monitoring…<br />
                First signals will appear within 30 seconds.<br />
                <span style={{ fontSize: 8, color: '#223' }}>Protocol signals arrive each poll. Job signals appear when allocations change.</span>
              </div>
            )}
            {visible.map(ev => <EventRow key={ev.id} ev={ev} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
