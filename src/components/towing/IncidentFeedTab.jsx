import { useState, useEffect, useReducer, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useVicPagers, mergeMessage } from '../../lib/useVicPagers'
import { getRecentVicPagers, dbRowToMessage } from '../../lib/db/incidents'
import { BG, SURF, BRD, BRD2, TXT, MUT, ACC, GRN, RED } from '../../lib/styles'

const MONO = "'IBM Plex Mono', monospace"

const NEARBY_OPTS = [0, 5, 10, 15, 20, 30]

function kmBetween(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

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
  { id: 'veh_fire', label: 'FIRE',     colour: '#c87020', match: i => ['NOSTC1','NOSTC2','NS'].includes(i.event_type) },
  { id: 'veh_inc',  label: 'INCIDENT', colour: ACC,       match: i => ['NOSTC3','INCIC3','MVA'].includes(i.event_type) },
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

const DEFAULT_FILTERS = new Set()

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

// ── Raw pager message parser ──────────────────────────────────────────────────

const APPLIANCE_TYPES = {
  P: 'Pumper', PT: 'Pumper Tanker', TB: 'Tanker', TL: 'Aerial Ladder',
  TA: 'Tanker', SU: 'Support', CB: 'Command', FA: 'Field Appliance',
  FIP: 'Fire Panel', QRV: 'Quick Response',
}

function vehicleSearchUrl(name) {
  return `https://www.google.com/search?q=site:emergencyvehiclesapp.com+"${encodeURIComponent(name)}"`
}

function stationMapsUrl(unit) {
  return `https://www.google.com/maps/search/${encodeURIComponent(unit + ' Fire Station Victoria')}`
}

// Thumbnail card — fetches photo via vehicle-lookup Netlify function on mount
function ApplianceBadge({ code }) {
  const name = labelAppliance(code)
  const [data,   setData]   = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [imgErr, setImgErr] = useState(false)

  useEffect(() => {
    fetch(`/.netlify/functions/vehicle-lookup?name=${encodeURIComponent(name)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [name])

  const href    = data?.vehicleUrl || vehicleSearchUrl(name)
  const img     = (!imgErr && data?.imageUrl) ? data.imageUrl : null
  const showImg = loaded && img

  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
               textDecoration: 'none', border: `1px solid ${BRD}`, borderRadius: 2,
               overflow: 'hidden', background: '#0a0a0a', width: 88, flexShrink: 0 }}>

      {/* Photo area */}
      <div style={{ width: 88, height: 56, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
        {!loaded && <span style={{ fontSize: 8, color: BRD }}>…</span>}
        {showImg && (
          <img src={img} alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => setImgErr(true)} />
        )}
        {loaded && !showImg && <span style={{ fontSize: 22 }}>🚒</span>}
      </div>

      {/* Name label */}
      <div style={{ fontFamily: MONO, fontSize: 7, color: MUT, padding: '3px 4px',
                    width: '100%', boxSizing: 'border-box', textAlign: 'center',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    borderTop: `1px solid ${BRD}` }}>
        {name}
      </div>
    </a>
  )
}

function labelAppliance(code) {
  const m = code.match(/^(PT|TB|TL|TA|SU|CB|FA|QRV|P)(\d+)([A-Z]?)$/)
  if (!m) return code
  const [, t, n, s] = m
  const name = APPLIANCE_TYPES[t] || t
  return `${name} ${n}${s}`
}

function parsePageMsg(raw) {
  if (!raw) return {}

  // Station code at end:  [FS35_]  [C44]  [BMSH5]
  const stationRaw  = raw.match(/\[([A-Z0-9_]+)\]/)?.[1] ?? null
  const stationNum  = stationRaw?.match(/(\d+)/)?.[1] ?? null
  const stationLabel = stationNum ? `Stn ${stationNum}` : stationRaw ?? null

  if (!raw.startsWith('@@ALERT')) return { stationLabel }

  // Capcode: first token after @@ALERT
  const capcode = raw.match(/^@@ALERT\s+(\S+)/)?.[1] ?? null

  // Everything between the six-figure ref (...) and the [station] bracket
  const resourceStr = raw.match(/\(\d+\)\s*(.*?)(?:\s*\[|$)/)?.[1] ?? ''
  const tokens = resourceStr.split(/\s+/).filter(Boolean)

  const fgds = []
  const appliances = []
  for (const t of tokens) {
    if (/^FGD\d+$/.test(t) && !fgds.includes(t)) fgds.push(t)
    else if (/^(PT|TB|TL|TA|SU|CB|FA|QRV|P)\d+[A-Z]?$/.test(t))  appliances.push(t)
  }

  return { capcode, fgds, appliances, stationLabel }
}

// Aggregate parsed data across all messages in an incident
function buildDispatch(msgs) {
  const fgds       = []
  const appliances = []
  const stations   = []
  const capcodes   = []

  for (const m of msgs) {
    const p = parsePageMsg(m.message)
    if (p.capcode   && !capcodes.includes(p.capcode))     capcodes.push(p.capcode)
    if (p.stationLabel && !stations.includes(p.stationLabel)) stations.push(p.stationLabel)
    for (const f of (p.fgds || []))       if (!fgds.includes(f))       fgds.push(f)
    for (const a of (p.appliances || [])) if (!appliances.includes(a)) appliances.push(a)
  }

  return {
    fgds,
    appliances,
    stations,
    capcodes,
    radioLabel:    fgds.length       ? fgds.map(f => f.replace('FGD', 'Ch.')).join(', ')             : null,
    applianceLabel: appliances.length ? appliances.map(labelAppliance).join(' · ')                    : null,
    stationLabel:  stations.length   ? stations.join(' · ')                                           : null,
  }
}

function IncidentCard({ incident }) {
  const [open, setOpen] = useState(false)
  const colour  = eventColour(incident.event_type, incident.is_cancelled)
  const label   = EVENT_LABELS[incident.event_type] || incident.event_type || 'INCIDENT'
  const units   = incident.responding_units || []
  const msgs    = incident.messages || []
  const ageMins = incident.first_seen ? Math.floor((Date.now() - incident.first_seen) / 60000) : null
  const dispatch = buildDispatch(msgs)

  const addr    = incident.address
  const query   = addr ? encodeURIComponent(addr + ' Victoria Australia') : null
  const mapsUrl = query ? `https://www.google.com/maps/search/?api=1&query=${query}` : null
  const svUrl   = query ? `https://maps.google.com/maps?q=${query}&layer=c` : null

  const border     = `1px solid ${incident.is_cancelled ? BRD : colour + '55'}`
  const borderLeft = `3px solid ${colour}`

  return (
    <div style={{ background: '#0d0d0d', border, borderLeft, borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>

      {/* ── Collapsed header ── */}
      <div onClick={() => setOpen(o => !o)}
        style={{ padding: '10px 12px', cursor: 'pointer', userSelect: 'none', opacity: incident.is_cancelled ? 0.45 : 1 }}>

        {/* Row 1: type · alarm · age · toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: colour, fontFamily: MONO, letterSpacing: '0.06em', textTransform: 'uppercase', flex: 1 }}>
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
          <span style={{ fontSize: 8, color: MUT }}>{open ? '▲' : '▼'}</span>
        </div>

        {/* Row 2: address · cross street */}
        <div style={{ marginTop: 3, fontSize: 11, fontWeight: 700, color: TXT }}>
          {addr || '—'}
          {incident.corner && <span style={{ fontWeight: 400, color: MUT, fontSize: 9 }}> @ {incident.corner}</span>}
        </div>

        {/* Row 3: dispatch summary — always visible */}
        <div style={{ marginTop: 4, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {incident.agency && (
            <span style={{ fontSize: 7, fontWeight: 700, color: MUT, border: `1px solid ${BRD}`, borderRadius: 2, padding: '1px 5px', fontFamily: MONO }}>
              {incident.agency}
            </span>
          )}
          {units.slice(0, 3).map(u => (
            <a key={u} href={stationMapsUrl(u)} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ fontSize: 7, color: '#6090c0', fontFamily: MONO, border: '1px solid #1a2a3a', borderRadius: 2, padding: '1px 5px', textDecoration: 'none' }}>
              {u}
            </a>
          ))}
          {units.length > 3 && (
            <span style={{ fontSize: 7, color: MUT, fontFamily: MONO }}>+{units.length - 3} more</span>
          )}
          {dispatch.radioLabel && (
            <span style={{ fontSize: 7, color: '#5a8a5a', border: '1px solid #1a3a1a', borderRadius: 2, padding: '1px 5px', fontFamily: MONO }}>
              📻 {dispatch.radioLabel}
            </span>
          )}
          {dispatch.appliances.map(a => {
            const name = labelAppliance(a)
            return (
              <a key={a} href={vehicleSearchUrl(name)} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 7, color: MUT, fontFamily: MONO, border: `1px solid ${BRD}`, borderRadius: 2, padding: '1px 5px', textDecoration: 'none' }}>
                🚒 {name}
              </a>
            )
          })}
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {open && (
        <div style={{ borderTop: '1px solid #1a1a1a', padding: '0 12px 12px', opacity: incident.is_cancelled ? 0.6 : 1 }}>

          {/* Description */}
          {incident.description && (
            <div style={{ marginTop: 10, fontSize: 10, color: TXT, lineHeight: 1.6, background: '#0a0a0a', padding: '8px 10px', borderRadius: 2, border: '1px solid #1a1a1a', fontFamily: MONO }}>
              {incident.description}
            </div>
          )}

          {/* Info grid */}
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              ['What',        EVENT_LABELS[incident.event_type] || incident.event_type || '—'],
              ['Alarm',       incident.alarm_level || '—'],
              ['Agency',      incident.agency || '—'],
              ['Incident #',  incident.incident_id || '—'],
              ['Address',     addr || '—'],
              ['Cross St',    incident.corner || '—'],
              ['Melway',      incident.map_ref || '—'],
              ['Grid Ref',    incident.six_figure ? `(${incident.six_figure})` : '—'],
              ['Radio Ch.',   dispatch.radioLabel || '—'],
              ['Appliances',  dispatch.appliances.length ? dispatch.appliances.map(labelAppliance).join(' · ') : '—'],
              ['Station',     dispatch.stationLabel || '—'],
              ['Dispatched',  fmt(incident.first_seen)],
              ['Age',         ageMins != null ? (ageMins < 60 ? `${ageMins}m` : `${Math.floor(ageMins/60)}h ${ageMins%60}m`) : '—'],
              ['Pages',       String(msgs.length)],
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ background: SURF, border: `1px solid ${BRD}`, borderRadius: 2, padding: '6px 8px' }}>
                <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>{lbl}</div>
                <div style={{ fontSize: 10, color: TXT, fontFamily: MONO, wordBreak: 'break-word' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Appliance thumbnails */}
          {dispatch.appliances.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Appliances</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {dispatch.appliances.map(a => <ApplianceBadge key={a} code={a} />)}
              </div>
            </div>
          )}

          {/* Responding units — full list */}
          {units.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Responding Units</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {units.map(u => (
                  <a key={u} href={stationMapsUrl(u)} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: '#6090c0', background: '#0a0f18', border: '1px solid #1a2a3a', padding: '2px 8px', textDecoration: 'none' }}>
                    {u}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Maps + Street View */}
          <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#5a7a9a', border: '1px solid #1e2e3e', borderRadius: 2, padding: '5px 10px', textDecoration: 'none', background: '#0a1520' }}>
                📍 Maps
              </a>
            )}
            {svUrl && (
              <a href={svUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, color: '#5a6a7a', border: '1px solid #1e2a3a', borderRadius: 2, padding: '5px 10px', textDecoration: 'none', background: '#0a1018' }}>
                🔭 Street View
              </a>
            )}
          </div>

          {/* Pages list — decoded */}
          {msgs.length > 0 && (
            <div style={{ marginTop: 10, border: `1px solid ${BRD}`, borderRadius: 2 }}>
              <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, padding: '5px 8px', borderBottom: `1px solid ${BRD}`, display: 'flex', justifyContent: 'space-between' }}>
                <span>Dispatch Pages</span>
                <span>{msgs.length} total</span>
              </div>
              {msgs.map((m, i) => {
                const p = parsePageMsg(m.message)
                return (
                  <div key={m.id ?? i} style={{
                    padding: '7px 8px',
                    borderBottom: i < msgs.length - 1 ? `1px solid ${BRD2}` : 'none',
                  }}>
                    {/* Page header: time · unit · radio · appliances */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ fontFamily: MONO, fontSize: 8, color: MUT, flexShrink: 0 }}>{fmtTime(m.timestamp)}</span>
                      {m.alias && (
                        <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, color: '#6090c0' }}>{m.alias}</span>
                      )}
                      {p.fgds?.map(f => (
                        <span key={f} style={{ fontFamily: MONO, fontSize: 7, color: '#5a8a5a', border: '1px solid #1a3a1a', borderRadius: 2, padding: '0 4px' }}>
                          📻 {f.replace('FGD', 'Ch.')}
                        </span>
                      ))}
                      {p.appliances?.map(a => {
                        const name = labelAppliance(a)
                        return (
                          <a key={a} href={vehicleSearchUrl(name)} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ fontFamily: MONO, fontSize: 7, color: MUT, border: `1px solid ${BRD}`, borderRadius: 2, padding: '0 4px', textDecoration: 'none' }}>
                            🚒 {name}
                          </a>
                        )
                      })}
                      {p.stationLabel && (
                        <span style={{ fontFamily: MONO, fontSize: 7, color: MUT }}>📍 {p.stationLabel}</span>
                      )}
                    </div>
                    {/* Raw message */}
                    <div style={{ fontFamily: MONO, fontSize: 8, color: BRD, lineHeight: 1.5, wordBreak: 'break-word' }}>
                      {m.message || '—'}
                    </div>
                  </div>
                )
              })}
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

export default function IncidentFeedTab({ userPos }) {
  const [active,       setActive]       = useState(DEFAULT_FILTERS)
  const [nearbyKm, setNearbyKm] = useState(() => Number(localStorage.getItem('towbench_nearby_km') ?? 0))
  const setRadius = km => { setNearbyKm(km); localStorage.setItem('towbench_nearby_km', km) }

  // Geocode cache: address → { lat, lng } | null (null = failed / in-progress)
  const geocodeCache  = useRef(new Map())
  const geocodingRef  = useRef(false)
  const [geoRev, setGeoRev] = useState(0)
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

  // Geocode incident addresses when radius filter is active
  useEffect(() => {
    if (!nearbyKm || !userPos || geocodingRef.current) return
    const pending = allIncidents.filter(i => i.address && !geocodeCache.current.has(i.address))
    if (!pending.length) return

    geocodingRef.current = true
    let cancelled = false;

    (async () => {
      for (const inc of pending) {
        if (cancelled) break
        const addr = inc.address
        if (geocodeCache.current.has(addr)) continue
        geocodeCache.current.set(addr, null)
        try {
          await new Promise(r => setTimeout(r, 250))
          const q   = encodeURIComponent(addr + ', Victoria, Australia')
          const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
            headers: { 'User-Agent': 'TowBench/1.0' },
            signal: AbortSignal.timeout(5000),
          })
          const data = await res.json()
          if (data[0]) geocodeCache.current.set(addr, { lat: +data[0].lat, lng: +data[0].lon })
        } catch { /* leave as null */ }
        setGeoRev(v => v + 1)
      }
      geocodingRef.current = false
    })()

    return () => { cancelled = true; geocodingRef.current = false }
  }, [allIncidents, nearbyKm, userPos])

  // Apply nearby filter using geocoded coords
  const withDistance = nearbyKm > 0 && userPos
    ? allIncidents.map(i => {
        const coords = i.address ? geocodeCache.current.get(i.address) : undefined
        const distKm = coords ? kmBetween(userPos.lat, userPos.lng, coords.lat, coords.lng) : null
        return { ...i, _distKm: distKm }
      })
    : allIncidents.map(i => ({ ...i, _distKm: null }))

  const nearbyFiltered = nearbyKm > 0 && userPos
    ? withDistance.filter(i => i._distKm === null || i._distKm <= nearbyKm)
    : withDistance

  const filtered = active.size === 0
    ? nearbyFiltered
    : nearbyFiltered.filter(i => REAL_FILTERS.filter(f => active.has(f.id)).some(f => f.match(i)))

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

        <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          {lastDbTs && historyState === 'ok' && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: BRD, whiteSpace: 'nowrap' }}>
              db: {fmtAge(lastDbTs)}
            </span>
          )}
          {active.size > 0 && (
            <button
              onClick={() => setActive(new Set())}
              style={{
                fontFamily: MONO, fontSize: 9, color: MUT,
                background: 'none', border: `1px solid ${BRD}`, cursor: 'pointer',
                padding: '2px 8px', letterSpacing: '0.05em', whiteSpace: 'nowrap',
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
              padding: '2px 8px', letterSpacing: '0.05em', whiteSpace: 'nowrap',
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

      {/* Nearby radius picker — identical to allocations tab */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 8, color: MUT, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>📍 Nearby pulse</span>
        {NEARBY_OPTS.map(km => (
          <button key={km} onClick={() => setRadius(km)}
            style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 7px', borderRadius: 2, cursor: 'pointer', fontFamily: MONO,
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
          onChange={e => { const v = Number(e.target.value); if (v > 0) setRadius(v) }}
          style={{ width: 44, background: '#0a0a0a',
            border: `1px solid ${nearbyKm > 0 && !NEARBY_OPTS.includes(nearbyKm) ? '#cc2222' : '#2a2a2a'}`,
            color: TXT, fontFamily: MONO, fontSize: 8, padding: '3px 5px',
            borderRadius: 2, outline: 'none', textAlign: 'center' }}
        />
        {nearbyKm > 0 && !userPos && (
          <span style={{ fontSize: 8, color: MUT, fontFamily: MONO }}>no GPS</span>
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
