// Server-side proxy for VicEmergency feed — avoids CORS block in browsers
exports.handler = async function () {
  try {
    const res = await fetch('https://data.emergency.vic.gov.au/Show?pageId=getIncidentJSON');
    if (!res.ok) throw new Error(`Upstream returned ${res.status}`);
    const data = await res.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
      body: JSON.stringify(data),
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: e.message }) };
  }
};
