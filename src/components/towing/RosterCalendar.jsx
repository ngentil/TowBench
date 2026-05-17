import React, { useMemo } from 'react';
import { ACC, MUT, TXT } from '../../lib/styles';

const ORANGE = '#e8870a';
const BLUE   = '#5a7a9a';

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

function isoWeekNum(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

// ── MiniRoster ────────────────────────────────────────────────────────────────
// 14-day colour strip for TruckRow preview

export function MiniRoster({ schedule }) {
  if (!schedule || typeof schedule !== 'object') return null;

  const today = todayMidnight();
  const days  = [];
  for (let i = 0; i < 14; i++) {
    const d   = new Date(today);
    d.setDate(today.getDate() + i);
    const str = dateStr(d);
    days.push({ d, str, dow: d.getDay(), status: schedule[str] });
  }

  const hasAny = days.some(({ status }) => status);
  if (!hasAny) return null;

  const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  return (
    <div style={{ marginTop: 5 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {/* Row labels */}
        {days.slice(0, 7).map(({ d, dow }) => (
          <div key={d} style={{ fontSize: 6, textAlign: 'center', color: '#444', fontFamily: "'IBM Plex Mono',monospace", marginBottom: 1 }}>
            {DOW[dow]}
          </div>
        ))}
        {/* Week 1 bars */}
        {days.slice(0, 7).map(({ d, str, status }) => (
          <div key={str}
            title={`${d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })} — ${status || 'off'}`}
            style={{ height: 10, borderRadius: 1, background: cellBg(status, 0.9) }}
          />
        ))}
        {/* Week 2 labels */}
        {days.slice(7, 14).map(({ d, dow }) => (
          <div key={d + 'l'} style={{ fontSize: 6, textAlign: 'center', color: '#444', fontFamily: "'IBM Plex Mono',monospace", marginTop: 3, marginBottom: 1 }}>
            {DOW[dow]}
          </div>
        ))}
        {/* Week 2 bars */}
        {days.slice(7, 14).map(({ d, str, status }) => (
          <div key={str}
            title={`${d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })} — ${status || 'off'}`}
            style={{ height: 10, borderRadius: 1, background: cellBg(status, 0.9) }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 7, color: '#444' }}>
        <span><span style={{ color: ORANGE }}>■</span> Day</span>
        <span><span style={{ color: BLUE }}>■</span> Night</span>
        <span style={{ color: '#888' }}>■ Both</span>
      </div>
    </div>
  );
}

function cellBg(status, opacity = 0.3) {
  if (status === 'day')   return hexAlpha(ORANGE, opacity);
  if (status === 'night') return hexAlpha(BLUE,   opacity);
  if (status === 'both')  return `linear-gradient(to right, ${hexAlpha(ORANGE, opacity)} 50%, ${hexAlpha(BLUE, opacity)} 50%)`;
  return '#1a1a1a';
}

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── RosterCalendar ────────────────────────────────────────────────────────────
// Full 5-week interactive calendar for the truck / relief driver form

export function RosterCalendar({ value = {}, onChange }) {
  const today = useMemo(todayMidnight, []);

  // Start from Monday of current week
  const startDate = useMemo(() => {
    const d = new Date(today);
    const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
    d.setDate(d.getDate() - dow);
    return d;
  }, [today]);

  const days = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 35; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [startDate]);

  // Click cycles: off → day → night → both → off
  const CYCLE = { day: 'night', night: 'both', both: null };

  const toggle = (d) => {
    const str  = dateStr(d);
    const cur  = value[str];
    const next = cur ? CYCLE[cur] : 'day';
    const nv   = { ...value };
    if (next === null || next === undefined) delete nv[str];
    else nv[str] = next;
    onChange(nv);
  };

  // Quick-fill helpers — additive (merges with existing)
  const fill = (filterFn, type) => {
    const nv = { ...value };
    days.forEach(d => {
      if (!filterFn(d)) return;
      const str = dateStr(d);
      if (d < today) return; // never touch past days
      const cur = nv[str];
      if (!cur)                              nv[str] = type;
      else if (cur !== type && cur !== 'both') nv[str] = 'both';
    });
    onChange(nv);
  };

  const isWeekend   = d => d.getDay() === 0 || d.getDay() === 6;
  const isWeekday   = d => !isWeekend(d);
  const altA        = d => isWeekend(d) && isoWeekNum(d) % 2 === 1;
  const altB        = d => isWeekend(d) && isoWeekNum(d) % 2 === 0;

  const QUICK = [
    { label: 'Mon–Fri  ☀',  fn: () => fill(isWeekday, 'day'),   tip: 'Weekdays — day shift' },
    { label: 'Mon–Fri  🌙', fn: () => fill(isWeekday, 'night'), tip: 'Weekdays — night / on-call' },
    { label: 'Every Wknd ☀',  fn: () => fill(isWeekend, 'day'),   tip: 'Every Saturday & Sunday — day' },
    { label: 'Every Wknd 🌙', fn: () => fill(isWeekend, 'night'), tip: 'Every Saturday & Sunday — night' },
    { label: 'Alt Wknd A ☀',  fn: () => fill(altA, 'day'),   tip: 'Alternating weekends (odd ISO week) — day' },
    { label: 'Alt Wknd A 🌙', fn: () => fill(altA, 'night'), tip: 'Alternating weekends (odd ISO week) — night' },
    { label: 'Alt Wknd B ☀',  fn: () => fill(altB, 'day'),   tip: 'Alternating weekends (even ISO week) — day' },
    { label: 'Alt Wknd B 🌙', fn: () => fill(altB, 'night'), tip: 'Alternating weekends (even ISO week) — night' },
    { label: 'Clear All', fn: () => onChange({}), tip: 'Remove all schedule entries', clear: true },
  ];

  const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayStr   = dateStr(today);

  return (
    <div>
      {/* Quick-fill buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {QUICK.map(({ label, fn, tip, clear }) => (
          <button key={label} onClick={fn} title={tip}
            style={{ fontSize: 7, fontWeight: 700, padding: '3px 7px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", border: `1px solid ${clear ? '#3a1a1a' : '#2a2a2a'}`, color: clear ? '#c04040' : MUT, background: clear ? '#1a0a0a' : '#0a0a0a' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Day-of-week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
        {DOW_LABELS.map(l => (
          <div key={l} style={{ fontSize: 7, textAlign: 'center', color: '#555', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>{l}</div>
        ))}
      </div>

      {/* 5-week grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {days.map(d => {
          const str    = dateStr(d);
          const status = value[str];
          const isPast = d < today;
          const isToday = str === todayStr;
          const isWknd = isWeekend(d);
          const is1st  = d.getDate() === 1;

          return (
            <div key={str} onClick={() => !isPast && toggle(d)}
              style={{
                borderRadius: 2,
                padding: '5px 2px 4px',
                textAlign: 'center',
                cursor: isPast ? 'default' : 'pointer',
                opacity: isPast ? 0.25 : 1,
                background: status ? cellBg(status, 0.18) : isWknd ? '#161616' : '#101010',
                border: `1px solid ${isToday ? ACC : status ? (status === 'day' ? ORANGE + '55' : status === 'night' ? BLUE + '55' : '#667') : isWknd ? '#1e1e1e' : '#181818'}`,
                transition: 'background 0.1s, border 0.1s',
              }}>
              {is1st && (
                <div style={{ fontSize: 6, color: '#666', fontFamily: "'IBM Plex Mono',monospace", marginBottom: 1, lineHeight: 1 }}>
                  {d.toLocaleDateString('en-AU', { month: 'short' })}
                </div>
              )}
              <div style={{ fontSize: 9, fontWeight: status ? 700 : 400, color: status ? (status === 'day' ? ORANGE : status === 'night' ? BLUE : '#aaa') : isToday ? ACC : isWknd ? '#555' : '#666', fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>
                {d.getDate()}
              </div>
              <div style={{ fontSize: 8, lineHeight: 1.2, minHeight: 10 }}>
                {status === 'day'   ? '☀'  : ''}
                {status === 'night' ? '🌙' : ''}
                {status === 'both'  ? '☀🌙' : ''}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 7, color: '#555', flexWrap: 'wrap' }}>
        <span><span style={{ color: ORANGE }}>■</span> Day shift ☀</span>
        <span><span style={{ color: BLUE }}>■</span> Night / on-call 🌙</span>
        <span style={{ color: '#888' }}>■ Both ☀🌙</span>
        <span style={{ marginLeft: 'auto', color: '#444' }}>Tap to cycle · Alt Wknd A/B = alternating weekends</span>
      </div>
    </div>
  );
}
