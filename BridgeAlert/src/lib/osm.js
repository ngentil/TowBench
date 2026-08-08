const OVERPASS = 'https://overpass-api.de/api/interpreter';

export async function fetchNearbyBridges(lat, lng, radiusM = 400) {
  const query = `[out:json][timeout:10];
(
  way["maxheight"](around:${radiusM},${lat},${lng});
  way["maxheight:physical"](around:${radiusM},${lat},${lng});
);
out tags center;`;

  try {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) return [];
    const json = await res.json();

    return (json.elements || [])
      .map(el => {
        const raw = el.tags?.maxheight ?? el.tags?.['maxheight:physical'];
        const maxheight = parseMaxheight(raw);
        if (maxheight === null) return null;

        const clat = el.center?.lat;
        const clng = el.center?.lon;
        return {
          id:        el.id,
          name:      el.tags?.name || el.tags?.ref || null,
          road:      el.tags?.['addr:street'] || el.tags?.highway || null,
          maxheight,
          distance:  clat && clng ? haversine(lat, lng, clat, clng) : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
  } catch {
    return [];
  }
}

function parseMaxheight(val) {
  if (val == null) return null;
  const s = String(val).trim();

  // plain number (assumed metres)
  const n = parseFloat(s);
  if (!isNaN(n) && s.match(/^\d/)) return n;

  // "4.5 m" or "4.5m"
  const m = s.match(/^([\d.]+)\s*m$/i);
  if (m) return parseFloat(m[1]);

  // feet/inches: 13'6" or 13'6  or 13ft 6in
  const ft = s.match(/^(\d+)[''`](\d+)/);
  if (ft) return (parseInt(ft[1]) * 12 + parseInt(ft[2])) * 0.0254;

  // feet only: 13'
  const fonly = s.match(/^(\d+)[''`]$/);
  if (fonly) return parseInt(fonly[1]) * 0.3048;

  return null;
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const dφ = (lat2 - lat1) * Math.PI / 180;
  const dλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
