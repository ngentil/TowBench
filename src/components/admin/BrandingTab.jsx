import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, BRD, TXT, SURF, inp, btnA, btnG } from '../../lib/styles';

export default function BrandingTab({ companyConfig, setCompanyConfig, companyId }) {
  const [name,   setName]   = useState(companyConfig.company_name || '');
  const [accent, setAccent] = useState(companyConfig.accent_color || '#e8670a');
  const [logo,   setLogo]   = useState(companyConfig.logo_url || '');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [err,      setErr]      = useState('');

  const previewAccent = (color) => {
    setAccent(color);
    document.documentElement.style.setProperty('--acc', color);
  };

  const saveBranding = async () => {
    setSaving(true); setSaved(false); setErr('');
    const payload = {
      company_name: name.trim() || 'TowBench',
      accent_color: accent,
      logo_url: logo.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('company_config')
      .update(payload).eq('company_id', companyId).select().single();
    setSaving(false);
    if (error) { setErr(error.message); return; }
    if (data) { setCompanyConfig(data); setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };

  const row = (label, children) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>🎨 Branding</div>
        <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>White-label — changes apply to all users instantly</div>
      </div>
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
          {saved  && <span style={{ fontSize: 9, color: '#3d9e50' }}>✓ Saved</span>}
          {err    && <span style={{ fontSize: 9, color: '#cc4444' }}>{err}</span>}
        </div>
      </div>
    </div>
  );
}
