// On-demand diagnostic — call /.netlify/functions/test-vicpagers
// Tests HTTP polling + Socket.IO from Netlify's IP (AWS Lambda).
// Waits 30s and tries a subscription emit to see if events unlock.
const { io } = require('socket.io-client');

exports.handler = async function () {
  const result = {
    timestamp: new Date().toISOString(),
    polling: null,
    socketio: null,
    allEvents: [],   // every event name seen, not just message:new
    messages: [],    // message:new payloads
  };

  // Test 1: HTTP polling (blocked from AWS IPs if host_not_allowed)
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

  // Test 2: Socket.IO — 30s window, try subscription emits on connect
  await new Promise(resolve => {
    const socket = io('wss://vicpagers.net.au', {
      transports: ['websocket'],
      timeout: 8000,
    });

    socket.on('connect', () => {
      result.socketio = { connected: true, id: socket.id };
      // Try common subscription patterns — harmless if not needed
      socket.emit('subscribe', {});
      socket.emit('subscribe', 'all');
      socket.emit('join', 'all');
      socket.emit('join', 'vic');
    });

    socket.on('connect_error', e => {
      result.socketio = { connected: false, error: e.message };
    });

    socket.onAny((ev, data) => {
      result.allEvents.push({ event: ev, t: new Date().toISOString() });
      if (ev === 'message:new') {
        result.messages.push({ data: JSON.stringify(data).slice(0, 300) });
      }
    });

    setTimeout(() => {
      socket.disconnect();
      if (!result.socketio) result.socketio = { connected: false, timeout: true };
      resolve();
    }, 30000);
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result, null, 2),
  };
};
