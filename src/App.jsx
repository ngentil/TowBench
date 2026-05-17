import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { BG, SURF, BRD, TXT, MUT, ACC, RED, btnA, btnG, sm } from './lib/styles';
import TowingSection from './components/towing/TowingSection';

export default function App() {
  const [session,     setSession]     = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [driver,      setDriver]      = useState(null);

  const [name,      setName]      = useState('');
  const [daLast4,   setDaLast4]   = useState('');
  const [pin,       setPin]       = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginErr,  setLoginErr]  = useState('');

  const loadDriver = async (email) => {
    const { data } = await supabase
      .from('drivers')
      .select('*')
      .eq('auth_email', email)
      .single();
    setDriver(data || null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthChecked(true);
      if (session) loadDriver(session.user.email);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadDriver(session.user.email);
      else setDriver(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginErr('');
    try {
      const { data: email, error: rpcErr } = await supabase.rpc('get_driver_auth_email', {
        p_name:     name.trim(),
        p_da_last4: daLast4.trim(),
      });
      if (rpcErr || !email) {
        setLoginErr('Driver not found. Check your name and DA number.');
        setLoggingIn(false);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password: pin });
      if (error) setLoginErr(error.message);
    } catch (e) {
      setLoginErr(e.message);
    }
    setLoggingIn(false);
  };

  const signOut = () => supabase.auth.signOut();

  const isAdmin = driver?.role === 'admin';

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

          <form onSubmit={signIn} style={{ background: SURF, border: '1px solid ' + BRD, borderTop: '2px solid ' + ACC, borderRadius: 3, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 9, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Full Name</div>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your full name"
                required
                autoFocus
                style={{ background: '#0a0a0a', border: '1px solid #252525', color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, padding: '8px 10px', borderRadius: 2, width: '100%', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 9, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Last 4 of DA Number</div>
              <input
                type="text"
                value={daLast4}
                onChange={e => setDaLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="e.g. 1234"
                required
                maxLength={4}
                inputMode="numeric"
                style={{ background: '#0a0a0a', border: '1px solid #252525', color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, padding: '8px 10px', borderRadius: 2, width: '100%', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 9, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>6-Digit PIN</div>
              <input
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                required
                maxLength={6}
                inputMode="numeric"
                style={{ background: '#0a0a0a', border: '1px solid #252525', color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, padding: '8px 10px', borderRadius: 2, width: '100%', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            {loginErr && (
              <div style={{ fontSize: 9, color: RED, lineHeight: 1.5 }}>{loginErr}</div>
            )}
            <button type="submit" disabled={loggingIn}
              style={{ ...btnA, width: '100%', opacity: loggingIn ? 0.5 : 1, marginTop: 4 }}>
              {loggingIn ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TXT, fontFamily: "'IBM Plex Mono',monospace", display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: SURF, borderBottom: '2px solid ' + ACC, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: ACC, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          🚛 TowBench
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {driver && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 9, color: MUT }}>
                {driver.name}
                {driver.da_last4 && <span style={{ marginLeft: 4 }}>· DA ···{driver.da_last4}</span>}
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

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TowingSection isAdmin={isAdmin} />
      </div>
    </div>
  );
}
