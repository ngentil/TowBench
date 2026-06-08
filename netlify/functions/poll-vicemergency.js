// Netlify scheduled function — runs every 5 minutes.
// Fetches VicEmergency incident feed and upserts into Supabase vicemergency_incidents.
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
const { createClient } = require('@supabase/supabase-js');

exports.handler = async function () {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  const res = await fetch('https://data.emergency.vic.gov.au/Show?pageId=getIncidentJSON');
  if (!res.ok) return { statusCode: 502, body: `Upstream ${res.status}` };

  const data = await res.json();
  const items = Array.isArray(data) ? data : (data.results || data.incidents || data.items || []);
  if (!items.length) return { statusCode: 200, body: 'no items' };

  const rows = items
    .filter(inc => inc.id || inc.sourceId)
    .map(inc => ({
      id:              String(inc.id || inc.sourceId),
      name:            inc.name || null,
      title:           inc.title || null,
      category1:       inc.category1 || null,
      category2:       inc.category2 || null,
      severity:        inc.severity || null,
      status:          inc.status || null,
      source_org:      inc.sourceOrg || inc.sourceTitle || null,
      description:     inc.description || null,
      updated_ms:      inc.updated || null,
      created_ms:      inc.created || null,
      location_suburb: inc.location?.suburb || null,
      location_region: inc.location?.region || null,
      latitude:        inc.location?.latitude  ?? inc.lat  ?? null,
      longitude:       inc.location?.longitude ?? inc.lng  ?? null,
      raw:             inc,
    }));

  const { error } = await supabase
    .from('vicemergency_incidents')
    .upsert(rows, { onConflict: 'id' });

  if (error) return { statusCode: 500, body: error.message };
  return { statusCode: 200, body: `upserted ${rows.length}` };
};
