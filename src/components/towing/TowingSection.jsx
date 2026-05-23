import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ACC, MUT, BRD, SURF } from '../../lib/styles';
import TowAllocationsTab from './TowAllocationsTab';
import TowAnalyticsTab from './TowAnalyticsTab';
import FleetTab from './FleetTab';
import { logAllocations, markAllocationsCleared, getRecentAllocations } from '../../lib/db/towing';

const API_URL = 'https://api.opendata.transport.vic.gov.au/api/opendata/roads/disruptions/unplanned/v3';
const API_KEY = import.meta.env.VITE_VICROADS_KEY || 'bb7fc352-3ce6-44d2-9628-63fefb64278d';
const POLL_MS = 60_000;

const TABS = [
  { id: 'allocations', label: '🚦 Tow Allocations' },
  { id: 'analytics',   label: '📊 Analytics' },
  { id: 'fleet',       label: '🚛 Fleet' },
];

export default function TowingSection({ isAdmin }) {
  const [tab, setTab] = useState('allocations');

  // ── Shared allocation state ────────────────────────────────────────────────
  const [allFeatures, setAllFeatures] = useState([]);
  const [liveIds,     setLiveIds]     = useState(new Set());
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState('');
  const [lastFetch,   setLastFetch]   = useState(null);
  const [countdown,   setCountdown]   = useState(POLL_MS / 1000);
  const prevLiveIdsRef = useRef(new Set());

  const mergeFeatures = (live, logged) => {
    const map = new Map();
    logged.forEach(f => { if (f.properties?.eventId) map.set(String(f.properties.eventId), f); });
    live.forEach(f => {
      if (!f.properties?.eventId) return;
      const id   = String(f.properties.eventId);
      const prev = map.get(id);
      map.set(id, prev?._logMeta ? { ...f, _logMeta: prev._logMeta } : f);
    });
    return [...map.values()];
  };

  useEffect(() => {
    getRecentAllocations(744)
      .then(logged => {
        setAllFeatures(prev => mergeFeatures([], [...prev, ...logged]));
        setLoading(false);
      })
      .catch(e => { console.warn('getRecentAllocations:', e.message); setLoading(false); });
  }, []);

  const fetchAllocations = useCallback(async () => {
    try {
      const res  = await fetch(API_URL, { headers: { KeyID: API_KEY } });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      const all  = data.data?.features || data.features || [];
      const live = all.filter(f => f.properties?.source?.sourceName === 'TowAllocation');
      const newLiveIds  = new Set(live.map(f => String(f.properties?.eventId)));
      const justCleared = [...prevLiveIdsRef.current].filter(id => !newLiveIds.has(id));
      if (justCleared.length) markAllocationsCleared(justCleared).catch(e => console.warn('markAllocationsCleared:', e));
      prevLiveIdsRef.current = newLiveIds;
      setLiveIds(newLiveIds);
      logAllocations(live).catch(e => console.warn('logAllocations:', e));
      setAllFeatures(prev => mergeFeatures(live, prev));
      setErr('');
      setLastFetch(new Date());
      setCountdown(POLL_MS / 1000);
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => {
    fetchAllocations();
    const poll = setInterval(fetchAllocations, POLL_MS);
    return () => clearInterval(poll);
  }, [fetchAllocations]);

  useEffect(() => {
    const t = setInterval(() => setCountdown(c => (c > 0 ? c - 1 : POLL_MS / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ background: SURF, borderBottom: '1px solid ' + BRD, overflowX: 'auto', overflowY: 'hidden', display: 'flex', scrollbarWidth: 'none' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flexShrink: 0, padding: '8px 14px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tab === t.id ? ACC : MUT, cursor: 'pointer', border: 'none', background: 'none', borderBottom: tab === t.id ? '2px solid ' + ACC : '2px solid transparent', fontFamily: "'IBM Plex Mono',monospace", whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {tab === 'allocations' && (
          <TowAllocationsTab
            allFeatures={allFeatures} liveIds={liveIds} loading={loading}
            err={err} lastFetch={lastFetch} countdown={countdown}
            fetchAllocations={fetchAllocations}
          />
        )}
        {tab === 'analytics' && (
          <TowAnalyticsTab allFeatures={allFeatures} liveIds={liveIds} loading={loading} />
        )}
        {tab === 'fleet' && <FleetTab isAdmin={isAdmin} />}
      </div>
    </div>
  );
}
