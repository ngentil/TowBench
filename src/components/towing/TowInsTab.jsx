import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, BRD, TXT, GRN, RED, SURF, inp, sel, txa, btnA, btnG, btnD, sm, ovly, mdl, mdlH, mdlB, mdlF } from '../../lib/styles';
import { Highlight } from '../ui/shared';

const FL = ({ t }) => (
  <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{t}</div>
);

const VEHICLE_TYPES  = [{ v: 'motor_car', l: 'Motor Car' }, { v: 'motorcycle', l: 'Motorcycle' }];
const STORAGE_TYPES  = [{ v: 'undercover', l: 'Under Cover' }, { v: 'locked_yard', l: 'Locked Yard' }];
const FLAG_FIELDS    = [
  { key: 'has_photos', label: 'Photos' },
  { key: 'has_keys',   label: 'Keys' },
  { key: 'stolen',     label: 'Stolen' },
  { key: 'evidence',   label: 'Evidence' },
  { key: 'impound',    label: 'Impound' },
  { key: 'trade',      label: 'Trade' },
  { key: 'insurance',  label: 'Insurance' },
];

const FLAG_COLORS = {
  stolen:   '#cc2222',
  evidence: '#8844cc',
  impound:  '#2266cc',
  trade:    '#2299aa',
  insurance:'#aa6622',
  has_photos: GRN,
  has_keys:   GRN,
};

function daysIn(dateIn, dateOut) {
  const end   = dateOut ? new Date(dateOut) : new Date();
  const start = new Date(dateIn);
  return Math.max(0, Math.ceil((end - start) / 86400000));
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

function toLocalDatetimeValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

function TowInForm({ record, depots, userEmail, companyId, onSave, onCancel }) {
  const isEdit = !!record?.id;

  const [plate,       setPlate]       = useState(record?.plate        || '');
  const [vtype,       setVtype]       = useState(record?.vehicle_type || 'motor_car');
  const [makeModel,   setMakeModel]   = useState(record?.make_model   || '');
  const [storageType, setStorageType] = useState(record?.storage_type || 'locked_yard');
  const [depotId,     setDepotId]     = useState(record?.depot_id     || (depots.length === 1 ? depots[0].id : '') );
  const [dateIn,      setDateIn]      = useState(record?.date_in      ? toLocalDatetimeValue(record.date_in) : toLocalDatetimeValue(new Date().toISOString()));
  const [dateOut,     setDateOut]     = useState(record?.date_out     ? toLocalDatetimeValue(record.date_out) : '');
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
    if (!plate.trim())  { setErr('Vehicle plate is required.'); return; }
    if (!depotId)       { setErr('Select a yard.'); return; }
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

  const fld = { ...inp };

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
              <input style={fld} value={plate}
                onChange={e => setPlate(e.target.value.toUpperCase())}
                placeholder="e.g. ABC123" autoCapitalize="characters" autoFocus />
            </div>
            <div>
              <FL t="Make / Model" />
              <input style={fld} value={makeModel}
                onChange={e => setMakeModel(e.target.value)}
                placeholder="e.g. Toyota Camry" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <FL t="Vehicle Type" />
              <select style={fld} value={vtype} onChange={e => setVtype(e.target.value)}>
                {VEHICLE_TYPES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div>
              <FL t="Storage Type" />
              <select style={fld} value={storageType} onChange={e => setStorageType(e.target.value)}>
                {STORAGE_TYPES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          </div>
          {depots.length > 1 && (
            <div>
              <FL t="Yard *" />
              <select style={fld} value={depotId} onChange={e => setDepotId(e.target.value)}>
                <option value="">— Select yard —</option>
                {depots.map(d => <option key={d.id} value={d.id}>{d.name}{d.suburb ? ` · ${d.suburb}` : ''}</option>)}
              </select>
            </div>
          )}
          {depots.length === 1 && (
            <div style={{ fontSize: 8, color: MUT }}>
              Yard: <span style={{ color: TXT }}>{depots[0].name}{depots[0].suburb ? ` · ${depots[0].suburb}` : ''}</span>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <FL t="Date In *" />
              <input type="datetime-local" style={fld} value={dateIn} onChange={e => setDateIn(e.target.value)} />
            </div>
            <div>
              <FL t="Date Out (if released)" />
              <input type="datetime-local" style={fld} value={dateOut} onChange={e => setDateOut(e.target.value)} />
            </div>
          </div>
          <div>
            <FL t="Notes" />
            <textarea style={{ ...txa, ...fld }} value={notes}
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

function TowInCard({ record, depots, isDispatch, onEdit, onRelease, searchTerm }) {
  const [open, setOpen] = useState(false);
  const depot   = depots.find(d => d.id === record.depot_id);
  const days    = daysIn(record.date_in, record.date_out);
  const released = !!record.date_out;
  const activeFlags = FLAG_FIELDS.filter(({ key }) => record[key]);

  return (
    <div style={{ background: '#0d0d0d', border: '1px solid #252525',
      borderLeft: `3px solid ${released ? '#333' : ACC}`, borderRadius: 2, marginBottom: 6 }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: TXT, letterSpacing: '0.1em' }}>
              <Highlight text={record.plate} term={searchTerm} />
            </span>
            {record.make_model && (
              <span style={{ fontSize: 9, color: MUT }}><Highlight text={record.make_model} term={searchTerm} /></span>
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
            {depot && (
              <>
                <span style={{ fontSize: 8, color: '#333' }}>·</span>
                <span style={{ fontSize: 8, color: MUT }}>{depot.name}</span>
              </>
            )}
            <span style={{ fontSize: 8, color: '#333' }}>·</span>
            <span style={{ fontSize: 8, color: released ? MUT : ACC, fontWeight: released ? 400 : 700 }}>
              {days} day{days !== 1 ? 's' : ''}
            </span>
          </div>
          {!open && activeFlags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
              {activeFlags.map(({ key, label }) => <FlagBadge key={key} flagKey={key} label={label} />)}
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
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
          <span style={{ fontSize: 8, color: MUT }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['Date In',      fmtDate(record.date_in)],
              ['Date Out',     record.date_out ? fmtDate(record.date_out) : '—'],
              ['Days in Storage', `${days} day${days !== 1 ? 's' : ''}`],
              ['Yard',         depot ? `${depot.name}${depot.suburb ? ` · ${depot.suburb}` : ''}` : '—'],
              ['Vehicle Type', record.vehicle_type === 'motor_car' ? 'Motor Car' : 'Motorcycle'],
              ['Storage',      record.storage_type === 'undercover' ? 'Under Cover' : 'Locked Yard'],
              ['Logged by',    record.created_by?.split('@')[0] || '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '6px 8px' }}>
                <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 10, color: TXT, fontFamily: "'IBM Plex Mono',monospace" }}>{val}</div>
              </div>
            ))}
          </div>
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

export default function TowInsTab({ companyId, userEmail, isDispatch }) {
  const [records,    setRecords]    = useState([]);
  const [depots,     setDepots]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [filter,     setFilter]     = useState('active'); // 'active' | 'released' | 'all'
  const [yardFilter, setYardFilter] = useState('all');
  const [search,     setSearch]     = useState('');

  const load = useCallback(async () => {
    if (!companyId) return;
    const [{ data: recs }, { data: deps }] = await Promise.all([
      supabase.from('tow_ins').select('*').eq('company_id', companyId).order('date_in', { ascending: false }),
      supabase.from('depots').select('*').eq('company_id', companyId).order('name'),
    ]);
    setRecords(recs || []);
    setDepots(deps || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = (saved) => {
    setRecords(prev => {
      const idx = prev.findIndex(r => r.id === saved.id);
      return idx >= 0 ? prev.map(r => r.id === saved.id ? saved : r) : [saved, ...prev];
    });
    setShowForm(false);
    setEditRecord(null);
  };

  const handleRelease = async (record) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('tow_ins')
      .update({ date_out: now }).eq('id', record.id).select().single();
    if (!error && data) setRecords(prev => prev.map(r => r.id === data.id ? data : r));
  };

  const filtered = records.filter(r => {
    if (filter === 'active'   && r.date_out)  return false;
    if (filter === 'released' && !r.date_out) return false;
    if (yardFilter !== 'all'  && r.depot_id !== yardFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = [r.plate, r.make_model, r.notes].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const activeCount   = records.filter(r => !r.date_out).length;
  const releasedCount = records.filter(r =>  r.date_out).length;

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      {(showForm || editRecord) && (
        <TowInForm
          record={editRecord}
          depots={depots}
          userEmail={userEmail}
          companyId={companyId}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditRecord(null); }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>🏭 Tow Ins</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            {activeCount > 0 && <span style={{ color: ACC }}>· {activeCount} in storage</span>}
            {releasedCount > 0 && <span style={{ marginLeft: 8 }}>· {releasedCount} released</span>}
          </div>
        </div>
        <button onClick={() => { setEditRecord(null); setShowForm(true); }}
          style={{ ...btnA, ...sm }}>
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
        {depots.length > 1 && (
          <select value={yardFilter} onChange={e => setYardFilter(e.target.value)}
            style={{ ...btnG, ...sm, fontSize: 8, cursor: 'pointer', background: '#0d0d0d' }}>
            <option value="all">All Yards</option>
            {depots.map(d => <option key={d.id} value={d.id}>{d.name}{d.suburb ? ` · ${d.suburb}` : ''}</option>)}
          </select>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search plate, make/model, notes…"
          style={{ ...inp, fontSize: 11 }} />
      </div>

      {loading && <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0' }}>Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0', lineHeight: 1.8 }}>
          No tow-ins found.<br />
          <span style={{ fontSize: 8 }}>
            <button onClick={() => { setEditRecord(null); setShowForm(true); }}
              style={{ ...btnA, ...sm, marginTop: 10 }}>Log First Tow In</button>
          </span>
        </div>
      )}

      {/* Group by yard if showing all yards */}
      {!loading && filtered.length > 0 && (
        yardFilter === 'all' && depots.length > 1
          ? depots.map(d => {
              const yardRecs = filtered.filter(r => r.depot_id === d.id);
              if (yardRecs.length === 0) return null;
              return (
                <div key={d.id} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 8, color: ACC, letterSpacing: '0.14em', textTransform: 'uppercase',
                    fontWeight: 700, marginBottom: 8, borderLeft: `2px solid ${ACC}`, paddingLeft: 6 }}>
                    {d.name}{d.suburb ? ` · ${d.suburb}` : ''} ({yardRecs.length})
                  </div>
                  {yardRecs.map(r => (
                    <TowInCard key={r.id} record={r} depots={depots} isDispatch={isDispatch}
                      onEdit={setEditRecord} onRelease={handleRelease} searchTerm={search.trim()} />
                  ))}
                </div>
              );
            })
          : filtered.map(r => (
              <TowInCard key={r.id} record={r} depots={depots} isDispatch={isDispatch}
                onEdit={setEditRecord} onRelease={handleRelease} />
            ))
      )}
    </div>
  );
}
