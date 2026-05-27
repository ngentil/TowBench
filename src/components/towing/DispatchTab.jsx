import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, BRD, BRD2, TXT, GRN, RED, SURF, inp, txa, btnA, btnG, btnD, sm, ovly, mdl, mdlH, mdlB, mdlF } from '../../lib/styles';
import { timeIn } from '../../lib/utils';

const ORANGE = '#e8870a';

const FL = ({ t }) => (
  <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{t}</div>
);

function ahSurcharge(cfg) {
  const now = new Date();
  const isWE = now.getDay() === 0 || now.getDay() === 6;
  const t    = now.toTimeString().slice(0, 5);
  const start = isWE ? (cfg.after_hours_start_weekend ?? '18:00') : (cfg.after_hours_start_weekday ?? '18:00');
  const end   = isWE ? (cfg.after_hours_end_weekend   ?? '06:00') : (cfg.after_hours_end_weekday   ?? '06:00');
  const ah    = t >= start || t < end;
  return ah ? (parseFloat(isWE ? cfg.after_hours_fee_weekend : cfg.after_hours_fee_weekday) || 0) : 0;
}

function calcTracePrice(totalKm, cfg, towType, twoUpTrade, twoUpAccident, allowAccidentTwoUp) {
  if (!cfg || !totalKm) return null;
  const sur = ahSurcharge(cfg);
  const result = {};
  if (towType === 'accident' || towType === 'both') {
    const base = parseFloat(cfg.accident_base_fee) || 0;
    const km   = Math.max(0, totalKm - 8) * (parseFloat(cfg.accident_per_km_fee) || 0);
    const mul  = (twoUpAccident && allowAccidentTwoUp) ? 2 : 1;
    if (base > 0) result.accident = (base + km + sur) * mul;
  }
  if (towType === 'trade' || towType === 'both') {
    const base = parseFloat(cfg.trade_base_fee) || 0;
    const km   = Math.max(0, totalKm - 10) * (parseFloat(cfg.trade_per_km_fee) || 0);
    const mul  = twoUpTrade ? 2 : 1;
    if (base > 0) result.trade = (base + km + sur) * mul;
  }
  return Object.keys(result).length ? result : null;
}

function calcCustomPrice(legs, legTypes, legPcts, totalAdjPct, cfg, twoUpTrade, twoUpAccident, allowAccidentTwoUp) {
  if (!cfg || !legs?.length) return null;
  const sur = ahSurcharge(cfg);
  let total = 0;
  legs.forEach((leg, i) => {
    const type = legTypes[i] || 'accident';
    const pct  = legPcts[i]  || 0;
    let price;
    if (type === 'trade') {
      const base = parseFloat(cfg.trade_base_fee) || 0;
      const km   = Math.max(0, leg.km - 10) * (parseFloat(cfg.trade_per_km_fee) || 0);
      const mul  = twoUpTrade ? 2 : 1;
      price = (base + km + sur) * mul;
    } else {
      const base = parseFloat(cfg.accident_base_fee) || 0;
      const km   = Math.max(0, leg.km - 8) * (parseFloat(cfg.accident_per_km_fee) || 0);
      const mul  = (twoUpAccident && allowAccidentTwoUp) ? 2 : 1;
      price = (base + km + sur) * mul;
    }
    total += price * (1 + pct / 100);
  });
  return total * (1 + totalAdjPct / 100);
}

// shared address search dropdown
function AddrDropdown({ results, onPick }) {
  if (!results.length) return null;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 400,
      background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: 2,
      maxHeight: 130, overflowY: 'auto', marginTop: 2 }}>
      {results.map((r, i) => (
        <div key={i} onMouseDown={e => { e.preventDefault(); onPick(r); }}
          style={{ padding: '5px 8px', fontSize: 9, color: '#bbb', cursor: 'pointer',
            borderBottom: '1px solid #1a1a1a', lineHeight: 1.5, fontFamily: "'IBM Plex Mono',monospace" }}
          onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          {r.label}
        </div>
      ))}
    </div>
  );
}

// ─── Dispatch modal ────────────────────────────────────────────────────────────
function DispatchModal({ feature, trucks, depots, companyConfig, companyId, userEmail, onSave, onCancel }) {
  const props   = feature.properties || {};
  const coords  = feature.geometry?.coordinates; // [lng, lat]
  const road    = props.closedRoadName || props.location || '—';
  const suburb  = props.reference?.startIntersectionLocality || '';
  const eventId = String(props.eventId || '');

  // Truck
  const [truckId, setTruckId] = useState('');

  // Route legs
  const [fromDepot,          setFromDepot]          = useState(true);
  const [selectedDepotId,    setSelectedDepotId]    = useState('');
  const [depotPoint,         setDepotPoint]         = useState(null);
  const [returnDepot,        setReturnDepot]        = useState(true);
  const [selectedReturnId,   setSelectedReturnId]   = useState('');
  const [returnDepotPoint,   setReturnDepotPoint]   = useState(null);
  const [pointA,             setPointA]             = useState(null);
  const [searchA,            setSearchA]            = useState('');
  const [searchAResults,     setSearchAResults]     = useState([]);
  const [destinationEnabled, setDestinationEnabled] = useState(false);
  const [pointB,             setPointB]             = useState(null);
  const [searchB,            setSearchB]            = useState('');
  const [searchBResults,     setSearchBResults]     = useState([]);
  const [extraLegs,          setExtraLegs]          = useState([]);

  // Pricing
  const [towType,        setTowType]        = useState('accident');
  const [twoUpTrade,     setTwoUpTrade]     = useState(false);
  const [twoUpAccident,  setTwoUpAccident]  = useState(false);
  const [customLegTypes, setCustomLegTypes] = useState([]);
  const [customLegPcts,  setCustomLegPcts]  = useState([]);
  const [totalAdjPct,    setTotalAdjPct]    = useState(0);

  // Route result
  const [route,       setRoute]       = useState(null);
  const [calculating, setCalculating] = useState(false);

  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const allowAccidentTwoUp = companyConfig?.allow_accident_twoup ?? false;

  // Pre-fill pickup from event coords
  useEffect(() => {
    if (coords) {
      const label = road !== '—' ? road : (suburb || 'Unknown location');
      setPointA({ lat: coords[1], lng: coords[0], label });
      setSearchA(label);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select truck's depot when truck changes
  useEffect(() => {
    if (!truckId) return;
    const truck = trucks.find(t => t.id === truckId);
    const depot = depots.find(d => d.id === truck?.depot_id);
    if (depot) {
      setSelectedDepotId(depot.id);
      setDepotPoint(depot);
      setSelectedReturnId(depot.id);
      setReturnDepotPoint(depot);
    } else {
      setDepotPoint(null);
      setReturnDepotPoint(null);
    }
  }, [truckId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nominatim search
  const geocodeSearch = useCallback(async (query, setResults) => {
    if (query.length < 3) { setResults([]); return; }
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=au`);
      const data = await res.json();
      setResults(data.map(r => ({ label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) })));
    } catch { setResults([]); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (!pointA) geocodeSearch(searchA, setSearchAResults); }, 300);
    return () => clearTimeout(t);
  }, [searchA]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => { if (!pointB) geocodeSearch(searchB, setSearchBResults); }, 300);
    return () => clearTimeout(t);
  }, [searchB]); // eslint-disable-line react-hooks/exhaustive-deps

  // OSRM route
  useEffect(() => {
    const wps = [], labels = [];
    if (fromDepot && depotPoint?.lat != null) { wps.push(depotPoint); labels.push(depotPoint.name || 'Depot'); }
    if (pointA) { wps.push(pointA); labels.push(pointA.label?.split(',')[0] || 'Pickup'); }
    if (destinationEnabled && pointB) { wps.push(pointB); labels.push(pointB.label?.split(',')[0] || 'Dest'); }
    extraLegs.forEach((el, i) => { if (el.point) { wps.push(el.point); labels.push(el.point.label?.split(',')[0] || `Stop ${i + 1}`); } });
    if (returnDepot && returnDepotPoint?.lat != null) { wps.push(returnDepotPoint); labels.push(returnDepotPoint.name || 'Return Depot'); }
    if (wps.length < 2) { setRoute(null); return; }
    let cancelled = false;
    setCalculating(true);
    const coordStr = wps.map(p => `${p.lng},${p.lat}`).join(';');
    fetch(`https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=false`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        const r = json.routes?.[0];
        if (r) {
          const legs = r.legs.map((l, i) => ({
            km:    l.distance / 1000,
            label: `${labels[i] || `Pt ${i + 1}`} → ${labels[i + 1] || `Pt ${i + 2}`}`,
          }));
          setRoute({ km: r.distance / 1000, min: Math.round(r.duration / 60), legs });
          setCustomLegTypes(legs.map((_, i) => customLegTypes[i] || 'accident'));
          setCustomLegPcts(legs.map((_, i)  => customLegPcts[i]  || 0));
        } else { setRoute(null); }
        setCalculating(false);
      })
      .catch(() => { if (!cancelled) { setRoute(null); setCalculating(false); } });
    return () => { cancelled = true; };
  }, [fromDepot, depotPoint, returnDepot, returnDepotPoint, pointA, destinationEnabled, pointB, extraLegs]); // eslint-disable-line react-hooks/exhaustive-deps

  const price = route
    ? (towType === 'custom'
        ? calcCustomPrice(route.legs, customLegTypes, customLegPcts, totalAdjPct, companyConfig, twoUpTrade, twoUpAccident, allowAccidentTwoUp)
        : calcTracePrice(route.km, companyConfig, towType, twoUpTrade, twoUpAccident, allowAccidentTwoUp))
    : null;

  const totalFee = price == null ? null
    : (typeof price === 'number' ? price : (price.accident ?? 0) + (price.trade ?? 0));

  const traceInp = { background: '#0a0a0a', border: '1px solid #252525', color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, padding: '5px 7px', borderRadius: 2, outline: 'none', width: '100%', boxSizing: 'border-box' };

  const dispatch = async () => {
    if (!truckId)  { setErr('Select a truck.'); return; }
    if (!pointA)   { setErr('Set a pickup location.'); return; }
    setSaving(true); setErr('');
    const fromDep = depots.find(d => d.id === selectedDepotId);
    const toDep   = depots.find(d => d.id === selectedReturnId) || fromDep;
    const { data, error } = await supabase.from('dispatched_jobs').insert({
      company_id:    companyId,
      event_id:      eventId,
      truck_id:      truckId,
      from_depot_id: fromDepot ? (fromDep?.id || null) : null,
      to_depot_id:   returnDepot ? (toDep?.id || null) : null,
      pickup_lat:    pointA.lat,
      pickup_lng:    pointA.lng,
      pickup_label:  pointA.label,
      tow_type:      towType,
      distance_km:   route?.km   || null,
      duration_min:  route?.min  || null,
      tow_fee:       totalFee    || null,
      dispatched_by: userEmail,
      status:        'in_progress',
    }).select().single();
    if (error) { setErr(error.message); setSaving(false); return; }
    await supabase.from('job_accepted').insert({
      event_id: eventId, accepted_by: userEmail, company_id: companyId,
    }).catch(() => {});
    onSave(data);
  };

  const PCT_BADGES = [10, 30, 50];

  return (
    <div style={ovly} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...mdl, maxWidth: 480 }}>
        <div style={mdlH}>
          <div>
            <b style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Dispatch Job</b>
            <div style={{ fontSize: 8, color: MUT, marginTop: 2 }}>#{eventId}{suburb ? ` · ${suburb}` : ''}</div>
          </div>
          <button style={{ ...btnG, ...sm }} onClick={onCancel}>✕</button>
        </div>
        <div style={{ ...mdlB, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Truck selector */}
          <div>
            <FL t="Assign Truck *" />
            <select style={inp} value={truckId} onChange={e => setTruckId(e.target.value)} autoFocus>
              <option value="">— Select truck —</option>
              {trucks.map(t => {
                const dep = depots.find(d => d.id === t.depot_id);
                return (
                  <option key={t.id} value={t.id}>
                    {t.plate}{t.first_name ? ` · ${t.first_name}` : ''}{dep ? ` · ${dep.name}` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Tow type */}
          <div>
            <FL t="Tow Type" />
            <div style={{ display: 'flex', gap: 5 }}>
              {['accident', 'trade', 'custom'].map(tp => (
                <button key={tp} onClick={() => setTowType(tp)}
                  style={{ flex: 1, fontSize: 9, padding: '5px 0', borderRadius: 2, cursor: 'pointer',
                    fontFamily: "'IBM Plex Mono',monospace",
                    border: `1px solid ${towType === tp ? '#cc444488' : '#2a2a2a'}`,
                    color: towType === tp ? '#cc4444' : MUT,
                    background: towType === tp ? '#cc444411' : 'transparent' }}>
                  {tp.charAt(0).toUpperCase() + tp.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: '#1e1e1e' }} />

          {/* From depot */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', marginBottom: fromDepot && depots.length > 0 ? 6 : 0 }}>
              <input type="checkbox" checked={fromDepot} onChange={e => setFromDepot(e.target.checked)} style={{ accentColor: ORANGE }} />
              <span style={{ fontSize: 9, color: fromDepot ? ORANGE : MUT }}>From depot</span>
            </label>
            {fromDepot && depots.length > 0 && (
              <select value={selectedDepotId}
                onChange={e => { setSelectedDepotId(e.target.value); setDepotPoint(depots.find(d => d.id === e.target.value) ?? null); }}
                style={{ ...traceInp, color: ORANGE }}>
                <option value="">— select depot —</option>
                {depots.map(d => <option key={d.id} value={d.id}>{d.name}{d.suburb ? ` · ${d.suburb}` : ''}</option>)}
              </select>
            )}
          </div>

          {/* Pickup (A) */}
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.08em', marginBottom: 4 }}>A — Pickup</div>
            <input value={searchA}
              onChange={e => { setSearchA(e.target.value); if (!e.target.value) setPointA(null); }}
              onBlur={() => setTimeout(() => setSearchAResults([]), 150)}
              placeholder="Search address or suburb…"
              style={traceInp} />
            {pointA && <div style={{ fontSize: 8, color: GRN, marginTop: 3 }}>🟢 {pointA.label?.split(',').slice(0, 2).join(',')}</div>}
            <AddrDropdown results={searchAResults} onPick={r => { setPointA(r); setSearchA(r.label.split(',')[0].trim()); setSearchAResults([]); }} />
          </div>

          {/* Destination (B) — optional */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', marginBottom: destinationEnabled ? 6 : 0 }}>
              <input type="checkbox" checked={destinationEnabled}
                onChange={e => { setDestinationEnabled(e.target.checked); if (!e.target.checked) { setPointB(null); setSearchB(''); setSearchBResults([]); } }} />
              <span style={{ fontSize: 9, color: destinationEnabled ? '#cc4444' : MUT }}>Destination (optional)</span>
            </label>
            {destinationEnabled && (
              <div style={{ position: 'relative' }}>
                <input value={searchB}
                  onChange={e => { setSearchB(e.target.value); if (!e.target.value) setPointB(null); }}
                  onBlur={() => setTimeout(() => setSearchBResults([]), 150)}
                  placeholder="Search address…"
                  style={traceInp} />
                {pointB && <div style={{ fontSize: 8, color: '#cc4444', marginTop: 3 }}>🔴 {pointB.label?.split(',').slice(0, 2).join(',')}</div>}
                <AddrDropdown results={searchBResults} onPick={r => { setPointB(r); setSearchB(r.label.split(',')[0].trim()); setSearchBResults([]); }} />
              </div>
            )}
          </div>

          {/* Extra stops */}
          {extraLegs.map((el, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <div style={{ fontSize: 8, color: MUT, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>Stop {i + 1}</span>
                <button onClick={() => setExtraLegs(prev => prev.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', color: MUT, cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}>×</button>
              </div>
              <input value={el.search}
                onChange={e => {
                  const v = e.target.value;
                  setExtraLegs(prev => prev.map((x, j) => j === i ? { ...x, search: v, point: v ? x.point : null } : x));
                  if (v.length >= 3) setTimeout(() => geocodeSearch(v, res => setExtraLegs(prev => prev.map((x, j) => j === i ? { ...x, results: res } : x))), 300);
                  else setExtraLegs(prev => prev.map((x, j) => j === i ? { ...x, results: [] } : x));
                }}
                onBlur={() => setTimeout(() => setExtraLegs(prev => prev.map((x, j) => j === i ? { ...x, results: [] } : x)), 150)}
                placeholder="Search address…"
                style={traceInp} />
              {el.point && <div style={{ fontSize: 8, color: '#ccaa00', marginTop: 3 }}>🟡 {el.point.label?.split(',')[0]}</div>}
              <AddrDropdown results={el.results || []} onPick={r => setExtraLegs(prev => prev.map((x, j) => j === i ? { ...x, point: r, search: r.label.split(',')[0].trim(), results: [] } : x))} />
            </div>
          ))}
          <button onClick={() => setExtraLegs(prev => [...prev, { point: null, search: '', results: [] }])}
            style={{ fontSize: 8, color: MUT, border: '1px dashed #2a2a2a', borderRadius: 2, background: 'transparent', padding: '3px 8px', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", textAlign: 'left' }}>
            + Add Stop
          </button>

          {/* Return to depot */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', marginBottom: returnDepot && depots.length > 0 ? 6 : 0 }}>
              <input type="checkbox" checked={returnDepot} onChange={e => setReturnDepot(e.target.checked)} style={{ accentColor: ORANGE }} />
              <span style={{ fontSize: 9, color: returnDepot ? ORANGE : MUT }}>Return to depot</span>
            </label>
            {returnDepot && depots.length > 0 && (
              <select value={selectedReturnId}
                onChange={e => { setSelectedReturnId(e.target.value); setReturnDepotPoint(depots.find(d => d.id === e.target.value) ?? null); }}
                style={{ ...traceInp, color: ORANGE }}>
                <option value="">— select depot —</option>
                {depots.map(d => <option key={d.id} value={d.id}>{d.name}{d.suburb ? ` · ${d.suburb}` : ''}</option>)}
              </select>
            )}
          </div>

          <div style={{ height: 1, background: '#1e1e1e' }} />

          {/* Two-up — Trade */}
          {(towType === 'trade' || towType === 'both' || towType === 'custom') && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
              <input type="checkbox" checked={twoUpTrade} onChange={e => setTwoUpTrade(e.target.checked)} />
              <span style={{ fontSize: 9, color: twoUpTrade ? ACC : MUT }}>×2 Two-up (Trade)</span>
            </label>
          )}
          {(towType === 'accident' || towType === 'both' || towType === 'custom') && allowAccidentTwoUp && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
              <input type="checkbox" checked={twoUpAccident} onChange={e => setTwoUpAccident(e.target.checked)} />
              <span style={{ fontSize: 9, color: twoUpAccident ? ACC : MUT }}>×2 Two-up (Accident)</span>
            </label>
          )}

          {/* Custom pricing panel */}
          {towType === 'custom' && route?.legs?.length > 0 && (
            <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 2, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Custom Pricing</div>
              {route.legs.map((leg, i) => (
                <div key={i} style={{ background: '#111', border: '1px solid #222', borderRadius: 2, padding: '6px 8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 8, color: '#666' }}>{leg.label}</span>
                    <span style={{ fontSize: 8, color: '#3a3a3a' }}>{leg.km.toFixed(1)} km</span>
                  </div>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 5 }}>
                    {['accident', 'trade'].map(tp => (
                      <button key={tp} onClick={() => setCustomLegTypes(prev => prev.map((v, j) => j === i ? tp : v))}
                        style={{ flex: 1, fontSize: 8, padding: '2px 0', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace",
                          border: `1px solid ${(customLegTypes[i] || 'accident') === tp ? '#cc444466' : '#1e1e1e'}`,
                          color: (customLegTypes[i] || 'accident') === tp ? '#cc4444' : '#555',
                          background: (customLegTypes[i] || 'accident') === tp ? '#cc444411' : 'transparent' }}>
                        {tp.charAt(0).toUpperCase() + tp.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                    {[0, ...PCT_BADGES].map(p => (
                      <button key={p} onClick={() => setCustomLegPcts(prev => prev.map((v, j) => j === i ? p : v))}
                        style={{ fontSize: 7, padding: '2px 5px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace",
                          border: `1px solid ${(customLegPcts[i] || 0) === p ? '#cc444466' : '#1e1e1e'}`,
                          color: (customLegPcts[i] || 0) === p ? '#cc4444' : '#444',
                          background: (customLegPcts[i] || 0) === p ? '#cc444411' : 'transparent' }}>
                        {p === 0 ? '—' : `+${p}%`}
                      </button>
                    ))}
                    <input type="number" min="0" max="999" placeholder="%"
                      onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) setCustomLegPcts(prev => prev.map((v, j) => j === i ? n : v)); }}
                      style={{ width: 36, fontSize: 7, padding: '2px 4px', background: '#0a0a0a', border: '1px solid #1e1e1e', color: '#bbb', borderRadius: 2, fontFamily: "'IBM Plex Mono',monospace", outline: 'none' }} />
                    <span style={{ fontSize: 7, color: '#444' }}>%</span>
                  </div>
                </div>
              ))}
              <div>
                <div style={{ fontSize: 8, color: MUT, marginBottom: 4 }}>Grand total adjustment</div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                  {[0, ...PCT_BADGES].map(p => (
                    <button key={p} onClick={() => setTotalAdjPct(p)}
                      style={{ fontSize: 7, padding: '2px 6px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace",
                        border: `1px solid ${totalAdjPct === p ? '#cc444466' : '#1e1e1e'}`,
                        color: totalAdjPct === p ? '#cc4444' : '#444',
                        background: totalAdjPct === p ? '#cc444411' : 'transparent' }}>
                      {p === 0 ? '—' : `+${p}%`}
                    </button>
                  ))}
                  <input type="number" min="0" max="999" placeholder="%"
                    onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) setTotalAdjPct(n); }}
                    style={{ width: 36, fontSize: 7, padding: '2px 4px', background: '#0a0a0a', border: '1px solid #1e1e1e', color: '#bbb', borderRadius: 2, fontFamily: "'IBM Plex Mono',monospace", outline: 'none' }} />
                  <span style={{ fontSize: 7, color: '#444' }}>%</span>
                </div>
              </div>
            </div>
          )}

          {/* Route result */}
          <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 2, padding: '8px 10px', minHeight: 32 }}>
            {calculating ? (
              <span style={{ fontSize: 9, color: MUT }}>Calculating…</span>
            ) : route ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#cc4444' }}>{route.km.toFixed(1)} km · ~{route.min} min</span>
                {price != null && (
                  typeof price === 'number' ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: GRN }}>${price.toFixed(2)}</span>
                  ) : (
                    <span style={{ fontSize: 9, color: GRN }}>
                      {price.accident != null && `Acc $${price.accident.toFixed(2)}`}
                      {price.accident != null && price.trade != null && ' · '}
                      {price.trade != null && `Trade $${price.trade.toFixed(2)}`}
                    </span>
                  )
                )}
              </div>
            ) : (
              <span style={{ fontSize: 8, color: '#333' }}>
                {pointA ? 'Add a second waypoint to calculate route' : 'Set pickup to calculate route'}
              </span>
            )}
          </div>

          {err && <div style={{ fontSize: 9, color: RED }}>{err}</div>}
        </div>
        <div style={mdlF}>
          <button style={btnG} onClick={onCancel}>Cancel</button>
          <button style={{ ...btnA, opacity: (saving || !truckId || !pointA) ? 0.5 : 1 }}
            disabled={saving || !truckId || !pointA} onClick={dispatch}>
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
