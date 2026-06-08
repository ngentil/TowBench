// On-demand diagnostic — GET /.netlify/functions/test-vicpagers
// Waits 60s and logs every event. Call this to confirm VicPagers is broadcasting.
const { io } = require('socket.io-client');

exports.handler = async function () {
  const result = {
    timestamp: new Date().toISOString(),
    polling: null,
    socketio: null,
    allEvents: [],
    messages: [],
  };

  // Test 1: HTTP polling (confirm Netlify IP is allowed)
  try {
    const r = await fetch('https://vicpagers.net.au/socket.io/?EIO=4&transport=polling', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(5000),
    });
    const text = await r.text();
    result.polling = { status: r.status, body: text.slice(0, 300) };
  } catch (e) {
    result.polling = { error: e.message };
  }

  // Test 2: Socket.IO — 60s with polling+websocket transport
  await new Promise(resolve => {
    const socket = io('https://vicpagers.net.au', {
      transports: ['polling', 'websocket'],
      timeout: 10000,
    });

    socket.on('connect', () => {
      result.socketio = { connected: true, id: socket.id };
    });

    socket.on('connect_error', e => {
      result.socketio = { connected: false, error: e.message };
    });

    // Catch every server event including non-message:new ones
    socket.onAny((ev, data) => {
      result.allEvents.push({ event: ev, t: new Date().toISOString() });
      if (ev === 'message:new') {
        result.messages.push({ data: JSON.stringify(data).slice(0, 400) });
      }
    });

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
