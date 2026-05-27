import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ACC, MUT, BRD, SURF } from '../../lib/styles';
import TowAllocationsTab from './TowAllocationsTab';
import FleetTab from './FleetTab';
import DepotsTab from './DepotsTab';
import { logAllocations, markAllocationsCleared, getRecentAllocations } from '../../lib/db/towing';
import { supabase } from '../../lib/supabase';
import OpsTab from './OpsTab';
import TowAnalyticsTab from './TowAnalyticsTab';
import TowInsTab from './TowInsTab';
import DriversTab from './DriversTab';
import ActiveTowsTab from './ActiveTowsTab';
import BrandingTab from '../admin/BrandingTab';
import PricingTab from '../admin/PricingTab';
import DriverApprovalsTab from '../admin/DriverApprovalsTab';
import { VICROADS_URL, VICROADS_KEY } from '../../lib/constants';

const POLL_MS = 60_000;

export default function TowingSection({ role, isAdmin, isDispatch, userEmail, companyId, companyConfig, setCompanyConfig }) {
  // Tab visibility by role:
  //   driver:    Allocations only
  //   dispatch:  Allocations, Map, Analytics, Fleet
  //   admin:     All above + Settings
  //   super_admin: All tabs
  const allocLabel = (role === 'driver') ? '🚦 Tow Allocations' : '🚨 Dispatch';
  const TABS = [
    { id: 'allocations',  label: allocLabel,             roles: ['driver','dispatch','admin','super_admin'] },
    { id: 'activetows',   label: '🚛 Active Tows',      roles: ['dispatch','admin','super_admin'] },
    { id: 'towins',       label: '🏭 Tow Ins',          roles: ['driver','dispatch','admin','super_admin'] },
    { id: 'drivers',      label: '👤 Drivers',          roles: ['dispatch','admin','super_admin'] },
    { id: 'depots',       label: '🏢 Depots',           roles: ['dispatch','admin','super_admin'] },
    { id: 'fleet',        label: '🚛 Fleet',             roles: ['dispatch','admin','super_admin'] },
    { id: 'ops',          label: '🗺 Map',              roles: ['dispatch','admin','super_admin'] },
    { id: 'analytics',    label: '📊 Analytics',        roles: ['dispatch','admin','super_admin'] },
    { id: 'pricing',      label: '💰 Pricing',          roles: ['admin','super_admin'] },
    { id: 'branding',     label: '🎨 Branding',         roles: ['admin','super_admin'] },
    { id: 'approvals',    label: '✅ Approvals',         roles: ['admin','super_admin'] },
  ].filter(t => !role || t.roles.includes(role));

  const [tab, setTab] = useState('allocations');

  useEffect(() => {
    const ids = TABS.map(t => t.id);
    if (!ids.includes(tab)) setTab('allocations');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shared allocation state ─────────────────────────────────────────────
  const [allFeatures,  setAllFeatures]  = useState([]);
  const [liveIds,      setLiveIds]      = useState(new Set());
  const [loading,      setLoading]      = useState(true);
  const [err,          setErr]          = useState('');
  const [lastFetch,    setLastFetch]    = useState(null);
  const [countdown,    setCountdown]    = useState(POLL_MS / 1000);
  const [acceptedJobs, setAcceptedJobs] = useState(new Map());
  const prevLiveIdsRef = useRef(new Set());

  const fetchAcceptedJobs = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('job_accepted')
        .select('id, event_id, accepted_by, accepted_at, company_id')
        .is('released_at', null);
      if (data) {
        const map = new Map();
        data.forEach(row => map.set(String(row.event_id), row));
        setAcceptedJobs(map);
      }
    } catch (e) { console.warn('fetchAcceptedJobs:', e.message); }
  }, []);

  const onAcceptJob = useCallback(async (eventId, daPin, truckDaNumber) => {
    if (!userEmail) return { ok: false, err: 'Not logged in' };
    const last4 = String(truckDaNumber || '').slice(-4);
    if (last4 && daPin !== last4) return { ok: false, err: 'Incorrect DA PIN' };
    const { error } = await supabase.from('job_accepted').insert({
      event_id: String(eventId),
      accepted_by: userEmail,
      company_id: companyId || null,
    });
    if (error) return { ok: false, err: error.message };
    fetchAcceptedJobs();
    return { ok: true };
  }, [userEmail, companyId, fetchAcceptedJobs]);

  const onUnassignJob = useCallback(async (acceptanceId) => {
    const { error } = await supabase.rpc('dispatch_unassign_job', { p_job_accepted_id: acceptanceId });
    if (!error) fetchAcceptedJobs();
    return { ok: !error, err: error?.message };
  }, [fetchAcceptedJobs]);

  const onAllocateToPlate = useCallback(async (eventId, plate) => {
    const { error } = await supabase.rpc('dispatch_allocate_job', {
      p_event_id: String(eventId),
      p_plate:    plate.trim().toUpperCase().replace(/\s+/g, ''),
    });
    if (!error) fetchAcceptedJobs();
    return { ok: !error, err: error?.message };
  }, [fetchAcceptedJobs]);

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
    fetchAcceptedJobs();
    getRecentAllocations(744)
      .then(logged => {
        setAllFeatures(prev => mergeFeatures([], [...prev, ...logged]));
        setLoading(false);
      })
      .catch(e => { console.warn('getRecentAllocations:', e.message); setLoading(false); });
  }, [fetchAcceptedJobs]);

  const fetchAllocations = useCallback(async () => {
    try {
      const res  = await fetch(VICROADS_URL, { headers: { KeyID: VICROADS_KEY } });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      const all  = data.data?.features || data.features || [];
      const live = all.filter(f => f.properties?.source?.sourceName === 'TowAllocation');
      const newLiveIds  = new Set(live.map(f => String(f.properties?.eventId)));
      const justCleared = [...prevLiveIdsRef.current].filter(id => !newLiveIds.has(id));
      if (justCleared.length) {
        markAllocationsCleared(justCleared).catch(e => console.warn('markAllocationsCleared:', e));
        supabase.from('job_accepted')
          .update({ released_at: new Date().toISOString() })
          .in('event_id', justCleared).is('released_at', null)
          .then(() => fetchAcceptedJobs())
          .catch(e => console.warn('auto-release:', e));
      }
      prevLiveIdsRef.current = newLiveIds;
      setLiveIds(newLiveIds);
      logAllocations(live).catch(e => console.warn('logAllocations:', e));
      setAllFeatures(prev => mergeFeatures(live, prev));
      setErr('');
      setLastFetch(new Date());
      setCountdown(POLL_MS / 1000);
      fetchAcceptedJobs();
    } catch (e) { setErr(e.message); }
  }, [fetchAcceptedJobs]);

  useEffect(() => {
    fetchAllocations();
    const poll = setInterval(fetchAllocations, POLL_MS);
    return () => clearInterval(poll);
  }, [fetchAllocations]);

  useEffect(() => {
    const t = setInterval(() => setCountdown(c => (c > 0 ? c - 1 : POLL_MS / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const isStale = lastFetch ? (Date.now() - lastFetch.getTime()) > 3 * POLL_MS : false;

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
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'allocations' && (
          <TowAllocationsTab
            allFeatures={allFeatures} liveIds={liveIds} loading={loading}
            err={err} lastFetch={lastFetch} countdown={countdown}
            fetchAllocations={fetchAllocations} isStale={isStale}
            acceptedJobs={acceptedJobs} userEmail={userEmail}
            role={role} isDispatch={isDispatch} companyId={companyId}
            onAcceptJob={onAcceptJob}
            onUnassignJob={onUnassignJob}
            onAllocateToPlate={onAllocateToPlate}
            companyConfig={companyConfig}
          />
        )}
        {tab === 'ops' && (
          <OpsTab
            allFeatures={allFeatures} liveIds={liveIds} loading={loading}
            lastFetch={lastFetch} countdown={countdown} isStale={isStale}
            acceptedJobs={acceptedJobs} userEmail={userEmail}
            onAcceptJob={onAcceptJob} onReleaseJob={onUnassignJob}
            companyConfig={companyConfig} companyId={companyId}
          />
        )}
        {tab === 'activetows' && (
          <ActiveTowsTab companyId={companyId} companyConfig={companyConfig} userEmail={userEmail} />
        )}
        {tab === 'towins' && (
          <TowInsTab companyId={companyId} userEmail={userEmail} isDispatch={isDispatch} companyConfig={companyConfig} />
        )}
        {tab === 'analytics' && (
          <TowAnalyticsTab allFeatures={allFeatures} liveIds={liveIds} loading={loading} userEmail={userEmail} />
        )}
        {tab === 'drivers'   && <DriversTab companyId={companyId} isDispatch={isDispatch} role={role} />}
        {tab === 'depots'    && <DepotsTab isAdmin={isAdmin} companyId={companyId} />}
        {tab === 'fleet'     && <FleetTab isAdmin={isAdmin} companyId={companyId} />}
        {tab === 'pricing'   && <PricingTab companyConfig={companyConfig} setCompanyConfig={setCompanyConfig} companyId={companyId} />}
        {tab === 'branding'  && <BrandingTab companyConfig={companyConfig} setCompanyConfig={setCompanyConfig} companyId={companyId} />}
        {tab === 'approvals' && <DriverApprovalsTab companyId={companyId} />}
      </div>
    </div>
  );
}
