import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { BG, SURF, BRD, TXT, MUT, ACC, RED, btnA, btnG, sm } from './lib/styles';
import TowingSection from './components/towing/TowingSection';
import { ThemeContext } from './lib/ThemeContext';

function normalizePlate(raw) {
  const s = raw.toUpperCase().replace(/\s+/g, '');
  return /^TOW[A-Z0-9]{1,3}$/.test(s) ? s : null;
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
  const [showOrigin,        setShowOrigin]        = useState(false);
  const [companyConfig,     setCompanyConfig]     = useState({ company_name: 'TowBench', accent_color: '#e8670a', logo_url: null });
  const logoClickRef = React.useRef({ count: 0, timer: null });

  const [step,        setStep]       = useState(1);
  const [plate,       setPlate]      = useState('');
  const [truckInfo,   setTruckInfo]  = useState(null);
  const [email,       setEmail]      = useState('');
  const [accessCode,  setAccessCode] = useState('');
  const [driverName,  setDriverName] = useState('');
  const [password,    setPassword]   = useState('');
  const [confirmPwd,  setConfirmPwd] = useState('');
  const [loggingIn,   setLoggingIn]  = useState(false);
  const [loginErr,    setLoginErr]   = useState('');
  const [requesting,  setRequesting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const loadTruck = async (userEmail, welcome = false) => {
    const [truckRes, userRes] = await Promise.all([
      supabase.from('tow_trucks').select('*').eq('auth_email', userEmail).single(),
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
        const greetKey = `towbench_greeted_${session.user.id}`;
        const firstSignIn = event === 'SIGNED_IN' && !sessionStorage.getItem(greetKey);
        if (firstSignIn) sessionStorage.setItem(greetKey, '1');
        loadTruck(session.user.email, firstSignIn);
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
      setLoginErr('Enter your plate in the format TOW followed by letters/numbers (e.g. TOW933).');
      return;
    }
    setLoggingIn(true);
    const { data, error } = await supabase.rpc('get_truck_auth_info', { p_plate: normalized });
    setLoggingIn(false);
    if (error) { setLoginErr('Something went wrong. Try again.'); return; }
    setTruckInfo(data);
    setEmail(data?.email || '');
    setStep(2);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setLoginErr('');
    if (!truckInfo.registered) {
      if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) { setLoginErr('Enter a valid email address.'); return; }
      if (!truckInfo.is_admin && !accessCode.trim())     { setLoginErr('Enter your access code.'); return; }
      if (!driverName.trim())                            { setLoginErr('Please enter your name.'); return; }
      if (password.length < 6)                           { setLoginErr('Password must be at least 6 characters.'); return; }
      if (password !== confirmPwd)                       { setLoginErr('Passwords do not match.'); return; }
    }
    setLoggingIn(true);
    if (truckInfo.registered) {
      const { error } = await supabase.auth.signInWithPassword({ email: truckInfo.email, password });
      if (error) { setLoginErr('Incorrect password.'); setLoggingIn(false); return; }
    } else {
      if (!truckInfo.is_admin) {
        const { data: valid } = await supabase.rpc('validate_invite_code', { p_code: accessCode.trim() });
        if (!valid) { setLoginErr('Invalid or already used access code.'); setLoggingIn(false); return; }
      }
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { driver_name: driverName.trim(), plate: normalizePlate(plate) } },
      });
      if (error) { setLoginErr(error.message); setLoggingIn(false); return; }
      await supabase.rpc('link_plate_to_email', { p_plate: normalizePlate(plate), p_email: email.trim() });
      if (!truckInfo.is_admin) {
        await supabase.rpc('consume_invite_code', { p_code: accessCode.trim(), p_plate: normalizePlate(plate) });
      }
    }
    setLoggingIn(false);
  };

  const handleRequestAccess = async () => {
    const normalized = normalizePlate(plate);
    if (!normalized) return;
    setRequesting(true);
    await supabase.rpc('request_access', { p_plate: normalized });
    setRequesting(false);
    setRequestSent(true);
  };

  const signOut = () => {
    if (session?.user?.id) sessionStorage.removeItem(`towbench_greeted_${session.user.id}`);
    supabase.auth.signOut();
    setStep(1); setPlate(''); setTruckInfo(null);
    setEmail(''); setAccessCode(''); setDriverName(''); setPassword(''); setConfirmPwd(''); setLoginErr('');
    setRequestSent(false); setRequesting(false);
  };

  const isAdmin = truck?.is_admin === true;
  const displayPlate = truck?.plate?.toUpperCase() || session?.user?.user_metadata?.plate?.toUpperCase() || '';

  const THEMES = ['', 'night', 'amber', 'green'];
  const THEME_ICONS  = { '': '◻', night: '🔴', amber: '🟠', green: '🟢' };
  const THEME_LABELS = { '': 'Standard', night: 'Red CRT', amber: 'Amber', green: 'Green' };
  const [theme, setTheme] = useState(() => localStorage.getItem('towbench_theme') || '');
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('towbench_theme', theme);
  }, [theme]);

  // Register service worker for PWA installability
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // Company config: load once + subscribe to realtime changes
  useEffect(() => {
    const applyConfig = cfg => {
      setCompanyConfig(cfg);
      if (cfg.accent_color) document.documentElement.style.setProperty('--acc', cfg.accent_color);
    };
    supabase.from('company_config').select('*').limit(1).single()
      .then(({ data }) => { if (data) applyConfig(data); })
      .catch(() => {});
    const chan = supabase.channel('company_config_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'company_config' },
          payload => { if (payload.new) applyConfig(payload.new); })
      .subscribe();
    return () => supabase.removeChannel(chan);
  }, []);

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
                  onClick={() => { setStep(1); setLoginErr(''); setEmail(''); setAccessCode(''); setPassword(''); setConfirmPwd(''); setDriverName(''); setRequestSent(false); }}
                  style={{ fontSize: 8, color: MUT, background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace" }}>
                  ← change
                </button>
              </div>

              {!truckInfo?.registered ? (
                <>
                  <div style={{ fontSize: 8, color: '#5a8a5a', lineHeight: 1.6 }}>
                    First login — enter your details and choose a password.
                  </div>
                  <div>
                    <div style={labelStyle}>Email</div>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com" required autoFocus style={inputStyle} />
                  </div>
                  {!truckInfo?.is_admin && (
                    <div>
                      <div style={labelStyle}>Access Code</div>
                      <input type="text" value={accessCode}
                        onChange={e => setAccessCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
                        placeholder="XXXXXX" required autoCapitalize="characters"
                        style={{ ...inputStyle, letterSpacing: '0.2em', fontSize: 16 }} />
                      <div style={{ marginTop: 6, fontSize: 8, color: MUT, textAlign: 'right' }}>
                        {requestSent ? (
                          <span style={{ color: '#5a8a5a' }}>✓ Request sent — your admin will share a code with you.</span>
                        ) : (
                          <>
                            Don&apos;t have one?{' '}
                            <button type="button" onClick={handleRequestAccess} disabled={requesting}
                              style={{ background: 'none', border: 'none', color: ACC, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, padding: 0, textDecoration: 'underline', opacity: requesting ? 0.5 : 1 }}>
                              {requesting ? 'Sending…' : 'Request one from admin'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={labelStyle}>Your Name</div>
                    <input type="text" value={driverName} onChange={e => setDriverName(e.target.value)}
                      placeholder="e.g. Alex" required autoCapitalize="words" style={inputStyle} />
                  </div>
                  <div>
                    <div style={labelStyle}>Password</div>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="········" required minLength={6} style={inputStyle} />
                  </div>
                  <div>
                    <div style={labelStyle}>Confirm Password</div>
                    <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                      placeholder="········" required minLength={6} style={inputStyle} />
                  </div>
                </>
              ) : (
                <div>
                  <div style={labelStyle}>Password</div>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="········" required autoFocus minLength={6} style={inputStyle} />
                </div>
              )}

              {loginErr && <div style={{ fontSize: 9, color: RED, lineHeight: 1.5 }}>{loginErr}</div>}
              <button type="submit" disabled={loggingIn}
                style={{ ...btnA, width: '100%', opacity: loggingIn ? 0.5 : 1, marginTop: 4 }}>
                {loggingIn
                  ? (truckInfo?.registered ? 'Signing in…' : 'Creating account…')
                  : (truckInfo?.registered ? 'Sign In' : 'Create Account & Sign In')}
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
        <div
          onClick={() => {
            const ref = logoClickRef.current;
            ref.count += 1;
            clearTimeout(ref.timer);
            if (ref.count >= 5) { ref.count = 0; setShowOrigin(true); }
            else { ref.timer = setTimeout(() => { ref.count = 0; }, 1200); }
          }}
          style={{ fontSize: 15, fontWeight: 700, color: ACC, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'default', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          {companyConfig.logo_url
            ? <img src={companyConfig.logo_url} alt="" style={{ height: 22, borderRadius: 2, objectFit: 'contain' }} />
            : '🚛'}
          {companyConfig.company_name}
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
          <button
            onClick={() => setTheme(t => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length])}
            title={`Theme: ${THEME_LABELS[theme]} — click to cycle`}
            style={{ ...btnG, ...sm, fontSize: 10, padding: '3px 8px', letterSpacing: 0 }}>
            {THEME_ICONS[theme]}
          </button>
          <button onClick={signOut} style={{ ...btnG, ...sm, fontSize: 8 }}>Sign Out</button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ThemeContext.Provider value={theme}>
          <TowingSection isAdmin={isAdmin} userEmail={session?.user?.email} companyConfig={companyConfig} setCompanyConfig={setCompanyConfig} />
        </ThemeContext.Provider>
      </div>

      {showOrigin && (
        <div onClick={() => setShowOrigin(false)}
          style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', borderTop: `2px solid ${ACC}`, borderRadius: 2, padding: '28px 32px', maxWidth: 520, width: '100%', fontFamily: "'IBM Plex Mono',monospace", position: 'relative' }}>
            <div style={{ fontSize: 7, color: ACC, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 18 }}>Origin</div>
            <p style={{ fontSize: 10, color: '#aaa', lineHeight: 1.9, margin: 0 }}>
              TowBench began as a module inside <span style={{ color: TXT }}>RAT BENCH</span> — a small engine workshop management tool built for a different business entirely. During a late night development session in May 2026, a towing allocations feed was wired into RAT BENCH as a convenient place to prototype. One tab became six: live VicRoads tow dispatches, a pager feed, Waze alerts, traffic incidents, fleet management, and a full analytics dashboard with an incident map. It outgrew its host. <span style={{ color: ACC }}>TowBench</span> is what that module became when it was given a name and a home of its own.
            </p>
            <button onClick={() => setShowOrigin(false)}
              style={{ marginTop: 22, fontSize: 8, color: MUT, background: 'none', border: '1px solid #2a2a2a', borderRadius: 2, padding: '4px 10px', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace" }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
