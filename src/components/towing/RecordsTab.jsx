import React, { useState } from 'react';
import { MUT, TXT } from '../../lib/styles';
import ActiveTowsTab    from './ActiveTowsTab';
import CompletedTowsTab from './CompletedTowsTab';
import TowInsTab        from './TowInsTab';

const ORANGE = '#e8870a';

const SUB_TABS = [
  { id: 'activetows',    label: '🚛 Active'     },
  { id: 'completedtows', label: '✅ Completed'  },
  { id: 'towins',        label: '🏭 Tow Ins'    },
];

export default function RecordsTab({ companyId, companyConfig, userEmail, isDispatch }) {
  const [sub, setSub] = useState('activetows');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1e1e1e', flexShrink: 0, overflowX: 'auto' }}>
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            style={{
              flex: '0 0 auto',
              padding: '8px 14px',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontFamily: "'IBM Plex Mono',monospace",
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${sub === t.id ? ORANGE : 'transparent'}`,
              color: sub === t.id ? ORANGE : MUT,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {sub === 'activetows'    && <ActiveTowsTab    companyId={companyId} companyConfig={companyConfig} userEmail={userEmail} />}
        {sub === 'completedtows' && <CompletedTowsTab companyId={companyId} />}
        {sub === 'towins'        && <TowInsTab        companyId={companyId} userEmail={userEmail} isDispatch={isDispatch} companyConfig={companyConfig} />}
      </div>
    </div>
  );
}
