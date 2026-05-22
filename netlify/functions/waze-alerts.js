// Proxy for the Waze live-map alerts feed — avoids CORS in the browser.
// Bounding box covers Melbourne metro + inner suburbs.
// Tries two known endpoints; Waze occasionally moves/rate-limits the informal API.
const BBOX = { top: -37.55, bottom: -38.20, left: 144.50, right: 145.50 };

const ENDPOINTS = [
  `https://www.waze.com/live-map/api/georss` +
    `?top=${-37.55}&bottom=${-38.20}&left=${144.50}&right=${145.50}&env=row&types=alerts`,
  `https://www.waze.com/row-rtserver/web/TGeoRSS` +
    `?tk=community&format=JSON&types=alerts` +
    `&left=${144.50}&right=${145.50}&top=${-37.55}&bottom=${-38.20}`,
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Referer': 'https://www.waze.com/en-GB/live-map',
  'Origin': 'https://www.waze.com',
};

exports.handler = async function () {
  const errors = [];

  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) {
        errors.push(`${url.split('?')[0]} → ${res.status}`);
        continue;
      }
      const data = await res.json();
      const alerts = data?.alerts ?? data?.data?.alerts ?? [];
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
        body: JSON.stringify({ alerts }),
      };
    } catch (e) {
      errors.push(`${url.split('?')[0]} → ${e.message}`);
    }
  }

  return { statusCode: 502, body: JSON.stringify({ error: errors.join(' | ') }) };
};
