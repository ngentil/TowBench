import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ACC, MUT, BRD, TXT, GRN, RED, SURF, inp, sel, txa, btnA, btnG, btnD, sm, ovly, mdl, mdlH, mdlB, mdlF } from '../../lib/styles';
import { FL } from '../ui/shared';
import { supabase } from '../../lib/supabase';
import { getTrucks, upsertTruck } from '../../lib/db/towing';
import { RosterCalendar, MiniRoster } from './RosterCalendar';
import {
  getTools, upsertTool, deleteTool,
  getEquipment, upsertEquipment, deleteEquipment,
  getConsumables, upsertConsumable, deleteConsumable,
  getAssignments, assignAsset, unassignAsset,
} from '../../lib/db/truckAssets';

const ORANGE = '#e8870a';
const BLUE   = '#5a7a9a';

// Vehicle types grouped for dropdown — ordered by how common they are in a tow yard
export const TRUCK_TYPES = [
  { group: 'Tow Trucks',         options: [
    'Tilt Tray (Slide-Back)',
    'Super Tilt',
    'Wheel-Lift Tow Truck',
    'Integrated Carrier',
    'Underlift / Sling Tow',
    'Flatbed Wrecker',
  ]},
  { group: 'Recovery',           options: [
    'Light Duty Wrecker',
    'Medium Duty Wrecker',
    'Heavy Duty Wrecker',
    'Semi Recovery (Rotator)',
  ]},
  { group: 'Multi-Vehicle Carriers', options: [
    'Single Car Carrier',
    '2-Car Carrier',
    '3-Car Carrier',
    '4-Car Carrier',
    '6-Car Carrier',
    '8-Car Carrier',
    'B-Double Carrier (10+)',
    'Enclosed Transporter',
  ]},
  { group: 'Specialised',        options: [
    'Motorcycle Recovery',
    'Boat / Trailer Recovery',
    'Bus / Coach Recovery',
    'Machinery / Plant Transport',
  ]},
  { group: 'Yard & Support',     options: [
    'Service Van',
    'Roadside Assist Van',
    'Parts Runner',
    'Yard Shunter',
    'Forklift',
    'Utility Vehicle',
  ]},
];

// Flat list for lookups
const ALL_TRUCK_TYPES = TRUCK_TYPES.flatMap(g => g.options);

function truckEmoji(type) {
  if (!type) return '🚛';
  if (type.includes('Motorcycle'))               return '🏍️';
  if (type.includes('Forklift'))                 return '🏗️';
  if (type.includes('Van') || type.includes('Roadside') || type.includes('Parts') || type.includes('Utility')) return '🚐';
  if (type.includes('Heavy Duty') || type.includes('Semi Recovery') || type.includes('Bus') || type.includes('Machinery')) return '🏗️';
  if (type.includes('Carrier') || type.includes('Transporter')) return '🚌';
  return '🚛';
}

const STATUS_OPTIONS = ['available', 'on job', 'unavailable'];

const DAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const OVERRIDE_REASONS = ['Holiday', 'Sick Leave', 'Truck in Service', 'Suspended', 'Other'];

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusColor(s) {
  if (s === 'available')   return GRN;
  if (s === 'on job')      return ORANGE;
  if (s === 'unavailable') return RED;
  return MUT;
}

function StatusBadge({ status }) {
  const c = statusColor(status);
  return (
    <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px', border: `1px solid ${c}55`, borderRadius: 2, color: c, background: c + '15', textTransform: 'uppercase' }}>
      {status}
    </span>
  );
}

function TruckForm({ truck, onSave, onCancel }) {
  const [plate,     setPlate]     = useState(truck?.plate      || '');
  const [truckType, setTruckType] = useState(truck?.truck_type || '');
  const [status,    setStatus]    = useState(truck?.status     || 'available');
  const [notes,     setNotes]     = useState(truck?.notes      || '');
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState('');

  const fld = { background: '#0a0a0a', border: '1px solid #252525', color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, padding: '6px 8px', borderRadius: 2, outline: 'none', boxSizing: 'border-box', width: '100%' };

  const save = async () => {
    if (!plate.trim()) { setErr('Plate required'); return; }
    if (!truckType)    { setErr('Select a vehicle type'); return; }
    setSaving(true); setErr('');
    try {
      await onSave({
        ...truck,
        plate:      plate.trim().toUpperCase(),
        truck_type: truckType,
        status,
        notes:      notes.trim() || null,
        approved:   true,
      });
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <div style={ovly} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...mdl, maxWidth: 420, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={mdlH}>
          <b style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{truck?.id ? 'Edit Truck' : 'Add Truck'}</b>
          <button style={{ ...btnG, ...sm }} onClick={onCancel}>✕</button>
        </div>
        <div style={{ ...mdlB, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Plate */}
          <div>
            <FL t="Number Plate *" />
            <input style={{ ...fld, fontSize: 15, letterSpacing: '0.15em', textTransform: 'uppercase' }}
              value={plate} onChange={e => setPlate(e.target.value.toUpperCase())}
              placeholder="e.g. TOW933" autoFocus />
          </div>

          {/* Vehicle type */}
          <div>
            <FL t="Vehicle Type *" />
            <select style={{ ...sel, width: '100%', fontSize: 11 }} value={truckType} onChange={e => setTruckType(e.target.value)}>
              <option value="">— Select type —</option>
              {TRUCK_TYPES.map(group => (
                <optgroup key={group.group} label={group.group}>
                  {group.options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {truckType && (
              <div style={{ marginTop: 5, fontSize: 9, color: MUT, fontFamily: "'IBM Plex Mono',monospace" }}>
                {truckEmoji(truckType)} {truckType}
              </div>
            )}
          </div>

          {/* Status */}
          <div>
            <FL t="Status" />
            <select style={{ ...sel, width: '100%' }} value={status} onChange={e => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <FL t="Notes (optional)" />
            <textarea style={{ ...txa, minHeight: 48 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Every second weekend on call…" />
          </div>

          {err && <div style={{ fontSize: 9, color: RED }}>{err}</div>}
        </div>
        <div style={mdlF}>
          <button style={btnG} onClick={onCancel}>Cancel</button>
          <button style={{ ...btnA, opacity: saving || !plate.trim() || !truckType ? 0.4 : 1 }}
            disabled={saving || !plate.trim() || !truckType} onClick={save}>
            {saving ? 'Saving…' : truck?.id ? 'Save Changes' : 'Add Truck'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AvailabilityModal({ truck, onSave, onCancel }) {
  const hasRelief = !!(truck.relief_driver_name || truck.relief_da_number);
  const [unavailable,  setUnavailable]  = useState(!!truck.override_active);
  const [reason,       setReason]       = useState(truck.override_reason      || OVERRIDE_REASONS[0]);
  const [returnDate,   setReturnDate]   = useState(truck.override_return_date || '');
  const [reliefName,   setReliefName]   = useState(truck.relief_driver_name   || '');
  const [reliefDA,     setReliefDA]     = useState(truck.relief_da_number     || '');
  const [reliefSched,  setReliefSched]  = useState(truck.relief_schedule      || {});
  const [showRelief,   setShowRelief]   = useState(hasRelief);
  const [saving,       setSaving]       = useState(false);
  const [err,          setErr]          = useState('');
  const fld = { background: '#0a0a0a', border: '1px solid #252525', color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, padding: '6px 8px', borderRadius: 2, outline: 'none', boxSizing: 'border-box', width: '100%' };

  const handleClear = async () => {
    setSaving(true);
    try { await onSave({ ...truck, override_active: false, override_reason: null, override_return_date: null, relief_driver_name: null, relief_da_number: null, relief_schedule: {}, status: 'available' }); }
    catch (e) { setErr(e.message); setSaving(false); }
  };

  const handleSave = async () => {
    setSaving(true); setErr('');
    try {
      await onSave({
        ...truck,
        override_active:      unavailable,
        override_reason:      unavailable ? reason : null,
        override_return_date: unavailable && returnDate ? returnDate : null,
        relief_driver_name:   showRelief && reliefName.trim() ? reliefName.trim() : null,
        relief_da_number:     showRelief && reliefDA.trim()   ? reliefDA.trim()   : null,
        relief_schedule:      showRelief ? reliefSched : {},
        status:               unavailable && !showRelief ? 'unavailable' : truck.status,
      });
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div style={ovly} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...mdl, maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={mdlH}>
          <div>
            <b style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Availability — {truck.plate}</b>
            {truck.driver_name && <div style={{ fontSize: 8, color: MUT, marginTop: 2 }}>{truck.driver_name}{truck.da_number ? ` · DA ${truck.da_number}` : ''}</div>}
          </div>
          <button style={{ ...btnG, ...sm }} onClick={onCancel}>✕</button>
        </div>
        <div style={{ ...mdlB, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: unavailable ? RED + '11' : '#0a0a0a', border: `1px solid ${unavailable ? RED + '44' : '#252525'}`, borderRadius: 2, padding: '10px 12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <div onClick={() => setUnavailable(u => !u)} style={{ width: 36, height: 20, borderRadius: 10, background: unavailable ? RED : '#2a2a2a', position: 'relative', flexShrink: 0, transition: 'background 0.2s', cursor: 'pointer' }}>
                <div style={{ width: 14, height: 14, borderRadius: 7, background: '#fff', position: 'absolute', top: 3, left: unavailable ? 19 : 3, transition: 'left 0.2s' }} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: unavailable ? RED : TXT }}>Temporarily Unavailable</div>
                <div style={{ fontSize: 8, color: MUT, marginTop: 1 }}>Holiday, sick leave, truck in service, etc.</div>
              </div>
            </label>
            {unavailable && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><FL t="Reason" /><select style={{ ...sel, width: '100%' }} value={reason} onChange={e => setReason(e.target.value)}>{OVERRIDE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                  <div><FL t="Return Date (optional)" /><input type="date" style={fld} value={returnDate} onChange={e => setReturnDate(e.target.value)} /></div>
                </div>
              </div>
            )}
          </div>
          <div style={{ border: '1px solid #252525', borderRadius: 2, overflow: 'hidden' }}>
            <div onClick={() => setShowRelief(s => !s)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: showRelief ? ACC + '11' : '#0a0a0a', cursor: 'pointer', borderBottom: showRelief ? '1px solid #1a1a1a' : 'none' }}>
              <div>
                <span style={{ fontSize: 10, fontWeight: 700, color: showRelief ? ACC : TXT }}>Relief Driver</span>
                <span style={{ fontSize: 8, color: MUT, marginLeft: 8 }}>Different driver covering this truck</span>
              </div>
              <span style={{ fontSize: 9, color: MUT }}>{showRelief ? '▲' : '▼'}</span>
            </div>
            {showRelief && (
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><FL t="Driver Name" /><input style={fld} value={reliefName} onChange={e => setReliefName(e.target.value)} placeholder="e.g. Jane Smith" /></div>
                  <div><FL t="DA Number" /><input style={fld} value={reliefDA} onChange={e => setReliefDA(e.target.value)} placeholder="e.g. 99999" /></div>
                </div>
                <div><FL t="Availability Roster" /><RosterCalendar value={reliefSched} onChange={setReliefSched} /></div>
              </div>
            )}
          </div>
          {err && <div style={{ fontSize: 9, color: RED }}>{err}</div>}
        </div>
        <div style={mdlF}>
          {(truck.override_active || truck.relief_driver_name) && (
            <button style={{ ...btnD, marginRight: 'auto' }} onClick={handleClear} disabled={saving}>Clear Override</button>
          )}
          <button style={btnG} onClick={onCancel}>Cancel</button>
          <button style={{ ...btnA, opacity: saving ? 0.4 : 1 }} disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

const ASSET_TABS = [
  { id: 'tool',        label: '🔧 Tools',       icon: '🔧' },
  { id: 'equipment',   label: '⚙️ Equipment',   icon: '⚙️' },
  { id: 'consumable',  label: '🧴 Consumables', icon: '🧴' },
];

const ASSET_COLORS = {
  tool:       { badge: '#4a7a3a', bg: '#0a1a08' },
  equipment:  { badge: '#2a5a8a', bg: '#08121a' },
  consumable: { badge: '#7a4a1a', bg: '#1a1008' },
};

const TOOL_CATEGORIES = [
  'Recovery & Rigging', 'Lifting & Jacking', 'Strapping & Tie-Down',
  'Cutting & Grinding', 'Hand Tools', 'Power Tools',
  'Measuring & Diagnostic', 'Safety & PPE', 'Other',
];
const TOOL_CONDITIONS = ['New', 'Good', 'Fair', 'Poor'];
const EQUIP_STATUSES  = ['Active', 'Inactive', 'In Service', 'Sold'];

const CONSUMABLE_CATEGORIES = [
  'Fluids & Lubricants', 'Straps & Rope', 'PPE & Safety',
  'Cleaning & Degreaser', 'Fasteners & Hardware', 'Tow & Recovery Supplies',
  'First Aid', 'Other',
];
const CONSUMABLE_UNITS = ['each', 'pair', 'box', 'roll', 'L', 'kg', 'set', 'pack'];

function PhotoPicker({ photos, setPhotos }) {
  const camRef = useRef();
  const galRef = useRef();

  const handle = e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    Promise.all(files.map(f => new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(f);
    }))).then(urls => setPhotos(prev => [...prev, ...urls]));
    e.target.value = '';
  };

  return (
    <div>
      <FL t="Photos" />
      {photos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 8 }}>
          {photos.map((p, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={p} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 2, border: '1px solid #252525', display: 'block' }} />
              <button type="button" onClick={() => setPhotos(ps => ps.filter((_, j) => j !== i))}
                style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.85)', border: 'none', color: '#ccc', width: 18, height: 18, borderRadius: '50%', cursor: 'pointer', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={handle} style={{ display: 'none' }} />
        <input ref={galRef} type="file" accept="image/*" multiple onChange={handle} style={{ display: 'none' }} />
        <button type="button" onClick={() => camRef.current.click()} style={{ ...btnG, flex: 1, fontSize: 9, padding: '8px 0', letterSpacing: '0.06em' }}>📷 Camera</button>
        <button type="button" onClick={() => galRef.current.click()} style={{ ...btnG, flex: 1, fontSize: 9, padding: '8px 0', letterSpacing: '0.06em' }}>🖼 Gallery</button>
      </div>
    </div>
  );
}

const fld = {
  background: '#0a0a0a', border: '1px solid #252525', color: TXT,
  fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, padding: '6px 8px',
  borderRadius: 2, outline: 'none', width: '100%', boxSizing: 'border-box',
};

function ToolForm({ tool, onSave, onCancel }) {
  const isEdit = !!tool?.id;
  const [f, setF] = useState({
    name:            tool?.name            || '',
    brand:           tool?.brand           || '',
    model:           tool?.model           || '',
    category:        tool?.category        || '',
    condition:       tool?.condition       || 'Good',
    purchase_date:   tool?.purchase_date   || '',
    purchase_price:  tool?.purchase_price  != null ? String(tool.purchase_price) : '',
    warranty_expiry: tool?.warranty_expiry || '',
    storage_location:tool?.storage_location|| '',
    notes:           tool?.notes           || '',
  });
  const [photos,  setPhotos] = useState(tool?.photos || []);
  const [saving,  setSaving] = useState(false);
  const [err,     setErr]    = useState('');
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) { setErr('Name required'); return; }
    setSaving(true); setErr('');
    try {
      const item = await upsertTool({
        ...tool,
        name:             f.name.trim(),
        brand:            f.brand.trim()  || null,
        model:            f.model.trim()  || null,
        category:         f.category      || null,
        condition:        f.condition,
        purchase_date:    f.purchase_date || null,
        purchase_price:   parseFloat(f.purchase_price) || 0,
        warranty_expiry:  f.warranty_expiry || null,
        storage_location: f.storage_location.trim() || null,
        notes:            f.notes.trim()  || null,
        photos,
      });
      onSave(item);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div style={ovly} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...mdl, maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={mdlH}>
          <b style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{isEdit ? 'Edit Tool' : 'Add Tool'}</b>
          <button style={{ ...btnG, ...sm }} onClick={onCancel}>✕</button>
        </div>
        <div style={{ ...mdlB, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <FL t="Tool Name *" />
            <input style={fld} value={f.name} onChange={e => s('name', e.target.value)} placeholder="e.g. Angle Grinder" autoFocus />
          </div>
          <div><FL t="Brand" /><input style={fld} value={f.brand} onChange={e => s('brand', e.target.value)} placeholder="e.g. Makita" /></div>
          <div><FL t="Model" /><input style={fld} value={f.model} onChange={e => s('model', e.target.value)} placeholder="e.g. GA5030" /></div>
          <div>
            <FL t="Category" />
            <select style={{ ...sel, width: '100%' }} value={f.category} onChange={e => s('category', e.target.value)}>
              <option value="">— select —</option>
              {TOOL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <FL t="Condition" />
            <select style={{ ...sel, width: '100%' }} value={f.condition} onChange={e => s('condition', e.target.value)}>
              {TOOL_CONDITIONS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div><FL t="Purchase Date" /><input style={fld} type="date" value={f.purchase_date} onChange={e => s('purchase_date', e.target.value)} /></div>
          <div><FL t="Purchase Price ($)" /><input style={fld} type="number" min="0" step="0.01" value={f.purchase_price} onChange={e => s('purchase_price', e.target.value)} placeholder="0.00" /></div>
          <div style={{ gridColumn: '1/-1' }}>
            <FL t="Warranty Expires" />
            <input style={{ ...fld, width: 'calc(50% - 5px)', boxSizing: 'border-box' }} type="date" value={f.warranty_expiry} onChange={e => s('warranty_expiry', e.target.value)} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <FL t="Storage Location" />
            <input style={fld} value={f.storage_location} onChange={e => s('storage_location', e.target.value)} placeholder="e.g. Top box, middle drawer" />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <FL t="Notes" />
            <textarea style={{ ...txa, minHeight: 50 }} value={f.notes} onChange={e => s('notes', e.target.value)} placeholder="e.g. 115mm disc, 11,000 RPM" />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <PhotoPicker photos={photos} setPhotos={setPhotos} />
          </div>
        </div>
        {err && <div style={{ padding: '6px 16px', fontSize: 9, color: RED }}>⚠ {err}</div>}
        <div style={mdlF}>
          <button style={btnG} onClick={onCancel}>Cancel</button>
          <button style={{ ...btnA, opacity: f.name.trim() && !saving ? 1 : 0.4 }} disabled={!f.name.trim() || saving} onClick={save}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Tool'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EquipmentForm({ item, onSave, onCancel }) {
  const isEdit = !!item?.id;
  const [f, setF] = useState({
    name:     item?.name     || '',
    brand:    item?.brand    || '',
    model:    item?.model    || '',
    category: item?.category || '',
    serial_no:item?.serial_no|| '',
    status:   item?.status   || 'Active',
    year:     item?.year     ? String(item.year) : '',
    hours:    item?.hours    != null ? String(item.hours) : '',
    location: item?.location || '',
    notes:    item?.notes    || '',
  });
  const [photos,  setPhotos] = useState(item?.photos || []);
  const [saving,  setSaving] = useState(false);
  const [err,     setErr]    = useState('');
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) { setErr('Name required'); return; }
    setSaving(true); setErr('');
    try {
      const saved = await upsertEquipment({
        ...item,
        name:     f.name.trim(),
        brand:    f.brand.trim()  || null,
        model:    f.model.trim()  || null,
        category: f.category      || null,
        serial_no:f.serial_no.trim() || null,
        status:   f.status,
        year:     f.year ? parseInt(f.year) : null,
        hours:    f.hours !== '' ? parseFloat(f.hours) : null,
        location: f.location.trim() || null,
        notes:    f.notes.trim()  || null,
        photos,
      });
      onSave(saved);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div style={ovly} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...mdl, maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={mdlH}>
          <b style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{isEdit ? 'Edit Equipment' : 'Add Equipment'}</b>
          <button style={{ ...btnG, ...sm }} onClick={onCancel}>✕</button>
        </div>
        <div style={{ ...mdlB, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <FL t="Name *" />
            <input style={fld} value={f.name} onChange={e => s('name', e.target.value)} placeholder="e.g. Air Compressor" autoFocus />
          </div>
          <div><FL t="Brand / Make" /><input style={fld} value={f.brand} onChange={e => s('brand', e.target.value)} placeholder="e.g. DeWalt" /></div>
          <div><FL t="Model" /><input style={fld} value={f.model} onChange={e => s('model', e.target.value)} placeholder="e.g. D55146" /></div>
          <div><FL t="Serial / Asset No." /><input style={fld} value={f.serial_no} onChange={e => s('serial_no', e.target.value)} placeholder="e.g. SN-001" /></div>
          <div>
            <FL t="Status" />
            <select style={{ ...sel, width: '100%' }} value={f.status} onChange={e => s('status', e.target.value)}>
              {EQUIP_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div><FL t="Year" /><input style={fld} type="number" min="1900" max="2099" value={f.year} onChange={e => s('year', e.target.value)} placeholder="e.g. 2022" /></div>
          <div><FL t="Hours" /><input style={fld} type="number" min="0" step="0.1" value={f.hours} onChange={e => s('hours', e.target.value)} placeholder="0" /></div>
          <div style={{ gridColumn: '1/-1' }}>
            <FL t="Location / Storage" />
            <input style={fld} value={f.location} onChange={e => s('location', e.target.value)} placeholder="e.g. Depot 1, left bay" />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <FL t="Notes" />
            <textarea style={{ ...txa, minHeight: 50 }} value={f.notes} onChange={e => s('notes', e.target.value)} placeholder="e.g. Next service at 500 hrs" />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <PhotoPicker photos={photos} setPhotos={setPhotos} />
          </div>
        </div>
        {err && <div style={{ padding: '6px 16px', fontSize: 9, color: RED }}>⚠ {err}</div>}
        <div style={mdlF}>
          <button style={btnG} onClick={onCancel}>Cancel</button>
          <button style={{ ...btnA, opacity: f.name.trim() && !saving ? 1 : 0.4 }} disabled={!f.name.trim() || saving} onClick={save}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Equipment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsumableForm({ item, onSave, onCancel }) {
  const isEdit = !!item?.id;
  const [f, setF] = useState({
    name:     item?.name     || '',
    brand:    item?.brand    || '',
    category: item?.category || '',
    unit:     item?.unit     || 'each',
    notes:    item?.notes    || '',
  });
  const [photos,  setPhotos] = useState(item?.photos || []);
  const [saving,  setSaving] = useState(false);
  const [err,     setErr]    = useState('');
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) { setErr('Name required'); return; }
    setSaving(true); setErr('');
    try {
      const saved = await upsertConsumable({
        ...item,
        name:     f.name.trim(),
        brand:    f.brand.trim()    || null,
        category: f.category        || null,
        unit:     f.unit            || 'each',
        notes:    f.notes.trim()    || null,
        photos,
      });
      onSave(saved);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div style={ovly} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...mdl, maxWidth: 420, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={mdlH}>
          <b style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{isEdit ? 'Edit Consumable' : 'Add Consumable'}</b>
          <button style={{ ...btnG, ...sm }} onClick={onCancel}>✕</button>
        </div>
        <div style={{ ...mdlB, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <FL t="Category" />
            <select style={{ ...sel, width: '100%' }} value={f.category} onChange={e => s('category', e.target.value)}>
              <option value="">— no category —</option>
              {CONSUMABLE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <FL t="Name *" />
            <input style={fld} value={f.name} onChange={e => s('name', e.target.value)} placeholder="e.g. Nitrile Gloves" autoFocus />
          </div>
          <div><FL t="Brand" /><input style={fld} value={f.brand} onChange={e => s('brand', e.target.value)} placeholder="e.g. Ansell" /></div>
          <div>
            <FL t="Unit" />
            <select style={{ ...sel, width: '100%' }} value={f.unit} onChange={e => s('unit', e.target.value)}>
              {CONSUMABLE_UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <FL t="Notes" />
            <textarea style={{ ...txa, minHeight: 40 }} value={f.notes} onChange={e => s('notes', e.target.value)} placeholder="e.g. Size L, reorder when 2 boxes left" />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <PhotoPicker photos={photos} setPhotos={setPhotos} />
          </div>
        </div>
        {err && <div style={{ padding: '6px 16px', fontSize: 9, color: RED }}>⚠ {err}</div>}
        <div style={mdlF}>
          <button style={btnG} onClick={onCancel}>Cancel</button>
          <button style={{ ...btnA, opacity: f.name.trim() && !saving ? 1 : 0.4 }} disabled={!f.name.trim() || saving} onClick={save}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Consumable'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssetPickerModal({ truck, catalogue: initialCatalogue, onCatalogueChange, onClose, onAssigned }) {
  const [activeTab,   setActiveTab]   = useState('tool');
  const [catalogue,   setCatalogue]   = useState(initialCatalogue);
  const [assignments, setAssignments] = useState([]);
  const [search,      setSearch]      = useState('');
  const [showNew,     setShowNew]     = useState(false);
  const [editItem,    setEditItem]    = useState(null);
  const [assigning,   setAssigning]   = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState('');

  useEffect(() => {
    getAssignments(truck.id)
      .then(setAssignments)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [truck.id]);

  const assignedIds = useMemo(() => new Set(assignments.map(a => a.asset_id)), [assignments]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return catalogue[activeTab].filter(item =>
      item.name.toLowerCase().includes(q) ||
      (item.brand || '').toLowerCase().includes(q) ||
      (item.category || '').toLowerCase().includes(q)
    );
  }, [catalogue, activeTab, search]);

  const handleAssign = async (item) => {
    setAssigning(item.id);
    try {
      const a = await assignAsset({ truckId: truck.id, assetType: activeTab, assetId: item.id, assetName: item.name });
      setAssignments(prev => [...prev, a]);
      onAssigned();
    } catch (e) { setErr(e.message); }
    finally { setAssigning(null); }
  };

  const handleUnassign = async (item) => {
    const a = assignments.find(x => x.asset_id === item.id);
    if (!a) return;
    setAssigning(item.id);
    try {
      await unassignAsset(a.id);
      setAssignments(prev => prev.filter(x => x.id !== a.id));
      onAssigned();
    } catch (e) { setErr(e.message); }
    finally { setAssigning(null); }
  };

  const handleCatalogueSave = (item, isEdit) => {
    setCatalogue(prev => {
      const list = isEdit
        ? prev[activeTab].map(x => x.id === item.id ? item : x)
        : [...prev[activeTab], item];
      const sorted = list.sort((a, b) => a.name.localeCompare(b.name));
      onCatalogueChange(activeTab, sorted);
      return { ...prev, [activeTab]: sorted };
    });
    setShowNew(false);
    setEditItem(null);
  };

  return (
    <>
    <div style={ovly} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...mdl, maxWidth: 520, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={mdlH}>
          <div>
            <b style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Assign Assets — {truck.plate}</b>
            <div style={{ fontSize: 8, color: MUT, marginTop: 2 }}>{assignments.length} item{assignments.length !== 1 ? 's' : ''} assigned to this vehicle</div>
          </div>
          <button style={{ ...btnG, ...sm }} onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1a1a1a', background: '#080808' }}>
          {ASSET_TABS.map(t => (
            <button key={t.id} onClick={() => { setActiveTab(t.id); setSearch(''); setShowNew(false); }}
              style={{ flex: 1, padding: '8px 0', fontSize: 9, fontWeight: activeTab === t.id ? 700 : 400,
                color: activeTab === t.id ? ACC : MUT, background: 'none', border: 'none',
                borderBottom: activeTab === t.id ? `2px solid ${ACC}` : '2px solid transparent',
                cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.08em' }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {err && <div style={{ fontSize: 9, color: RED }}>{err}</div>}

          {/* Search + New button */}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              style={{ flex: 1, background: '#0a0a0a', border: '1px solid #252525', color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, padding: '5px 8px', borderRadius: 2, outline: 'none' }}
              placeholder={`Search ${activeTab}s…`} value={search} onChange={e => setSearch(e.target.value)} />
            <button style={{ ...btnA, ...sm, fontSize: 8 }} onClick={() => setShowNew(true)}>+ New</button>
          </div>

          {/* Catalogue list */}
          {loading && <div style={{ fontSize: 9, color: MUT, textAlign: 'center', padding: '16px 0' }}>Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ fontSize: 9, color: MUT, textAlign: 'center', padding: '16px 0' }}>
              {catalogue[activeTab].length === 0 ? `No ${activeTab}s in catalogue yet. Add one above.` : 'No matches.'}
            </div>
          )}
          {filtered.map(item => {
            const isAssigned = assignedIds.has(item.id);
            const isBusy     = assigning === item.id;
            const ac = ASSET_COLORS[activeTab];
            const thumb = item.photos?.[0];
            return (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                background: isAssigned ? ac.bg : '#0a0a0a',
                border: `1px solid ${isAssigned ? ac.badge + '55' : '#1e1e1e'}`,
                borderRadius: 2 }}>
                {thumb && (
                  <img src={thumb} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 2, border: '1px solid #252525', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: TXT }}>{item.name}</div>
                  <div style={{ fontSize: 8, color: MUT, marginTop: 1 }}>
                    {[item.brand, item.category, item.condition || item.status || item.unit].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => setEditItem(item)} style={{ ...btnG, ...sm, fontSize: 8 }}>Edit</button>
                  <button
                    disabled={isBusy}
                    onClick={() => isAssigned ? handleUnassign(item) : handleAssign(item)}
                    style={{ ...isAssigned ? btnD : btnA, ...sm, fontSize: 8, opacity: isBusy ? 0.4 : 1 }}>
                    {isBusy ? '…' : isAssigned ? 'Remove' : 'Assign'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>

    {/* Full-screen form modals rendered outside the picker overlay */}
    {showNew && activeTab === 'tool' && (
      <ToolForm onSave={item => handleCatalogueSave(item, false)} onCancel={() => setShowNew(false)} />
    )}
    {showNew && activeTab === 'equipment' && (
      <EquipmentForm onSave={item => handleCatalogueSave(item, false)} onCancel={() => setShowNew(false)} />
    )}
    {showNew && activeTab === 'consumable' && (
      <ConsumableForm onSave={item => handleCatalogueSave(item, false)} onCancel={() => setShowNew(false)} />
    )}
    {editItem && activeTab === 'tool' && (
      <ToolForm tool={editItem} onSave={item => handleCatalogueSave(item, true)} onCancel={() => setEditItem(null)} />
    )}
    {editItem && activeTab === 'equipment' && (
      <EquipmentForm item={editItem} onSave={item => handleCatalogueSave(item, true)} onCancel={() => setEditItem(null)} />
    )}
    {editItem && activeTab === 'consumable' && (
      <ConsumableForm item={editItem} onSave={item => handleCatalogueSave(item, true)} onCancel={() => setEditItem(null)} />
    )}
    </>
  );
}

function AssetsPanel({ truck, catalogue, version }) {
  const [assignments, setAssignments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [removing,    setRemoving]    = useState(null);

  const catMap = useMemo(() => {
    const m = {};
    ['tool', 'equipment', 'consumable'].forEach(type => {
      (catalogue[type] || []).forEach(item => { m[item.id] = item; });
    });
    return m;
  }, [catalogue]);

  useEffect(() => {
    setLoading(true);
    getAssignments(truck.id)
      .then(setAssignments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [truck.id, version]);

  const handleRemove = async (a) => {
    setRemoving(a.id);
    try {
      await unassignAsset(a.id);
      setAssignments(prev => prev.filter(x => x.id !== a.id));
    } catch { /* silent */ }
    finally { setRemoving(null); }
  };

  const byType = useMemo(() => ({
    tool:       assignments.filter(a => a.asset_type === 'tool'),
    equipment:  assignments.filter(a => a.asset_type === 'equipment'),
    consumable: assignments.filter(a => a.asset_type === 'consumable'),
  }), [assignments]);

  if (loading) return <div style={{ fontSize: 8, color: MUT, padding: '4px 0' }}>Loading…</div>;
  if (assignments.length === 0) return (
    <div style={{ fontSize: 8, color: MUT, padding: '4px 0' }}>No assets assigned — tap Manage Assets to add.</div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {ASSET_TABS.map(({ id, icon }) => {
        const items = byType[id];
        if (!items.length) return null;
        const ac = ASSET_COLORS[id];
        return (
          <div key={id} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {items.map(a => {
              const thumb = catMap[a.asset_id]?.photos?.[0];
              return (
                <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 8, color: TXT, background: ac.bg, border: `1px solid ${ac.badge}55`,
                  borderRadius: 2, padding: thumb ? '2px 6px 2px 2px' : '2px 6px' }}>
                  {thumb && (
                    <img src={thumb} alt="" style={{ width: 20, height: 20, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }} />
                  )}
                  {a.asset_name}
                  <button onClick={() => handleRemove(a)} disabled={removing === a.id}
                    style={{ background: 'none', border: 'none', color: MUT, cursor: 'pointer', padding: 0,
                      fontSize: 9, lineHeight: 1, opacity: removing === a.id ? 0.3 : 0.6 }}>✕</button>
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function FleetTab({ isAdmin, companyId }) {
  const [trucks,    setTrucks]    = useState([]);
  const [catalogue, setCatalogue] = useState({ tool: [], equipment: [], consumable: [] });
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState('');
  const [truckForm,  setTruckForm]  = useState(null);
  const [availModal, setAvailModal] = useState(null);

  const load = useCallback(async () => {
    try {
      const ts = await getTrucks();
      setTrucks(ts); setErr('');
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    Promise.all([getTools(), getEquipment(), getConsumables()])
      .then(([tool, equipment, consumable]) => setCatalogue({ tool, equipment, consumable }))
      .catch(() => {});
  }, []);

  const handleCatalogueChange = useCallback((type, updatedList) => {
    setCatalogue(prev => ({ ...prev, [type]: updatedList }));
  }, []);

  const handleSaveTruck = async (truck) => {
    const saved = await upsertTruck(!truck.id ? { ...truck, company_id: companyId } : truck);
    setTrucks(prev => { const idx = prev.findIndex(t => t.id === saved.id); return idx >= 0 ? prev.map(t => t.id === saved.id ? saved : t) : [...prev, saved]; });
    setTruckForm(null);
  };

  const handleDeleteTruck = async (truck) => {
    if (!confirm(`Delete ${truck.plate}?`)) return;
    try {
      const { error } = await supabase.rpc('delete_truck', { p_truck_id: truck.id });
      if (error) throw error;
      setTrucks(prev => prev.filter(t => t.id !== truck.id));
    } catch (e) { alert(`Delete failed: ${e.message}`); }
  };

  const available = trucks.filter(t => t.status === 'available').length;
  const onJob     = trucks.filter(t => t.status === 'on job').length;

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>🚚 My Vehicles</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            {trucks.length} vehicle{trucks.length !== 1 ? 's' : ''}
            {available > 0 && <span style={{ color: GRN, marginLeft: 8 }}>· {available} available</span>}
            {onJob > 0     && <span style={{ color: ORANGE, marginLeft: 8 }}>· {onJob} on job</span>}
          </div>
        </div>
        <button onClick={() => setTruckForm({})} style={{ ...btnA, ...sm, fontSize: 8 }}>+ Add Vehicle</button>
      </div>
      {err && <div style={{ fontSize: 9, color: RED, marginBottom: 12 }}>{err}</div>}
      {loading && <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0' }}>Loading vehicles…</div>}
      {!loading && trucks.length === 0 && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0', lineHeight: 1.8 }}>
          No vehicles yet.<br />
          <button onClick={() => setTruckForm({})} style={{ ...btnA, ...sm, marginTop: 8, fontSize: 8 }}>+ Add Vehicle</button>
        </div>
      )}
      {trucks.map(truck => (
        <TruckRow
          key={truck.id} truck={truck} isAdmin={isAdmin}
          catalogue={catalogue}
          onCatalogueChange={handleCatalogueChange}
          onEdit={() => setTruckForm(truck)}
          onDelete={() => handleDeleteTruck(truck)}
          onAvail={() => setAvailModal(truck)}
        />
      ))}
      {truckForm  !== null && <TruckForm truck={truckForm} onSave={handleSaveTruck} onCancel={() => setTruckForm(null)} />}
      {availModal !== null && <AvailabilityModal truck={availModal} onSave={async (updated) => { await handleSaveTruck(updated); setAvailModal(null); }} onCancel={() => setAvailModal(null)} />}
    </div>
  );
}

function TruckRow({ truck, isAdmin, onEdit, onDelete, onAvail, catalogue, onCatalogueChange }) {
  const [pickerOpen,  setPickerOpen]  = useState(false);
  const [assignVer,   setAssignVer]   = useState(0);

  const hasOverride = truck.override_active;
  const hasRelief   = !!(truck.relief_driver_name || truck.relief_da_number);
  const sc          = hasOverride && !hasRelief ? RED : statusColor(truck.status);
  const activeSched = hasRelief ? truck.relief_schedule : truck.schedule;

  return (
    <>
      <div style={{ background: '#0d0d0d', border: `1px solid ${hasOverride ? (hasRelief ? '#3a3a1a' : '#2a1a1a') : '#252525'}`, borderLeft: `3px solid ${sc}`, borderRadius: 2, marginBottom: 6 }}>

        {/* Truck header */}
        <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>{truckEmoji(truck.truck_type)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: TXT, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.1em' }}>{truck.plate}</span>
              <StatusBadge status={hasOverride && !hasRelief ? 'unavailable' : truck.status} />
              {hasOverride && !hasRelief && (
                <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px', border: `1px solid ${RED}55`, borderRadius: 2, color: RED, background: RED + '15', textTransform: 'uppercase' }}>
                  {truck.override_reason || 'Away'}
                </span>
              )}
              {hasRelief && (
                <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px', border: '1px solid #6a6a1a', borderRadius: 2, color: '#cccc44', background: '#cccc4411', textTransform: 'uppercase' }}>Relief</span>
              )}
            </div>
            {truck.truck_type && (
              <div style={{ fontSize: 8, color: MUT, marginTop: 2 }}>{truck.truck_type}</div>
            )}
            {hasOverride && truck.override_return_date && (
              <div style={{ fontSize: 8, color: MUT, marginTop: 1 }}>Returns {fmtDate(truck.override_return_date)}</div>
            )}
            {truck.notes && !hasOverride && (
              <div style={{ fontSize: 8, color: MUT, marginTop: 1 }}>{truck.notes}</div>
            )}
            <MiniRoster schedule={activeSched} />
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignSelf: 'flex-start' }}>
            {isAdmin && <button onClick={onAvail} style={{ ...btnG, ...sm, fontSize: 8, color: hasOverride ? '#cccc44' : MUT, borderColor: hasOverride ? '#5a5a14' : undefined }}>📅</button>}
            {isAdmin && <button onClick={onEdit}  style={{ ...btnG, ...sm, fontSize: 8 }}>Edit</button>}
            <button onClick={onDelete} style={{ ...btnD, ...sm, fontSize: 8 }}>Delete</button>
          </div>
        </div>

        {/* Assets — always visible */}
        <div style={{ borderTop: '1px solid #181818', padding: '8px 10px 10px', background: '#0a0a0a' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 7, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>🧰 Assets</span>
            <button onClick={() => setPickerOpen(true)} style={{ ...btnA, ...sm, fontSize: 8 }}>+ Manage Assets</button>
          </div>
          <AssetsPanel truck={truck} catalogue={catalogue} version={assignVer} />
        </div>
      </div>

      {pickerOpen && (
        <AssetPickerModal
          truck={truck}
          catalogue={catalogue}
          onCatalogueChange={onCatalogueChange}
          onClose={() => setPickerOpen(false)}
          onAssigned={() => setAssignVer(v => v + 1)}
        />
      )}
    </>
  );
}
