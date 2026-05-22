import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { BG, SURF, BRD, TXT, MUT, ACC, RED, btnA, btnG, sm } from './lib/styles';
import TowingSection from './components/towing/TowingSection';

function normalizePlate(raw) {
  const s = raw.toUpperCase().replace(/\s+/g, '');
  const m = s.match(/^(TOW)([A-Z0-9]{1,3})$/);
  return m ? `${m[1]} ${m[2]}` : null;
}

export default function App() {
  const [session,     setSession]     = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [truck,       setTruck]       = useState(null);

  const [step,        setStep]        = useState(1); // 1=plate, 2=password
  const [plate,       setPlate]       = useState('');
  const [truckInfo,   setTruckInfo]   = useState(null); // { email, registered }
  const [password,    setPassword]    = useState('');
  const [confirmPwd,  setConfirmPwd]  = useState('');
  const [loggingIn,   setLoggingIn]   = useState(false);
  const [loginErr,    setLoginErr]    = useState('');

  const loadTruck = async (email) => {
    const { data } = await supabase
      .from('tow_trucks')
      .select('*')
      .eq('auth_email', email)
      .single();
    setTruck(data || null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthChecked(true);
      if (session) loadTruck(session.user.email);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadTruck(session.user.email);
      else setTruck(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handlePlateSubmit = async (e) => {
    e.preventDefault();
    setLoginErr('');
    const normalized = normalizePlate(plate);
    if (!normalized) {
      setLoginErr('Enter your plate in the format TOW followed by numbers (e.g. TOW 001).');
      return;
    }
    setLoggingIn(true);
    const { data, error } = await supabase.rpc('get_truck_auth_info', { p_plate: normalized });
    setLoggingIn(false);
    if (error || !data) {
      setLoginErr('Plate not found. Check your truck number.');
      return;
    }
    setTruckInfo(data);
    setStep(2);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setLoginErr('');
    if (!truckInfo.registered) {
      if (password.length < 6) { setLoginErr('Password must be at least 6 characters.'); return; }
      if (password !== confirmPwd) { setLoginErr('Passwords do not match.'); return; }
    }
    setLoggingIn(true);
    if (truckInfo.registered) {
      const { error } = await supabase.auth.signInWithPassword({ email: truckInfo.email, password });
      if (error) setLoginErr('Incorrect password.');
    } else {
      const { error } = await supabase.auth.signUp({ email: truckInfo.email, password });
      if (error) setLoginErr(error.message);
    }
    setLoggingIn(false);
  };

  const signOut = () => {
    supabase.auth.signOut();
    setStep(1);
    setPlate('');
    setTruckInfo(null);
    setPassword('');
    setConfirmPwd('');
    setLoginErr('');
  };

  const isAdmin = truck?.is_admin === true;

  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 10, color: MUT, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          Loading…
        </div>
      </div>
    );
  }

  if (!session) {
    const inputStyle = { background: '#0a0a0a', border: '1px solid #252525', color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, padding: '9px 10px', borderRadius: 2, width: '100%', outline: 'none', boxSizing: 'border-box' };
    const formStyle  = { background: SURF, border: '1px solid ' + BRD, borderTop: '2px solid ' + ACC, borderRadius: 3, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 };
    const labelStyle = { fontSize: 9, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 };
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 340 }}>
          <div style={{ marginBottom: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: ACC, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              🚛 TowBench
            </div>
            <div style={{ fontSize: 9, color: MUT, marginTop: 6, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              Tow Fleet &amp; Allocation Management
            </div>
          </div>

          {step === 1 ? (
            <form onSubmit={handlePlateSubmit} style={formStyle}>
              <div>
                <div style={labelStyle}>Truck Number Plate</div>
                <input
                  type="text"
                  value={plate}
                  onChange={e => setPlate(e.target.value.toUpperCase())}
                  placeholder="TOW 001"
                  required
                  autoFocus
                  autoCapitalize="characters"
                  style={{ ...inputStyle, fontSize: 18, letterSpacing: '0.18em', textTransform: 'uppercase' }}
                />
              </div>
              {loginErr && <div style={{ fontSize: 9, color: RED, lineHeight: 1.5 }}>{loginErr}</div>}
              <button type="submit" disabled={loggingIn}
                style={{ ...btnA, width: '100%', opacity: loggingIn ? 0.5 : 1, marginTop: 4 }}>
                {loggingIn ? 'Checking…' : 'Continue →'}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordSubmit} style={formStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: ACC, fontWeight: 700, letterSpacing: '0.14em' }}>
                  {normalizePlate(plate) || plate}
                </span>
                <button type="button" onClick={() => { setStep(1); setLoginErr(''); setPassword(''); setConfirmPwd(''); }}
                  style={{ fontSize: 8, color: MUT, background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace" }}>
                  ← change
                </button>
              </div>
              {!truckInfo?.registered && (
                <div style={{ fontSize: 8, color: '#5a8a5a', lineHeight: 1.6 }}>
                  First login — choose a password for this truck.
                </div>
              )}
              <div>
                <div style={labelStyle}>Password</div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required autoFocus minLength={6} style={inputStyle} />
              </div>
              {!truckInfo?.registered && (
                <div>
                  <div style={labelStyle}>Confirm Password</div>
                  <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                    placeholder="••••••••" required minLength={6} style={inputStyle} />
                </div>
              )}
              {loginErr && <div style={{ fontSize: 9, color: RED, lineHeight: 1.5 }}>{loginErr}</div>}
              <button type="submit" disabled={loggingIn}
                style={{ ...btnA, width: '100%', opacity: loggingIn ? 0.5 : 1, marginTop: 4 }}>
                {loggingIn
                  ? (truckInfo?.registered ? 'Signing in…' : 'Creating account…')
                  : (truckInfo?.registered ? 'Sign In' : 'Set Password & Sign In')}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TXT, fontFamily: "'IBM Plex Mono',monospace", display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: SURF, borderBottom: '2px solid ' + ACC, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: ACC, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          🚛 TowBench
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {truck && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: TXT, fontWeight: 700, letterSpacing: '0.12em' }}>
                {truck.plate}
              </span>
              {isAdmin && (
                <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px', border: `1px solid ${ACC}55`, borderRadius: 2, color: ACC, background: ACC + '15', textTransform: 'uppercase' }}>
                  Admin
                </span>
              )}
            </div>
          )}
          <button onClick={signOut} style={{ ...btnG, ...sm, fontSize: 8 }}>Sign Out</button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TowingSection isAdmin={isAdmin} />
      </div>
    </div>
  );
}
