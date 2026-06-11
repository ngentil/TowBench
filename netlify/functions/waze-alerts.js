// Waze alert proxy — reads from Supabase cache populated by GitHub Action
// (waze-poll.yml runs every 10 min from GitHub runner IPs, which Waze doesn't block).
//
// Fallback chain:
//   1. Supabase cache   — instant, populated by GitHub Action every 10 min
//   2. Cloudflare Worker — set WAZE_CF_WORKER_URL if deployed (cloudflare-worker/waze-proxy.js)
//   3. Direct Waze      — almost certainly blocked from Lambda, but worth a shot

const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=30',
};

const BBOX = { top: -37.55, bottom: -38.20, left: 144.50, right: 145.50 };
const DIRECT_ENDPOINTS = [
  `https://www.waze.com/live-map/api/georss?top=${BBOX.top}&bottom=${BBOX.bottom}&left=${BBOX.left}&right=${BBOX.right}&env=row&types=alerts`,
  `https://www.waze.com/row-rtserver/web/TGeoRSS?tk=community&format=JSON&types=alerts&left=${BBOX.left}&right=${BBOX.right}&top=${BBOX.top}&bottom=${BBOX.bottom}&zoom=13`,
];
const WAZE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Referer': 'https://www.waze.com/en-GB/live-map',
  'Origin': 'https://www.waze.com',
};

exports.handler = async function () {
  // ── 1. Supabase cache (populated by GitHub Action waze-poll.yml) ────────────
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data } = await supabase
      .from('waze_cache')
      .select('alerts, fetched_at')
      .eq('id', 1)
      .maybeSingle();

    if (data?.alerts) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ alerts: data.alerts, cachedAt: data.fetched_at }),
      };
    }
  } catch (e) {
    console.warn('Supabase cache read failed:', e.message);
  }

  // ── 2. Cloudflare Worker (optional — set WAZE_CF_WORKER_URL env var) ────────
  if (process.env.WAZE_CF_WORKER_URL) {
    try {
      const res = await fetch(process.env.WAZE_CF_WORKER_URL, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = await res.json();
        return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
      }
    } catch (e) {
      console.warn('CF Worker failed:', e.message);
    }
  }

  // ── 3. Direct Waze (likely blocked from Lambda) ──────────────────────────────
  for (const url of DIRECT_ENDPOINTS) {
    try {
      const res = await fetch(url, { headers: WAZE_HEADERS, signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const data = await res.json();
      const alerts = data?.alerts ?? data?.data?.alerts ?? [];
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ alerts }) };
    } catch (_) {}
  }

  return {
    statusCode: 502,
    headers: CORS,
    body: JSON.stringify({ error: 'No Waze data available — GitHub Action may not have run yet' }),
  };
};
