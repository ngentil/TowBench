import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, BRD, SURF, BG, TXT, GRN, RED, inp, btnA, btnG, sm } from '../../lib/styles';

export default function AuthScreen() {
  const [mode,        setMode]        = useState('login'); // login | signup | forgot
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [message,     setMessage]     = useState('');
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [otp,         setOtp]         = useState('');
  const [showPwd,     setShowPwd]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const reset = e => { if (e.persisted) setLoading(false); };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  const handleSubmit = async e => {
    e?.preventDefault();
    setLoading(true); setError(''); setMessage('');

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);

    } else if (mode === 'signup') {
      if (password.length < 6) { setError('Password must be at least 6 characters.'); setLoading(false); return; }
      if (password !== confirm) { setError("Passwords don't match."); setLoading(false); return; }
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) { setError(error.message); }
      else { setAwaitingOtp(true); setMessage('Check your email for an 8-digit confirmation code.'); }

    } else if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      if (error) setError(error.message);
      else setMessage('Password reset link sent — check your email.');
    }

    setLoading(false);
  };

  const handleOtp = async e => {
    e?.preventDefault();
    setLoading(true); setError('');
    const { error } = await supabase.auth.verifyOtp({ email, token: otp.trim(), type: 'signup' });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', fontFamily: "'IBM Plex Mono',monospace" }}>

      {/* Left panel (desktop) */}
      <div style={{ flex: 1, background: '#111', borderRight: '1px solid #1e1e1e', padding: '60px 48px',
        flexDirection: 'column', justifyContent: 'center', display: 'none' }} className="auth-left">
        <div style={{ fontSize: 28, marginBottom: 16 }}>🚛</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: ACC, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>TowBench</div>
        <div style={{ fontSize: 10, color: MUT, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 40 }}>Tow Fleet &amp; Allocation Management</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {['Live VicRoads tow allocations', 'Fleet tracking & dispatch', 'Route trace with pricing'].map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 10, color: '#666' }}>
              <span style={{ color: ACC, flexShrink: 0 }}>✓</span>{f}
            </div>
          ))}
        </div>
      </div>

      {/* Right — form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>

          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🚛</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: ACC, letterSpacing: '0.06em', textTransform: 'uppercase' }}>TowBench</div>
            <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 4 }}>Tow Fleet &amp; Allocation Management</div>
          </div>

          <div style={{ background: SURF, border: '1px solid ' + BRD, borderTop: '2px solid ' + ACC, borderRadius: 3, padding: 24 }}>

            {awaitingOtp ? (
              /* OTP verification step */
              <form onSubmit={handleOtp} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Confirm your email
                </div>
                <div style={{ fontSize: 10, color: TXT, lineHeight: 1.6, marginBottom: 4 }}>
                  Enter the 8-digit code sent to <span style={{ color: ACC }}>{email}</span>
                </div>
                <input
                  style={{ ...inp, fontSize: 22, letterSpacing: '0.25em', textAlign: 'center' }}
                  type="text" inputMode="numeric" placeholder="12345678"
                  maxLength={8} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  autoFocus required
                />
                {error   && <div style={{ background: RED + '12', border: '1px solid ' + RED + '44', color: RED, fontSize: 10, padding: '8px 12px', borderRadius: 2, lineHeight: 1.5 }}>{error}</div>}
                {message && <div style={{ background: GRN + '12', border: '1px solid ' + GRN + '44', color: GRN, fontSize: 10, padding: '8px 12px', borderRadius: 2, lineHeight: 1.5 }}>{message}</div>}
                <button type="submit" disabled={loading || otp.length < 6}
                  style={{ ...btnA, width: '100%', marginTop: 6, padding: '11px 0', fontSize: 10, letterSpacing: '0.1em', opacity: (loading || otp.length < 6) ? 0.4 : 1 }}>
                  {loading ? 'Verifying…' : 'Confirm Code'}
                </button>
                <button type="button" onClick={() => { setAwaitingOtp(false); setOtp(''); setError(''); setMessage(''); }}
                  style={{ background: 'none', border: 'none', color: MUT, fontSize: 9, cursor: 'pointer',
                    letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace", marginTop: 4 }}>
                  ← Back
                </button>
              </form>
            ) : (
              <>
            {/* Tabs */}
            {mode !== 'forgot' && (
              <div style={{ display: 'flex', borderRadius: 2, overflow: 'hidden', border: '1px solid ' + BRD, marginBottom: 20 }}>
                {[['login', 'Sign In'], ['signup', 'Create Account']].map(([m, label]) => (
                  <button key={m} onClick={() => { setMode(m); setError(''); setMessage(''); }}
                    style={{ flex: 1, padding: '9px 0', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                      fontFamily: "'IBM Plex Mono',monospace", cursor: 'pointer', border: 'none',
                      background: mode === m ? ACC : 'transparent', color: mode === m ? '#fff' : MUT }}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Email</div>
                <input style={inp} type="email" placeholder="you@example.com" value={email}
                  onChange={e => setEmail(e.target.value)} autoFocus required />
              </div>
              {mode !== 'forgot' && (
                <div>
                  <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Password</div>
                  <div style={{ position: 'relative' }}>
                    <input style={{ ...inp, paddingRight: 36 }} type={showPwd ? 'text' : 'password'}
                      placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: MUT, fontSize: 14, padding: 2, lineHeight: 1 }}>
                      {showPwd ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>
              )}
              {mode === 'signup' && (
                <div>
                  <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Confirm Password</div>
                  <div style={{ position: 'relative' }}>
                    <input style={{ ...inp, paddingRight: 36 }} type={showConfirm ? 'text' : 'password'}
                      placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} required />
                    <button type="button" onClick={() => setShowConfirm(v => !v)}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: MUT, fontSize: 14, padding: 2, lineHeight: 1 }}>
                      {showConfirm ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>
              )}

              {error   && <div style={{ background: RED + '12', border: '1px solid ' + RED + '44', color: RED, fontSize: 10, padding: '8px 12px', borderRadius: 2, lineHeight: 1.5 }}>{error}</div>}
              {message && <div style={{ background: GRN + '12', border: '1px solid ' + GRN + '44', color: GRN, fontSize: 10, padding: '8px 12px', borderRadius: 2, lineHeight: 1.5 }}>{message}</div>}

              <button type="submit" disabled={loading}
                style={{ ...btnA, width: '100%', marginTop: 6, padding: '11px 0', fontSize: 10, letterSpacing: '0.1em', opacity: loading ? 0.4 : 1 }}>
                {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
              </button>
            </form>

            {mode === 'login' && (
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button onClick={() => { setMode('forgot'); setError(''); setMessage(''); }}
                  style={{ background: 'none', border: 'none', color: MUT, fontSize: 9, cursor: 'pointer',
                    letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace" }}>
                  Forgot password?
                </button>
              </div>
            )}
            {mode === 'forgot' && (
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button onClick={() => { setMode('login'); setError(''); setMessage(''); }}
                  style={{ background: 'none', border: 'none', color: MUT, fontSize: 9, cursor: 'pointer',
                    letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace" }}>
                  ← Back to sign in
                </button>
              </div>
            )}
              </>
            )}
          </div>

          <div style={{ fontSize: 8, color: MUT, textAlign: 'center', marginTop: 24 }}>towbench.com</div>
        </div>
      </div>
    </div>
  );
}
