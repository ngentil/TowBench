// Waze alert proxy — OpenWebNinja (when key configured) with Supabase budget tracking,
// then falls back to Supabase cache (populated by GitHub Action every 10 min),
// then Cloudflare Worker, then direct Waze.
//
// OpenWebNinja free plan: 50 req/month hard limit.
// Budget is tracked server-side in waze_cache (month_key, month_count columns).
// Schema: supabase/73_waze_budget.sql

const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=30',
};

// Melbourne metro bounding box
const BBOX = { top: -37.55, bottom: -38.20, left: 144.50, right: 145.50 };
const MAX_MONTHLY = 50;

// Normalise OpenWebNinja alert shape → Waze native shape expected by AlertsTab
function normaliseOwn(a) {
  return {
    uuid:         a.alert_id,
    type:         a.type,
    subtype:      a.subtype || null,
    street:       a.street || null,
    city:         a.city   || null,
    pubMillis:    a.publish_datetime_utc ? new Date(a.publish_datetime_utc).getTime() : null,
    reliability:  null,
    reportRating: null,
    reportedBy:   a.reported_by || null,
    location:     { x: a.longitude, y: a.latitude },
  };
}

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
  // ── 0. OpenWebNinja — primary source when key is set ──────────────────────────
  if (process.env.OPENWEBNINJA_KEY) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const monthKey = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    try {
      const { data: cache } = await supabase
        .from('waze_cache')
        .select('alerts, fetched_at, month_key, month_count')
        .eq('id', 1)
        .maybeSingle();

      const count = (cache?.month_key === monthKey ? (cache.month_count ?? 0) : 0);
      const exhausted = count >= MAX_MONTHLY;

      if (exhausted) {
        return {
          statusCode: 200,
          headers: CORS,
          body: JSON.stringify({
            alerts: cache?.alerts || [],
            cachedAt: cache?.fetched_at,
            budgetCount: count,
            budgetMax: MAX_MONTHLY,
            budgetExhausted: true,
          }),
        };
      }

      // Endpoint: /waze/alerts-and-jams
      // BBox: bottom_left=minLat,minLng  top_right=maxLat,maxLng
      const params = new URLSearchParams({
        bottom_left: `${BBOX.bottom},${BBOX.left}`,
        top_right:   `${BBOX.top},${BBOX.right}`,
        max_alerts:  '500',
        max_jams:    '0',
      });
      const url = `https://api.openwebninja.com/waze/alerts-and-jams?${params}`;
      const res = await fetch(url, {
        headers: { 'x-api-key': process.env.OPENWEBNINJA_KEY },
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        const raw    = data?.data?.alerts ?? data?.alerts ?? [];
        const alerts = raw
          .map(normaliseOwn)
          .sort((a, b) => (b.pubMillis || 0) - (a.pubMillis || 0));
        const newCount = count + 1;

        await supabase.from('waze_cache').upsert({
          id: 1,
          alerts,
          fetched_at: new Date().toISOString(),
          month_key: monthKey,
          month_count: newCount,
        });

        return {
          statusCode: 200,
          headers: CORS,
          body: JSON.stringify({
            alerts,
            budgetCount: newCount,
            budgetMax: MAX_MONTHLY,
            budgetExhausted: false,
          }),
        };
      }
      console.warn('OpenWebNinja returned', res.status);
    } catch (e) {
      console.warn('OpenWebNinja failed:', e.message);
    }
  }

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
