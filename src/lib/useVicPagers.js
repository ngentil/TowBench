import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { logVicPagersMessage } from './db/incidents'

const TOW_KEYWORDS = [
  'vehicle accident', 'person trapped', 'persons trapped', 'poss person trapped',
  'car fire', 'vehicle fire', 'truck fire', 'motor vehicle', 'mva',
  'road crash', 'collision', 'vehicle into structure', 'car vs',
  'sparks issuing from vehicle', 'car smoking', 'result of accident',
]

export function isTowRelevant(msg) {
  const desc = (msg.parsed?.description || msg.message || '').toLowerCase()
  return TOW_KEYWORDS.some(kw => desc.includes(kw))
}

export function mergeMessage(incidents, msg) {
  const key = msg.incident_id || `no-incident-${msg.id}`
  const existing = incidents[key]

  if (!existing) {
    return {
      ...incidents,
      [key]: {
        incident_id:      msg.incident_id,
        first_seen:       msg.timestamp ?? Date.now(),
        last_seen:        msg.timestamp ?? Date.now(),
        agency:           msg.agency,
        address:          msg.parsed?.address || null,
        description:      msg.parsed?.description || null,
        event_type:       msg.parsed?.eventType || null,
        map_ref:          msg.parsed?.mapRef || null,
        alarm_level:      msg.parsed?.alarmLevel || null,
        is_cancelled:     msg.parsed?.isCancellation || false,
        responding_units: msg.alias ? [msg.alias] : [],
        messages:         [msg],
        tow_relevant:     isTowRelevant(msg),
      },
    }
  }

  return {
    ...incidents,
    [key]: {
      ...existing,
      last_seen:        Math.max(existing.last_seen, msg.timestamp ?? 0),
      is_cancelled:     existing.is_cancelled || (msg.parsed?.isCancellation || false),
      responding_units: msg.alias && !existing.responding_units.includes(msg.alias)
        ? [...existing.responding_units, msg.alias]
        : existing.responding_units,
      messages:         [...existing.messages, msg],
      tow_relevant:     existing.tow_relevant || isTowRelevant(msg),
    },
  }
}

// Probe each namespace — we don't know which one VicPagers emits on
const NAMESPACES = ['/', '/eas', '/feed', '/pager', '/messages']

export function useVicPagers({ towOnly = false, maxIncidents = 200 } = {}) {
  const [connected,   setConnected]   = useState(false)
  const [error,       setError]       = useState(null)
  const [incidents,   setIncidents]   = useState({})
  const [rawCount,    setRawCount]    = useState(0)
  const [lastEvent,   setLastEvent]   = useState(null)
  const [socketId,    setSocketId]    = useState(null)
  const [connectedAt, setConnectedAt] = useState(null)
  const [activeNs,    setActiveNs]    = useState(null)

  // Use refs so onAny callbacks always see fresh values
  const towOnlyRef = useRef(towOnly)
  useEffect(() => { towOnlyRef.current = towOnly }, [towOnly])

  useEffect(() => {
    const sockets = NAMESPACES.map(ns => {
      const url = ns === '/' ? 'wss://vicpagers.net.au' : `wss://vicpagers.net.au${ns}`
      const socket = io(url, { transports: ['websocket'], reconnection: true })

      socket.on('connect', () => {
        if (ns === '/') {
          setConnected(true)
          setError(null)
          setSocketId(socket.id)
          setConnectedAt(Date.now())
        }
      })
      socket.on('disconnect', () => {
        if (ns === '/') { setConnected(false); setSocketId(null) }
      })
      socket.on('connect_error', e => {
        if (ns === '/') { setError(e.message); setConnected(false) }
      })

      socket.onAny((eventName, ...args) => {
        // Any namespace delivering any event — mark connected and record it
        setConnected(true)
        setError(null)
        setActiveNs(ns)
        setRawCount(n => n + 1)
        setLastEvent(`${ns}:${eventName}`)

        if (eventName !== 'message:new') return
        const msg = args[0]
        if (!msg || msg.type === 'administrative') return
        if (towOnlyRef.current && !isTowRelevant(msg) && msg.type !== 'emergency') return
        if (msg.id != null) logVicPagersMessage(msg)
        setIncidents(prev => mergeMessage(prev, msg))
      })

      return socket
    })

    return () => sockets.forEach(s => s.disconnect())
  }, [])   // stable — towOnly read via ref

  const incidentList = Object.values(incidents)
    .filter(i => towOnly ? i.tow_relevant : true)
    .sort((a, b) => b.first_seen - a.first_seen)
    .slice(0, maxIncidents)

  return { incidents: incidentList, connected, error, rawCount, lastEvent, socketId, connectedAt, activeNs }
}
