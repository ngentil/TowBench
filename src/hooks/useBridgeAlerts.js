import { useState, useEffect, useRef } from 'react';
import { haversineKm } from '../lib/utils';
import { BRIDGE_URL } from '../lib/constants';

const ALERT_HEIGHT_KM = 4.6;   // warn for clearances under this
const ALERT_DIST_KM   = 0.5;   // within 500 m
const COOLDOWN_MS     = 5 * 60 * 1000; // 5 min per bridge before re-notifying

export function useBridgeAlerts(userPos) {
  const [alert, setAlert] = useState(null); // { label, height, dist } | null
  const bridgesRef = useRef([]);
  const cooldowns  = useRef(new Map()); // bridgeKey -> last-notified timestamp

  // Load bridge data once
  useEffect(() => {
    if (!BRIDGE_URL) return;
    fetch(BRIDGE_URL)
      .then(r => r.json())
      .then(data => {
        // Filter to real infrastructure only — exclude SERVICE entries
        bridgesRef.current = (data.r || []).filter(rec => {
          const label = String(rec[3] || '').trim().toUpperCase();
          return label !== 'SERVICE' && parseFloat(rec[2]) < ALERT_HEIGHT_KM;
        });
      })
      .catch(() => {});
  }, []);

  // Request notification permission on first call (no-op if already decided)
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Check proximity on every GPS update
  useEffect(() => {
    if (!userPos || !bridgesRef.current.length) return;

    let closest = null;
    for (const rec of bridgesRef.current) {
      const [lat, lng, rawH, label] = rec;
      const dist = haversineKm(userPos.lat, userPos.lng, lat, lng);
      if (dist > ALERT_DIST_KM) continue;
      if (!closest || dist < closest.dist) {
        closest = { lat, lng, height: parseFloat(rawH), label: label || 'Bridge', dist, key: `${lat},${lng}` };
      }
    }

    if (closest) {
      setAlert({ label: closest.label, height: closest.height, dist: closest.dist });

      const now  = Date.now();
      const last = cooldowns.current.get(closest.key) ?? 0;
      if (now - last >= COOLDOWN_MS && Notification.permission === 'granted') {
        cooldowns.current.set(closest.key, now);
        try {
          new Notification('⚠️ Low Bridge Ahead', {
            body: `${closest.label} — ${closest.height.toFixed(1)} m clearance · ${(closest.dist * 1000).toFixed(0)} m ahead`,
            icon: '/icon-192.png',
            tag:  `bridge-${closest.key}`,
            requireInteraction: false,
            silent: false,
          });
        } catch (_) { /* some browsers block in certain contexts */ }
      }
    } else {
      setAlert(null);
    }
  }, [userPos]);

  return alert;
}
