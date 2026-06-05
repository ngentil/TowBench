import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, BRD, TXT, SURF, GRN, RED, inp, txa, btnA, btnG, sm } from '../../lib/styles';

const row = (label, children) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
    {children}
  </div>
);

const numInp = (value, onChange, placeholder = '0.00') => (
  <input type="number" min="0" step="0.01" value={value} onChange={onChange} placeholder={placeholder}
    style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
);

const timeInp = (value, onChange) => (
  <input type="time" value={value} onChange={onChange}
    style={{ ...inp, width: '100%', boxSizing: 'border-box', fontFamily: "'IBM Plex Mono',monospace" }} />
);

function StorageTypesSection({ companyId }) {
  const [types,    setTypes]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [newName,  setNewName]  = useState('');
  const [newRate,  setNewRate]  = useState('');
  const [adding,   setAdding]   = useState(false);
  const [err,      setErr]      = useState('');

  useEffect(() => {
    if (!companyId) return;
    supabase.from('storage_types').select('*')
      .eq('company_id', companyId).order('daily_rate', { ascending: false })
      .then(({ data }) => { setTypes(data || []); setLoading(false); });
  }, [companyId]);

  const addType = async () => {
    if (!newName.trim()) { setErr('Name is required.'); return; }
    const rate = parseFloat(newRate);
    if (isNaN(rate) || rate < 0) { setErr('Enter a valid daily rate.'); return; }
    setAdding(true); setErr('');
    const { data, error } = await supabase.from('storage_types')
      .insert({ company_id: companyId, name: newName.trim(), daily_rate: rate })
      .select().single();
    if (error) { setErr(error.message); setAdding(false); return; }
    setTypes(prev => [...prev, data].sort((a, b) => b.daily_rate - a.daily_rate));
    setNewName(''); setNewRate(''); setAdding(false);
  };

  const deleteType = async (id) => {
    await supabase.from('storage_types').delete().eq('id', id);
    setTypes(prev => prev.filter(t => t.id !== id));
  };

  const updateRate = async (id, rate) => {
    const r = parseFloat(rate);
    if (isNaN(r)) return;
    await supabase.from('storage_types').update({ daily_rate: r }).eq('id', id);
    setTypes(prev => prev.map(t => t.id === id ? { ...t, daily_rate: r } : t)
      .sort((a, b) => b.daily_rate - a.daily_rate));
  };

  return (
    <div>
      {loading ? (
        <div style={{ fontSize: 9, color: MUT }}>Loading…</div>
      ) : (
        <>
          {types.length === 0 && (
            <div style={{ fontSize: 9, color: MUT, marginBottom: 10 }}>No storage types yet.</div>
          )}
          {types.map((t, i) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1, fontSize: 10, color: TXT, fontFamily: "'IBM Plex Mono',monospace" }}>{t.name}</div>
              {i === 0 && <span style={{ fontSize: 7, color: ACC, border: `1px solid ${ACC}55`, borderRadius: 2, padding: '1px 5px' }}>DEFAULT</span>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 8, color: MUT }}>$</span>
                <input
                  type="number" min="0" step="0.01"
                  defaultValue={parseFloat(t.daily_rate).toFixed(2)}
                  onBlur={e => updateRate(t.id, e.target.value)}
                  style={{ ...inp, width: 72, padding: '4px 6px', fontSize: 10 }}
                />
                <span style={{ fontSize: 8, color: MUT }}>/day</span>
              </div>
              <button onClick={() => deleteType(t.id)}
                style={{ background: 'none', border: '1px solid #3a1a1a', color: '#884040',
                  fontSize: 9, padding: '3px 8px', borderRadius: 2, cursor: 'pointer',
                  fontFamily: "'IBM Plex Mono',monospace" }}>✕</button>
            </div>
          ))}

          {/* Add row */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Secure Undercover"
              style={{ ...inp, flex: 1, minWidth: 140, padding: '6px 8px', fontSize: 10 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 8, color: MUT }}>$</span>
              <input type="number" min="0" step="0.01" value={newRate}
                onChange={e => setNewRate(e.target.value)}
                placeholder="0.00"
                onKeyDown={e => e.key === 'Enter' && addType()}
                style={{ ...inp, width: 72, padding: '6px 8px', fontSize: 10 }} />
              <span style={{ fontSize: 8, color: MUT }}>/day</span>
            </div>
            <button onClick={addType} disabled={adding}
              style={{ ...btnA, ...sm, opacity: adding ? 0.6 : 1 }}>
              {adding ? '…' : '+ Add'}
            </button>
          </div>
          {err && <div style={{ fontSize: 9, color: RED, marginTop: 6 }}>{err}</div>}
        </>
      )}
    </div>
  );
}

export default function AdminSettings({ companyConfig, setCompanyConfig, companyId }) {
  // Branding
  const [name,   setName]   = useState(companyConfig.company_name || '');
  const [accent, setAccent] = useState(companyConfig.accent_color || '#e8670a');
  const [logo,   setLogo]   = useState(companyConfig.logo_url || '');
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [brandErr,  setBrandErr]  = useState('');

  // Pricing
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
  const [storageCarCover,    setStorageCarCover]    = useState(String(companyConfig.storage_car_undercover  ?? '0'));
  const [storageBikeCover,   setStoageBikeCover]    = useState(String(companyConfig.storage_bike_undercover ?? '0'));
  const [storageCarYard,     setStorageCarYard]     = useState(String(companyConfig.storage_car_yard        ?? '0'));
  const [storageBikeYard,    setStorageBikeYard]    = useState(String(companyConfig.storage_bike_yard       ?? '0'));
  const [allowAccidentTwoUp, setAllowAccidentTwoUp] = useState(companyConfig.allow_accident_twoup ?? false);
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceSaved,  setPriceSaved]  = useState(false);
  const [priceErr,    setPriceErr]    = useState('');

  // Driver approval
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [approvingId,    setApprovingId]    = useState(null);

  useEffect(() => {
    if (!companyId) return;
    supabase.from('tow_trucks')
      .select('id, plate, first_name, last_name, da_number, licence_photo_url, approved, auth_email')
      .eq('company_id', companyId)
      .eq('approved', false)
      .not('auth_email', 'is', null)
      .then(({ data }) => { setPendingDrivers(data || []); setLoadingDrivers(false); });
  }, [companyId]);

  const previewAccent = (color) => {
    setAccent(color);
    document.documentElement.style.setProperty('--acc', color);
  };

  const saveBranding = async () => {
    if (!companyId) { setBrandErr('No company ID — cannot save.'); return; }
    setSaving(true); setSaved(false); setBrandErr('');
    const payload = {
      company_id:   companyId,
      company_name: name.trim() || 'TowBench',
      accent_color: accent,
      logo_url:     logo.trim() || null,
      updated_at:   new Date().toISOString(),
    };
    const { data, error } = await supabase.from('company_config')
      .upsert(payload, { onConflict: 'company_id' }).select().single();
    setSaving(false);
    if (error) { setBrandErr(error.message); return; }
    if (data) { setCompanyConfig(data); setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };

  const savePricing = async () => {
    if (!companyId) { setPriceErr('No company ID — cannot save pricing.'); return; }
    setPriceSaving(true); setPriceSaved(false); setPriceErr('');
    const payload = {
      company_id:                companyId,
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
      storage_car_undercover:    parseFloat(storageCarCover)  || 0,
      storage_bike_undercover:   parseFloat(storageBikeCover) || 0,
      storage_car_yard:          parseFloat(storageCarYard)   || 0,
      storage_bike_yard:         parseFloat(storageBikeYard)  || 0,
      allow_accident_twoup:      allowAccidentTwoUp,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('company_config')
      .upsert(payload, { onConflict: 'company_id' }).select().single();
    setPriceSaving(false);
    if (error) { setPriceErr(error.message); return; }
    if (data) { setCompanyConfig(data); setPriceSaved(true); setTimeout(() => setPriceSaved(false), 2500); }
  };

  const approveDriver = async (truckId) => {
    setApprovingId(truckId);
    await supabase.from('tow_trucks').update({ approved: true }).eq('id', truckId);
    setPendingDrivers(prev => prev.filter(d => d.id !== truckId));
    setApprovingId(null);
  };

  const sectionHead = (label, sub) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: TXT, letterSpacing: '0.04em' }}>{label}</div>
      {sub && <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>⚙ Company Settings</div>
      </div>

      {/* ── Branding ─────────────────────────────────────────────── */}
      {sectionHead('Branding', 'White-label — changes apply to all users instantly')}
      <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '16px 18px', maxWidth: 480, marginBottom: 24 }}>
        {row('Company / App Name',
          <input value={name} onChange={e => setName(e.target.value)} style={{ ...inp }} placeholder="TowBench" />
        )}
        {row('Accent Colour',
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="color" value={accent} onChange={e => previewAccent(e.target.value)}
              style={{ width: 44, height: 32, border: '1px solid ' + BRD, borderRadius: 2, background: 'none', cursor: 'pointer', padding: 2 }} />
            <input value={accent} onChange={e => previewAccent(e.target.value)}
              style={{ ...inp, width: 110, fontFamily: "'IBM Plex Mono',monospace" }} placeholder="#e8670a" />
            <div style={{ fontSize: 9, color: MUT }}>Live preview</div>
          </div>
        )}
        {row('Logo URL (optional)',
          <div>
            <input value={logo} onChange={e => setLogo(e.target.value)} style={{ ...inp }} placeholder="https://…/logo.png" />
            {logo && (
              <div style={{ marginTop: 8, padding: '8px 10px', background: '#0a0a0a', border: '1px solid ' + BRD, borderRadius: 2, display: 'inline-block' }}>
                <img src={logo} alt="Logo preview" style={{ height: 28, borderRadius: 2, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
          <button onClick={saveBranding} disabled={saving}
            style={{ ...btnA, fontSize: 9, padding: '7px 14px', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Branding'}
          </button>
          {saved     && <span style={{ fontSize: 9, color: '#3d9e50' }}>✓ Saved</span>}
          {brandErr  && <span style={{ fontSize: 9, color: '#cc4444' }}>{brandErr}</span>}
        </div>
      </div>

      {/* ── Pricing ──────────────────────────────────────────────── */}
      {sectionHead('Pricing', 'Used in the Trace route pill to estimate job cost')}
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

      {/* ── Storage Types ────────────────────────────────────────── */}
      {sectionHead('Storage Types', 'Tow-in storage options — sorted most expensive first (used as default)')}
      <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '16px 18px', maxWidth: 480, marginBottom: 24 }}>
        <StorageTypesSection companyId={companyId} />
      </div>

      {/* ── Driver Approval ──────────────────────────────────────── */}
      {sectionHead('Pending Driver Approvals', 'Review licence and approve access')}
      <div style={{ maxWidth: 540, marginBottom: 24 }}>
        {loadingDrivers && <div style={{ fontSize: 9, color: MUT }}>Loading…</div>}
        {!loadingDrivers && pendingDrivers.length === 0 && (
          <div style={{ fontSize: 9, color: MUT, padding: '12px 0' }}>No pending approvals.</div>
        )}
        {pendingDrivers.map(d => (
          <div key={d.id} style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '12px 14px', marginBottom: 10, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {d.licence_photo_url && (
              <a href={d.licence_photo_url} target="_blank" rel="noopener noreferrer"
                style={{ flexShrink: 0 }}>
                <img src={d.licence_photo_url} alt="Licence"
                  style={{ width: 70, height: 52, objectFit: 'cover', borderRadius: 2, border: '1px solid #333', display: 'block' }}
                  onError={e => { e.target.style.display = 'none'; }} />
              </a>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: TXT, marginBottom: 2 }}>
                {[d.first_name, d.last_name].filter(Boolean).join(' ') || d.auth_email?.split('@')[0]}
              </div>
              <div style={{ fontSize: 8, color: MUT, marginBottom: 1 }}>{d.plate?.toUpperCase()}</div>
              {d.da_number && <div style={{ fontSize: 8, color: MUT }}>DA: {d.da_number}</div>}
              {d.auth_email && <div style={{ fontSize: 8, color: '#3a3a3a' }}>{d.auth_email}</div>}
            </div>
            <button onClick={() => approveDriver(d.id)} disabled={approvingId === d.id}
              style={{ background: GRN + '22', border: `1px solid ${GRN}55`, borderRadius: 2, color: GRN,
                fontSize: 9, padding: '5px 12px', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace",
                fontWeight: 700, whiteSpace: 'nowrap', opacity: approvingId === d.id ? 0.5 : 1 }}>
              {approvingId === d.id ? 'Approving…' : '✓ Approve'}
            </button>
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 14px', background: '#0a0800', border: '1px solid #2a2000', borderRadius: 2, fontSize: 9, color: '#5a4a20', lineHeight: 1.8, maxWidth: 480 }}>
        <div style={{ color: '#8a7a40', fontWeight: 700, marginBottom: 4 }}>Tricom integration (future)</div>
        All pricing, fleet, and allocation data is stored in Supabase and will feed into Tricom when that project starts. No schema changes will be required.
      </div>
    </div>
  );
}
