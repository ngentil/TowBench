import { useState, useEffect, useRef, useCallback } from 'react';
import { haversineKm } from '../lib/utils';
import { supabase } from '../lib/supabase';

const POLL_MS    = 30_000;
const MAX_EVENTS = 300;
const MAX_HISTORY = 60;
const GHOST_MS   = 2 * 60 * 60 * 1000;   // 2 h
const FLICKER_MS = 5 * 60 * 1000;        // 5 min
const LAG_WINDOW = 30 * 60 * 1000;       // 30 min pager look-back

// VicRoads v3 known schema fields
const KNOWN_FIELDS = new Set([
  'eventId','closedRoadName','reference','eventType','eventSubType','description',
  'numberLanesImpacted','impact','lastUpdated','status','geometry','melway',
]);

// VicEmergency severity order (lower index = more severe)
const EM_SEV_ORDER = ['Emergency Warning', 'Watch and Act', 'Advice', 'No Rating', ''];

let _evtId = 0;
const eid = () => `e${++_evtId}`;

export function useSignals(enabled) {
  const [events,       setEvents]       = useState([]);
  const [metrics,      setMetrics]      = useState(null);
  const [jobSignals,   setJobSignals]   = useState({ ghosts: [], total: 0 });
  const [lagStats,     setLagStats]     = useState({ samples: [], avg: null, min: null, max: null });
  const [vicEmMetrics, setVicEmMetrics] = useState(null);
  const [wazeMetrics,  setWazeMetrics]  = useState(null);
  const [wazeLagStats, setWazeLagStats] = useState({ samples: [], avg: null, min: null, max: null });
  const [liveJobs,     setLiveJobs]     = useState([]);  // cross-referenced current jobs
  const [liveEm,       setLiveEm]       = useState([]);  // EM road incidents not yet in VicRoads

  // ── VicRoads refs ───────────────────────────────────────────────────────────
  const historyRef      = useRef([]);
  const jobStateRef     = useRef(new Map());
  const recentlyGoneRef = useRef(new Map());
  const prevHashRef     = useRef(null);
  const prevEncRef      = useRef(null);
  const prevStatusRef   = useRef(null);
  const ttfbBuf         = useRef([]);
  const hashTimes       = useRef([]);
  const knownFieldsRef  = useRef(new Set(KNOWN_FIELDS));
  const pagerRef        = useRef([]);
  const lagSamplesRef   = useRef([]);

  // ── VicEmergency refs ───────────────────────────────────────────────────────
  const vicEmIncRef      = useRef(new Map());  // id → { id, name, cat, severity, suburb, lat, lng, firstSeen }
  const prevVicEmHashRef = useRef(null);
  const vicEmTtfbBuf     = useRef([]);
  const prevVicEmStatus  = useRef(null);
  const vicEmHistRef     = useRef([]);

  // ── Waze refs ───────────────────────────────────────────────────────────────
  const wazeAlertsRef  = useRef(new Map());  // uuid → alert object
  const prevWazeStatus = useRef(null);
  const wazeLagRef     = useRef([]);
  const wazeHistRef    = useRef([]);

  // ── Shared ──────────────────────────────────────────────────────────────────
  const pollCountRef = useRef(0);

  const push = useCallback((ev) => {
    setEvents(prev => [ev, ...prev].slice(0, MAX_EVENTS));
  }, []);

  // ── Pager refresh (for publication lag) ────────────────────────────────────
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

  // ── VicRoads processing ─────────────────────────────────────────────────────
  const processVicRoadsPoll = useCallback((raw, pollTs) => {
    const meta     = raw._meta || {};
    const features = raw.features || [];

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
        data: { hash: meta.bodyHash, source: 'vicroads' } });
    }
    if (meta.bodyHash) prevHashRef.current = meta.bodyHash;

    // Cadence estimate
    let cadenceMs = null;
    if (hashTimes.current.length >= 2) {
      const gaps = hashTimes.current.slice(1).map((t, i) => t - hashTimes.current[i]);
      cadenceMs = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    }

    // Latency spike
    if (avgTtfb && meta.ttfb && meta.ttfb > avgTtfb * 2.5 && meta.ttfb > 1500) {
      push({ id: eid(), ts: pollTs, type: 'LATENCY_SPIKE', severity: 'warn',
        title: `Latency spike: ${meta.ttfb}ms TTFB`,
        detail: `${Math.round(meta.ttfb / avgTtfb)}× above rolling avg (${avgTtfb}ms)`,
        data: { ttfb: meta.ttfb, avg: avgTtfb, source: 'vicroads' } });
    }

    // CDN staleness
    const ageS = meta.headers?.['age'] != null ? parseInt(meta.headers['age']) : null;
    if (ageS !== null && ageS > 90) {
      push({ id: eid(), ts: pollTs, type: 'HIGH_CDN_AGE', severity: 'warn',
        title: `CDN serving ${ageS}s-old data`,
        detail: 'VicRoads CDN cached this response before serving it to us',
        data: { age: ageS, source: 'vicroads' } });
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
        data: { cacheStatus, source: 'vicroads' } });
    }

    // Transfer-encoding change
    const enc = meta.headers?.['transfer-encoding'] || meta.headers?.['content-encoding'] || 'none';
    if (prevEncRef.current !== null && enc !== prevEncRef.current) {
      push({ id: eid(), ts: pollTs, type: 'ENCODING_CHANGE', severity: 'warn',
        title: `Encoding changed: ${prevEncRef.current} → ${enc}`,
        detail: 'VicRoads changed response delivery — possible CDN or backend reconfiguration',
        data: { from: prevEncRef.current, to: enc, source: 'vicroads' } });
    }
    prevEncRef.current = enc;

    // Warning / Deprecation header
    const warnHeader = meta.headers?.['warning'] || meta.headers?.['deprecation'] || null;
    if (warnHeader) {
      push({ id: eid(), ts: pollTs, type: 'API_WARNING', severity: 'alert',
        title: 'API deprecation/warning header detected',
        detail: warnHeader,
        data: { header: warnHeader, source: 'vicroads' } });
    }

    // Rate limit headers
    const rlRemaining = meta.headers?.['x-ratelimit-remaining'];
    if (rlRemaining !== undefined && parseInt(rlRemaining) < 10) {
      push({ id: eid(), ts: pollTs, type: 'RATE_LIMIT_LOW', severity: 'warn',
        title: `Rate limit: ${rlRemaining} requests remaining`,
        detail: `Reset: ${meta.headers?.['x-ratelimit-reset'] || 'unknown'}`,
        data: { remaining: rlRemaining, source: 'vicroads' } });
    }

    // Feed error / recovery
    if (meta.status >= 400) {
      push({ id: eid(), ts: pollTs, type: 'FEED_ERROR', severity: 'alert',
        title: `Feed error: HTTP ${meta.status}`,
        detail: meta.status === 429 ? 'Rate limited by VicRoads' : 'Upstream returned an error',
        data: { status: meta.status, source: 'vicroads' } });
    }
    if (prevStatusRef.current >= 400 && meta.status === 200) {
      push({ id: eid(), ts: pollTs, type: 'FEED_RECOVERED', severity: 'info',
        title: 'Feed recovered',
        detail: `Back to HTTP 200 after ${prevStatusRef.current}`,
        data: { source: 'vicroads' } });
    }
    prevStatusRef.current = meta.status;

    // Schema change
    for (const f of features.slice(0, 3)) {
      for (const k of Object.keys(f.properties || {})) {
        if (!knownFieldsRef.current.has(k)) {
          knownFieldsRef.current.add(k);
          push({ id: eid(), ts: pollTs, type: 'SCHEMA_CHANGE', severity: 'warn',
            title: `New API field: "${k}"`,
            detail: 'VicRoads added a property not seen before — schema may have changed',
            data: { field: k, sample: String(f.properties[k]).slice(0, 80), source: 'vicroads' } });
        }
      }
    }

    // ── Job-level signals ──────────────────────────────────────────────────────
    const currIds = new Set();
    const prevIds = new Set(prevSnap?.jobIds || []);
    const newJobs = [];

    for (const f of features) {
      const id  = f.properties?.eventId;
      if (!id) continue;
      currIds.add(id);

      const coords      = f.geometry?.coordinates;
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

        // Flicker check
        const gone = recentlyGoneRef.current.get(id);
        if (gone && pollTs - gone.ts < FLICKER_MS) {
          push({ id: eid(), ts: pollTs, type: 'JOB_FLICKERED', severity: 'warn',
            title: `Flickering job: ${road || id}`,
            detail: `${suburb} — disappeared then reappeared within ${Math.round((pollTs - gone.ts) / 1000)}s`,
            data: { id, road, suburb } });
        }
        recentlyGoneRef.current.delete(id);

        // Publication lag (pager → VicRoads)
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
          setLagStats({ samples, avg, min: Math.min(...samples), max: Math.max(...samples) });
          push({ id: eid(), ts: pollTs, type: 'PUBLICATION_LAG', severity: 'info',
            title: `Publication lag: ${Math.round(lagMs / 1000)}s`,
            detail: `Pager → VicRoads for ${road}, ${suburb} (avg ${Math.round(avg / 1000)}s)`,
            data: { lagMs, road, suburb, pagerTs: matchedPager.timestamp } });
        }

      } else {
        existing.lastSeen    = pollTs;
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

        // Description escalation
        if (desc && existing.desc && desc.length > existing.desc.length + 15) {
          const KEYS = ['ROLLOVER','FIRE','ENTRAPMENT','MULTI-VEHICLE','SERIOUS','FATAL','CLOSED','HAZMAT'];
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
          recentlyGoneRef.current.set(prevId, { ts: pollTs, job });
          push({ id: eid(), ts: pollTs, type: 'JOB_CLEARED', severity: 'info',
            title: `Cleared: ${job.road || prevId}`,
            detail: `${job.suburb} — was active ${durMs > 3600000 ? `${Math.round(durMs/3600000)}h` : `${Math.round(durMs/60000)}m`}`,
            data: { id: prevId, durMs, road: job.road, suburb: job.suburb } });
        }
        jobStateRef.current.delete(prevId);
      }
    }

    // Batch flush or individual new job events
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

    // Surge detection
    const recentCounts = historyRef.current.slice(-12).map(s => s.activeCount);
    if (recentCounts.length >= 6) {
      const avg = recentCounts.reduce((a, b) => a + b, 0) / recentCounts.length;
      const std = Math.sqrt(recentCounts.reduce((a, b) => a + (b - avg) ** 2, 0) / recentCounts.length);
      const now = currIds.size;
      if (now > avg + 2 * std && now > avg + 4) {
        push({ id: eid(), ts: pollTs, type: 'SURGE', severity: 'alert',
          title: `Activity surge: ${now} active jobs`,
          detail: `+${Math.round(now - avg)} above recent avg (${Math.round(avg)})`,
          data: { count: now, avg: Math.round(avg) } });
      }
    }

    // Duplicate coordinates
    const coordBucket = new Map();
    for (const f of features) {
      const c  = f.geometry?.coordinates;
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
      ts:               pollTs,
      ttfb:             meta.ttfb,
      totalTime:        meta.totalTime,
      transferTime:     meta.transferTime,
      bodyHash:         meta.bodyHash,
      hashChanged,
      compressedSize:   meta.compressedSize,
      uncompressedSize: meta.uncompressedSize,
      compressionRatio: meta.compressionRatio,
      age:              ageS,
      cacheStatus,
      etag:             meta.headers?.etag,
      via:              meta.headers?.via,
      encoding:         enc,
      serverTiming:     meta.headers?.['server-timing'],
      traceId:          meta.headers?.['x-request-id'] || meta.headers?.['x-correlation-id'],
      hasWarning:       !!warnHeader,
      status:           meta.status,
      avgTtfb,
      cadenceMs,
      pollCount:        pollCountRef.current,
      hashChangeCount:  hashTimes.current.length,
      lastHashChangeTs: hashTimes.current[hashTimes.current.length - 1] || null,
      activeJobs:       currIds.size,
      maxAge:           parseMaxAge(meta.headers?.['cache-control']),
      rlRemaining:      rlRemaining != null ? parseInt(rlRemaining) : null,
    });

    setJobSignals({
      ghosts: [...jobStateRef.current.values()].filter(j => j.ghostFired && currIds.has(j.id)),
      total:  currIds.size,
    });

    return { newJobs, currIds, ttfb: meta.ttfb, avgTtfb };
  }, [push]);

  // ── VicEmergency processing ─────────────────────────────────────────────────
  const processVicEmPoll = useCallback((raw, pollTs) => {
    const meta      = raw._meta || {};
    const incidents = raw.incidents || [];

    // TTFB tracking
    if (meta.ttfb != null) {
      vicEmTtfbBuf.current = [...vicEmTtfbBuf.current, meta.ttfb].slice(-20);
    }
    const avgTtfb = vicEmTtfbBuf.current.length
      ? Math.round(vicEmTtfbBuf.current.reduce((a, b) => a + b, 0) / vicEmTtfbBuf.current.length)
      : null;

    // Hash change
    const hashChanged = !!meta.bodyHash && meta.bodyHash !== prevVicEmHashRef.current;
    if (hashChanged && prevVicEmHashRef.current !== null) {
      push({ id: eid(), ts: pollTs, type: 'VIC_EM_UPDATED', severity: 'info',
        title: 'VicEmergency feed updated',
        detail: 'Incident data changed since last check',
        data: { hash: meta.bodyHash, source: 'vicemergency' } });
    }
    if (meta.bodyHash) prevVicEmHashRef.current = meta.bodyHash;

    // Error / recovery
    if (meta.status >= 400) {
      push({ id: eid(), ts: pollTs, type: 'VIC_EM_ERROR', severity: 'alert',
        title: `VicEmergency error: HTTP ${meta.status}`,
        detail: 'VicEmergency feed returned an error',
        data: { status: meta.status, source: 'vicemergency' } });
    }
    if (prevVicEmStatus.current !== null && prevVicEmStatus.current >= 400 && (meta.status || 200) === 200) {
      push({ id: eid(), ts: pollTs, type: 'VIC_EM_RECOVERED', severity: 'info',
        title: 'VicEmergency feed recovered',
        detail: `Back to normal after HTTP ${prevVicEmStatus.current}`,
        data: { source: 'vicemergency' } });
    }
    prevVicEmStatus.current = meta.status || 200;

    // Track incidents
    const currIds  = new Set();
    const prevIds  = new Set(vicEmIncRef.current.keys());
    const newIncs  = [];

    for (const inc of incidents) {
      const id = String(inc.id || inc.sourceId || '');
      if (!id) continue;
      currIds.add(id);

      const lat      = inc.location?.latitude  ?? inc.lat  ?? null;
      const lng      = inc.location?.longitude ?? inc.lng  ?? null;
      const name     = inc.name || inc.title || '';
      const cat      = inc.category1 || inc.category2 || 'OTHER';
      const sev      = inc.severity || '';
      const suburb   = inc.location?.suburb || '';
      const existing = vicEmIncRef.current.get(id);

      if (!existing) {
        const entry = { id, name, cat, severity: sev, suburb, lat, lng, firstSeen: pollTs };
        vicEmIncRef.current.set(id, entry);
        newIncs.push(entry);
      } else {
        // Severity escalation (lower index in SEV_ORDER = more severe)
        const prevIdx = EM_SEV_ORDER.indexOf(existing.severity);
        const newIdx  = EM_SEV_ORDER.indexOf(sev);
        if (newIdx >= 0 && prevIdx >= 0 && newIdx < prevIdx) {
          push({ id: eid(), ts: pollTs, type: 'VIC_EM_ESCALATED', severity: 'alert',
            title: `Incident escalated: ${name || cat}`,
            detail: `${suburb} — ${existing.severity} → ${sev}`,
            data: { id, name, suburb, from: existing.severity, to: sev, source: 'vicemergency' } });
        }
        existing.severity = sev;
      }
    }

    // New incident events (only push ACCIDENT/CRASH/HAZMAT types to avoid noise from fire/storm)
    for (const inc of newIncs) {
      const catUp = inc.cat.toUpperCase();
      const isRoadRelated = ['ACCIDENT','CRASH','HAZMAT','INCIDENT'].some(k => catUp.includes(k));
      push({ id: eid(), ts: pollTs,
        type: 'VIC_EM_NEW', severity: isRoadRelated ? 'warn' : 'info',
        title: `VicEmergency: ${inc.name || inc.cat}`,
        detail: [inc.suburb, inc.severity].filter(Boolean).join(' · '),
        data: { id: inc.id, name: inc.name, cat: inc.cat, suburb: inc.suburb,
          lat: inc.lat, lng: inc.lng, source: 'vicemergency' } });
    }

    // Cleared incidents (silent for most; notify for road-related only)
    for (const prevId of prevIds) {
      if (!currIds.has(prevId)) {
        const inc = vicEmIncRef.current.get(prevId);
        if (inc) {
          const catUp = inc.cat.toUpperCase();
          if (['ACCIDENT','CRASH','HAZMAT','INCIDENT'].some(k => catUp.includes(k))) {
            push({ id: eid(), ts: pollTs, type: 'VIC_EM_CLEARED', severity: 'info',
              title: `VicEmergency cleared: ${inc.name || prevId}`,
              detail: inc.suburb || '',
              data: { id: prevId, source: 'vicemergency' } });
          }
          vicEmIncRef.current.delete(prevId);
        }
      }
    }

    // Surge detection (relative to recent history)
    const recentCounts = vicEmHistRef.current.slice(-6).map(s => s.count);
    if (recentCounts.length >= 4) {
      const avg = recentCounts.reduce((a, b) => a + b, 0) / recentCounts.length;
      const std = Math.sqrt(recentCounts.reduce((a, b) => a + (b - avg) ** 2, 0) / recentCounts.length);
      if (currIds.size > avg + 2 * std && currIds.size > avg + 3) {
        push({ id: eid(), ts: pollTs, type: 'VIC_EM_SURGE', severity: 'alert',
          title: `VicEmergency surge: ${currIds.size} active incidents`,
          detail: `+${Math.round(currIds.size - avg)} above recent average — elevated state-wide activity`,
          data: { count: currIds.size, avg: Math.round(avg), source: 'vicemergency' } });
      }
    }

    vicEmHistRef.current = [...vicEmHistRef.current, { ts: pollTs, count: currIds.size }].slice(-MAX_HISTORY);

    // Category breakdown for metrics
    const catCounts = {};
    for (const [, inc] of vicEmIncRef.current) {
      const k = inc.cat.toUpperCase().split(' ')[0] || 'OTHER';
      catCounts[k] = (catCounts[k] || 0) + 1;
    }

    // TTFB spike on VicEmergency
    if (avgTtfb && meta.ttfb && meta.ttfb > avgTtfb * 2.5 && meta.ttfb > 1500) {
      push({ id: eid(), ts: pollTs, type: 'VIC_EM_LATENCY', severity: 'warn',
        title: `VicEmergency latency spike: ${meta.ttfb}ms`,
        detail: `${Math.round(meta.ttfb / avgTtfb)}× above rolling avg (${avgTtfb}ms)`,
        data: { ttfb: meta.ttfb, avg: avgTtfb, source: 'vicemergency' } });
    }

    setVicEmMetrics({
      ts:               pollTs,
      ttfb:             meta.ttfb,
      avgTtfb,
      bodyHash:         meta.bodyHash,
      hashChanged,
      uncompressedSize: meta.uncompressedSize,
      status:           meta.status || 200,
      activeIncidents:  currIds.size,
      cacheStatus:      meta.headers?.['cf-cache-status'] || meta.headers?.['x-cache'] || null,
      age:              meta.headers?.['age'] != null ? parseInt(meta.headers['age']) : null,
      etag:             meta.headers?.etag,
      catCounts,
    });

    return { newIncs, currIds, ttfb: meta.ttfb, avgTtfb };
  }, [push]);

  // ── Waze processing ─────────────────────────────────────────────────────────
  const processWazePoll = useCallback((raw, pollTs) => {
    const alerts = raw.alerts || [];

    // Error / recovery
    if (raw.error) {
      push({ id: eid(), ts: pollTs, type: 'WAZE_ERROR', severity: 'warn',
        title: 'Waze data unavailable',
        detail: raw.error,
        data: { source: 'waze' } });
      prevWazeStatus.current = 'error';
    } else if (prevWazeStatus.current === 'error') {
      push({ id: eid(), ts: pollTs, type: 'WAZE_RECOVERED', severity: 'info',
        title: 'Waze feed recovered',
        detail: `${alerts.length} alerts now available`,
        data: { source: 'waze' } });
      prevWazeStatus.current = 'ok';
    } else {
      prevWazeStatus.current = 'ok';
    }

    // Budget warning
    if (raw.budgetExhausted) {
      // Only push once per session — check if we've already seen exhausted
      const alreadyWarned = wazeHistRef.current.some(h => h.exhausted);
      if (!alreadyWarned) {
        push({ id: eid(), ts: pollTs, type: 'WAZE_BUDGET_EXHAUSTED', severity: 'warn',
          title: `Waze budget exhausted (${raw.budgetCount}/${raw.budgetMax} this month)`,
          detail: 'Waze data is now served from last-cached snapshot — may be stale',
          data: { count: raw.budgetCount, max: raw.budgetMax, source: 'waze' } });
      }
    }

    // Track alerts by uuid
    const currUuids = new Set();
    const prevUuids = new Set(wazeAlertsRef.current.keys());
    const newAlerts = [];

    for (const alert of alerts) {
      const uuid = alert.uuid || alert.id;
      if (!uuid) continue;
      currUuids.add(uuid);
      if (!wazeAlertsRef.current.has(uuid)) {
        wazeAlertsRef.current.set(uuid, alert);
        newAlerts.push(alert);
      }
    }

    // Cleared alerts — only notify for ACCIDENT/HAZARD
    for (const prevUuid of prevUuids) {
      if (!currUuids.has(prevUuid)) {
        const alert = wazeAlertsRef.current.get(prevUuid);
        wazeAlertsRef.current.delete(prevUuid);
        if (alert && ['ACCIDENT', 'HAZARD'].includes(alert.type)) {
          push({ id: eid(), ts: pollTs, type: 'WAZE_CLEARED', severity: 'info',
            title: `Waze cleared: ${alert.type}${alert.subtype ? '/' + alert.subtype : ''}`,
            detail: alert.street || '',
            data: { uuid: prevUuid, type: alert.type, source: 'waze' } });
        }
      }
    }

    // New ACCIDENT/HAZARD alerts
    for (const alert of newAlerts) {
      if (['ACCIDENT', 'HAZARD'].includes(alert.type)) {
        push({ id: eid(), ts: pollTs, type: 'WAZE_NEW', severity: 'info',
          title: `Waze: ${alert.type}${alert.subtype ? '/' + alert.subtype : ''}`,
          detail: alert.street || alert.city || '',
          data: { uuid: alert.uuid, type: alert.type, subtype: alert.subtype,
            street: alert.street, location: alert.location, pubMillis: alert.pubMillis,
            source: 'waze' } });
      }
    }

    // Surge detection
    const recentWazeCounts = wazeHistRef.current.slice(-4).map(h => h.count);
    if (recentWazeCounts.length >= 3) {
      const avg = recentWazeCounts.reduce((a, b) => a + b, 0) / recentWazeCounts.length;
      if (currUuids.size > avg * 1.4 && currUuids.size > avg + 20) {
        push({ id: eid(), ts: pollTs, type: 'WAZE_SURGE', severity: 'warn',
          title: `Waze alert surge: ${currUuids.size} alerts`,
          detail: `+${Math.round(currUuids.size - avg)} above recent average — elevated road reports`,
          data: { count: currUuids.size, avg: Math.round(avg), source: 'waze' } });
      }
    }

    // Type breakdown for metrics
    const typeCounts = {};
    for (const [, a] of wazeAlertsRef.current) {
      const k = a.type || 'OTHER';
      typeCounts[k] = (typeCounts[k] || 0) + 1;
    }

    wazeHistRef.current = [...wazeHistRef.current, {
      ts: pollTs, count: currUuids.size, exhausted: !!raw.budgetExhausted,
    }].slice(-MAX_HISTORY);

    setWazeMetrics({
      ts:              pollTs,
      activeAlerts:    currUuids.size,
      newAlerts:       newAlerts.length,
      budgetCount:     raw.budgetCount ?? null,
      budgetMax:       raw.budgetMax ?? null,
      budgetExhausted: !!raw.budgetExhausted,
      cachedAt:        raw.cachedAt ?? null,
      typeCounts,
    });

    return { newAlerts, currUuids };
  }, [push]);

  // ── Cross-correlation ───────────────────────────────────────────────────────
  const runCorrelation = useCallback((vrResult, emResult, wazeResult, pollTs) => {
    // VicRoads × VicEmergency — new allocation near existing incident
    if (vrResult && emResult) {
      for (const job of vrResult.newJobs) {
        if (!job.coords) continue;
        const [jLng, jLat] = job.coords;
        for (const [, inc] of vicEmIncRef.current) {
          if (inc.lat == null || inc.lng == null) continue;
          const km = haversineKm(jLat, jLng, inc.lat, inc.lng);
          if (km < 0.5) {
            push({ id: eid(), ts: pollTs, type: 'CROSS_CONFIRMED', severity: 'warn',
              title: `Multi-source confirmed: ${job.road}`,
              detail: `VicRoads allocation + VicEmergency "${inc.name || inc.cat}" within ${(km * 1000).toFixed(0)}m — scene verified by 2 agencies`,
              data: { jobId: job.id, incId: inc.id, km, road: job.road, incName: inc.name } });
            break;
          }
        }
      }

      // New VicEmergency incident near existing VicRoads job
      for (const inc of emResult.newIncs) {
        if (inc.lat == null || inc.lng == null) continue;
        for (const [, job] of jobStateRef.current) {
          if (!job.coords) continue;
          const [jLng, jLat] = job.coords;
          const km = haversineKm(inc.lat, inc.lng, jLat, jLng);
          if (km < 0.5) {
            push({ id: eid(), ts: pollTs, type: 'CROSS_CONFIRMED', severity: 'warn',
              title: `Multi-source confirmed: ${job.road}`,
              detail: `VicEmergency "${inc.name || inc.cat}" + VicRoads allocation within ${(km * 1000).toFixed(0)}m`,
              data: { jobId: job.id, incId: inc.id, km, road: job.road, incName: inc.name } });
            break;
          }
        }
      }
    }

    // Waze × VicRoads — Waze alert before VicRoads allocation = Waze is a lead source
    if (vrResult && wazeResult) {
      for (const job of vrResult.newJobs) {
        if (!job.coords) continue;
        const [jLng, jLat] = job.coords;
        for (const [, alert] of wazeAlertsRef.current) {
          if (!alert.location || !alert.pubMillis) continue;
          const km = haversineKm(jLat, jLng, alert.location.y, alert.location.x);
          if (km < 0.35) {
            const lagMs = pollTs - alert.pubMillis;
            if (lagMs > 0 && lagMs < LAG_WINDOW) {
              wazeLagRef.current = [...wazeLagRef.current, lagMs].slice(-50);
              const samples = wazeLagRef.current;
              const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
              setWazeLagStats({ samples, avg, min: Math.min(...samples), max: Math.max(...samples) });
              push({ id: eid(), ts: pollTs, type: 'WAZE_LEAD', severity: 'info',
                title: `Waze lead: ${Math.round(lagMs / 1000)}s before VicRoads`,
                detail: `"${alert.type}${alert.subtype ? '/' + alert.subtype : ''}" at ${alert.street || job.road}`,
                data: { jobId: job.id, alertUuid: alert.uuid, lagMs,
                  street: alert.street, road: job.road } });
              break;
            }
          }
        }
      }
    }
  }, [push]);

  // ── Infrastructure correlation ──────────────────────────────────────────────
  const checkInfraCorrelation = useCallback((vrR, emR, pollTs) => {
    if (!vrR || !emR) return;
    const { ttfb: vrTtfb, avgTtfb: vrAvg } = vrR;
    const { ttfb: emTtfb, avgTtfb: emAvg } = emR;
    if (!vrTtfb || !emTtfb || !vrAvg || !emAvg) return;
    if (vrTtfb > vrAvg * 2.5 && emTtfb > emAvg * 2 && vrTtfb > 800) {
      push({ id: eid(), ts: pollTs, type: 'INFRA_CORR', severity: 'warn',
        title: 'Simultaneous latency spike: VicRoads + VicEmergency',
        detail: `VicRoads ${vrTtfb}ms (${Math.round(vrTtfb/vrAvg)}× avg) · VicEmergency ${emTtfb}ms — shared CDN or network event`,
        data: { vrTtfb, emTtfb, vrAvg, emAvg } });
    }
  }, [push]);

  // ── Main poll ───────────────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    if (!enabled) return;
    pollCountRef.current++;
    const n = pollCountRef.current;
    const t = Date.now();

    // VicEmergency every 2nd cycle (60s); Waze every 4th (120s); both on first poll
    const doEm   = n === 1 || n % 2 === 0;
    const doWaze = n === 1 || n % 4 === 0;

    const safe = fn => fn().catch(e => ({ _error: e.message }));

    const [vrRaw, emRaw, wazeRaw] = await Promise.all([
      safe(() => fetch('/.netlify/functions/vicroads-allocations').then(r => r.json())),
      doEm   ? safe(() => fetch('/.netlify/functions/vic-emergency').then(r => r.json()))   : Promise.resolve(null),
      doWaze ? safe(() => fetch('/.netlify/functions/waze-alerts').then(r => r.json()))     : Promise.resolve(null),
    ]);

    let vrResult = null, emResult = null, wazeResult = null;

    if (vrRaw && !vrRaw._error) {
      try { vrResult = processVicRoadsPoll(vrRaw, t); } catch { /* silent */ }
    } else if (vrRaw?._error) {
      push({ id: eid(), ts: t, type: 'POLL_FAILED', severity: 'alert',
        title: 'VicRoads poll failed', detail: vrRaw._error, data: { error: vrRaw._error } });
    }

    if (emRaw && !emRaw._error) {
      try { emResult = processVicEmPoll(emRaw, t); } catch { /* silent */ }
    }

    if (wazeRaw && !wazeRaw._error) {
      try { wazeResult = processWazePoll(wazeRaw, t); } catch { /* silent */ }
    }

    // Cross-source correlation
    try { runCorrelation(vrResult, emResult, wazeResult, t); } catch { /* silent */ }

    // Infrastructure correlation
    try { checkInfraCorrelation(vrResult, emResult, t); } catch { /* silent */ }

    // Live view — rebuild every cycle (VicRoads always polled, refs always current)
    if (vrResult) {
      try {
        const activeIds = vrResult.currIds;
        const ROAD_CATS = ['ACCIDENT', 'CRASH', 'HAZMAT', 'INCIDENT', 'COLLISION'];

        const unified = [...jobStateRef.current.values()]
          .filter(j => activeIds.has(j.id))
          .map(job => {
            let emMatch = null, wazeMatch = null;
            if (job.coords) {
              const [jLng, jLat] = job.coords;
              for (const [, inc] of vicEmIncRef.current) {
                if (inc.lat == null || inc.lng == null) continue;
                if (haversineKm(jLat, jLng, inc.lat, inc.lng) < 0.5) { emMatch = inc; break; }
              }
              for (const [, alert] of wazeAlertsRef.current) {
                if (!alert.location) continue;
                if (haversineKm(jLat, jLng, alert.location.y, alert.location.x) < 0.35) { wazeMatch = alert; break; }
              }
            }
            const sources = ['vicroads'];
            if (emMatch) sources.push('vicemergency');
            if (wazeMatch) sources.push('waze');
            return { ...job, emMatch, wazeMatch, sources };
          })
          .sort((a, b) => b.sources.length - a.sources.length || a.firstSeen - b.firstSeen);

        setLiveJobs(unified);

        // VicEmergency road incidents not matched to any active VicRoads job
        const emOnly = [...vicEmIncRef.current.values()].filter(inc => {
          if (!ROAD_CATS.some(k => inc.cat.toUpperCase().includes(k))) return false;
          if (inc.lat == null || inc.lng == null) return true;
          return !unified.some(j => j.emMatch?.id === inc.id);
        });
        setLiveEm(emOnly);
      } catch { /* silent */ }
    }
  }, [enabled, push, processVicRoadsPoll, processVicEmPoll, processWazePoll, runCorrelation, checkInfraCorrelation]);

  useEffect(() => {
    if (!enabled) return;
    poll();
    refreshPager();
    const pi = setInterval(poll, POLL_MS);
    const ri = setInterval(refreshPager, 60_000);
    return () => { clearInterval(pi); clearInterval(ri); };
  }, [enabled, poll, refreshPager]);

  return { events, metrics, jobSignals, lagStats, vicEmMetrics, wazeMetrics, wazeLagStats, liveJobs, liveEm };
}

function parseMaxAge(cacheControl) {
  if (!cacheControl) return null;
  const m = cacheControl.match(/s-maxage=(\d+)|max-age=(\d+)/);
  return m ? parseInt(m[1] || m[2]) : null;
}
