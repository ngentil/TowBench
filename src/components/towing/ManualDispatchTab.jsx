import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, BRD, TXT, GRN, RED, SURF, inp, sel, btnA, btnG, btnD, sm } from '../../lib/styles';
import { FL } from '../ui/shared';
import { getTrucks, getDepots } from '../../lib/db/towing';

const ORANGE = '#e8870a';

function ahSurcharge(cfg) {
  if (!cfg) return 0;
  const now  = new Date();
  const isWE = now.getDay() === 0 || now.getDay() === 6;
  const t    = now.toTimeString().slice(0, 5);
  const start = isWE ? (cfg.after_hours_start_weekend ?? '18:00') : (cfg.after_hours_start_weekday ?? '18:00');
  const end   = isWE ? (cfg.after_hours_end_weekend   ?? '06:00') : (cfg.after_hours_end_weekday   ?? '06:00');
  return (t >= start || t < end) ? (parseFloat(isWE ? cfg.after_hours_fee_weekend : cfg.after_hours_fee_weekday) || 0) : 0;
}

function calcPriceBreakdown(totalKm, cfg, towType, twoUpTrade, twoUpAccident) {
  if (!cfg || !totalKm) return null;
  const sur      = ahSurcharge(cfg);
  const allowAcc = cfg.allow_accident_twoup ?? false;
  const result   = {};

  if (towType === 'accident' || towType === 'custom') {
    const base     = parseFloat(cfg.accident_base_fee) || 0;
    const freeKm   = 8;
    const billable = Math.max(0, totalKm - freeKm);
    const perKm    = parseFloat(cfg.accident_per_km_fee) || 0;
    const kmCharge = billable * perKm;
    const mul      = (twoUpAccident && allowAcc) ? 2 : 1;
    if (base > 0) result.accident = { base, freeKm, billable, perKm, kmCharge, sur, mul, total: (base + kmCharge + sur) * mul };
  }
  if (towType === 'trade' || towType === 'custom') {
    const base     = parseFloat(cfg.trade_base_fee) || 0;
    const freeKm   = 10;
    const billable = Math.max(0, totalKm - freeKm);
    const perKm    = parseFloat(cfg.trade_per_km_fee) || 0;
    const kmCharge = billable * perKm;
    const mul      = twoUpTrade ? 2 : 1;
    if (base > 0) result.trade = { base, freeKm, billable, perKm, kmCharge, sur, mul, total: (base + kmCharge + sur) * mul };
  }
  return Object.keys(result).length ? result : null;
}

function AddrSearch({ label, value, onChange, onPick, results, onClearResults, placeholder }) {
  return (
    <div style={{ position: 'relative' }}>
      <FL t={label} />
      <input
        style={{ ...inp, width: '100%', boxSizing: 'border-box' }}
        value={value}
        onChange={onChange}
        placeholder={placeholder || 'Search address…'}
        autoComplete="off"
      />
      {results.length > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 400,
          background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: 2,
          maxHeight: 130, overflowY: 'auto', marginTop: 2 }}>
          {results.map((r, i) => (
            <div key={i}
              onMouseDown={e => { e.preventDefault(); onPick(r); onClearResults(); }}
              style={{ padding: '5px 8px', fontSize: 9, color: '#bbb', cursor: 'pointer',
                borderBottom: '1px solid #1a1a1a', lineHeight: 1.5, fontFamily: "'IBM Plex Mono',monospace" }}
              onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {r.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TOW_TYPES = ['accident', 'trade', 'custom'];

export default function ManualDispatchTab({ companyId, companyConfig, userEmail }) {
  const [trucks, setTrucks] = useState([]);
  const [depots, setDepots] = useState([]);

  const [truckId,   setTruckId]   = useState('');
  const [towType,   setTowType]   = useState('accident');
  const [twoUpTrade,    setTwoUpTrade]    = useState(false);
  const [twoUpAccident, setTwoUpAccident] = useState(false);

  // From depot
  const [fromDepot,       setFromDepot]       = useState(true);
  const [fromDepotId,     setFromDepotId]     = useState('');
  const [fromDepotPoint,  setFromDepotPoint]  = useState(null);

  // Pickup A
  const [searchA,    setSearchA]    = useState('');
  const [resultsA,   setResultsA]   = useState([]);
  const [pointA,     setPointA]     = useState(null);

  // Destination B (optional)
  const [destEnabled, setDestEnabled] = useState(false);
  const [searchB,    setSearchB]    = useState('');
  const [resultsB,   setResultsB]   = useState([]);
  const [pointB,     setPointB]     = useState(null);

  // Return depot
  const [returnDepot,      setReturnDepot]      = useState(true);
  const [returnDepotId,    setReturnDepotId]    = useState('');
  const [returnDepotPoint, setReturnDepotPoint] = useState(null);

  // Docket
  const [docketRequired, setDocketRequired] = useState(false);

  // Extra stops
  const [extraStops, setExtraStops] = useState([]);

  // Route
  const [route,       setRoute]       = useState(null);
  const [calculating, setCalculating] = useState(false);

  // Save state
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [err,     setErr]     = useState('');

  useEffect(() => {
    getTrucks().then(data => setTrucks(data || [])).catch(() => {});
    getDepots().then(data => setDepots(data || [])).catch(() => {});
  }, []);

  // Auto-pick depot when truck changes
  useEffect(() => {
    if (!truckId) return;
    const truck = trucks.find(t => t.id === truckId);
    const depot = depots.find(d => d.id === truck?.depot_id);
    if (depot) {
      setFromDepotId(depot.id); setFromDepotPoint(depot);
      setReturnDepotId(depot.id); setReturnDepotPoint(depot);
    }
  }, [truckId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync depot points when pickers change
  useEffect(() => {
    const d = depots.find(d => d.id === fromDepotId);
    setFromDepotPoint(d || null);
  }, [fromDepotId, depots]);

  useEffect(() => {
    const d = depots.find(d => d.id === returnDepotId);
    setReturnDepotPoint(d || null);
  }, [returnDepotId, depots]);

  // Nominatim search
  const geocode = useCallback(async (q, setResults) => {
    if (q.length < 3) { setResults([]); return; }
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&countrycodes=au`);
      const data = await res.json();
      setResults(data.map(r => ({ label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) })));
    } catch { setResults([]); }
  }, []);

  useEffect(() => { if (!pointA) { const t = setTimeout(() => geocode(searchA, setResultsA), 300); return () => clearTimeout(t); } }, [searchA]); // eslint-disable-line
  useEffect(() => { if (!pointB) { const t = setTimeout(() => geocode(searchB, setResultsB), 300); return () => clearTimeout(t); } }, [searchB]); // eslint-disable-line

  // OSRM routing
  useEffect(() => {
    const wps = [], labels = [];
    if (fromDepot && fromDepotPoint?.lat != null) { wps.push(fromDepotPoint); labels.push(fromDepotPoint.name); }
    if (pointA) { wps.push(pointA); labels.push(pointA.label?.split(',')[0] || 'Pickup'); }
    if (destEnabled && pointB) { wps.push(pointB); labels.push(pointB.label?.split(',')[0] || 'Dest'); }
    extraStops.forEach((s, i) => { if (s.point) { wps.push(s.point); labels.push(s.point.label?.split(',')[0] || `Stop ${i+1}`); } });
    if (returnDepot && returnDepotPoint?.lat != null) { wps.push(returnDepotPoint); labels.push(returnDepotPoint.name); }
    if (wps.length < 2) { setRoute(null); return; }
    let cancelled = false;
    setCalculating(true);
    fetch(`https://router.project-osrm.org/route/v1/driving/${wps.map(p => `${p.lng},${p.lat}`).join(';')}?overview=false`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        const r = json.routes?.[0];
        if (r) {
          setRoute({
            km:  r.distance / 1000,
            min: Math.round(r.duration / 60),
            legs: r.legs.map((l, i) => ({ km: l.distance / 1000, label: `${labels[i]} → ${labels[i+1]}` })),
          });
        } else setRoute(null);
        setCalculating(false);
      })
      .catch(() => { if (!cancelled) { setRoute(null); setCalculating(false); } });
    return () => { cancelled = true; };
  }, [fromDepot, fromDepotPoint, pointA, destEnabled, pointB, extraStops, returnDepot, returnDepotPoint]);

  const breakdown = route ? calcPriceBreakdown(route.km, companyConfig, towType, twoUpTrade, twoUpAccident) : null;
  const totalFee  = breakdown ? ((breakdown.accident?.total ?? 0) + (breakdown.trade?.total ?? 0)) || null : null;

  const reset = () => {
    setTruckId(''); setTowType('accident'); setTwoUpTrade(false); setTwoUpAccident(false);
    setDocketRequired(false);
    setFromDepot(true); setFromDepotId(''); setFromDepotPoint(null);
    setSearchA(''); setResultsA([]); setPointA(null);
    setDestEnabled(false); setSearchB(''); setResultsB([]); setPointB(null);
    setReturnDepot(true); setReturnDepotId(''); setReturnDepotPoint(null);
    setExtraStops([]); setRoute(null); setErr('');
  };

  const dispatch = async () => {
    if (!truckId) { setErr('Select a truck.'); return; }
    if (!pointA)  { setErr('Enter a pickup address.'); return; }
    setSaving(true); setErr('');
    const fromDep  = depots.find(d => d.id === fromDepotId);
    const toDep    = depots.find(d => d.id === returnDepotId) || fromDep;
    const truckRow = trucks.find(t => t.id === truckId);
    // Resolve dropoff: explicit destination > return depot > null
    const dropoff  = (destEnabled && pointB)
      ? { label: pointB.label, lat: pointB.lat, lng: pointB.lng }
      : (returnDepot && returnDepotPoint?.lat != null)
      ? { label: returnDepotPoint.name || 'Depot', lat: returnDepotPoint.lat, lng: returnDepotPoint.lng }
      : null;
    const { error } = await supabase.from('dispatched_jobs').insert({
      company_id:      companyId,
      event_id:        null,
      truck_id:        truckId,
      assigned_to:     truckRow?.auth_email || null,
      from_depot_id:   fromDepot ? (fromDep?.id || null) : null,
      to_depot_id:     returnDepot ? (toDep?.id || null) : null,
      pickup_lat:      pointA.lat,
      pickup_lng:      pointA.lng,
      pickup_label:    pointA.label,
      dropoff_label:   dropoff?.label || null,
      dropoff_lat:     dropoff?.lat   || null,
      dropoff_lng:     dropoff?.lng   || null,
      tow_type:        towType,
      docket_required: (towType !== 'accident') ? docketRequired : false,
      distance_km:     route?.km   || null,
      duration_min:    route?.min  || null,
      tow_fee:         totalFee    || null,
      dispatched_by:   userEmail,
      status:          'in_progress',
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setSaved(true);
    reset();
    setTimeout(() => setSaved(false), 3000);
  };

  const allowAccidentTwoUp = companyConfig?.allow_accident_twoup ?? false;

  const typeBtn = (t) => (
    <button key={t} onClick={() => setTowType(t)}
      style={{ flex: 1, padding: '6px 0', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace", cursor: 'pointer',
        borderRadius: 2, border: `1px solid ${towType === t ? ACC + '88' : '#2a2a2a'}`,
        background: towType === t ? ACC + '22' : '#0a0a0a',
        color: towType === t ? ACC : MUT }}>
      {t}
    </button>
  );

  const Toggle = ({ on, onToggle, label }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
      <div onClick={onToggle} style={{ width: 32, height: 18, borderRadius: 9, background: on ? ACC : '#2a2a2a',
        position: 'relative', flexShrink: 0, transition: 'background 0.2s', cursor: 'pointer' }}>
        <div style={{ width: 12, height: 12, borderRadius: 6, background: '#fff', position: 'absolute',
          top: 3, left: on ? 17 : 3, transition: 'left 0.2s' }} />
      </div>
      <span style={{ fontSize: 9, color: on ? TXT : MUT }}>{label}</span>
    </label>
  );

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>🚨 Dispatch</div>
        <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>Manually dispatch a trade or accident tow</div>
      </div>

      {saved && (
        <div style={{ marginBottom: 14, padding: '8px 12px', background: GRN + '11', border: `1px solid ${GRN}44`, borderRadius: 2, fontSize: 9, color: GRN }}>
          ✓ Job dispatched — visible in Active Tows
        </div>
      )}

      <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '16px 18px', maxWidth: 500 }}>

        {/* Truck */}
        <div style={{ marginBottom: 14 }}>
          <FL t="Assign Truck *" />
          <select style={{ ...sel, width: '100%' }} value={truckId} onChange={e => setTruckId(e.target.value)}>
            <option value="">— Select truck —</option>
            {trucks.map(t => {
              const dep = depots.find(d => d.id === t.depot_id);
              return (
                <option key={t.id} value={t.id}>
                  {t.plate}{t.truck_type ? ` · ${t.truck_type}` : ''}{dep ? ` · ${dep.name}` : ''}
                </option>
              );
            })}
          </select>
        </div>

        {/* Tow type */}
        <div style={{ marginBottom: 14 }}>
          <FL t="Tow Type" />
          <div style={{ display: 'flex', gap: 6 }}>{TOW_TYPES.map(typeBtn)}</div>
        </div>


        <div style={{ borderTop: '1px solid #1a1a1a', margin: '14px 0' }} />

        {/* From depot */}
        <div style={{ marginBottom: 10 }}>
          <Toggle on={fromDepot} onToggle={() => setFromDepot(v => !v)} label="From depot" />
          {fromDepot && (
            <select style={{ ...sel, width: '100%', marginTop: 8 }} value={fromDepotId} onChange={e => setFromDepotId(e.target.value)}>
              <option value="">— Select depot —</option>
              {depots.map(d => <option key={d.id} value={d.id}>{d.name}{d.suburb ? ` · ${d.suburb}` : ''}</option>)}
            </select>
          )}
        </div>

        {/* Pickup A */}
        <div style={{ marginBottom: 10 }}>
          <AddrSearch
            label="Pickup *"
            value={searchA}
            onChange={e => { setSearchA(e.target.value); setPointA(null); }}
            onPick={r => { setPointA(r); setSearchA(r.label.split(',').slice(0,2).join(',').trim()); }}
            results={resultsA}
            onClearResults={() => setResultsA([])}
            placeholder="Search pickup address…"
          />
          {!pointA && navigator.geolocation && (
            <button onClick={async () => {
              try {
                const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10_000 }));
                const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`).then(x => x.json());
                const a = r.address || {}; const label = [a.road || a.pedestrian || '', a.suburb || a.city || ''].filter(Boolean).join(', ') || r.display_name;
                setPointA({ lat: pos.coords.latitude, lng: pos.coords.longitude, label }); setSearchA(label.split(',')[0].trim());
              } catch {}
            }} style={{ marginTop: 5, width: '100%', padding: '5px 0', borderRadius: 2, cursor: 'pointer', border: '1px solid #2a4a2a', color: GRN, background: '#0a150a', fontSize: 9, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em' }}>
              📍 Use my location
            </button>
          )}
          {pointA && <div style={{ fontSize: 7, color: GRN, marginTop: 3 }}>📍 {pointA.label.split(',').slice(0,2).join(',').trim()}</div>}
        </div>

        {/* Destination (optional) */}
        <div style={{ marginBottom: 10 }}>
          <Toggle on={destEnabled} onToggle={() => { setDestEnabled(v => !v); if (destEnabled) { setSearchB(''); setPointB(null); setResultsB([]); } }} label="Destination (optional)" />
          {destEnabled && (
            <div style={{ marginTop: 8 }}>
              <AddrSearch
                label=""
                value={searchB}
                onChange={e => { setSearchB(e.target.value); setPointB(null); }}
                onPick={r => { setPointB(r); setSearchB(r.label.split(',').slice(0,2).join(',').trim()); }}
                results={resultsB}
                onClearResults={() => setResultsB([])}
                placeholder="Search destination…"
              />
              {!pointB && navigator.geolocation && (
                <button onClick={async () => {
                  try {
                    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10_000 }));
                    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`).then(x => x.json());
                    const a = r.address || {}; const label = [a.road || a.pedestrian || '', a.suburb || a.city || ''].filter(Boolean).join(', ') || r.display_name;
                    setPointB({ lat: pos.coords.latitude, lng: pos.coords.longitude, label }); setSearchB(label.split(',')[0].trim());
                  } catch {}
                }} style={{ marginTop: 5, width: '100%', padding: '5px 0', borderRadius: 2, cursor: 'pointer', border: '1px solid #4a1a1a', color: '#cc4444', background: '#150a0a', fontSize: 9, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em' }}>
                  📍 Use my location
                </button>
              )}
              {pointB && <div style={{ fontSize: 7, color: '#cc4444', marginTop: 3 }}>📍 {pointB.label.split(',').slice(0,2).join(',').trim()}</div>}
            </div>
          )}
        </div>

        {/* Extra stops */}
        {extraStops.map((stop, i) => (
          <ExtraStop key={i} index={i} stop={stop}
            onChange={updated => setExtraStops(prev => prev.map((s, j) => j === i ? updated : s))}
            onRemove={() => setExtraStops(prev => prev.filter((_, j) => j !== i))} />
        ))}
        <button onClick={() => setExtraStops(prev => [...prev, { search: '', results: [], point: null }])}
          style={{ fontSize: 8, color: MUT, border: '1px dashed #2a2a2a', borderRadius: 2, background: 'transparent',
            padding: '4px 10px', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", marginBottom: 10, display: 'block' }}>
          + Add Stop
        </button>

        {/* Return depot */}
        <div style={{ marginBottom: 14 }}>
          <Toggle on={returnDepot} onToggle={() => setReturnDepot(v => !v)} label="Return to depot" />
          {returnDepot && (
            <select style={{ ...sel, width: '100%', marginTop: 8 }} value={returnDepotId} onChange={e => setReturnDepotId(e.target.value)}>
              <option value="">— Select depot —</option>
              {depots.map(d => <option key={d.id} value={d.id}>{d.name}{d.suburb ? ` · ${d.suburb}` : ''}</option>)}
            </select>
          )}
        </div>

        {/* Route result */}
        {(calculating || route) && (
          <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 2, padding: '10px 12px', marginBottom: 14 }}>
            {calculating ? (
              <span style={{ fontSize: 9, color: MUT }}>Calculating route…</span>
            ) : route && (
              <>
                {/* Total distance + time */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: ORANGE, fontFamily: "'IBM Plex Mono',monospace" }}>
                    {route.km.toFixed(1)} km
                  </span>
                  <span style={{ fontSize: 9, color: MUT }}>~{route.min} min</span>
                </div>

                {/* Leg breakdown */}
                {route.legs.map((leg, i) => (
                  <div key={i} style={{ fontSize: 8, color: MUT, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 2,
                    display: 'flex', justifyContent: 'space-between' }}>
                    <span>{leg.label}</span>
                    <span style={{ color: '#444' }}>{leg.km.toFixed(1)} km</span>
                  </div>
                ))}

                {/* Pricing breakdown */}
                {breakdown && (
                  <div style={{ marginTop: 10, borderTop: '1px solid #1a1a1a', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[['accident', breakdown.accident, RED], ['trade', breakdown.trade, ACC]].map(([type, bd, col]) => {
                      if (!bd) return null;
                      const { base, freeKm, billable, perKm, kmCharge, sur, mul, total } = bd;
                      return (
                        <div key={type}>
                          <div style={{ fontSize: 7, color: col, letterSpacing: '0.1em', textTransform: 'uppercase',
                            fontWeight: 700, marginBottom: 5, fontFamily: "'IBM Plex Mono',monospace" }}>
                            {type}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: "'IBM Plex Mono',monospace" }}>
                              <span style={{ color: MUT }}>Base fee</span>
                              <span style={{ color: TXT }}>${base.toFixed(2)}</span>
                            </div>
                            {perKm > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: "'IBM Plex Mono',monospace" }}>
                                <span style={{ color: MUT }}>
                                  {billable > 0
                                    ? <>{billable.toFixed(1)} km × ${perKm.toFixed(2)}/km <span style={{ color: '#333' }}>(first {freeKm} km free)</span></>
                                    : <span style={{ color: '#333' }}>0 km billable (first {freeKm} km free)</span>}
                                </span>
                                <span style={{ color: billable > 0 ? TXT : '#333' }}>+${kmCharge.toFixed(2)}</span>
                              </div>
                            )}
                            {sur > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: "'IBM Plex Mono',monospace" }}>
                                <span style={{ color: '#cc8844' }}>After hours surcharge</span>
                                <span style={{ color: '#cc8844' }}>+${sur.toFixed(2)}</span>
                              </div>
                            )}
                            {mul > 1 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: "'IBM Plex Mono',monospace" }}>
                                <span style={{ color: ACC }}>Two-up multiplier</span>
                                <span style={{ color: ACC }}>× {mul}</span>
                              </div>
                            )}
                            <div style={{ borderTop: '1px solid #1e1e1e', paddingTop: 4, marginTop: 1,
                              display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 9, color: MUT }}>Total</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: col, fontFamily: "'IBM Plex Mono',monospace" }}>
                                ${total.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {breakdown.accident && breakdown.trade && (
                      <div style={{ borderTop: '1px solid #252525', paddingTop: 8,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 9, color: MUT, fontFamily: "'IBM Plex Mono',monospace" }}>Combined total</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: GRN, fontFamily: "'IBM Plex Mono',monospace" }}>
                          ${((breakdown.accident?.total ?? 0) + (breakdown.trade?.total ?? 0)).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {!breakdown && companyConfig && (
                  <div style={{ marginTop: 8, fontSize: 8, color: '#333', fontFamily: "'IBM Plex Mono',monospace" }}>
                    No pricing configured — set fees in Settings
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {err && <div style={{ fontSize: 9, color: RED, marginBottom: 10 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={reset} style={{ ...btnG, fontSize: 9 }}>Clear</button>
          <button onClick={dispatch} disabled={saving || !truckId || !pointA}
            style={{ ...btnA, fontSize: 9, flex: 1, opacity: saving || !truckId || !pointA ? 0.4 : 1 }}>
            {saving ? 'Dispatching…' : '▶ Dispatch'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExtraStop({ index, stop, onChange, onRemove }) {
  const geocode = async (q, setResults) => {
    if (q.length < 3) { setResults([]); return; }
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&countrycodes=au`);
      const data = await res.json();
      setResults(data.map(r => ({ label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) })));
    } catch { setResults([]); }
  };

  useEffect(() => {
    if (stop.point) return;
    const t = setTimeout(() => geocode(stop.search, results => onChange({ ...stop, results })), 300);
    return () => clearTimeout(t);
  }, [stop.search]); // eslint-disable-line

  return (
    <div style={{ position: 'relative', marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 8, color: MUT, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.08em', textTransform: 'uppercase' }}>Stop {index + 1}</span>
        <button onClick={onRemove} style={{ fontSize: 8, color: '#884040', border: '1px solid #3a1a1a', background: 'none', borderRadius: 2, padding: '1px 6px', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace" }}>✕</button>
      </div>
      <input
        style={{ ...inp, width: '100%', boxSizing: 'border-box' }}
        value={stop.search}
        onChange={e => onChange({ ...stop, search: e.target.value, point: null })}
        placeholder="Search address…"
      />
      {stop.results?.length > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 400,
          background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: 2,
          maxHeight: 130, overflowY: 'auto', marginTop: 2 }}>
          {stop.results.map((r, i) => (
            <div key={i}
              onMouseDown={e => { e.preventDefault(); onChange({ search: r.label.split(',').slice(0,2).join(',').trim(), results: [], point: r }); }}
              style={{ padding: '5px 8px', fontSize: 9, color: '#bbb', cursor: 'pointer',
                borderBottom: '1px solid #1a1a1a', lineHeight: 1.5, fontFamily: "'IBM Plex Mono',monospace" }}
              onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {r.label}
            </div>
          ))}
        </div>
      )}
      {stop.point && <div style={{ fontSize: 7, color: MUT, marginTop: 3 }}>📍 {stop.search}</div>}
    </div>
  );
}
