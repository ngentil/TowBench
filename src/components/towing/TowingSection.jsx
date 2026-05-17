import React, { useState } from 'react';
import { ACC, MUT, BRD, SURF } from '../../lib/styles';
import TowAllocationsTab from './TowAllocationsTab';
import TowAnalyticsTab from './TowAnalyticsTab';
import FleetTab from './FleetTab';

const TABS = [
  { id: 'allocations', label: '🚦 Tow Allocations' },
  { id: 'analytics',   label: '📊 Analytics' },
  { id: 'fleet',       label: '🚛 Fleet' },
];

export default function TowingSection() {
  const [tab, setTab] = useState('allocations');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ background: SURF, borderBottom: '1px solid ' + BRD, overflowX: 'auto', overflowY: 'hidden', display: 'flex', scrollbarWidth: 'none' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flexShrink: 0, padding: '8px 14px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tab === t.id ? ACC : MUT, cursor: 'pointer', border: 'none', background: 'none', borderBottom: tab === t.id ? '2px solid ' + ACC : '2px solid transparent', fontFamily: "'IBM Plex Mono',monospace", whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {tab === 'allocations' && <TowAllocationsTab />}
        {tab === 'analytics'   && <TowAnalyticsTab />}
        {tab === 'fleet'       && <FleetTab />}
      </div>
    </div>
  );
}
