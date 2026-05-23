import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import 'leaflet/dist/leaflet.css';
import { ACC, MUT, BRD, TXT, GRN, SURF } from '../../lib/styles';
import { supabase } from '../../lib/supabase';

const ORANGE = '#e8870a';
const PERIODS = [
  { label: '24h', ms: 864e5   },
  { label: '7d',  ms: 6048e5  },
  { label: '31d', ms: Infinity },
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return w;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function tally(arr, keyFn) {
  const map = {};
  arr.forEach(item => {
    const k = keyFn(item) || 'Unknown';
    map[k] = (map[k] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function fmtDuration(mins) {
  if (mins == null) return '—';
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtElapsed(iso) {
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

function fmtShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function KpiCard({ label, value, sub, color = TXT }) {
  return (
    <div style={{ background: SURF, border: '1px solid ' + BRD, borderTop: `2px solid ${color}`, borderRadius: 2, padding: '10px 12px', flex: 1, minWidth: 90 }}>
      <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 8, color: MUT, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BarList({ data, color = ORANGE, maxBars = 10, labelWidth = 110 }) {
  const max = Math.max(...data.map(([, v]) => v), 1);
  if (!data.length) return <div style={{ fontSize: 9, color: MUT, padding: '12px 0' }}>No data yet</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {data.slice(0, maxBars).map(([label, val]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: labelWidth, fontSize: 8, color: MUT, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }} title={label}>{label}</div>
          <div style={{ flex: 1, background: '#1a1a1a', borderRadius: 1, height: 13, overflow: 'hidden' }}>
            <div style={{ width: `${(val / max) * 100}%`, height: '100%', background: color, borderRadius: 1, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ width: 26, fontSize: 8, color: TXT, fontFamily: "'IBM Plex Mono',monospace", flexShrink: 0 }}>{val}</div>
        </div>
      ))}
    </div>
  );
}

function HourChart({ counts }) {
  const max = Math.max(...counts, 1);
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 70, padding: '0 2px' }}>
      {counts.map((v, h) => (
        <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            title={`${String(h).padStart(2, '0')}:00 — ${v} job${v !== 1 ? 's' : ''}`}
            style={{ width: '100%', background: v > 0 ? ORANGE : '#1c1c1c', borderRadius: '1px 1px 0 0', height: `${Math.max((v / max) * 58, v > 0 ? 3 : 0)}px`, transition: 'height 0.5s ease', cursor: 'default' }}
          />
          {h % 6 === 0 && <span style={{ fontSize: 6, color: '#444', fontFamily: "'IBM Plex Mono',monospace", marginTop: 2 }}>{String(h).padStart(2, '0')}</span>}
        </div>
      ))}
    </div>
  );
}

function DowChart({ counts }) {
  const max = Math.max(...counts, 1);
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 70 }}>
      {counts.map((v, d) => (
        <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div
            title={`${DAYS[d]} — ${v} job${v !== 1 ? 's' : ''}`}
            style={{ width: '100%', background: v > 0 ? ACC : '#1c1c1c', borderRadius: '1px 1px 0 0', height: `${Math.max((v / max) * 58, v > 0 ? 3 : 0)}px`, transition: 'height 0.5s ease', cursor: 'default' }}
          />
          <span style={{ fontSize: 7, color: MUT }}>{DAYS[d]}</span>
        </div>
      ))}
    </div>
  );
}

function HeatMap({ points, activeFeatures, showHotspots, showActive, traceMode, annotations, showNotes, onMapClick }) {
  const containerRef   = useRef(null);
  const mapRef         = useRef(null);
  const hotLayerRef    = useRef(null);
  const activeLayerRef = useRef(null);
  const traceLayerRef  = useRef(null);
  const noteLayerRef   = useRef(null);
  const leafletRef     = useRef(null);

  const showHotspotsRef  = useRef(showHotspots);
  const showActiveRef    = useRef(showActive);
  const traceModeRef     = useRef(traceMode);
  const onMapClickRef    = useRef(onMapClick);
  const traceStateRef    = useRef({ selected: [], highlights: [] });

  showHotspotsRef.current = showHotspots;
  showActiveRef.current   = showActive;
  traceModeRef.current    = traceMode;
  onMapClickRef.current   = onMapClick;

  useEffect(() => {
    if (!containerRef.current) return;
    traceStateRef.current = { selected: [], highlights: [] };

    import('leaflet').then(mod => {
      const L = mod.default || mod;
      leafletRef.current = L;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

      const map = L.map(containerRef.current, {
        center: [-37.814, 144.963], zoom: 11,
        zoomControl: true, attributionControl: false,
      });
      map.getPanes().tilePane.style.filter = 'invert(100%) hue-rotate(180deg) brightness(90%) contrast(90%) saturate(60%)';
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { subdomains: 'abc', maxZoom: 19 }).addTo(map);
      L.control.attribution({ prefix: false })
        .addAttribution('© <a href="https://openstreetmap.org" style="color:#666">OpenStreetMap</a>')
        .addTo(map);

      const hotLayer    = L.layerGroup().addTo(map);
      const activeLayer = L.layerGroup().addTo(map);
      const traceLayer  = L.layerGroup().addTo(map);
      const noteLayer   = L.layerGroup().addTo(map);

      map.on('click', e => {
        if (onMapClickRef.current) onMapClickRef.current(e.latlng.lat, e.latlng.lng);
      });

      points.forEach(([lat, lng]) => {
        L.circleMarker([lat, lng], { radius: 28, fillColor: ORANGE, fillOpacity: 0.07, stroke: false }).addTo(hotLayer);
        L.circleMarker([lat, lng], { radius: 10, fillColor: ORANGE, fillOpacity: 0.22, stroke: false }).addTo(hotLayer);
        L.circleMarker([lat, lng], { radius: 4,  fillColor: '#ffcc66', fillOpacity: 0.6,  stroke: false }).addTo(hotLayer);
      });

      const handleTraceClick = async (feature, lat, lng, innerM, outerM) => {
        const state = traceStateRef.current;

        if (state.selected.length >= 2) {
          traceLayerRef.current?.clearLayers();
          state.highlights.forEach(h => {
            h.inner.setStyle({ radius: 5, fillColor: GRN, fillOpacity: 0.9, color: GRN, weight: 1 });
            h.outer.setStyle({ fillColor: GRN, fillOpacity: 0.15 });
          });
          state.selected = [];
          state.highlights = [];
        }

        innerM.setStyle({ radius: 7, fillColor: '#cc2222', fillOpacity: 1, color: '#ff6644', weight: 2 });
        outerM.setStyle({ fillColor: '#cc2222', fillOpacity: 0.22 });
        state.selected.push({ feature, lat, lng });
        state.highlights.push({ inner: innerM, outer: outerM });

        if (state.selected.length < 2) return;

        const [a, b] = state.selected;
        try {
          const res = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`
          );
          if (!res.ok) throw new Error('OSRM error');
          const data = await res.json();
          const route = data.routes?.[0];
          if (!route) throw new Error('No route');

          const routeCoords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          const distKm = (route.distance / 1000).toFixed(1);
          const durMin = Math.round(route.duration / 60);

          L.polyline(routeCoords, {
            color: '#cc2222', weight: 4, opacity: 0.9,
            className: 'trace-route', lineCap: 'round', lineJoin: 'round',
          }).addTo(traceLayer);

          const mid = routeCoords[Math.floor(routeCoords.length / 2)] || [(a.lat + b.lat) / 2, (a.lng + b.lng) / 2];
          L.marker(mid, {
            icon: L.divIcon({
              className: '',
              html: `<div style="background:#cc2222;color:#fff;font-family:'IBM Plex Mono',monospace;font-size:8px;font-weight:700;padding:4px 9px;border-radius:2px;white-space:nowrap;letter-spacing:0.06em;box-shadow:0 2px 8px rgba(0,0,0,0.7);pointer-events:none">${distKm}&thinsp;km&ensp;·&ensp;~${durMin}&thinsp;min</div>`,
              iconSize: [0, 0], iconAnchor: [-4, 10],
            }),
          }).addTo(traceLayer);

        } catch {
          L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
            color: '#cc2222', weight: 3, className: 'trace-route',
          }).addTo(traceLayer);

          const dist = haversineKm(a.lat, a.lng, b.lat, b.lng).toFixed(1);
          const midLat = (a.lat + b.lat) / 2, midLng = (a.lng + b.lng) / 2;
          L.marker([midLat, midLng], {
            icon: L.divIcon({
              className: '',
              html: `<div style="background:#cc2222;color:#fff;font-family:'IBM Plex Mono',monospace;font-size:8px;font-weight:700;padding:4px 9px;border-radius:2px;white-space:nowrap;pointer-events:none">${dist}&thinsp;km straight</div>`,
              iconSize: [0, 0], iconAnchor: [-4, 10],
            }),
          }).addTo(traceLayer);
        }
      };

      activeFeatures.forEach(feature => {
        const coords = feature.geometry.coordinates;
        const lat = coords[1], lng = coords[0];
        const p = feature.properties || {};
        const logMeta = feature._logMeta;

        const outerM = L.circleMarker([lat, lng], {
          radius: 14, fillColor: GRN, fillOpacity: 0.15, stroke: false, bubblingMouseEvents: false,
        });
        const innerM = L.circleMarker([lat, lng], {
          radius: 5, fillColor: GRN, fillOpacity: 0.9, color: GRN, weight: 1, bubblingMouseEvents: false,
        });
        outerM.addTo(activeLayer);
        innerM.addTo(activeLayer);

        const road    = p.closedRoadName || '—';
        const sub     = p.reference?.startIntersectionLocality || '';
        const cross   = p.reference?.startIntersectionRoadName || '';
        const eventId = p.eventId || '—';
        const desc    = p.description || '';
        const lanes   = p.numberLanesImpacted;
        const subType = p.eventSubType || '';
        const impact  = p.impact?.impactType || '';
        const melway  = p.melway || '';
        const elapsed = fmtElapsed(logMeta?.firstSeen || p.lastUpdated);
        const firstSeen = logMeta?.firstSeen ? fmtShort(logMeta.firstSeen) : null;
        const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

        const infoRows = [
          ['Event ID', '#' + eventId],
          ...(lanes != null ? [['Lanes', `${lanes} lane${lanes !== 1 ? 's' : ''}`]] : []),
          ...(impact  ? [['Impact',    impact]]    : []),
          ...(melway  ? [['Melway',    melway]]    : []),
          ...(elapsed ? [['Time in',   elapsed]]   : []),
          ...(firstSeen ? [['First seen', firstSeen]] : []),
        ];

        const popupHtml = `
          <div style="font-family:'IBM Plex Mono',monospace;min-width:210px;max-width:270px;color:#d8d8d8;padding:10px 12px">
            <div style="font-size:11px;font-weight:700;color:#e8e8e8;margin-bottom:4px;line-height:1.3">${road}</div>
            ${sub ? `<div style="font-size:8px;color:#555;margin-bottom:8px">${sub}${cross ? ' @ ' + cross : ''}</div>` : '<div style="margin-bottom:8px"></div>'}
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">
              <span style="font-size:7px;font-weight:700;padding:1px 5px;border:1px solid #3a8a5a55;border-radius:2px;color:#3a8a5a;background:#3a8a5a18;text-transform:uppercase;letter-spacing:.08em">Active</span>
              ${subType ? `<span style="font-size:7px;font-weight:700;padding:1px 5px;border:1px solid #3a3a2a;border-radius:2px;color:#c8a84b;background:#c8a84b11;text-transform:uppercase;letter-spacing:.08em">${subType}</span>` : ''}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px">
              ${infoRows.map(([lbl, val]) => `
                <div style="background:#111;border:1px solid #1e1e1e;border-radius:2px;padding:4px 6px">
                  <div style="font-size:6px;color:#444;letter-spacing:.1em;text-transform:uppercase;margin-bottom:2px">${lbl}</div>
                  <div style="font-size:8px;color:#bbb;word-break:break-all">${val}</div>
                </div>`).join('')}
            </div>
            ${desc ? `<div style="font-size:8px;color:#4a4a4a;line-height:1.5;background:#0a0a0a;padding:5px 7px;border-radius:2px;border:1px solid #181818;margin-bottom:8px">${desc}</div>` : ''}
            <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"
              style="display:inline-flex;align-items:center;gap:4px;font-size:7px;color:#4a6a8a;border:1px solid #1e2e3e;border-radius:2px;padding:3px 7px;text-decoration:none;background:#0a1520;text-transform:uppercase;letter-spacing:.08em;font-family:'IBM Plex Mono',monospace">
              📍 Maps
            </a>
          </div>`;

        const handleClick = () => {
          if (traceModeRef.current) {
            handleTraceClick(feature, lat, lng, innerM, outerM);
          } else {
            L.popup({ closeButton: true, className: 'towbench-popup', maxWidth: 300, offset: [0, -5] })
              .setLatLng([lat, lng])
              .setContent(popupHtml)
              .openOn(map);
          }
        };

        innerM.on('click', handleClick);
        outerM.on('click', handleClick);
      });

      (annotations || []).forEach(ann => {
        if (!ann.lat || !ann.lng) return;
        L.marker([ann.lat, ann.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="font-size:16px;line-height:1;text-shadow:0 1px 4px #000a">📌</div>`,
            iconSize: [20, 20], iconAnchor: [10, 20],
          }),
        }).bindPopup(`
          <div style="font-family:'IBM Plex Mono',monospace;min-width:160px;padding:8px 10px;background:#0d0c00;color:#c8a84b">
            <div style="font-size:9px;line-height:1.5">${ann.note}</div>
            <div style="font-size:7px;color:#6a5a20;margin-top:5px">${ann.created_by?.split('@')[0] || ''} · expires ${new Date(ann.expires_at).toLocaleDateString('en-AU')}</div>
          </div>`, { className: 'towbench-popup', closeButton: true })
        .addTo(noteLayer);
      });

      hotLayerRef.current    = hotLayer;
      activeLayerRef.current = activeLayer;
      traceLayerRef.current  = traceLayer;
      noteLayerRef.current   = noteLayer;
      mapRef.current         = map;

      if (!showHotspotsRef.current) map.removeLayer(hotLayer);
      if (!showActiveRef.current)   map.removeLayer(activeLayer);

      const allCoords = [
        ...points,
        ...activeFeatures.filter(f => f.geometry?.coordinates).map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]),
      ];
      if (allCoords.length > 0) {
        const lats = allCoords.map(p => p[0]);
        const lngs = allCoords.map(p => p[1]);
        map.fitBounds([
          [Math.min(...lats) - 0.04, Math.min(...lngs) - 0.06],
          [Math.max(...lats) + 0.04, Math.max(...lngs) + 0.06],
        ], { maxZoom: 13 });
      }
    });

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      traceStateRef.current = { selected: [], highlights: [] };
    };
  }, [points, activeFeatures]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const L  = leafletRef.current;
    const nl = noteLayerRef.current;
    if (!L || !nl) return;
    nl.clearLayers();
    (annotations || []).forEach(ann => {
      if (!ann.lat || !ann.lng) return;
      L.marker([ann.lat, ann.lng], {
        icon: L.divIcon({ className: '', html: `<div style="font-size:16px;line-height:1;text-shadow:0 1px 4px #000a">📌</div>`, iconSize: [20, 20], iconAnchor: [10, 20] }),
      }).bindPopup(`
        <div style="font-family:'IBM Plex Mono',monospace;min-width:160px;padding:8px 10px;background:#0d0c00;color:#c8a84b">
          <div style="font-size:9px;line-height:1.5">${ann.note}</div>
          <div style="font-size:7px;color:#6a5a20;margin-top:5px">${ann.created_by?.split('@')[0] || ''} · expires ${new Date(ann.expires_at).toLocaleDateString('en-AU')}</div>
        </div>`, { className: 'towbench-popup', closeButton: true })
      .addTo(nl);
    });
  }, [annotations]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    const hot = hotLayerRef.current;
    const act = activeLayerRef.current;
    const nts = noteLayerRef.current;
    if (!map || !hot || !act) return;
    if (showHotspots) map.addLayer(hot); else map.removeLayer(hot);
    if (showActive)   map.addLayer(act); else map.removeLayer(act);
    if (nts) { if (showNotes) map.addLayer(nts); else map.removeLayer(nts); }
  }, [showHotspots, showActive, showNotes]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getContainer().style.cursor = traceMode ? 'crosshair' : '';
    if (!traceMode) {
      traceLayerRef.current?.clearLayers();
      const state = traceStateRef.current;
      state.highlights.forEach(h => {
        h.inner.setStyle({ radius: 5, fillColor: GRN, fillOpacity: 0.9, color: GRN, weight: 1 });
        h.outer.setStyle({ fillColor: GRN, fillOpacity: 0.15 });
      });
      state.selected = [];
      state.highlights = [];
    }
  }, [traceMode]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 2 }} />;
}

export default function TowAnalyticsTab({ allFeatures, liveIds, loading, userEmail }) {
  const [periodMs,     setPeriodMs]     = useState(Infinity);
  const [showHotspots, setShowHotspots] = useState(true);
  const [showActive,   setShowActive]   = useState(true);
  const [showNotes,    setShowNotes]    = useState(true);
  const [traceMode,    setTraceMode]    = useState(false);
  const [annotations,  setAnnotations]  = useState([]);
  const [pinMode,      setPinMode]      = useState(false);
  const [pinDraft,     setPinDraft]     = useState(null);
  const [pinNote,      setPinNote]      = useState('');
  const [pinExpiry,    setPinExpiry]    = useState('1d');
  const winW     = useWindowWidth();
  const isMobile = winW < 640;

  const fetchAnnotations = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('map_notes')
        .select('id, lat, lng, note, created_by, expires_at')
        .is('allocation_id', null)
        .gt('expires_at', new Date().toISOString());
      if (data) setAnnotations(data);
    } catch { /* table may not exist yet */ }
  }, []);

  useEffect(() => { fetchAnnotations(); }, [fetchAnnotations]);

  const saveAnnotation = useCallback(async () => {
    if (!pinDraft || !pinNote.trim()) return;
    const EXPIRY_MS = { '1d': 864e5, '3d': 3 * 864e5, '7d': 7 * 864e5 };
    const expires_at = new Date(Date.now() + (EXPIRY_MS[pinExpiry] || 864e5)).toISOString();
    await supabase.from('map_notes').insert({
      lat: pinDraft.lat, lng: pinDraft.lng,
      note: pinNote.trim(),
      created_by: userEmail,
      expires_at,
    });
    setPinDraft(null); setPinNote(''); setPinMode(false);
    fetchAnnotations();
  }, [pinDraft, pinNote, pinExpiry, userEmail, fetchAnnotations]);

  const handleMapClick = useCallback((lat, lng) => {
    if (!pinMode) return;
    setPinDraft({ lat, lng });
  }, [pinMode]);

  const features = useMemo(() => {
    const cutoff = Date.now() - periodMs;
    return allFeatures.filter(f => {
      if (periodMs === Infinity) return true;
      const t = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated || 0).getTime();
      return t >= cutoff;
    });
  }, [allFeatures, periodMs]);

  const activeCount  = features.filter(f =>  liveIds.has(String(f.properties?.eventId))).length;
  const clearedCount = features.length - activeCount;

  const hourCounts = Array(24).fill(0);
  const dowCounts  = Array(7).fill(0);
  features.forEach(f => {
    const d = new Date(f._logMeta?.firstSeen || f.properties?.lastUpdated);
    if (!isNaN(d)) { hourCounts[d.getHours()]++; dowCounts[d.getDay()]++; }
  });

  const peakHourIdx = hourCounts.indexOf(Math.max(...hourCounts));
  const peakHour    = hourCounts[peakHourIdx] > 0
    ? `${String(peakHourIdx).padStart(2, '0')}:00–${String(peakHourIdx + 1).padStart(2, '0')}:00`
    : '—';

  const topSuburbs = tally(features, f => f.properties?.reference?.startIntersectionLocality);
  const topRoads   = tally(features, f => f.properties?.closedRoadName);
  const incTypes   = tally(features, f => f.properties?.eventSubType);
  const impTypes   = tally(features, f => f.properties?.impact?.impactType);

  const durations = features
    .filter(f => f._logMeta?.firstSeen)
    .map(f => {
      const start = new Date(f._logMeta.firstSeen);
      const end   = new Date(f._logMeta.clearedAt || f._logMeta.lastSeen);
      return (end - start) / 60000;
    })
    .filter(m => m > 0 && m < 60 * 24);
  const avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

  const laneValues = features.map(f => f.properties?.numberLanesImpacted).filter(n => n != null && n > 0);
  const avgLanes   = laneValues.length
    ? (laneValues.reduce((a, b) => a + b, 0) / laneValues.length).toFixed(1)
    : '—';

  const mapPoints = useMemo(() =>
    features.filter(f => f.geometry?.coordinates)
      .map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]),
    [features]);

  const activeFeatures = useMemo(() =>
    features.filter(f => f.geometry?.coordinates && liveIds.has(String(f.properties?.eventId))),
    [features, liveIds]);

  const days        = periodMs === Infinity ? 31 : Math.round(periodMs / 864e5);
  const avgPerDay   = features.length ? (features.length / days).toFixed(1) : '0';
  const topSuburb   = topSuburbs[0]?.[0] || '—';
  const periodLabel = PERIODS.find(p => p.ms === periodMs)?.label || '31d';

  const legendBtn = (active, color) => ({
    fontSize: 8, fontWeight: 700, padding: '3px 8px', borderRadius: 2, cursor: 'pointer',
    fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em',
    display: 'inline-flex', alignItems: 'center', gap: 4,
    border: `1px solid ${active ? color + '88' : '#2a2a2a'}`,
    color: active ? color : '#444',
    background: active ? color + '11' : '#0d0d0d',
  });

  return (
    <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TXT, letterSpacing: '0.06em' }}>📊 Tow Analytics</div>
          <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>
            {loading && allFeatures.length === 0
              ? 'Loading…'
              : `${features.length} allocation${features.length !== 1 ? 's' : ''} · ${periodMs === Infinity ? 'last 31 days' : `last ${periodLabel}`}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {PERIODS.map(p => (
            <button key={p.label} onClick={() => setPeriodMs(p.ms)}
              style={{ fontSize: 8, fontWeight: 700, padding: '3px 9px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.06em', border: `1px solid ${p.ms === periodMs ? ACC + '88' : '#2a2a2a'}`, color: p.ms === periodMs ? ACC : MUT, background: p.ms === periodMs ? ACC + '11' : '#0d0d0d' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <KpiCard label="Total"        value={features.length}           color={TXT}    />
        <KpiCard label="Active"       value={activeCount}               color={GRN}    />
        <KpiCard label="Cleared"      value={clearedCount}              color={MUT}    />
        <KpiCard label="Avg / Day"    value={avgPerDay}                 color={ACC}    />
        <KpiCard label="Peak Hour"    value={peakHour}                  color={ORANGE} sub={hourCounts[peakHourIdx] > 0 ? `${hourCounts[peakHourIdx]} jobs` : undefined} />
        <KpiCard label="Top Suburb"   value={topSuburb}                 color={GRN}    sub={topSuburbs[0] ? `${topSuburbs[0][1]} jobs` : undefined} />
        <KpiCard label="Avg Duration" value={fmtDuration(avgDuration)}  color={MUT}    sub={durations.length ? `from ${durations.length} jobs` : 'insufficient data'} />
        <KpiCard label="Avg Lanes"    value={avgLanes}                  color={ORANGE} sub={laneValues.length ? `${laneValues.length} jobs` : undefined} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: 12, marginBottom: 14 }}>

        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, overflow: 'hidden', minHeight: 340 }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid ' + BRD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
              Incident Map · {mapPoints.length} plotted
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setShowHotspots(s => !s)} style={legendBtn(showHotspots, ORANGE)}>
                <span style={{ fontSize: 10, lineHeight: 1 }}>●</span> Hotspots
              </button>
              <button onClick={() => setShowActive(s => !s)} style={legendBtn(showActive, GRN)}>
                <span style={{ fontSize: 10, lineHeight: 1 }}>●</span> Active
              </button>
              <button onClick={() => setShowNotes(s => !s)} style={legendBtn(showNotes, '#c8a84b')}>
                📌 Notes
              </button>
              <button onClick={() => { setPinMode(s => !s); if (pinMode) setPinDraft(null); }} style={legendBtn(pinMode, '#c8a84b')}>
                + Pin
              </button>
              <button onClick={() => setTraceMode(s => !s)} style={legendBtn(traceMode, '#cc2222')}>
                ↔ Trace
              </button>
            </div>
          </div>
          <div style={{ height: isMobile ? 260 : 300, position: 'relative' }}>
            {traceMode && (
              <div style={{ position: 'absolute', top: 8, left: 0, right: 0, zIndex: 500, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ background: '#cc222299', color: '#fff', fontSize: 7, fontFamily: "'IBM Plex Mono',monospace", padding: '3px 9px', borderRadius: 2, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
                  Tap two active allocations to trace route
                </div>
              </div>
            )}
            {pinMode && !pinDraft && (
              <div style={{ position: 'absolute', top: 8, left: 0, right: 0, zIndex: 500, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ background: '#c8a84b99', color: '#000', fontSize: 7, fontFamily: "'IBM Plex Mono',monospace", padding: '3px 9px', borderRadius: 2, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
                  Tap map to drop annotation pin
                </div>
              </div>
            )}
            {pinDraft && (
              <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, zIndex: 500, background: '#0d0c00', border: '1px solid #3a3000', borderRadius: 2, padding: '10px 12px' }}>
                <textarea value={pinNote} onChange={e => setPinNote(e.target.value)} placeholder="Annotation note…"
                  style={{ width: '100%', background: '#080800', border: '1px solid #2a2a00', color: '#c8a84b', fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, padding: '5px 7px', borderRadius: 2, outline: 'none', resize: 'none', height: 50, boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  {['1d', '3d', '7d'].map(d => (
                    <button key={d} onClick={() => setPinExpiry(d)}
                      style={{ fontSize: 8, padding: '2px 7px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700,
                        border: `1px solid ${pinExpiry === d ? '#c8a84b' : '#2a2a00'}`,
                        color: pinExpiry === d ? '#c8a84b' : '#6a5a20',
                        background: pinExpiry === d ? '#c8a84b22' : 'none' }}>
                      {d}
                    </button>
                  ))}
                  <button onClick={saveAnnotation}
                    style={{ fontSize: 8, padding: '2px 9px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, background: '#c8a84b', color: '#000', border: 'none', marginLeft: 'auto' }}>
                    Save
                  </button>
                  <button onClick={() => setPinDraft(null)}
                    style={{ fontSize: 8, padding: '2px 7px', borderRadius: 2, cursor: 'pointer', fontFamily: "'IBM Plex Mono',monospace", background: 'none', border: '1px solid #2a2a00', color: '#6a5a20' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {loading && allFeatures.length === 0
              ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 9, color: MUT }}>Loading…</div>
              : mapPoints.length === 0 && activeFeatures.length === 0
                ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 9, color: MUT }}>No coordinate data yet</div>
                : <HeatMap
                    points={mapPoints}
                    activeFeatures={activeFeatures}
                    showHotspots={showHotspots}
                    showActive={showActive}
                    traceMode={traceMode}
                    annotations={annotations}
                    showNotes={showNotes}
                    onMapClick={handleMapClick}
                  />
            }
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px', flex: 1 }}>
            <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Incident Type</div>
            <BarList data={incTypes} color={ORANGE} maxBars={6} labelWidth={130} />
          </div>
          <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px', flex: 1 }}>
            <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Impact Type</div>
            <BarList data={impTypes} color='#5a7a9a' maxBars={5} labelWidth={130} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Jobs by Hour of Day</div>
          <HourChart counts={hourCounts} />
        </div>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Jobs by Day of Week</div>
          <DowChart counts={dowCounts} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Hot Suburbs</div>
          <BarList data={topSuburbs} color={GRN} maxBars={10} labelWidth={110} />
        </div>
        <div style={{ background: SURF, border: '1px solid ' + BRD, borderRadius: 2, padding: '10px 12px' }}>
          <div style={{ fontSize: 8, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Hot Roads</div>
          <BarList data={topRoads} color={ORANGE} maxBars={10} labelWidth={110} />
        </div>
      </div>

    </div>
  );
}
