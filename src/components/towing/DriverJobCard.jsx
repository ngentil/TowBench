import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, TXT, GRN, RED, BRD, inp, btnA, btnG, sm } from '../../lib/styles';
import { fmtShort } from '../../lib/utils';
import DocketForm from './DocketForm';

const ORANGE = '#e8870a';
const MIN_PRE_VEHICLE = 4;
const MIN_POST_VEHICLE = 4;

// ── Step from job timestamps ────────────────────────────────────────────────
function getStep(job) {
  if (!job.accepted_at)                           return 'pending';
  if (!job.route_confirmed_at)                    return 'confirm_route';
  if (!job.en_route_pickup_at)                    return 'accepted';
  if (!job.arrived_pickup_at)                     return 'en_route_pickup';
  if (!job.pre_photos_at)                         return 'at_pickup';
  if (job.docket_required && !job.docket_form_at) return 'docket_form';
  if (!job.en_route_dropoff_at)                   return 'pre_done';
  if (!job.arrived_dropoff_at)                    return 'en_route_dropoff';
  if (!job.post_photos_at)                        return 'at_dropoff';
  return 'done';
}

const STEP_META = {
  pending:          { label: 'Assigned',           color: '#6688cc' },
  confirm_route:    { label: 'Confirm Route',       color: ACC       },
  accepted:         { label: 'Accepted',            color: GRN       },
  en_route_pickup:  { label: 'En Route',            color: ORANGE    },
  at_pickup:        { label: 'At Pickup',           color: ORANGE    },
  docket_form:      { label: 'Docket Form',         color: '#cc8844' },
  pre_done:         { label: 'Loaded',              color: ORANGE    },
  en_route_dropoff: { label: 'En Route — Dropoff',  color: ORANGE    },
  at_dropoff:       { label: 'At Dropoff',          color: ORANGE    },
  done:             { label: 'Complete',            color: GRN       },
};

// ── Photo grid — camera-first tile strip ────────────────────────────────────
function PhotoGrid({ photos, onAdd, uploading }) {
  const ref = useRef();
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 4 }}>
        {photos.map((p, i) => (
          <div key={i} style={{ aspectRatio: '1', overflow: 'hidden', borderRadius: 2, border: '1px solid #2a2a2a' }}>
            <img src={p.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ))}
        <div
          onClick={() => !uploading && ref.current?.click()}
          style={{
            aspectRatio: '1', background: '#0d0d0d', border: `1px dashed ${uploading ? '#222' : '#3a3a3a'}`,
            borderRadius: 2, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', cursor: uploading ? 'default' : 'pointer', gap: 2,
          }}
        >
          <span style={{ fontSize: 20, color: uploading ? '#333' : '#555' }}>{uploading ? '…' : '+'}</span>
          {!uploading && <span style={{ fontSize: 6, color: '#444', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Photo</span>}
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={e => { if (e.target.files[0]) onAdd(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}

// ── Route confirmation — lets driver review / change dropoff before heading out ──
function ConfirmRoute({ job, onConfirm, busy }) {
  const [editMode,   setEditMode]   = useState(false);
  const [search,     setSearch]     = useState('');
  const [results,    setResults]    = useState([]);
  const [newDropoff, setNewDropoff] = useState(null);
  const debounce = useRef();

  function handleSearch(q) {
    setSearch(q);
    clearTimeout(debounce.current);
    if (q.length < 3) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&countrycodes=au`
        );
        const d = await r.json();
        setResults(d.map(x => ({ label: x.display_name, lat: parseFloat(x.lat), lng: parseFloat(x.lon) })));
      } catch { /* network error — silently skip */ }
    }, 300);
  }

  const displayDropoff = newDropoff
    ? newDropoff.label.split(',').slice(0, 2).join(',')
    : (job.dropoff_label?.split(',').slice(0, 2).join(',') || 'Return to Depot');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: ACC, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Confirm Route
      </div>

      <div style={{ fontSize: 9, color: MUT }}>
        Pickup: <span style={{ color: TXT }}>{job.pickup_label?.split(',').slice(0, 2).join(',')}</span>
      </div>

      <div>
        <div style={{ fontSize: 9, color: MUT, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          Dropoff: <span style={{ color: newDropoff ? ACC : TXT }}>{displayDropoff}</span>
          {!editMode && (
            <button style={{ ...btnG, ...sm, padding: '2px 7px', fontSize: 8 }}
              onClick={() => setEditMode(true)}>
              Change
            </button>
          )}
        </div>

        {editMode && (
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <input
                style={{ ...inp, fontSize: 11, flex: 1 }}
                value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Search new dropoff address…"
                autoFocus
              />
              <button style={{ ...btnG, ...sm, padding: '4px 8px', flexShrink: 0 }}
                onClick={() => { setEditMode(false); setResults([]); }}>
                ✕
              </button>
            </div>
            {results.length > 0 && (
              <div style={{ background: '#111', border: `1px solid #2a2a2a`, borderRadius: 2,
                maxHeight: 160, overflowY: 'auto', zIndex: 5 }}>
                {results.map((r, i) => (
                  <div key={i}
                    onClick={() => { setNewDropoff(r); setEditMode(false); setResults([]); setSearch(''); }}
                    style={{ padding: '8px 10px', fontSize: 10, color: TXT, cursor: 'pointer',
                      borderBottom: i < results.length - 1 ? '1px solid #1a1a1a' : 'none' }}>
                    {r.label.split(',').slice(0, 3).join(',')}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <button
        style={{ ...btnA, width: '100%', fontSize: 11, padding: '11px 0',
          opacity: (busy || editMode) ? 0.4 : 1 }}
        disabled={busy || editMode}
        onClick={() => onConfirm(newDropoff)}
      >
        {busy ? '…' : '✓  Route Confirmed'}
      </button>
    </div>
  );
}

// ── Main card ───────────────────────────────────────────────────────────────
export default function DriverJobCard({ job: initJob, companyId, onUpdate }) {
  const [job,       setJob]       = useState(initJob);
  const [photos,    setPhotos]    = useState([]);
  const [uploading, setUploading] = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [err,       setErr]       = useState('');

  const step = getStep(job);
  const { label: stepLabel, color: stepColor } = STEP_META[step] || { label: step, color: MUT };
  const dropoffLabel = job.dropoff_label || 'Return to Depot';
  const typeColor    = job.tow_type === 'trade' ? ACC : job.tow_type === 'both' ? '#5a9aee' : RED;

  useEffect(() => {
    supabase.from('dispatched_job_photos').select('*').eq('job_id', job.id)
      .then(({ data }) => setPhotos(data || []));
  }, [job.id]);

  const advance = async (fields) => {
    setBusy(true); setErr('');
    const { data, error } = await supabase
      .from('dispatched_jobs').update(fields).eq('id', job.id).select().single();
    setBusy(false);
    if (error) { setErr(error.message); return false; }
    setJob(data);
    onUpdate?.(data);
    return true;
  };

  const addPhoto = async (file, phase, photoType = 'vehicle') => {
    setUploading(true); setErr('');
    const ext  = (file.name?.split('.').pop() || 'jpg').toLowerCase();
    const path = `${companyId}/${job.id}/${phase}/${Date.now()}_${photoType}.${ext}`;
    const { error: upErr } = await supabase.storage.from('job-photos').upload(path, file);
    if (upErr) { setErr(upErr.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from('job-photos').getPublicUrl(path);
    const { data: row, error: dbErr } = await supabase.from('dispatched_job_photos').insert({
      job_id: job.id, phase, photo_type: photoType, photo_url: urlData.publicUrl,
    }).select().single();
    if (dbErr) { setErr(dbErr.message); setUploading(false); return; }
    setPhotos(prev => [...prev, row]);
    setUploading(false);
  };

  const preVehicle  = photos.filter(p => p.phase === 'pre_inspection'  && p.photo_type === 'vehicle');
  const preDocket   = photos.filter(p => p.phase === 'pre_inspection'  && p.photo_type === 'docket');
  const postVehicle = photos.filter(p => p.phase === 'post_inspection' && p.photo_type === 'vehicle');

  const preReady  = preVehicle.length >= MIN_PRE_VEHICLE && preDocket.length >= 1;
  const postReady = postVehicle.length >= MIN_POST_VEHICLE;

  return (
    <div style={{
      background: '#0d0d0d', border: '1px solid #252525',
      borderLeft: `3px solid ${stepColor}`, borderRadius: 2, marginBottom: 12, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1a1a1a' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.12em', padding: '2px 6px',
              border: `1px solid ${typeColor}55`, borderRadius: 2, color: typeColor,
              background: typeColor + '15', textTransform: 'uppercase' }}>
              {job.tow_type || 'trade'} tow
            </span>
            <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '2px 6px',
              border: `1px solid ${stepColor}55`, borderRadius: 2, color: stepColor,
              background: stepColor + '15', textTransform: 'uppercase' }}>
              {stepLabel}
            </span>
          </div>
          <span style={{ fontSize: 7, color: '#444', fontFamily: "'IBM Plex Mono',monospace" }}>
            {fmtShort(job.dispatched_at)}
          </span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: TXT, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 2 }}>
          {job.pickup_label?.split(',').slice(0, 2).join(',')}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {job.distance_km != null && (
            <span style={{ fontSize: 8, color: ORANGE, fontFamily: "'IBM Plex Mono',monospace" }}>
              {parseFloat(job.distance_km).toFixed(1)} km
            </span>
          )}
          {job.duration_min != null && (
            <span style={{ fontSize: 8, color: MUT }}>~{job.duration_min} min</span>
          )}
          {job.tow_fee != null && (
            <span style={{ fontSize: 9, fontWeight: 700, color: GRN, fontFamily: "'IBM Plex Mono',monospace" }}>
              ${parseFloat(job.tow_fee).toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Step body */}
      <div style={{ padding: '12px 14px' }}>
        {err && (
          <div style={{ fontSize: 9, color: RED, marginBottom: 10, padding: '5px 8px',
            background: RED + '11', border: `1px solid ${RED}33`, borderRadius: 2 }}>
            {err}
          </div>
        )}

        {/* ── PENDING ── */}
        {step === 'pending' && (
          <button
            style={{ ...btnA, width: '100%', fontSize: 12, padding: '12px 0', letterSpacing: '0.08em' }}
            disabled={busy}
            onClick={() => advance({ accepted_at: new Date().toISOString() })}
          >
            {busy ? 'Accepting…' : '✓  Accept Job'}
          </button>
        )}

        {/* ── CONFIRM ROUTE ── */}
        {step === 'confirm_route' && (
          <ConfirmRoute
            job={job}
            busy={busy}
            onConfirm={(newDropoff) => {
              const now = new Date().toISOString();
              const fields = { route_confirmed_at: now };
              if (newDropoff) {
                fields.dropoff_label = newDropoff.label;
                fields.dropoff_lat   = newDropoff.lat;
                fields.dropoff_lng   = newDropoff.lng;
              }
              advance(fields);
            }}
          />
        )}

        {/* ── ACCEPTED ── */}
        {step === 'accepted' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 9, color: MUT, fontFamily: "'IBM Plex Mono',monospace" }}>
              Pickup: <span style={{ color: TXT }}>{job.pickup_label?.split(',').slice(0, 2).join(',')}</span>
            </div>
            <button
              style={{ ...btnA, width: '100%', fontSize: 11, padding: '11px 0',
                background: ORANGE + '22', border: `1px solid ${ORANGE}66`, color: ORANGE }}
              disabled={busy}
              onClick={() => advance({ en_route_pickup_at: new Date().toISOString() })}
            >
              {busy ? '…' : '▶  En Route to Pickup'}
            </button>
          </div>
        )}

        {/* ── EN ROUTE TO PICKUP ── */}
        {step === 'en_route_pickup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 9, color: MUT }}>
              Heading to: <span style={{ color: ORANGE }}>{job.pickup_label?.split(',').slice(0, 2).join(',')}</span>
            </div>
            <button
              style={{ ...btnA, width: '100%', fontSize: 11, padding: '11px 0' }}
              disabled={busy}
              onClick={() => advance({ arrived_pickup_at: new Date().toISOString() })}
            >
              {busy ? '…' : '📍  Confirm Arrival at Pickup'}
            </button>
          </div>
        )}

        {/* ── AT PICKUP — PRE-INSPECTION PHOTOS ── */}
        {step === 'at_pickup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: ORANGE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Pre-Inspection Photos
            </div>

            <div>
              <div style={{ fontSize: 8, color: MUT, marginBottom: 6 }}>
                Vehicle — {preVehicle.length} / {MIN_PRE_VEHICLE} required
              </div>
              <PhotoGrid
                photos={preVehicle}
                onAdd={file => addPhoto(file, 'pre_inspection', 'vehicle')}
                uploading={uploading}
              />
            </div>

            <div>
              <div style={{ fontSize: 8, color: MUT, marginBottom: 6 }}>
                Docket — {preDocket.length} / 1 required
              </div>
              <PhotoGrid
                photos={preDocket}
                onAdd={file => addPhoto(file, 'pre_inspection', 'docket')}
                uploading={uploading}
              />
            </div>

            {!preReady && (
              <div style={{ fontSize: 8, color: '#555' }}>
                {preVehicle.length < MIN_PRE_VEHICLE && `${MIN_PRE_VEHICLE - preVehicle.length} more vehicle photo${MIN_PRE_VEHICLE - preVehicle.length > 1 ? 's' : ''} needed`}
                {preVehicle.length < MIN_PRE_VEHICLE && preDocket.length < 1 && ' · '}
                {preDocket.length < 1 && 'docket photo needed'}
              </div>
            )}

            <button
              style={{ ...btnA, width: '100%', fontSize: 11, padding: '11px 0',
                opacity: (!preReady || busy || uploading) ? 0.35 : 1 }}
              disabled={!preReady || busy || uploading}
              onClick={() => advance({ pre_photos_at: new Date().toISOString() })}
            >
              {uploading ? 'Uploading…' : busy ? '…' : job.docket_required ? '→  Fill Docket Form' : '→  Continue to Dropoff'}
            </button>
          </div>
        )}

        {/* ── DOCKET FORM — digital paper form (trade + accident) ── */}
        {step === 'docket_form' && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#cc8844', letterSpacing: '0.08em',
              textTransform: 'uppercase', marginBottom: 14 }}>
              Docket Form
            </div>
            <DocketForm
              job={job}
              companyId={companyId}
              onComplete={() => {
                supabase.from('dispatched_jobs').select('*').eq('id', job.id).single()
                  .then(({ data }) => { if (data) { setJob(data); onUpdate?.(data); } });
              }}
            />
          </div>
        )}

        {/* ── PRE DONE — HEAD TO DROPOFF ── */}
        {step === 'pre_done' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 9, color: MUT }}>
              Dropoff: <span style={{ color: TXT }}>{dropoffLabel.split(',').slice(0, 2).join(',')}</span>
            </div>
            <button
              style={{ ...btnA, width: '100%', fontSize: 11, padding: '11px 0',
                background: ORANGE + '22', border: `1px solid ${ORANGE}66`, color: ORANGE }}
              disabled={busy}
              onClick={() => advance({ en_route_dropoff_at: new Date().toISOString() })}
            >
              {busy ? '…' : '▶  En Route to Dropoff'}
            </button>
          </div>
        )}

        {/* ── EN ROUTE TO DROPOFF ── */}
        {step === 'en_route_dropoff' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 9, color: MUT }}>
              Heading to: <span style={{ color: ORANGE }}>{dropoffLabel.split(',').slice(0, 2).join(',')}</span>
            </div>
            <button
              style={{ ...btnA, width: '100%', fontSize: 11, padding: '11px 0' }}
              disabled={busy}
              onClick={() => advance({ arrived_dropoff_at: new Date().toISOString() })}
            >
              {busy ? '…' : '📍  Confirm Arrival at Dropoff'}
            </button>
          </div>
        )}

        {/* ── AT DROPOFF — POST-TRIP PHOTOS ── */}
        {step === 'at_dropoff' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: ORANGE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Post-Trip Photos
            </div>

            <div>
              <div style={{ fontSize: 8, color: MUT, marginBottom: 6 }}>
                Vehicle — {postVehicle.length} / {MIN_POST_VEHICLE} required
              </div>
              <PhotoGrid
                photos={postVehicle}
                onAdd={file => addPhoto(file, 'post_inspection', 'vehicle')}
                uploading={uploading}
              />
            </div>

            {!postReady && (
              <div style={{ fontSize: 8, color: '#555' }}>
                {MIN_POST_VEHICLE - postVehicle.length} more photo{MIN_POST_VEHICLE - postVehicle.length > 1 ? 's' : ''} needed
              </div>
            )}

            <button
              style={{ ...btnA, width: '100%', fontSize: 11, padding: '11px 0',
                opacity: (!postReady || busy || uploading) ? 0.35 : 1 }}
              disabled={!postReady || busy || uploading}
              onClick={() => {
                const now = new Date().toISOString();
                advance({ post_photos_at: now, status: 'completed', completed_at: now });
              }}
            >
              {uploading ? 'Uploading…' : busy ? '…' : '✓  Complete Job'}
            </button>
          </div>
        )}

        {step === 'done' && (
          <div style={{ fontSize: 9, color: GRN, textAlign: 'center', padding: '6px 0' }}>
            ✓ Job complete
          </div>
        )}
      </div>
    </div>
  );
}
