import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, BRD, TXT, GRN, RED, SURF, inp, txa, btnA, btnG, sm, ovly, mdl, mdlH, mdlB, mdlF } from '../../lib/styles';
import { timeIn } from '../../lib/utils';

const FL = ({ t }) => (
  <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{t}</div>
);

function calcFee(km, cfg, towType) {
  if (!cfg || !km) return null;
  const now  = new Date();
  const isWE = now.getDay() === 0 || now.getDay() === 6;
  const t    = now.toTimeString().slice(0, 5);
  const start = isWE ? (cfg.after_hours_start_weekend ?? '18:00') : (cfg.after_hours_start_weekday ?? '18:00');
  const end   = isWE ? (cfg.after_hours_end_weekend   ?? '06:00') : (cfg.after_hours_end_weekday   ?? '06:00');
  const ah    = t >= start || t < end;
  const ahFee = parseFloat(isWE ? cfg.after_hours_fee_weekend : cfg.after_hours_fee_weekday) || 0;
  const sur   = ah ? ahFee : 0;
  if (towType === 'trade') {
    const base = parseFloat(cfg.trade_base_fee) || 0;
    return base + Math.max(0, km - 10) * (parseFloat(cfg.trade_per_km_fee) || 0) + sur;
  }
  const base = parseFloat(cfg.accident_base_fee) || 0;
  return base + Math.max(0, km - 8) * (parseFloat(cfg.accident_per_km_fee) || 0) + sur;
}

// ─── Dispatch modal ────────────────────────────────────────────────────────────
function DispatchModal({ feature, trucks, depots, companyConfig, companyId, userEmail, onSave, onCancel }) {
  const [truckId,     setTruckId]     = useState('');
  const [towType,     setTowType]     = useState('accident');
  const [route,       setRoute]       = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState('');

  const props  = feature.properties || {};
  const coords = feature.geometry?.coordinates; // [lng, lat]
  const road   = props.closedRoadName || '—';
  const suburb = props.reference?.startIntersectionLocality || '';
  const eventId = String(props.eventId || '');

  useEffect(() => {
    if (!truckId || !coords) { setRoute(null); return; }
    const truck = trucks.find(t => t.id === truckId);
    const depot = depots.find(d => d.id === truck?.depot_id);
    if (!depot?.lat) { setRoute(null); return; }
    let cancelled = false;
    setCalculating(true);
    const wps = `${depot.lng},${depot.lat};${coords[0]},${coords[1]};${depot.lng},${depot.lat}`;
    fetch(`https://router.project-osrm.org/route/v1/driving/${wps}?overview=false`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        const r = json.routes?.[0];
        if (r) setRoute({ km: r.distance / 1000, min: Math.round(r.duration / 60) });
        setCalculating(false);
      })
      .catch(() => { if (!cancelled) setCalculating(false); });
    return () => { cancelled = true; };
  }, [truckId, coords]); // eslint-disable-line react-hooks/exhaustive-deps

  const fee = route ? calcFee(route.km, companyConfig, towType) : null;

  const dispatch = async () => {
    if (!truckId) { setErr('Select a truck.'); return; }
    setSaving(true); setErr('');
    const truck = trucks.find(t => t.id === truckId);
    const depot = depots.find(d => d.id === truck?.depot_id);
    const { data, error } = await supabase.from('dispatched_jobs').insert({
      company_id:    companyId,
      event_id:      eventId,
      truck_id:      truckId,
      from_depot_id: depot?.id || null,
      to_depot_id:   depot?.id || null,
      pickup_lat:    coords ? coords[1] : null,
      pickup_lng:    coords ? coords[0] : null,
      pickup_label:  road !== '—' ? road : (suburb || 'Unknown location'),
      tow_type:      towType,
      distance_km:   route?.km || null,
      duration_min:  route?.min || null,
      tow_fee:       fee || null,
      dispatched_by: userEmail,
      status:        'in_progress',
    }).select().single();
    if (error) { setErr(error.message); setSaving(false); return; }
    await supabase.from('job_accepted').insert({
      event_id: eventId, accepted_by: userEmail, company_id: companyId,
    }).catch(() => {});
    onSave(data);
  };

  const selectedTruck  = trucks.find(t => t.id === truckId);
  const selectedDepot  = depots.find(d => d.id === selectedTruck?.depot_id);
  const noDepotCoords  = selectedTruck && !selectedDepot?.lat;

  return (
    <div style={ovly} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...mdl, maxWidth: 420 }}>
        <div style={mdlH}>
          <b style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Dispatch Job</b>
          <button style={{ ...btnG, ...sm }} onClick={onCancel}>✕</button>
        </div>
        <div style={{ ...mdlB, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Job info */}
          <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 2, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: TXT }}>{road}</div>
            <div style={{ fontSize: 8, color: MUT, marginTop: 2 }}>#{eventId}{suburb ? ` · ${suburb}` : ''}</div>
          </div>

          {/* Truck */}
          <div>
            <FL t="Assign Truck *" />
            <select style={inp} value={truckId} onChange={e => setTruckId(e.target.value)} autoFocus>
              <option value="">— Select truck —</option>
              {trucks.map(t => {
                const dep = depots.find(d => d.id === t.depot_id);
                return (
                  <option key={t.id} value={t.id}>
                    {t.plate}{t.first_name ? ` · ${t.first_name}` : ''}{dep ? ` · ${dep.name}` : ' · no depot'}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Tow type */}
          <div>
            <FL t="Tow Type" />
            <div style={{ display: 'flex', gap: 6 }}>
              {['accident', 'trade'].map(tp => (
                <button key={tp} onClick={() => setTowType(tp)}
                  style={{ flex: 1, fontSize: 9, padding: '6px 0', borderRadius: 2, cursor: 'pointer',
                    fontFamily: "'IBM Plex Mono',monospace",
                    border: `1px solid ${towType === tp ? ACC + '88' : '#2a2a2a'}`,
                    color: towType === tp ? ACC : MUT,
                    background: towType === tp ? ACC + '15' : 'transparent' }}>
                  {tp.charAt(0).toUpperCase() + tp.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Route result */}
          {truckId && (
            <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 2, padding: '8px 10px' }}>
              {calculating ? (
                <span style={{ fontSize: 9, color: MUT }}>Calculating route…</span>
              ) : noDepotCoords ? (
                <span style={{ fontSize: 8, color: '#7a5500' }}>⚠ Depot has no address — add one in Fleet settings</span>
              ) : !selectedDepot ? (
                <span style={{ fontSize: 8, color: '#555' }}>No depot assigned to this truck</span>
              ) : route ? (
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: ACC }}>{route.km.toFixed(1)} km · ~{route.min} min</span>
                  {fee != null && fee > 0 && (
                    <span style={{ fontSize: 11, color: GRN, marginLeft: 10, fontWeight: 700 }}>${fee.toFixed(2)}</span>
                  )}
                  <div style={{ fontSize: 7, color: '#3a3a3a', marginTop: 3 }}>
                    {selectedDepot.name} → Pickup → {selectedDepot.name}
                  </div>
                </div>
              ) : (
                <span style={{ fontSize: 8, color: '#333' }}>Enter depot coordinates in Fleet settings to calculate route</span>
              )}
            </div>
          )}

          {err && <div style={{ fontSize: 9, color: RED }}>{err}</div>}
        </div>
        <div style={mdlF}>
          <button style={btnG} onClick={onCancel}>Cancel</button>
          <button style={{ ...btnA, opacity: (saving || !truckId) ? 0.5 : 1 }}
            disabled={saving || !truckId} onClick={dispatch}>
            {saving ? 'Dispatching…' : '▶ Dispatch'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Complete modal ────────────────────────────────────────────────────────────
function CompleteModal({ job, trucks, depots, storageTypes, companyId, userEmail, onSave, onCancel }) {
  const [status,        setStatus]        = useState('in_yard');
  const [plate,         setPlate]         = useState('');
  const [makeModel,     setMakeModel]     = useState('');
  const [storageTypeId, setStorageTypeId] = useState(storageTypes[0]?.id || '');
  const [chargeTo,      setChargeTo]      = useState('');
  const [notes,         setNotes]         = useState('');
  const [saving,        setSaving]        = useState(false);
  const [err,           setErr]           = useState('');

  const truck = trucks.find(t => t.id === job.truck_id);
  const depot = depots.find(d => d.id === (job.to_depot_id || job.from_depot_id));

  const confirm = async () => {
    if (status === 'in_yard'   && !plate.trim())    { setErr('Plate is required.'); return; }
    if (status === 'cancelled' && !chargeTo.trim()) { setErr('Charge To reference is required.'); return; }
    setSaving(true); setErr('');

    const { error: tiErr } = await supabase.from('tow_ins').insert({
      company_id:        companyId,
      dispatched_job_id: job.id,
      plate:             plate.trim().toUpperCase() || (status === 'cancelled' ? 'CANCELLED' : 'UNKNOWN'),
      vehicle_type:      'motor_car',
      storage_type_id:   status === 'in_yard' ? (storageTypeId || null) : null,
      depot_id:          depot?.id || null,
      date_in:           new Date().toISOString(),
      tow_fee:           job.tow_fee || null,
      distance_km:       job.distance_km || null,
      tow_type:          job.tow_type || null,
      make_model:        makeModel.trim() || null,
      notes:             notes.trim() || null,
      charge_to:         status === 'cancelled' ? chargeTo.trim() : null,
      cancelled:         status === 'cancelled',
      created_by:        userEmail,
    });
    if (tiErr) { setErr(tiErr.message); setSaving(false); return; }

    await supabase.from('dispatched_jobs')
      .update({
        status:       status === 'cancelled' ? 'cancelled' : 'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', job.id);

    setSaving(false);
    onSave();
  };

  return (
    <div style={ovly} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...mdl, maxWidth: 440 }}>
        <div style={mdlH}>
          <b style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Complete Job</b>
          <button style={{ ...btnG, ...sm }} onClick={onCancel}>✕</button>
        </div>
        <div style={{ ...mdlB, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Job summary */}
          <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 2, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: TXT, fontWeight: 700 }}>{job.pickup_label}</div>
            <div style={{ fontSize: 8, color: MUT, marginTop: 2 }}>
              {truck ? `${truck.plate}${truck.first_name ? ` · ${truck.first_name}` : ''}` : '—'}
              {job.distance_km ? ` · ${parseFloat(job.distance_km).toFixed(1)} km` : ''}
              {job.tow_fee    ? ` · $${parseFloat(job.tow_fee).toFixed(2)}` : ''}
              {job.tow_type   ? <span style={{ color: job.tow_type === 'accident' ? '#cc4444' : '#2299aa', marginLeft: 4 }}> {job.tow_type}</span> : null}
            </div>
          </div>

          {/* Outcome toggle */}
          <div>
            <FL t="Outcome" />
            <div style={{ display: 'flex', gap: 6 }}>
              {[['in_yard', '✓ Vehicle in Yard', GRN], ['cancelled', '✗ Job Cancelled', RED]].map(([val, label, col]) => (
                <button key={val} onClick={() => setStatus(val)}
                  style={{ flex: 1, fontSize: 9, padding: '7px 0', borderRadius: 2, cursor: 'pointer',
                    fontFamily: "'IBM Plex Mono',monospace",
                    border: `1px solid ${status === val ? col + '88' : '#2a2a2a'}`,
                    color: status === val ? col : MUT,
                    background: status === val ? col + '15' : 'transparent' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {status === 'in_yard' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <FL t="Plate *" />
                  <input style={inp} value={plate} onChange={e => setPlate(e.target.value.toUpperCase())}
                    placeholder="ABC123" autoFocus autoCapitalize="characters" />
                </div>
                <div>
                  <FL t="Make / Model" />
                  <input style={inp} value={makeModel} onChange={e => setMakeModel(e.target.value)}
                    placeholder="Toyota Camry" />
                </div>
              </div>
              {storageTypes.length > 0 && (
                <div>
                  <FL t="Storage Type" />
                  <select style={inp} value={storageTypeId} onChange={e => setStorageTypeId(e.target.value)}>
                    {storageTypes.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} · ${parseFloat(s.daily_rate).toFixed(2)}/day
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {status === 'cancelled' && (
            <>
              <div>
                <FL t="Plate (if known)" />
                <input style={inp} value={plate} onChange={e => setPlate(e.target.value.toUpperCase())}
                  placeholder="Optional" autoCapitalize="characters" />
              </div>
              <div>
                <FL t="Charge To *" />
                <input style={inp} value={chargeTo} onChange={e => setChargeTo(e.target.value)}
                  placeholder="VicPol job ref, company name, etc." autoFocus />
              </div>
            </>
          )}

          <div>
            <FL t="Notes" />
            <textarea style={{ ...txa, ...inp }} value={notes}
              onChange={e => setNotes(e.target.value)} placeholder="Additional details…" />
          </div>

          {err && <div style={{ fontSize: 9, color: RED }}>{err}</div>}
        </div>
        <div style={mdlF}>
          <button style={btnG} onClick={onCancel}>Cancel</button>
          <button style={{ ...btnA, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={confirm}>
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main tab ──────────────────────────────────────────────────────────────────
export default function DispatchTab({ allFeatures, liveIds, acceptedJobs, companyId, userEmail, companyConfig }) {
  const [trucks,        setTrucks]        = useState([]);
  const [depots,        setDepots]        = useState([]);
  const [storageTypes,  setStorageTypes]  = useState([]);
  const [inProgress,    setInProgress]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [completeTarget, setCompleteTarget] = useState(null);

  const loadData = useCallback(async () => {
    if (!companyId) return;
    const [{ data: td }, { data: dd }, { data: sd }, { data: jd }] = await Promise.all([
      supabase.from('tow_trucks').select('id, plate, first_name, last_name, depot_id').eq('company_id', companyId).order('plate'),
      supabase.from('depots').select('id, name, suburb, lat, lng').eq('company_id', companyId).order('name'),
      supabase.from('storage_types').select('*').eq('company_id', companyId).order('daily_rate', { ascending: false }),
      supabase.from('dispatched_jobs').select('*').eq('company_id', companyId).eq('status', 'in_progress').order('dispatched_at', { ascending: false }),
    ]);
    setTrucks(td || []);
    setDepots(dd || []);
    setStorageTypes(sd || []);
    setInProgress(jd || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { loadData(); }, [loadData]);

  const liveJobs = allFeatures.filter(f => liveIds.has(String(f.properties?.eventId)));

  const cancelJob = async job => {
    await supabase.from('dispatched_jobs')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', job.id);
    setInProgress(prev => prev.filter(j => j.id !== job.id));
  };

  const dispatchedEventIds = new Set(inProgress.map(j => j.event_id));

  if (loading) return (
    <div style={{ padding: 16, fontSize: 10, color: MUT, textAlign: 'center', paddingTop: 48 }}>Loading…</div>
  );

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      {dispatchTarget && (
        <DispatchModal
          feature={dispatchTarget}
          trucks={trucks} depots={depots}
          companyConfig={companyConfig} companyId={companyId} userEmail={userEmail}
          onSave={job => { setInProgress(prev => [job, ...prev]); setDispatchTarget(null); }}
          onCancel={() => setDispatchTarget(null)}
        />
      )}
      {completeTarget && (
        <CompleteModal
          job={completeTarget}
          trucks={trucks} depots={depots} storageTypes={storageTypes}
          companyId={companyId} userEmail={userEmail}
          onSave={() => { setInProgress(prev => prev.filter(j => j.id !== completeTarget.id)); setCompleteTarget(null); }}
          onCancel={() => setCompleteTarget(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>🚨 Dispatch</div>
        {inProgress.length > 0 && (
          <span style={{ fontSize: 8, color: ACC, border: `1px solid ${ACC}55`, borderRadius: 2, padding: '1px 6px' }}>
            {inProgress.length} in progress
          </span>
        )}
      </div>

      {/* In Progress */}
      {inProgress.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 8, color: ACC, letterSpacing: '0.12em', textTransform: 'uppercase',
            fontWeight: 700, marginBottom: 8, borderLeft: `2px solid ${ACC}`, paddingLeft: 6 }}>
            In Progress ({inProgress.length})
          </div>
          {inProgress.map(job => {
            const truck = trucks.find(t => t.id === job.truck_id);
            const depot = depots.find(d => d.id === (job.to_depot_id || job.from_depot_id));
            return (
              <div key={job.id} style={{ background: '#0d0d0d', border: '1px solid #252525',
                borderLeft: `3px solid ${ACC}`, borderRadius: 2, padding: '10px 12px',
                marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.pickup_label}
                  </div>
                  <div style={{ fontSize: 8, color: MUT, marginTop: 2 }}>
                    {truck ? `${truck.plate}${truck.first_name ? ` · ${truck.first_name}` : ''}` : '—'}
                    {depot ? ` · ${depot.name}` : ''}
                    {job.distance_km ? ` · ${parseFloat(job.distance_km).toFixed(1)} km` : ''}
                    {job.tow_fee     ? ` · $${parseFloat(job.tow_fee).toFixed(2)}` : ''}
                    {job.tow_type    && (
                      <span style={{ color: job.tow_type === 'accident' ? '#cc4444' : '#2299aa', marginLeft: 4 }}>
                        · {job.tow_type}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 7, color: '#3a3a3a', marginTop: 2 }}>
                    Dispatched {timeIn(job.dispatched_at) || 'just now'} ago
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                  <button onClick={() => setCompleteTarget(job)}
                    style={{ ...btnG, ...sm, fontSize: 7, color: GRN, borderColor: GRN + '55' }}>
                    ✓ Complete
                  </button>
                  <button onClick={() => cancelJob(job)}
                    style={{ ...btnG, ...sm, fontSize: 7, color: RED, borderColor: RED + '55' }}>
                    ✗ Cancel
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Live Jobs */}
      <div>
        <div style={{ fontSize: 8, color: GRN, letterSpacing: '0.12em', textTransform: 'uppercase',
          fontWeight: 700, marginBottom: 8, borderLeft: `2px solid ${GRN}`, paddingLeft: 6 }}>
          Live Jobs ({liveJobs.length})
        </div>
        {liveJobs.length === 0 && (
          <div style={{ fontSize: 9, color: MUT, padding: '32px 0', textAlign: 'center' }}>
            No live jobs at the moment.
          </div>
        )}
        {liveJobs.map(feature => {
          const props    = feature.properties || {};
          const eventId  = String(props.eventId || '');
          const isDisp   = dispatchedEventIds.has(eventId);
          const accepted = acceptedJobs?.get(eventId);
          const road     = props.closedRoadName || '—';
          const suburb   = props.reference?.startIntersectionLocality || '';
          const updated  = props.lastUpdated;
          return (
            <div key={eventId} style={{ background: '#0d0d0d', border: '1px solid #252525',
              borderLeft: `3px solid ${isDisp ? '#333' : GRN}`, borderRadius: 2,
              padding: '10px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: isDisp ? MUT : TXT,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {road}
                </div>
                <div style={{ fontSize: 8, color: MUT, marginTop: 2 }}>
                  #{eventId}{suburb ? ` · ${suburb}` : ''}
                  {updated && ` · ${timeIn(updated) || 'just now'} ago`}
                </div>
                {isDisp && <div style={{ fontSize: 7, color: ACC, marginTop: 2 }}>▶ Dispatched</div>}
                {accepted && !isDisp && (
                  <div style={{ fontSize: 7, color: '#6688cc', marginTop: 2 }}>
                    🔒 Taken · {accepted.accepted_by?.split('@')[0]}
                  </div>
                )}
              </div>
              {!isDisp && (
                <button onClick={() => setDispatchTarget(feature)}
                  style={{ ...btnA, ...sm, fontSize: 8, flexShrink: 0 }}>
                  ▶ Dispatch
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
