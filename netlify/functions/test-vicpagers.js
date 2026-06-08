// On-demand diagnostic — call /.netlify/functions/test-vicpagers to check if
// Netlify can reach VicPagers and what Socket.IO delivers within 10 seconds.
const { io } = require('socket.io-client');

exports.handler = async function () {
  const result = {
    timestamp: new Date().toISOString(),
    polling: null,
    socketio: null,
    messages: [],
  };

  // Test 1: HTTP polling endpoint (reveals if IP is blocked)
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

  // Test 2: Socket.IO WebSocket — listen for 9s
  await new Promise(resolve => {
    let connected = false;
    const socket = io('wss://vicpagers.net.au', {
      transports: ['websocket'],
      timeout: 5000,
    });

    socket.on('connect', () => {
      connected = true;
      result.socketio = { connected: true, id: socket.id };
    });
    socket.on('connect_error', e => {
      result.socketio = { connected: false, error: e.message };
    });
    socket.onAny((ev, data) => {
      result.messages.push({ event: ev, data: JSON.stringify(data).slice(0, 200) });
    });

    setTimeout(() => {
      socket.disconnect();
      if (!result.socketio) result.socketio = { connected, timeout: true };
      resolve();
    }, 9000);
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result, null, 2),
  };
};
