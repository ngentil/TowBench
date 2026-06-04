import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, BRD, SURF, TXT, GRN, RED, btnA, btnG, sm } from '../../lib/styles';
import { applyTabOrder } from '../../lib/tabOrder';

function TabReorderList({ items, setItems, hidden, setHidden }) {
  const move = (i, dir) => {
    const next = [...items];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };

  const toggleHidden = (id) => {
    const isVisible = !hidden.has(id);
    if (isVisible && items.filter(t => !hidden.has(t.id)).length === 1) return; // keep at least one
    const next = new Set(hidden);
    isVisible ? next.add(id) : next.delete(id);
    setHidden(next);
  };

  const visibleItems = items.filter(t => !hidden.has(t.id));

  return (
    <div style={{ border: '1px solid ' + BRD, borderRadius: 2, overflow: 'hidden' }}>
      {items.map((tab, i) => {
        const isVisible = !hidden.has(tab.id);
        const visibleIndex = visibleItems.indexOf(tab);
        return (
          <div key={tab.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
            background: i % 2 === 0 ? 'transparent' : SURF,
            borderBottom: i < items.length - 1 ? '1px solid ' + BRD : 'none',
            opacity: isVisible ? 1 : 0.4,
          }}>
            <input type="checkbox" checked={isVisible} onChange={() => toggleHidden(tab.id)}
              style={{ accentColor: ACC, width: 13, height: 13, flexShrink: 0, cursor: 'pointer' }} />
            <span style={{ fontSize: 9, color: MUT, width: 14, textAlign: 'center', flexShrink: 0 }}>
              {isVisible ? visibleIndex + 1 : '—'}
            </span>
            <span style={{ fontSize: 10, color: TXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tab.label}
            </span>
            {isVisible && visibleIndex === 0 && (
              <span style={{ fontSize: 7, color: ACC, letterSpacing: '0.08em', flexShrink: 0 }}>DEFAULT</span>
            )}
            <div style={{ display: 'flex', gap: 2 }}>
              <button onClick={() => move(i, -1)} disabled={i === 0}
                style={{ background: 'none', border: '1px solid ' + BRD, borderRadius: 2,
                  color: i === 0 ? '#333' : MUT, cursor: i === 0 ? 'default' : 'pointer',
                  fontSize: 10, padding: '1px 6px', lineHeight: 1.4, fontFamily: "'IBM Plex Mono',monospace" }}>↑</button>
              <button onClick={() => move(i, 1)} disabled={i === items.length - 1}
                style={{ background: 'none', border: '1px solid ' + BRD, borderRadius: 2,
                  color: i === items.length - 1 ? '#333' : MUT, cursor: i === items.length - 1 ? 'default' : 'pointer',
                  fontSize: 10, padding: '1px 6px', lineHeight: 1.4, fontFamily: "'IBM Plex Mono',monospace" }}>↓</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TabOrderSettings({ userId, availableTabs, tabPrefs, setTabPrefs }) {
  // availableTabs = TABS filtered by role (excludes taborder itself)
  const [items,  setItems]  = useState(() => applyTabOrder(availableTabs, tabPrefs?.order));
  const [hidden, setHidden] = useState(() => new Set(tabPrefs?.hidden ?? []));
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [err,    setErr]    = useState('');

  const save = async () => {
    setSaving(true); setErr(''); setSaved(false);
    const prefs = {
      order:  items.map(t => t.id),
      hidden: [...hidden],
    };
    const { error } = await supabase
      .from('user_profiles')
      .update({ tab_preferences: prefs })
      .eq('id', userId);
    if (error) { setErr(error.message); setSaving(false); return; }
    setTabPrefs(prefs);
    setSaved(true);
    setSaving(false);
  };

  const reset = () => {
    setItems(availableTabs);
    setHidden(new Set());
    setSaved(false);
  };

  const secHd = {
    borderLeft: '2px solid ' + ACC, paddingLeft: 8, fontSize: 10, color: TXT,
    fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8,
  };

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto', maxWidth: 480 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: ACC, letterSpacing: '0.06em', marginBottom: 4 }}>⇅ Tab Order</div>
        <div style={{ fontSize: 9, color: MUT, lineHeight: 1.6, marginBottom: 16 }}>
          Check to show, uncheck to hide. Use ↑↓ to reorder. The first visible tab opens by default.
        </div>
        <TabReorderList items={items} setItems={setItems} hidden={hidden} setHidden={setHidden} />
      </div>

      {err   && <div style={{ fontSize: 9, color: RED, marginBottom: 8 }}>{err}</div>}
      {saved && <div style={{ fontSize: 9, color: GRN, marginBottom: 8 }}>Tab order saved.</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={reset} style={{ ...btnG, ...sm, fontSize: 9 }}>Reset to defaults</button>
        <button onClick={save} disabled={saving} style={{ ...btnA, ...sm, fontSize: 9, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
