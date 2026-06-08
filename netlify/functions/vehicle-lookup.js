// GET /.netlify/functions/vehicle-lookup?name=Pumper+55
// Returns { vehicleUrl, imageUrl } for an emergency vehicle callsign.
//
// Resolution order:
//   1. Supabase cache
//   2. Static ID table  → direct emergencyvehiclesapp.com/vehicle/{id} link
//   3. Flickr photo search → real photo of that appliance (needs FLICKR_API_KEY)
//   4. Google Custom Search fallback (needs GOOGLE_CSE_KEY + GOOGLE_CSE_ID)
//
// Flickr setup (free, ~2 min):
//   flickr.com/services/apps/create → apply for non-commercial key
//   Set Netlify env var: FLICKR_API_KEY

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

function vehiclePageUrl(id) {
  return `https://emergencyvehiclesapp.com/vehicle/${id}`;
}

// ── Flickr photo search ───────────────────────────────────────────────────────
async function flickrSearch(name) {
  const key = process.env.FLICKR_API_KEY;
  if (!key) return null;
  try {
    // Search with callsign + FRV context for best results
    const text = `"${name}" FRV OR "Fire Rescue Victoria"`;
    const url  = 'https://www.flickr.com/services/rest/?' + new URLSearchParams({
      method:        'flickr.photos.search',
      api_key:       key,
      text:          text,
      sort:          'relevance',
      format:        'json',
      nojsoncallback: '1',
      extras:        'url_m,url_s',
      per_page:      '1',
      content_type:  '1',  // photos only
      safe_search:   '1',
    });
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const photo = data.photos?.photo?.[0];
    return photo?.url_m || photo?.url_s || null;
  } catch (e) {
    console.warn('flickr search failed:', e.message);
    return null;
  }
}

// ── Google CSE fallback ───────────────────────────────────────────────────────
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

  // 2. Static ID table
  const staticId  = STATIC_IDS[name];
  let vehicleUrl  = staticId ? vehiclePageUrl(staticId) : null;
  let imageUrl    = null;

  // 3. Flickr image search
  imageUrl = await flickrSearch(name);

  // 4. Google CSE fallback (fills vehicleUrl if not in static table, or imageUrl if Flickr failed)
  if (!vehicleUrl || !imageUrl) {
    const cse = await googleCSE(name);
    vehicleUrl = vehicleUrl || cse.vehicleUrl;
    imageUrl   = imageUrl   || cse.imageUrl;
  }

  // 5. Cache result
  await supabase.from('vehicle_cache').upsert(
    { callsign: name, vehicle_url: vehicleUrl, image_url: imageUrl, cached_at: new Date().toISOString() },
    { onConflict: 'callsign' },
  );

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ vehicleUrl, imageUrl }) };
};
