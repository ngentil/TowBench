import React, { useState, useEffect, useCallback } from 'react';
import { ACC, MUT, TXT, GRN, RED, btnA, btnG, btnD, sm, ovly, mdl, mdlH, mdlB, mdlF } from '../../lib/styles';
import { FL } from '../ui/shared';
import { getDepots, upsertDepot, deleteDepot } from '../../lib/db/towing';

function DepotForm({ depot, onSave, onCancel }) {
  const [name,           setName]           = useState(depot?.name    || '');
  const [suburb,         setSuburb]         = useState(depot?.suburb  || '');
  const [address,        setAddress]        = useState(depot?.address || '');
  const [addrResults,    setAddrResults]    = useState([]);
  const [pickedCoords,   setPickedCoords]   = useState(depot?.lat != null ? { lat: depot.lat, lng: depot.lng } : null);
  const [saving,         setSaving]         = useState(false);
  const [err,            setErr]            = useState('');
  const fld = { background: '#0a0a0a', border: '1px solid #252525', color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, padding: '6px 8px', borderRadius: 2, outline: 'none', boxSizing: 'border-box', width: '100%' };

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

export default function DepotsTab({ isAdmin, companyId }) {
  const [depots,  setDepots]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState('');
  const [depotForm, setDepotForm] = useState(null);

  const load = useCallback(async () => {
    try {
      const ds = await getDepots();
      setDepots(ds); setErr('');
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
    if (!confirm(`Delete depot "${depot.name}"?`)) return;
    try {
      await deleteDepot(depot.id);
      setDepots(prev => prev.filter(d => d.id !== depot.id));
    } catch (e) { alert(`Delete failed: ${e.message}`); }
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
      {depots.map(depot => (
        <div key={depot.id} style={{ background: '#0d0d0d', border: '1px solid #252525', borderLeft: `3px solid ${ACC}`, borderRadius: 2, marginBottom: 8, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: TXT, fontFamily: "'IBM Plex Mono',monospace" }}>{depot.name}</span>
                {depot.suburb && <span style={{ fontSize: 8, color: MUT }}>{depot.suburb}</span>}
                {depot.lat != null && <span style={{ fontSize: 7, color: GRN }}>📍</span>}
              </div>
              {depot.address && <div style={{ fontSize: 8, color: MUT, marginTop: 3 }}>{depot.address}</div>}
              {depot.lat != null && (
                <div style={{ fontSize: 7, color: '#3a3a3a', marginTop: 2 }}>{depot.lat.toFixed(5)}, {depot.lng.toFixed(5)}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button onClick={() => setDepotForm(depot)} style={{ ...btnG, ...sm, fontSize: 8 }}>Edit</button>
              <button onClick={() => handleDeleteDepot(depot)} style={{ ...btnD, ...sm, fontSize: 8 }}>Delete</button>
            </div>
          </div>
        </div>
      ))}
      {depotForm !== null && <DepotForm depot={depotForm?.id ? depotForm : undefined} onSave={handleSaveDepot} onCancel={() => setDepotForm(null)} />}
    </div>
  );
}
