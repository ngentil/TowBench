import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const MIN_MOVE_M   = 30;     // only upsert if moved more than this
const MIN_INTERVAL = 15_000; // or at least this often regardless

function metersBetween(lat1, lon1, lat2, lon2) {
  const R = 6_371_000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function useDriverLocation(email) {
  const lastRef    = useRef(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!email || !navigator.geolocation) return;
    let cancelled = false;

    (async () => {
      // Fetch plate + name once before starting the GPS watch
      const [truckRes, driverRes] = await Promise.all([
        supabase.from('tow_trucks').select('plate').eq('auth_email', email).maybeSingle(),
        supabase.from('drivers').select('name').eq('auth_email', email).maybeSingle(),
      ]);
      if (cancelled) return;

      const plate = truckRes.data?.plate || null;
      const name  = driverRes.data?.name  || null;

      const onPosition = async pos => {
        const { latitude: lat, longitude: lng, heading, accuracy } = pos.coords;
        const now  = Date.now();
        const last = lastRef.current;
        if (last) {
          const moved = metersBetween(last.lat, last.lng, lat, lng);
          if (moved < MIN_MOVE_M && now - last.ts < MIN_INTERVAL) return;
        }
        lastRef.current = { lat, lng, ts: now };
        await supabase
          .from('driver_locations')
          .upsert(
            { driver_email: email, lat, lng, heading, accuracy, plate, name, updated_at: new Date().toISOString() },
            { onConflict: 'driver_email' }
          );
      };

      watchIdRef.current = navigator.geolocation.watchPosition(
        onPosition,
        err => console.warn('GPS:', err.message),
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 }
      );
    })();

    return () => {
      cancelled = true;
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      lastRef.current    = null;
      supabase.from('driver_locations').delete().eq('driver_email', email).then(() => {});
    };
  }, [email]);
}
