import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, BRD, SURF, BG, TXT, GRN, RED, inp, btnA, btnG, sm } from '../../lib/styles';
import { checkUsernameAvailable, generateAvailableUsername } from '../../lib/username';

export default function AuthScreen() {
  const [mode,            setMode]            = useState('login'); // login | signup | forgot | verify
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username,        setUsername]        = useState('');
  const [availability,    setAvailability]    = useState(null);
  const [generating,      setGenerating]      = useState(false);
  const [otp,             setOtp]             = useState(['','','','','','']);
  const checkRef = useRef(0);
  const otpRefs  = [useRef(),useRef(),useRef(),useRef(),useRef(),useRef()];
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [message, setMessage] = useState('');
  const [agreed,  setAgreed]  = useState(false);

  // Reset loading if browser restores page from bfcache after OAuth redirect
  useEffect(() => {
    const reset = e => { if (e.persisted) setLoading(false); };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  // Debounced username availability check
  useEffect(() => {
    if (mode !== 'signup') return;
    const val = username.trim().toLowerCase();
    if (!val || !/^[a-zA-Z0-9_]{3,20}$/.test(val)) { setAvailability(null); return; }
    setAvailability('checking');
    const id = ++checkRef.current;
    const t = setTimeout(async () => {
      const ok = await checkUsernameAvailable(val);
      if (checkRef.current === id) setAvailability(ok ? 'available' : 'taken');
    }, 400);
    return () => clearTimeout(t);
  }, [username, mode]);

  const handleGenerate = async () => {
    setGenerating(true);
    const name = await generateAvailableUsername();
    setUsername(name);
    setGenerating(false);
  };

  const handleGoogle = async () => {
    setLoading(true); setError('');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) { setError(error.message); setLoading(false); }
  };

  const handleSubmit = async () => {
    setLoading(true); setError(''); setMessage('');
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else if (mode === 'signup') {
      if (!agreed) { setError('You must agree to the Terms, Privacy Policy and Data Retention policy.'); setLoading(false); return; }
      if (!username.trim()) { setError('Username is required.'); setLoading(false); return; }
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) { setError('Username must be 3–20 characters, letters/numbers/underscores only.'); setLoading(false); return; }
      if (availability === 'taken') { setError('That username is already taken — try another.'); setLoading(false); return; }
      if (availability === 'checking') { setError('Still checking username — wait a moment.'); setLoading(false); return; }
      if (password.length < 8) { setError('Password must be at least 8 characters.'); setLoading(false); return; }
      if (password !== confirmPassword) { setError("Passwords don't match."); setLoading(false); return; }
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { username: username.trim().toLowerCase() } } });
      if (error) setError(error.message);
      else { setMode('verify'); setTimeout(() => otpRefs[0].current?.focus(), 100); }
    } else if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      if (error) setError(error.message);
      else setMessage('Password reset link sent — check your email.');
    }
    setLoading(false);
  };

  const handleOtpChange = (i, val) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next  = [...otp]; next[i] = digit; setOtp(next);
    if (digit && i < 5) otpRefs[i + 1].current?.focus();
    if (next.every(d => d)) verifyOtp(next.join(''));
  };

  const handleOtpKey = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs[i - 1].current?.focus();
  };

  const verifyOtp = async (token) => {
    setLoading(true); setError('');
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    if (error) { setError(error.message); setOtp(['','','','','','']); otpRefs[0].current?.focus(); }
    setLoading(false);
  };

  if (mode === 'verify') return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'IBM Plex Mono',monospace" }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🚛</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: ACC, letterSpacing: '0.06em', textTransform: 'uppercase' }}>TowBench</div>
        </div>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderTop: '2px solid ' + ACC, borderRadius: 3, padding: 24 }}>
          <div style={{ fontSize: 11, color: TXT, fontWeight: 700, marginBottom: 6 }}>Check your email</div>
          <div style={{ fontSize: 9, color: MUT, marginBottom: 24, lineHeight: 1.7 }}>
            We sent a 6-digit code to <span style={{ color: TXT }}>{email}</span>. Enter it below to confirm your account.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
            {otp.map((d, i) => (
              <input key={i} ref={otpRefs[i]} value={d}
                onChange={e => handleOtpChange(i, e.target.value)}
                onKeyDown={e => handleOtpKey(i, e)}
                onFocus={e => e.target.select()}
                maxLength={1} inputMode="numeric"
                style={{ width: 44, height: 52, textAlign: 'center', fontSize: 22, fontWeight: 700,
                  background: '#0d0d0d', border: '1px solid ' + (d ? ACC : BRD), borderRadius: 2,
                  color: ACC, fontFamily: "'IBM Plex Mono',monospace", outline: 'none', caretColor: ACC }} />
            ))}
          </div>
          {error && <div style={{ background: RED + '12', border: '1px solid ' + RED + '44', color: RED, fontSize: 10, padding: '8px 12px', borderRadius: 2, marginBottom: 12, lineHeight: 1.5 }}>{error}</div>}
          <button onClick={() => verifyOtp(otp.join(''))} disabled={loading || otp.some(d => !d)}
            style={{ ...btnA, width: '100%', padding: '11px 0', fontSize: 10, letterSpacing: '0.1em', opacity: (loading || otp.some(d => !d)) ? 0.4 : 1 }}>
            {loading ? 'Verifying…' : 'Confirm Account'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <button onClick={() => { setMode('signup'); setOtp(['','','','','','']); setError(''); }}
              style={{ background: 'none', border: 'none', color: MUT, fontSize: 9, cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace" }}>
              ← Back
            </button>
          </div>
        </div>
        <div style={{ fontSize: 8, color: MUT, textAlign: 'center', marginTop: 24 }}>towbench.com</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', fontFamily: "'IBM Plex Mono',monospace" }}>

      {/* Left — pitch panel (desktop) */}
      <div style={{ flex: 1, background: '#111', borderRight: '1px solid #1e1e1e', padding: '60px 48px', flexDirection: 'column', justifyContent: 'center', display: 'none' }} className="auth-left">
        <div style={{ fontSize: 28, marginBottom: 16 }}>🚛</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: ACC, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, lineHeight: 1.3 }}>TowBench</div>
        <div style={{ fontSize: 10, color: MUT, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 40 }}>Tow Fleet &amp; Allocation Management</div>
        <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {['Live VicRoads tow allocations', 'Fleet tracking &amp; dispatch', 'Route trace with pricing'].map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 10, color: '#666' }}>
              <span style={{ color: ACC, flexShrink: 0 }}>✓</span>{f}
            </div>
          ))}
        </div>
      </div>

      {/* Right — auth form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>

          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🚛</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: ACC, letterSpacing: '0.06em', textTransform: 'uppercase' }}>TowBench</div>
            <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 4 }}>Tow Fleet &amp; Allocation Management</div>
          </div>

          {/* Card */}
          <div style={{ background: SURF, border: '1px solid ' + BRD, borderTop: '2px solid ' + ACC, borderRadius: 3, padding: 24 }}>

            {/* Mode tabs */}
            <div style={{ display: 'flex', borderRadius: 2, overflow: 'hidden', border: '1px solid ' + BRD, marginBottom: 20 }}>
              {['login', 'signup'].map(m => (
                <button key={m} onClick={() => { setMode(m); setError(''); setMessage(''); }}
                  style={{ flex: 1, padding: '9px 0', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                    fontFamily: "'IBM Plex Mono',monospace", cursor: 'pointer', border: 'none',
                    background: mode === m ? ACC : 'transparent', color: mode === m ? '#fff' : MUT, transition: 'background 0.15s' }}>
                  {m === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>

            {/* Google OAuth */}
            {mode !== 'forgot' && (
              <button onClick={handleGoogle} disabled={loading}
                style={{ width: '100%', padding: '10px 0', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  fontFamily: "'IBM Plex Mono',monospace", cursor: 'pointer', border: '1px solid ' + BRD, borderRadius: 2,
                  background: 'transparent', color: TXT, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: loading ? 0.6 : 1 }}>
                <span style={{ fontFamily: 'serif', fontSize: 15, fontWeight: 700 }}>G</span> Continue with Google
              </button>
            )}

            {/* Divider */}
            {mode !== 'forgot' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1, height: 1, background: BRD }} />
                <span style={{ fontSize: 9, color: MUT, letterSpacing: '0.1em' }}>OR</span>
                <div style={{ flex: 1, height: 1, background: BRD }} />
              </div>
            )}

            {/* Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mode === 'signup' && (
                <div>
                  <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Username</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input style={{ ...inp, flex: 1 }} placeholder="e.g. turbo_wrecker_42" value={username}
                      onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} />
                    {availability === 'available' && <span style={{ fontSize: 16, color: GRN, fontWeight: 900, lineHeight: 1, textShadow: '0 0 8px ' + GRN, flexShrink: 0 }}>✓</span>}
                    {availability === 'taken'     && <span style={{ fontSize: 16, color: RED, fontWeight: 900, lineHeight: 1, flexShrink: 0 }}>✗</span>}
                    {availability === 'checking'  && <span style={{ fontSize: 10, color: MUT, flexShrink: 0 }}>…</span>}
                    <button type="button" onClick={handleGenerate} disabled={generating}
                      style={{ ...btnG, ...sm, flexShrink: 0, opacity: generating ? 0.5 : 1 }} title="Generate random name">
                      {generating ? '…' : '🎲'}
                    </button>
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Email</div>
                <input style={inp} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              {mode !== 'forgot' && (
                <div>
                  <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Password</div>
                  <input style={inp} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
                </div>
              )}
              {mode === 'signup' && (
                <div>
                  <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Confirm Password</div>
                  <input style={inp} type="password" placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
                </div>
              )}
            </div>

            {mode === 'signup' && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                  style={{ marginTop: 2, accentColor: ACC, flexShrink: 0 }} />
                <span style={{ fontSize: 8, color: agreed ? TXT : MUT, lineHeight: 1.7 }}>
                  I agree to the{' '}
                  <a href="/terms" onClick={e => e.stopPropagation()} style={{ color: ACC, textDecoration: 'underline', fontFamily: "'IBM Plex Mono',monospace", fontSize: 8 }}>Terms of Service</a>,{' '}
                  <a href="/privacy" onClick={e => e.stopPropagation()} style={{ color: ACC, textDecoration: 'underline', fontFamily: "'IBM Plex Mono',monospace", fontSize: 8 }}>Privacy Policy</a>{' '}
                  and{' '}
                  <a href="/data-retention" onClick={e => e.stopPropagation()} style={{ color: ACC, textDecoration: 'underline', fontFamily: "'IBM Plex Mono',monospace", fontSize: 8 }}>Data Retention Policy</a>.
                  <span style={{ color: MUT, display: 'block', marginTop: 4 }}>
                    TowBench collects and retains operational data including job history, location, fleet and dispatch activity. This data may be used to improve the platform.
                  </span>
                </span>
              </label>
            )}

            {error   && <div style={{ background: RED + '12', border: '1px solid ' + RED + '44', color: RED, fontSize: 10, padding: '8px 12px', borderRadius: 2, marginTop: 12, lineHeight: 1.5 }}>{error}</div>}
            {message && <div style={{ background: GRN + '12', border: '1px solid ' + GRN + '44', color: GRN, fontSize: 10, padding: '8px 12px', borderRadius: 2, marginTop: 12, lineHeight: 1.5 }}>{message}</div>}

            <button onClick={handleSubmit} disabled={loading || (mode === 'signup' && !agreed)}
              style={{ ...btnA, width: '100%', marginTop: 16, padding: '11px 0', fontSize: 10, opacity: (loading || (mode === 'signup' && !agreed)) ? 0.4 : 1, letterSpacing: '0.1em' }}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
            </button>

            {mode === 'login' && (
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button onClick={() => { setMode('forgot'); setError(''); setMessage(''); }}
                  style={{ background: 'none', border: 'none', color: MUT, fontSize: 9, cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace" }}>
                  Forgot password?
                </button>
              </div>
            )}
            {mode === 'forgot' && (
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button onClick={() => setMode('login')}
                  style={{ background: 'none', border: 'none', color: MUT, fontSize: 9, cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace" }}>
                  ← Back to sign in
                </button>
              </div>
            )}

          </div>

          <div style={{ fontSize: 8, color: MUT, textAlign: 'center', marginTop: 24, lineHeight: 2.4 }}>
            towbench.com
            {[['Terms', '/terms'], ['Privacy', '/privacy'], ['Data Retention', '/data-retention']].map(([label, href]) => (
              <React.Fragment key={href}>
                <span style={{ margin: '0 6px' }}>·</span>
                <a href={href} style={{ color: MUT, fontSize: 8, fontFamily: "'IBM Plex Mono',monospace", textDecoration: 'underline' }}>{label}</a>
              </React.Fragment>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
