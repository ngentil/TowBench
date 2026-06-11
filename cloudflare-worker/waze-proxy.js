// Cloudflare Worker — Waze Live Map Proxy
//
// Deploy steps (2 minutes, free):
//   1. Go to https://workers.cloudflare.com  →  Create a Worker
//   2. Paste this entire file into the editor
//   3. Click  Save and Deploy
//   4. Copy the worker URL  (e.g. https://waze-proxy.YOUR-NAME.workers.dev)
//   5. In Netlify: Site configuration → Environment variables
//      Add  WAZE_CF_WORKER_URL = <your worker URL>
//   6. Redeploy (or wait for next auto-deploy)
//
// Why this works: Cloudflare Workers fetch() from Cloudflare's own edge IPs.
// Waze runs behind Cloudflare, so they can't block Cloudflare IPs without
// breaking their own CDN — their firewall only targets AWS/Netlify/GCP ranges.

const BBOX = { top: -37.55, bottom: -38.20, left: 144.50, right: 145.50 };

const ENDPOINTS = [
  `https://www.waze.com/live-map/api/georss` +
    `?top=${BBOX.top}&bottom=${BBOX.bottom}&left=${BBOX.left}&right=${BBOX.right}&env=row&types=alerts`,
  `https://www.waze.com/row-rtserver/web/TGeoRSS` +
    `?tk=community&format=JSON&types=alerts` +
    `&left=${BBOX.left}&right=${BBOX.right}&top=${BBOX.top}&bottom=${BBOX.bottom}&zoom=13`,
];

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=30',
};

const WAZE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Referer': 'https://www.waze.com/en-GB/live-map',
  'Origin': 'https://www.waze.com',
  'X-Requested-With': 'XMLHttpRequest',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const errors = [];

    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, { headers: WAZE_HEADERS });
        if (!res.ok) { errors.push(`${res.status} from ${url.split('?')[0]}`); continue; }
        const data = await res.json();
        const alerts = data?.alerts ?? data?.data?.alerts ?? [];
        return new Response(JSON.stringify({ alerts, source: url.split('?')[0] }), { headers: CORS });
      } catch (e) {
        errors.push(`${url.split('?')[0]}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({ error: 'All Waze endpoints failed', details: errors }),
      { status: 502, headers: CORS },
    );
  },
};
