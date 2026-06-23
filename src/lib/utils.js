// Formats elapsed time since an ISO timestamp: "47m", "2h 15m", "3d"
export function timeIn(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return null;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

// Formats a timestamp as "Xm ago" / "Xh Ym ago". Accepts ISO string or epoch ms.
export function timeAgo(value) {
  if (!value) return null;
  const diff = typeof value === 'number'
    ? Date.now() - value
    : Date.now() - new Date(value).getTime();
  if (isNaN(diff) || diff < 0) return null;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

// Formats an ISO timestamp as "14 May, 10:32 am" (Australian locale, no year)
export function fmtShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-AU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// Formats acceptance elapsed time as a live stopwatch: "0:42", "5:23", "1:05:12"
export function fmtTimer(iso) {
  if (!iso) return null;
  const totalSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (totalSec < 0) return null;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

// Converts a CFA/MFB 6-figure Melway grid reference to approximate WGS84 coordinates.
// Only valid for Melbourne metro M-series Melway pages — returns null for other series.
// Accuracy: ~3 km RMSE within the Melbourne metropolitan area.
// Fitted affine transform from known (six_figure, lat/lng) calibration pairs.
export function sixFigureToLatLng(sixFig, mapRef) {
  if (mapRef && !/^M[\s\d]/.test(mapRef)) return null;
  const s = (sixFig || '').replace(/\s/g, '');
  if (!/^\d{5,6}$/.test(s)) return null;
  const p = s.padStart(6, '0');
  const x = parseInt(p.slice(0, 3), 10);
  const rawY = parseInt(p.slice(3), 10);
  const y = rawY > 500 ? rawY - 1000 : rawY;
  const lat = -37.939185 + (-0.0000071) * x + 0.0009726 * y;
  const lng = 144.763386 + 0.0009672  * x + 0.0000420  * y;
  if (lat < -39.5 || lat > -34.0 || lng < 141.0 || lng > 150.0) return null;
  return { lat, lng };
}

// Haversine great-circle distance in kilometres
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
