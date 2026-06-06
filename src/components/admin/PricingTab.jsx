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

export default function PricingTab({ companyConfig, setCompanyConfig, companyId }) {
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
  const [allowAccidentTwoUp, setAllowAccidentTwoUp]  = useState(companyConfig.allow_accident_twoup ?? false);

  // Storage type rates keyed by preset name
  const [storageRates, setStorageRates] = useState(() =>
    Object.fromEntries(STORAGE_PRESETS.map(n => [n, '']))
  );
  // Track existing row IDs so we can update vs insert
  const [storageIds, setStorageIds] = useState({});

  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [err,    setErr]    = useState('');

  // Load storage types on mount / companyId change
  useEffect(() => {
    const load = async (cid) => {
      const { data } = await supabase.from('storage_types').select('id, name, daily_rate')
        .eq('company_id', cid).in('name', STORAGE_PRESETS);
      if (!data) return;
      const rates = {}, ids = {};
      for (const row of data) {
        rates[row.name] = String(parseFloat(row.daily_rate).toFixed(2));
        ids[row.name]   = row.id;
      }
      setStorageRates(prev => ({ ...prev, ...rates }));
      setStorageIds(ids);
    };
    if (companyId) {
      load(companyId);
    } else {
      supabase.from('companies').select('id').order('created_at').limit(1).maybeSingle()
        .then(({ data }) => { if (data?.id) load(data.id); });
    }
  }, [companyId]);

  const savePricing = async () => {
    let cid = companyId;
    if (!cid) {
      // Race: effectiveCompanyId not yet resolved — fetch inline
      const { data } = await supabase.from('companies').select('id').order('created_at').limit(1).maybeSingle();
      cid = data?.id;
    }
    if (!cid) { setErr('No company found — check Supabase setup.'); return; }
    setSaving(true); setSaved(false); setErr('');

    // 1 — company_config upsert
    const payload = {
      company_id:                cid,
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
      allow_accident_twoup:      allowAccidentTwoUp,
      updated_at:                new Date().toISOString(),
    };
    const { data: cfgData, error: cfgErr } = await supabase
      .from('company_config')
      .upsert(payload, { onConflict: 'company_id' })
      .select().single();
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
          .insert({ company_id: cid, name, daily_rate: rate })
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

        {/* Two-up for accident */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <div onClick={() => setAllowAccidentTwoUp(v => !v)}
              style={{ width: 36, height: 20, borderRadius: 10, background: allowAccidentTwoUp ? ACC : '#2a2a2a',
                position: 'relative', flexShrink: 0, marginTop: 1, transition: 'background 0.2s', cursor: 'pointer' }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: '#fff', position: 'absolute',
                top: 3, left: allowAccidentTwoUp ? 19 : 3, transition: 'left 0.2s' }} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: allowAccidentTwoUp ? TXT : MUT }}>Allow two-up / swinger for accident tows</div>
              <div style={{ fontSize: 7, color: '#444', marginTop: 2, lineHeight: 1.5 }}>
                Vic law prohibits it at crash scenes — only enable if permitted in your jurisdiction
              </div>
            </div>
          </label>
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

        {/* Save */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={savePricing} disabled={saving}
            style={{ ...btnA, fontSize: 9, padding: '7px 14px', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Pricing & Storage'}
          </button>
          {saved && <span style={{ fontSize: 9, color: '#3d9e50' }}>✓ Saved</span>}
          {err   && <span style={{ fontSize: 9, color: '#cc4444' }}>{err}</span>}
        </div>
      </div>
    </div>
  );
}
