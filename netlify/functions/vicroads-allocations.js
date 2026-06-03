// Server-side proxy for VicRoads unplanned disruptions — keeps API key out of the browser.
exports.handler = async function () {
  const KEY = process.env.VICROADS_KEY;
  if (!KEY) return { statusCode: 500, body: JSON.stringify({ error: 'VICROADS_KEY not set' }) };

  try {
    const res = await fetch(
      'https://api.opendata.transport.vic.gov.au/api/opendata/roads/disruptions/unplanned/v3',
      { headers: { KeyID: KEY } }
    );
    if (!res.ok) throw new Error(`Upstream returned ${res.status}`);
    const data = await res.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60' },
      body: JSON.stringify(data),
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: e.message }) };
  }
};
