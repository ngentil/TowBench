// Netlify scheduled function — runs every 1 minute.
// Connects to VicPagers Socket.IO, emits subscribe events, collects 55s of
// messages, upserts to Supabase vicpagers_messages.
// No session cookie required — subscribe events alone unlock the feed.
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
const { createClient } = require('@supabase/supabase-js');
const { io }           = require('socket.io-client');

exports.handler = async function () {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  return new Promise((resolve) => {
    const messages = [];
    let connected  = false;

    const socket = io('https://vicpagers.net.au', {
      transports: ['polling', 'websocket'],
    });

    const finish = async () => {
      socket.disconnect();
      if (!messages.length) return resolve({ statusCode: 200, body: `quiet (connected=${connected})` });

      const rows = messages.map(msg => ({
        id:                      msg.id,
        timestamp:               msg.timestamp ?? null,
        message:                 msg.message ?? null,
        type:                    msg.type ?? null,
        agency:                  msg.agency ?? null,
        alias:                   msg.alias ?? null,
        address_capcode:         msg.address ?? null,
        incident_id:             msg.incident_id ?? null,
        source:                  msg.source ?? null,
        parsed_address:          msg.parsed?.address ?? null,
        parsed_event_type:       msg.parsed?.eventType ?? null,
        parsed_description:      msg.parsed?.description ?? null,
        parsed_map_ref:          msg.parsed?.mapRef ?? null,
        parsed_six_figure:       msg.parsed?.sixFigure ?? null,
        parsed_alarm_level:      msg.parsed?.alarmLevel ?? null,
        parsed_corner:           msg.parsed?.corner ?? null,
        parsed_message_category: msg.parsed?.messageCategory ?? null,
        parsed_is_cancellation:  msg.parsed?.isCancellation ?? false,
        raw_parsed:              msg.parsed ?? null,
      }));

      const { error } = await supabase
        .from('vicpagers_messages')
        .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });

      resolve({
        statusCode: error ? 500 : 200,
        body: error ? error.message : `upserted ${rows.length}`,
      });
    };

    setTimeout(finish, 55000);

    socket.on('connect', () => {
      connected = true;
      socket.emit('subscribe', { radio: [] });
      socket.emit('subscribe', { agencies: ['CFA', 'FRV', 'SES'] });
    });
    socket.on('connect_error', (e) => {
      socket.disconnect();
      resolve({ statusCode: 502, body: e.message });
    });
    socket.on('message:new', (msg) => {
      if (msg.type !== 'administrative' && msg.id != null) messages.push(msg);
    });
  });
};
