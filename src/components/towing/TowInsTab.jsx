import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, BRD, TXT, GRN, RED, SURF, inp, txa, btnA, btnG, sm, ovly, mdl, mdlH, mdlB, mdlF } from '../../lib/styles';
import { Highlight } from '../ui/shared';

const FL = ({ t }) => (
  <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{t}</div>
);

const VEHICLE_TYPES = [{ v: 'motor_car', l: 'Motor Car' }, { v: 'motorcycle', l: 'Motorcycle' }];
const STORAGE_TYPES = [{ v: 'undercover', l: 'Under Cover' }, { v: 'locked_yard', l: 'Locked Yard' }];
const FLAG_FIELDS   = [
  { key: 'has_photos', label: 'Photos' },
  { key: 'has_keys',   label: 'Keys' },
  { key: 'stolen',     label: 'Stolen' },
  { key: 'evidence',   label: 'Evidence' },
  { key: 'impound',    label: 'Impound' },
  { key: 'trade',      label: 'Trade' },
  { key: 'insurance',  label: 'Insurance' },
];
const FLAG_COLORS = {
  stolen: '#cc2222', evidence: '#8844cc', impound: '#2266cc',
  trade: '#2299aa', insurance: '#aa6622', has_photos: GRN, has_keys: GRN,
};

function daysIn(dateIn, dateOut) {
  const end   = dateOut ? new Date(dateOut) : new Date();
  const start = new Date(dateIn);
  return Math.max(0, Math.ceil((end - start) / 86400000));
}

function calcStorageCost(record, cfg) {
  if (!cfg) return null;
  const days = daysIn(record.date_in, record.date_out);
  const isCar = record.vehicle_type === 'motor_car';
  const isCover = record.storage_type === 'undercover';
  const rate = isCar
    ? (isCover ? parseFloat(cfg.storage_car_undercover) || 0 : parseFloat(cfg.storage_car_yard) || 0)
    : (isCover ? parseFloat(cfg.storage_bike_undercover) || 0 : parseFloat(cfg.storage_bike_yard) || 0);
  if (!rate) return null;
  return { days, rate, total: days * rate };
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function toLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function depotLabel(depots, id) {
  const d = depots.find(x => x.id === id);
  return d ? `${d.name}${d.suburb ? ` · ${d.suburb}` : ''}` : '—';
}

function currentDepotId(record, transfers) {
  const list = (transfers[record.id] || []);
  return list.length > 0 ? list[list.length - 1].to_depot_id : record.depot_id;
}

function FlagBadge({ label, flagKey }) {
  const color = FLAG_COLORS[flagKey] || ACC;
  return (
    <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', padding: '1px 5px',
      border: `1px solid ${color}55`, borderRadius: 2, color, background: color + '18',
      textTransform: 'uppercase' }}>
      {label}
    </span>
  );
}

// ─── Photo thumbnail (lazy signed-URL fetch) ───────────────────────────────────
function PhotoThumbnail({ path, onClick }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!path) return;
    supabase.storage.from('tow-in-photos').createSignedUrl(path, 3600)
      .then(({ data }) => { if (data?.signedUrl) setUrl(data.signedUrl); });
  }, [path]);

  return (
    <div onClick={onClick}
      style={{ width: 56, height: 56, borderRadius: 2, overflow: 'hidden',
        background: '#1a1a1a', cursor: 'pointer', flexShrink: 0,
        border: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <span style={{ fontSize: 18, opacity: 0.3 }}>📷</span>
      }
    </div>
  );
}

// ─── Photo modal ───────────────────────────────────────────────────────────────
function PhotoModal({ towIn, companyId, userEmail, isDispatch, onClose, onUpdate }) {
  const [photos,     setPhotos]     = useState([]);
  const [signedUrls, setSignedUrls] = useState({});
  const [loading,    setLoading]    = useState(true);
  const [uploading,  setUploading]  = useState(false);
  const [err,        setErr]        = useState('');
  const [fullView,   setFullView]   = useState(null);
  const cameraRef  = useRef(null);
  const galleryRef = useRef(null);

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('tow_in_photos')
      .select('*').eq('tow_in_id', towIn.id).order('created_at');
    const list = data || [];
    setPhotos(list);
    onUpdate?.(towIn.id, list);
    if (list.length > 0) {
      const { data: signed } = await supabase.storage
        .from('tow-in-photos')
        .createSignedUrls(list.map(p => p.path), 3600);
      const urls = {};
      (signed || []).forEach(s => { if (s.signedUrl) urls[s.path] = s.signedUrl; });
      setSignedUrls(urls);
    }
    setLoading(false);
  }, [towIn.id, onUpdate]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  const uploadFiles = async files => {
    if (!files?.length) return;
    setUploading(true); setErr('');
    for (const file of Array.from(files)) {
      const raw = file.name.split('.').pop() || 'jpg';
      const ext = raw.toLowerCase();
      const path = `${companyId}/${towIn.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('tow-in-photos')
        .upload(path, file, { contentType: file.type });
      if (upErr) { setErr(upErr.message); continue; }
      await supabase.from('tow_in_photos').insert({
        tow_in_id:  towIn.id,
        company_id: companyId,
        path,
        file_name:  file.name,
        created_by: userEmail,
      });
    }
    setUploading(false);
    loadPhotos();
  };

  const deletePhoto = async photo => {
    await supabase.storage.from('tow-in-photos').remove([photo.path]);
    await supabase.from('tow_in_photos').delete().eq('id', photo.id);
    const updated = photos.filter(p => p.id !== photo.id);
    setPhotos(updated);
    onUpdate?.(towIn.id, updated);
  };

  const triggerCamera  = () => { cameraRef.current.value  = ''; cameraRef.current.click();  };
  const triggerGallery = () => { galleryRef.current.value = ''; galleryRef.current.click(); };

  return (
    <div style={ovly} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...mdl, maxWidth: 540 }}>
        {/* Header */}
        <div style={mdlH}>
          <b style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Photos — {towIn.plate}
          </b>
          <button style={{ ...btnG, ...sm }} onClick={onClose}>✕</button>
        </div>

        {/* Upload controls */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #1e1e1e', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment"
            style={{ display: 'none' }} onChange={e => uploadFiles(e.target.files)} />
          <input ref={galleryRef} type="file" accept="image/*" multiple
            style={{ display: 'none' }} onChange={e => uploadFiles(e.target.files)} />
          <button style={{ ...btnG, ...sm }} onClick={triggerCamera} disabled={uploading}>
            📷 Camera
          </button>
          <button style={{ ...btnG, ...sm }} onClick={triggerGallery} disabled={uploading}>
            🖼 Add Photos
          </button>
          {uploading && <span style={{ fontSize: 8, color: MUT }}>Uploading…</span>}
          {err && <span style={{ fontSize: 8, color: RED }}>{err}</span>}
        </div>

        {/* Photo grid */}
        <div style={{ ...mdlB, minHeight: 100 }}>
          {loading ? (
            <div style={{ fontSize: 9, color: MUT, textAlign: 'center', padding: '24px 0' }}>Loading…</div>
          ) : photos.length === 0 ? (
            <div style={{ fontSize: 9, color: '#333', textAlign: 'center', padding: '32px 0', lineHeight: 1.9 }}>
              No photos yet.<br />Use Camera or Add Photos above.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {photos.map(p => (
                <div key={p.id}
                  style={{ position: 'relative', aspectRatio: '1', background: '#1a1a1a', borderRadius: 2,
                    overflow: 'hidden', border: '1px solid #252525', cursor: 'pointer' }}
                  onClick={() => signedUrls[p.path] && setFullView(signedUrls[p.path])}>
                  {signedUrls[p.path] ? (
                    <img src={signedUrls[p.path]} alt={p.file_name || ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 24, color: '#333' }}>📷</div>
                  )}
                  {isDispatch && (
                    <button
                      onClick={e => { e.stopPropagation(); deletePhoto(p); }}
                      style={{ position: 'absolute', top: 4, right: 4, background: '#000000bb',
                        border: 'none', color: '#cc4444', cursor: 'pointer', fontSize: 14,
                        width: 22, height: 22, borderRadius: 2, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}>
                      ×
                    </button>
                  )}
                  {p.file_name && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: '#000000aa', padding: '2px 5px', fontSize: 6, color: '#aaa',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.file_name}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={mdlF}>
          <span style={{ fontSize: 8, color: MUT, flex: 1, alignSelf: 'center' }}>
            {photos.length > 0 && `${photos.length} photo${photos.length !== 1 ? 's' : ''}`}
          </span>
          <button style={btnG} onClick={onClose}>Close</button>
        </div>
      </div>

      {/* Full-screen view */}
      {fullView && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 50, background: '#000000f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setFullView(null)}>
          <img src={fullView} alt=""
            style={{ maxWidth: '95%', maxHeight: '90%', objectFit: 'contain', borderRadius: 2 }} />
          <button
            onClick={() => setFullView(null)}
            style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none',
              color: '#888', fontSize: 28, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
      )}
    </div>
  );
}

// ─── Transfer modal ────────────────────────────────────────────────────────────
function TransferForm({ towIn, allDepots, fromDepotId, userEmail, onSave, onCancel }) {
  const [toDepotId, setToDepotId] = useState('');
  const [xferAt,    setXferAt]    = useState(toLocal(new Date().toISOString()));
  const [notes,     setNotes]     = useState('');
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState('');

  const available = allDepots.filter(d => d.id !== fromDepotId);

  const save = async () => {
    if (!toDepotId) { setErr('Select a destination yard.'); return; }
    setSaving(true); setErr('');
    const { data, error } = await supabase.from('tow_in_transfers').insert({
      tow_in_id:      towIn.id,
      from_depot_id:  fromDepotId,
      to_depot_id:    toDepotId,
      transferred_at: xferAt ? new Date(xferAt).toISOString() : new Date().toISOString(),
      notes:          notes.trim() || null,
      created_by:     userEmail,
    }).select().single();
    if (error) { setErr(error.message); setSaving(false); return; }
    onSave(data);
  };

  return (
    <div style={ovly} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...mdl, maxWidth: 400 }}>
        <div style={mdlH}>
          <b style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Transfer — {towIn.plate}
          </b>
          <button style={{ ...btnG, ...sm }} onClick={onCancel}>✕</button>
        </div>
        <div style={{ ...mdlB, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <FL t="From Yard" />
            <div style={{ ...inp, color: MUT, cursor: 'not-allowed' }}>{depotLabel(allDepots, fromDepotId)}</div>
          </div>
          <div>
            <FL t="To Yard *" />
            <select style={inp} value={toDepotId} onChange={e => setToDepotId(e.target.value)} autoFocus>
              <option value="">— Select destination —</option>
              {available.map(d => (
                <option key={d.id} value={d.id}>{d.name}{d.suburb ? ` · ${d.suburb}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <FL t="Date / Time of Transfer *" />
            <input type="datetime-local" style={inp} value={xferAt} onChange={e => setXferAt(e.target.value)} />
          </div>
          <div>
            <FL t="Notes" />
            <textarea style={{ ...txa, ...inp }} value={notes}
              onChange={e => setNotes(e.target.value)} placeholder="Reason, job ref, etc." />
          </div>
          {err && <div style={{ fontSize: 9, color: RED }}>{err}</div>}
        </div>
        <div style={mdlF}>
          <button style={btnG} onClick={onCancel}>Cancel</button>
          <button style={{ ...btnA, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Log Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tow-in log form ───────────────────────────────────────────────────────────
function TowInForm({ record, formDepots, allDepots, userEmail, companyId, onSave, onCancel }) {
  const isEdit = !!record?.id;
  const depots = isEdit ? allDepots : formDepots;

  const [plate,       setPlate]       = useState(record?.plate        || '');
  const [vtype,       setVtype]       = useState(record?.vehicle_type || 'motor_car');
  const [makeModel,   setMakeModel]   = useState(record?.make_model   || '');
  const [storageType, setStorageType] = useState(record?.storage_type || 'locked_yard');
  const [depotId,     setDepotId]     = useState(record?.depot_id     || (depots.length === 1 ? depots[0].id : ''));
  const [dateIn,      setDateIn]      = useState(record?.date_in ? toLocal(record.date_in) : toLocal(new Date().toISOString()));
  const [dateOut,     setDateOut]     = useState(record?.date_out ? toLocal(record.date_out) : '');
  const [notes,       setNotes]       = useState(record?.notes        || '');
  const [flags,       setFlags]       = useState(() => {
    const f = {};
    FLAG_FIELDS.forEach(({ key }) => { f[key] = record?.[key] || false; });
    return f;
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const toggleFlag = key => setFlags(prev => ({ ...prev, [key]: !prev[key] }));

  const save = async () => {
    if (!plate.trim()) { setErr('Vehicle plate is required.'); return; }
    if (!depotId)      { setErr('Select a yard.'); return; }
    setSaving(true); setErr('');
    const payload = {
      plate:        plate.trim().toUpperCase(),
      vehicle_type: vtype,
      make_model:   makeModel.trim() || null,
      storage_type: storageType,
      depot_id:     depotId,
      date_in:      dateIn ? new Date(dateIn).toISOString() : new Date().toISOString(),
      date_out:     dateOut ? new Date(dateOut).toISOString() : null,
      notes:        notes.trim() || null,
      company_id:   companyId,
      created_by:   userEmail,
      ...flags,
    };
    try {
      let data, error;
      if (isEdit) {
        ({ data, error } = await supabase.from('tow_ins').update(payload).eq('id', record.id).select().single());
      } else {
        ({ data, error } = await supabase.from('tow_ins').insert(payload).select().single());
      }
      if (error) throw error;
      onSave(data);
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  const showPicker = depots.length > 1;
  const singleLabel = depots.length === 1
    ? `${depots[0].name}${depots[0].suburb ? ` · ${depots[0].suburb}` : ''}`
    : null;

  return (
    <div style={ovly} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...mdl, maxWidth: 480 }}>
        <div style={mdlH}>
          <b style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {isEdit ? 'Edit Tow In' : 'Log Tow In'}
          </b>
          <button style={{ ...btnG, ...sm }} onClick={onCancel}>✕</button>
        </div>
        <div style={{ ...mdlB, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <FL t="Vehicle Plate *" />
              <input style={inp} value={plate}
                onChange={e => setPlate(e.target.value.toUpperCase())}
                placeholder="e.g. ABC123" autoCapitalize="characters" autoFocus />
            </div>
            <div>
              <FL t="Make / Model" />
              <input style={inp} value={makeModel}
                onChange={e => setMakeModel(e.target.value)}
                placeholder="e.g. Toyota Camry" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <FL t="Vehicle Type" />
              <select style={inp} value={vtype} onChange={e => setVtype(e.target.value)}>
                {VEHICLE_TYPES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div>
              <FL t="Storage Type" />
              <select style={inp} value={storageType} onChange={e => setStorageType(e.target.value)}>
                {STORAGE_TYPES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <FL t="Yard *" />
            {showPicker ? (
              <select style={inp} value={depotId} onChange={e => setDepotId(e.target.value)}>
                <option value="">— Select yard —</option>
                {depots.map(d => (
                  <option key={d.id} value={d.id}>{d.name}{d.suburb ? ` · ${d.suburb}` : ''}</option>
                ))}
              </select>
            ) : (
              <div style={{ ...inp, color: MUT, cursor: 'default' }}>
                {singleLabel || 'No yard assigned'}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <FL t="Date In *" />
              <input type="datetime-local" style={inp} value={dateIn} onChange={e => setDateIn(e.target.value)} />
            </div>
            <div>
              <FL t="Date Out (if released)" />
              <input type="datetime-local" style={inp} value={dateOut} onChange={e => setDateOut(e.target.value)} />
            </div>
          </div>
          <div>
            <FL t="Notes" />
            <textarea style={{ ...txa, ...inp }} value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Job number, owner details, etc." />
          </div>
          <div>
            <FL t="Flags" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
              {FLAG_FIELDS.map(({ key, label }) => {
                const color = FLAG_COLORS[key] || ACC;
                return (
                  <button key={key} type="button" onClick={() => toggleFlag(key)}
                    style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', padding: '4px 10px',
                      borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace",
                      textTransform: 'uppercase', border: `1px solid ${flags[key] ? color : '#2a2a2a'}`,
                      background: flags[key] ? color + '22' : '#0d0d0d',
                      color: flags[key] ? color : MUT }}>
                    {flags[key] ? '✓ ' : ''}{label}
                  </button>
                );
              })}
            </div>
          </div>
          {err && <div style={{ fontSize: 9, color: RED }}>{err}</div>}
        </div>
        <div style={mdlF}>
          <button style={btnG} onClick={onCancel}>Cancel</button>
          <button style={{ ...btnA, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={save}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Log Tow In'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────────
function TowInCard({ record, allDepots, transfers, photos, isDispatch, onEdit, onRelease, onTransfer, onPhotos, searchTerm, companyConfig }) {
  const [open, setOpen] = useState(false);

  const xfers      = transfers[record.id] || [];
  const curDepotId = xfers.length > 0 ? xfers[xfers.length - 1].to_depot_id : record.depot_id;
  const days       = daysIn(record.date_in, record.date_out);
  const released   = !!record.date_out;
  const activeFlags = FLAG_FIELDS.filter(({ key }) => record[key]);
  const cost       = calcStorageCost(record, companyConfig);
  const photoCount = photos?.length || 0;

  return (
    <div style={{ background: '#0d0d0d', border: '1px solid #252525',
      borderLeft: `3px solid ${released ? '#333' : ACC}`, borderRadius: 2, marginBottom: 6 }}>
      {/* Row */}
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}>
        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: TXT, letterSpacing: '0.1em' }}>
              <Highlight text={record.plate} term={searchTerm} />
            </span>
            {record.make_model && (
              <span style={{ fontSize: 9, color: MUT }}>
                <Highlight text={record.make_model} term={searchTerm} />
              </span>
            )}
            <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', padding: '1px 5px',
              border: `1px solid ${released ? '#333' : ACC + '55'}`, borderRadius: 2,
              color: released ? MUT : ACC, background: released ? '#111' : ACC + '15',
              textTransform: 'uppercase' }}>
              {released ? 'Released' : 'In Storage'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 3 }}>
            <span style={{ fontSize: 8, color: MUT }}>
              {record.vehicle_type === 'motor_car' ? 'Motor Car' : 'Motorcycle'}
            </span>
            <span style={{ fontSize: 8, color: '#333' }}>·</span>
            <span style={{ fontSize: 8, color: MUT }}>
              {record.storage_type === 'undercover' ? 'Under Cover' : 'Locked Yard'}
            </span>
            <span style={{ fontSize: 8, color: '#333' }}>·</span>
            <span style={{ fontSize: 8, color: MUT }}>{depotLabel(allDepots, curDepotId)}</span>
            {xfers.length > 0 && (
              <>
                <span style={{ fontSize: 8, color: '#333' }}>·</span>
                <span style={{ fontSize: 7, color: '#5a5a7a' }}>{xfers.length} transfer{xfers.length !== 1 ? 's' : ''}</span>
              </>
            )}
            <span style={{ fontSize: 8, color: '#333' }}>·</span>
            <span style={{ fontSize: 8, color: released ? MUT : ACC, fontWeight: released ? 400 : 700 }}>
              {days} day{days !== 1 ? 's' : ''}
            </span>
            {cost && (
              <>
                <span style={{ fontSize: 8, color: '#333' }}>·</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: released ? MUT : GRN, fontFamily: "'IBM Plex Mono',monospace" }}>
                  ${cost.total.toFixed(2)}
                </span>
              </>
            )}
          </div>
          {!open && activeFlags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
              {activeFlags.map(({ key, label }) => <FlagBadge key={key} flagKey={key} label={label} />)}
            </div>
          )}
        </div>

        {/* Photo thumbnail */}
        {photoCount > 0 && (
          <div style={{ flexShrink: 0 }}
            onClick={e => { e.stopPropagation(); onPhotos(record); }}>
            <PhotoThumbnail path={photos[0].path} />
            {photoCount > 1 && (
              <div style={{ fontSize: 6, color: MUT, textAlign: 'center', marginTop: 2 }}>
                +{photoCount - 1}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {!released && (
            <button onClick={e => { e.stopPropagation(); onTransfer(record, curDepotId); }}
              style={{ ...btnG, ...sm, fontSize: 7, color: '#6688cc', borderColor: '#6688cc55' }}>
              ⇄ Transfer
            </button>
          )}
          {isDispatch && !released && (
            <button onClick={e => { e.stopPropagation(); onRelease(record); }}
              style={{ ...btnG, ...sm, fontSize: 7, color: GRN, borderColor: GRN + '55' }}>
              ✓ Release
            </button>
          )}
          {isDispatch && (
            <button onClick={e => { e.stopPropagation(); onEdit(record); }}
              style={{ ...btnG, ...sm, fontSize: 7 }}>Edit</button>
          )}
          <button onClick={e => { e.stopPropagation(); onPhotos(record); }}
            style={{ ...btnG, ...sm, fontSize: 7,
              color: photoCount > 0 ? ACC : MUT,
              borderColor: photoCount > 0 ? ACC + '55' : undefined }}>
            📷{photoCount > 0 ? ` ${photoCount}` : ''}
          </button>
          <span style={{ fontSize: 8, color: MUT }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded */}
      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['Date In',         fmtDate(record.date_in)],
              ['Date Out',        record.date_out ? fmtDate(record.date_out) : '—'],
              ['Days in Storage', `${days} day${days !== 1 ? 's' : ''}`],
              ...(cost ? [['Storage Cost', `$${cost.total.toFixed(2)}`]] : []),
              ['Current Yard',    depotLabel(allDepots, curDepotId)],
              ['Logged in at',    depotLabel(allDepots, record.depot_id)],
              ['Vehicle Type',    record.vehicle_type === 'motor_car' ? 'Motor Car' : 'Motorcycle'],
              ['Storage',         record.storage_type === 'undercover' ? 'Under Cover' : 'Locked Yard'],
              ...(cost ? [['Daily Rate', `$${cost.rate.toFixed(2)} / day`]] : []),
              ['Logged by',       record.created_by?.split('@')[0] || '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '6px 8px' }}>
                <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 10, color: TXT, fontFamily: "'IBM Plex Mono',monospace" }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Transfer history */}
          {xfers.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                Yard Transfers
              </div>
              {[{ transferred_at: record.date_in, from_depot_id: null, to_depot_id: record.depot_id, _initial: true }, ...xfers].map((x, i) => (
                <div key={x.id || 'initial'} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 9 }}>
                  <span style={{ color: '#444', fontSize: 7, minWidth: 14, textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ color: MUT }}>{fmtDate(x.transferred_at)}</span>
                  {!x._initial && (
                    <>
                      <span style={{ color: '#333' }}>·</span>
                      <span style={{ color: '#666' }}>{depotLabel(allDepots, x.from_depot_id)}</span>
                      <span style={{ color: '#4466aa', fontSize: 8 }}>→</span>
                    </>
                  )}
                  <span style={{ color: TXT, fontWeight: 700 }}>{depotLabel(allDepots, x.to_depot_id)}</span>
                  {x.notes && <span style={{ color: '#444', fontSize: 8 }}>· {x.notes}</span>}
                  {x._initial && <span style={{ color: '#333', fontSize: 7 }}>(logged in)</span>}
                </div>
              ))}
            </div>
          )}

          {activeFlags.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Flags</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {activeFlags.map(({ key, label }) => <FlagBadge key={key} flagKey={key} label={label} />)}
              </div>
            </div>
          )}
          {record.notes && (
            <div style={{ marginTop: 10, background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 2, padding: '8px 10px', fontSize: 10, color: MUT, lineHeight: 1.6 }}>
              <Highlight text={record.notes} term={searchTerm} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main tab ──────────────────────────────────────────────────────────────────
export default function TowInsTab({ companyId, userEmail, isDispatch, companyConfig }) {
  const [records,       setRecords]       = useState([]);
  const [allDepots,     setAllDepots]     = useState([]);
  const [formDepots,    setFormDepots]    = useState([]);
  const [transfers,     setTransfers]     = useState({});
  const [photosMap,     setPhotosMap]     = useState({}); // tow_in_id -> photo[]
  const [loading,       setLoading]       = useState(true);
  const [showForm,      setShowForm]      = useState(false);
  const [editRecord,    setEditRecord]    = useState(null);
  const [xferTarget,    setXferTarget]    = useState(null);
  const [photoTarget,   setPhotoTarget]   = useState(null); // tow_in record
  const [filter,        setFilter]        = useState('active');
  const [yardFilter,    setYardFilter]    = useState('all');
  const [search,        setSearch]        = useState('');

  const load = useCallback(async () => {
    if (!companyId) return;

    const [{ data: recs }, { data: deps }, { data: xfers }, { data: trucks }, { data: pics }] = await Promise.all([
      supabase.from('tow_ins').select('*').eq('company_id', companyId).order('date_in', { ascending: false }),
      supabase.from('depots').select('*').eq('company_id', companyId).order('name'),
      supabase.from('tow_in_transfers').select('*').order('transferred_at'),
      supabase.from('tow_trucks').select('depot_id').eq('auth_email', userEmail).eq('company_id', companyId),
      supabase.from('tow_in_photos').select('id, tow_in_id, path, file_name, created_at').eq('company_id', companyId).order('created_at'),
    ]);

    const recList  = recs  || [];
    const depList  = deps  || [];
    const xferList = xfers || [];
    const picList  = pics  || [];

    const xferMap = {};
    xferList.forEach(x => {
      if (!xferMap[x.tow_in_id]) xferMap[x.tow_in_id] = [];
      xferMap[x.tow_in_id].push(x);
    });

    const picsMap = {};
    picList.forEach(p => {
      if (!picsMap[p.tow_in_id]) picsMap[p.tow_in_id] = [];
      picsMap[p.tow_in_id].push(p);
    });

    let fDepots = depList;
    if (!isDispatch && trucks && trucks.length > 0) {
      const ids = new Set(trucks.map(t => t.depot_id).filter(Boolean));
      fDepots = depList.filter(d => ids.has(d.id));
    }

    setRecords(recList);
    setAllDepots(depList);
    setFormDepots(fDepots.length > 0 ? fDepots : depList);
    setTransfers(xferMap);
    setPhotosMap(picsMap);
    setLoading(false);
  }, [companyId, userEmail, isDispatch]);

  useEffect(() => { load(); }, [load]);

  const handleSave = saved => {
    setRecords(prev => {
      const idx = prev.findIndex(r => r.id === saved.id);
      return idx >= 0 ? prev.map(r => r.id === saved.id ? saved : r) : [saved, ...prev];
    });
    setShowForm(false);
    setEditRecord(null);
  };

  const handleRelease = async record => {
    const { data, error } = await supabase.from('tow_ins')
      .update({ date_out: new Date().toISOString() }).eq('id', record.id).select().single();
    if (!error && data) setRecords(prev => prev.map(r => r.id === data.id ? data : r));
  };

  const handleTransferSave = saved => {
    setTransfers(prev => {
      const list = [...(prev[saved.tow_in_id] || []), saved];
      list.sort((a, b) => new Date(a.transferred_at) - new Date(b.transferred_at));
      return { ...prev, [saved.tow_in_id]: list };
    });
    setXferTarget(null);
  };

  const handlePhotoUpdate = (towInId, updatedPhotos) => {
    setPhotosMap(prev => ({ ...prev, [towInId]: updatedPhotos }));
  };

  const curDepot = r => currentDepotId(r, transfers);

  const filtered = records.filter(r => {
    if (filter === 'active'   && r.date_out)  return false;
    if (filter === 'released' && !r.date_out) return false;
    if (yardFilter !== 'all'  && curDepot(r) !== yardFilter) return false;
    if (search.trim()) {
      const q   = search.toLowerCase();
      const hay = [r.plate, r.make_model, r.notes].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const activeCount   = records.filter(r => !r.date_out).length;
  const releasedCount = records.filter(r =>  r.date_out).length;

  const cardProps = r => ({
    key: r.id, record: r, allDepots, transfers, isDispatch,
    photos: photosMap[r.id] || [],
    onEdit: setEditRecord,
    onRelease: handleRelease,
    onTransfer: (rec, fromDepotId) => setXferTarget({ record: rec, fromDepotId }),
    onPhotos: rec => setPhotoTarget(rec),
    searchTerm: search.trim(),
    companyConfig,
  });

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      {(showForm || editRecord) && (
        <TowInForm
          record={editRecord}
          formDepots={formDepots}
          allDepots={allDepots}
          userEmail={userEmail}
          companyId={companyId}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditRecord(null); }}
        />
      )}
      {xferTarget && (
        <TransferForm
          towIn={xferTarget.record}
          allDepots={allDepots}
          fromDepotId={xferTarget.fromDepotId}
          userEmail={userEmail}
          onSave={handleTransferSave}
          onCancel={() => setXferTarget(null)}
        />
      )}
      {photoTarget && (
        <PhotoModal
          towIn={photoTarget}
          companyId={companyId}
          userEmail={userEmail}
          isDispatch={isDispatch}
          onClose={() => setPhotoTarget(null)}
          onUpdate={handlePhotoUpdate}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>🏭 Tow Ins</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            {activeCount > 0   && <span style={{ color: ACC }}>· {activeCount} in storage</span>}
            {releasedCount > 0 && <span style={{ marginLeft: 8 }}>· {releasedCount} released</span>}
          </div>
        </div>
        <button onClick={() => { setEditRecord(null); setShowForm(true); }} style={{ ...btnA, ...sm }}>
          + Log Tow In
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {['active', 'released', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ ...btnG, ...sm, fontSize: 8,
              background: filter === f ? ACC + '22' : '#0d0d0d',
              border: `1px solid ${filter === f ? ACC : '#2a2a2a'}`,
              color: filter === f ? ACC : MUT }}>
            {f === 'active' ? `In Storage (${activeCount})` : f === 'released' ? `Released (${releasedCount})` : 'All'}
          </button>
        ))}
        {allDepots.length > 1 && (
          <select value={yardFilter} onChange={e => setYardFilter(e.target.value)}
            style={{ ...btnG, ...sm, fontSize: 8, cursor: 'pointer', background: '#0d0d0d' }}>
            <option value="all">All Yards</option>
            {allDepots.map(d => <option key={d.id} value={d.id}>{d.name}{d.suburb ? ` · ${d.suburb}` : ''}</option>)}
          </select>
        )}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search plate, make/model, notes…"
          style={{ ...inp, fontSize: 11 }} />
      </div>

      {loading && <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0' }}>Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0', lineHeight: 1.8 }}>
          No tow-ins found.<br />
          <button onClick={() => { setEditRecord(null); setShowForm(true); }}
            style={{ ...btnA, ...sm, marginTop: 10 }}>Log First Tow In</button>
        </div>
      )}

      {/* List */}
      {!loading && filtered.length > 0 && (
        yardFilter === 'all' && allDepots.length > 1
          ? allDepots.map(d => {
              const yardRecs = filtered.filter(r => curDepot(r) === d.id);
              if (yardRecs.length === 0) return null;
              return (
                <div key={d.id} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 8, color: ACC, letterSpacing: '0.14em', textTransform: 'uppercase',
                    fontWeight: 700, marginBottom: 8, borderLeft: `2px solid ${ACC}`, paddingLeft: 6 }}>
                    {d.name}{d.suburb ? ` · ${d.suburb}` : ''} ({yardRecs.length})
                  </div>
                  {yardRecs.map(r => <TowInCard {...cardProps(r)} />)}
                </div>
              );
            })
          : filtered.map(r => <TowInCard {...cardProps(r)} />)
      )}
    </div>
  );
}
