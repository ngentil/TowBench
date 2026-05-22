import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { BG, SURF, BRD, TXT, MUT, ACC, RED, btnA, btnG, sm } from './lib/styles';
import TowingSection from './components/towing/TowingSection';

function normalizePlate(raw) {
  const s = raw.toUpperCase().replace(/\s+/g, '');
  return /^TOW[A-Z0-9]{1,3}$/.test(s) ? s : null;
}

function plateFromEmail(email) {
  return email?.split('@')[0]?.toUpperCase() || '';
}

function getGreeting(name) {
  const h = new Date().getHours();
  const tod = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${tod}, ${name}`;
}

function requestGPS() {
  if (!navigator.geolocation) return;
  const ask = () => navigator.geolocation.getCurrentPosition(() => {}, () => {});
  if (navigator.permissions) {
    navigator.permissions.query({ name: 'geolocation' })
      .then(p => { if (p.state !== 'granted') ask(); })
      .catch(ask);
  } else {
    ask();
  }
}

export default function App() {
  const [session,           setSession]           = useState(null);
  const [authChecked,       setAuthChecked]       = useState(false);
  const [truck,             setTruck]             = useState(null);
  const [driverDisplayName, setDriverDisplayName] = useState('');
  const [greeting,          setGreeting]          = useState('');
  const [showGreeting,      setShowGreeting]      = useState(false);

  const [step,        setStep]       = useState(1);
  const [plate,       setPlate]      = useState('');
  const [truckInfo,   setTruckInfo]  = useState(null);
  const [driverName,  setDriverName] = useState('');
  const [password,    setPassword]   = useState('');
  const [confirmPwd,  setConfirmPwd] = useState('');
  const [loggingIn,   setLoggingIn]  = useState(false);
  const [loginErr,    setLoginErr]   = useState('');

  const loadTruck = async (email, welcome = false) => {
    const [truckRes, userRes] = await Promise.all([
      supabase.from('tow_trucks').select('*').eq('auth_email', email).single(),
      supabase.auth.getUser(),
    ]);
    const truckData = truckRes.data || null;
    const name = truckData?.driver_name || userRes.data?.user?.user_metadata?.driver_name || '';
    setTruck(truckData);
    setDriverDisplayName(name);
    if (welcome && name) {
      setGreeting(getGreeting(name));
      setShowGreeting(true);
      setTimeout(() => setShowGreeting(false), 3500);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthChecked(true);
      if (session) loadTruck(session.user.email, false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        loadTruck(session.user.email, event === 'SIGNED_IN');
        if (event === 'SIGNED_IN') requestGPS();
      } else {
        setTruck(null);
        setDriverDisplayName('');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handlePlateSubmit = async (e) => {
    e.preventDefault();
    setLoginErr('');
    const normalized = normalizePlate(plate);
    if (!normalized) {
      setLoginErr('Enter your plate in the format TOW followed by numbers (e.g. TOW933).');
      return;
    }
    setLoggingIn(true);
    const { data, error } = await supabase.rpc('get_truck_auth_info', { p_plate: normalized });
    setLoggingIn(false);
    if (error) { setLoginErr('Something went wrong. Try again.'); return; }
    setTruckInfo(data);
    setStep(2);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setLoginErr('');
    if (!truckInfo.registered) {
      if (!driverName.trim())      { setLoginErr('Please enter your name.'); return; }
      if (password.length < 6)     { setLoginErr('Password must be at least 6 characters.'); return; }
      if (password !== confirmPwd) { setLoginErr('Passwords do not match.'); return; }
    }
    setLoggingIn(true);
    if (truckInfo.registered) {
      const { error } = await supabase.auth.signInWithPassword({ email: truckInfo.email, password });
      if (error) { setLoginErr('Incorrect password.'); setLoggingIn(false); return; }
    } else {
      const { error } = await supabase.auth.signUp({
        email: truckInfo.email,
        password,
        options: { data: { driver_name: driverName.trim() } },
      });
      if (error) { setLoginErr(error.message); setLoggingIn(false); return; }
    }
    setLoggingIn(false);
  };

  const signOut = () => {
    supabase.auth.signOut();
    setStep(1); setPlate(''); setTruckInfo(null);
    setDriverName(''); setPassword(''); setConfirmPwd(''); setLoginErr('');
  };

  const isAdmin = truck?.is_admin === true;
  const displayPlate = session ? plateFromEmail(session.user.email) : '';

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
                  placeholder="TOW933"
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
                <button type="button"
                  onClick={() => { setStep(1); setLoginErr(''); setPassword(''); setConfirmPwd(''); setDriverName(''); }}
                  style={{ fontSize: 8, color: MUT, background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace" }}>
                  ← change
                </button>
              </div>

              {!truckInfo?.registered ? (
                <>
                  <div style={{ fontSize: 8, color: '#5a8a5a', lineHeight: 1.6 }}>
                    First login — enter your name and choose a password.
                  </div>
                  <div>
                    <div style={labelStyle}>Your Name</div>
                    <input type="text" value={driverName} onChange={e => setDriverName(e.target.value)}
                      placeholder="e.g. Nathan" required autoFocus autoCapitalize="words" style={inputStyle} />
                  </div>
                  <div>
                    <div style={labelStyle}>Password</div>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••" required minLength={6} style={inputStyle} />
                  </div>
                  <div>
                    <div style={labelStyle}>Confirm Password</div>
                    <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                      placeholder="••••••••" required minLength={6} style={inputStyle} />
                  </div>
                </>
              ) : (
                <div>
                  <div style={labelStyle}>Password</div>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required autoFocus minLength={6} style={inputStyle} />
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

  if (showGreeting) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-text" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: MUT, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 18 }}>
            🚛 TowBench
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: TXT, letterSpacing: '0.02em', fontFamily: "'IBM Plex Mono',monospace" }}>
            {greeting}
          </div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            {displayPlate}{isAdmin ? ' · Admin' : ''}
          </div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: TXT, fontWeight: 700, letterSpacing: '0.12em' }}>
              {displayPlate}
            </span>
            {driverDisplayName && (
              <span style={{ fontSize: 9, color: MUT }}>· {driverDisplayName}</span>
            )}
            {isAdmin && (
              <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px', border: `1px solid ${ACC}55`, borderRadius: 2, color: ACC, background: ACC + '15', textTransform: 'uppercase' }}>
                Admin
              </span>
            )}
          </div>
          <button onClick={signOut} style={{ ...btnG, ...sm, fontSize: 8 }}>Sign Out</button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TowingSection isAdmin={isAdmin} />
      </div>
    </div>
  );
}
