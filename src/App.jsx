import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { BG, SURF, BRD, TXT, MUT, ACC, RED, GRN, btnA, btnG, sm } from './lib/styles';
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

const inputStyle = {
  background: '#0a0a0a', border: '1px solid #252525', color: TXT,
  fontFamily: "'IBM Plex Mono',monospace", fontSize: 14,
  padding: '9px 10px', borderRadius: 2, width: '100%', outline: 'none', boxSizing: 'border-box',
};
const labelStyle = { fontSize: 9, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 };
const formStyle  = {
  background: SURF, border: '1px solid ' + BRD, borderTop: '2px solid ' + ACC,
  borderRadius: 3, padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
};

// ── Driver login / signup ────────────────────────────────────────────────────

function DriverFlow({ onSuccess }) {
  const [step,        setStep]        = useState(1); // 1=plate, 2=password or signup
  const [plate,       setPlate]       = useState('');
  const [truckInfo,   setTruckInfo]   = useState(null); // from get_truck_by_plate
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirmPwd,  setConfirmPwd]  = useState('');
  const [accessCode,  setAccessCode]  = useState('');
  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [daNumber,    setDaNumber]    = useState('');
  const [address,     setAddress]     = useState('');
  const [licenceFile, setLicenceFile] = useState(null);
  const [licencePreview, setLicencePreview] = useState(null);
  const [signupStep,  setSignupStep]  = useState(1); // 1=photo, 2=da+name, 3=code+email+pw
  const [busy,        setBusy]        = useState(false);
  const [err,         setErr]         = useState('');
  const [requestSent, setRequestSent] = useState(false);

  const normPlate = p => p.toUpperCase().replace(/\s+/g, '');

  const handlePlateSubmit = async e => {
    e.preventDefault();
    setErr('');
    if (!plate.trim()) { setErr('Enter your truck plate.'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('get_truck_by_plate', { p_plate: normPlate(plate) });
    setBusy(false);
    if (error) { setErr('Something went wrong. Try again.'); return; }
    if (!data) { setErr('Plate not found in the fleet. Contact your dispatcher.'); return; }
    setTruckInfo(data);
    setEmail(data.email || '');
    setStep(2);
  };

  const handleSignIn = async e => {
    e.preventDefault();
    setErr('');
    if (!password) { setErr('Enter your password.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: truckInfo.email, password });
    setBusy(false);
    if (error) { setErr('Incorrect password.'); return; }
    onSuccess();
  };

  const handleSignupNext = async () => {
    setErr('');
    if (signupStep === 1) {
      if (!licenceFile) { setErr('Please upload a photo of your towing licence.'); return; }
      setSignupStep(2);
    } else if (signupStep === 2) {
      if (!firstName.trim()) { setErr('Enter your first name.'); return; }
      if (!lastName.trim())  { setErr('Enter your last name.'); return; }
      if (!daNumber.trim())  { setErr('Enter your full DA number.'); return; }
      setSignupStep(3);
    }
  };

  const handleSignupSubmit = async e => {
    e.preventDefault();
    setErr('');
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) { setErr('Enter a valid email address.'); return; }
    if (password.length < 6)                           { setErr('Password must be at least 6 characters.'); return; }
    if (password !== confirmPwd)                       { setErr('Passwords do not match.'); return; }

    setBusy(true);

    // Invite code is optional — validate only if supplied
    let codeRow = null;
    if (accessCode.trim()) {
      const { data: codeRows } = await supabase.rpc('validate_invite_code', { p_code: accessCode.trim() });
      codeRow = Array.isArray(codeRows) ? codeRows[0] : codeRows;
      if (!codeRow?.valid) { setErr('Invalid or already used access code.'); setBusy(false); return; }
    }

    const companyId = codeRow?.company_id || truckInfo.company_id;

    // Create auth account
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { plate: normPlate(plate), first_name: firstName.trim(), last_name: lastName.trim() } },
    });
    if (authErr) { setErr(authErr.message); setBusy(false); return; }

    const userId = authData.user?.id;

    // Upload licence photo
    let licenceUrl = null;
    if (licenceFile && userId) {
      const ext = licenceFile.name.split('.').pop();
      const path = `${userId}/licence.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('licence-photos')
        .upload(path, licenceFile, { upsert: true });
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('licence-photos').getPublicUrl(path);
        licenceUrl = urlData?.publicUrl || null;
      }
    }

    // Link email to truck + set driver fields
    await supabase.rpc('link_plate_to_email', { p_plate: normPlate(plate), p_email: email.trim() });
    await supabase.from('tow_trucks').update({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      da_number: daNumber.trim(),
      licence_address: address.trim() || null,
      licence_photo_url: licenceUrl,
      approved: false,
    }).eq('auth_email', email.trim().toLowerCase());

    // Create user_profile as driver
    if (userId) {
      await supabase.from('user_profiles').insert({
        id: userId,
        company_id: companyId,
        role: 'driver',
      });
    }

    // Consume code only if one was provided
    if (accessCode.trim() && codeRow) {
      await supabase.rpc('consume_invite_code', { p_code: accessCode.trim(), p_used_by: normPlate(plate) });
    }

    setBusy(false);
    onSuccess();
  };

  const handleRequestAccess = async () => {
    if (!plate.trim()) return;
    setBusy(true);
    await supabase.rpc('request_access', { p_plate: normPlate(plate) }).catch(() => {});
    setBusy(false);
    setRequestSent(true);
  };

  const goBack = () => {
    setStep(1); setErr(''); setEmail(''); setPassword(''); setConfirmPwd('');
    setAccessCode(''); setFirstName(''); setLastName(''); setDaNumber(''); setAddress('');
    setLicenceFile(null); setLicencePreview(null); setSignupStep(1); setTruckInfo(null); setRequestSent(false);
  };

  if (step === 1) {
    return (
      <form onSubmit={handlePlateSubmit} style={formStyle}>
        <div>
          <div style={labelStyle}>Truck Number Plate</div>
          <input type="text" value={plate} onChange={e => setPlate(e.target.value.toUpperCase())}
            placeholder="e.g. TOW933 or 1AB2CD" required autoFocus autoCapitalize="characters"
            style={{ ...inputStyle, fontSize: 18, letterSpacing: '0.18em', textTransform: 'uppercase' }} />
        </div>
        {err && <div style={{ fontSize: 9, color: RED, lineHeight: 1.5 }}>{err}</div>}
        <button type="submit" disabled={busy}
          style={{ ...btnA, width: '100%', opacity: busy ? 0.5 : 1, marginTop: 4 }}>
          {busy ? 'Checking…' : 'Continue →'}
        </button>
      </form>
    );
  }

  // Step 2: existing user → sign in
  if (truckInfo?.registered) {
    return (
      <form onSubmit={handleSignIn} style={formStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: ACC, fontWeight: 700, letterSpacing: '0.14em' }}>{normPlate(plate)}</span>
          <button type="button" onClick={goBack}
            style={{ fontSize: 8, color: MUT, background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace" }}>
            ← change
          </button>
        </div>
        <div>
          <div style={labelStyle}>Password</div>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="········" required autoFocus minLength={6} style={inputStyle} />
        </div>
        {err && <div style={{ fontSize: 9, color: RED, lineHeight: 1.5 }}>{err}</div>}
        <button type="submit" disabled={busy}
          style={{ ...btnA, width: '100%', opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    );
  }

  // Step 2: new user → multi-step signup
  return (
    <div style={formStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: ACC, fontWeight: 700, letterSpacing: '0.14em' }}>{normPlate(plate)}</span>
        <button type="button" onClick={goBack}
          style={{ fontSize: 8, color: MUT, background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace" }}>
          ← change
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        {[1,2,3].map(n => (
          <div key={n} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: n <= signupStep ? ACC : '#2a2a2a',
          }} />
        ))}
      </div>
      <div style={{ fontSize: 8, color: '#5a8a5a', lineHeight: 1.6 }}>
        {signupStep === 1 && 'Step 1 of 3 — Upload your towing licence photo'}
        {signupStep === 2 && 'Step 2 of 3 — Your DA number and personal details'}
        {signupStep === 3 && 'Step 3 of 3 — Access code and account password'}
      </div>

      {signupStep === 1 && (
        <div>
          <div style={labelStyle}>Towing Licence Photo</div>
          <label style={{ display: 'block', border: `2px dashed ${licenceFile ? ACC : '#333'}`, borderRadius: 2,
            padding: '20px', textAlign: 'center', cursor: 'pointer', background: '#080808' }}>
            <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                setLicenceFile(f);
                if (f.type.startsWith('image/')) {
                  const url = URL.createObjectURL(f);
                  setLicencePreview(url);
                } else {
                  setLicencePreview(null);
                }
              }} />
            {licencePreview
              ? <img src={licencePreview} alt="Licence preview" style={{ maxHeight: 120, borderRadius: 2, objectFit: 'contain' }} />
              : <div style={{ fontSize: 9, color: MUT }}>Tap to upload photo or PDF{licenceFile ? ` · ${licenceFile.name}` : ''}</div>
            }
          </label>
          {licenceFile && !licencePreview && (
            <div style={{ fontSize: 8, color: MUT, marginTop: 4 }}>📄 {licenceFile.name}</div>
          )}
        </div>
      )}

      {signupStep === 2 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={labelStyle}>First Name</div>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                placeholder="e.g. Alex" autoCapitalize="words" style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Last Name</div>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                placeholder="e.g. Smith" autoCapitalize="words" style={inputStyle} />
            </div>
          </div>
          <div>
            <div style={labelStyle}>Full DA Number</div>
            <input type="text" value={daNumber} onChange={e => setDaNumber(e.target.value)}
              placeholder="e.g. DA123456" autoCapitalize="characters" style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Licence Address (optional)</div>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)}
              placeholder="Street address on your licence" autoCapitalize="words" style={inputStyle} />
          </div>
        </>
      )}

      {signupStep === 3 && (
        <form onSubmit={handleSignupSubmit} style={{ display: 'contents' }}>
          <div>
            <div style={labelStyle}>Access Code <span style={{ color: MUT, fontWeight: 400 }}>(optional)</span></div>
            <input type="text" value={accessCode}
              onChange={e => setAccessCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
              placeholder="XXXXXX — leave blank if none"
              autoCapitalize="characters"
              style={{ ...inputStyle, letterSpacing: '0.2em', fontSize: 16 }} />
            <div style={{ marginTop: 5, fontSize: 8, color: MUT, lineHeight: 1.6 }}>
              If your dispatcher gave you a code, enter it here — it links you to their company. You can sign up without one and your dispatcher will approve you manually.
            </div>
          </div>
          <div>
            <div style={labelStyle}>Email</div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Password</div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="········" minLength={6} style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Confirm Password</div>
            <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
              placeholder="········" minLength={6} style={inputStyle} />
          </div>
          {err && <div style={{ fontSize: 9, color: RED, lineHeight: 1.5 }}>{err}</div>}
          <button type="submit" disabled={busy}
            style={{ ...btnA, width: '100%', opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Creating account…' : 'Create Account & Sign In'}
          </button>
        </form>
      )}

      {err && signupStep < 3 && <div style={{ fontSize: 9, color: RED, lineHeight: 1.5 }}>{err}</div>}
      {signupStep < 3 && (
        <button type="button" onClick={handleSignupNext} disabled={busy}
          style={{ ...btnA, width: '100%', opacity: busy ? 0.5 : 1 }}>
          Next →
        </button>
      )}
      {signupStep > 1 && (
        <button type="button" onClick={() => { setSignupStep(s => s - 1); setErr(''); }}
          style={{ ...btnG, ...sm, alignSelf: 'flex-start' }}>
          ← Back
        </button>
      )}
    </div>
  );
}

// ── Dispatcher / Admin login / signup ───────────────────────────────────────

function DispatcherFlow({ onSuccess }) {
  const [mode,        setMode]        = useState('signin'); // 'signin' | 'signup'
  const [step,        setStep]        = useState(1); // 1=code, 2=company name (admin only), 3=email+pw
  const [code,        setCode]        = useState('');
  const [codeResult,  setCodeResult]  = useState(null); // { valid, role, company_id }
  const [companyName, setCompanyName] = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirmPwd,  setConfirmPwd]  = useState('');
  const [busy,        setBusy]        = useState(false);
  const [err,         setErr]         = useState('');

  const handleSignIn = async e => {
    e.preventDefault();
    setErr('');
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) { setErr('Enter a valid email address.'); return; }
    if (!password) { setErr('Enter your password.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { setErr('Incorrect email or password.'); return; }
    onSuccess();
  };

  const handleCodeSubmit = async e => {
    e.preventDefault();
    setErr('');
    if (!code.trim()) { setErr('Enter your invite code.'); return; }
    setBusy(true);
    const { data: rows } = await supabase.rpc('validate_invite_code', { p_code: code.trim() });
    setBusy(false);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.valid) { setErr('Invalid or already used invite code.'); return; }
    setCodeResult(row);
    // Admin with no company_id → needs to name their company
    if (row.role === 'admin' && !row.company_id) {
      setStep(2);
    } else {
      setStep(3);
    }
  };

  const handleCompanyNext = e => {
    e.preventDefault();
    setErr('');
    if (!companyName.trim()) { setErr('Enter your company name.'); return; }
    setStep(3);
  };

  const handleSignup = async e => {
    e.preventDefault();
    setErr('');
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) { setErr('Enter a valid email address.'); return; }
    if (password.length < 6)                           { setErr('Password must be at least 6 characters.'); return; }
    if (password !== confirmPwd)                       { setErr('Passwords do not match.'); return; }

    setBusy(true);

    const { data: authData, error: authErr } = await supabase.auth.signUp({ email: email.trim(), password });
    if (authErr) { setErr(authErr.message); setBusy(false); return; }
    const userId = authData.user?.id;

    if (codeResult.role === 'admin' && !codeResult.company_id) {
      // Create company + profile in one call (security definer)
      const { error: compErr } = await supabase.rpc('create_company_and_admin', { p_company_name: companyName.trim() });
      if (compErr) { setErr(compErr.message); setBusy(false); return; }
    } else {
      // Insert dispatch/admin profile for existing company
      if (userId) {
        await supabase.from('user_profiles').insert({
          id: userId,
          company_id: codeResult.company_id,
          role: codeResult.role,
        });
      }
    }

    await supabase.rpc('consume_invite_code', { p_code: code.trim(), p_used_by: email.trim() });

    setBusy(false);
    onSuccess();
  };

  return (
    <>
      {/* Sign-in form */}
      {mode === 'signin' && (
        <form onSubmit={handleSignIn} style={formStyle}>
          <div>
            <div style={labelStyle}>Email</div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoFocus style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Password</div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="········" minLength={6} style={inputStyle} />
          </div>
          {err && <div style={{ fontSize: 9, color: RED, lineHeight: 1.5 }}>{err}</div>}
          <button type="submit" disabled={busy}
            style={{ ...btnA, width: '100%', opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
          <div style={{ textAlign: 'center', fontSize: 8, color: MUT }}>
            New dispatcher?{' '}
            <button type="button" onClick={() => { setMode('signup'); setErr(''); }}
              style={{ background: 'none', border: 'none', color: ACC, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, padding: 0, textDecoration: 'underline' }}>
              Sign up with invite code
            </button>
          </div>
        </form>
      )}

      {/* Signup flow */}
      {mode === 'signup' && step === 1 && (
        <form onSubmit={handleCodeSubmit} style={formStyle}>
          <div>
            <div style={labelStyle}>Dispatcher Invite Code</div>
            <input type="text" value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
              placeholder="XXXXXX" autoFocus autoCapitalize="characters"
              style={{ ...inputStyle, letterSpacing: '0.2em', fontSize: 16 }} />
          </div>
          {err && <div style={{ fontSize: 9, color: RED, lineHeight: 1.5 }}>{err}</div>}
          <button type="submit" disabled={busy}
            style={{ ...btnA, width: '100%', opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Checking…' : 'Continue →'}
          </button>
          <div style={{ textAlign: 'center', fontSize: 8, color: MUT }}>
            Already have an account?{' '}
            <button type="button" onClick={() => { setMode('signin'); setErr(''); }}
              style={{ background: 'none', border: 'none', color: ACC, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, padding: 0, textDecoration: 'underline' }}>
              Sign in
            </button>
          </div>
        </form>
      )}
      {mode === 'signup' && step === 2 && (
        <form onSubmit={handleCompanyNext} style={formStyle}>
          <div style={{ fontSize: 8, color: '#5a8a5a', lineHeight: 1.6 }}>
            Admin invite — enter your company name to create a new account.
          </div>
          <div>
            <div style={labelStyle}>Company Name</div>
            <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g. Smith Towing" autoFocus autoCapitalize="words" style={inputStyle} />
          </div>
          {err && <div style={{ fontSize: 9, color: RED, lineHeight: 1.5 }}>{err}</div>}
          <button type="submit" disabled={busy}
            style={{ ...btnA, width: '100%', opacity: busy ? 0.5 : 1 }}>
            Next →
          </button>
        </form>
      )}
      {mode === 'signup' && step === 3 && (
        <form onSubmit={handleSignup} style={formStyle}>
          <div style={{ fontSize: 8, color: '#5a8a5a', lineHeight: 1.6 }}>
            {codeResult?.role === 'admin' ? `Admin — ${companyName || 'existing company'}` : 'Dispatcher account'}
          </div>
          <div>
            <div style={labelStyle}>Email</div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoFocus style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Password</div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="········" minLength={6} style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Confirm Password</div>
            <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
              placeholder="········" minLength={6} style={inputStyle} />
          </div>
          {err && <div style={{ fontSize: 9, color: RED, lineHeight: 1.5 }}>{err}</div>}
          <button type="submit" disabled={busy}
            style={{ ...btnA, width: '100%', opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Creating account…' : 'Create Account & Sign In'}
          </button>
          <button type="button" onClick={() => { setStep(codeResult?.role === 'admin' && !codeResult?.company_id ? 2 : 1); setErr(''); }}
            style={{ ...btnG, ...sm, alignSelf: 'flex-start' }}>
            ← Back
          </button>
        </form>
      )}
    </>
  );
}

// ── Owner / Sole Operator signup ────────────────────────────────────────────

function SoleOperatorFlow({ onSuccess }) {
  const [step,       setStep]       = useState(1); // 1=company, 2=your name, 3=account
  const [companyName,setCompanyName]= useState('');
  const [abn,        setAbn]        = useState('');
  const [firstName,  setFirstName]  = useState('');
  const [lastName,   setLastName]   = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [busy,       setBusy]       = useState(false);
  const [err,        setErr]        = useState('');

  const stepLabels = [
    'Step 1 of 3 — Your company details',
    'Step 2 of 3 — Your name',
    'Step 3 of 3 — Account credentials',
  ];

  const handleNext = e => {
    e.preventDefault();
    setErr('');
    if (step === 1) {
      if (!companyName.trim()) { setErr('Enter your company name.'); return; }
      setStep(2);
    } else if (step === 2) {
      if (!firstName.trim()) { setErr('Enter your first name.'); return; }
      if (!lastName.trim())  { setErr('Enter your last name.'); return; }
      setStep(3);
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setErr('');
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) { setErr('Enter a valid email address.'); return; }
    if (password.length < 6)                           { setErr('Password must be at least 6 characters.'); return; }
    if (password !== confirmPwd)                       { setErr('Passwords do not match.'); return; }

    setBusy(true);

    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { first_name: firstName.trim(), last_name: lastName.trim() } },
    });
    if (authErr) { setErr(authErr.message); setBusy(false); return; }

    // Create company + admin profile in one atomic RPC
    const { error: compErr } = await supabase.rpc('create_company_and_admin', {
      p_company_name: companyName.trim(),
    });
    if (compErr) { setErr(compErr.message); setBusy(false); return; }

    setBusy(false);
    onSuccess();
  };

  return (
    <div style={formStyle}>
      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
        {[1,2,3].map(n => (
          <div key={n} style={{ flex: 1, height: 3, borderRadius: 2, background: n <= step ? ACC : '#2a2a2a' }} />
        ))}
      </div>
      <div style={{ fontSize: 8, color: '#5a8a5a', lineHeight: 1.6 }}>{stepLabels[step - 1]}</div>

      {step === 1 && (
        <form onSubmit={handleNext} style={{ display: 'contents' }}>
          <div>
            <div style={labelStyle}>Company Name *</div>
            <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g. Smith Towing" autoCapitalize="words" autoFocus style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>ABN <span style={{ color: MUT, fontWeight: 400 }}>(optional)</span></div>
            <input type="text" value={abn} onChange={e => setAbn(e.target.value)}
              placeholder="e.g. 12 345 678 901" style={inputStyle} />
          </div>
          {err && <div style={{ fontSize: 9, color: RED, lineHeight: 1.5 }}>{err}</div>}
          <button type="submit" style={{ ...btnA, width: '100%' }}>Next →</button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleNext} style={{ display: 'contents' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={labelStyle}>First Name *</div>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                placeholder="e.g. Alex" autoCapitalize="words" autoFocus style={inputStyle} />
            </div>
            <div>
              <div style={labelStyle}>Last Name *</div>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                placeholder="e.g. Smith" autoCapitalize="words" style={inputStyle} />
            </div>
          </div>
          {err && <div style={{ fontSize: 9, color: RED, lineHeight: 1.5 }}>{err}</div>}
          <button type="submit" style={{ ...btnA, width: '100%' }}>Next →</button>
          <button type="button" onClick={() => { setStep(1); setErr(''); }}
            style={{ ...btnG, ...sm, alignSelf: 'flex-start' }}>← Back</button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div style={{ fontSize: 8, color: '#5a5a5a', lineHeight: 1.6, background: '#0a0a0a',
            border: '1px solid #1e1e1e', borderRadius: 2, padding: '7px 10px' }}>
            🏢 {companyName} · {firstName} {lastName}
          </div>
          <div>
            <div style={labelStyle}>Email *</div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoFocus style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Password *</div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="········" minLength={6} style={inputStyle} />
          </div>
          <div>
            <div style={labelStyle}>Confirm Password *</div>
            <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
              placeholder="········" minLength={6} style={inputStyle} />
          </div>
          {err && <div style={{ fontSize: 9, color: RED, lineHeight: 1.5 }}>{err}</div>}
          <button type="submit" disabled={busy}
            style={{ ...btnA, width: '100%', opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Creating account…' : 'Create Company & Sign In'}
          </button>
          <button type="button" onClick={() => { setStep(2); setErr(''); }}
            style={{ ...btnG, ...sm, alignSelf: 'flex-start' }}>← Back</button>
        </form>
      )}
    </div>
  );
}

// ── Pending approval screen ─────────────────────────────────────────────────

function PendingApproval({ plate, onSignOut }) {
  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ maxWidth: 340, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: TXT, marginBottom: 8, letterSpacing: '0.04em' }}>
          Account Pending Approval
        </div>
        <div style={{ fontSize: 10, color: MUT, lineHeight: 1.8, marginBottom: 24 }}>
          Your account for <span style={{ color: ACC }}>{plate}</span> has been created.<br />
          Your dispatcher will review your licence and approve your access.
        </div>
        <button onClick={onSignOut} style={{ ...btnG, fontSize: 9 }}>Sign Out</button>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────

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

  const role        = profile?.role || 'admin'; // everyone gets full access
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
