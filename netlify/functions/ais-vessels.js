// Server-side proxy for AISHub AIS vessel positions — keeps API key out of the browser.
exports.handler = async function () {
  const USER = process.env.AIS_HUB_USER;
  if (!USER) return { statusCode: 500, body: JSON.stringify({ error: 'AIS_HUB_USER not set' }) };

  try {
    const res = await fetch(
      `http://data.aishub.net/ws.php?username=${encodeURIComponent(USER)}&format=1&output=json&compress=0&latmin=-38.5&latmax=-37.5&lonmin=144.5&lonmax=145.2`
    );
    if (!res.ok) throw new Error(`Upstream returned ${res.status}`);
    const raw = await res.json();
    const vessels = raw?.[0]?.DATA || [];
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60' },
      body: JSON.stringify({ vessels }),
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: e.message }) };
  }
};
