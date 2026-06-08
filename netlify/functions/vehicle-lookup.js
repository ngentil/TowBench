// GET /.netlify/functions/vehicle-lookup?name=Pumper+55
// Returns { vehicleUrl, imageUrl } for an emergency vehicle callsign.
//
// Resolution order:
//   1. Supabase cache (free, instant after first lookup)
//   2. Static ID table → emergencyvehiclesapp.com/vehicle/{id}
//      + microlink.io   → headless-browser og:image fetch (free, no key)
//   3. Google Custom Search fallback (optional — needs GOOGLE_CSE_KEY + GOOGLE_CSE_ID)

const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, s-maxage=86400',
};

// ── Static vehicle ID table ───────────────────────────────────────────────────
// Maps labelAppliance() output → emergencyvehiclesapp.com vehicle ID
const STATIC_IDS = {
  // Pumpers
  'Pumper 2B':  253,  'Pumper 3':   235,  'Pumper 12':  233,
  'Pumper 35A': 10990,'Pumper 35B': 290,  'Pumper 42':  225,
  'Pumper 44':  9104, 'Pumper 47':  306,  'Pumper 50':  310,
  'Pumper 55':  357,  'Pumper 76':  1621, 'Pumper 77':  877,
  'Pumper 80':  959,  'Pumper 88':  703,  'Pumper 89':  740,
  'Pumper 93':  860,  'Pumper 95':  2120,
  // Pumper Tankers
  'Pumper Tanker 16':  257,  'Pumper Tanker 26':  272,
  'Pumper Tanker 28':  7165, 'Pumper Tanker 30':  277,
  'Pumper Tanker 44':  302,  'Pumper Tanker 59A': 7532,
  'Pumper Tanker 59B': 7166,
  // Aerials
  'Aerial Pumper 91':      729,
  'Reserve Aerial Pumper': 715,
  'Ladder Platform 87':    463,
};

// ── microlink.io — headless browser og:image extraction (free, no key) ────────
async function microlinkImage(vehicleUrl) {
  try {
    const res = await fetch(
      `https://api.microlink.io/?url=${encodeURIComponent(vehicleUrl)}&screenshot=false`,
      { signal: AbortSignal.timeout(20000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.image?.url || null;
  } catch (e) {
    console.warn('microlink failed:', e.message);
    return null;
  }
}

// ── Google CSE fallback (optional) ───────────────────────────────────────────
async function googleCSE(name) {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx  = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return { vehicleUrl: null, imageUrl: null };
  try {
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(`"${name}"`)}&num=1`,
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
    console.warn('CSE failed:', e.message);
    return { vehicleUrl: null, imageUrl: null };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
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

  // 2. Static ID → direct vehicle URL, then microlink to get its og:image
  const staticId = STATIC_IDS[name];
  let vehicleUrl = staticId ? `https://emergencyvehiclesapp.com/vehicle/${staticId}` : null;
  let imageUrl   = vehicleUrl ? await microlinkImage(vehicleUrl) : null;

  // 3. Google CSE for callsigns not in static table, or if microlink failed
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
