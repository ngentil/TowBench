// On-demand diagnostic — GET /.netlify/functions/test-vicpagers
// Authenticates with session cookie, waits 60s, logs all events.
const { io } = require('socket.io-client');

exports.handler = async function () {
  const result = {
    timestamp:   new Date().toISOString(),
    cookieSet:   !!process.env.VICPAGERS_COOKIE,
    polling:     null,
    socketio:    null,
    allEvents:   [],
    messages:    [],
  };

  // Confirm polling endpoint is reachable
  try {
    const r = await fetch('https://vicpagers.net.au/socket.io/?EIO=4&transport=polling', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Cookie: process.env.VICPAGERS_COOKIE || '',
        Origin: 'https://vicpagers.net.au',
      },
      signal: AbortSignal.timeout(5000),
    });
    result.polling = { status: r.status, body: (await r.text()).slice(0, 200) };
  } catch (e) {
    result.polling = { error: e.message };
  }

  // Socket.IO — polling first then WebSocket, with session cookie
  await new Promise(resolve => {
    const socket = io('https://vicpagers.net.au', {
      transports: ['polling', 'websocket'],
      extraHeaders: {
        Origin:       'https://vicpagers.net.au',
        Cookie:       process.env.VICPAGERS_COOKIE || '',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    socket.on('connect',       () => { result.socketio = { connected: true, id: socket.id }; });
    socket.on('connect_error', e  => { result.socketio = { connected: false, error: e.message }; });

    socket.onAny((ev, ...args) => {
      result.allEvents.push({ event: ev, t: new Date().toISOString() });
      if (ev === 'message:new') result.messages.push(JSON.stringify(args[0]).slice(0, 500));
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
