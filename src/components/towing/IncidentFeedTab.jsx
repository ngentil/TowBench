import { useState, useEffect, useReducer } from 'react'
import { supabase } from '../../lib/supabase'
import { useVicPagers, mergeMessage } from '../../lib/useVicPagers'
import { getRecentVicPagers, dbRowToMessage } from '../../lib/db/incidents'
import { BG, SURF, BRD, BRD2, TXT, MUT, ACC, GRN, RED } from '../../lib/styles'

const MONO = "'IBM Plex Mono', monospace"

const EVENT_LABELS = {
  // Rescue
  RESCC1: 'RESCUE — TRAPPED', RESCC2: 'RESCUE', RESCC3: 'RESCUE',
  // Outside / no-structure fire
  NOSTC1: 'OUTSIDE FIRE', NOSTC2: 'OUTSIDE FIRE', NS: 'OUTSIDE FIRE',
  // Road / vehicle incident
  NOSTC3: 'ROAD INCIDENT', INCIC3: 'ROAD INCIDENT', MVA: 'MOTOR VEHICLE ACC',
  // Structure fire
  SF: 'STRUCTURE FIRE', STRUC1: 'STRUCTURE FIRE', STRUC2: 'STRUCTURE FIRE', STRUC3: 'STRUCTURE FIRE',
  // Grass / scrub
  'G&SC1': 'GRASS FIRE', 'G&SC2': 'GRASS FIRE', 'G&SC3': 'GRASS FIRE',
  // Alarm
  ALARC1: 'ALARM', ALARC2: 'ALARM', ALARC3: 'ALARM',
  // General incident / assist
  INCIC1: 'INCIDENT', INCIC2: 'INCIDENT', ASUPP: 'ASSIST',
  // Medical
  MR: 'MEDICAL RESPONSE',
  // Hazmat
  HZ: 'HAZMAT', HAZMA: 'HAZMAT', HAZM1: 'HAZMAT', CHEM: 'CHEM EMERGENCY', CHEMA: 'CHEM EMERGENCY',
  // Other
  EXPLC: 'EXPLOSION', COLPS: 'COLLAPSE', FLOOD: 'FLOOD', STORM: 'STORM DAMAGE',
}

const FILTERS = [
  { id: 'trapped',  label: 'TRAPPED',  colour: '#d04040', match: i => i.event_type?.startsWith('RESCC') },
  { id: 'veh_fire', label: 'VEH FIRE', colour: '#c87020', match: i => ['NOSTC1','NOSTC2','NS'].includes(i.event_type) },
  { id: 'veh_inc',  label: 'VEH INC',  colour: ACC,       match: i => ['NOSTC3','INCIC3','MVA'].includes(i.event_type) },
  { id: 'struct',   label: 'STRUCT',   colour: '#e05020', match: i => i.event_type === 'SF' || i.event_type?.startsWith('STRUC') },
  { id: 'grass',    label: 'GRASS',    colour: '#40a040', match: i => i.event_type?.startsWith('G&SC') },
  { id: 'alarm',    label: 'ALARM',    colour: '#6090c0', match: i => i.event_type?.startsWith('ALARC') },
  { id: 'medical',  label: 'MEDICAL',  colour: '#8060c0', match: i => i.event_type === 'MR' },
  { id: 'hazmat',   label: 'HAZMAT',   colour: '#b0b020', match: i =>
      i.event_type?.startsWith('HZ') || i.event_type?.startsWith('HAZM') || i.event_type?.startsWith('CHEM') },
  { id: 'incident', label: 'INCIDENT', colour: '#5a5a5a', match: i =>
      ['INCIC1','INCIC2','ASUPP','EXPLC','COLPS'].includes(i.event_type) },
  { id: 'sep' },
  { id: 'cfa',      label: 'CFA',      colour: '#e05020', match: i => i.agency === 'CFA' },
  { id: 'frv',      label: 'FRV',      colour: '#c03030', match: i => i.agency === 'FRV' },
  { id: 'ses',      label: 'SES',      colour: '#b09020', match: i => i.agency === 'SES' },
]
const REAL_FILTERS = FILTERS.filter(f => f.id !== 'sep')

const DEFAULT_FILTERS = new Set(['veh_fire', 'veh_inc'])

function eventColour(type, cancelled) {
  if (cancelled) return MUT
  if (!type) return MUT
  if (type.startsWith('RESCC'))                          return '#d04040'
  if (['NOSTC1','NOSTC2','NS'].includes(type))           return '#c87020'
  if (type === 'SF' || type.startsWith('STRUC'))         return '#e05020'
  if (type.startsWith('G&SC'))                           return '#40a040'
  if (['NOSTC3','INCIC3','MVA'].includes(type))          return ACC
  if (type === 'MR')                                     return '#8060c0'
  if (type.startsWith('HZ') || type.startsWith('HAZM') || type.startsWith('CHEM')) return '#b0b020'
  if (type.startsWith('ALARC'))                          return '#6090c0'
  return MUT
}

function fmtAge(epochMs) {
  if (!epochMs) return null
  const mins = Math.floor((Date.now() - epochMs) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function fmtTime(epochMs) {
  if (!epochMs) return '—'
  return new Date(epochMs).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

function fmt(epochMs) {
  if (!epochMs) return '—'
  return new Date(epochMs).toLocaleTimeString('en-AU', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function IncidentCard({ incident }) {
  const [open, setOpen] = useState(false)
  const colour  = eventColour(incident.event_type, incident.is_cancelled)
  const label   = EVENT_LABELS[incident.event_type] || incident.event_type || 'INCIDENT'
  const units   = incident.responding_units || []
  const msgs    = incident.messages || []
  const ageMins = incident.first_seen ? Math.floor((Date.now() - incident.first_seen) / 60000) : null

  const addr    = incident.address
  const query   = addr ? encodeURIComponent(addr + ' Victoria Australia') : null
  const mapsUrl = query ? `https://www.google.com/maps/search/?api=1&query=${query}` : null
  const svUrl   = query ? `https://maps.google.com/maps?q=${query}&layer=c` : null

  const borderLeft = `3px solid ${colour}`
  const border     = `1px solid ${incident.is_cancelled ? BRD : colour + '55'}`

  return (
    <div style={{ background: '#0d0d0d', border, borderLeft, borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>

      {/* Collapsed header */}
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', userSelect: 'none', opacity: incident.is_cancelled ? 0.45 : 1 }}>
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Row 1: type label + alarm level + age */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: colour, fontFamily: MONO, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {incident.is_cancelled ? '✓ ' : ''}{label}
            </span>
            {incident.alarm_level && (
              <span style={{ fontSize: 7, fontWeight: 700, color: '#c87020', background: '#1a1000', border: '1px solid #3a2a00', padding: '1px 5px', fontFamily: MONO }}>
                {incident.alarm_level}
              </span>
            )}
            {ageMins != null && ageMins > 0 && (
              <span style={{ fontSize: 7, color: ageMins > 60 ? MUT : ACC, border: `1px solid ${ageMins > 60 ? BRD : ACC + '44'}`, borderRadius: 2, padding: '1px 4px', fontFamily: MONO, fontWeight: 700 }}>
                ⏱ {ageMins < 60 ? `${ageMins}m` : `${Math.floor(ageMins/60)}h`}
              </span>
            )}
          </div>

          {/* Row 2: address + cross street */}
          <div style={{ display: 'flex', gap: 5, alignItems: 'baseline', marginTop: 3, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: TXT }}>{addr || '—'}</span>
            {incident.corner && <span style={{ fontSize: 8, color: MUT }}>@ {incident.corner}</span>}
          </div>

          {/* Row 3: agency + incident ID (collapsed only) */}
          {!open && (
            <div style={{ marginTop: 2, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              {incident.agency && <span style={{ fontSize: 7, color: MUT, border: `1px solid ${BRD}`, borderRadius: 2, padding: '1px 4px' }}>{incident.agency}</span>}
              {incident.incident_id && <span style={{ fontSize: 7, color: ACC, fontFamily: MONO }}># {incident.incident_id}</span>}
              {fmt(incident.first_seen) !== '—' && <span style={{ fontSize: 7, color: MUT }}>{fmt(incident.first_seen)}</span>}
            </div>
          )}
        </div>

        <span style={{ fontSize: 8, color: MUT, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid #1a1a1a', opacity: incident.is_cancelled ? 0.6 : 1 }}>

          {/* Description */}
          {incident.description && (
            <div style={{ marginTop: 10, fontSize: 10, color: MUT, lineHeight: 1.6, background: '#0a0a0a', padding: '6px 8px', borderRadius: 2, border: '1px solid #1a1a1a' }}>
              {incident.description}
            </div>
          )}

          {/* Info grid */}
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['Event Type',   incident.event_type || '—'],
              ['Alarm Level',  incident.alarm_level || '—'],
              ['Agency',       incident.agency || '—'],
              ['Incident ID',  incident.incident_id || '—'],
              ['Cross Street', incident.corner || '—'],
              ['Melway',       incident.map_ref || '—'],
              ['Six-Figure',   incident.six_figure || '—'],
              ['Time',         fmt(incident.first_seen)],
              ['Pages',        String(msgs.length)],
              ...(ageMins != null ? [['Age', ageMins < 60 ? `${ageMins}m` : `${Math.floor(ageMins/60)}h ${ageMins%60}m`]] : []),
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ background: SURF, border: `1px solid ${BRD}`, borderRadius: 2, padding: '6px 8px' }}>
                <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>{lbl}</div>
                <div style={{ fontSize: 10, color: TXT, fontFamily: MONO, wordBreak: 'break-all' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Responding units */}
          {units.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {units.map(u => (
                <span key={u} style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: '#6090c0', background: '#0a0f18', border: '1px solid #1a2a3a', padding: '2px 6px' }}>
                  {u}
                </span>
              ))}
            </div>
          )}

          {/* Maps + Street View */}
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#5a7a9a', border: '1px solid #1e2e3e', borderRadius: 2, padding: '4px 8px', textDecoration: 'none', background: '#0a1520' }}>
                📍 Maps
              </a>
            )}
            {svUrl && (
              <a href={svUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#5a6a7a', border: '1px solid #1e2a3a', borderRadius: 2, padding: '4px 8px', textDecoration: 'none', background: '#0a1018' }}>
                🔭 Street View
              </a>
            )}
          </div>

          {/* Raw pages */}
          {msgs.length > 0 && (
            <div style={{ marginTop: 10, border: `1px solid ${BRD}`, borderRadius: 2 }}>
              <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, padding: '5px 8px', borderBottom: `1px solid ${BRD}` }}>
                Pages ({msgs.length})
              </div>
              {msgs.map((m, i) => (
                <div key={m.id ?? i} style={{
                  padding: '6px 8px',
                  borderBottom: i < msgs.length - 1 ? `1px solid ${BRD2}` : 'none',
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                }}>
                  <span style={{ fontFamily: MONO, fontSize: 8, color: BRD, flexShrink: 0, paddingTop: 1 }}>
                    {fmtTime(m.timestamp)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {m.alias && (
                      <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, color: '#6090c0', marginRight: 6 }}>
                        {m.alias}
                      </span>
                    )}
                    <span style={{ fontFamily: MONO, fontSize: 9, color: MUT, wordBreak: 'break-word', lineHeight: 1.4 }}>
                      {m.message || m.parsed?.description || '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  )
}

// incidents state is a plain map { key → incident }; reduce new messages into it
function incidentsReducer(state, action) {
  if (action.type === 'SEED') {
    return action.messages.reduce((acc, msg) => {
      const key = msg.incident_id || `no-incident-${msg.id}`
      if (acc[key]) return acc
      return mergeMessage(acc, msg)
    }, state)
  }
  if (action.type === 'MERGE') {
    return mergeMessage(state, action.msg)
  }
  return state
}

export default function IncidentFeedTab() {
  const [active,       setActive]       = useState(DEFAULT_FILTERS)
  const [historyState, setHistoryState] = useState('loading')
  const [lastDbTs,     setLastDbTs]     = useState(null)  // most recent message timestamp from Supabase
  const [incidents, dispatch] = useReducer(incidentsReducer, {})

  const { incidents: liveIncidents, connected, error, rawCount, lastEvent, connectedAt } = useVicPagers({ towOnly: false })
  const [connectedSecs, setConnectedSecs] = useState(0)

  useEffect(() => {
    if (!connectedAt) { setConnectedSecs(0); return }
    const t = setInterval(() => setConnectedSecs(Math.floor((Date.now() - connectedAt) / 1000)), 5000)
    setConnectedSecs(Math.floor((Date.now() - connectedAt) / 1000))
    return () => clearInterval(t)
  }, [connectedAt])

  // Seed history from Supabase on mount
  useEffect(() => {
    getRecentVicPagers(31)
      .then(rows => {
        const messages = rows.map(dbRowToMessage)
        dispatch({ type: 'SEED', messages })
        // Track the most recent Supabase message for status display
        if (rows.length > 0) {
          const latest = rows[0]
          setLastDbTs(latest.timestamp ?? Date.parse(latest.received_at))
        }
        setHistoryState('ok')
      })
      .catch(() => setHistoryState('error'))
  }, [])

  // Merge live Socket.IO incidents into the reducer
  useEffect(() => {
    liveIncidents.forEach(incident => {
      incident.messages?.forEach(msg => dispatch({ type: 'MERGE', msg }))
    })
  }, [liveIncidents])

  // Supabase realtime — catches messages written by other sessions
  useEffect(() => {
    const channel = supabase
      .channel('vicpagers_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vicpagers_messages' }, ({ new: row }) => {
        const msg = dbRowToMessage(row)
        dispatch({ type: 'MERGE', msg })
        setLastDbTs(msg.timestamp ?? Date.now())
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  function toggle(id) {
    setActive(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const allIncidents = Object.values(incidents)
    .sort((a, b) => b.first_seen - a.first_seen)
    .slice(0, 300)

  const filtered = active.size === 0
    ? allIncidents
    : allIncidents.filter(i => REAL_FILTERS.filter(f => active.has(f.id)).some(f => f.match(i)))

  const totalCount   = allIncidents.length
  const hiddenCount  = totalCount - filtered.length
  const activeCount  = filtered.filter(i => !i.is_cancelled).length
  const cancelCount  = filtered.filter(i =>  i.is_cancelled).length

  const uptime = connectedSecs > 0
    ? (connectedSecs < 60 ? `${connectedSecs}s` : `${Math.floor(connectedSecs / 60)}m`)
    : null

  return (
    <div style={{ background: BG, minHeight: '100%', padding: 16, boxSizing: 'border-box' }}>

      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
        padding: '7px 12px', background: SURF, border: `1px solid ${BRD}`,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: connected ? GRN : error ? RED : MUT,
          boxShadow: connected ? `0 0 6px ${GRN}` : 'none',
        }} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: connected ? GRN : MUT, letterSpacing: '0.05em' }}>
          {connected ? 'LIVE · VICPAGERS' : error ? `OFFLINE — ${error.toUpperCase()}` : 'CONNECTING…'}
        </span>

        {connected && (
          <span style={{ fontFamily: MONO, fontSize: 9, color: BRD, letterSpacing: '0.04em' }}>
            {rawCount > 0
              ? `${rawCount} rx · last: ${lastEvent}`
              : 'awaiting dispatch'}
            {uptime && ` · ${uptime} up`}
          </span>
        )}

        <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>
          {historyState === 'loading' && <span style={{ color: BRD }}>loading history…</span>}
          {historyState === 'ok' && (
            <>
              {activeCount} active
              {cancelCount > 0 && ` · ${cancelCount} cancelled`}
              {hiddenCount > 0 && ` · ${hiddenCount} hidden`}
              {totalCount === 0 && ' · no history'}
            </>
          )}
          {historyState === 'error' && <span style={{ color: RED }}>history unavailable</span>}
        </span>

        {lastDbTs && historyState === 'ok' && (
          <span style={{ fontFamily: MONO, fontSize: 9, color: BRD, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            db: {fmtAge(lastDbTs)}
          </span>
        )}

        <div style={{ display: 'flex', gap: 4, marginLeft: lastDbTs ? 8 : 'auto' }}>
          {active.size > 0 && (
            <button
              onClick={() => setActive(new Set())}
              style={{
                fontFamily: MONO, fontSize: 9, color: MUT,
                background: 'none', border: `1px solid ${BRD}`, cursor: 'pointer',
                padding: '2px 8px', letterSpacing: '0.05em',
              }}
            >
              ALL
            </button>
          )}
          <button
            onClick={() => setActive(new Set(DEFAULT_FILTERS))}
            style={{
              fontFamily: MONO, fontSize: 9, color: MUT,
              background: 'none', border: `1px solid ${BRD}`, cursor: 'pointer',
              padding: '2px 8px', letterSpacing: '0.05em',
            }}
          >
            RESET
          </button>
        </div>
      </div>

      {/* Filter badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
        {FILTERS.map(f =>
          f.id === 'sep'
            ? <div key="sep" style={{ width: 1, background: BRD, margin: '0 2px' }} />
            : (
              <button
                key={f.id}
                onClick={() => toggle(f.id)}
                style={{
                  fontFamily:    MONO,
                  fontSize:      9,
                  fontWeight:    700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding:       '4px 10px',
                  cursor:        'pointer',
                  border:        `1px solid ${active.has(f.id) ? f.colour : BRD}`,
                  background:    active.has(f.id) ? f.colour + '22' : 'transparent',
                  color:         active.has(f.id) ? f.colour : MUT,
                  transition:    'all 0.12s',
                }}
              >
                {f.label}
              </button>
            )
        )}
      </div>

      {/* Incident list */}
      {filtered.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '48px 0',
          fontFamily: MONO, fontSize: 11, color: MUT,
          border: `1px dashed ${BRD}`,
        }}>
          {historyState === 'loading'
            ? 'LOADING 31-DAY HISTORY…'
            : active.size > 0 && hiddenCount > 0
              ? `FILTERS ACTIVE — ${hiddenCount} INCIDENT${hiddenCount !== 1 ? 'S' : ''} HIDDEN · TAP ALL TO SHOW EVERYTHING`
              : 'MONITORING — WAITING FOR DISPATCH'}
        </div>
      )}

      {filtered.map(incident => (
        <IncidentCard
          key={incident.incident_id || incident.messages?.[0]?.id}
          incident={incident}
        />
      ))}
    </div>
  )
}
