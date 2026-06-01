#!/usr/bin/env node
/**
 * Fetch low-clearance bridge data from OpenStreetMap (Overpass API)
 * and write to public/bridges.json in TowBench compact format.
 *
 * Usage:  node scripts/fetch-bridges.js
 *         (run from project root; requires Node 18+)
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const MAX_HEIGHT_M = 5.0;
const OUT_FILE     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/bridges.json');
const BBOX         = '-39.2,140.9,-33.9,150.0';
const QUERY        = `[out:json][timeout:120];way["maxheight"](${BBOX});out center tags;`;

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

async function fetchOverpass(mirror) {
  const url = `${mirror}?data=${encodeURIComponent(QUERY)}`;
  console.log(`  GET ${mirror} ...`);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(130_000),
    headers: { 'User-Agent': 'TowBench/1.0 (github.com/ngentil/TowBench; bridge clearance data)' },
  });
  console.log(`  → HTTP ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function run() {
  console.log('Fetching Victoria bridge clearance data from OpenStreetMap Overpass API');

  let json = null;
  for (const mirror of MIRRORS) {
    try {
      json = await fetchOverpass(mirror);
      console.log(`  ✓ Success from ${mirror}`);
      break;
    } catch (err) {
      console.warn(`  ✗ ${mirror}: ${err.message}`);
    }
  }

  if (!json) throw new Error('All Overpass mirrors failed');

  const elements = json.elements ?? [];
  console.log(`\nReceived ${elements.length} ways with maxheight`);

  const records = [];
  let skipped = 0;

  for (const el of elements) {
    const tags   = el.tags ?? {};
    const center = el.center;
    if (!center) { skipped++; continue; }

    const raw = String(tags.maxheight ?? '');
    const h   = parseHeight(raw);
    if (h === null || h <= 0 || h > MAX_HEIGHT_M) { skipped++; continue; }

    const label = (tags.name || tags['name:en'] || tags.ref || tags.highway || '').trim().toUpperCase() || 'BRIDGE';
    const structType = resolveType(tags);
    const wt = parseWeight(String(tags.maxweight ?? ''));

    records.push([
      parseFloat(center.lat.toFixed(6)),
      parseFloat(center.lon.toFixed(6)),
      h,
      label,
      structType,
      wt,  // tonnes, or null
    ]);
  }

  records.sort((a, b) => a[2] - b[2]);

  console.log(`Kept ${records.length} records (skipped ${skipped})`);
  const dist = {};
  for (const r of records) { const k = r[2].toFixed(1); dist[k] = (dist[k] ?? 0) + 1; }
  for (const [k, v] of Object.entries(dist).sort()) console.log(`  ${k}m: ${v}`);

  const out = { f: ['lat', 'lng', 'h', 'label', 'type', 'maxweight'], r: records };
  writeFileSync(OUT_FILE, JSON.stringify(out));
  console.log(`\nWrote ${OUT_FILE}  (${(JSON.stringify(out).length / 1024).toFixed(1)} KB)`);
}

function parseHeight(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/\s*m$/, '');
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const ft = s.match(/^(\d+)[']?\s*(\d+)?["]?/);
  if (ft && ft[0].includes("'")) {
    const feet = parseInt(ft[1], 10);
    const inches = ft[2] ? parseInt(ft[2], 10) : 0;
    return parseFloat(((feet * 12 + inches) * 0.0254).toFixed(2));
  }
  return null;
}

function parseWeight(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  // "7500 kg" or "7500kg" → tonnes
  const kg = s.match(/^(\d+(?:\.\d+)?)\s*kg$/);
  if (kg) return parseFloat((parseFloat(kg[1]) / 1000).toFixed(2));
  // "3.5 t" or "3.5t" or plain "3.5"
  const t = s.match(/^(\d+(?:\.\d+)?)\s*t?$/);
  if (t) return parseFloat(parseFloat(t[1]).toFixed(2));
  return null;
}

function resolveType(tags) {
  if (tags.bridge && tags.bridge !== 'no') {
    if (tags.railway) return 'RAIL OVER ROAD';
    return 'ROAD BRIDGE';
  }
  if (tags.tunnel && tags.tunnel !== 'no') return 'TUNNEL';
  return 'LOW CLEARANCE';
}

run().catch(err => { console.error('\nFATAL:', err.message); process.exit(1); });
