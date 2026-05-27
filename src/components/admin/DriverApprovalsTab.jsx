import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { MUT, BRD, TXT, SURF, GRN } from '../../lib/styles';

export default function DriverApprovalsTab({ companyId }) {
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

  const approveDriver = async (truckId) => {
    setApprovingId(truckId);
    await supabase.from('tow_trucks').update({ approved: true }).eq('id', truckId);
    setPendingDrivers(prev => prev.filter(d => d.id !== truckId));
    setApprovingId(null);
  };

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>✅ Approvals</div>
        <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>Review licence and approve access</div>
      </div>
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
    </div>
  );
}
