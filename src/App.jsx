import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { BG, SURF, BRD, TXT, MUT, ACC, btnG, sm } from './lib/styles';
import TowingSection from './components/towing/TowingSection';
import { ThemeContext } from './lib/ThemeContext';
import AuthScreen from './components/auth/AuthScreen';

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


// (legacy multi-role flows removed — single sign-in via AuthScreen)


export default function App() {
  const [session,           setSession]           = useState(null);
  const [authChecked,       setAuthChecked]       = useState(false);
  const [profile,           setProfile]           = useState(null); // user_profiles row
  const [truck,             setTruck]             = useState(null); // tow_trucks row (drivers only)
  const [effectiveCompanyId, setEffectiveCompanyId] = useState(null); // null for super_admin until resolved
  const [companyConfig,     setCompanyConfig]     = useState({ company_name: 'TowBench', accent_color: '#e8670a', logo_url: null });
  const [showGreeting,      setShowGreeting]      = useState(false);
  const [greeting,          setGreeting]          = useState('');
  const [showOrigin,        setShowOrigin]        = useState(false);
  const logoClickRef = React.useRef({ count: 0, timer: null });

  const THEMES = ['', 'night', 'amber', 'green'];
  const THEME_ICONS  = { '': '◻', night: '🔴', amber: '🟠', green: '🟢' };
  const THEME_LABELS = { '': 'Standard', night: 'Red CRT', amber: 'Amber', green: 'Green' };
  const [theme, setTheme] = useState(() => localStorage.getItem('towbench_theme') || '');
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('towbench_theme', theme);
  }, [theme]);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  const loadUserData = async (userId, userEmail, welcome = false) => {
    const [profileRes, truckRes] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('tow_trucks').select('*').eq('auth_email', userEmail).maybeSingle(),
    ]);
    const prof = profileRes.data || null;
    const tr   = truckRes.data || null;
    setProfile(prof);
    setTruck(tr);
    if (welcome) {
      const name = tr?.first_name || tr?.driver_name || userEmail.split('@')[0];
      setGreeting(getGreeting(name));
      setShowGreeting(true);
      setTimeout(() => setShowGreeting(false), 3500);
    }
  };

  useEffect(() => {
    // Timeout so a hanging Supabase call never leaves the user on the loading screen
    const timeout = setTimeout(() => setAuthChecked(true), 5000);
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      clearTimeout(timeout);
      if (error) console.error('getSession error:', error);
      setSession(session);
      setAuthChecked(true);
      if (session) loadUserData(session.user.id, session.user.email, false);
    }).catch(e => { clearTimeout(timeout); console.error('getSession threw:', e); setAuthChecked(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        const greetKey = `towbench_greeted_${session.user.id}`;
        const firstSignIn = event === 'SIGNED_IN' && !sessionStorage.getItem(greetKey);
        if (firstSignIn) sessionStorage.setItem(greetKey, '1');
        loadUserData(session.user.id, session.user.email, firstSignIn);
        if (event === 'SIGNED_IN') requestGPS();
      } else {
        setProfile(null);
        setTruck(null);
      }
    });
    return () => { clearTimeout(timeout); subscription.unsubscribe(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Company config: load by company_id once profile is known, subscribe to changes.
  // super_admin has company_id = null — fall back to the first company in the DB.
  useEffect(() => {
    if (!profile) return;
    const applyConfig = cfg => {
      setCompanyConfig(cfg);
      if (cfg.accent_color) document.documentElement.style.setProperty('--acc', cfg.accent_color);
    };
    const setup = async (cid) => {
      setEffectiveCompanyId(cid);
      const { data } = await supabase.from('company_config').select('*').eq('company_id', cid).single();
      if (data) applyConfig(data);
      const chan = supabase.channel('company_config_changes_' + cid)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'company_config',
            filter: `company_id=eq.${cid}` },
            payload => { if (payload.new) applyConfig(payload.new); })
        .subscribe();
      return () => supabase.removeChannel(chan);
    };
    if (profile.company_id) {
      setup(profile.company_id);
    } else {
      // No company on profile (super_admin or admin before company created) —
      // fall back to the first company in the DB.
      supabase.from('companies').select('id').order('created_at').limit(1).maybeSingle()
        .then(({ data }) => { if (data?.id) setup(data.id); });
    }
  }, [profile?.company_id, profile?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = () => {
    if (session?.user?.id) sessionStorage.removeItem(`towbench_greeted_${session.user.id}`);
    supabase.auth.signOut();
    setProfile(null); setTruck(null);
  };

  const role        = profile?.role || 'driver';
  const isAdmin     = true;
  const isDispatch  = true;
  const displayName = session?.user?.email?.split('@')[0] || '';
  const displayPlate = truck?.plate?.toUpperCase() || '';

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
    return <AuthScreen />;
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
          {displayPlate && (
            <div style={{ fontSize: 9, color: MUT, marginTop: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              {displayPlate}{isAdmin ? ' · Admin' : isDispatch ? ' · Dispatch' : ''}
            </div>
          )}
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
            {displayPlate && <span style={{ fontSize: 10, color: TXT, fontWeight: 700, letterSpacing: '0.12em' }}>{displayPlate}</span>}
            {displayName && <span style={{ fontSize: 9, color: MUT }}>· {displayName}</span>}
            {role && (
              <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px',
                border: `1px solid ${ACC}55`, borderRadius: 2, color: ACC, background: ACC + '15', textTransform: 'uppercase' }}>
                {role === 'super_admin' ? 'Super Admin' : role}
              </span>
            )}
          </div>
          <button onClick={() => setTheme(t => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length])}
            title={`Theme: ${THEME_LABELS[theme]} — click to cycle`}
            style={{ ...btnG, ...sm, fontSize: 10, padding: '3px 8px', letterSpacing: 0 }}>
            {THEME_ICONS[theme]}
          </button>
          <button onClick={signOut} style={{ ...btnG, ...sm, fontSize: 8 }}>Sign Out</button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ThemeContext.Provider value={theme}>
          <TowingSection
            role={role} isAdmin={isAdmin} isDispatch={isDispatch}
            userEmail={session?.user?.email}
            companyId={effectiveCompanyId}
            companyConfig={companyConfig} setCompanyConfig={setCompanyConfig}
            profile={profile} setProfile={setProfile}
          />
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
