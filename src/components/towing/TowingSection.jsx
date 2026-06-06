import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ACC, MUT, BRD, SURF, TXT } from '../../lib/styles';
import TowAllocationsTab from './TowAllocationsTab';
import FleetTab from './FleetTab';
import DepotsTab from './DepotsTab';
import { logAllocations, markAllocationsCleared, getRecentAllocations } from '../../lib/db/towing';
import { supabase } from '../../lib/supabase';
import OpsTab from './OpsTab';
import TowAnalyticsTab from './TowAnalyticsTab';
import TowInsTab from './TowInsTab';

import ActiveTowsTab from './ActiveTowsTab';
import CompletedTowsTab from './CompletedTowsTab';
import ManualDispatchTab from './ManualDispatchTab';
import PricingTab from '../admin/PricingTab';
import MyTowsTab from './MyTowsTab';
import BridgesTab from './BridgesTab';
import AlertsTab from './AlertsTab';
import EmergencyTab from './EmergencyTab';
import VesselsTab from './VesselsTab';
import AircraftTab from './AircraftTab';
import TabOrderSettings from '../settings/TabOrderSettings';
import { applyTabOrder } from '../../lib/tabOrder';
const VICROADS_PROXY = '/.netlify/functions/vicroads-allocations';
import useDriverLocation from '../../hooks/useDriverLocation';
import { useBridgeAlerts } from '../../hooks/useBridgeAlerts';

const POLL_MS = 60_000;

export default function TowingSection({ role, isAdmin, isDispatch, userEmail, companyId, companyConfig, setCompanyConfig, profile, setProfile }) {
  const [isStandalone,      setIsStandalone]      = useState(false);
  const [standaloneChecked, setStandaloneChecked] = useState(false);
  const [inviteBannerOpen,  setInviteBannerOpen]  = useState(false);
  const [inviteCode,        setInviteCode]        = useState('');
  const [inviteErr,         setInviteErr]         = useState('');
  const [inviteBusy,        setInviteBusy]        = useState(false);

  // Detect standalone: driver with no dispatch/admin in their company
  useEffect(() => {
    if (role !== 'driver' || !companyId) { setStandaloneChecked(true); return; }
    supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('role', ['dispatch', 'admin', 'super_admin'])
      .then(({ count }) => {
        setIsStandalone((count ?? 0) === 0);
        setStandaloneChecked(true);
      })
      .catch(() => setStandaloneChecked(true));
  }, [role, companyId]);

  // Tab visibility by role:
  //   driver (org):        Allocations, Tow Ins, Map
  //   driver (standalone): Allocations, Tow Ins, Map, My Tows
  //   dispatch:            Allocations, Map, Analytics, Fleet
  //   admin:               All above + Settings
  //   super_admin:         All tabs
  const ALL_TABS = [
    { id: 'allocations',   label: '🚦 Tow Allocations',  roles: ['driver','dispatch','admin','super_admin'] },
    { id: 'dispatch',      label: '🚨 Dispatch',          roles: ['dispatch','admin','super_admin'] },
    { id: 'activetows',    label: '🚛 Active Tows',       roles: ['dispatch','admin','super_admin'] },
    { id: 'completedtows', label: '✅ Completed Tows',     roles: ['dispatch','admin','super_admin'] },
    { id: 'towins',        label: '🏭 Tow Ins',           roles: ['driver','dispatch','admin','super_admin'] },

    { id: 'depots',        label: '🏢 Depots',            roles: ['dispatch','admin','super_admin'] },
    { id: 'fleet',         label: '🚚 My Vehicles',        roles: ['dispatch','admin','super_admin'] },
    { id: 'ops',           label: '📍 Map',               roles: ['driver','dispatch','admin','super_admin'] },
    { id: 'bridges',       label: '🌉 Bridges',           roles: ['driver','dispatch','admin','super_admin'] },
    { id: 'waze',          label: '🧭 Waze',              roles: ['dispatch','admin','super_admin'] },
    { id: 'emergency',     label: '🚨 Emergency',         roles: ['dispatch','admin','super_admin'] },
    { id: 'vessels',       label: '⛵ Vessels',            roles: ['dispatch','admin','super_admin'] },
    { id: 'aircraft',      label: '✈ Aircraft',            roles: ['dispatch','admin','super_admin'] },
    { id: 'mytows',        label: '📋 My Tows',           roles: ['driver'], standaloneOnly: true },
    { id: 'analytics',     label: '📊 Analytics',         roles: ['dispatch','admin','super_admin'] },
    { id: 'pricing',       label: '💰 Pricing',           roles: ['admin','super_admin'] },
  ];

  // Role + standalone filter
  const roleTabs = ALL_TABS.filter(t => {
    if (role && !t.roles.includes(role)) return false;
    if (t.standaloneOnly && !isStandalone) return false;
    return true;
  });

  // Apply saved order and hidden prefs
  const [localTabPrefs, setLocalTabPrefs] = useState(profile?.tab_preferences ?? {});

  // Sync when profile loads asynchronously (first load profile is null)
  const prevProfilePrefs = useRef(null);
  useEffect(() => {
    const incoming = profile?.tab_preferences;
    if (incoming && incoming !== prevProfilePrefs.current) {
      prevProfilePrefs.current = incoming;
      setLocalTabPrefs(incoming);
    }
  }, [profile?.tab_preferences]);

  const orderedTabs = applyTabOrder(roleTabs, localTabPrefs?.order);
  const hiddenSet   = new Set(localTabPrefs?.hidden ?? []);
  const TABS        = orderedTabs.filter(t => !hiddenSet.has(t.id));

  // setTabPrefs: update localTabPrefs + propagate to parent profile
  const setTabPrefs = (prefs) => {
    setLocalTabPrefs(prefs);
    prevProfilePrefs.current = prefs;
    if (setProfile) setProfile(prev => ({ ...prev, tab_preferences: prefs }));
  };

  const [tab, setTab] = useState(() => {
    // Start on first visible tab
    const firstId = orderedTabs.find(t => !hiddenSet.has(t.id))?.id;
    return firstId || 'allocations';
  });

  // Single GPS watch for the whole session — persists across tab switches.
  // Returns { lat, lng } | null; also writes to driver_locations with company_id.
  const userPos           = useDriverLocation(userEmail, companyId);
  const bridgeAlert       = useBridgeAlerts(userPos);
  const [dismissedBridge, setDismissedBridge] = useState(null);
  const visibleBridgeAlert = bridgeAlert && bridgeAlert.label !== dismissedBridge ? bridgeAlert : null;
  // Clear dismiss when moving to a different bridge
  useEffect(() => {
    if (bridgeAlert?.label !== dismissedBridge) setDismissedBridge(null);
  }, [bridgeAlert?.label]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const res  = await fetch(VICROADS_PROXY);
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

  const handleInviteSubmit = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) return;
    setInviteBusy(true); setInviteErr('');
    const { data, error } = await supabase.rpc('validate_invite_code', { p_code: code });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.valid) {
      setInviteErr('Invalid or already used code.'); setInviteBusy(false); return;
    }
    await supabase.rpc('consume_invite_code', { p_code: code, p_used_by: userEmail });
    // Reload the page so App re-fetches the user's updated company assignment
    window.location.reload();
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Standalone mode invite banner — shown to solo drivers once detection is done */}
      {standaloneChecked && isStandalone && (
        <div style={{
          background: '#0d0d0d', borderBottom: `1px solid #2a1a00`,
          padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          fontFamily: "'IBM Plex Mono',monospace",
        }}>
          <span style={{ fontSize: 8, color: '#cc8822', flex: 1 }}>
            Running in standalone mode. Have an invite code from your manager?
          </span>
          {!inviteBannerOpen ? (
            <button onClick={() => setInviteBannerOpen(true)}
              style={{ fontSize: 8, padding: '2px 8px', background: '#cc882211', border: '1px solid #cc882244', color: '#cc8822', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace', flexShrink: 0" }}>
              Enter code
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <input
                value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
                placeholder="XXXXXX" maxLength={8}
                style={{ width: 72, background: '#0a0a0a', border: '1px solid #333', color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, padding: '2px 5px', borderRadius: 2, outline: 'none', letterSpacing: '0.1em' }}
                onKeyDown={e => e.key === 'Enter' && handleInviteSubmit()}
              />
              <button onClick={handleInviteSubmit} disabled={inviteBusy}
                style={{ fontSize: 8, padding: '2px 8px', background: '#cc882211', border: '1px solid #cc882244', color: '#cc8822', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace" }}>
                {inviteBusy ? '…' : 'Join'}
              </button>
              <button onClick={() => { setInviteBannerOpen(false); setInviteCode(''); setInviteErr(''); }}
                style={{ fontSize: 10, background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 0 }}>×</button>
              {inviteErr && <span style={{ fontSize: 8, color: '#cc3333' }}>{inviteErr}</span>}
            </div>
          )}
        </div>
      )}

      {/* Low bridge proximity alert — shown across all tabs */}
      {visibleBridgeAlert && (
        <div style={{
          background: '#3a0000', borderBottom: '2px solid #cc2222',
          padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0, fontFamily: "'IBM Plex Mono',monospace", animation: 'pulseRed 1s ease-in-out infinite',
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ff4444', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Low Bridge Ahead
            </div>
            <div style={{ fontSize: 9, color: '#cc8888', marginTop: 2 }}>
              {visibleBridgeAlert.label} · {visibleBridgeAlert.height.toFixed(1)} m clearance · {(visibleBridgeAlert.dist * 1000).toFixed(0)} m away
            </div>
          </div>
          <button onClick={() => setDismissedBridge(visibleBridgeAlert.label)} title="Dismiss"
            style={{ background: 'none', border: '1px solid #cc222255', borderRadius: 2,
              color: '#cc6666', fontSize: 12, cursor: 'pointer', padding: '2px 8px',
              fontFamily: "'IBM Plex Mono',monospace" }}>
            ✕
          </button>
        </div>
      )}

      <div style={{ background: SURF, borderBottom: '1px solid ' + BRD, overflowX: 'auto', overflowY: 'hidden', display: 'flex', scrollbarWidth: 'none' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flexShrink: 0, padding: '8px 14px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tab === t.id ? ACC : MUT, cursor: 'pointer', border: 'none', background: 'none', borderBottom: tab === t.id ? '2px solid ' + ACC : '2px solid transparent', fontFamily: "'IBM Plex Mono',monospace", whiteSpace: 'nowrap' }}>
            {t.id === 'waze'
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <img src="https://www.waze.com/favicon.ico" alt="Waze" style={{ width: 14, height: 14, opacity: tab === 'waze' ? 1 : 0.45 }} />
                  Waze
                </span>
              : t.label}
          </button>
        ))}
        {/* Tab order settings — always visible, pinned to the right */}
        <div style={{ flex: 1 }} />
        <button onClick={() => setTab('taborder')}
          style={{ flexShrink: 0, padding: '8px 14px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tab === 'taborder' ? ACC : MUT, cursor: 'pointer', border: 'none', background: 'none', borderBottom: tab === 'taborder' ? '2px solid ' + ACC : '2px solid transparent', fontFamily: "'IBM Plex Mono',monospace", whiteSpace: 'nowrap' }}>
          ⇅ Tabs
        </button>
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
            userPos={userPos}
          />
        )}
        {tab === 'ops' && (
          <OpsTab
            allFeatures={allFeatures} liveIds={liveIds} loading={loading}
            lastFetch={lastFetch} countdown={countdown} isStale={isStale}
            acceptedJobs={acceptedJobs} userEmail={userEmail}
            onAcceptJob={onAcceptJob} onReleaseJob={onUnassignJob}
            companyConfig={companyConfig} companyId={companyId}
            userPos={userPos}
          />
        )}
        {tab === 'bridges'    && <BridgesTab userPos={userPos} />}
        {tab === 'waze'       && <AlertsTab />}
        {tab === 'emergency'  && <EmergencyTab />}
        {tab === 'vessels'    && <VesselsTab />}
        {tab === 'aircraft'   && <AircraftTab />}
        {tab === 'mytows'     && <MyTowsTab userEmail={userEmail} />}
        {tab === 'dispatch'   && <ManualDispatchTab companyId={companyId} companyConfig={companyConfig} userEmail={userEmail} />}
        {tab === 'activetows'    && <ActiveTowsTab companyId={companyId} companyConfig={companyConfig} userEmail={userEmail} />}
        {tab === 'completedtows' && <CompletedTowsTab companyId={companyId} />}
        {tab === 'taborder'      && (
          <TabOrderSettings
            userId={profile?.id}
            availableTabs={roleTabs}
            tabPrefs={localTabPrefs}
            setTabPrefs={setTabPrefs}
          />
        )}
        {tab === 'towins' && (
          <TowInsTab companyId={companyId} userEmail={userEmail} isDispatch={isDispatch} companyConfig={companyConfig} />
        )}
        {tab === 'analytics' && (
          <TowAnalyticsTab allFeatures={allFeatures} liveIds={liveIds} loading={loading} userEmail={userEmail} />
        )}

        {tab === 'depots'    && <DepotsTab isAdmin={isAdmin} companyId={companyId} />}
        {tab === 'fleet'     && <FleetTab isAdmin={isAdmin} companyId={companyId} />}
        {tab === 'pricing'   && <PricingTab companyConfig={companyConfig} setCompanyConfig={setCompanyConfig} companyId={companyId} />}
      </div>
    </div>
  );
}
