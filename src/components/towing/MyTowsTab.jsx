import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, TXT, GRN, RED, BRD, SURF, inp, btnG, sm, empt } from '../../lib/styles';
import { fmtShort } from '../../lib/utils';

const ORANGE = '#e8870a';

function typeColor(t) {
  if (t === 'trade')    return ACC;
  if (t === 'accident') return RED;
  if (t === 'both')     return '#5a9aee';
  return MUT;
}

function TowCard({ job }) {
  const [open, setOpen] = useState(false);
  const tc = typeColor(job.tow_type);

  const from = job.pickup_label?.split(',').slice(0, 2).join(',') || '—';
  const to   = job.dropoff_label?.split(',').slice(0, 2).join(',') || (job.dropoff_lat ? 'Depot' : '—');

  return (
    <div
      onClick={() => setOpen(o => !o)}
      style={{
        background: '#0d0d0d', border: `1px solid ${BRD}`,
        borderLeft: `3px solid ${tc}`, borderRadius: 2,
        marginBottom: 8, cursor: 'pointer',
      }}
    >
      {/* Row */}
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{
              fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '2px 5px',
              border: `1px solid ${tc}44`, borderRadius: 2, color: tc,
              background: tc + '15', textTransform: 'uppercase',
            }}>
              {job.tow_type || 'tow'}
            </span>
            <span style={{ fontSize: 7, color: MUT }}>{fmtShort(job.completed_at || job.dispatched_at)}</span>
          </div>

          <div style={{ fontSize: 10, color: TXT, fontFamily: "'IBM Plex Mono',monospace",
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
            {from}
          </div>
          <div style={{ fontSize: 9, color: MUT, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#333' }}>→</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{to}</span>
          </div>
        </div>

        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          {job.distance_km != null && (
            <span style={{ fontSize: 8, color: ORANGE, fontFamily: "'IBM Plex Mono',monospace" }}>
              {parseFloat(job.distance_km).toFixed(1)} km
            </span>
          )}
          {job.tow_fee != null && (
            <span style={{ fontSize: 11, fontWeight: 700, color: GRN, fontFamily: "'IBM Plex Mono',monospace" }}>
              ${parseFloat(job.tow_fee).toFixed(2)}
            </span>
          )}
          <span style={{ fontSize: 8, color: '#333' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded */}
      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              ['Dispatched',   fmtShort(job.dispatched_at)],
              ['Completed',    fmtShort(job.completed_at)],
              ['Truck',        job.truck_plate || '—'],
              ['Tow type',     job.tow_type || '—'],
              ['Distance',     job.distance_km != null ? `${parseFloat(job.distance_km).toFixed(1)} km` : '—'],
              ['Duration',     job.duration_min != null ? `~${job.duration_min} min` : '—'],
              ['Fee',          job.tow_fee != null ? `$${parseFloat(job.tow_fee).toFixed(2)}` : '—'],
              ['Pickup',       job.pickup_label?.split(',').slice(0, 3).join(',') || '—'],
              ['Dropoff',      job.dropoff_label?.split(',').slice(0, 3).join(',') || '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ background: SURF, border: `1px solid ${BRD}`, borderRadius: 2, padding: '5px 8px' }}>
                <div style={{ fontSize: 7, color: MUT, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                  {label}
                </div>
                <div style={{ fontSize: 9, color: TXT, fontFamily: "'IBM Plex Mono',monospace",
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {val}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MyTowsTab({ userEmail }) {
  const [jobs,    setJobs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  const load = useCallback(async () => {
    if (!userEmail) return;
    setLoading(true);
    const { data } = await supabase
      .from('dispatched_jobs')
      .select('*')
      .eq('assigned_to', userEmail)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });
    setJobs(data || []);
    setLoading(false);
  }, [userEmail]);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? jobs.filter(j =>
        (j.pickup_label  || '').toLowerCase().includes(q) ||
        (j.dropoff_label || '').toLowerCase().includes(q) ||
        (j.tow_type      || '').toLowerCase().includes(q)
      )
    : jobs;

  const totalFee = filtered.reduce((s, j) => s + (j.tow_fee ? parseFloat(j.tow_fee) : 0), 0);
  const totalKm  = filtered.reduce((s, j) => s + (j.distance_km ? parseFloat(j.distance_km) : 0), 0);

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${BRD}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: ACC, letterSpacing: '0.1em',
            textTransform: 'uppercase', flex: 1 }}>
            My Tows
          </div>
          {filtered.length > 0 && (
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 8, color: ORANGE, fontFamily: "'IBM Plex Mono',monospace" }}>
                {totalKm.toFixed(0)} km
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, color: GRN, fontFamily: "'IBM Plex Mono',monospace" }}>
                ${totalFee.toFixed(2)}
              </span>
              <span style={{ fontSize: 8, color: MUT }}>{filtered.length} job{filtered.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
        <input
          style={{ ...inp, fontSize: 11 }}
          placeholder="Search by address or type…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {loading && (
          <div style={{ ...empt }}>Loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ ...empt }}>
            {q ? 'No tows match that search.' : 'No completed tows yet.'}
          </div>
        )}
        {filtered.map(job => <TowCard key={job.id} job={job} />)}
      </div>
    </div>
  );
}
