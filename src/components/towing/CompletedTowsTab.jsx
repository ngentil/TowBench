import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ACC, MUT, BRD, TXT, GRN, RED, SURF } from '../../lib/styles';
import { supabase } from '../../lib/supabase';
import { fmtShort } from '../../lib/utils';
import { getTrucks, getDepots } from '../../lib/db/towing';

const ORANGE = '#e8870a';
const PAGE = 50;

const SORT_OPTIONS = [
  { key: 'date',     label: 'Date' },
  { key: 'fee',      label: 'Fee ($)' },
  { key: 'distance', label: 'Distance' },
  { key: 'type',     label: 'Tow Type' },
  { key: 'truck',    label: 'Truck Plate' },
  { key: 'vehicle',  label: 'Vehicle Plate' },
  { key: 'make',     label: 'Make / Model' },
  { key: 'location', label: 'Pickup Location' },
];

const EXPORT_RANGES = [
  { label: '1 hour',   ms: 36e5 },
  { label: '12 hours', ms: 43.2e6 },
  { label: '24 hours', ms: 864e5 },
  { label: '72 hours', ms: 259.2e6 },
  { label: '7 days',   ms: 7 * 864e5 },
  { label: '2 weeks',  ms: 14 * 864e5 },
  { label: '4 weeks',  ms: 28 * 864e5 },
];

function towTypeColor(t) {
  if (t === 'accident') return RED;
  if (t === 'trade')    return ACC;
  if (t === 'custom')   return ORANGE;
  return MUT;
}

function fmtDateFull(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// ── PDF export helpers ─────────────────────────────────────────────────────────
function buildJobHTML(job, truck, fromDepot, toDepot, towIn) {
  const isCancel = job.status === 'cancelled';
  const rows = [
    ['Status',       isCancel ? 'CANCELLED' : 'COMPLETED'],
    ['Completed',    fmtDateFull(job.completed_at || job.dispatched_at)],
    ['Dispatched',   fmtDateFull(job.dispatched_at)],
    ['Tow Truck',    truck ? `${truck.plate}${truck.truck_type ? ` (${truck.truck_type})` : ''}` : '—'],
    ['Route',        [fromDepot?.name, job.pickup_label?.split(',')[0], toDepot?.name].filter(Boolean).join(' → ') || '—'],
    ['Distance',     job.distance_km != null ? `${parseFloat(job.distance_km).toFixed(1)} km` : '—'],
    ['Duration',     job.duration_min != null ? `~${job.duration_min} min` : '—'],
    ['Tow Type',     job.tow_type || '—'],
    ['Fee',          job.tow_fee != null ? `$${parseFloat(job.tow_fee).toFixed(2)}` : '—'],
    ...(towIn ? [
      ['Vehicle Plate', towIn.plate || '—'],
      ['Make / Model',  [towIn.make, towIn.model].filter(Boolean).join(' ') || towIn.make_model || '—'],
    ] : []),
    ...(job.event_id      ? [['Event ID',      `#${job.event_id}`]] : []),
    ...(job.dispatched_by ? [['Dispatched By', job.dispatched_by.split('@')[0]]] : []),
  ];
  return `
    <div class="job">
      <div class="job-header">
        <span class="truck">🚛 ${truck?.plate || '—'}</span>
        <span class="status ${isCancel ? 'cancelled' : 'completed'}">${isCancel ? 'CANCELLED' : 'COMPLETED'}</span>
        ${towIn?.plate ? `<span class="vehicle-plate">${towIn.plate}</span>` : ''}
        ${towIn && (towIn.make || towIn.model || towIn.make_model)
          ? `<span class="make-model">${[towIn.make, towIn.model].filter(Boolean).join(' ') || towIn.make_model}</span>`
          : ''}
      </div>
      <table>${rows.map(([k, v]) => `<tr><td class="lbl">${k}</td><td class="val">${v}</td></tr>`).join('')}</table>
    </div>`;
}

function buildSummaryHTML(jobs) {
  const completed = jobs.filter(j => j.status === 'completed');
  const cancelled = jobs.filter(j => j.status === 'cancelled');
  const totalFee  = completed.reduce((s, j) => s + (parseFloat(j.tow_fee) || 0), 0);
  const totalKm   = completed.reduce((s, j) => s + (parseFloat(j.distance_km) || 0), 0);
  return `
    <div class="summary">
      <h2>Summary</h2>
      <div class="sum-row"><span>Completed jobs</span><span>${completed.length}</span></div>
      <div class="sum-row"><span>Cancelled jobs</span><span>${cancelled.length}</span></div>
      <div class="sum-row"><span>Total distance</span><span>${totalKm.toFixed(1)} km</span></div>
      <div class="sum-total"><span>Total revenue</span><span>$${totalFee.toFixed(2)}</span></div>
    </div>`;
}

function printJobs(jobs, trucks, depots, towInsMap, title) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title><style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Courier New', monospace; font-size: 11px; color: #111; background: #fff; padding: 20px; }
h1 { font-size: 18px; font-weight: bold; border-bottom: 3px solid #111; padding-bottom: 8px; margin-bottom: 4px; }
.meta { font-size: 9px; color: #666; margin-bottom: 20px; }
.summary { border: 2px solid #333; padding: 14px 16px; margin-bottom: 24px; break-inside: avoid; }
.summary h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 10px; }
.sum-row, .sum-total { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee; font-size: 11px; }
.sum-total { border-bottom: none; font-weight: bold; font-size: 14px; margin-top: 4px; padding-top: 6px; border-top: 2px solid #111; }
.job { border: 1px solid #ccc; border-left: 4px solid #555; padding: 12px; margin-bottom: 14px; break-inside: avoid; }
.job-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #eee; }
.truck { font-size: 16px; font-weight: bold; letter-spacing: .1em; }
.vehicle-plate { font-size: 13px; font-weight: bold; background: #f5f5f5; padding: 2px 8px; border: 1px solid #ccc; border-radius: 3px; }
.make-model { font-size: 10px; color: #666; }
.status { font-size: 8px; font-weight: bold; padding: 2px 7px; border: 1px solid; border-radius: 3px; letter-spacing: .1em; }
.status.completed { background: #e8f5e9; color: #2e7d32; border-color: #81c784; }
.status.cancelled { background: #ffebee; color: #c62828; border-color: #ef9a9a; }
table { width: 100%; border-collapse: collapse; }
td { padding: 3px 6px; border-bottom: 1px solid #f0f0f0; }
td.lbl { color: #888; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; width: 110px; }
td.val { font-weight: 600; }
@media print { @page { margin: 15mm; } }
</style></head><body>
<h1>${title}</h1>
<div class="meta">Generated ${new Date().toLocaleString('en-AU')} · ${jobs.length} job${jobs.length !== 1 ? 's' : ''}</div>
${jobs.length > 1 ? buildSummaryHTML(jobs) : ''}
${jobs.map(job => {
  const truck     = trucks.find(t => t.id === job.truck_id);
  const fromDepot = depots.find(d => d.id === job.from_depot_id);
  const toDepot   = depots.find(d => d.id === job.to_depot_id);
  return buildJobHTML(job, truck, fromDepot, toDepot, towInsMap[job.id]);
}).join('')}
</body></html>`;

  const w = window.open('', '_blank', 'width=820,height=920');
  if (!w) { alert('Pop-up blocked — please allow pop-ups for this page and try again.'); return; }
  w.document.write(html);
  w.document.close();
  w.addEventListener('load', () => w.print());
}
// ──────────────────────────────────────────────────────────────────────────────

function CompletedTowCard({ job, truck, fromDepot, toDepot, towIn, onDelete, onExport }) {
  const isCancel  = job.status === 'cancelled';
  const accentCol = isCancel ? '#884040' : GRN;
  const typeColor = towTypeColor(job.tow_type);

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
            {towIn?.plate && (
              <span style={{ fontSize: 10, fontWeight: 700, color: TXT, fontFamily: "'IBM Plex Mono',monospace",
                letterSpacing: '0.1em', border: '1px solid #333', borderRadius: 2, padding: '1px 6px', background: '#111' }}>
                {towIn.plate}
              </span>
            )}
            <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.12em', padding: '2px 6px',
              border: `1px solid ${accentCol}55`, borderRadius: 2, color: accentCol, background: accentCol + '15',
              textTransform: 'uppercase' }}>
              {isCancel ? 'Cancelled' : 'Completed'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
            {truck?.truck_type && (
              <div style={{ fontSize: 8, color: MUT, fontFamily: "'IBM Plex Mono',monospace" }}>
                {truck.truck_type}
              </div>
            )}
            {towIn && (towIn.make || towIn.model || towIn.make_model) && (
              <div style={{ fontSize: 8, color: '#555', fontFamily: "'IBM Plex Mono',monospace" }}>
                {[towIn.make, towIn.model].filter(Boolean).join(' ') || towIn.make_model}
              </div>
            )}
          </div>
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
                border: `1px solid ${isCancel ? '#333' : '#2a4a2a'}`, borderRadius: 2, padding: '1px 6px',
                background: isCancel ? '#111' : '#0a1a0a' }}>
                <span style={{ fontSize: 7, fontWeight: 400, letterSpacing: '0.08em' }}>
                  {isCancel ? 'VOID' : 'FEE'}
                </span>
                ${parseFloat(job.tow_fee).toFixed(2)}
              </span>
            </>
          )}
        </div>

        {/* Tags + actions row */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
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
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button onClick={onExport}
              style={{ fontSize: 7, padding: '2px 8px', background: 'none', border: '1px solid #2a3a4a',
                color: '#5577aa', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace",
                letterSpacing: '0.06em' }}>
              ↓ PDF
            </button>
            <button onClick={onDelete}
              style={{ fontSize: 7, padding: '2px 8px', background: 'none', border: '1px solid #3a1a1a',
                color: '#664444', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace",
                letterSpacing: '0.06em' }}>
              ✕ Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CompletedTowsTab({ companyId }) {
  const [jobs,       setJobs]       = useState([]);
  const [trucks,     setTrucks]     = useState([]);
  const [depots,     setDepots]     = useState([]);
  const [towIns,     setTowIns]     = useState({}); // dispatched_job_id → tow_in
  const [loading,    setLoading]    = useState(true);
  const [offset,     setOffset]     = useState(0);
  const [hasMore,    setHasMore]    = useState(false);
  const [filter,     setFilter]     = useState('all');
  const [sortBy,     setSortBy]     = useState('date');
  const [sortDir,    setSortDir]    = useState('desc');
  const [showSort,   setShowSort]   = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const sortRef   = useRef(null);
  const exportRef = useRef(null);

  useEffect(() => {
    const handler = e => {
      if (sortRef.current   && !sortRef.current.contains(e.target))   setShowSort(false);
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadJobs = useCallback(async (off = 0, append = false) => {
    setLoading(true);
    let query = supabase
      .from('dispatched_jobs')
      .select('*')
      .order('completed_at', { ascending: false, nullsLast: true })
      .order('dispatched_at', { ascending: false })
      .range(off, off + PAGE);
    if (companyId) query = query.eq('company_id', companyId);
    if (filter === 'completed')      query = query.eq('status', 'completed');
    else if (filter === 'cancelled') query = query.eq('status', 'cancelled');
    else                             query = query.in('status', ['completed', 'cancelled']);

    const { data } = await query;
    const rows = data || [];
    setHasMore(rows.length > PAGE);
    const page = rows.slice(0, PAGE);

    if (page.length > 0) {
      const { data: tis } = await supabase
        .from('tow_ins').select('*').in('dispatched_job_id', page.map(j => j.id));
      if (tis) {
        setTowIns(prev => {
          const next = { ...prev };
          tis.forEach(ti => { if (ti.dispatched_job_id) next[ti.dispatched_job_id] = ti; });
          return next;
        });
      }
    }

    setJobs(prev => append ? [...prev, ...page] : page);
    setOffset(off + page.length);
    setLoading(false);
  }, [companyId, filter]);

  useEffect(() => {
    Promise.all([getTrucks(), getDepots()]).then(([t, d]) => {
      setTrucks(t || []);
      setDepots(d || []);
    });
    loadJobs(0);
  }, [loadJobs]);

  const handleDelete = async (job) => {
    if (!confirm(`Delete this ${job.status} tow job? This cannot be undone.`)) return;
    const { error } = await supabase.from('dispatched_jobs').delete().eq('id', job.id);
    if (!error) setJobs(prev => prev.filter(j => j.id !== job.id));
  };

  const handleExportSingle = (job) => {
    const truck = trucks.find(t => t.id === job.truck_id);
    printJobs(
      [job], trucks, depots, towIns,
      `Tow Job — ${truck?.plate || job.id.slice(0, 8)} — ${fmtShort(job.completed_at || job.dispatched_at)}`
    );
  };

  const handleBulkExport = async (rangeMs) => {
    setExporting(true);
    setShowExport(false);
    const since = new Date(Date.now() - rangeMs).toISOString();
    let q = supabase.from('dispatched_jobs').select('*')
      .in('status', ['completed', 'cancelled'])
      .gte('completed_at', since)
      .order('completed_at', { ascending: false });
    if (companyId) q = q.eq('company_id', companyId);
    const { data: ej } = await q;
    const exportJobs = ej || [];

    const exportTowIns = { ...towIns };
    if (exportJobs.length > 0) {
      const missing = exportJobs.map(j => j.id).filter(id => !exportTowIns[id]);
      if (missing.length > 0) {
        const { data: tis } = await supabase.from('tow_ins').select('*').in('dispatched_job_id', missing);
        if (tis) tis.forEach(ti => { if (ti.dispatched_job_id) exportTowIns[ti.dispatched_job_id] = ti; });
      }
    }

    const rangeLabel = EXPORT_RANGES.find(r => r.ms === rangeMs)?.label || 'custom range';
    printJobs(exportJobs, trucks, depots, exportTowIns, `Completed Tows — Last ${rangeLabel}`);
    setExporting(false);
  };

  // Client-side sort
  const sortedJobs = [...jobs].sort((a, b) => {
    let va, vb;
    switch (sortBy) {
      case 'fee':      va = parseFloat(a.tow_fee) || 0;     vb = parseFloat(b.tow_fee) || 0;     break;
      case 'distance': va = parseFloat(a.distance_km) || 0; vb = parseFloat(b.distance_km) || 0; break;
      case 'type':     va = a.tow_type || '';                vb = b.tow_type || '';               break;
      case 'truck':    va = trucks.find(t => t.id === a.truck_id)?.plate || ''; vb = trucks.find(t => t.id === b.truck_id)?.plate || ''; break;
      case 'vehicle':  va = towIns[a.id]?.plate || '';       vb = towIns[b.id]?.plate || '';      break;
      case 'make':     va = ([towIns[a.id]?.make, towIns[a.id]?.model].filter(Boolean).join(' ') || towIns[a.id]?.make_model || ''); vb = ([towIns[b.id]?.make, towIns[b.id]?.model].filter(Boolean).join(' ') || towIns[b.id]?.make_model || ''); break;
      case 'location': va = a.pickup_label || '';            vb = b.pickup_label || '';           break;
      default:         va = a.completed_at || a.dispatched_at || ''; vb = b.completed_at || b.dispatched_at || ''; break;
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const completedCount   = jobs.filter(j => j.status === 'completed').length;
  const cancelledCount   = jobs.filter(j => j.status === 'cancelled').length;
  const currentSortLabel = SORT_OPTIONS.find(s => s.key === sortBy)?.label || 'Date';

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRN, letterSpacing: '0.06em' }}>✅ Completed Tows</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            {loading ? 'Loading…' : `${completedCount} completed · ${cancelledCount} cancelled`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Filter */}
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

          {/* Sort dropdown */}
          <div ref={sortRef} style={{ position: 'relative' }}>
            <button onClick={() => { setShowSort(v => !v); setShowExport(false); }}
              style={{ fontSize: 8, padding: '3px 8px', borderRadius: 2, cursor: 'pointer',
                fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em',
                background: showSort ? '#1a1a1a' : 'transparent',
                border: `1px solid ${showSort ? '#444' : '#2a2a2a'}`, color: MUT }}>
              ⇅ {currentSortLabel} {sortDir === 'asc' ? '↑' : '↓'}
            </button>
            {showSort && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: '#111',
                border: '1px solid #2a2a2a', borderRadius: 2, zIndex: 200, minWidth: 150, padding: 4 }}>
                {SORT_OPTIONS.map(opt => (
                  <button key={opt.key}
                    onClick={() => {
                      if (sortBy === opt.key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                      else { setSortBy(opt.key); setSortDir(opt.key === 'date' ? 'desc' : 'asc'); }
                      setShowSort(false);
                    }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 9, padding: '6px 10px',
                      background: sortBy === opt.key ? GRN + '15' : 'transparent',
                      color: sortBy === opt.key ? GRN : MUT, border: 'none', cursor: 'pointer',
                      fontFamily: "'IBM Plex Mono',monospace" }}>
                    {sortBy === opt.key ? (sortDir === 'asc' ? '↑ ' : '↓ ') : '  '}{opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bulk export dropdown */}
          <div ref={exportRef} style={{ position: 'relative' }}>
            <button onClick={() => { setShowExport(v => !v); setShowSort(false); }}
              disabled={exporting}
              style={{ fontSize: 8, padding: '3px 8px', borderRadius: 2,
                cursor: exporting ? 'default' : 'pointer',
                fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em',
                background: showExport ? '#0a1520' : 'transparent',
                border: `1px solid ${showExport ? '#2a4a6a' : '#2a3a4a'}`,
                color: exporting ? '#333' : '#5577aa' }}>
              {exporting ? '…' : '↓ Export PDF'}
            </button>
            {showExport && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: '#111',
                border: '1px solid #2a2a2a', borderRadius: 2, zIndex: 200, minWidth: 140, padding: 4 }}>
                <div style={{ fontSize: 7, color: MUT, padding: '4px 10px 6px',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  borderBottom: '1px solid #1e1e1e', marginBottom: 4 }}>
                  Export last…
                </div>
                {EXPORT_RANGES.map(r => (
                  <button key={r.ms} onClick={() => handleBulkExport(r.ms)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 9, padding: '6px 10px',
                      background: 'transparent', color: MUT, border: 'none', cursor: 'pointer',
                      fontFamily: "'IBM Plex Mono',monospace" }}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Refresh */}
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

      {sortedJobs.map(job => {
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
            towIn={towIns[job.id]}
            onDelete={() => handleDelete(job)}
            onExport={() => handleExportSingle(job)}
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
