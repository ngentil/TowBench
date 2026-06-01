#!/usr/bin/env node
/**
 * Fetch low-clearance bridge data from OpenStreetMap (Overpass API)
 * and write to public/bridges.json in TowBench compact format.
 *
 * Usage:  node scripts/fetch-bridges.js
 *         (run from project root; requires Node 18+)
 *
 * Only ways with a posted maxheight <= MAX_HEIGHT_M are included.
 * These are the actual signed clearance restrictions — the ones with
 * number plates bolted to the structure — not a structural register.
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const MAX_HEIGHT_M = 5.0;   // ignore anything taller than this
const OUT_FILE     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/bridges.json');

// Victoria bounding box  south,west,north,east
const BBOX = '-39.2,140.9,-33.9,150.0';

const QUERY = `[out:json][timeout:120];
way["maxheight"](${BBOX});
out center tags;`;

async function run() {
  const url = 'https://overpass-api.de/api/interpreter';
  console.log('Querying Overpass API for Victoria maxheight ways...');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(QUERY),
  });

  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const json = await res.json();
  const elements = json.elements ?? [];
  console.log(`Received ${elements.length} ways with maxheight`);

  const records = [];
  let skipped = 0;

  for (const el of elements) {
    const tags   = el.tags ?? {};
    const center = el.center;
    if (!center) { skipped++; continue; }

    // Parse maxheight — OSM values can be "4.5", "4.5 m", "14'9\"", etc.
    const raw = String(tags.maxheight ?? '');
    const h   = parseHeight(raw);
    if (h === null || h <= 0 || h > MAX_HEIGHT_M) { skipped++; continue; }

    // Label: prefer name, then ref, then highway type
    const label = (tags.name || tags['name:en'] || tags.ref || tags.highway || '').trim().toUpperCase() || 'BRIDGE';

    // Structure type tag for display
    const structType = resolveType(tags);

    records.push([
      parseFloat(center.lat.toFixed(6)),
      parseFloat(center.lon.toFixed(6)),
      h,
      label,
      structType,
    ]);
  }

  // Sort by height ascending so lowest clearances are first
  records.sort((a, b) => a[2] - b[2]);

  console.log(`Kept ${records.length} records (skipped ${skipped})`);
  console.log('Height distribution:');
  const dist = {};
  for (const r of records) {
    const k = r[2].toFixed(1);
    dist[k] = (dist[k] ?? 0) + 1;
  }
  for (const [k, v] of Object.entries(dist).sort()) console.log(`  ${k}m: ${v}`);

  const out = { f: ['lat', 'lng', 'h', 'label', 'type'], r: records };
  writeFileSync(OUT_FILE, JSON.stringify(out));
  console.log(`\nWrote ${OUT_FILE}  (${(JSON.stringify(out).length / 1024).toFixed(1)} KB)`);
}

function parseHeight(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/\s*m$/, '');

  // Decimal metres: "4.5" or "4.5m"
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);

  // Feet and inches: 14'9" or 14'9  or  14ft9in
  const ft = s.match(/^(\d+)'?\s*(\d+)?[""]?/);
  if (ft) {
    const feet   = parseInt(ft[1], 10);
    const inches = ft[2] ? parseInt(ft[2], 10) : 0;
    return parseFloat(((feet * 12 + inches) * 0.0254).toFixed(2));
  }

  return null;
}

function resolveType(tags) {
  if (tags.bridge && tags.bridge !== 'no') {
    if (tags.railway) return 'RAIL OVER ROAD';
    return 'ROAD BRIDGE';
  }
  if (tags.tunnel && tags.tunnel !== 'no') return 'TUNNEL';
  if (tags.highway) return 'LOW CLEARANCE';
  return 'LOW CLEARANCE';
}

run().catch(err => { console.error(err); process.exit(1); });
