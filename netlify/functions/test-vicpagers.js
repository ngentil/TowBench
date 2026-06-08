// On-demand diagnostic — GET /.netlify/functions/test-vicpagers
// Tries 15 subscription patterns, waits 60s total, logs every event received.
// Paste the JSON output to identify the correct subscription protocol.
const { io } = require('socket.io-client');

exports.handler = async function () {
  const result = {
    timestamp:     new Date().toISOString(),
    polling:       null,
    socketio:      null,
    connectAck:    null,   // any data the server sends on namespace connect
    allEvents:     [],
    messages:      [],
    subscriptions: [],     // which emits were attempted
  };

  // Test 1: confirm polling is accessible from this IP
  try {
    const r = await fetch('https://vicpagers.net.au/socket.io/?EIO=4&transport=polling', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(5000),
    });
    result.polling = { status: r.status, body: (await r.text()).slice(0, 300) };
  } catch (e) {
    result.polling = { error: e.message };
  }

  await new Promise(resolve => {
    const socket = io('https://vicpagers.net.au', {
      transports: ['websocket'],
      extraHeaders: { Origin: 'https://vicpagers.net.au' },
      timeout: 10000,
    });

    socket.on('connect', () => {
      result.socketio = { connected: true, id: socket.id };

      // Try every conceivable subscription pattern at 2-second intervals
      const patterns = [
        ['subscribe', {}],
        ['subscribe', 'all'],
        ['subscribe', { all: true }],
        ['subscribe', { state: 'VIC' }],
        ['subscribe', { agencies: ['CFA','FRV','SES'] }],
        ['join', 'all'],
        ['join', 'vic'],
        ['join', 'victoria'],
        ['join', 'messages'],
        ['register', {}],
        ['auth',  {}],
        ['init',  {}],
        ['start', {}],
        ['listen', 'all'],
        ['filter', { state: 'VIC' }],
      ];

      patterns.forEach(([event, data], i) => {
        setTimeout(() => {
          socket.emit(event, data);
          result.subscriptions.push({ t: new Date().toISOString(), event, data });
        }, 500 + i * 2000);
      });
    });

    socket.on('connect_error', e => {
      result.socketio = { connected: false, error: e.message };
    });

    // Capture ANY server-sent event — this catches the namespace connect ack data too
    socket.onAny((ev, ...args) => {
      result.allEvents.push({ event: ev, t: new Date().toISOString(), data: JSON.stringify(args).slice(0, 300) });
      if (ev === 'message:new') {
        result.messages.push({ data: JSON.stringify(args[0]).slice(0, 500) });
      }
    });

    // 60s total window
    setTimeout(() => {
      socket.disconnect();
      if (!result.socketio) result.socketio = { connected: false, timeout: true };
      resolve();
    }, 60000);
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result, null, 2),
  };
};
