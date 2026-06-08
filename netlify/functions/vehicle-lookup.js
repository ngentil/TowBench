// GET /.netlify/functions/vehicle-lookup?name=Pumper+55
// Returns { vehicleUrl, imageUrl } for an emergency vehicle callsign.
//
// Resolution order:
//   1. Supabase cache
//   2. Direct fetch of emergencyvehiclesapp.com/search page (browser UA)
//   3. Google Custom Search API (fallback — needs GOOGLE_CSE_KEY + GOOGLE_CSE_ID)
//
// Results are cached in Supabase vehicle_cache so each callsign costs at most
// one external call.

const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, s-maxage=86400',
};

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.google.com/',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'cross-site',
};

// Try to scrape og:image directly from an emergencyvehiclesapp.com vehicle page
async function scrapeVehiclePage(url) {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(7000),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();
    const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]
                 || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];
    return ogImage || null;
  } catch {
    return null;
  }
}

// Search emergencyvehiclesapp.com for the callsign, return first matching vehicle URL
async function searchSite(name) {
  try {
    const url = `https://emergencyvehiclesapp.com/search?q=${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Find first /vehicle/{id} link in the response
    const match = html.match(/href=["'](\/vehicle\/\d+)["']/i);
    return match ? `https://emergencyvehiclesapp.com${match[1]}` : null;
  } catch {
    return null;
  }
}

// Google Custom Search fallback
async function googleCSE(name) {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx  = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return { vehicleUrl: null, imageUrl: null };

  try {
    const q   = encodeURIComponent(`"${name}"`);
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${q}&num=1`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return { vehicleUrl: null, imageUrl: null };
    const json = await res.json();
    const item = json.items?.[0];
    if (!item) return { vehicleUrl: null, imageUrl: null };
    return {
      vehicleUrl: item.link || null,
      imageUrl:   item.pagemap?.cse_image?.[0]?.src
               || item.pagemap?.metatags?.[0]?.['og:image']
               || null,
    };
  } catch (e) {
    console.warn('vehicle-lookup CSE error:', e.message);
    return { vehicleUrl: null, imageUrl: null };
  }
}

exports.handler = async function (event) {
  const name = (event.queryStringParameters?.name || '').trim();
  if (!name) return { statusCode: 400, body: 'name required' };

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  // 1. Supabase cache
  const { data: cached } = await supabase
    .from('vehicle_cache')
    .select('vehicle_url, image_url')
    .eq('callsign', name)
    .maybeSingle();

  if (cached) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ vehicleUrl: cached.vehicle_url, imageUrl: cached.image_url }) };
  }

  // 2. Try direct site access
  let vehicleUrl = await searchSite(name);
  let imageUrl   = vehicleUrl ? await scrapeVehiclePage(vehicleUrl) : null;

  // 3. Fall back to Google CSE if direct access failed
  if (!vehicleUrl || !imageUrl) {
    const cse = await googleCSE(name);
    vehicleUrl = vehicleUrl || cse.vehicleUrl;
    imageUrl   = imageUrl   || cse.imageUrl;
  }

  // 4. Cache result
  await supabase.from('vehicle_cache').upsert(
    { callsign: name, vehicle_url: vehicleUrl, image_url: imageUrl, cached_at: new Date().toISOString() },
    { onConflict: 'callsign' },
  );

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ vehicleUrl, imageUrl }) };
};
