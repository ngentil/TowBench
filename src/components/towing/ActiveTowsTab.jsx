import React, { useState, useEffect, useCallback } from 'react';
import { ACC, MUT, BRD, TXT, GRN, RED, SURF } from '../../lib/styles';
import { supabase } from '../../lib/supabase';
import { fmtShort, fmtTimer } from '../../lib/utils';
import { CompleteModal } from './DispatchTab';

const ORANGE = '#e8870a';

function towTypeColor(t) {
  if (t === 'accident') return RED;
  if (t === 'trade')    return ACC;
  if (t === 'custom')   return ORANGE;
  return MUT;
}

function ActiveTowCard({ job, truck, fromDepot, toDepot, onComplete, onCancel }) {
  const elapsed   = fmtTimer(job.dispatched_at);
  const typeColor = towTypeColor(job.tow_type);

  // Build route label
  const routeParts = [];
  if (fromDepot)      routeParts.push(fromDepot.name);
  if (job.pickup_label) routeParts.push(job.pickup_label.split(',')[0]);
  if (toDepot && toDepot.id !== fromDepot?.id) routeParts.push(toDepot.name);
  else if (toDepot)   routeParts.push(toDepot.name);
  const routeStr = routeParts.join(' → ');

  return (
    <div style={{
      background: '#0d0d0d',
      border: '1px solid #252525',
      borderLeft: `3px solid ${ORANGE}`,
      borderRadius: 2,
      marginBottom: 8,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: TXT, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.12em' }}>
              🚛 {truck?.plate || '—'}
            </span>
            <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.12em', padding: '2px 6px',
              border: `1px solid ${ORANGE}55`, borderRadius: 2, color: ORANGE, background: ORANGE + '15',
              textTransform: 'uppercase' }}>
              In Progress
            </span>
            {elapsed && (
              <span style={{ fontSize: 7, color: ORANGE, border: `1px solid ${ORANGE}33`, borderRadius: 2, padding: '1px 5px', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>
                ⏱ {elapsed}
              </span>
            )}
          </div>
          {truck?.truck_type && (
            <div style={{ fontSize: 8, color: MUT, marginTop: 2, fontFamily: "'IBM Plex Mono',monospace" }}>
              {truck.truck_type}
            </div>
          )}
        </div>
        <div style={{ fontSize: 8, color: MUT, textAlign: 'right', flexShrink: 0, fontFamily: "'IBM Plex Mono',monospace" }}>
          {fmtShort(job.dispatched_at)}
        </div>
      </div>

      {/* Route + stats */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #1a1a1a' }}>
        {routeStr && (
          <div style={{ fontSize: 9, color: TXT, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 8, lineHeight: 1.5 }}>
            {routeParts.map((part, i) => (
              <span key={i}>
                {i > 0 && <span style={{ color: MUT, margin: '0 5px' }}>→</span>}
                <span style={{ color: i === 0 || i === routeParts.length - 1 ? ACC : TXT }}>{part}</span>
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {job.distance_km != null && (
            <span style={{ fontSize: 9, color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>
              {parseFloat(job.distance_km).toFixed(1)} km
            </span>
          )}
          {job.duration_min != null && (
            <span style={{ fontSize: 9, color: MUT, fontFamily: "'IBM Plex Mono',monospace" }}>
              ~{job.duration_min} min
            </span>
          )}
          {job.distance_km != null && job.tow_fee != null && (
            <span style={{ color: MUT, fontSize: 8 }}>·</span>
          )}
          {job.tow_fee != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 10, fontWeight: 700, color: GRN, fontFamily: "'IBM Plex Mono',monospace",
              border: '1px solid #2a4a2a', borderRadius: 2, padding: '1px 6px', background: '#0a1a0a' }}>
              <span style={{ fontSize: 7, fontWeight: 400, color: '#4a8a4a', letterSpacing: '0.08em' }}>EST.</span>
              ${parseFloat(job.tow_fee).toFixed(2)}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {job.tow_type && (
            <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px',
              border: `1px solid ${typeColor}55`, borderRadius: 2, color: typeColor, background: typeColor + '15',
              textTransform: 'uppercase' }}>
              {job.tow_type}
            </span>
          )}
          {job.event_id && (
            <span style={{ fontSize: 7, color: MUT, fontFamily: "'IBM Plex Mono',monospace",
              border: '1px solid #2a2a2a', borderRadius: 2, padding: '1px 5px' }}>
              #{job.event_id}
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 8, color: '#444', fontFamily: "'IBM Plex Mono',monospace" }}>
          {job.dispatched_by?.split('@')[0]}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onCancel}
            style={{ fontSize: 8, padding: '4px 10px', background: 'none', border: '1px solid #3a1a1a',
              color: '#884040', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace",
              letterSpacing: '0.06em' }}>
            ✕ Cancel
          </button>
          <button onClick={onComplete}
            style={{ fontSize: 8, padding: '4px 12px', background: GRN + '18', border: `1px solid ${GRN}55`,
              color: GRN, borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace",
              fontWeight: 700, letterSpacing: '0.06em' }}>
            ✓ Complete Job
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ActiveTowsTab({ companyId, companyConfig, userEmail }) {
  const [jobs,         setJobs]         = useState([]);
  const [trucks,       setTrucks]       = useState([]);
  const [depots,       setDepots]       = useState([]);
  const [storageTypes, setStorageTypes] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [completeJob,  setCompleteJob]  = useState(null);

  const loadJobs = useCallback(async () => {
    let q = supabase.from('dispatched_jobs').select('*').eq('status', 'in_progress').order('dispatched_at', { ascending: false });
    if (companyId) q = q.eq('company_id', companyId);
    const { data } = await q;
    setJobs(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    const tq = supabase.from('tow_trucks').select('id,plate,truck_type,depot_id');
    const dq = supabase.from('depots').select('id,name,suburb');
    const sq = supabase.from('storage_types').select('*').order('daily_rate', { ascending: false });
    if (companyId) { tq.eq('company_id', companyId); dq.eq('company_id', companyId); sq.eq('company_id', companyId); }
    Promise.all([tq, dq, sq]).then(([t, d, s]) => {
      setTrucks(t.data || []);
      setDepots(d.data || []);
      setStorageTypes(s.data || []);
    });
    loadJobs();
  }, [companyId, loadJobs]);

  const handleCancel = async (job) => {
    if (!confirm(`Cancel job for ${trucks.find(t => t.id === job.truck_id)?.plate || 'this truck'}?`)) return;
    await supabase.from('dispatched_jobs')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', job.id);
    setJobs(prev => prev.filter(j => j.id !== job.id));
  };

  const handleCompleteSave = () => {
    setCompleteJob(null);
    loadJobs();
  };

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e8870a', letterSpacing: '0.06em' }}>🚛 Active Tows</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            {loading ? 'Loading…' : `${jobs.length} job${jobs.length !== 1 ? 's' : ''} in progress`}
          </div>
        </div>
        <button onClick={loadJobs}
          style={{ fontSize: 8, color: ORANGE, border: `1px solid ${ORANGE}44`, background: ORANGE + '11',
            padding: '3px 8px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>
          ↻ Refresh
        </button>
      </div>

      {!loading && jobs.length === 0 && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '48px 0', lineHeight: 1.8 }}>
          No active tows right now.<br />
          <span style={{ fontSize: 8 }}>Jobs dispatched via the Allocate button will appear here.</span>
        </div>
      )}

      {jobs.map(job => {
        const truck     = trucks.find(t => t.id === job.truck_id);
        const fromDepot = depots.find(d => d.id === job.from_depot_id);
        const toDepot   = depots.find(d => d.id === job.to_depot_id);
        return (
          <ActiveTowCard
            key={job.id}
            job={job}
            truck={truck}
            fromDepot={fromDepot}
            toDepot={toDepot}
            onComplete={() => setCompleteJob(job)}
            onCancel={() => handleCancel(job)}
          />
        );
      })}

      {completeJob && (
        <CompleteModal
          job={completeJob}
          trucks={trucks}
          depots={depots}
          storageTypes={storageTypes}
          companyId={companyId}
          userEmail={userEmail}
          onSave={handleCompleteSave}
          onCancel={() => setCompleteJob(null)}
        />
      )}
    </div>
  );
}
