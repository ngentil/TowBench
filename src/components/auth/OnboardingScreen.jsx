import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, BRD, SURF, BG, TXT, GRN, RED, inp, btnA } from '../../lib/styles';

const label = { fontSize: 8, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 };
const row2  = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };

export default function OnboardingScreen({ session, onComplete }) {
  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [companyName, setCompanyName] = useState('');
  const [plate,       setPlate]       = useState('');
  const [daNumber,    setDaNumber]    = useState('');
  const [busy,        setBusy]        = useState(false);
  const [err,         setErr]         = useState('');

  const normPlate = plate.toUpperCase().replace(/\s+/g, '');
  const isTowPlate = normPlate.startsWith('TOW');

  const handleSubmit = async e => {
    e.preventDefault();
    setErr('');
    if (!firstName.trim())   { setErr('First name required.');   return; }
    if (!lastName.trim())    { setErr('Last name required.');    return; }
    if (!companyName.trim()) { setErr('Company name required.'); return; }
    if (!normPlate)          { setErr('Plate number required.'); return; }
    if (isTowPlate && !daNumber.trim()) { setErr('DA number required for TOW plates.'); return; }

    setBusy(true);
    try {
      const { error: truckErr } = await supabase.from('tow_trucks').insert({
        plate:      normPlate,
        first_name: firstName.trim(),
        last_name:  lastName.trim(),
        auth_email: session.user.email,
        da_number:  isTowPlate ? daNumber.trim() : null,
        status:     'available',
      });
      if (truckErr) throw truckErr;

      await supabase.from('company_config')
        .update({ company_name: companyName.trim() })
        .eq('user_id', session.user.id);

      onComplete();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 24, fontFamily: "'IBM Plex Mono',monospace" }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🚛</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: ACC, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Set up your profile
          </div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 4 }}>Just a few details to get started</div>
        </div>

        <form onSubmit={handleSubmit}
          style={{ background: SURF, border: '1px solid ' + BRD, borderTop: '2px solid ' + ACC,
            borderRadius: 3, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Name */}
          <div style={row2}>
            <div>
              <div style={label}>First Name</div>
              <input style={inp} type="text" placeholder="John" autoFocus autoCapitalize="words"
                value={firstName} onChange={e => setFirstName(e.target.value)} required />
            </div>
            <div>
              <div style={label}>Last Name</div>
              <input style={inp} type="text" placeholder="Smith" autoCapitalize="words"
                value={lastName} onChange={e => setLastName(e.target.value)} required />
            </div>
          </div>

          {/* Company */}
          <div>
            <div style={label}>Company Name</div>
            <input style={inp} type="text" placeholder="Smith Towing" autoCapitalize="words"
              value={companyName} onChange={e => setCompanyName(e.target.value)} required />
          </div>

          {/* Plate */}
          <div>
            <div style={label}>Rego / Number Plate</div>
            <input style={{ ...inp, textTransform: 'uppercase', letterSpacing: '0.1em' }}
              type="text" placeholder="TOW 123 or ABC 456"
              value={plate} onChange={e => setPlate(e.target.value)} required />
            {isTowPlate && (
              <div style={{ fontSize: 8, color: ACC, marginTop: 4 }}>
                TOW plate detected — DA number required below
              </div>
            )}
          </div>

          {/* DA Number — only shown for TOW plates */}
          {isTowPlate && (
            <div>
              <div style={label}>DA Number</div>
              <input style={inp} type="text" placeholder="e.g. 12345678"
                value={daNumber} onChange={e => setDaNumber(e.target.value)} required />
            </div>
          )}

          {err && (
            <div style={{ background: RED + '12', border: '1px solid ' + RED + '44', color: RED,
              fontSize: 10, padding: '8px 12px', borderRadius: 2, lineHeight: 1.5 }}>
              {err}
            </div>
          )}

          <button type="submit" disabled={busy}
            style={{ ...btnA, width: '100%', marginTop: 4, padding: '11px 0',
              fontSize: 10, letterSpacing: '0.1em', opacity: busy ? 0.4 : 1 }}>
            {busy ? 'Saving…' : 'Get Started →'}
          </button>
        </form>
      </div>
    </div>
  );
}
