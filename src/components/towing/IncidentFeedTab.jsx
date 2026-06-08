import { useState, useEffect, useReducer } from 'react'
import { supabase } from '../../lib/supabase'
import { useVicPagers, mergeMessage } from '../../lib/useVicPagers'
import { getRecentVicPagers, dbRowToMessage } from '../../lib/db/incidents'
import { BG, SURF, BRD, BRD2, TXT, MUT, ACC, GRN, RED } from '../../lib/styles'

const MONO = "'IBM Plex Mono', monospace"

const EVENT_LABELS = {
  RESCC1: 'RESCUE — PERSONS TRAPPED',
  NOSTC1: 'VEHICLE FIRE',
  NOSTC3: 'VEHICLE INCIDENT',
  INCIC3: 'VEHICLE INCIDENT',
  INCIC1: 'INCIDENT',
  ALARC1: 'ALARM',
  SF:     'STRUCTURE FIRE',
  NS:     'SPARKS FROM VEHICLE',
}

const FILTERS = [
  { id: 'trapped',  label: 'TRAPPED',  colour: '#d04040', match: i => i.event_type?.startsWith('RESCC') },
  { id: 'veh_fire', label: 'VEH FIRE', colour: '#c87020', match: i => ['NOSTC1','NS','SF'].includes(i.event_type) },
  { id: 'veh_inc',  label: 'VEH INC',  colour: ACC,       match: i => ['NOSTC3','INCIC1','INCIC3'].includes(i.event_type) },
  { id: 'alarm',    label: 'ALARM',    colour: '#6090c0', match: i => i.event_type?.startsWith('ALARC') },
  { id: 'sep' },
  { id: 'cfa',      label: 'CFA',      colour: '#e05020', match: i => i.agency === 'CFA' },
  { id: 'frv',      label: 'FRV',      colour: '#c03030', match: i => i.agency === 'FRV' },
  { id: 'ses',      label: 'SES',      colour: '#b09020', match: i => i.agency === 'SES' },
]
const REAL_FILTERS = FILTERS.filter(f => f.id !== 'sep')

function eventColour(type, cancelled) {
  if (cancelled) return MUT
  if (!type) return MUT
  if (type.startsWith('RESCC'))                          return '#d04040'
  if (type === 'NOSTC1' || type === 'NS' || type === 'SF') return '#c87020'
  if (type.startsWith('NOSTC') || type.startsWith('INCIC')) return ACC
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

function fmt(epochMs) {
  if (!epochMs) return '—'
  return new Date(epochMs).toLocaleTimeString('en-AU', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function IncidentCard({ incident }) {
  const [open, setOpen] = useState(false)
  const colour = eventColour(incident.event_type, incident.is_cancelled)
  const label  = EVENT_LABELS[incident.event_type] || incident.event_type || 'INCIDENT'
  const units  = incident.responding_units || []
  const ageMins = incident.first_seen ? Math.floor((Date.now() - incident.first_seen) / 60000) : null

  return (
    <div
      onClick={() => setOpen(o => !o)}
      style={{
        border:      `1px solid ${incident.is_cancelled ? BRD : colour}`,
        borderLeft:  `3px solid ${colour}`,
        background:   SURF,
        marginBottom: 5,
        cursor:      'pointer',
        userSelect:  'none',
        opacity:     incident.is_cancelled ? 0.45 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
        <span style={{
          fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
          color: colour, textTransform: 'uppercase', minWidth: 140, flexShrink: 0,
        }}>
          {incident.is_cancelled ? '✓ ' : ''}{label}
        </span>

        {incident.alarm_level && (
          <span style={{
            fontFamily: MONO, fontSize: 8, fontWeight: 700,
            color: '#c87020', background: '#1a1000', border: '1px solid #3a2a00',
            padding: '1px 5px', flexShrink: 0,
          }}>
            {incident.alarm_level}
          </span>
        )}

        <span style={{
          flex: 1, fontFamily: MONO, fontSize: 11, color: TXT,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {incident.address || '—'}
        </span>

        <span style={{ fontFamily: MONO, fontSize: 9, color: MUT, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {fmt(incident.first_seen)}
          {ageMins != null && ageMins > 0 && (
            <span style={{ color: ageMins > 60 ? BRD2 : MUT }}> +{ageMins < 60 ? `${ageMins}m` : `${Math.floor(ageMins/60)}h`}</span>
          )}
        </span>

        <span style={{ fontFamily: MONO, fontSize: 9, color: BRD, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding: '8px 12px 10px', borderTop: `1px solid ${BRD2}` }}>
          {incident.description && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: TXT, marginBottom: 8 }}>
              {incident.description}
            </div>
          )}

          {units.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {units.map(u => (
                <span key={u} style={{
                  fontFamily: MONO, fontSize: 9, fontWeight: 700,
                  color: '#6090c0', background: '#0a0f18',
                  border: '1px solid #1a2a3a', padding: '2px 6px',
                }}>
                  {u}
                </span>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {incident.map_ref    && <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>Melway {incident.map_ref}</span>}
            {incident.agency     && <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>{incident.agency}</span>}
            {incident.incident_id && <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>{incident.incident_id}</span>}
            {incident.messages?.length > 1 && <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>{incident.messages.length} pages</span>}
          </div>
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
  const [active,       setActive]       = useState(new Set())
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

        {active.size > 0 && (
          <button
            onClick={() => setActive(new Set())}
            style={{
              marginLeft: lastDbTs ? 8 : 'auto',
              fontFamily: MONO, fontSize: 9, color: MUT,
              background: 'none', border: `1px solid ${BRD}`, cursor: 'pointer',
              padding: '2px 8px', letterSpacing: '0.05em',
            }}
          >
            CLEAR
          </button>
        )}
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
              ? `FILTERS ACTIVE — ${hiddenCount} INCIDENT${hiddenCount !== 1 ? 'S' : ''} HIDDEN · CLEAR TO SHOW ALL`
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
