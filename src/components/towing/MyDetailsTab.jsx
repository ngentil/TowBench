import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, BRD, TXT, GRN, RED, SURF, inp, btnA, btnG, sm } from '../../lib/styles';

const FL = ({ t, sub }) => (
  <div style={{ marginBottom: 4 }}>
    <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t}</div>
    {sub && <div style={{ fontSize: 7, color: '#444', marginTop: 1 }}>{sub}</div>}
  </div>
);

const SecHead = ({ children }) => (
  <div style={{ borderLeft: `2px solid ${ACC}`, paddingLeft: 8, fontSize: 10, fontWeight: 700,
    color: TXT, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, marginTop: 24 }}>
    {children}
  </div>
);

const Field = ({ label, sub, children }) => (
  <div>
    <FL t={label} sub={sub} />
    {children}
  </div>
);

const Grid2 = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
    {children}
  </div>
);

function PhotoUpload({ label, sub, currentUrl, onUpload, uploading }) {
  const ref = useRef(null);
  return (
    <div>
      <FL t={label} sub={sub} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {currentUrl && (
          <img src={currentUrl} alt={label}
            style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 2,
              border: '1px solid #2a2a2a', background: '#0a0a0a', flexShrink: 0 }} />
        )}
        <div>
          <button onClick={() => ref.current?.click()} disabled={uploading}
            style={{ ...btnG, ...sm, fontSize: 8, opacity: uploading ? 0.5 : 1 }}>
            {uploading ? 'Uploading…' : currentUrl ? '↺ Replace photo' : '+ Upload photo'}
          </button>
          {currentUrl && (
            <div style={{ fontSize: 7, color: '#3a7a3a', marginTop: 4 }}>✓ Photo on file</div>
          )}
          <input ref={ref} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        </div>
      </div>
    </div>
  );
}

export default function MyDetailsTab({ userEmail, companyId, role }) {
  const [truck,      setTruck]      = useState(null);   // tow_trucks row, null if not a driver
  const [userId,     setUserId]     = useState(null);
  const [profData,   setProfData]   = useState({});     // user_profiles.profile_data fallback
  const [profileId,  setProfileId]  = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [err,        setErr]        = useState('');
  const [uploading,  setUploading]  = useState({}); // { fieldName: bool }

  // Form state
  const [firstName,             setFirstName]             = useState('');
  const [lastName,              setLastName]              = useState('');
  const [dob,                   setDob]                   = useState('');
  const [phone,                 setPhone]                 = useState('');
  const [homeAddress,           setHomeAddress]           = useState('');
  const [dlNumber,              setDlNumber]              = useState('');
  const [dlExpiry,              setDlExpiry]              = useState('');
  const [dlPhotoUrl,            setDlPhotoUrl]            = useState('');
  const [daNumber,              setDaNumber]              = useState('');
  const [daExpiry,              setDaExpiry]              = useState('');
  const [towLicencePhotoUrl,    setTowLicencePhotoUrl]    = useState('');
  const [licenceAddress,        setLicenceAddress]        = useState('');
  const [emergencyName,         setEmergencyName]         = useState('');
  const [emergencyPhone,        setEmergencyPhone]        = useState('');

  const populate = (src) => {
    setFirstName(src.first_name              || '');
    setLastName(src.last_name                || '');
    setDob(src.date_of_birth                 || '');
    setPhone(src.phone                       || '');
    setHomeAddress(src.home_address          || '');
    setDlNumber(src.drivers_licence_number   || '');
    setDlExpiry(src.drivers_licence_expiry   || '');
    setDlPhotoUrl(src.drivers_licence_photo_url || '');
    setDaNumber(src.da_number                || '');
    setDaExpiry(src.da_expiry                || '');
    setTowLicencePhotoUrl(src.licence_photo_url || '');
    setLicenceAddress(src.licence_address    || '');
    setEmergencyName(src.emergency_contact_name  || '');
    setEmergencyPhone(src.emergency_contact_phone || '');
  };

  useEffect(() => {
    if (!userEmail) return;
    Promise.all([
      supabase.from('tow_trucks').select('*').eq('auth_email', userEmail).maybeSingle(),
      supabase.from('user_profiles').select('id,profile_data').eq('id', (async () => {
        const { data } = await supabase.auth.getUser();
        return data.user?.id;
      })()).maybeSingle(),
      supabase.auth.getUser(),
    ]).then(([{ data: t }, _profRes, { data: { user } }]) => {
      setUserId(user?.id);
      if (t) {
        setTruck(t);
        populate(t);
      }
      setLoading(false);
    });

    // Load profile_data separately (for non-driver users)
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: prof } = await supabase
        .from('user_profiles').select('id,profile_data').eq('id', user.id).maybeSingle();
      if (prof) {
        setProfileId(prof.id);
        if (!truck && prof.profile_data) {
          setProfData(prof.profile_data);
          populate(prof.profile_data);
        }
      }
    });
  }, [userEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildPayload = () => ({
    first_name:                firstName.trim()    || null,
    last_name:                 lastName.trim()     || null,
    date_of_birth:             dob                 || null,
    phone:                     phone.trim()        || null,
    home_address:              homeAddress.trim()  || null,
    drivers_licence_number:    dlNumber.trim()     || null,
    drivers_licence_expiry:    dlExpiry            || null,
    drivers_licence_photo_url: dlPhotoUrl          || null,
    da_number:                 daNumber.trim()     || null,
    da_expiry:                 daExpiry            || null,
    licence_photo_url:         towLicencePhotoUrl  || null,
    licence_address:           licenceAddress.trim() || null,
    emergency_contact_name:    emergencyName.trim()  || null,
    emergency_contact_phone:   emergencyPhone.trim() || null,
  });

  const save = async () => {
    setSaving(true); setErr(''); setSaved(false);
    const payload = buildPayload();
    try {
      if (truck?.id) {
        const { error } = await supabase.from('tow_trucks').update(payload).eq('id', truck.id);
        if (error) throw error;
        setTruck(prev => ({ ...prev, ...payload }));
      } else if (profileId) {
        const { error } = await supabase.from('user_profiles')
          .update({ profile_data: payload }).eq('id', profileId);
        if (error) throw error;
        setProfData(payload);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setErr(e.message);
    }
    setSaving(false);
  };

  const uploadPhoto = async (file, fieldSetter, storageKey, dbField) => {
    if (!userId) return;
    setUploading(prev => ({ ...prev, [storageKey]: true }));
    try {
      const ext  = file.name.split('.').pop() || 'jpg';
      const path = `${userId}/${storageKey}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('licence-photos').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('licence-photos').getPublicUrl(path);
      const url = urlData.publicUrl;
      fieldSetter(url);
      // Persist immediately
      if (truck?.id) {
        await supabase.from('tow_trucks').update({ [dbField]: url }).eq('id', truck.id);
        setTruck(prev => ({ ...prev, [dbField]: url }));
      } else if (profileId) {
        const updated = { ...profData, [dbField]: url };
        await supabase.from('user_profiles').update({ profile_data: updated }).eq('id', profileId);
        setProfData(updated);
      }
    } catch (e) {
      setErr(`Photo upload failed: ${e.message}`);
    }
    setUploading(prev => ({ ...prev, [storageKey]: false }));
  };

  if (loading) {
    return <div style={{ padding: 32, fontSize: 10, color: MUT, textAlign: 'center' }}>Loading…</div>;
  }

  const fldStyle = { ...inp, width: '100%', boxSizing: 'border-box' };

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto', maxWidth: 600 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em', marginBottom: 4 }}>
        👤 My Details
      </div>
      <div style={{ fontSize: 9, color: MUT, marginBottom: 4 }}>
        {truck ? `🚛 ${truck.plate}` : 'Dispatcher / Admin profile'}
        {userEmail && <span style={{ marginLeft: 8 }}>· {userEmail}</span>}
      </div>
      {!truck && (
        <div style={{ fontSize: 8, color: '#554422', background: '#1a1000', border: '1px solid #443300',
          borderRadius: 2, padding: '6px 10px', marginBottom: 8, lineHeight: 1.6 }}>
          No driver record linked to this account. Details saved to your profile.
        </div>
      )}

      {/* ── Personal ─────────────────────────────────────────────────── */}
      <SecHead>Personal</SecHead>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Grid2>
          <Field label="First Name">
            <input style={fldStyle} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="e.g. Alex" />
          </Field>
          <Field label="Last Name">
            <input style={fldStyle} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="e.g. Smith" />
          </Field>
        </Grid2>
        <Grid2>
          <Field label="Date of Birth">
            <input type="date" style={fldStyle} value={dob} onChange={e => setDob(e.target.value)} />
          </Field>
          <Field label="Phone Number">
            <input type="tel" style={fldStyle} value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 0412 345 678" />
          </Field>
        </Grid2>
        <Field label="Home Address">
          <input style={fldStyle} value={homeAddress} onChange={e => setHomeAddress(e.target.value)} placeholder="e.g. 12 Example St, Suburb VIC 3000" />
        </Field>
      </div>

      {/* ── Driver's Licence ──────────────────────────────────────────── */}
      <SecHead>Driver's Licence</SecHead>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Grid2>
          <Field label="Licence Number">
            <input style={fldStyle} value={dlNumber} onChange={e => setDlNumber(e.target.value)} placeholder="e.g. 12345678" />
          </Field>
          <Field label="Expiry Date">
            <input type="date" style={fldStyle} value={dlExpiry} onChange={e => setDlExpiry(e.target.value)} />
          </Field>
        </Grid2>
        <Field label="Licence Address" sub="Address as printed on your licence">
          <input style={fldStyle} value={licenceAddress} onChange={e => setLicenceAddress(e.target.value)} placeholder="e.g. 12 Example St, Suburb VIC 3000" />
        </Field>
        <PhotoUpload
          label="Driver's Licence Photo"
          sub="Photo or scan of your current driver's licence"
          currentUrl={dlPhotoUrl}
          uploading={!!uploading['drivers_licence']}
          onUpload={f => uploadPhoto(f, setDlPhotoUrl, 'drivers_licence', 'drivers_licence_photo_url')}
        />
      </div>

      {/* ── DA / Towing Authorisation ─────────────────────────────────── */}
      <SecHead>DA / Towing Authorisation</SecHead>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Grid2>
          <Field label="DA Number" sub="Driver Authorisation number">
            <input style={fldStyle} value={daNumber} onChange={e => setDaNumber(e.target.value)} placeholder="e.g. DA123456" />
          </Field>
          <Field label="DA Expiry Date">
            <input type="date" style={fldStyle} value={daExpiry} onChange={e => setDaExpiry(e.target.value)} />
          </Field>
        </Grid2>
        <PhotoUpload
          label="Towing Licence / DA Card Photo"
          sub="Photo or scan of your towing authority card"
          currentUrl={towLicencePhotoUrl}
          uploading={!!uploading['towing_licence']}
          onUpload={f => uploadPhoto(f, setTowLicencePhotoUrl, 'towing_licence', 'licence_photo_url')}
        />
      </div>

      {/* ── Emergency Contact ─────────────────────────────────────────── */}
      <SecHead>Emergency Contact</SecHead>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Grid2>
          <Field label="Contact Name">
            <input style={fldStyle} value={emergencyName} onChange={e => setEmergencyName(e.target.value)} placeholder="e.g. Jane Smith" />
          </Field>
          <Field label="Contact Phone">
            <input type="tel" style={fldStyle} value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} placeholder="e.g. 0412 345 678" />
          </Field>
        </Grid2>
      </div>

      {/* ── Save ─────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={save} disabled={saving}
          style={{ ...btnA, opacity: saving ? 0.6 : 1, minWidth: 120 }}>
          {saving ? 'Saving…' : 'Save Details'}
        </button>
        {saved && <span style={{ fontSize: 9, color: GRN }}>✓ Saved</span>}
        {err   && <span style={{ fontSize: 9, color: RED }}>{err}</span>}
      </div>

      <div style={{ height: 32 }} />
    </div>
  );
}
