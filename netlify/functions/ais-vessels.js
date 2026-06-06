// AISStream.io WebSocket proxy for Port Phillip Bay vessel positions.
// Opens a WS connection, collects PositionReport + ShipStaticData for 4s, returns vessels.
const WebSocket = require('ws');

exports.handler = async function () {
  const KEY = process.env.AISSTREAM_KEY;
  if (!KEY) return { statusCode: 500, body: JSON.stringify({ error: 'AISSTREAM_KEY not set' }) };

  return new Promise((resolve) => {
    let resolved = false;
    const vessels = new Map(); // MMSI → vessel object
    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

    const finish = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try { ws.terminate(); } catch { /* ignore */ }
      resolve({
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60' },
        body: JSON.stringify({ vessels: [...vessels.values()].filter(v => v.LATITUDE != null) }),
      });
    };

    const timer = setTimeout(finish, 7000);

    ws.on('error', (e) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve({ statusCode: 502, body: JSON.stringify({ error: e.message }) });
    });

    ws.on('open', () => {
      ws.send(JSON.stringify({
        Apikey: KEY,
        BoundingBoxes: [[[-38.5, 144.5], [-37.5, 145.2]]],
        FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ShipStaticData'],
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg  = JSON.parse(data.toString());
        const meta = msg.MetaData || {};
        if (msg.MessageType === 'PositionReport' || msg.MessageType === 'StandardClassBPositionReport') {
          const pos  = msg.Message?.PositionReport || msg.Message?.StandardClassBPositionReport || {};
          const mmsi = meta.MMSI || pos.UserID;
          if (!mmsi) return;
          const prev = vessels.get(mmsi) || {};
          vessels.set(mmsi, {
            ...prev,
            MMSI:      mmsi,
            NAME:      ((meta.ShipName || prev.NAME || '')).trim(),
            LATITUDE:  meta.latitude  ?? pos.Latitude,
            LONGITUDE: meta.longitude ?? pos.Longitude,
            SOG:       pos.SpeedOverGround ?? 0,
            COG:       pos.CourseOverGround ?? 0,
            HEADING:   pos.TrueHeading !== 511 ? pos.TrueHeading : (prev.HEADING ?? null),
            NAVSTAT:   pos.NavigationalStatus ?? 0,
          });
        } else if (msg.MessageType === 'ShipStaticData') {
          const sd   = msg.Message?.ShipStaticData || {};
          const mmsi = meta.MMSI || sd.UserID;
          if (!mmsi) return;
          const prev = vessels.get(mmsi) || {};
          vessels.set(mmsi, {
            ...prev,
            MMSI:     mmsi,
            NAME:     ((sd.Name || meta.ShipName || prev.NAME || '')).trim(),
            TYPE:     sd.Type ?? prev.TYPE ?? 0,
            CALLSIGN: (sd.CallSign || prev.CALLSIGN || '').trim(),
            DEST:     (sd.Destination || prev.DEST || '').trim(),
            DRAUGHT:  sd.MaximumStaticDraught ?? prev.DRAUGHT,
          });
        }
      } catch { /* ignore malformed messages */ }
    });
  });
};
