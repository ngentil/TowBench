import { useState } from 'react'
import { useVicPagers } from '../../lib/useVicPagers'
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
  {
    id: 'trapped',
    label: 'TRAPPED',
    colour: '#d04040',
    match: i => i.event_type?.startsWith('RESCC'),
  },
  {
    id: 'veh_fire',
    label: 'VEH FIRE',
    colour: '#c87020',
    match: i => i.event_type === 'NOSTC1' || i.event_type === 'NS' || i.event_type === 'SF',
  },
  {
    id: 'veh_inc',
    label: 'VEH INC',
    colour: ACC,
    match: i => ['NOSTC3', 'INCIC1', 'INCIC3'].includes(i.event_type),
  },
  {
    id: 'alarm',
    label: 'ALARM',
    colour: '#6090c0',
    match: i => i.event_type?.startsWith('ALARC'),
  },
  { id: 'sep', label: null, colour: null, match: null }, // visual separator
  {
    id: 'cfa',
    label: 'CFA',
    colour: '#e05020',
    match: i => i.agency === 'CFA',
  },
  {
    id: 'frv',
    label: 'FRV',
    colour: '#c03030',
    match: i => i.agency === 'FRV',
  },
  {
    id: 'ses',
    label: 'SES',
    colour: '#b09020',
    match: i => i.agency === 'SES',
  },
]

const REAL_FILTERS = FILTERS.filter(f => f.id !== 'sep')

function eventColour(type, cancelled) {
  if (cancelled) return MUT
  if (!type) return MUT
  if (type.startsWith('RESCC')) return '#d04040'
  if (type === 'NOSTC1' || type === 'NS' || type === 'SF') return '#c87020'
  if (type.startsWith('NOSTC') || type.startsWith('INCIC')) return ACC
  if (type.startsWith('ALARC')) return '#6090c0'
  return MUT
}

function fmt(epochMs) {
  return new Date(epochMs).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

function ageMins(epochMs) {
  return Math.floor((Date.now() - epochMs) / 60000)
}

function IncidentCard({ incident }) {
  const [open, setOpen] = useState(false)
  const colour = eventColour(incident.event_type, incident.is_cancelled)
  const label  = EVENT_LABELS[incident.event_type] || incident.event_type || 'INCIDENT'
  const units  = incident.responding_units || []
  const age    = ageMins(incident.first_seen)

  return (
    <div
      onClick={() => setOpen(o => !o)}
      style={{
        border:       `1px solid ${incident.is_cancelled ? BRD : colour}`,
        borderLeft:   `3px solid ${colour}`,
        background:   SURF,
        marginBottom:  5,
        cursor:       'pointer',
        userSelect:   'none',
        opacity:      incident.is_cancelled ? 0.5 : 1,
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
          {age > 0 && (
            <span style={{ color: age > 30 ? BRD2 : MUT }}> +{age}m</span>
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
            {incident.map_ref && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>Melway {incident.map_ref}</span>
            )}
            {incident.agency && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>{incident.agency}</span>
            )}
            {incident.incident_id && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>{incident.incident_id}</span>
            )}
            {incident.messages?.length > 1 && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>{incident.messages.length} pages</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function IncidentFeedTab() {
  const [active, setActive] = useState(new Set())
  const { incidents, connected, error } = useVicPagers({ towOnly: false })

  function toggle(id) {
    setActive(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filtered = active.size === 0
    ? incidents
    : incidents.filter(i => REAL_FILTERS.filter(f => active.has(f.id)).some(f => f.match(i)))

  const activeCount    = filtered.filter(i => !i.is_cancelled).length
  const cancelledCount = filtered.filter(i =>  i.is_cancelled).length

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
          <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>
            {activeCount} active
            {cancelledCount > 0 && <span style={{ color: BRD }}> · {cancelledCount} cancelled</span>}
          </span>
        )}
        {active.size > 0 && (
          <button
            onClick={() => setActive(new Set())}
            style={{
              marginLeft: 'auto', fontFamily: MONO, fontSize: 9, color: MUT,
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
      {filtered.length === 0 && connected && (
        <div style={{
          textAlign: 'center', padding: '48px 0',
          fontFamily: MONO, fontSize: 11, color: MUT,
          border: `1px dashed ${BRD}`,
        }}>
          {active.size > 0 ? 'NO INCIDENTS MATCHING FILTER' : 'MONITORING — NO INCIDENTS'}
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
