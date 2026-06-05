import React, { useState, useEffect, useCallback } from 'react';
import { ACC, MUT, BRD, TXT, GRN, RED, SURF } from '../../lib/styles';
import { supabase } from '../../lib/supabase';
import { fmtShort } from '../../lib/utils';

const ORANGE = '#e8870a';
const PAGE = 50;

function towTypeColor(t) {
  if (t === 'accident') return RED;
  if (t === 'trade')    return ACC;
  if (t === 'custom')   return ORANGE;
  return MUT;
}

function CompletedTowCard({ job, truck, fromDepot, toDepot }) {
  const isCancel   = job.status === 'cancelled';
  const accentCol  = isCancel ? '#884040' : GRN;
  const typeColor  = towTypeColor(job.tow_type);

  const routeParts = [];
  if (fromDepot)         routeParts.push(fromDepot.name);
  if (job.pickup_label)  routeParts.push(job.pickup_label.split(',')[0]);
  if (toDepot && toDepot.id !== fromDepot?.id) routeParts.push(toDepot.name);
  else if (toDepot)      routeParts.push(toDepot.name);

  return (
    <div style={{
      background: '#0d0d0d',
      border: '1px solid #252525',
      borderLeft: `3px solid ${accentCol}`,
      borderRadius: 2,
      marginBottom: 8,
      overflow: 'hidden',
      opacity: isCancel ? 0.65 : 1,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: TXT, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.12em' }}>
              🚛 {truck?.plate || '—'}
            </span>
            <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.12em', padding: '2px 6px',
              border: `1px solid ${accentCol}55`, borderRadius: 2, color: accentCol, background: accentCol + '15',
              textTransform: 'uppercase' }}>
              {isCancel ? 'Cancelled' : 'Completed'}
            </span>
          </div>
          {truck?.truck_type && (
            <div style={{ fontSize: 8, color: MUT, marginTop: 2, fontFamily: "'IBM Plex Mono',monospace" }}>
              {truck.truck_type}
            </div>
          )}
        </div>
        <div style={{ fontSize: 8, color: MUT, textAlign: 'right', flexShrink: 0, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1.8 }}>
          <div>{fmtShort(job.dispatched_at)}</div>
          {job.completed_at && (
            <div style={{ color: accentCol + 'bb' }}>{isCancel ? 'Cancelled' : 'Done'} {fmtShort(job.completed_at)}</div>
          )}
        </div>
      </div>

      {/* Route + stats */}
      <div style={{ padding: '10px 12px' }}>
        {routeParts.length > 0 && (
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
          {job.tow_fee != null && (
            <>
              <span style={{ color: MUT, fontSize: 8 }}>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, fontWeight: 700, color: isCancel ? MUT : GRN, fontFamily: "'IBM Plex Mono',monospace",
                border: `1px solid ${isCancel ? '#333' : '#2a4a2a'}`, borderRadius: 2, padding: '1px 6px', background: isCancel ? '#111' : '#0a1a0a' }}>
                <span style={{ fontSize: 7, fontWeight: 400, letterSpacing: '0.08em' }}>
                  {isCancel ? 'VOID' : 'FEE'}
                </span>
                ${parseFloat(job.tow_fee).toFixed(2)}
              </span>
            </>
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
          {job.dispatched_by && (
            <span style={{ fontSize: 7, color: '#444', fontFamily: "'IBM Plex Mono',monospace" }}>
              by {job.dispatched_by.split('@')[0]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CompletedTowsTab({ companyId }) {
  const [jobs,    setJobs]    = useState([]);
  const [trucks,  setTrucks]  = useState([]);
  const [depots,  setDepots]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [offset,  setOffset]  = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filter,  setFilter]  = useState('all'); // 'all' | 'completed' | 'cancelled'

  const loadJobs = useCallback(async (off = 0, append = false) => {
    setLoading(true);
    let query = supabase
      .from('dispatched_jobs')
      .select('*')
      .order('completed_at', { ascending: false, nullsLast: true })
      .order('dispatched_at', { ascending: false })
      .range(off, off + PAGE);
    if (companyId) query = query.eq('company_id', companyId);

    if (filter === 'completed') query = query.eq('status', 'completed');
    else if (filter === 'cancelled') query = query.eq('status', 'cancelled');
    else query = query.in('status', ['completed', 'cancelled']);

    const { data } = await query;
    const rows = data || [];
    setHasMore(rows.length > PAGE);
    const page = rows.slice(0, PAGE);
    setJobs(prev => append ? [...prev, ...page] : page);
    setOffset(off + page.length);
    setLoading(false);
  }, [companyId, filter]);

  useEffect(() => {
    const tq = supabase.from('tow_trucks').select('id,plate,truck_type,depot_id');
    const dq = supabase.from('depots').select('id,name,suburb');
    if (companyId) { tq.eq('company_id', companyId); dq.eq('company_id', companyId); }
    Promise.all([tq, dq]).then(([t, d]) => {
      setTrucks(t.data || []);
      setDepots(d.data || []);
    });
    loadJobs(0);
  }, [companyId, loadJobs]);

  const completedCount  = jobs.filter(j => j.status === 'completed').length;
  const cancelledCount  = jobs.filter(j => j.status === 'cancelled').length;

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRN, letterSpacing: '0.06em' }}>✓ Completed Tows</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            {loading ? 'Loading…' : `${completedCount} completed · ${cancelledCount} cancelled`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Filter buttons */}
          {['all', 'completed', 'cancelled'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ fontSize: 8, padding: '3px 8px', borderRadius: 2, cursor: 'pointer',
                fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                background: filter === f ? GRN + '20' : 'transparent',
                border: `1px solid ${filter === f ? GRN + '66' : '#333'}`,
                color: filter === f ? GRN : MUT }}>
              {f === 'all' ? 'All' : f === 'completed' ? '✓ Done' : '✕ Void'}
            </button>
          ))}
          <button onClick={() => loadJobs(0)}
            style={{ fontSize: 8, color: GRN, border: `1px solid ${GRN}44`, background: GRN + '11',
              padding: '3px 8px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>
            ↻
          </button>
        </div>
      </div>

      {!loading && jobs.length === 0 && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '48px 0', lineHeight: 1.8 }}>
          No {filter === 'all' ? 'completed or cancelled' : filter} tows yet.<br />
          <span style={{ fontSize: 8 }}>Jobs marked Complete or Cancelled in Active Tows appear here.</span>
        </div>
      )}

      {jobs.map(job => {
        const truck     = trucks.find(t => t.id === job.truck_id);
        const fromDepot = depots.find(d => d.id === job.from_depot_id);
        const toDepot   = depots.find(d => d.id === job.to_depot_id);
        return (
          <CompletedTowCard
            key={job.id}
            job={job}
            truck={truck}
            fromDepot={fromDepot}
            toDepot={toDepot}
          />
        );
      })}

      {hasMore && !loading && (
        <button onClick={() => loadJobs(offset, true)}
          style={{ width: '100%', padding: '8px 0', fontSize: 9, color: MUT,
            background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 2,
            cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", marginTop: 4 }}>
          Load more
        </button>
      )}

      {loading && jobs.length === 0 && (
        <div style={{ fontSize: 9, color: MUT, textAlign: 'center', padding: '32px 0' }}>Loading…</div>
      )}
    </div>
  );
}
