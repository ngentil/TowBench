import React, { useState, useEffect, useCallback, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { ACC, MUT, BRD, TXT, GRN, SURF } from '../../lib/styles';
import { getRecentAllocations } from '../../lib/db/towing';
import useWeather from '../../hooks/useWeather';
import { supabase } from '../../lib/supabase';
import { timeIn, fmtTimer, fmtShort, haversineKm } from '../../lib/utils';
import { Highlight } from '../ui/shared';
import { DispatchModal, CompleteModal } from './DispatchTab';

const ORANGE = '#e8870a';

const suburb = f => f.properties?.reference?.startIntersectionLocality || '';

const SORT_OPTIONS = [
  { key: 'recent',  label: 'Most Recent',     fn: (a, b) => new Date(b.properties?.lastUpdated || 0) - new Date(a.properties?.lastUpdated || 0) },
  { key: 'oldest',  label: 'Oldest First',    fn: (a, b) => new Date(a.properties?.lastUpdated || 0) - new Date(b.properties?.lastUpdated || 0) },
  { key: 'road',    label: 'Road Name (A–Z)', fn: (a, b) => (a.properties?.closedRoadName || '').localeCompare(b.properties?.closedRoadName || '') },
  { key: 'suburb',  label: 'Suburb (A–Z)',    fn: (a, b) => suburb(a).localeCompare(suburb(b)) },
  { key: 'lanes',   label: 'Lanes Impacted',  fn: (a, b) => (b.properties?.numberLanesImpacted || 0) - (a.properties?.numberLanesImpacted || 0) },
  { key: 'eventId', label: 'Event ID',        fn: (a, b) => Number(a.properties?.eventId || 0) - Number(b.properties?.eventId || 0) },
];

const EXPORT_PERIODS = [
  { label: 'Last 15 min',  hours: 0.25 },
  { label: 'Last 30 min',  hours: 0.5  },
  { label: 'Last 1 hour',  hours: 1    },
  { label: 'Last 2 hours', hours: 2    },
  { label: 'Last 4 hours', hours: 4    },
  { label: 'Last 8 hours', hours: 8    },
  { label: 'Last 12 hours',hours: 12   },
  { label: 'Last 24 hours',hours: 24   },
  { label: 'Last 2 days',  hours: 48   },
  { label: 'Last 7 days',  hours: 168  },
  { label: 'Last 14 days', hours: 336  },
  { label: 'Last 31 days', hours: 744  },
];

const NEARBY_OPTS = [0, 5, 10, 15, 20, 30];

function StatusBadge({ live }) {
  const color = live ? GRN : '#555';
  return (
    <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px', border: `1px solid ${color}55`, borderRadius: 2, color, background: color + '15', textTransform: 'uppercase' }}>
      {live ? 'Active' : 'Cleared'}
    </span>
  );
}

// DA PIN modal for accepting a job
function DaPinModal({ onConfirm, onCancel, busy, err }) {
  const [pin, setPin] = useState('');
  return (
    <div onClick={e => e.stopPropagation()}
      style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#111', border: '1px solid #2a2a2a', borderTop: `2px solid ${ACC}`, borderRadius: 3, padding: '20px 24px', maxWidth: 300, width: '100%', fontFamily: "'IBM Plex Mono',monospace" }}>
        <div style={{ fontSize: 10, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>Confirm DA</div>
        <div style={{ fontSize: 9, color: MUT, marginBottom: 12, lineHeight: 1.6 }}>Enter the last 4 digits of your DA number to accept this job</div>
        <input type="text" inputMode="numeric" maxLength={4}
          value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="_ _ _ _" autoFocus
          style={{ background: '#0a0a0a', border: `1px solid ${err ? '#cc2222' : '#333'}`, color: TXT,
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 20, letterSpacing: '0.5em',
            padding: '8px 12px', borderRadius: 2, width: '100%', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
        {err && <div style={{ fontSize: 8, color: '#cc4444', marginTop: 6 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={() => onConfirm(pin)} disabled={busy || pin.length < 4}
            style={{ flex: 1, padding: '7px 0', fontSize: 9, fontWeight: 700, color: pin.length === 4 && !busy ? '#000' : MUT,
              background: pin.length === 4 && !busy ? ACC : '#222', border: 'none', borderRadius: 2,
              cursor: pin.length === 4 && !busy ? 'pointer' : 'not-allowed', fontFamily: "'IBM Plex Mono',monospace" }}>
            {busy ? 'Accepting…' : 'Confirm'}
          </button>
          <button onClick={onCancel}
            style={{ padding: '7px 14px', fontSize: 9, color: MUT, background: 'none', border: '1px solid #2a2a2a', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Dispatcher: allocate to plate modal
function AllocateModal({ eventId, onConfirm, onCancel, busy, err }) {
  const [platePart, setPlatePart] = useState('');
  return (
    <div onClick={e => e.stopPropagation()}
      style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#111', border: '1px solid #2a2a2a', borderTop: `2px solid ${ACC}`, borderRadius: 3, padding: '20px 24px', maxWidth: 300, width: '100%', fontFamily: "'IBM Plex Mono',monospace" }}>
        <div style={{ fontSize: 10, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>Allocate to Truck</div>
        <div style={{ fontSize: 9, color: MUT, marginBottom: 12, lineHeight: 1.6 }}>Enter the truck plate to assign job #{eventId}</div>
        <input type="text"
          value={platePart} onChange={e => setPlatePart(e.target.value.toUpperCase().replace(/\s/g, ''))}
          placeholder="e.g. TOW933" autoFocus autoCapitalize="characters"
          style={{ background: '#0a0a0a', border: `1px solid ${err ? '#cc2222' : '#333'}`, color: TXT,
            fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, letterSpacing: '0.2em',
            padding: '8px 12px', borderRadius: 2, width: '100%', outline: 'none', boxSizing: 'border-box', textTransform: 'uppercase' }} />
        {err && <div style={{ fontSize: 8, color: '#cc4444', marginTop: 6 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={() => onConfirm(platePart)} disabled={busy || !platePart.trim()}
            style={{ flex: 1, padding: '7px 0', fontSize: 9, fontWeight: 700,
              color: platePart.trim() && !busy ? '#000' : MUT,
              background: platePart.trim() && !busy ? ACC : '#222', border: 'none', borderRadius: 2,
              cursor: platePart.trim() && !busy ? 'pointer' : 'not-allowed', fontFamily: "'IBM Plex Mono',monospace" }}>
            {busy ? 'Assigning…' : 'Assign'}
          </button>
          <button onClick={onCancel}
            style={{ padding: '7px 14px', fontSize: 9, color: MUT, background: 'none', border: '1px solid #2a2a2a', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function AllocationCard({ feature, fromLog, userPos, nearbyKm, acceptedJob, userEmail, role, isDispatch, companyId, onAccept, onUnassign, onAllocateToPlate, handoverNotes, onAddNote, onEditNote, searchTerm, dispatchedJob, trucks, depots, onDispatch }) {
  const [open, setOpen]               = useState(false);
  const [noteInput, setNoteInput]     = useState('');
  const [showNoteBox, setShowNoteBox] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editInput, setEditInput]     = useState('');
  const [showPinModal,      setShowPinModal]      = useState(false);
  const [pinBusy,           setPinBusy]           = useState(false);
  const [pinErr,            setPinErr]            = useState('');
  const [unassignBusy,      setUnassignBusy]      = useState(false);

  const p          = feature.properties || {};
  const road       = p.closedRoadName || '—';
  const sub        = suburb(feature);
  const crossSt    = p.reference?.startIntersectionRoadName || '';
  const eventId    = p.eventId || '—';
  const desc       = p.description || '';
  const lanes      = p.numberLanesImpacted;
  const impact     = p.impact?.impactType || '';
  const subType    = p.eventSubType || '';
  const eventType  = p.eventType || '';
  const melway     = p.melway || '';
  const created    = p.lastUpdated;
  const coords     = feature.geometry?.coordinates;
  const logMeta    = feature._logMeta;
  const elapsed    = timeIn(logMeta?.firstSeen || p.lastUpdated);
  const isLive     = !fromLog;

  const distKm = (userPos && coords)
    ? haversineKm(userPos.lat, userPos.lng, coords[1], coords[0])
    : null;
  const isNearby = distKm !== null && nearbyKm > 0 && distKm <= nearbyKm && isLive;

  const mapsUrl = coords
    ? `https://www.google.com/maps?q=${coords[1]},${coords[0]}`
    : null;

  const isAcceptedByMe    = isLive && acceptedJob && acceptedJob.accepted_by === userEmail;
  const isAcceptedByOther = isLive && acceptedJob && acceptedJob.accepted_by !== userEmail;
  const acceptedElapsed   = acceptedJob ? fmtTimer(acceptedJob.accepted_at) : null;
  // Dispatch can unassign if the accepted job belongs to their company
  const canUnassign = isDispatch && acceptedJob && (acceptedJob.company_id === companyId || role === 'super_admin');

  const borderLeft = isNearby ? '3px solid #cc2222' : `3px solid ${isLive ? GRN : '#333'}`;
  const border     = isNearby ? '1px solid #cc222255' : '1px solid #252525';

  const handlePinConfirm = async (pin) => {
    setPinBusy(true); setPinErr('');
    const result = await onAccept(String(eventId), pin);
    setPinBusy(false);
    if (result?.ok === false) { setPinErr(result.err || 'Error'); return; }
    setShowPinModal(false);
  };

  const handleUnassign = async (e) => {
    e.stopPropagation();
    if (!window.confirm('Release this allocation globally? Any company can then accept it.')) return;
    setUnassignBusy(true);
    await onUnassign(acceptedJob.id);
    setUnassignBusy(false);
  };

  return (
    <>
    {showPinModal && (
      <DaPinModal busy={pinBusy} err={pinErr}
        onConfirm={handlePinConfirm}
        onCancel={() => { setShowPinModal(false); setPinErr(''); }} />
    )}
    <div className={isNearby ? 'nearby-pulse' : ''}
      style={{ background: '#0d0d0d', border, borderLeft, borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>🚛</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: TXT }}><Highlight text={road} term={searchTerm} /></span>
            <StatusBadge live={isLive} />
            {subType && (
              <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', padding: '1px 5px', border: '1px solid #3a3a2a', borderRadius: 2, color: '#c8a84b', background: '#c8a84b11', textTransform: 'uppercase' }}>
                {subType}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
            {sub && <span style={{ fontSize: 8, color: MUT }}><Highlight text={sub} term={searchTerm} /></span>}
            {crossSt && <><span style={{ fontSize: 8, color: '#333' }}>@</span><span style={{ fontSize: 8, color: MUT }}><Highlight text={crossSt} term={searchTerm} /></span></>}
            {(sub || crossSt) && <span style={{ fontSize: 8, color: '#333' }}>·</span>}
            <span style={{ fontSize: 8, color: ACC, fontFamily: "'IBM Plex Mono',monospace" }}>#<Highlight text={String(eventId)} term={searchTerm} /></span>
          </div>
          {!open && (
            <div style={{ marginTop: 3, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              {isNearby && (
                <span style={{ fontSize: 7, fontWeight: 700, color: '#cc2222', border: '1px solid #cc222255', borderRadius: 2, padding: '1px 4px', fontFamily: "'IBM Plex Mono',monospace" }}>
                  📍 {distKm.toFixed(1)}km away
                </span>
              )}
              {!isNearby && isLive && distKm !== null && (
                <span style={{ fontSize: 7, color: MUT, border: '1px solid #2a2a2a', borderRadius: 2, padding: '1px 4px', fontFamily: "'IBM Plex Mono',monospace" }}>
                  📍 {distKm.toFixed(1)}km
                </span>
              )}
              {elapsed && (
                <span style={{ fontSize: 7, color: ORANGE, border: `1px solid ${ORANGE}44`, borderRadius: 2, padding: '1px 4px', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>
                  ⏱ {elapsed}
                </span>
              )}
              {lanes != null && (
                <span style={{ fontSize: 7, color: MUT, border: '1px solid #2a2a2a', borderRadius: 2, padding: '1px 4px' }}>
                  {lanes} lane{lanes !== 1 ? 's' : ''} impacted
                </span>
              )}
              {impact && <span style={{ fontSize: 7, color: MUT, border: '1px solid #252525', borderRadius: 2, padding: '1px 4px' }}>{impact}</span>}
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {/* Accept button — drivers only, when not yet accepted */}
          {isLive && !acceptedJob && role === 'driver' && (
            <button onClick={e => { e.stopPropagation(); setShowPinModal(true); setPinErr(''); }}
              style={{ background: GRN + '11', border: `1px solid ${GRN}55`, borderRadius: 2, color: GRN, fontSize: 8, padding: '3px 7px', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
              ✓ Accept
            </button>
          )}
          {/* Dispatcher: Allocate button → opens trace/dispatch modal */}
          {isLive && isDispatch && (
            <button onClick={e => { e.stopPropagation(); onDispatch(feature); }}
              style={{ background: '#cc444411', border: '1px solid #cc444455', borderRadius: 2, color: '#cc4444', fontSize: 8, padding: '3px 7px', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
              ▶ Allocate
            </button>
          )}
          {/* Driver: dispatched badge showing truck + depot */}
          {isLive && !isDispatch && dispatchedJob && (() => {
            const truck = trucks?.find(t => t.id === dispatchedJob.truck_id);
            const depot = depots?.find(d => d.id === dispatchedJob.from_depot_id);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <span style={{ fontSize: 7, fontWeight: 700, color: ORANGE, border: `1px solid ${ORANGE}55`, borderRadius: 2, padding: '1px 5px', whiteSpace: 'nowrap', fontFamily: "'IBM Plex Mono',monospace" }}>
                  ALLOCATED
                </span>
                {depot && <span style={{ fontSize: 7, color: MUT, whiteSpace: 'nowrap', fontFamily: "'IBM Plex Mono',monospace" }}>{depot.name}</span>}
                {truck && <span style={{ fontSize: 7, color: TXT, whiteSpace: 'nowrap', fontFamily: "'IBM Plex Mono',monospace" }}>{truck.plate}</span>}
              </div>
            );
          })()}
          {/* My accepted badge (driver) */}
          {isAcceptedByMe && (
            <span style={{ fontSize: 7, color: ACC, fontFamily: "'IBM Plex Mono',monospace", whiteSpace: 'nowrap' }}>
              ✓ {acceptedElapsed}
            </span>
          )}
          {/* Accepted by someone else badge */}
          {acceptedJob && !isAcceptedByMe && (
            <span style={{ fontSize: 7, color: '#c8a84b', border: '1px solid #3a3000', borderRadius: 2, padding: '2px 5px', whiteSpace: 'nowrap',
              maxWidth: isDispatch ? 140 : 90, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
              title={isDispatch ? `Allocated: ${acceptedJob.accepted_by}` : 'Allocated'}>
              🔒 {isDispatch ? acceptedJob.accepted_by.split('@')[0] : 'Allocated'}
            </span>
          )}
          {/* Dispatcher unassign — releases globally */}
          {isLive && canUnassign && (
            <button onClick={handleUnassign} disabled={unassignBusy}
              style={{ background: '#1a0000', border: '1px solid #cc222255', borderRadius: 2, color: '#cc6666', fontSize: 8, padding: '3px 7px', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em', whiteSpace: 'nowrap', opacity: unassignBusy ? 0.5 : 1 }}>
              ✕ Unassign
            </button>
          )}
          <span style={{ fontSize: 8, color: MUT }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid #1a1a1a' }}>
          {isAcceptedByMe && (
            <div style={{ marginTop: 10, padding: '6px 10px', background: ACC + '11', border: `1px solid ${ACC}33`, borderRadius: 2, fontSize: 9, color: ACC }}>
              ✓ Accepted by you — {acceptedElapsed}
            </div>
          )}
          {desc && (
            <div style={{ marginTop: 10, fontSize: 10, color: MUT, lineHeight: 1.6, background: '#0a0a0a', padding: '6px 8px', borderRadius: 2, border: '1px solid #1a1a1a' }}>
              <Highlight text={desc} term={searchTerm} />
            </div>
          )}
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['AAC Job ID',     `#${eventId}`],
              ['Status',         isLive ? 'Active' : 'Cleared'],
              ['Event Type',     eventType || '—'],
              ['Incident Type',  subType   || '—'],
              ['Lanes Impacted', lanes != null ? `${lanes} lane${lanes !== 1 ? 's' : ''}` : '—'],
              ['Impact Type',    impact    || '—'],
              ['Cross Street',   crossSt   || '—'],
              ['Melway',         melway    || '—'],
              ['Time In',        elapsed   || '—'],
              ['Last Updated',   fmtShort(created)],
              ...(logMeta ? [
                ['First Seen', fmtShort(logMeta.firstSeen)],
                ['Last Seen',  fmtShort(logMeta.lastSeen)],
                ...(logMeta.clearedAt ? [['Cleared', fmtShort(logMeta.clearedAt)]] : []),
              ] : []),
              ...(coords ? [['Coordinates', `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`]] : []),
            ].map(([label, val]) => (
              <div key={label} style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '6px 8px' }}>
                <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 10, color: TXT, fontFamily: "'IBM Plex Mono',monospace", wordBreak: 'break-all' }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#5a7a9a', border: '1px solid #1e2e3e', borderRadius: 2, padding: '4px 8px', textDecoration: 'none', background: '#0a1520' }}>
                📍 Maps
              </a>
            )}
            {coords && (
              <a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coords[1]},${coords[0]}`}
                target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#5a6a7a', border: '1px solid #1e2a3a', borderRadius: 2, padding: '4px 8px', textDecoration: 'none', background: '#0a1018' }}>
                🔭 Street View
              </a>
            )}
          </div>

          {handoverNotes.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 7, color: '#6a5a20', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>
                Handover Notes ({handoverNotes.length})
              </div>
              {handoverNotes.map(hn => (
                <div key={hn.id} style={{ background: '#0d0c00', border: '1px solid #3a3000', borderLeft: '3px solid #c8a84b', borderRadius: 2, padding: '8px 10px', marginBottom: 6 }}>
                  {editingNoteId === hn.id ? (
                    <div>
                      <textarea
                        value={editInput} onChange={e => setEditInput(e.target.value)}
                        style={{ width: '100%', background: '#0a0a0a', border: '1px solid #3a3000', color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, padding: '6px 8px', borderRadius: 2, outline: 'none', resize: 'vertical', minHeight: 56, boxSizing: 'border-box' }}
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                        <button onClick={async () => { if (editInput.trim()) { await onEditNote(hn.id, String(eventId), editInput.trim()); setEditingNoteId(null); } }}
                          style={{ fontSize: 8, fontWeight: 700, padding: '3px 8px', background: '#c8a84b22', border: '1px solid #c8a84b55', color: '#c8a84b', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace" }}>
                          Save
                        </button>
                        <button onClick={() => setEditingNoteId(null)}
                          style={{ fontSize: 8, padding: '3px 8px', background: 'none', border: '1px solid #2a2a2a', color: MUT, borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 9, color: '#c8a84b', lineHeight: 1.6 }}>
                        <Highlight text={hn.note} term={searchTerm} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <div style={{ fontSize: 7, color: '#4a4010' }}>
                          {hn.created_by?.split('@')[0]} · {fmtShort(hn.created_at || hn.expires_at)}
                        </div>
                        <button onClick={() => { setEditingNoteId(hn.id); setEditInput(hn.note); }}
                          style={{ fontSize: 7, padding: '2px 6px', background: 'none', border: '1px solid #3a3000', color: '#6a5a20', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace" }}>
                          Edit
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {showNoteBox ? (
            <div style={{ marginTop: 10 }}>
              <textarea
                value={noteInput} onChange={e => setNoteInput(e.target.value)}
                placeholder="Handover note…"
                style={{ width: '100%', background: '#0a0a0a', border: '1px solid #2a2a2a', color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, padding: '6px 8px', borderRadius: 2, outline: 'none', resize: 'vertical', minHeight: 56, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                <button onClick={async () => { if (noteInput.trim()) { await onAddNote(String(eventId), noteInput.trim(), userEmail); setNoteInput(''); setShowNoteBox(false); } }}
                  style={{ fontSize: 8, fontWeight: 700, padding: '3px 8px', background: '#c8a84b22', border: '1px solid #c8a84b55', color: '#c8a84b', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace" }}>
                  Save Note
                </button>
                <button onClick={() => setShowNoteBox(false)}
                  style={{ fontSize: 8, padding: '3px 8px', background: 'none', border: '1px solid #2a2a2a', color: MUT, borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace" }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNoteBox(true)}
              style={{ marginTop: 10, fontSize: 8, color: '#6a5a20', border: '1px dashed #3a3000', background: 'none', borderRadius: 2, padding: '3px 8px', cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace" }}>
              + Add Note
            </button>
          )}

          {!isLive && logMeta?.firstSeen && (
            <div style={{ marginTop: 12, background: '#080808', border: '1px solid #1a1a1a', borderRadius: 2, padding: '10px 12px' }}>
              <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 700 }}>Lifecycle</div>
              {[
                { label: 'First seen',   time: logMeta.firstSeen, dot: GRN },
                ...(logMeta.lastSeen && logMeta.lastSeen !== logMeta.firstSeen
                    ? [{ label: 'Last updated', time: logMeta.lastSeen, dot: '#5a5a5a' }] : []),
                ...(logMeta.clearedAt
                    ? [{ label: 'Cleared', time: logMeta.clearedAt, dot: '#444' }] : []),
              ].map((ev, i, arr) => {
                const prevTime = i > 0 ? arr[i - 1].time : null;
                const diffMin = prevTime ? Math.round((new Date(ev.time) - new Date(prevTime)) / 60000) : null;
                const dur = diffMin === null ? null
                  : diffMin < 60 ? `${diffMin}m`
                  : `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
                return (
                  <React.Fragment key={i}>
                    {dur && (
                      <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 2, padding: '2px 0' }}>
                        <div style={{ width: 1, background: '#2a2a2a', height: 14, margin: '0 10px 0 2px', flexShrink: 0 }} />
                        <span style={{ fontSize: 7, color: '#3a3a3a', fontStyle: 'italic' }}>{dur}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: ev.dot, flexShrink: 0, boxShadow: i === 0 ? `0 0 5px ${ev.dot}` : 'none' }} />
                      <div>
                        <div style={{ fontSize: 7, color: MUT, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{ev.label}</div>
                        <div style={{ fontSize: 9, color: TXT, fontFamily: "'IBM Plex Mono',monospace" }}>{fmtShort(ev.time)}</div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}

export default function TowAllocationsTab({ allFeatures, liveIds, loading, err, lastFetch, countdown, fetchAllocations, isStale, acceptedJobs, userEmail, role, isDispatch, companyId, onAcceptJob, onUnassignJob, onAllocateToPlate, companyConfig }) {
  const { rainSoon, maxProb, hoursUntil } = useWeather();
  const [handoverNotes, setHandoverNotes] = useState(new Map());

  // Dispatch integration
  const [trucks,         setTrucks]         = useState([]);
  const [depots,         setDepots]         = useState([]);
  const [storageTypes,   setStorageTypes]   = useState([]);
  const [dispatchedMap,  setDispatchedMap]  = useState(new Map());
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [completeTarget, setCompleteTarget] = useState(null);

  useEffect(() => {
    if (!companyId) return;
    supabase.from('tow_trucks').select('id,plate,first_name,last_name,depot_id').eq('company_id', companyId).eq('approved', true)
      .then(({ data }) => setTrucks(data || []));
    supabase.from('depots').select('id,name,suburb,lat,lng').eq('company_id', companyId)
      .then(({ data }) => setDepots(data || []));
    supabase.from('storage_types').select('*').eq('company_id', companyId).order('daily_rate', { ascending: false })
      .then(({ data }) => setStorageTypes(data || []));
    supabase.from('dispatched_jobs').select('*').eq('company_id', companyId).eq('status', 'in_progress')
      .then(({ data }) => {
        const m = new Map();
        (data || []).forEach(j => { if (j.event_id) m.set(String(j.event_id), j); });
        setDispatchedMap(m);
      });
  }, [companyId]);

  const onDispatchSave = (savedJob) => {
    setDispatchedMap(prev => new Map(prev).set(String(savedJob.event_id), savedJob));
    setDispatchTarget(null);
  };

  const onCompleteSave = (jobId) => {
    setDispatchedMap(prev => { const m = new Map(prev); for (const [k, v] of m) if (v.id === jobId) m.delete(k); return m; });
    setCompleteTarget(null);
  };

  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const { data } = await supabase
          .from('map_notes')
          .select('id, allocation_id, note, created_by, created_at, expires_at')
          .not('allocation_id', 'is', null);
        if (data) {
          const map = new Map();
          data.forEach(n => {
            const key = String(n.allocation_id);
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(n);
          });
          setHandoverNotes(map);
        }
      } catch { /* table may not exist yet */ }
    };
    fetchNotes();
  }, []);

  const addHandoverNote = useCallback(async (eventId, note, userEmail) => {
    const { data } = await supabase.from('map_notes')
      .insert({ allocation_id: String(eventId), note, created_by: userEmail })
      .select().single();
    if (data) setHandoverNotes(prev => {
      const next = new Map(prev);
      const key = String(eventId);
      next.set(key, [...(next.get(key) || []), data]);
      return next;
    });
  }, []);

  const editHandoverNote = useCallback(async (noteId, eventId, note) => {
    const { data } = await supabase.from('map_notes')
      .update({ note })
      .eq('id', noteId)
      .select().single();
    if (data) setHandoverNotes(prev => {
      const next = new Map(prev);
      const key = String(eventId);
      next.set(key, (next.get(key) || []).map(n => n.id === noteId ? data : n));
      return next;
    });
  }, []);

  const [userPos, setUserPos] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      p => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const [nearbyKm,     setNearbyKm]     = useState(() => Number(localStorage.getItem('towbench_nearby_km') ?? 10));
  const [timeRange,    setTimeRange]    = useState('31d');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm,   setSearchTerm]   = useState('');
  const [sortBy,       setSortBy]       = useState('recent');
  const [showSort,     setShowSort]     = useState(false);
  const [showExport,   setShowExport]   = useState(false);
  const [exportHours,  setExportHours]  = useState(24);
  const [exporting,    setExporting]    = useState(false);
  const sortRef   = useRef(null);
  const exportRef = useRef(null);

  useEffect(() => {
    const handler = e => {
      if (sortRef.current   && !sortRef.current.contains(e.target))   setShowSort(false);
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const setRadius = (km) => { setNearbyKm(km); localStorage.setItem('towbench_nearby_km', km); };

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const period   = EXPORT_PERIODS.find(p => p.hours === exportHours);
      const features = await getRecentAllocations(exportHours);
      features.sort((a, b) => new Date(b.properties?.lastUpdated || 0) - new Date(a.properties?.lastUpdated || 0));
      const doc = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' });
      const W = 210, ML = 12, CW = 186;
      const now = new Date();
      const liveSet = liveIds;
      const activeCount  = features.filter(f => liveSet.has(String(f.properties?.eventId))).length;
      const clearedCount = features.length - activeCount;
      const clip = (text, maxW) => {
        const lines = doc.splitTextToSize(String(text || '—'), maxW);
        return lines.length > 1 ? lines[0].replace(/.$/, '…') : lines[0];
      };
      doc.setFillColor(15, 15, 15); doc.rect(0, 0, W, 30, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
      doc.text('TOW ALLOCATION REPORT', ML, 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(160, 160, 160);
      doc.text(`${period.label}  ·  ${features.length} allocation${features.length !== 1 ? 's' : ''}`, ML, 19);
      doc.text(`Generated: ${now.toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}`, ML, 25);
      let y = 35;
      const bw = CW / 3 - 2;
      [['TOTAL', String(features.length), [60,60,60]], ['ACTIVE', String(activeCount), [50,160,100]], ['CLEARED', String(clearedCount), [100,100,100]]]
        .forEach(([lbl, val, rgb], i) => {
          const bx = ML + i * (bw + 3);
          doc.setFillColor(247, 247, 247); doc.rect(bx, y, bw, 14, 'F');
          doc.setDrawColor(220, 220, 220); doc.rect(bx, y, bw, 14, 'S');
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(140, 140, 140);
          doc.text(lbl, bx + bw / 2, y + 5, { align: 'center' });
          doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...rgb);
          doc.text(val, bx + bw / 2, y + 11.5, { align: 'center' });
        });
      y += 18;
      const COLS = [{ label: 'ROAD NAME', w: 50 }, { label: 'SUBURB', w: 38 }, { label: 'STATUS', w: 18 }, { label: 'EVENT ID', w: 22 }, { label: 'LANES', w: 13 }, { label: 'LAST UPDATED', w: 45 }];
      let cx = ML; COLS.forEach(c => { c.x = cx; cx += c.w; });
      const ROW_H = 7;
      const drawHeader = (yy) => {
        doc.setFillColor(25, 25, 25); doc.rect(ML, yy, CW, ROW_H, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(180, 180, 180);
        COLS.forEach(c => doc.text(c.label, c.x + 2, yy + 4.5));
      };
      drawHeader(y); y += ROW_H;
      features.forEach((f, i) => {
        if (y + ROW_H > 283) { doc.addPage(); y = 15; drawHeader(y); y += ROW_H; }
        const p = f.properties || {};
        const isLive = liveSet.has(String(p.eventId));
        if (i % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(ML, y, CW, ROW_H, 'F'); }
        doc.setDrawColor(230, 230, 230); doc.line(ML, y + ROW_H, ML + CW, y + ROW_H);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(30, 30, 30);
        doc.text(clip(p.closedRoadName, COLS[0].w - 4), COLS[0].x + 2, y + 4.5);
        doc.text(clip(suburb(f), COLS[1].w - 4), COLS[1].x + 2, y + 4.5);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...(isLive ? [50,160,100] : [110,110,110]));
        doc.text(isLive ? 'Active' : 'Cleared', COLS[2].x + 2, y + 4.5);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
        doc.text(String(p.eventId || '—'), COLS[3].x + 2, y + 4.5);
        doc.text(p.numberLanesImpacted != null ? String(p.numberLanesImpacted) : '—', COLS[4].x + 2, y + 4.5);
        doc.text(fmtShort(p.lastUpdated), COLS[5].x + 2, y + 4.5);
        y += ROW_H;
      });
      const pages = doc.getNumberOfPages();
      for (let pg = 1; pg <= pages; pg++) {
        doc.setPage(pg); doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(170, 170, 170);
        doc.text(`TowBench · Tow Allocation Report · Page ${pg} of ${pages}`, W / 2, 293, { align: 'center' });
      }
      doc.save(`tow-allocations-${period.label.replace(/\s+/g, '-').toLowerCase()}-${now.toISOString().slice(0, 10)}.pdf`);
      setShowExport(false);
    } catch (e) { console.error('exportPDF failed:', e); }
    finally { setExporting(false); }
  }, [exportHours, liveIds]);

  const sortFn = SORT_OPTIONS.find(o => o.key === sortBy)?.fn;
  const TIME_MS = { '24h': 864e5, '7d': 6048e5, '31d': Infinity };
  const timeCutoff = Date.now() - TIME_MS[timeRange];
  const timeFiltered = allFeatures.filter(f => {
    const t = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated || 0).getTime();
    return t >= timeCutoff;
  });
  const searched = searchTerm.trim()
    ? timeFiltered.filter(f => {
        const p = f.properties || {};
        const hay = [p.closedRoadName, p.reference?.startIntersectionLocality, p.eventId, p.description, p.eventSubType, p.reference?.startIntersectionRoadName].join(' ').toLowerCase();
        if (hay.includes(searchTerm.toLowerCase())) return true;
        const notes = handoverNotes.get(String(p.eventId)) || [];
        return notes.some(n => n.note.toLowerCase().includes(searchTerm.toLowerCase()));
      })
    : timeFiltered;
  const sorted  = [...searched].sort(sortFn);
  const active  = sorted.filter(f =>  liveIds.has(String(f.properties?.eventId)));
  const cleared = sorted.filter(f => !liveIds.has(String(f.properties?.eventId)));
  const currentSort = SORT_OPTIONS.find(o => o.key === sortBy);

  return (
    <>
    {dispatchTarget && (
      <DispatchModal
        feature={dispatchTarget} trucks={trucks} depots={depots}
        companyConfig={companyConfig} companyId={companyId} userEmail={userEmail}
        onSave={onDispatchSave}
        onCancel={() => setDispatchTarget(null)}
      />
    )}
    {completeTarget && (
      <CompleteModal
        job={completeTarget} trucks={trucks} depots={depots}
        storageTypes={storageTypes} companyId={companyId} userEmail={userEmail}
        onSave={savedJob => onCompleteSave(savedJob.id)}
        onCancel={() => setCompleteTarget(null)}
      />
    )}
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>{isDispatch ? '🚨 Dispatch' : '🚛 Tow Allocations'}</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            VicRoads feed · {{ '24h': 'last 24 hours', '7d': 'last 7 days', '31d': 'last 31 days' }[timeRange]} · {timeFiltered.length} allocation{timeFiltered.length !== 1 ? 's' : ''}
            {active.length > 0 && <span style={{ color: GRN, marginLeft: 8 }}>· {active.length} active · {cleared.length} cleared</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 8, color: MUT }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
              background: !lastFetch ? '#555' : isStale ? '#cc2222' : GRN,
              boxShadow: !lastFetch ? 'none' : isStale ? '0 0 6px #cc2222aa' : `0 0 6px ${GRN}aa` }} />
            {lastFetch
              ? (isStale
                  ? `Stale · last ${timeIn(lastFetch.toISOString())} ago`
                  : `Live ${lastFetch.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} · next in ${countdown}s`)
              : 'Connecting…'}
          </span>
          <div ref={sortRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowSort(s => !s)}
              style={{ fontSize: 8, color: showSort ? ACC : MUT, border: `1px solid ${showSort ? ACC + '66' : '#2a2a2a'}`, background: showSort ? ACC + '11' : '#0d0d0d', padding: '3px 8px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
              ⇅ {currentSort?.label}
            </button>
            {showSort && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50, background: '#111', border: '1px solid #2a2a2a', borderRadius: 2, minWidth: 160, boxShadow: '0 4px 16px #000a' }}>
                {SORT_OPTIONS.map(opt => (
                  <div key={opt.key} onClick={() => { setSortBy(opt.key); setShowSort(false); }}
                    style={{ padding: '7px 12px', fontSize: 9, color: opt.key === sortBy ? ACC : TXT, background: opt.key === sortBy ? ACC + '11' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #1a1a1a', fontFamily: "'IBM Plex Mono',monospace" }}>
                    <span style={{ color: opt.key === sortBy ? ACC : '#333', width: 8 }}>{opt.key === sortBy ? '✓' : ''}</span>
                    {opt.label}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div ref={exportRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowExport(s => !s)}
              style={{ fontSize: 8, color: showExport ? ACC : MUT, border: `1px solid ${showExport ? ACC + '66' : '#2a2a2a'}`, background: showExport ? ACC + '11' : '#0d0d0d', padding: '3px 8px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>
              ⬇ Export PDF
            </button>
            {showExport && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50, background: '#111', border: '1px solid #2a2a2a', borderRadius: 2, minWidth: 180, boxShadow: '0 4px 16px #000a' }}>
                <div style={{ padding: '8px 12px 6px', fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid #1a1a1a' }}>Select period</div>
                {EXPORT_PERIODS.map(p => (
                  <div key={p.hours} onClick={() => setExportHours(p.hours)}
                    style={{ padding: '6px 12px', fontSize: 9, color: p.hours === exportHours ? ACC : TXT, background: p.hours === exportHours ? ACC + '11' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #1a1a1a', fontFamily: "'IBM Plex Mono',monospace" }}>
                    <span style={{ color: p.hours === exportHours ? ACC : '#333', width: 8 }}>{p.hours === exportHours ? '✓' : ''}</span>
                    {p.label}
                  </div>
                ))}
                <div style={{ padding: '8px 12px' }}>
                  <button onClick={handleExport} disabled={exporting}
                    style={{ width: '100%', padding: '5px 0', fontSize: 9, fontWeight: 700, color: exporting ? MUT : '#000', background: exporting ? '#222' : ACC, border: 'none', borderRadius: 2, cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em' }}>
                    {exporting ? 'Generating…' : '⬇ Generate PDF'}
                  </button>
                </div>
              </div>
            )}
          </div>
          <button onClick={fetchAllocations}
            style={{ fontSize: 8, color: ACC, border: `1px solid ${ACC}44`, background: ACC + '11', padding: '3px 8px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {allFeatures.length > 0 && (() => {
        const TIME_LABELS  = { '24h': 'Last 24h', '7d': 'Last 7d', '31d': '31d Total' };
        const TIME_CYCLE   = { '24h': '7d', '7d': '31d', '31d': '24h' };
        const STATUS_CYCLE = { all: 'active', active: 'cleared', cleared: 'all' };
        const tile2Active  = statusFilter !== 'all';
        return (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div onClick={() => setTimeRange(r => TIME_CYCLE[r])}
                style={{ background: SURF, border: '1px solid ' + BRD, borderTop: `2px solid ${TXT}`, borderRadius: 2, padding: '8px 10px', textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>{TIME_LABELS[timeRange]}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: TXT, fontFamily: "'IBM Plex Mono',monospace" }}>{timeFiltered.length}</div>
              </div>
              <div onClick={() => setStatusFilter(s => STATUS_CYCLE[s])}
                style={{ background: tile2Active ? GRN + '18' : SURF, border: `1px solid ${tile2Active ? GRN + '88' : BRD}`, borderTop: `2px solid ${GRN}`, borderRadius: 2, padding: '8px 10px', textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ fontSize: 8, color: tile2Active ? GRN : MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>
                  {statusFilter === 'all' ? 'Active' : statusFilter === 'active' ? 'Active ✓' : 'Cleared ✓'}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: GRN, fontFamily: "'IBM Plex Mono',monospace" }}>{active.length}</div>
              </div>
              <div style={{ background: SURF, border: '1px solid ' + BRD, borderTop: `2px solid ${MUT}`, borderRadius: 2, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Cleared</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: MUT, fontFamily: "'IBM Plex Mono',monospace" }}>{cleared.length}</div>
              </div>
            </div>
            <div style={{ marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search road, suburb, event ID, notes…"
                style={{ flex: 1, background: '#0a0a0a', border: '1px solid #252525', color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, padding: '6px 10px', borderRadius: 2, outline: 'none' }} />
              {['all', 'active', 'cleared'].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 8px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace",
                    background: statusFilter === s ? (s === 'active' ? GRN + '22' : s === 'cleared' ? '#33333388' : ACC + '22') : '#0d0d0d',
                    border: `1px solid ${statusFilter === s ? (s === 'active' ? GRN : s === 'cleared' ? '#555' : ACC) : '#2a2a2a'}`,
                    color: statusFilter === s ? (s === 'active' ? GRN : s === 'cleared' ? '#888' : ACC) : MUT }}>
                  {s === 'all' ? 'All' : s === 'active' ? 'Active' : 'Cleared'}
                </button>
              ))}
            </div>
            <div style={{ marginBottom: 12, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 8, color: MUT, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>📍 Nearby pulse</span>
              {NEARBY_OPTS.map(km => (
                <button key={km} onClick={() => setRadius(km)}
                  style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 7px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace",
                    background: nearbyKm === km ? '#cc222222' : '#0d0d0d',
                    border: `1px solid ${nearbyKm === km ? '#cc2222' : '#2a2a2a'}`,
                    color: nearbyKm === km ? '#cc2222' : MUT }}>
                  {km === 0 ? 'Off' : `${km}km`}
                </button>
              ))}
              <input
                type="number" min="1" max="999"
                placeholder="km"
                value={nearbyKm > 0 && !NEARBY_OPTS.includes(nearbyKm) ? nearbyKm : ''}
                onChange={e => { const v = Number(e.target.value); if (v > 0) setRadius(v); }}
                style={{ width: 44, background: '#0a0a0a',
                  border: `1px solid ${nearbyKm > 0 && !NEARBY_OPTS.includes(nearbyKm) ? '#cc2222' : '#2a2a2a'}`,
                  color: TXT, fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, padding: '3px 5px',
                  borderRadius: 2, outline: 'none', textAlign: 'center' }}
              />
            </div>
          </>
        );
      })()}

      {rainSoon && (
        <div style={{ marginBottom: 10, padding: '7px 12px', background: '#0a1520', border: '1px solid #1e3a5a', borderLeft: '3px solid #4a8ab0', borderRadius: 2, fontSize: 9, color: '#7ab0d0', lineHeight: 1.5 }}>
          🌧 Rain likely {hoursUntil === 0 ? 'now' : `in ~${hoursUntil}h`} ({maxProb}%) · Wet-weather hotspots: CityLink, Monash, Punt Rd
        </div>
      )}
      {isStale && (
        <div style={{ marginBottom: 12, fontSize: 9, padding: '8px 12px', borderRadius: 2, color: '#cc6666', background: '#1a000088', border: '1px solid #cc222244', lineHeight: 1.6 }}>
          ⚠ Feed may be stale — last successful update {timeIn(lastFetch?.toISOString())} ago. Check your connection.
        </div>
      )}
      {err && (
        <div style={{ marginBottom: 12, fontSize: 9, padding: '8px 12px', borderRadius: 2, color: ORANGE, background: ORANGE + '11', border: `1px solid ${ORANGE}44`, lineHeight: 1.6 }}>
          ⚠ Live feed error: {err}<br />
          <span style={{ color: MUT }}>Showing logged history. Feed updates every 60 seconds.</span>
        </div>
      )}
      {loading && allFeatures.length === 0 && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0' }}>Loading…</div>
      )}
      {!loading && allFeatures.length === 0 && (
        <div style={{ fontSize: 10, color: MUT, textAlign: 'center', padding: '32px 0', lineHeight: 1.8 }}>
          No tow allocations in the last 31 days.<br />
          <span style={{ fontSize: 8 }}>Feed updates every 60 seconds.</span>
        </div>
      )}
      {(statusFilter === 'all' || statusFilter === 'active') && active.length > 0 && (
        <>
          <div style={{ fontSize: 8, color: GRN, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6, borderLeft: `2px solid ${GRN}`, paddingLeft: 6 }}>
            Active ({active.length})
          </div>
          {active.map((f, i) => (
            <AllocationCard key={f.properties?.eventId || i} feature={f} fromLog={false} userPos={userPos} nearbyKm={nearbyKm}
              acceptedJob={acceptedJobs?.get(String(f.properties?.eventId))} userEmail={userEmail}
              role={role} isDispatch={isDispatch} companyId={companyId}
              onAccept={onAcceptJob} onUnassign={onUnassignJob} onAllocateToPlate={onAllocateToPlate}
              handoverNotes={handoverNotes.get(String(f.properties?.eventId)) || []} onAddNote={addHandoverNote} onEditNote={editHandoverNote}
              searchTerm={searchTerm.trim()}
              dispatchedJob={dispatchedMap.get(String(f.properties?.eventId))}
              trucks={trucks} depots={depots}
              onDispatch={setDispatchTarget} />
          ))}
          {statusFilter === 'all' && cleared.length > 0 && <div style={{ marginTop: 12 }} />}
        </>
      )}
      {(statusFilter === 'all' || statusFilter === 'cleared') && cleared.length > 0 && (
        <>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6, borderLeft: '2px solid #444', paddingLeft: 6 }}>
            Cleared ({cleared.length})
          </div>
          {cleared.map((f, i) => (
            <AllocationCard key={f.properties?.eventId || i} feature={f} fromLog={true} userPos={userPos} nearbyKm={nearbyKm}
              acceptedJob={null} userEmail={userEmail}
              role={role} isDispatch={isDispatch} companyId={companyId}
              onAccept={null} onUnassign={null} onAllocateToPlate={null}
              handoverNotes={handoverNotes.get(String(f.properties?.eventId)) || []} onAddNote={addHandoverNote} onEditNote={editHandoverNote}
              searchTerm={searchTerm.trim()}
              dispatchedJob={null} trucks={trucks} depots={depots} onDispatch={setDispatchTarget} />
          ))}
        </>
      )}
    </div>
    </>
  );
}
