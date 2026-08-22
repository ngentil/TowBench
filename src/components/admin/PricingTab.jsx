import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, BRD, TXT, SURF, RED, inp, btnA, sm } from '../../lib/styles';

const numInp = (value, onChange, placeholder = '0.00') => (
  <input type="number" min="0" step="0.01" value={value} onChange={onChange} placeholder={placeholder}
    style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
);

const timeInp = (value, onChange) => (
  <input type="time" value={value} onChange={onChange}
    style={{ ...inp, width: '100%', boxSizing: 'border-box', fontFamily: "'IBM Plex Mono',monospace" }} />
);

const STORAGE_PRESETS = [
  'Motor car, under cover',
  'Motor cycle, under cover',
  'Motor car, in locked yard',
  'Motor cycle, in locked yard',
];

export default function PricingTab({ companyConfig, setCompanyConfig, companyId, userId }) {
  const [tradeBaseFee,       setTradeBaseFee]       = useState(String(companyConfig.trade_base_fee          ?? '0'));
  const [accidentBaseFee,    setAccidentBaseFee]     = useState(String(companyConfig.accident_base_fee       ?? '0'));
  const [tradePerKm,         setTradePerKm]          = useState(String(companyConfig.trade_per_km_fee        ?? '0'));
  const [accidentPerKm,      setAccidentPerKm]       = useState(String(companyConfig.accident_per_km_fee     ?? '0'));
  const [ahFeeWD,            setAhFeeWD]             = useState(String(companyConfig.after_hours_fee_weekday ?? '0'));
  const [ahFeeWE,            setAhFeeWE]             = useState(String(companyConfig.after_hours_fee_weekend ?? '0'));
  const [ahStartWD,          setAhStartWD]           = useState(companyConfig.after_hours_start_weekday ?? '18:00');
  const [ahEndWD,            setAhEndWD]             = useState(companyConfig.after_hours_end_weekday   ?? '06:00');
  const [ahStartWE,          setAhStartWE]           = useState(companyConfig.after_hours_start_weekend ?? '18:00');
  const [ahEndWE,            setAhEndWE]             = useState(companyConfig.after_hours_end_weekend   ?? '06:00');

  // Storage type rates keyed by preset name
  const [storageRates, setStorageRates] = useState(() =>
    Object.fromEntries(STORAGE_PRESETS.map(n => [n, '']))
  );
  // Track existing row IDs so we can update vs insert
  const [storageIds, setStorageIds] = useState({});

  // Perceived Value config
  const initPv = (cfg) => {
    const pv = cfg?.pv_config || {};
    return {
      markupEnabled:  pv.markup_enabled  ?? false,
      markupPct:      String(pv.markup_pct ?? '20'),
      itemsEnabled:   pv.items_enabled   ?? false,
      items:          pv.items           ?? [{ name: 'Priority dispatch fee', amount: '25' }, { name: 'Fuel levy', amount: '15' }],
      managerEnabled: pv.manager_enabled ?? false,
      managerLabel:   pv.manager_label   ?? 'Manager approved',
      sliderEnabled:  pv.slider_enabled  ?? false,
    };
  };
  const [pvMarkupEnabled,  setPvMarkupEnabled]  = useState(() => initPv(companyConfig).markupEnabled);
  const [pvMarkupPct,      setPvMarkupPct]      = useState(() => initPv(companyConfig).markupPct);
  const [pvItemsEnabled,   setPvItemsEnabled]   = useState(() => initPv(companyConfig).itemsEnabled);
  const [pvItems,          setPvItems]          = useState(() => initPv(companyConfig).items);
  const [pvManagerEnabled, setPvManagerEnabled] = useState(() => initPv(companyConfig).managerEnabled);
  const [pvManagerLabel,   setPvManagerLabel]   = useState(() => initPv(companyConfig).managerLabel);
  const [pvSliderEnabled,  setPvSliderEnabled]  = useState(() => initPv(companyConfig).sliderEnabled);

  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [err,    setErr]    = useState('');

  // Sync local inputs whenever the upstream companyConfig changes (async load)
  useEffect(() => {
    if (!companyConfig.user_id && !companyConfig.company_id) return; // still the default stub
    setTradeBaseFee(String(companyConfig.trade_base_fee          ?? '0'));
    setAccidentBaseFee(String(companyConfig.accident_base_fee    ?? '0'));
    setTradePerKm(String(companyConfig.trade_per_km_fee          ?? '0'));
    setAccidentPerKm(String(companyConfig.accident_per_km_fee    ?? '0'));
    setAhFeeWD(String(companyConfig.after_hours_fee_weekday      ?? '0'));
    setAhFeeWE(String(companyConfig.after_hours_fee_weekend      ?? '0'));
    setAhStartWD(companyConfig.after_hours_start_weekday ?? '18:00');
    setAhEndWD(companyConfig.after_hours_end_weekday     ?? '06:00');
    setAhStartWE(companyConfig.after_hours_start_weekend ?? '18:00');
    setAhEndWE(companyConfig.after_hours_end_weekend     ?? '06:00');
    const pv = companyConfig.pv_config || {};
    setPvMarkupEnabled(pv.markup_enabled   ?? false);
    setPvMarkupPct(String(pv.markup_pct    ?? '20'));
    setPvItemsEnabled(pv.items_enabled     ?? false);
    setPvItems(pv.items                    ?? [{ name: 'Priority dispatch fee', amount: '25' }, { name: 'Fuel levy', amount: '15' }]);
    setPvManagerEnabled(pv.manager_enabled ?? false);
    setPvManagerLabel(pv.manager_label     ?? 'Manager approved');
    setPvSliderEnabled(pv.slider_enabled   ?? false);
  }, [companyConfig.user_id, companyConfig.company_id]); // re-run only when a real config row arrives

  // Load storage types — RLS scopes to current user automatically
  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      const { data } = await supabase.from('storage_types').select('id, name, daily_rate')
        .in('name', STORAGE_PRESETS);
      if (!data) return;
      const rates = {}, ids = {};
      for (const row of data) {
        rates[row.name] = String(parseFloat(row.daily_rate).toFixed(2));
        ids[row.name]   = row.id;
      }
      setStorageRates(prev => ({ ...prev, ...rates }));
      setStorageIds(ids);
    };
    load();
  }, [userId]);

  const savePricing = async () => {
    if (!userId) { setErr('Not signed in.'); return; }
    setSaving(true); setSaved(false); setErr('');

    // 1 — company_config upsert (keyed by user_id)
    const payload = {
      user_id:                   userId,
      trade_base_fee:            parseFloat(tradeBaseFee)    || 0,
      accident_base_fee:         parseFloat(accidentBaseFee) || 0,
      trade_per_km_fee:          parseFloat(tradePerKm)      || 0,
      accident_per_km_fee:       parseFloat(accidentPerKm)   || 0,
      after_hours_fee_weekday:   parseFloat(ahFeeWD)         || 0,
      after_hours_fee_weekend:   parseFloat(ahFeeWE)         || 0,
      after_hours_start_weekday: ahStartWD,
      after_hours_end_weekday:   ahEndWD,
      after_hours_start_weekend: ahStartWE,
      after_hours_end_weekend:   ahEndWE,
      pv_config: {
        markup_enabled:  pvMarkupEnabled,
        markup_pct:      parseFloat(pvMarkupPct) || 20,
        items_enabled:   pvItemsEnabled,
        items:           pvItems.map(it => ({ name: it.name, amount: parseFloat(it.amount) || 0 })),
        manager_enabled: pvManagerEnabled,
        manager_label:   pvManagerLabel.trim() || 'Manager approved',
        slider_enabled:  pvSliderEnabled,
      },
      updated_at:                new Date().toISOString(),
    };
    const existingId = companyConfig?.id;
    const { data: cfgData, error: cfgErr } = existingId
      ? await supabase.from('company_config').update(payload).eq('id', existingId).select().single()
      : await supabase.from('company_config').insert(payload).select().single();
    if (cfgErr) { setErr(cfgErr.message); setSaving(false); return; }
    if (cfgData) setCompanyConfig(cfgData);

    // 2 — storage types: update existing rows, insert missing ones
    const newIds = { ...storageIds };
    for (const name of STORAGE_PRESETS) {
      const rate = parseFloat(storageRates[name]);
      if (isNaN(rate)) continue; // blank = skip
      if (newIds[name]) {
        await supabase.from('storage_types')
          .update({ daily_rate: rate })
          .eq('id', newIds[name]);
      } else {
        const { data: ins } = await supabase.from('storage_types')
          .insert({ name, daily_rate: rate })
          .select('id').single();
        if (ins?.id) newIds[name] = ins.id;
      }
    }
    setStorageIds(newIds);

    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const rateRow = (name, isDefault) => (
    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 9, color: TXT }}>{name}</div>
        {isDefault && (
          <span style={{ fontSize: 7, color: ACC, border: `1px solid ${ACC}55`, borderRadius: 2, padding: '0px 4px' }}>
            DEFAULT
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 8, color: MUT }}>$</span>
        <input type="number" min="0" step="0.01"
          value={storageRates[name]}
          onChange={e => setStorageRates(r => ({ ...r, [name]: e.target.value }))}
          placeholder="0.00"
          style={{ ...inp, width: 80, padding: '4px 6px', fontSize: 10 }} />
        <span style={{ fontSize: 8, color: MUT }}>/day</span>
      </div>
    </div>
  );

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>💰 Pricing</div>
        <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>Used in the Trace route pill to estimate job cost</div>
      </div>

      <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '16px 18px', maxWidth: 480, marginBottom: 16 }}>

        {/* Base fees */}
        <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Base Fee</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 8, color: MUT, marginBottom: 5 }}>Trade Tow <span style={{ color: '#444' }}>· first 10 km</span></div>
            {numInp(tradeBaseFee, e => setTradeBaseFee(e.target.value))}
          </div>
          <div>
            <div style={{ fontSize: 8, color: MUT, marginBottom: 5 }}>Accident Tow <span style={{ color: '#444' }}>· first 8 km</span></div>
            {numInp(accidentBaseFee, e => setAccidentBaseFee(e.target.value))}
          </div>
        </div>

        {/* Per km */}
        <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Per Kilometre Charge</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 8, color: MUT, marginBottom: 5 }}>Trade ($/km)</div>
            {numInp(tradePerKm, e => setTradePerKm(e.target.value))}
          </div>
          <div>
            <div style={{ fontSize: 8, color: MUT, marginBottom: 5 }}>Accident ($/km)</div>
            {numInp(accidentPerKm, e => setAccidentPerKm(e.target.value))}
          </div>
        </div>

        {/* After hours surcharge */}
        <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>After Hours Surcharge</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 8, color: MUT, marginBottom: 5 }}>Weekday ($)</div>
            {numInp(ahFeeWD, e => setAhFeeWD(e.target.value))}
          </div>
          <div>
            <div style={{ fontSize: 8, color: MUT, marginBottom: 5 }}>Weekend ($)</div>
            {numInp(ahFeeWE, e => setAhFeeWE(e.target.value))}
          </div>
        </div>


        {/* After hours window */}
        <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>After Hours Window</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 8, color: '#3a3a3a', marginBottom: 4 }}>Weekday Start</div>
            {timeInp(ahStartWD, e => setAhStartWD(e.target.value))}
          </div>
          <div>
            <div style={{ fontSize: 8, color: '#3a3a3a', marginBottom: 4 }}>Weekday End</div>
            {timeInp(ahEndWD, e => setAhEndWD(e.target.value))}
          </div>
          <div>
            <div style={{ fontSize: 8, color: '#3a3a3a', marginBottom: 4 }}>Weekend Start</div>
            {timeInp(ahStartWE, e => setAhStartWE(e.target.value))}
          </div>
          <div>
            <div style={{ fontSize: 8, color: '#3a3a3a', marginBottom: 4 }}>Weekend End</div>
            {timeInp(ahEndWE, e => setAhEndWE(e.target.value))}
          </div>
        </div>
        <div style={{ fontSize: 8, color: MUT, marginBottom: 20, lineHeight: 1.6 }}>
          After-hours spans midnight — any time ≥ start OR &lt; end counts.
        </div>

        {/* Storage types — inline */}
        <div style={{ borderTop: '1px solid ' + BRD, paddingTop: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
            Storage Rates
          </div>
          <div style={{ fontSize: 8, color: MUT, marginBottom: 12 }}>Daily rate per vehicle — top item is the default</div>
          {STORAGE_PRESETS.map((name, i) => rateRow(name, i === 0))}
        </div>

        {/* Perceived Value */}
        <div style={{ borderTop: '1px solid ' + BRD, paddingTop: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Perceived Value Pricing</div>
          <div style={{ fontSize: 8, color: MUT, marginBottom: 12, lineHeight: 1.6 }}>
            Display-only tools for quoting customers. The actual saved fee is always the real calculated price.
          </div>

          {/* Markup */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}>
              <input type="checkbox" checked={pvMarkupEnabled} onChange={e => setPvMarkupEnabled(e.target.checked)} style={{ accentColor: ACC }} />
              <span style={{ fontSize: 9, color: TXT }}>List price markup</span>
            </label>
            {pvMarkupEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 20 }}>
                <span style={{ fontSize: 8, color: MUT }}>Inflate quoted price by</span>
                <input type="number" min="0" max="200" step="1" value={pvMarkupPct}
                  onChange={e => setPvMarkupPct(e.target.value)}
                  style={{ ...inp, width: 52, padding: '3px 6px', fontSize: 9 }} />
                <span style={{ fontSize: 8, color: MUT }}>%</span>
              </div>
            )}
          </div>

          {/* Droppable line items */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}>
              <input type="checkbox" checked={pvItemsEnabled} onChange={e => setPvItemsEnabled(e.target.checked)} style={{ accentColor: ACC }} />
              <span style={{ fontSize: 9, color: TXT }}>Droppable line items</span>
            </label>
            {pvItemsEnabled && (
              <div style={{ marginLeft: 20 }}>
                {pvItems.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <input type="text" value={item.name}
                      onChange={e => setPvItems(prev => prev.map((it, j) => j === i ? { ...it, name: e.target.value } : it))}
                      placeholder="Fee name"
                      style={{ ...inp, flex: 1, padding: '3px 6px', fontSize: 9 }} />
                    <span style={{ fontSize: 8, color: MUT }}>$</span>
                    <input type="number" min="0" step="0.01" value={item.amount}
                      onChange={e => setPvItems(prev => prev.map((it, j) => j === i ? { ...it, amount: e.target.value } : it))}
                      style={{ ...inp, width: 56, padding: '3px 6px', fontSize: 9 }} />
                    <button onClick={() => setPvItems(prev => prev.filter((_, j) => j !== i))}
                      style={{ fontSize: 9, color: RED, background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 2px' }}>✕</button>
                  </div>
                ))}
                <button onClick={() => setPvItems(prev => [...prev, { name: '', amount: '0' }])}
                  style={{ fontSize: 8, color: ACC, background: 'transparent', border: `1px solid ${ACC}44`, borderRadius: 2, padding: '3px 8px', cursor: 'pointer' }}>
                  + Add item
                </button>
              </div>
            )}
          </div>

          {/* Manager Rate button */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}>
              <input type="checkbox" checked={pvManagerEnabled} onChange={e => setPvManagerEnabled(e.target.checked)} style={{ accentColor: ACC }} />
              <span style={{ fontSize: 9, color: TXT }}>Manager rate button</span>
            </label>
            {pvManagerEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 20 }}>
                <span style={{ fontSize: 8, color: MUT }}>Button label</span>
                <input type="text" value={pvManagerLabel}
                  onChange={e => setPvManagerLabel(e.target.value)}
                  placeholder="Manager approved"
                  style={{ ...inp, flex: 1, padding: '3px 6px', fontSize: 9 }} />
              </div>
            )}
          </div>

          {/* Sliding scale */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={pvSliderEnabled} onChange={e => setPvSliderEnabled(e.target.checked)} style={{ accentColor: ACC }} />
              <span style={{ fontSize: 9, color: TXT }}>Sliding scale</span>
              <span style={{ fontSize: 8, color: MUT }}>(requires markup)</span>
            </label>
          </div>
        </div>

        {/* Save */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={savePricing} disabled={saving}
            style={{ ...btnA, fontSize: 9, padding: '7px 14px', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Pricing & Storage'}
          </button>
          {saved && <span style={{ fontSize: 9, color: '#3d9e50' }}>✓ Saved</span>}
        </div>
        {err && (
          <div style={{ marginTop: 10, padding: '8px 10px', background: '#2a0a0a', border: '1px solid #663333',
            borderRadius: 2, fontSize: 9, color: '#ff6666', lineHeight: 1.6, wordBreak: 'break-all' }}>
            ✕ {err}
          </div>
        )}
      </div>
    </div>
  );
}
