import React, { useState, useRef, useEffect } from 'react';
import { ACC, MUT, BRD, TXT, SURF } from '../../lib/styles';
import { useSignals } from '../../hooks/useSignals';

// ── Severity colours ──────────────────────────────────────────
const SEV = {
  info:  { dot: '#4a8a4a', bg: '#0a120a', border: '#1e2e1e', text: '#88bb88' },
  warn:  { dot: '#cc8822', bg: '#121008', border: '#2e2408', text: '#ccaa44' },
  alert: { dot: '#cc3333', bg: '#120808', border: '#2e1010', text: '#dd5555' },
};

// ── Event type display ────────────────────────────────────────
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

function evMeta(type) {
  return EV[type] || { icon: '·', label: type };
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function fmtBytes(b) {
  if (!b) return '—';
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b > 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

function MetricRow({ label, value, sub, accent, mono = true }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      borderBottom: '1px solid #111', padding: '5px 0' }}>
      <span style={{ fontSize: 8, color: MUT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: accent || TXT,
        fontFamily: mono ? "'IBM Plex Mono',monospace" : 'inherit' }}>
        {value ?? '—'}
        {sub && <span style={{ fontSize: 8, color: MUT, marginLeft: 4, fontWeight: 400 }}>{sub}</span>}
      </span>
    </div>
  );
}

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
          <div style={{ fontSize: 8, color: MUT, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: open ? 'normal' : 'nowrap' }}>
            {ev.detail}
          </div>
        </div>
        <span style={{ fontSize: 8, color: '#333', flexShrink: 0, fontFamily: "'IBM Plex Mono',monospace" }}>
          {fmtTime(ev.ts)}
        </span>
      </div>
      {open && ev.data && Object.keys(ev.data).length > 0 && (
        <pre style={{ margin: '6px 0 0', fontSize: 8, color: '#556', background: '#0a0a0a',
          border: '1px solid #1a1a1a', borderRadius: 2, padding: 6, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
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
  const { events, metrics, jobSignals, lagStats } = useSignals(true);
  const [filter, setFilter]   = useState('all');
  const [paused, setPaused]   = useState(false);
  const streamRef             = useRef(null);
  const pausedEventsRef       = useRef([]);

  // Auto-scroll to top of event stream when new events arrive (unless paused)
  useEffect(() => {
    if (!paused && streamRef.current) streamRef.current.scrollTop = 0;
  }, [events.length, paused]);

  const activeFilter = FILTERS.find(f => f.key === filter) || FILTERS[0];
  const visible = events.filter(ev => {
    if (activeFilter.key === 'all') return true;
    if (activeFilter.sev) return ev.severity === activeFilter.sev;
    return activeFilter.types?.includes(ev.type);
  });

  const cacheOk = metrics?.cacheStatus ? /HIT/i.test(metrics.cacheStatus) : null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'IBM Plex Mono',monospace" }}>

      {/* Header */}
      <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid ' + BRD, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>📡 Signals</div>
            <div style={{ fontSize: 8, color: MUT, marginTop: 2 }}>
              VicRoads traffic analysis · session only · polls every 30s
              {metrics && <span style={{ marginLeft: 8, color: '#334' }}>#{metrics.pollCount} polls</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {metrics?.ts && (
              <div style={{ fontSize: 8, color: '#334', textAlign: 'right' }}>
                last poll<br />{fmtTime(metrics.ts)}
              </div>
            )}
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

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 0 }}>

        {/* Left: Metrics panel */}
        <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid ' + BRD, overflowY: 'auto', padding: '12px 14px' }}>

          {/* Protocol */}
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: MUT, textTransform: 'uppercase', marginBottom: 8 }}>
            Protocol
          </div>
          <MetricRow label="TTFB"        value={fmtMs(metrics?.ttfb)}
            accent={metrics?.avgTtfb && metrics?.ttfb > metrics.avgTtfb * 2 ? '#cc8822' : null} />
          <MetricRow label="Avg TTFB"    value={fmtMs(metrics?.avgTtfb)} />
          <MetricRow label="Transfer"    value={fmtMs(metrics?.transferTime)} />
          <MetricRow label="Total"       value={fmtMs(metrics?.totalTime)} />
          <div style={{ height: 6 }} />
          <MetricRow label="Cache"
            value={cacheOk === null ? '—' : cacheOk ? 'HIT' : 'MISS'}
            accent={cacheOk === true ? '#4a8a4a' : cacheOk === false ? '#cc8822' : null} />
          <MetricRow label="CDN Age"
            value={metrics?.age != null ? `${metrics.age}s` : '—'}
            accent={metrics?.age > 90 ? '#cc8822' : null} />
          <MetricRow label="Max-Age"     value={metrics?.maxAge != null ? `${metrics.maxAge}s` : '—'} />
          <MetricRow label="Encoding"    value={metrics?.encoding || '—'} />
          <div style={{ height: 6 }} />
          <MetricRow label="Body (raw)"  value={fmtBytes(metrics?.uncompressedSize)} />
          <MetricRow label="Compressed"  value={fmtBytes(metrics?.compressedSize)} />
          <MetricRow label="Ratio"
            value={metrics?.compressionRatio != null ? `${(metrics.compressionRatio * 100).toFixed(0)}%` : '—'} />
          <div style={{ height: 6 }} />
          <MetricRow label="Hash"
            value={metrics?.bodyHash?.slice(0, 8) || '—'}
            accent={metrics?.hashChanged ? ACC : null} />
          <MetricRow label="ETag"        value={metrics?.etag?.slice(0, 10) || '—'} />
          <MetricRow label="Trace ID"    value={metrics?.traceId?.slice(0, 10) || '—'} />
          <MetricRow label="Via"         value={metrics?.via?.slice(0, 16) || '—'} />

          {/* Cadence */}
          <div style={{ marginTop: 14, marginBottom: 8, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: MUT, textTransform: 'uppercase' }}>
            Cadence
          </div>
          <MetricRow label="Feed updates" value={metrics?.hashChangeCount ?? '—'} />
          <MetricRow label="Avg interval"
            value={metrics?.cadenceMs ? `${Math.round(metrics.cadenceMs / 1000)}s` : 'building…'} />
          {metrics?.lastHashChangeTs && (
            <MetricRow label="Last update" value={fmtTime(metrics.lastHashChangeTs)} />
          )}

          {/* Jobs */}
          <div style={{ marginTop: 14, marginBottom: 8, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: MUT, textTransform: 'uppercase' }}>
            Active Jobs
          </div>
          <MetricRow label="Current"     value={metrics?.activeJobs ?? '—'} />
          <MetricRow label="Ghosts (2h+)" value={jobSignals.ghosts.length || '0'} />

          {/* Lag */}
          {lagStats.samples.length > 0 && (
            <>
              <div style={{ marginTop: 14, marginBottom: 8, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: MUT, textTransform: 'uppercase' }}>
                Pub Lag
              </div>
              <MetricRow label="Avg"  value={lagStats.avg != null ? `${Math.round(lagStats.avg / 1000)}s` : '—'} />
              <MetricRow label="Min"  value={lagStats.min != null ? `${Math.round(lagStats.min / 1000)}s` : '—'} />
              <MetricRow label="Max"  value={lagStats.max != null ? `${Math.round(lagStats.max / 1000)}s` : '—'} />
              <MetricRow label="Samples" value={lagStats.samples.length} />
            </>
          )}

          {/* Server Timing */}
          {metrics?.serverTiming && (
            <>
              <div style={{ marginTop: 14, marginBottom: 4, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: MUT, textTransform: 'uppercase' }}>
                Server-Timing
              </div>
              <div style={{ fontSize: 7, color: '#446', wordBreak: 'break-all', lineHeight: 1.5 }}>
                {metrics.serverTiming}
              </div>
            </>
          )}
        </div>

        {/* Right: Event stream */}
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
              <div style={{ textAlign: 'center', padding: '48px 0', fontSize: 9, color: '#334' }}>
                Monitoring… first signals will appear after 30s
              </div>
            )}
            {visible.map(ev => <EventRow key={ev.id} ev={ev} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
