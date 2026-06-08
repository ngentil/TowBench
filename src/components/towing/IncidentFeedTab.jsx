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

// Colour per event type
function eventColour(type, cancelled) {
  if (cancelled) return MUT
  if (!type) return ACC
  if (type.startsWith('RESCC')) return '#d04040' // rescue/trapped — urgent red
  if (type.startsWith('NOSTC')) return '#c87020' // vehicle fire — orange
  return ACC
}

function fmt(epochMs) {
  return new Date(epochMs).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

function IncidentCard({ incident }) {
  const [open, setOpen] = useState(false)
  const colour  = eventColour(incident.event_type, incident.is_cancelled)
  const label   = EVENT_LABELS[incident.event_type] || incident.event_type || 'INCIDENT'
  const units   = incident.responding_units || []
  const ageMins = Math.floor((Date.now() - incident.first_seen) / 60000)

  return (
    <div
      style={{
        border:       `1px solid ${incident.is_cancelled ? BRD : colour}`,
        borderLeft:   `3px solid ${colour}`,
        background:   SURF,
        marginBottom:  6,
        cursor:       'pointer',
        userSelect:   'none',
      }}
      onClick={() => setOpen(o => !o)}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
        <span style={{
          fontFamily:    MONO,
          fontSize:      10,
          fontWeight:    700,
          letterSpacing: '0.08em',
          color:         colour,
          textTransform: 'uppercase',
          minWidth:      200,
          opacity:       incident.is_cancelled ? 0.5 : 1,
        }}>
          {incident.is_cancelled ? '✓ ' : ''}{label}
        </span>

        {incident.alarm_level && (
          <span style={{
            fontFamily: MONO, fontSize: 9, fontWeight: 700,
            color: '#c87020', background: '#1a1000',
            border: '1px solid #3a2a00', padding: '1px 6px',
          }}>
            {incident.alarm_level}
          </span>
        )}

        <span style={{ flex: 1, fontFamily: MONO, fontSize: 11, color: TXT, opacity: incident.is_cancelled ? 0.5 : 1 }}>
          {incident.address || '—'}
        </span>

        <span style={{ fontFamily: MONO, fontSize: 9, color: MUT, whiteSpace: 'nowrap' }}>
          {fmt(incident.first_seen)}
          {ageMins > 0 && <span style={{ color: ageMins > 30 ? BRD : MUT }}> · {ageMins}m ago</span>}
        </span>

        <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{ padding: '8px 12px 10px', borderTop: `1px solid ${BRD2}` }}>
          {incident.description && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: TXT, marginBottom: 8 }}>
              {incident.description}
            </div>
          )}

          {/* Responding units */}
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

          <div style={{ display: 'flex', gap: 20 }}>
            {incident.map_ref && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>
                Melway {incident.map_ref}
              </span>
            )}
            {incident.agency && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>
                {incident.agency}
              </span>
            )}
            {incident.incident_id && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>
                {incident.incident_id}
              </span>
            )}
            {incident.messages?.length > 1 && (
              <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>
                {incident.messages.length} pages
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function IncidentFeedTab() {
  const [towOnly, setTowOnly] = useState(true)
  const { incidents, connected, error } = useVicPagers({ towOnly })

  const activeCount     = incidents.filter(i => !i.is_cancelled).length
  const cancelledCount  = incidents.filter(i =>  i.is_cancelled).length

  return (
    <div style={{ background: BG, minHeight: '100%', padding: 16, boxSizing: 'border-box' }}>

      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
        padding: '7px 12px', background: SURF, border: `1px solid ${BRD}`,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: connected ? GRN : error ? RED : MUT,
          boxShadow: connected ? `0 0 6px ${GRN}` : 'none',
        }} />

        <span style={{ fontFamily: MONO, fontSize: 10, color: connected ? GRN : MUT, letterSpacing: '0.05em' }}>
          {connected
            ? `LIVE · VICPAGERS`
            : error
              ? `OFFLINE — ${error.toUpperCase()}`
              : 'CONNECTING…'}
        </span>

        {connected && (
          <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>
            {activeCount} active
            {cancelledCount > 0 && <span style={{ color: BRD }}> · {cancelledCount} cancelled</span>}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: MUT }}>TOW ONLY</span>
          <div
            onClick={() => setTowOnly(t => !t)}
            style={{
              width: 28, height: 14, borderRadius: 7, cursor: 'pointer',
              background: towOnly ? ACC : BRD,
              position: 'relative', transition: 'background 0.15s',
            }}
          >
            <span style={{
              position: 'absolute', top: 2, borderRadius: '50%',
              width: 10, height: 10, background: '#fff',
              left: towOnly ? 16 : 2, transition: 'left 0.15s',
            }} />
          </div>
        </div>
      </div>

      {/* Incident list */}
      {incidents.length === 0 && connected && (
        <div style={{
          textAlign: 'center', padding: '48px 0',
          fontFamily: MONO, fontSize: 11, color: MUT,
          border: `1px dashed ${BRD}`,
        }}>
          {towOnly ? 'MONITORING — NO TOW-RELEVANT INCIDENTS' : 'MONITORING — NO INCIDENTS'}
        </div>
      )}

      {incidents.map(incident => (
        <IncidentCard
          key={incident.incident_id || incident.messages?.[0]?.id}
          incident={incident}
        />
      ))}
    </div>
  )
}
