// On-demand diagnostic — GET /.netlify/functions/test-vicpagers
// Step 1: fetch homepage to capture session cookies
// Step 2: connect Socket.IO with those cookies + Origin spoofed
// Step 3: wait 60s, log every event
const { io } = require('socket.io-client');

exports.handler = async function () {
  const result = {
    timestamp:  new Date().toISOString(),
    homepage:   null,   // homepage fetch result + cookies
    polling:    null,
    socketio:   null,
    allEvents:  [],
    messages:   [],
  };

  // Step 1: fetch homepage — server may set a session cookie
  let sessionCookies = '';
  try {
    const r = await fetch('https://vicpagers.net.au/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    const setCookie = r.headers.get('set-cookie') || '';
    // Pull out all name=value pairs, join for Cookie header
    sessionCookies = setCookie
      .split(/,(?=[^;]+=[^;]+)/)
      .map(c => c.trim().split(';')[0])
      .filter(Boolean)
      .join('; ');
    const body = (await r.text()).slice(0, 500);
    result.homepage = { status: r.status, setCookie, parsedCookies: sessionCookies, bodySnippet: body };
  } catch (e) {
    result.homepage = { error: e.message };
  }

  // Step 2: confirm polling endpoint is reachable
  try {
    const r = await fetch('https://vicpagers.net.au/socket.io/?EIO=4&transport=polling', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(5000),
    });
    result.polling = { status: r.status, body: (await r.text()).slice(0, 200) };
  } catch (e) {
    result.polling = { error: e.message };
  }

  // Step 3: Socket.IO with correct origin + any session cookies
  await new Promise(resolve => {
    const headers = {
      Origin: 'https://vicpagers.net.au',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    };
    if (sessionCookies) headers.Cookie = sessionCookies;

    const socket = io('https://vicpagers.net.au', {
      transports: ['websocket'],
      extraHeaders: headers,
      timeout: 10000,
    });

    socket.on('connect', () => {
      result.socketio = { connected: true, id: socket.id, cookiesSent: !!sessionCookies };
    });
    socket.on('connect_error', e => {
      result.socketio = { connected: false, error: e.message };
    });
    socket.onAny((ev, ...args) => {
      result.allEvents.push({ event: ev, t: new Date().toISOString() });
      if (ev === 'message:new') {
        result.messages.push(JSON.stringify(args[0]).slice(0, 500));
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
