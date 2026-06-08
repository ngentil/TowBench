// On-demand diagnostic — GET /.netlify/functions/test-vicpagers
// Connects without a session cookie — subscribe events alone unlock the feed.
// Waits 20s and logs all received events.
const { io } = require('socket.io-client');

exports.handler = async function () {
  const result = {
    timestamp:   new Date().toISOString(),
    polling:     null,
    socketio:    null,
    allEvents:   [],
    messages:    [],
  };

  // Confirm polling endpoint is reachable
  try {
    const r = await fetch('https://vicpagers.net.au/socket.io/?EIO=4&transport=polling', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    result.polling = { status: r.status, body: (await r.text()).slice(0, 200) };
  } catch (e) {
    result.polling = { error: e.message };
  }

  // No cookie needed — CFA/FRV/SES subscribe events are sufficient
  await new Promise(resolve => {
    const socket = io('https://vicpagers.net.au', {
      transports: ['polling', 'websocket'],
      timeout: 10000,
    });

    socket.on('connect', () => {
      result.socketio = { connected: true, id: socket.id };
      socket.emit('subscribe', { radio: [] });
      socket.emit('subscribe', { agencies: ['CFA', 'FRV', 'SES'] });
    });
    socket.on('connect_error', e  => { result.socketio = { connected: false, error: e.message }; });

    socket.onAny((ev, ...args) => {
      result.allEvents.push({ event: ev, t: new Date().toISOString() });
      if (ev === 'message:new') result.messages.push(JSON.stringify(args[0]).slice(0, 500));
    });

    setTimeout(() => {
      socket.disconnect();
      if (!result.socketio) result.socketio = { connected: false, timeout: true };
      resolve();
    }, 20000);
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result, null, 2),
  };
};
