import React from 'react';
import { MUT } from '../../lib/styles';

export function FL({ t }) {
  return (
    <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUT, marginBottom: 4 }}>
      {t}
    </div>
  );
}
