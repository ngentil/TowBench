import { useState, useEffect, useRef, useCallback } from 'react';
import { haversineKm } from '../lib/utils';
import { supabase } from '../lib/supabase';

const POLL_MS      = 30_000;   // tighter cadence for traffic analysis
const MAX_EVENTS   = 300;
const MAX_HISTORY  = 60;
const GHOST_MS     = 2 * 60 * 60 * 1000;  // 2 hours
const FLICKER_MS   = 5 * 60 * 1000;       // reappear within 5 min = flicker
const LAG_WINDOW   = 30 * 60 * 1000;      // pager messages within 30 min

// Fields present in the v3 schema — unknown keys trigger SCHEMA_CHANGE events
const KNOWN_FIELDS = new Set([
  'eventId','closedRoadName','reference','eventType','eventSubType','description',
  'numberLanesImpacted','impact','lastUpdated','status','geometry','melway',
]);

let _evtId = 0;
const eid = () => `e${++_evtId}`;

export function useSignals(enabled) {
  const [events,     setEvents]     = useState([]);
  const [metrics,    setMetrics]    = useState(null);
  const [jobSignals, setJobSignals] = useState({ ghosts: [], total: 0 });
  const [lagStats,   setLagStats]   = useState({ samples: [], avg: null, min: null, max: null });

  // Mutable refs — no re-render cost
  const historyRef      = useRef([]);
  const jobStateRef     = useRef(new Map());   // eventId → job snapshot
  const recentlyGoneRef = useRef(new Map());   // eventId → { ts, job } for flicker detection
  const prevHashRef     = useRef(null);
  const prevEncRef      = useRef(null);
  const prevStatusRef   = useRef(null);
  const ttfbBuf         = useRef([]);
  const hashTimes       = useRef([]);
  const knownFieldsRef  = useRef(new Set(KNOWN_FIELDS));
  const pagerRef        = useRef([]);
  const lagSamplesRef   = useRef([]);
  const pollCountRef    = useRef(0);

  const push = useCallback((ev) => {
    setEvents(prev => [ev, ...prev].slice(0, MAX_EVENTS));
  }, []);

  const refreshPager = useCallback(async () => {
    try {
      const since = new Date(Date.now() - LAG_WINDOW).toISOString();
      const { data } = await supabase
        .from('vicpagers_messages')
        .select('id, timestamp, parsed_address, parsed_event_type, parsed_map_ref')
        .gte('timestamp', since)
        .order('timestamp', { ascending: false })
        .limit(150);
      if (data) pagerRef.current = data;
    } catch { /* silent */ }
  }, []);

  const processPoll = useCallback((raw, pollTs) => {
    const meta     = raw._meta || {};
    const features = raw.features || [];
    pollCountRef.current++;

    // ── PROTOCOL SIGNALS ──────────────────────────────────────

    // TTFB rolling buffer
    if (meta.ttfb != null) {
      ttfbBuf.current = [...ttfbBuf.current, meta.ttfb].slice(-20);
    }
    const avgTtfb = ttfbBuf.current.length
      ? Math.round(ttfbBuf.current.reduce((a, b) => a + b, 0) / ttfbBuf.current.length)
      : null;

    // Hash change
    const hashChanged = !!meta.bodyHash && meta.bodyHash !== prevHashRef.current;
    if (hashChanged && prevHashRef.current !== null) {
      hashTimes.current = [...hashTimes.current, pollTs].slice(-30);
      push({ id: eid(), ts: pollTs, type: 'HASH_CHANGED', severity: 'info',
        title: 'VicRoads feed updated',
        detail: `hash ${prevHashRef.current?.slice(0,8)} → ${meta.bodyHash?.slice(0,8)}`,
        data: { hash: meta.bodyHash } });
    }
    if (meta.bodyHash) prevHashRef.current = meta.bodyHash;

    // Cadence estimate from hash change times
    let cadenceMs = null;
    if (hashTimes.current.length >= 2) {
      const gaps = hashTimes.current.slice(1).map((t, i) => t - hashTimes.current[i]);
      cadenceMs = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    }

    // Latency spike — only after we have a baseline
    if (avgTtfb && meta.ttfb && meta.ttfb > avgTtfb * 2.5 && meta.ttfb > 1500) {
      push({ id: eid(), ts: pollTs, type: 'LATENCY_SPIKE', severity: 'warn',
        title: `Latency spike: ${meta.ttfb}ms TTFB`,
        detail: `${Math.round(meta.ttfb / avgTtfb)}× above rolling avg (${avgTtfb}ms)`,
        data: { ttfb: meta.ttfb, avg: avgTtfb } });
    }

    // Age header — CDN staleness before we even get the data
    const ageS = meta.headers?.['age'] != null ? parseInt(meta.headers['age']) : null;
    if (ageS !== null && ageS > 90) {
      push({ id: eid(), ts: pollTs, type: 'HIGH_CDN_AGE', severity: 'warn',
        title: `CDN serving ${ageS}s-old data`,
        detail: 'VicRoads CDN cached this response before serving it to us',
        data: { age: ageS } });
    }

    // Cache status change
    const cacheStatus = meta.headers?.['cf-cache-status'] || meta.headers?.['x-cache'] || null;
    const prevSnap = historyRef.current[historyRef.current.length - 1];
    const prevCacheStatus = prevSnap?.meta?.headers?.['cf-cache-status'] || prevSnap?.meta?.headers?.['x-cache'] || null;
    if (cacheStatus && cacheStatus !== prevCacheStatus) {
      const isHit = /HIT/i.test(cacheStatus);
      push({ id: eid(), ts: pollTs, type: isHit ? 'CACHE_HIT' : 'CACHE_MISS', severity: 'info',
        title: `Cache ${isHit ? 'HIT' : 'MISS'} (${cacheStatus})`,
        detail: isHit
          ? 'CDN edge served this — VicRoads origin not queried this cycle'
          : 'Cache miss — VicRoads origin was queried directly',
        data: { cacheStatus } });
    }

    // Transfer-encoding change
    const enc = meta.headers?.['transfer-encoding'] || meta.headers?.['content-encoding'] || 'none';
    if (prevEncRef.current !== null && enc !== prevEncRef.current) {
      push({ id: eid(), ts: pollTs, type: 'ENCODING_CHANGE', severity: 'warn',
        title: `Encoding changed: ${prevEncRef.current} → ${enc}`,
        detail: 'VicRoads changed response delivery — possible CDN or backend reconfiguration',
        data: { from: prevEncRef.current, to: enc } });
    }
    prevEncRef.current = enc;

    // Warning / Deprecation header
    const warnHeader = meta.headers?.['warning'] || meta.headers?.['deprecation'] || null;
    if (warnHeader) {
      push({ id: eid(), ts: pollTs, type: 'API_WARNING', severity: 'alert',
        title: 'API deprecation/warning header detected',
        detail: warnHeader,
        data: { header: warnHeader } });
    }

    // Rate limit headers
    const rlRemaining = meta.headers?.['x-ratelimit-remaining'];
    if (rlRemaining !== undefined && parseInt(rlRemaining) < 10) {
      push({ id: eid(), ts: pollTs, type: 'RATE_LIMIT_LOW', severity: 'warn',
        title: `Rate limit: ${rlRemaining} requests remaining`,
        detail: `Reset: ${meta.headers?.['x-ratelimit-reset'] || 'unknown'}`,
        data: { remaining: rlRemaining } });
    }

    // Feed error / recovery
    if (meta.status >= 400) {
      push({ id: eid(), ts: pollTs, type: 'FEED_ERROR', severity: 'alert',
        title: `Feed error: HTTP ${meta.status}`,
        detail: meta.status === 429 ? 'Rate limited by VicRoads' : 'Upstream returned an error',
        data: { status: meta.status, retryAfter: meta.headers?.['retry-after'] } });
    }
    if (prevStatusRef.current >= 400 && meta.status === 200) {
      push({ id: eid(), ts: pollTs, type: 'FEED_RECOVERED', severity: 'info',
        title: 'Feed recovered',
        detail: `Back to HTTP 200 after ${prevStatusRef.current}`,
        data: {} });
    }
    prevStatusRef.current = meta.status;

    // Schema change — new unknown property key
    for (const f of features.slice(0, 3)) {
      for (const k of Object.keys(f.properties || {})) {
        if (!knownFieldsRef.current.has(k)) {
          knownFieldsRef.current.add(k);
          push({ id: eid(), ts: pollTs, type: 'SCHEMA_CHANGE', severity: 'warn',
            title: `New API field: "${k}"`,
            detail: `VicRoads added a property not seen before — schema may have changed`,
            data: { field: k, sample: String(f.properties[k]).slice(0, 80) } });
        }
      }
    }

    // ── JOB-LEVEL SIGNALS ─────────────────────────────────────

    const currIds   = new Set();
    const prevIds   = new Set(prevSnap?.jobIds || []);
    const newJobs   = [];
    const clearedJobs = [];

    for (const f of features) {
      const id      = f.properties?.eventId;
      if (!id) continue;
      currIds.add(id);

      const coords      = f.geometry?.coordinates;   // [lng, lat]
      const desc        = f.properties?.description  || '';
      const road        = f.properties?.closedRoadName || '';
      const suburb      = f.properties?.reference?.startIntersectionLocality || '';
      const lastUpdated = f.properties?.lastUpdated;
      const existing    = jobStateRef.current.get(id);

      if (!existing) {
        const entry = { id, road, suburb, coords, desc, lastUpdated,
          firstSeen: pollTs, lastSeen: pollTs, appearances: 1,
          ghostFired: false, dupFired: false };
        jobStateRef.current.set(id, entry);
        newJobs.push(entry);

        // Flicker check — did this job vanish recently and come back?
        const gone = recentlyGoneRef.current.get(id);
        if (gone && pollTs - gone.ts < FLICKER_MS) {
          push({ id: eid(), ts: pollTs, type: 'JOB_FLICKERED', severity: 'warn',
            title: `Flickering job: ${road || id}`,
            detail: `${suburb} — disappeared then reappeared within ${Math.round((pollTs - gone.ts) / 1000)}s`,
            data: { id, road, suburb } });
        }
        recentlyGoneRef.current.delete(id);

        // Publication lag — check pager for a match
        const matchedPager = pagerRef.current.find(p => {
          if (!p.timestamp) return false;
          const pTs = new Date(p.timestamp).getTime();
          if (pTs >= pollTs || pollTs - pTs > LAG_WINDOW) return false;
          const pAddr = (p.parsed_address || '').toUpperCase();
          const rWords = road.toUpperCase().split(/\s+/).filter(w => w.length >= 4);
          return rWords.some(w => pAddr.includes(w));
        });
        if (matchedPager) {
          const lagMs = pollTs - new Date(matchedPager.timestamp).getTime();
          lagSamplesRef.current = [...lagSamplesRef.current, lagMs].slice(-50);
          const samples = lagSamplesRef.current;
          const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
          const min = Math.min(...samples);
          const max = Math.max(...samples);
          setLagStats({ samples, avg, min, max });
          push({ id: eid(), ts: pollTs, type: 'PUBLICATION_LAG', severity: 'info',
            title: `Publication lag: ${Math.round(lagMs / 1000)}s`,
            detail: `Pager → VicRoads for ${road}, ${suburb} (avg ${Math.round(avg / 1000)}s)`,
            data: { lagMs, road, suburb, pagerTs: matchedPager.timestamp } });
        }

      } else {
        existing.lastSeen  = pollTs;
        existing.lastUpdated = lastUpdated;
        existing.appearances++;

        // Coordinate drift > 50m
        if (coords && existing.coords) {
          const [lng, lat]   = coords;
          const [plng, plat] = existing.coords;
          const km = haversineKm(lat, lng, plat, plng);
          if (km > 0.05) {
            push({ id: eid(), ts: pollTs, type: 'COORD_DRIFT', severity: 'warn',
              title: `Job moved ${(km * 1000).toFixed(0)}m: ${road || id}`,
              detail: `${suburb} — coordinates changed between polls`,
              data: { id, km, from: existing.coords, to: coords } });
            existing.coords = coords;
          }
        }

        // Description escalation — length increase + keyword
        if (desc && existing.desc && desc.length > existing.desc.length + 15) {
          const KEYS = ['ROLLOVER', 'FIRE', 'ENTRAPMENT', 'MULTI-VEHICLE', 'SERIOUS', 'FATAL', 'CLOSED', 'HAZMAT'];
          const newKw = KEYS.find(k => desc.toUpperCase().includes(k) && !existing.desc.toUpperCase().includes(k));
          push({ id: eid(), ts: pollTs, type: 'DESC_ESCALATION',
            severity: newKw ? 'alert' : 'warn',
            title: `Description updated${newKw ? ` — ${newKw}` : ''}: ${road}`,
            detail: desc.slice(0, 100),
            data: { id, road, suburb, keyword: newKw || null } });
        }
        if (desc) existing.desc = desc;

        // Ghost job
        if (!existing.ghostFired && pollTs - existing.firstSeen > GHOST_MS) {
          existing.ghostFired = true;
          push({ id: eid(), ts: pollTs, type: 'GHOST_JOB', severity: 'warn',
            title: `Ghost job: ${road || id}`,
            detail: `${suburb} — active ${Math.round((pollTs - existing.firstSeen) / 3600000)}h+`,
            data: { id, road, suburb, ageMs: pollTs - existing.firstSeen } });
        }
      }
    }

    // Cleared jobs
    for (const prevId of prevIds) {
      if (!currIds.has(prevId)) {
        const job = jobStateRef.current.get(prevId);
        if (job) {
          const durMs = pollTs - job.firstSeen;
          clearedJobs.push({ ...job, durMs });
          recentlyGoneRef.current.set(prevId, { ts: pollTs, job });
          push({ id: eid(), ts: pollTs, type: 'JOB_CLEARED', severity: 'info',
            title: `Cleared: ${job.road || prevId}`,
            detail: `${job.suburb} — was active ${durMs > 3600000 ? `${Math.round(durMs/3600000)}h` : `${Math.round(durMs/60000)}m`}`,
            data: { id: prevId, durMs, road: job.road, suburb: job.suburb } });
        }
        jobStateRef.current.delete(prevId);
      }
    }

    // New job events
    if (newJobs.length >= 3) {
      push({ id: eid(), ts: pollTs, type: 'BATCH_FLUSH', severity: 'warn',
        title: `Batch flush: ${newJobs.length} new jobs`,
        detail: newJobs.map(j => j.road || j.id).slice(0, 4).join(', ') + (newJobs.length > 4 ? `… +${newJobs.length - 4}` : ''),
        data: { count: newJobs.length } });
    } else {
      for (const j of newJobs) {
        push({ id: eid(), ts: pollTs, type: 'NEW_JOB', severity: 'info',
          title: `New job: ${j.road || j.id}`,
          detail: j.suburb || '',
          data: j });
      }
    }

    // Surge detection — >2σ above recent baseline
    const recentCounts = historyRef.current.slice(-12).map(s => s.activeCount);
    if (recentCounts.length >= 6) {
      const avg  = recentCounts.reduce((a, b) => a + b, 0) / recentCounts.length;
      const std  = Math.sqrt(recentCounts.reduce((a, b) => a + (b - avg) ** 2, 0) / recentCounts.length);
      const now  = currIds.size;
      if (now > avg + 2 * std && now > avg + 4) {
        push({ id: eid(), ts: pollTs, type: 'SURGE', severity: 'alert',
          title: `Activity surge: ${now} active jobs`,
          detail: `+${Math.round(now - avg)} above recent avg (${Math.round(avg)})`,
          data: { count: now, avg: Math.round(avg) } });
      }
    }

    // Duplicate coords detection
    const coordBucket = new Map();
    for (const f of features) {
      const c = f.geometry?.coordinates;
      const id = f.properties?.eventId;
      if (!c || !id) continue;
      const key = `${c[0].toFixed(3)},${c[1].toFixed(3)}`;
      if (coordBucket.has(key)) {
        const otherId = coordBucket.get(key);
        const a = jobStateRef.current.get(id);
        const b = jobStateRef.current.get(otherId);
        if (a && !a.dupFired && b && !b.dupFired) {
          a.dupFired = b.dupFired = true;
          push({ id: eid(), ts: pollTs, type: 'DUPLICATE_JOBS', severity: 'warn',
            title: 'Duplicate job coordinates',
            detail: `${f.properties?.closedRoadName || id} — two allocations at same location`,
            data: { id1: otherId, id2: id } });
        }
      }
      coordBucket.set(key, id);
    }

    // Store snapshot
    historyRef.current = [...historyRef.current, {
      ts: pollTs, meta, jobIds: [...currIds], activeCount: currIds.size,
    }].slice(-MAX_HISTORY);

    // Update metrics
    setMetrics({
      ts: pollTs,
      ttfb: meta.ttfb,
      totalTime: meta.totalTime,
      transferTime: meta.transferTime,
      bodyHash: meta.bodyHash,
      hashChanged,
      compressedSize: meta.compressedSize,
      uncompressedSize: meta.uncompressedSize,
      compressionRatio: meta.compressionRatio,
      age: ageS,
      cacheStatus,
      etag: meta.headers?.etag,
      via: meta.headers?.via,
      encoding: enc,
      serverTiming: meta.headers?.['server-timing'],
      traceId: meta.headers?.['x-request-id'] || meta.headers?.['x-correlation-id'],
      hasWarning: !!warnHeader,
      status: meta.status,
      avgTtfb,
      cadenceMs,
      pollCount: pollCountRef.current,
      hashChangeCount: hashTimes.current.length,
      lastHashChangeTs: hashTimes.current[hashTimes.current.length - 1] || null,
      activeJobs: currIds.size,
      maxAge: parseMaxAge(meta.headers?.['cache-control']),
      rlRemaining: rlRemaining != null ? parseInt(rlRemaining) : null,
    });

    // Job signals summary
    const allJobs = [...jobStateRef.current.values()];
    setJobSignals({
      ghosts: allJobs.filter(j => j.ghostFired && currIds.has(j.id)),
      total: currIds.size,
    });

  }, [push]);

  const poll = useCallback(async () => {
    if (!enabled) return;
    const t = Date.now();
    try {
      const res  = await fetch('/.netlify/functions/vicroads-allocations');
      const data = await res.json();
      processPoll(data, t);
    } catch (e) {
      push({ id: eid(), ts: t, type: 'POLL_FAILED', severity: 'alert',
        title: 'Poll failed', detail: e.message, data: { error: e.message } });
    }
  }, [enabled, processPoll, push]);

  useEffect(() => {
    if (!enabled) return;
    poll();
    refreshPager();
    const pi = setInterval(poll, POLL_MS);
    const ri = setInterval(refreshPager, 60_000);
    return () => { clearInterval(pi); clearInterval(ri); };
  }, [enabled, poll, refreshPager]);

  return { events, metrics, jobSignals, lagStats };
}

function parseMaxAge(cacheControl) {
  if (!cacheControl) return null;
  const m = cacheControl.match(/s-maxage=(\d+)|max-age=(\d+)/);
  return m ? parseInt(m[1] || m[2]) : null;
}
