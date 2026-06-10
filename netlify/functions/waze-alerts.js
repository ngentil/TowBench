// Waze live-map alert proxy.
//
// Waze blocks all AWS/Netlify Lambda IPs at the firewall level.
// If WAZE_CF_WORKER_URL is set we forward the request to a Cloudflare Worker
// (cloudflare-worker/waze-proxy.js) which fetches from Waze using Cloudflare's
// own edge IPs — IPs Waze cannot block without breaking their own CDN.
//
// Setup: deploy cloudflare-worker/waze-proxy.js, then in Netlify set
//   WAZE_CF_WORKER_URL = https://waze-proxy.<your-name>.workers.dev

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=30',
};

// ── Direct endpoints (only work from non-datacenter IPs) ─────────────────────
const BBOX = { top: -37.55, bottom: -38.20, left: 144.50, right: 145.50 };
const DIRECT_ENDPOINTS = [
  `https://www.waze.com/live-map/api/georss` +
    `?top=${BBOX.top}&bottom=${BBOX.bottom}&left=${BBOX.left}&right=${BBOX.right}&env=row&types=alerts`,
  `https://www.waze.com/row-rtserver/web/TGeoRSS` +
    `?tk=community&format=JSON&types=alerts` +
    `&left=${BBOX.left}&right=${BBOX.right}&top=${BBOX.top}&bottom=${BBOX.bottom}&zoom=13`,
];

const WAZE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Referer': 'https://www.waze.com/en-GB/live-map',
  'Origin': 'https://www.waze.com',
  'X-Requested-With': 'XMLHttpRequest',
};

exports.handler = async function () {
  // ── Path 1: Cloudflare Worker proxy ────────────────────────────────────────
  const workerUrl = process.env.WAZE_CF_WORKER_URL;
  if (workerUrl) {
    try {
      const res = await fetch(workerUrl, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = await res.json();
        return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
      }
      console.warn(`Cloudflare Worker returned ${res.status} — falling through to direct`);
    } catch (e) {
      console.warn('Cloudflare Worker fetch failed:', e.message, '— falling through to direct');
    }
  }

  // ── Path 2: Direct Waze endpoints (likely blocked from Lambda, but worth trying) ──
  const errors = [];
  for (const url of DIRECT_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        headers: WAZE_HEADERS,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) { errors.push(`${url.split('?')[0]} → ${res.status}`); continue; }
      const data = await res.json();
      const alerts = data?.alerts ?? data?.data?.alerts ?? [];
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ alerts }) };
    } catch (e) {
      errors.push(`${url.split('?')[0]} → ${e.message}`);
    }
  }

  return {
    statusCode: 502,
    headers: CORS,
    body: JSON.stringify({
      error: workerUrl
        ? 'Cloudflare Worker and direct endpoints both failed'
        : 'Direct Waze endpoints blocked — set WAZE_CF_WORKER_URL (see cloudflare-worker/waze-proxy.js)',
      details: errors,
    }),
  };
};
