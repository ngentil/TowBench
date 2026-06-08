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

export function useVicPagers({ towOnly = false, maxIncidents = 200 } = {}) {
  const [connected,  setConnected]  = useState(false)
  const [error,      setError]      = useState(null)
  const [incidents,  setIncidents]  = useState({})
  const [rawCount,   setRawCount]   = useState(0)
  const [lastEvent,  setLastEvent]  = useState(null)  // debug: last event name seen
  const socketRef = useRef(null)

  useEffect(() => {
    const socket = io('wss://vicpagers.net.au', { transports: ['websocket'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      setError(null)
    })
    socket.on('disconnect',    () =>   setConnected(false))
    socket.on('connect_error', (e) => { setError(e.message); setConnected(false) })

    // Catch every event so we can see what the server actually sends
    socket.onAny((eventName, ...args) => {
      setRawCount(n => n + 1)
      setLastEvent(eventName)

      if (eventName !== 'message:new') return   // not the messages event — ignore for now
      const msg = args[0]
      if (!msg || msg.type === 'administrative') return
      if (towOnly && !isTowRelevant(msg) && msg.type !== 'emergency') return
      if (msg.id != null) logVicPagersMessage(msg)
      setIncidents(prev => mergeMessage(prev, msg))
    })

    return () => socket.disconnect()
  }, [towOnly])

  const incidentList = Object.values(incidents)
    .filter(i => towOnly ? i.tow_relevant : true)
    .sort((a, b) => b.first_seen - a.first_seen)
    .slice(0, maxIncidents)

  return { incidents: incidentList, connected, error, rawCount, lastEvent }
}
