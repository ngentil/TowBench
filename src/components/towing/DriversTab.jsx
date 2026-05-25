import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ACC, MUT, BRD, TXT, GRN, RED, SURF,
  inp, txa, btnA, btnG, sm, ovly, mdl, mdlH, mdlB, mdlF,
} from '../../lib/styles';
import { Highlight } from '../ui/shared';

const FL = ({ t }) => (
  <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{t}</div>
);

const STATUS_COLORS = { available: GRN, 'on job': ACC, unavailable: RED };
const STATUS_LABELS = { available: 'Available', 'on job': 'On Job', unavailable: 'Unavailable' };

function driverName(t) {
  if (t.first_name || t.last_name) return [t.first_name, t.last_name].filter(Boolean).join(' ');
  return t.driver_name || '—';
}

// ─── Edit modal ───────────────────────────────────────────────────────────────
function DriverEditModal({ truck, depots, onSave, onCancel }) {
  const [firstName,  setFirstName]  = useState(truck.first_name   || '');
  const [lastName,   setLastName]   = useState(truck.last_name    || '');
  const [daNumber,   setDaNumber]   = useState(truck.da_number    || '');
  const [depotId,    setDepotId]    = useState(truck.depot_id     || '');
  const [status,     setStatus]     = useState(truck.status       || 'available');
  const [notes,      setNotes]      = useState(truck.notes        || '');
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState('');

  const save = async () => {
    setSaving(true); setErr('');
    const { data, error } = await supabase.from('tow_trucks')
      .update({
        first_name: firstName.trim() || null,
        last_name:  lastName.trim()  || null,
        da_number:  daNumber.trim()  || null,
        depot_id:   depotId          || null,
        status,
        notes:      notes.trim()     || null,
      })
      .eq('id', truck.id)
      .select('*, depot:depots(id,name,suburb)')
      .single();
    if (error) { setErr(error.message); setSaving(false); return; }
    onSave(data);
  };

  return (
    <div style={ovly} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...mdl, maxWidth: 440 }}>
        <div style={mdlH}>
          <b style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Edit Driver · {truck.plate}
          </b>
          <button style={{ ...btnG, ...sm }} onClick={onCancel}>✕</button>
        </div>
        <div style={{ ...mdlB, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <FL t="First Name" />
              <input style={inp} value={firstName} onChange={e => setFirstName(e.target.value)} autoFocus />
            </div>
            <div>
              <FL t="Last Name" />
              <input style={inp} value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <FL t="DA Number" />
              <input style={inp} value={daNumber} onChange={e => setDaNumber(e.target.value)} placeholder="e.g. DA1234" />
            </div>
            <div>
              <FL t="Status" />
              <select style={inp} value={status} onChange={e => setStatus(e.target.value)}>
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <FL t="Assigned Yard" />
            <select style={inp} value={depotId} onChange={e => setDepotId(e.target.value)}>
              <option value="">— Unassigned —</option>
              {depots.map(d => (
                <option key={d.id} value={d.id}>{d.name}{d.suburb ? ` · ${d.suburb}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <FL t="Notes" />
            <textarea style={{ ...txa, ...inp }} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          {err && <div style={{ fontSize: 9, color: RED }}>{err}</div>}
        </div>
        <div style={mdlF}>
          <button style={btnG} onClick={onCancel}>Cancel</button>
          <button style={{ ...btnA, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Driver card ──────────────────────────────────────────────────────────────
function DriverCard({ truck, depots, isDispatch, onEdit, onApprove, searchTerm }) {
  const [open, setOpen] = useState(false);
  const depot    = depots.find(d => d.id === truck.depot_id);
  const name     = driverName(truck);
  const stColor  = STATUS_COLORS[truck.status] || MUT;
  const stLabel  = STATUS_LABELS[truck.status]  || truck.status;

  return (
    <div style={{ background: '#0d0d0d', border: '1px solid #252525',
      borderLeft: `3px solid ${truck.approved ? stColor : '#666'}`,
      borderRadius: 2, marginBottom: 6 }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: TXT }}>
              <Highlight text={name} term={searchTerm} />
            </span>
            {truck.da_number && (
              <span style={{ fontSize: 8, color: MUT, fontFamily: "'IBM Plex Mono',monospace" }}>
                <Highlight text={truck.da_number} term={searchTerm} />
              </span>
            )}
            <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', padding: '1px 5px',
              border: `1px solid ${stColor}55`, borderRadius: 2, color: stColor,
              background: stColor + '18', textTransform: 'uppercase' }}>
              {stLabel}
            </span>
            {!truck.approved && (
              <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', padding: '1px 5px',
                border: '1px solid #88661155', borderRadius: 2, color: '#aa8833',
                background: '#88661118', textTransform: 'uppercase' }}>
                Pending
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 3 }}>
            <span style={{ fontSize: 8, color: MUT }}>
              🚛 <Highlight text={truck.plate} term={searchTerm} />
            </span>
            {depot && (
              <>
                <span style={{ fontSize: 8, color: '#333' }}>·</span>
                <span style={{ fontSize: 8, color: MUT }}>{depot.name}{depot.suburb ? ` · ${depot.suburb}` : ''}</span>
              </>
            )}
            {truck.auth_email && (
              <>
                <span style={{ fontSize: 8, color: '#333' }}>·</span>
                <span style={{ fontSize: 8, color: MUT }}>
                  <Highlight text={truck.auth_email} term={searchTerm} />
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {isDispatch && !truck.approved && (
            <button onClick={e => { e.stopPropagation(); onApprove(truck); }}
              style={{ ...btnG, ...sm, fontSize: 7, color: GRN, borderColor: GRN + '55' }}>
              ✓ Approve
            </button>
          )}
          {isDispatch && (
            <button onClick={e => { e.stopPropagation(); onEdit(truck); }}
              style={{ ...btnG, ...sm, fontSize: 7 }}>Edit</button>
          )}
          <span style={{ fontSize: 8, color: MUT }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['Truck Plate',    truck.plate           || '—'],
              ['DA Number',      truck.da_number       || '—'],
              ['Yard',           depot ? `${depot.name}${depot.suburb ? ` · ${depot.suburb}` : ''}` : '—'],
              ['Email',          truck.auth_email      || '—'],
              ['Licence Address',truck.licence_address || '—'],
              ['Status',         stLabel],
              ['Approved',       truck.approved ? 'Yes' : 'No'],
            ].map(([label, val]) => (
              <div key={label} style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '6px 8px' }}>
                <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 10, color: TXT, fontFamily: "'IBM Plex Mono',monospace", wordBreak: 'break-all' }}>{val}</div>
              </div>
            ))}
          </div>
          {truck.notes && (
            <div style={{ marginTop: 10, background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 2, padding: '8px 10px', fontSize: 10, color: MUT, lineHeight: 1.6 }}>
              {truck.notes}
            </div>
          )}
          {truck.licence_photo_url && (
            <div style={{ marginTop: 10 }}>
              <FL t="Licence Photo" />
              <img src={truck.licence_photo_url} alt="Licence"
                style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 2, border: '1px solid #2a2a2a', objectFit: 'cover' }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Invite codes section ─────────────────────────────────────────────────────
function InviteCodesSection({ companyId }) {
  const [codes,     setCodes]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [generating,setGenerating]= useState(false);
  const [copied,    setCopied]    = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('invite_codes')
      .select('*')
      .eq('company_id', companyId)
      .eq('role', 'driver')
      .order('created_at', { ascending: false });
    setCodes(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    const { data, error } = await supabase.rpc('generate_invite_code', {
      p_role: 'driver',
      p_company_id: companyId,
    });
    if (!error && data) {
      await load();
    }
    setGenerating(false);
  };

  const copy = (code) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const unused = codes.filter(c => !c.used_at);
  const used   = codes.filter(c =>  c.used_at);

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: ACC, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Invite Codes
        </div>
        <button onClick={generate} disabled={generating}
          style={{ ...btnA, ...sm, opacity: generating ? 0.5 : 1 }}>
          {generating ? 'Generating…' : '+ New Code'}
        </button>
      </div>
      {loading && <div style={{ fontSize: 9, color: MUT }}>Loading…</div>}
      {!loading && unused.length === 0 && (
        <div style={{ fontSize: 9, color: MUT }}>No active invite codes. Generate one to share with a new driver.</div>
      )}
      {unused.map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0d0d0d',
          border: '1px solid #252525', borderRadius: 2, padding: '8px 12px', marginBottom: 4 }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, fontWeight: 700,
            letterSpacing: '0.18em', color: ACC, flex: 1 }}>
            {c.code}
          </span>
          <span style={{ fontSize: 7, color: MUT }}>
            {new Date(c.created_at).toLocaleDateString('en-AU')}
          </span>
          <button onClick={() => copy(c.code)}
            style={{ ...btnG, ...sm, fontSize: 7,
              color: copied === c.code ? GRN : MUT,
              borderColor: copied === c.code ? GRN + '55' : undefined }}>
            {copied === c.code ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      ))}
      {used.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 8, color: MUT, cursor: 'pointer', letterSpacing: '0.08em' }}>
            {used.length} used code{used.length !== 1 ? 's' : ''}
          </summary>
          <div style={{ marginTop: 6 }}>
            {used.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 8, color: '#333', padding: '4px 0' }}>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.1em' }}>{c.code}</span>
                <span>·</span>
                <span>{c.used_by || '—'}</span>
                <span>·</span>
                <span>{c.used_at ? new Date(c.used_at).toLocaleDateString('en-AU') : '—'}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────
export default function DriversTab({ companyId, isDispatch }) {
  const [trucks,     setTrucks]     = useState([]);
  const [depots,     setDepots]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [editTruck,  setEditTruck]  = useState(null);
  const [search,     setSearch]     = useState('');
  const [section,    setSection]    = useState('approved'); // 'approved' | 'pending'

  const load = useCallback(async () => {
    if (!companyId) return;
    const [{ data: ts }, { data: ds }] = await Promise.all([
      supabase.from('tow_trucks')
        .select('*, depot:depots(id,name,suburb)')
        .eq('company_id', companyId)
        .not('auth_email', 'is', null)
        .order('first_name'),
      supabase.from('depots').select('*').eq('company_id', companyId).order('name'),
    ]);
    setTrucks(ts || []);
    setDepots(ds || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleEdit = saved => {
    setTrucks(prev => prev.map(t => t.id === saved.id ? saved : t));
    setEditTruck(null);
  };

  const handleApprove = async truck => {
    const { data, error } = await supabase.from('tow_trucks')
      .update({ approved: true })
      .eq('id', truck.id)
      .select('*, depot:depots(id,name,suburb)')
      .single();
    if (!error && data) setTrucks(prev => prev.map(t => t.id === data.id ? data : t));
  };

  const approved = trucks.filter(t =>  t.approved);
  const pending  = trucks.filter(t => !t.approved);

  const matches = list => list.filter(t => {
    if (!search.trim()) return true;
    const q   = search.toLowerCase();
    const hay = [t.first_name, t.last_name, t.driver_name, t.da_number, t.plate, t.auth_email]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });

  const displayList = matches(section === 'pending' ? pending : approved);

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      {editTruck && (
        <DriverEditModal
          truck={editTruck}
          depots={depots}
          onSave={handleEdit}
          onCancel={() => setEditTruck(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>👤 Drivers</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            <span style={{ color: ACC }}>· {approved.length} active</span>
            {pending.length > 0 && <span style={{ marginLeft: 8, color: '#aa8833' }}>· {pending.length} pending</span>}
          </div>
        </div>
      </div>

      {/* Section toggles */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {[
          { id: 'approved', label: `Active (${approved.length})` },
          { id: 'pending',  label: `Pending (${pending.length})`, hide: !isDispatch && pending.length === 0 },
        ].filter(s => !s.hide).map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            style={{ ...btnG, ...sm, fontSize: 8,
              background: section === s.id ? ACC + '22' : '#0d0d0d',
              border: `1px solid ${section === s.id ? ACC : '#2a2a2a'}`,
              color: section === s.id ? ACC : MUT }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, DA number, plate, email…"
          style={{ ...inp, fontSize: 11 }} />
      </div>

      {loading && <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0' }}>Loading…</div>}

      {!loading && displayList.length === 0 && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0' }}>
          {section === 'pending' ? 'No pending drivers.' : 'No active drivers found.'}
        </div>
      )}

      {displayList.map(t => (
        <DriverCard
          key={t.id}
          truck={t}
          depots={depots}
          isDispatch={isDispatch}
          onEdit={setEditTruck}
          onApprove={handleApprove}
          searchTerm={search.trim()}
        />
      ))}

      {isDispatch && <InviteCodesSection companyId={companyId} />}
    </div>
  );
}
