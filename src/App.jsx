import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import { BG, SURF, BRD, TXT, MUT, ACC, btnG, sm } from './lib/styles';
import TowingSection from './components/towing/TowingSection';
import { ThemeContext } from './lib/ThemeContext';
import AuthScreen from './components/auth/AuthScreen';
import OnboardingScreen from './components/auth/OnboardingScreen';

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
  const [profileChecked,    setProfileChecked]    = useState(false);
  const [profile,           setProfile]           = useState(null); // user_profiles row
  const [truck,             setTruck]             = useState(null); // tow_trucks row (drivers only)
  const [effectiveCompanyId, setEffectiveCompanyId] = useState(null); // null for super_admin until resolved
  const [companyConfig,     setCompanyConfig]     = useState({ company_name: 'TowBench', accent_color: '#e8670a', logo_url: null });
  const [showGreeting,      setShowGreeting]      = useState(false);
  const [greeting,          setGreeting]          = useState('');
  const [showOrigin,        setShowOrigin]        = useState(false);
  const logoClickRef = React.useRef({ count: 0, timer: null });

  const THEMES = ['', 'night', 'amber', 'green'];
  const THEME_COLORS = { '': '#5a5a5a', night: '#c94040', amber: '#e8870a', green: '#3d9e50' };
  const THEME_LABELS = { '': 'Standard', night: 'Red CRT', amber: 'Amber', green: 'Green' };
  const [theme, setTheme] = useState(() => localStorage.getItem('towbench_theme') || '');
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const themePickerRef = useRef(null);
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('towbench_theme', theme);
  }, [theme]);
  useEffect(() => {
    if (!themePickerOpen) return;
    const close = e => { if (themePickerRef.current && !themePickerRef.current.contains(e.target)) setThemePickerOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [themePickerOpen]);

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
    setProfileChecked(true);
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
        setProfileChecked(false);
      }
    });
    return () => { clearTimeout(timeout); subscription.unsubscribe(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // User config: load by auth.uid() — each user has their own isolated row.
  useEffect(() => {
    if (!session) return;
    const uid = session.user.id;
    // effectiveCompanyId stays as profile.company_id for legacy FK compat,
    // but company_config is now indexed by user_id
    if (profile?.company_id) setEffectiveCompanyId(profile.company_id);
    const applyConfig = cfg => {
      setCompanyConfig(cfg);
      if (cfg.accent_color) document.documentElement.style.setProperty('--acc', cfg.accent_color);
    };
    supabase.from('company_config').select('*').eq('user_id', uid).maybeSingle()
      .then(({ data }) => { if (data) applyConfig(data); });
    const chan = supabase.channel('user_config_' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'company_config',
          filter: `user_id=eq.${uid}` },
          payload => { if (payload.new) applyConfig(payload.new); })
      .subscribe();
    return () => supabase.removeChannel(chan);
  }, [session?.user?.id, profile?.company_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = () => {
    if (session?.user?.id) sessionStorage.removeItem(`towbench_greeted_${session.user.id}`);
    supabase.auth.signOut();
    setProfile(null); setTruck(null);
  };

  const role          = profile?.role || 'driver';
  const isAdmin       = true;
  const isDispatch    = true;
  const displayPlate  = truck?.plate?.toUpperCase() || '';
  const displayFullName = [truck?.first_name, truck?.last_name].filter(Boolean).join(' ') || session?.user?.email?.split('@')[0] || '';
  const displayDA     = truck?.da_number || null;

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

  if (!profileChecked) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 10, color: MUT, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          Loading…
        </div>
      </div>
    );
  }

  if (!truck) {
    return (
      <OnboardingScreen
        session={session}
        onComplete={() => loadUserData(session.user.id, session.user.email, false)}
      />
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
          {/* Identity block */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {displayFullName && (
                <span style={{ fontSize: 10, fontWeight: 700, color: TXT, letterSpacing: '0.04em' }}>{displayFullName}</span>
              )}
              {displayDA && (
                <span style={{ fontSize: 8, color: MUT, letterSpacing: '0.06em' }}>DA {displayDA}</span>
              )}
            </div>
            {displayPlate && (
              <span style={{ fontSize: 8, fontWeight: 700, color: ACC, letterSpacing: '0.14em',
                border: `1px solid ${ACC}55`, borderRadius: 2, padding: '1px 5px', background: ACC + '12' }}>
                {displayPlate}
              </span>
            )}
          </div>
          <div style={{ position: 'relative' }} ref={themePickerRef}>
            <button onClick={() => setThemePickerOpen(o => !o)} title="Theme"
              style={{ width: 26, height: 26, borderRadius: '50%', padding: 0, cursor: 'pointer', flexShrink: 0,
                background: THEME_COLORS[theme],
                border: `2px solid ${THEME_COLORS[theme]}`,
                boxShadow: themePickerOpen ? `0 0 0 3px ${THEME_COLORS[theme]}44` : 'none',
                transition: 'box-shadow 0.15s ease' }} />
            {themePickerOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 200,
                background: '#111', border: '1px solid #2a2a2a', borderRadius: 4,
                padding: 6, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 130,
                boxShadow: '0 8px 24px #00000088' }}>
                {THEMES.map(t => {
                  const active = t === theme;
                  const c = THEME_COLORS[t];
                  return (
                    <button key={t} onClick={() => { setTheme(t); setThemePickerOpen(false); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px',
                        background: active ? c + '1a' : 'none', border: 'none', borderRadius: 3,
                        cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                        background: c, boxShadow: active ? `0 0 0 2px ${c}55` : 'none' }} />
                      <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono',monospace",
                        fontWeight: active ? 700 : 400, letterSpacing: '0.09em', textTransform: 'uppercase',
                        color: active ? c : '#555' }}>
                        {THEME_LABELS[t]}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button onClick={signOut} style={{ ...btnG, ...sm, fontSize: 8 }}>Sign Out</button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ThemeContext.Provider value={theme}>
          <TowingSection
            role={role} isAdmin={isAdmin} isDispatch={isDispatch}
            userEmail={session?.user?.email}
            userId={session?.user?.id}
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
