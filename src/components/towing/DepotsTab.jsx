import React, { useState, useEffect, useCallback } from 'react';
import { ACC, MUT, BRD, TXT, GRN, RED, SURF, inp, sel, btnA, btnG, btnD, sm, ovly, mdl, mdlH, mdlB, mdlF } from '../../lib/styles';
import { FL } from '../ui/shared';
import { supabase } from '../../lib/supabase';
import { getDepots, upsertDepot, deleteDepot, getTrucks, upsertTruck } from '../../lib/db/towing';
import { TRUCK_TYPES } from './FleetTab';

const ORANGE = '#e8870a';

function statusColor(s) {
  if (s === 'available')   return GRN;
  if (s === 'on job')      return ORANGE;
  if (s === 'unavailable') return RED;
  return MUT;
}

function DepotForm({ depot, onSave, onCancel }) {
  const [name,           setName]           = useState(depot?.name    || '');
  const [suburb,         setSuburb]         = useState(depot?.suburb  || '');
  const [address,        setAddress]        = useState(depot?.address || '');
  const [addrResults,    setAddrResults]    = useState([]);
  const [pickedCoords,   setPickedCoords]   = useState(depot?.lat != null ? { lat: depot.lat, lng: depot.lng } : null);
  const [saving,         setSaving]         = useState(false);
  const [err,            setErr]            = useState('');
  const fld = { background: '#0a0a0a', border: '1px solid #252525', color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, padding: '6px 8px', borderRadius: 2, outline: 'none', boxSizing: 'border-box', width: '100%' };

  // Debounced Nominatim autocomplete
  useEffect(() => {
    if (pickedCoords || address.length < 3) { setAddrResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=5&countrycodes=au`);
        const data = await res.json();
        setAddrResults(data.map(r => ({ label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) })));
      } catch { setAddrResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [address, pickedCoords]);

  const pickResult = (r) => {
    setAddress(r.label.split(',').slice(0, 2).join(',').trim());
    setPickedCoords({ lat: r.lat, lng: r.lng });
    setAddrResults([]);
  };

  const save = async () => {
    if (!name.trim()) { setErr('Name required'); return; }
    setSaving(true); setErr('');
    try {
      let lat = pickedCoords?.lat ?? depot?.lat ?? null;
      let lng = pickedCoords?.lng ?? depot?.lng ?? null;
      // Fallback: geocode on save if no coords yet
      if ((lat == null) && address.trim()) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address.trim())}&limit=1&countrycodes=au`);
          const results = await res.json();
          if (results[0]) { lat = parseFloat(results[0].lat); lng = parseFloat(results[0].lon); }
        } catch { /* non-fatal */ }
      }
      await onSave({ ...depot, name: name.trim(), suburb: suburb.trim(), address: address.trim() || null, lat, lng });
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <div style={ovly} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...mdl, maxWidth: 400 }}>
        <div style={mdlH}>
          <b style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{depot?.id ? 'Edit Depot' : 'Add Depot'}</b>
          <button style={{ ...btnG, ...sm }} onClick={onCancel}>✕</button>
        </div>
        <div style={{ ...mdlB, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><FL t="Depot Name *" /><input style={fld} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. North Depot" autoFocus /></div>
          <div><FL t="Suburb" /><input style={fld} value={suburb} onChange={e => setSuburb(e.target.value)} placeholder="e.g. Campbellfield" /></div>
          <div style={{ position: 'relative' }}>
            <FL t="Address (for map routing)" />
            <input
              style={fld}
              value={address}
              onChange={e => { setAddress(e.target.value); setPickedCoords(null); }}
              onBlur={() => setTimeout(() => setAddrResults([]), 150)}
              placeholder="e.g. 123 Example St, Campbellfield VIC"
            />
            {addrResults.length > 0 && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 500, background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: 2, maxHeight: 110, overflowY: 'auto', marginTop: 2 }}>
                {addrResults.map((r, i) => (
                  <div key={i} onMouseDown={e => { e.preventDefault(); pickResult(r); }}
                    style={{ padding: '6px 8px', fontSize: 9, color: '#bbb', cursor: 'pointer', borderBottom: '1px solid #1a1a1a', lineHeight: 1.5, fontFamily: "'IBM Plex Mono',monospace" }}
                    onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {r.label}
                  </div>
                ))}
              </div>
            )}
            {pickedCoords && (
              <div style={{ fontSize: 7, color: '#3a7a3a', marginTop: 3 }}>📍 {pickedCoords.lat.toFixed(5)}, {pickedCoords.lng.toFixed(5)}</div>
            )}
            {!pickedCoords && depot?.lat != null && (
              <div style={{ fontSize: 7, color: '#3a3a3a', marginTop: 3 }}>📍 {depot.lat.toFixed(5)}, {depot.lng.toFixed(5)}</div>
            )}
          </div>
          {err && <div style={{ fontSize: 9, color: RED }}>{err}</div>}
        </div>
        <div style={mdlF}>
          <button style={btnG} onClick={onCancel}>Cancel</button>
          <button style={{ ...btnA, opacity: saving || !name.trim() ? 0.4 : 1 }} disabled={saving || !name.trim()} onClick={save}>
            {saving ? 'Saving…' : depot?.id ? 'Save Changes' : 'Add Depot'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignTruckModal({ depot, unassigned, onAssign, onCancel }) {
  const [selectedId, setSelectedId] = useState('');
  const [saving,     setSaving]     = useState(false);
  const fld = { background: '#0a0a0a', border: '1px solid #252525', color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, padding: '6px 8px', borderRadius: 2, outline: 'none', boxSizing: 'border-box', width: '100%' };

  const handle = async () => {
    if (!selectedId) return;
    setSaving(true);
    try { await onAssign(selectedId); } finally { setSaving(false); }
  };

  return (
    <div style={ovly} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ ...mdl, maxWidth: 380 }}>
        <div style={mdlH}>
          <b style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Assign Truck — {depot.name}</b>
          <button style={{ ...btnG, ...sm }} onClick={onCancel}>✕</button>
        </div>
        <div style={{ ...mdlB }}>
          {unassigned.length === 0 ? (
            <div style={{ fontSize: 10, color: MUT, padding: '8px 0', lineHeight: 1.8 }}>
              No unassigned trucks.<br />
              <span style={{ fontSize: 9 }}>Use the global <b style={{ color: TXT }}>+ Truck</b> button to register a new one first.</span>
            </div>
          ) : (
            <div>
              <FL t="Select Truck" />
              <select style={{ ...sel, ...fld }} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                <option value="">— choose a truck —</option>
                {unassigned.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.plate}{t.truck_type ? ` · ${t.truck_type}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div style={mdlF}>
          <button style={btnG} onClick={onCancel}>Cancel</button>
          {unassigned.length > 0 && (
            <button style={{ ...btnA, opacity: saving || !selectedId ? 0.4 : 1 }} disabled={saving || !selectedId} onClick={handle}>
              {saving ? 'Assigning…' : 'Assign to Depot'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DepotsTab({ isAdmin, companyId }) {
  const [depots,   setDepots]   = useState([]);
  const [trucks,   setTrucks]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState('');
  const [expanded, setExpanded] = useState(new Set());
  const [depotForm,   setDepotForm]   = useState(null);
  const [assignModal, setAssignModal] = useState(null);

  const toggleExpanded = (id) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const load = useCallback(async () => {
    try {
      const [ds, ts] = await Promise.all([getDepots(), getTrucks()]);
      setDepots(ds); setTrucks(ts); setErr('');
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveDepot = async (depot) => {
    const saved = await upsertDepot({ ...depot, company_id: companyId });
    setDepots(prev => { const idx = prev.findIndex(d => d.id === saved.id); return idx >= 0 ? prev.map(d => d.id === saved.id ? saved : d) : [...prev, saved]; });
    setDepotForm(null);
  };

  const handleDeleteDepot = async (depot) => {
    if (trucks.some(t => t.depot_id === depot.id)) { alert('Remove all trucks from this depot first.'); return; }
    if (!confirm(`Delete depot "${depot.name}"?`)) return;
    try {
      await deleteDepot(depot.id);
      setDepots(prev => prev.filter(d => d.id !== depot.id));
    } catch (e) { alert(`Delete failed: ${e.message}`); }
  };

  const handleAssignTruck = async (truckId) => {
    const truck = trucks.find(t => t.id === truckId);
    if (!truck || !assignModal) return;
    try {
      const saved = await upsertTruck({ ...truck, depot_id: assignModal.id });
      setTrucks(prev => prev.map(t => t.id === saved.id ? saved : t));
      setAssignModal(null);
    } catch (e) { alert(`Assign failed: ${e.message}`); }
  };

  const handleUnassignTruck = async (truck) => {
    if (!confirm(`Remove ${truck.plate} from depot?`)) return;
    try {
      const saved = await upsertTruck({ ...truck, depot_id: null });
      setTrucks(prev => prev.map(t => t.id === saved.id ? saved : t));
    } catch (e) { alert(`Remove failed: ${e.message}`); }
  };

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>🏢 Depots</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            {depots.length} depot{depots.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button onClick={() => setDepotForm({})} style={{ ...btnA, ...sm, fontSize: 8 }}>+ Add Depot</button>
      </div>
      {err && <div style={{ fontSize: 9, color: RED, marginBottom: 12 }}>{err}</div>}
      {loading && <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0' }}>Loading depots…</div>}
      {!loading && depots.length === 0 && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0', lineHeight: 1.8 }}>
          No depots yet.<br />
          <button onClick={() => setDepotForm({})} style={{ ...btnA, ...sm, marginTop: 8 }}>Add First Depot</button>
        </div>
      )}
      {depots.map(depot => {
        const depotTrucks = trucks.filter(t => t.depot_id === depot.id);
        const isOpen = expanded.has(depot.id);
        return (
          <div key={depot.id} style={{ background: '#0d0d0d', border: '1px solid #252525', borderLeft: `3px solid ${ACC}`, borderRadius: 2, marginBottom: 8, overflow: 'hidden' }}>
            {/* Header row — click to expand */}
            <div onClick={() => toggleExpanded(depot.id)}
              style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '10px 12px', cursor: 'pointer' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: TXT, fontFamily: "'IBM Plex Mono',monospace" }}>{depot.name}</span>
                  {depot.suburb && <span style={{ fontSize: 8, color: MUT }}>{depot.suburb}</span>}
                  <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px', border: `1px solid ${ACC}55`, borderRadius: 2, color: ACC, background: ACC + '15' }}>
                    {depotTrucks.length} truck{depotTrucks.length !== 1 ? 's' : ''}
                  </span>
                  {depot.lat != null && <span style={{ fontSize: 7, color: GRN }}>📍</span>}
                </div>
                {depot.address && <div style={{ fontSize: 8, color: MUT, marginTop: 3 }}>{depot.address}</div>}
                {depot.lat != null && (
                  <div style={{ fontSize: 7, color: '#3a3a3a', marginTop: 2 }}>{depot.lat.toFixed(5)}, {depot.lng.toFixed(5)}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                {isAdmin && <button onClick={e => { e.stopPropagation(); setDepotForm(depot); }} style={{ ...btnG, ...sm, fontSize: 8 }}>Edit</button>}
                <button onClick={e => { e.stopPropagation(); handleDeleteDepot(depot); }} style={{ ...btnD, ...sm, fontSize: 8 }}>Delete</button>
                <span style={{ fontSize: 9, color: MUT, marginLeft: 4 }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Expanded truck list */}
            {isOpen && (
              <div style={{ borderTop: '1px solid #1a1a1a', padding: '8px 12px 10px' }}>
                {depotTrucks.length === 0 ? (
                  <div style={{ fontSize: 9, color: MUT, padding: '4px 0' }}>No trucks assigned to this depot.</div>
                ) : (
                  depotTrucks.map(truck => {
                    const sc = statusColor(truck.status);
                    return (
                      <div key={truck.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#080808', border: '1px solid #1e1e1e', borderLeft: `3px solid ${sc}`, borderRadius: 2, marginBottom: 4 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: TXT, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.08em' }}>{truck.plate}</span>
                            <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px', border: `1px solid ${sc}55`, borderRadius: 2, color: sc, background: sc + '15', textTransform: 'uppercase' }}>
                              {truck.status || 'available'}
                            </span>
                          </div>
                          {truck.truck_type && (
                            <div style={{ fontSize: 8, color: MUT, marginTop: 2, fontFamily: "'IBM Plex Mono',monospace" }}>{truck.truck_type}</div>
                          )}
                        </div>
                        <button onClick={() => handleUnassignTruck(truck)}
                          style={{ fontSize: 8, color: '#884040', border: '1px solid #3a1a1a', background: 'none', borderRadius: 2, padding: '3px 7px', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", whiteSpace: 'nowrap', flexShrink: 0 }}>
                          Remove
                        </button>
                      </div>
                    );
                  })
                )}
                <button onClick={() => setAssignModal(depot)}
                  style={{ fontSize: 8, color: MUT, border: '1px dashed #2a2a2a', borderRadius: 2, background: 'transparent', padding: '4px 10px', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", marginTop: 4 }}>
                  + Assign truck to {depot.name}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {depotForm   !== null && <DepotForm depot={depotForm?.id ? depotForm : undefined} onSave={handleSaveDepot} onCancel={() => setDepotForm(null)} />}
      {assignModal !== null && <AssignTruckModal depot={assignModal} unassigned={trucks.filter(t => !t.depot_id)} onAssign={handleAssignTruck} onCancel={() => setAssignModal(null)} />}
    </div>
  );
}
