import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, BRD, TXT, SURF, GRN, RED, inp, btnA, btnG } from '../../lib/styles';

const numInp = (value, onChange, placeholder = '0.00') => (
  <input type="number" min="0" step="0.01" value={value} onChange={onChange} placeholder={placeholder}
    style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
);

const timeInp = (value, onChange) => (
  <input type="time" value={value} onChange={onChange}
    style={{ ...inp, width: '100%', boxSizing: 'border-box', fontFamily: "'IBM Plex Mono',monospace" }} />
);

export default function PricingTab({ companyConfig, setCompanyConfig, companyId }) {
  const [tradeBaseFee,      setTradeBaseFee]      = useState(String(companyConfig.trade_base_fee          ?? '0'));
  const [accidentBaseFee,   setAccidentBaseFee]   = useState(String(companyConfig.accident_base_fee       ?? '0'));
  const [tradePerKm,        setTradePerKm]        = useState(String(companyConfig.trade_per_km_fee        ?? '0'));
  const [accidentPerKm,     setAccidentPerKm]     = useState(String(companyConfig.accident_per_km_fee     ?? '0'));
  const [ahFeeWD,           setAhFeeWD]           = useState(String(companyConfig.after_hours_fee_weekday ?? '0'));
  const [ahFeeWE,           setAhFeeWE]           = useState(String(companyConfig.after_hours_fee_weekend ?? '0'));
  const [ahStartWD,         setAhStartWD]         = useState(companyConfig.after_hours_start_weekday ?? '18:00');
  const [ahEndWD,           setAhEndWD]           = useState(companyConfig.after_hours_end_weekday   ?? '06:00');
  const [ahStartWE,         setAhStartWE]         = useState(companyConfig.after_hours_start_weekend ?? '18:00');
  const [ahEndWE,           setAhEndWE]           = useState(companyConfig.after_hours_end_weekend   ?? '06:00');
  const [allowAccidentTwoUp, setAllowAccidentTwoUp] = useState(companyConfig.allow_accident_twoup ?? false);
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceSaved,  setPriceSaved]  = useState(false);
  const [priceErr,    setPriceErr]    = useState('');

  const savePricing = async () => {
    setPriceSaving(true); setPriceSaved(false); setPriceErr('');
    const payload = {
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
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('company_config')
      .update(payload).eq('company_id', companyId).select().single();
    setPriceSaving(false);
    if (error) { setPriceErr(error.message); return; }
    if (data) { setCompanyConfig(data); setPriceSaved(true); setTimeout(() => setPriceSaved(false), 2500); }
  };

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>💰 Pricing</div>
        <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>Used in the Trace route pill to estimate job cost</div>
      </div>
      <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '16px 18px', maxWidth: 480, marginBottom: 24 }}>

        {/* Base fees */}
        <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Base Fee</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 8, color: MUT, marginBottom: 5 }}>Trade Tow <span style={{ color: '#2a2a2a' }}>· first 10 km</span></div>
            {numInp(tradeBaseFee, e => setTradeBaseFee(e.target.value))}
          </div>
          <div>
            <div style={{ fontSize: 8, color: MUT, marginBottom: 5 }}>Accident Tow <span style={{ color: '#2a2a2a' }}>· first 8 km</span></div>
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
            <div onClick={() => setAllowAccidentTwoUp(v => !v)} style={{ width: 36, height: 20, borderRadius: 10, background: allowAccidentTwoUp ? ACC : '#2a2a2a', position: 'relative', flexShrink: 0, marginTop: 1, transition: 'background 0.2s', cursor: 'pointer' }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: '#fff', position: 'absolute', top: 3, left: allowAccidentTwoUp ? 19 : 3, transition: 'left 0.2s' }} />
            </div>
            <div>
              <div style={{ fontSize: 9, color: allowAccidentTwoUp ? TXT : MUT }}>Allow two-up / swinger for accident tows</div>
              <div style={{ fontSize: 7, color: '#333', marginTop: 2, lineHeight: 1.5 }}>Vic law prohibits it at crash scenes — only enable if permitted in your jurisdiction</div>
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
        <div style={{ fontSize: 8, color: MUT, marginBottom: 16, lineHeight: 1.6 }}>
          After-hours spans midnight — any time ≥ start OR &lt; end counts.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={savePricing} disabled={priceSaving}
            style={{ ...btnA, fontSize: 9, padding: '7px 14px', opacity: priceSaving ? 0.6 : 1 }}>
            {priceSaving ? 'Saving…' : 'Save Pricing'}
          </button>
          {priceSaved && <span style={{ fontSize: 9, color: '#3d9e50' }}>✓ Saved</span>}
          {priceErr   && <span style={{ fontSize: 9, color: '#cc4444' }}>{priceErr}</span>}
        </div>
      </div>
    </div>
  );
}
