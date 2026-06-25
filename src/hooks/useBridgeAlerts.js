import { useState, useEffect, useRef } from 'react';
import { haversineKm } from '../lib/utils';
import { BRIDGE_URL } from '../lib/constants';

const ALERT_HEIGHT_M = 4.6;
const WATCH_DIST_KM  = 2.0;
const COOLDOWN_MS    = 5 * 60 * 1000;
const GEO_POLL_MS    = 30_000; // Nominatim: safe at 1 req/30s
const GEO_MOVE_KM    = 0.10;   // only re-geocode after moving 100m

// Distance thresholds — closest match wins
const LEVELS = [
  { maxDist: 0.20, severity: 4, label: 'DANGER',  color: '#ff3333', bg: '#4a0000', border: '#ff3333', pulse: true  },
  { maxDist: 0.50, severity: 3, label: 'WARNING',  color: '#ff7733', bg: '#3a1500', border: '#ff7733', pulse: false },
  { maxDist: 1.00, severity: 2, label: 'CAUTION',  color: '#ccaa00', bg: '#252000', border: '#ccaa00', pulse: false },
  { maxDist: 2.00, severity: 1, label: 'AHEAD',    color: '#888855', bg: '#111108', border: '#555540', pulse: false },
]

function getLevel(distKm) {
  for (const lv of LEVELS) if (distKm <= lv.maxDist) return lv
  return null
}

// Expand common road abbreviations so bridge labels can fuzzy-match Nominatim output
const ABBREV = {
  HWY: 'HIGHWAY', ST: 'STREET', RD: 'ROAD', AVE: 'AVENUE', DR: 'DRIVE',
  BLVD: 'BOULEVARD', TCE: 'TERRACE', PL: 'PLACE', CT: 'COURT', CRE: 'CRESCENT',
  FWY: 'FREEWAY', PKWY: 'PARKWAY', LA: 'LANE', PROM: 'PROMENADE',
}

function normBridgeLabel(label) {
  return label.toUpperCase().replace(/\b([A-Z]+)\b/g, w => ABBREV[w] || w)
}

function roadMatches(bridgeLabel, currentRoad) {
  if (!currentRoad) return true  // no road data yet — don't suppress
  const bridge = normBridgeLabel(bridgeLabel)
  const road   = currentRoad.toUpperCase()
  const words  = bridge.split(/\s+/).filter(w => w.length >= 4)
  return words.some(w => road.includes(w))
}

export function useBridgeAlerts(userPos) {
  const [alert, setAlert] = useState(null)
  const bridgesRef        = useRef([])
  const prevDists         = useRef(new Map())
  const cooldowns         = useRef(new Map())
  const currentRoadRef    = useRef(null)
  const lastGeoTs         = useRef(0)
  const lastGeoPos        = useRef(null)

  // Load bridge data once — only sub-ALERT_HEIGHT bridges, SERVICE rows excluded
  useEffect(() => {
    if (!BRIDGE_URL) return
    fetch(BRIDGE_URL)
      .then(r => r.json())
      .then(data => {
        bridgesRef.current = (data.r || [])
          .filter(rec => {
            const label = String(rec[3] || '').trim().toUpperCase()
            return label !== 'SERVICE' && parseFloat(rec[2]) < ALERT_HEIGHT_M
          })
          .map(rec => ({
            lat:    parseFloat(rec[0]),
            lng:    parseFloat(rec[1]),
            height: parseFloat(rec[2]),
            label:  String(rec[3] || 'Bridge').trim(),
            key:    `${rec[0]},${rec[1]}`,
          }))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Nominatim reverse geocode — throttled; only re-fires after 100m movement
  useEffect(() => {
    if (!userPos) return
    const now = Date.now()
    if (now - lastGeoTs.current < GEO_POLL_MS) return
    if (lastGeoPos.current) {
      const moved = haversineKm(userPos.lat, userPos.lng, lastGeoPos.current.lat, lastGeoPos.current.lng)
      if (moved < GEO_MOVE_KM) return
    }
    lastGeoTs.current = now
    lastGeoPos.current = { lat: userPos.lat, lng: userPos.lng }
    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${userPos.lat}&lon=${userPos.lng}&format=json`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'TowBench/1.0' } }
    )
      .then(r => r.json())
      .then(data => { currentRoadRef.current = data?.address?.road || null })
      .catch(() => {})
  }, [userPos])

  // On every GPS fix: find closest approaching low bridge on current road
  useEffect(() => {
    if (!userPos || !bridgesRef.current.length) return

    let bestAlert = null

    for (const bridge of bridgesRef.current) {
      const currDist = haversineKm(userPos.lat, userPos.lng, bridge.lat, bridge.lng)

      if (currDist > WATCH_DIST_KM) {
        prevDists.current.delete(bridge.key)
        continue
      }

      const prevDist = prevDists.current.get(bridge.key)
      prevDists.current.set(bridge.key, currDist)

      if (prevDist === undefined) continue  // need 2 fixes to know direction
      if (currDist >= prevDist) continue    // moving away

      // Road matching only matters beyond 200m — at 200m you're on it
      if (currDist > 0.20 && !roadMatches(bridge.label, currentRoadRef.current)) continue

      const level = getLevel(currDist)
      if (!level) continue

      if (!bestAlert || currDist < bestAlert.dist) {
        bestAlert = { ...bridge, dist: currDist, level }
      }
    }

    if (bestAlert) {
      setAlert({ label: bestAlert.label, height: bestAlert.height, dist: bestAlert.dist, level: bestAlert.level })

      const now  = Date.now()
      const last = cooldowns.current.get(bestAlert.key) ?? 0
      if (now - last >= COOLDOWN_MS && Notification.permission === 'granted') {
        cooldowns.current.set(bestAlert.key, now)
        try {
          new Notification(`${bestAlert.level.label}: Low Bridge`, {
            body: `${bestAlert.label} — ${bestAlert.height.toFixed(1)} m clearance · ${(bestAlert.dist * 1000).toFixed(0)} m ahead`,
            icon: '/icon-192.png',
            tag:  `bridge-${bestAlert.key}`,
            requireInteraction: bestAlert.level.severity >= 3,
          })
        } catch (_) {}
      }
    } else {
      setAlert(null)
    }
  }, [userPos])

  return alert
}
