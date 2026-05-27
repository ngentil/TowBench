import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, BRD, TXT, SURF, RED, inp, btnA, sm } from '../../lib/styles';

export default function StorageTab({ companyId }) {
  const [types,    setTypes]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [newName,  setNewName]  = useState('');
  const [newRate,  setNewRate]  = useState('');
  const [adding,   setAdding]   = useState(false);
  const [err,      setErr]      = useState('');

  useEffect(() => {
    if (!companyId) return;
    supabase.from('storage_types').select('*')
      .eq('company_id', companyId).order('daily_rate', { ascending: false })
      .then(({ data }) => { setTypes(data || []); setLoading(false); });
  }, [companyId]);

  const addType = async () => {
    if (!newName.trim()) { setErr('Name is required.'); return; }
    const rate = parseFloat(newRate);
    if (isNaN(rate) || rate < 0) { setErr('Enter a valid daily rate.'); return; }
    setAdding(true); setErr('');
    const { data, error } = await supabase.from('storage_types')
      .insert({ company_id: companyId, name: newName.trim(), daily_rate: rate })
      .select().single();
    if (error) { setErr(error.message); setAdding(false); return; }
    setTypes(prev => [...prev, data].sort((a, b) => b.daily_rate - a.daily_rate));
    setNewName(''); setNewRate(''); setAdding(false);
  };

  const deleteType = async (id) => {
    await supabase.from('storage_types').delete().eq('id', id);
    setTypes(prev => prev.filter(t => t.id !== id));
  };

  const updateRate = async (id, rate) => {
    const r = parseFloat(rate);
    if (isNaN(r)) return;
    await supabase.from('storage_types').update({ daily_rate: r }).eq('id', id);
    setTypes(prev => prev.map(t => t.id === id ? { ...t, daily_rate: r } : t)
      .sort((a, b) => b.daily_rate - a.daily_rate));
  };

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>📦 Storage</div>
        <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>Tow-in storage options — sorted most expensive first (used as default)</div>
      </div>
      <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '16px 18px', maxWidth: 480, marginBottom: 24 }}>
        {loading ? (
          <div style={{ fontSize: 9, color: MUT }}>Loading…</div>
        ) : (
          <>
            {types.length === 0 && (
              <div style={{ fontSize: 9, color: MUT, marginBottom: 10 }}>No storage types yet.</div>
            )}
            {types.map((t, i) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, fontSize: 10, color: TXT, fontFamily: "'IBM Plex Mono',monospace" }}>{t.name}</div>
                {i === 0 && <span style={{ fontSize: 7, color: ACC, border: `1px solid ${ACC}55`, borderRadius: 2, padding: '1px 5px' }}>DEFAULT</span>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 8, color: MUT }}>$</span>
                  <input
                    type="number" min="0" step="0.01"
                    defaultValue={parseFloat(t.daily_rate).toFixed(2)}
                    onBlur={e => updateRate(t.id, e.target.value)}
                    style={{ ...inp, width: 72, padding: '4px 6px', fontSize: 10 }}
                  />
                  <span style={{ fontSize: 8, color: MUT }}>/day</span>
                </div>
                <button onClick={() => deleteType(t.id)}
                  style={{ background: 'none', border: '1px solid #3a1a1a', color: '#884040',
                    fontSize: 9, padding: '3px 8px', borderRadius: 2, cursor: 'pointer',
                    fontFamily: "'IBM Plex Mono',monospace" }}>✕</button>
              </div>
            ))}

            {/* Add row */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Secure Undercover"
                style={{ ...inp, flex: 1, minWidth: 140, padding: '6px 8px', fontSize: 10 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 8, color: MUT }}>$</span>
                <input type="number" min="0" step="0.01" value={newRate}
                  onChange={e => setNewRate(e.target.value)}
                  placeholder="0.00"
                  onKeyDown={e => e.key === 'Enter' && addType()}
                  style={{ ...inp, width: 72, padding: '6px 8px', fontSize: 10 }} />
                <span style={{ fontSize: 8, color: MUT }}>/day</span>
              </div>
              <button onClick={addType} disabled={adding}
                style={{ ...btnA, ...sm, opacity: adding ? 0.6 : 1 }}>
                {adding ? '…' : '+ Add'}
              </button>
            </div>
            {err && <div style={{ fontSize: 9, color: RED, marginTop: 6 }}>{err}</div>}
          </>
        )}
      </div>
    </div>
  );
}
