// GET /.netlify/functions/vehicle-lookup?name=Pumper+55
// Looks up an emergency vehicle callsign on emergencyvehiclesapp.com via
// Google Custom Search API and returns the vehicle page URL + og:image.
// Results are cached in Supabase so each callsign costs at most one CSE call.
//
// Env vars required:
//   GOOGLE_CSE_KEY   — Google Cloud API key with Custom Search JSON API enabled
//   GOOGLE_CSE_ID    — Custom Search Engine ID scoped to emergencyvehiclesapp.com
//   SUPABASE_URL, SUPABASE_SERVICE_KEY

const { createClient } = require('@supabase/supabase-js');

exports.handler = async function (event) {
  const name = (event.queryStringParameters?.name || '').trim();
  if (!name) return { statusCode: 400, body: 'name required' };

  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, s-maxage=86400',
  };

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  // 1. Return cached result if available
  const { data: cached } = await supabase
    .from('vehicle_cache')
    .select('vehicle_url, image_url')
    .eq('callsign', name)
    .maybeSingle();

  if (cached) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ vehicleUrl: cached.vehicle_url, imageUrl: cached.image_url }) };
  }

  // 2. Query Google Custom Search (scoped to emergencyvehiclesapp.com)
  const key = process.env.GOOGLE_CSE_KEY;
  const cx  = process.env.GOOGLE_CSE_ID;

  let vehicleUrl = null;
  let imageUrl   = null;

  if (key && cx) {
    try {
      const q   = encodeURIComponent(`"${name}"`);
      const res = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${q}&num=1`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (res.ok) {
        const json = await res.json();
        const item = json.items?.[0];
        if (item) {
          vehicleUrl = item.link || null;
          // cse_image comes from og:image / structured data Google indexed on the page
          imageUrl   = item.pagemap?.cse_image?.[0]?.src
                    || item.pagemap?.metatags?.[0]?.['og:image']
                    || null;
        }
      }
    } catch (e) {
      console.warn('vehicle-lookup CSE error:', e.message);
    }
  }

  // 3. Cache result (null results too — avoid hammering the quota)
  await supabase.from('vehicle_cache').upsert(
    { callsign: name, vehicle_url: vehicleUrl, image_url: imageUrl, cached_at: new Date().toISOString() },
    { onConflict: 'callsign' },
  );

  return { statusCode: 200, headers: cors, body: JSON.stringify({ vehicleUrl, imageUrl }) };
};
