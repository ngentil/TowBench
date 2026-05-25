import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, BRD, TXT, SURF, GRN, inp, btnA, btnG } from '../../lib/styles';

const row = (label, children) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
    {children}
  </div>
);

const numInp = (value, onChange, placeholder = '0.00') => (
  <input type="number" min="0" step="0.01" value={value} onChange={onChange} placeholder={placeholder}
    style={{ ...inp, width: 120 }} />
);

const timeInp = (value, onChange) => (
  <input type="time" value={value} onChange={onChange}
    style={{ ...inp, width: 120, fontFamily: "'IBM Plex Mono',monospace" }} />
);

export default function AdminSettings({ companyConfig, setCompanyConfig, companyId }) {
  // Branding
  const [name,   setName]   = useState(companyConfig.company_name || '');
  const [accent, setAccent] = useState(companyConfig.accent_color || '#e8670a');
  const [logo,   setLogo]   = useState(companyConfig.logo_url || '');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  // Pricing
  const [baseFee,    setBaseFee]    = useState(String(companyConfig.base_fee    ?? '0'));
  const [perKmFee,   setPerKmFee]   = useState(String(companyConfig.per_km_fee  ?? '0'));
  const [ahFee,      setAhFee]      = useState(String(companyConfig.after_hours_fee ?? '0'));
  const [ahStartWD,  setAhStartWD]  = useState(companyConfig.after_hours_start_weekday ?? '18:00');
  const [ahEndWD,    setAhEndWD]    = useState(companyConfig.after_hours_end_weekday   ?? '06:00');
  const [ahStartWE,  setAhStartWE]  = useState(companyConfig.after_hours_start_weekend ?? '18:00');
  const [ahEndWE,    setAhEndWE]    = useState(companyConfig.after_hours_end_weekend   ?? '06:00');
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceSaved,  setPriceSaved]  = useState(false);

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
    setSaving(true); setSaved(false);
    const payload = {
      company_name: name.trim() || 'TowBench',
      accent_color: accent,
      logo_url: logo.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('company_config')
      .update(payload).eq('id', companyConfig.id).select().single();
    setSaving(false);
    if (!error && data) { setCompanyConfig(data); setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };

  const savePricing = async () => {
    setPriceSaving(true); setPriceSaved(false);
    const payload = {
      base_fee:                  parseFloat(baseFee)  || 0,
      per_km_fee:                parseFloat(perKmFee) || 0,
      after_hours_fee:           parseFloat(ahFee)    || 0,
      after_hours_start_weekday: ahStartWD,
      after_hours_end_weekday:   ahEndWD,
      after_hours_start_weekend: ahStartWE,
      after_hours_end_weekend:   ahEndWE,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('company_config')
      .update(payload).eq('id', companyConfig.id).select().single();
    setPriceSaving(false);
    if (!error && data) { setCompanyConfig(data); setPriceSaved(true); setTimeout(() => setPriceSaved(false), 2500); }
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <button onClick={saveBranding} disabled={saving}
            style={{ ...btnA, fontSize: 9, padding: '7px 14px', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Branding'}
          </button>
          {saved && <span style={{ fontSize: 9, color: '#3d9e50' }}>✓ Saved</span>}
        </div>
      </div>

      {/* ── Pricing ──────────────────────────────────────────────── */}
      {sectionHead('Pricing', 'Used in the Trace route pill to estimate job cost')}
      <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '16px 18px', maxWidth: 480, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>Base Fee ($)</div>
            {numInp(baseFee, e => setBaseFee(e.target.value))}
          </div>
          <div>
            <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>Per km ($)</div>
            {numInp(perKmFee, e => setPerKmFee(e.target.value))}
          </div>
          <div>
            <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>After Hours ($)</div>
            {numInp(ahFee, e => setAhFee(e.target.value))}
          </div>
        </div>
        <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>After Hours Window</div>
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
        <div style={{ fontSize: 8, color: MUT, marginBottom: 14, lineHeight: 1.6 }}>
          After-hours spans midnight — any time ≥ start OR &lt; end counts.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={savePricing} disabled={priceSaving}
            style={{ ...btnA, fontSize: 9, padding: '7px 14px', opacity: priceSaving ? 0.6 : 1 }}>
            {priceSaving ? 'Saving…' : 'Save Pricing'}
          </button>
          {priceSaved && <span style={{ fontSize: 9, color: '#3d9e50' }}>✓ Saved</span>}
        </div>
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
