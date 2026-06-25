// Server-side proxy for VicRoads unplanned disruptions — keeps API key out of the browser.
// Returns upstream data plus _meta block with traffic-layer signals for the Signals tab.
const { createHash } = require('crypto');

const UPSTREAM = 'https://api.opendata.transport.vic.gov.au/api/opendata/roads/disruptions/unplanned/v3';

function pickHeaders(headers) {
  const want = [
    'age', 'cache-control', 'etag', 'cf-cache-status', 'x-cache',
    'via', 'server-timing', 'transfer-encoding', 'content-length',
    'content-encoding', 'x-request-id', 'x-correlation-id', 'x-trace-id',
    'warning', 'deprecation', 'retry-after', 'content-type',
    'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset',
  ];
  const out = {};
  for (const k of want) {
    const v = headers.get(k);
    if (v != null) out[k] = v;
  }
  return out;
}

exports.handler = async function () {
  const KEY = process.env.VICROADS_KEY;
  if (!KEY) return { statusCode: 500, body: JSON.stringify({ error: 'VICROADS_KEY not set' }) };

  const t0 = Date.now();

  try {
    const res = await fetch(UPSTREAM, { headers: { KeyID: KEY } });
    const ttfb = Date.now() - t0;

    if (!res.ok) throw new Error(`Upstream ${res.status}`);

    const text   = await res.text();
    const total  = Date.now() - t0;

    const capturedHeaders = pickHeaders(res.headers);
    const compressedSize  = parseInt(capturedHeaders['content-length'] || '0') || null;
    const uncompressedSize = Buffer.byteLength(text, 'utf8');
    const bodyHash = createHash('sha256').update(text).digest('hex').slice(0, 16);

    const data = JSON.parse(text);

    const _meta = {
      ts:                new Date().toISOString(),
      status:            res.status,
      ttfb,
      totalTime:         total,
      transferTime:      total - ttfb,
      bodyHash,
      compressedSize,
      uncompressedSize,
      compressionRatio:  compressedSize ? +(compressedSize / uncompressedSize).toFixed(3) : null,
      headers:           capturedHeaders,
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ...data, _meta }),
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
