import React, { useState, useEffect, useCallback } from 'react';
import { ACC, MUT, BRD, TXT, GRN, RED, SURF, inp, sel, txa, btnA, btnG, btnD, sm, ovly, mdl, mdlH, mdlB, mdlF } from '../../lib/styles';
import { FL } from '../ui/shared';
import { supabase } from '../../lib/supabase';
import { getDepots, getTrucks, upsertTruck, deleteTruck } from '../../lib/db/towing';
import { RosterCalendar, MiniRoster } from './RosterCalendar';

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

export default function FleetTab({ isAdmin, companyId }) {
  const [depots,  setDepots]  = useState([]);
  const [trucks,  setTrucks]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState('');
  const [truckForm,   setTruckForm]   = useState(null);
  const [availModal,  setAvailModal]  = useState(null);

  const load = useCallback(async () => {
    try {
      const [ds, ts] = await Promise.all([getDepots(), getTrucks()]);
      setDepots(ds); setTrucks(ts); setErr('');
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveTruck = async (truck) => {
    const saved = await upsertTruck(!truck.id ? { ...truck, company_id: companyId } : truck);
    setTrucks(prev => { const idx = prev.findIndex(t => t.id === saved.id); return idx >= 0 ? prev.map(t => t.id === saved.id ? saved : t) : [...prev, saved]; });
    setTruckForm(null);
  };

  const handleDeleteTruck = async (truck) => {
    if (!confirm(`Delete truck ${truck.plate}?`)) return;
    try {
      await deleteTruck(truck.id);
      setTrucks(prev => prev.filter(t => t.id !== truck.id));
    } catch (e) { alert(`Delete failed: ${e.message}`); }
  };

  const trucksByDepot = depots.map(d => ({ depot: d, trucks: trucks.filter(t => t.depot_id === d.id) }));
  const unassigned = trucks.filter(t => !t.depot_id);
  const available = trucks.filter(t => t.status === 'available').length;
  const onJob     = trucks.filter(t => t.status === 'on job').length;

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>🚛 Fleet</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            {trucks.length} truck{trucks.length !== 1 ? 's' : ''}
            {available > 0 && <span style={{ color: GRN, marginLeft: 8 }}>· {available} available</span>}
            {onJob > 0     && <span style={{ color: ORANGE, marginLeft: 8 }}>· {onJob} on job</span>}
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => setTruckForm({})} style={{ ...btnA, ...sm, fontSize: 8 }}>+ Add Truck</button>
        )}
      </div>
      {err && <div style={{ fontSize: 9, color: RED, marginBottom: 12 }}>{err}</div>}
      {loading && <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0' }}>Loading fleet…</div>}
      {!loading && trucks.length === 0 && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0', lineHeight: 1.8 }}>
          No trucks yet. Click + Add Truck to get started.
        </div>
      )}
      {trucksByDepot.map(({ depot, trucks: dTrucks }) => (
        <div key={depot.id} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, borderLeft: `2px solid ${ACC}`, paddingLeft: 8 }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: TXT }}>{depot.name}</span>
              {depot.suburb && <span style={{ fontSize: 8, color: MUT, marginLeft: 6 }}>{depot.suburb}</span>}
              <span style={{ fontSize: 8, color: MUT, marginLeft: 8 }}>{dTrucks.length} truck{dTrucks.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          {dTrucks.length === 0 && <div style={{ fontSize: 9, color: MUT, padding: '8px 10px', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 2, marginBottom: 4 }}>No trucks assigned to this depot.</div>}
          {dTrucks.map(truck => (
            <TruckRow key={truck.id} truck={truck} isAdmin={isAdmin} onEdit={() => setTruckForm(truck)} onDelete={() => handleDeleteTruck(truck)} onAvail={() => setAvailModal(truck)} />
          ))}
        </div>
      ))}
      {unassigned.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, borderLeft: '2px solid #444', paddingLeft: 8 }}>Unassigned ({unassigned.length})</div>
          {unassigned.map(truck => (
            <TruckRow key={truck.id} truck={truck} isAdmin={isAdmin} onEdit={() => setTruckForm(truck)} onDelete={() => handleDeleteTruck(truck)} onAvail={() => setAvailModal(truck)} />
          ))}
        </div>
      )}
      {isAdmin && <AccessRequestsPanel />}
      {isAdmin && <AccessCodesPanel />}
      {truckForm  !== null && <TruckForm truck={truckForm?.id ? truckForm : truckForm} onSave={handleSaveTruck} onCancel={() => setTruckForm(null)} />}
      {availModal !== null && <AvailabilityModal truck={availModal} onSave={async (updated) => { await handleSaveTruck(updated); setAvailModal(null); }} onCancel={() => setAvailModal(null)} />}
    </div>
  );
}

function AccessRequestsPanel() {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [ready,    setReady]    = useState({});
  const [copied,   setCopied]   = useState(null);
  const [working,  setWorking]  = useState(null);

  useEffect(() => {
    supabase.from('access_requests').select('*').eq('status', 'pending').order('requested_at', { ascending: false })
      .then(({ data }) => { setRequests(data || []); setLoading(false); });
  }, []);

  const generateFor = async (req) => {
    setWorking(req.id);
    const { data: code, error } = await supabase.rpc('generate_invite_code');
    if (error) { alert(error.message); setWorking(null); return; }
    await supabase.from('access_requests').update({ status: 'fulfilled' }).eq('id', req.id);
    setRequests(prev => prev.filter(r => r.id !== req.id));
    setReady(prev => ({ ...prev, [req.id]: { plate: req.plate, code } }));
    setWorking(null);
  };

  const dismiss = async (req) => {
    setWorking(req.id);
    await supabase.from('access_requests').update({ status: 'dismissed' }).eq('id', req.id);
    setRequests(prev => prev.filter(r => r.id !== req.id));
    setWorking(null);
  };

  const copy = (code) => { navigator.clipboard?.writeText(code); setCopied(code); setTimeout(() => setCopied(null), 2000); };

  const readyCodes = Object.values(ready);
  if (loading || (requests.length === 0 && readyCodes.length === 0)) return null;

  return (
    <div style={{ marginTop: 24, borderTop: `2px solid ${ACC}44`, paddingTop: 16, marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>🔔 Access Requests</div>
        {requests.length > 0 && <span style={{ fontSize: 8, fontWeight: 700, background: ACC, color: '#000', padding: '1px 6px', borderRadius: 8, letterSpacing: '0.05em' }}>{requests.length}</span>}
        <div style={{ fontSize: 8, color: MUT }}>Drivers waiting for an access code</div>
      </div>
      {requests.map(req => (
        <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#0d0d0d', border: `1px solid ${ACC}33`, borderRadius: 2, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', color: TXT, fontFamily: "'IBM Plex Mono',monospace", flex: 1 }}>{req.plate}</span>
          <span style={{ fontSize: 8, color: MUT }}>{new Date(req.requested_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          <button onClick={() => generateFor(req)} disabled={!!working} style={{ ...btnA, ...sm, fontSize: 8, opacity: working ? 0.5 : 1 }}>Generate Code</button>
          <button onClick={() => dismiss(req)} disabled={!!working} style={{ ...btnG, ...sm, fontSize: 8, opacity: working ? 0.5 : 1 }}>Dismiss</button>
        </div>
      ))}
      {readyCodes.map(({ plate, code }) => (
        <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#0a100a', border: `1px solid ${GRN}33`, borderRadius: 2, marginBottom: 4 }}>
          <span style={{ fontSize: 8, color: MUT }}>{plate}</span>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.2em', color: GRN, fontFamily: "'IBM Plex Mono',monospace", flex: 1 }}>{code}</span>
          <button onClick={() => copy(code)} style={{ ...btnG, ...sm, fontSize: 8, color: copied === code ? GRN : MUT, borderColor: copied === code ? GRN + '55' : undefined }}>{copied === code ? '✓ Copied' : 'Copy'}</button>
        </div>
      ))}
    </div>
  );
}

function AccessCodesPanel() {
  const [codes,      setCodes]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied,     setCopied]     = useState(null);

  useEffect(() => {
    supabase.from('invite_codes').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setCodes(data || []); setLoading(false); });
  }, []);

  const generate = async () => {
    setGenerating(true);
    const { data, error } = await supabase.rpc('generate_invite_code');
    setGenerating(false);
    if (error) { alert(error.message); return; }
    setCodes(prev => [{ code: data, created_at: new Date().toISOString(), used_by: null, used_at: null, id: data }, ...prev]);
  };

  const copy = (code) => { navigator.clipboard?.writeText(code); setCopied(code); setTimeout(() => setCopied(null), 2000); };

  return (
    <div style={{ marginTop: 24, borderTop: '1px solid #1a1a1a', paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>🔑 Access Codes</div>
          <div style={{ fontSize: 8, color: MUT, marginTop: 2 }}>Share with a driver before their first login</div>
        </div>
        <button onClick={generate} disabled={generating} style={{ ...btnA, ...sm, fontSize: 8, opacity: generating ? 0.5 : 1 }}>{generating ? 'Generating…' : '+ New Code'}</button>
      </div>
      {loading && <div style={{ fontSize: 9, color: MUT }}>Loading…</div>}
      {!loading && codes.length === 0 && <div style={{ fontSize: 9, color: MUT, padding: '8px 0' }}>No codes yet.</div>}
      {codes.map(c => (
        <div key={c.id || c.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: '#0d0d0d', border: `1px solid ${c.used_at ? '#1a1a1a' : '#2a2a2a'}`, borderRadius: 2, marginBottom: 4, opacity: c.used_at ? 0.45 : 1 }}>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.2em', color: c.used_at ? MUT : TXT, fontFamily: "'IBM Plex Mono',monospace", flex: 1 }}>{c.code}</span>
          {c.used_at ? (
            <span style={{ fontSize: 8, color: MUT, textAlign: 'right' }}>{c.used_by} · {new Date(c.used_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
          ) : (
            <button onClick={() => copy(c.code)} style={{ ...btnG, ...sm, fontSize: 8, color: copied === c.code ? GRN : MUT, borderColor: copied === c.code ? GRN + '55' : undefined }}>{copied === c.code ? '✓ Copied' : 'Copy'}</button>
          )}
        </div>
      ))}
    </div>
  );
}

function TruckRow({ truck, isAdmin, onEdit, onDelete, onAvail }) {
  const hasOverride = truck.override_active;
  const hasRelief   = !!(truck.relief_driver_name || truck.relief_da_number);
  const sc          = hasOverride && !hasRelief ? RED : statusColor(truck.status);
  const activeSched = hasRelief ? truck.relief_schedule : truck.schedule;

  return (
    <div style={{ padding: '8px 10px', background: '#0d0d0d', border: `1px solid ${hasOverride ? (hasRelief ? '#3a3a1a' : '#2a1a1a') : '#252525'}`, borderLeft: `3px solid ${sc}`, borderRadius: 2, marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
            <div style={{ fontSize: 8, color: MUT, marginTop: 2, fontFamily: "'IBM Plex Mono',monospace" }}>{truck.truck_type}</div>
          )}
          {hasOverride && truck.override_return_date && (
            <div style={{ fontSize: 8, color: MUT, marginTop: 2 }}>Returns {fmtDate(truck.override_return_date)}</div>
          )}
          {truck.notes && !hasOverride && (
            <div style={{ fontSize: 8, color: MUT, marginTop: 2 }}>{truck.notes}</div>
          )}
          <MiniRoster schedule={activeSched} />
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignSelf: 'flex-start' }}>
            <button onClick={onAvail}  style={{ ...btnG, ...sm, fontSize: 8, color: hasOverride ? '#cccc44' : MUT, borderColor: hasOverride ? '#5a5a14' : undefined }}>📅</button>
            <button onClick={onEdit}   style={{ ...btnG, ...sm, fontSize: 8 }}>Edit</button>
            <button onClick={onDelete} style={{ ...btnD, ...sm, fontSize: 8 }}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}
