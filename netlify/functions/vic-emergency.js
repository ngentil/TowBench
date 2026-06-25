// Server-side proxy for VicEmergency — adds _meta timing + hash block for Signals tab.
// Response shape: { incidents: [...], _meta: {...} }
// Backward-compatible: EmergencyTab reads data.incidents or falls back to data.results.
const { createHash } = require('crypto');

const UPSTREAM = 'https://data.emergency.vic.gov.au/Show?pageId=getIncidentJSON';

function pickHeaders(headers) {
  const want = [
    'age', 'cache-control', 'etag', 'cf-cache-status', 'x-cache',
    'via', 'content-type', 'content-encoding', 'content-length',
    'server-timing', 'x-request-id', 'x-correlation-id',
  ];
  const out = {};
  for (const k of want) { const v = headers.get(k); if (v != null) out[k] = v; }
  return out;
}

exports.handler = async function () {
  const t0 = Date.now();
  try {
    const res = await fetch(UPSTREAM);
    const ttfb = Date.now() - t0;
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    const text = await res.text();
    const total = Date.now() - t0;

    const capturedHeaders = pickHeaders(res.headers);
    const uncompressedSize = Buffer.byteLength(text, 'utf8');
    const compressedSize  = parseInt(capturedHeaders['content-length'] || '0') || null;
    const bodyHash        = createHash('sha256').update(text).digest('hex').slice(0, 16);
    const data            = JSON.parse(text);

    // Normalise to array — VicEmergency API returns either an array or { incidents/results/items }
    const incidents = Array.isArray(data) ? data
      : (data.results || data.incidents || data.items || []);

    const _meta = {
      ts:              new Date().toISOString(),
      status:          res.status,
      ttfb,
      totalTime:       total,
      transferTime:    total - ttfb,
      bodyHash,
      compressedSize,
      uncompressedSize,
      headers:         capturedHeaders,
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ incidents, _meta }),
    };
  } catch (e) {
    return {
      statusCode: 502,
      body: JSON.stringify({
        error: e.message,
        _meta: { ts: new Date().toISOString(), status: 502, ttfb: null, totalTime: Date.now() - t0 },
      }),
    };
  }
};
