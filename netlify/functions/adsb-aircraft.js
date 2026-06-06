// Proxy for Airplanes.live ADS-B feed — Melbourne area, 150 nm radius. No API key required.
exports.handler = async function () {
  try {
    const res = await fetch(
      'https://api.airplanes.live/v2/point/-37.814/144.963/150',
      { headers: { 'User-Agent': 'TowBench/1.0' } }
    );
    if (!res.ok) throw new Error(`Upstream returned ${res.status}`);
    const data = await res.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=30' },
      body: JSON.stringify({ aircraft: data.ac || [] }),
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: e.message }) };
  }
};
