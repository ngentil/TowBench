import { useState, useEffect, useRef } from 'react';
import { haversineKm } from '../lib/utils';
import { BRIDGE_URL } from '../lib/constants';

const ALERT_HEIGHT_M = 4.6;  // warn for clearances under this
const WATCH_DIST_KM  = 2.0;  // track approach vectors within 2 km
const ALERT_DIST_KM  = 1.0;  // fire alert when approaching within 1 km
const COOLDOWN_MS    = 5 * 60 * 1000; // 5 min per bridge before re-notifying

export function useBridgeAlerts(userPos) {
  const [alert, setAlert]  = useState(null); // { label, height, dist } | null
  const bridgesRef  = useRef([]);
  const prevDists   = useRef(new Map()); // bridgeKey -> previous distance (km)
  const cooldowns   = useRef(new Map()); // bridgeKey -> last-notified timestamp

  // Load bridge data once — real infrastructure only, pre-filtered to low clearances
  useEffect(() => {
    if (!BRIDGE_URL) return;
    fetch(BRIDGE_URL)
      .then(r => r.json())
      .then(data => {
        bridgesRef.current = (data.r || [])
          .filter(rec => {
            const label = String(rec[3] || '').trim().toUpperCase();
            return label !== 'SERVICE' && parseFloat(rec[2]) < ALERT_HEIGHT_M;
          })
          .map(rec => ({
            lat:    parseFloat(rec[0]),
            lng:    parseFloat(rec[1]),
            height: parseFloat(rec[2]),
            label:  String(rec[3] || 'Bridge').trim(),
            key:    `${rec[0]},${rec[1]}`,
          }));
      })
      .catch(() => {});
  }, []);

  // Request notification permission on first render
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // On each GPS fix, check whether the user is approaching a low bridge
  useEffect(() => {
    if (!userPos || !bridgesRef.current.length) return;

    let closestApproaching = null;

    for (const bridge of bridgesRef.current) {
      const currDist = haversineKm(userPos.lat, userPos.lng, bridge.lat, bridge.lng);

      if (currDist > WATCH_DIST_KM) {
        // Outside watch zone — clear stored distance so we get a fresh baseline on re-entry
        prevDists.current.delete(bridge.key);
        continue;
      }

      const prevDist = prevDists.current.get(bridge.key);
      prevDists.current.set(bridge.key, currDist);

      if (prevDist === undefined) continue;    // first fix in watch zone — need two points to determine direction
      if (currDist >= prevDist) continue;      // moving away or stationary — not en route
      if (currDist > ALERT_DIST_KM) continue; // approaching but still too far to alert

      if (!closestApproaching || currDist < closestApproaching.dist) {
        closestApproaching = { ...bridge, dist: currDist };
      }
    }

    if (closestApproaching) {
      setAlert({ label: closestApproaching.label, height: closestApproaching.height, dist: closestApproaching.dist });

      const now  = Date.now();
      const last = cooldowns.current.get(closestApproaching.key) ?? 0;
      if (now - last >= COOLDOWN_MS && Notification.permission === 'granted') {
        cooldowns.current.set(closestApproaching.key, now);
        try {
          new Notification('⚠️ Low Bridge Ahead', {
            body: `${closestApproaching.label} — ${closestApproaching.height.toFixed(1)} m clearance · ${(closestApproaching.dist * 1000).toFixed(0)} m ahead`,
            icon: '/icon-192.png',
            tag:  `bridge-${closestApproaching.key}`,
            requireInteraction: false,
          });
        } catch (_) { /* blocked in some browser contexts */ }
      }
    } else {
      setAlert(null);
    }
  }, [userPos]);

  return alert;
}
