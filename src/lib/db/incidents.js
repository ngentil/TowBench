import { supabase } from '../supabase';

const DAYS_31 = 31 * 24 * 60 * 60 * 1000;

// ── VicEmergency ──────────────────────────────────────────────────────────────

export async function getRecentVicEmergency(days = 31) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('vicemergency_incidents')
    .select('*')
    .gte('received_at', since)
    .order('received_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ── VicPagers ────────────────────────────────────────────────────────────────

export async function logVicPagersMessage(msg) {
  const row = {
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
  };
  const { error } = await supabase
    .from('vicpagers_messages')
    .upsert(row, { onConflict: 'id', ignoreDuplicates: true });
  if (error) console.warn('logVicPagersMessage:', error.message);
}

export async function getRecentVicPagers(days = 31) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('vicpagers_messages')
    .select('*')
    .gte('received_at', since)
    .neq('type', 'administrative')
    .order('received_at', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return data || [];
}

// Convert a DB row back to the shape useVicPagers / mergeMessage expect
export function dbRowToMessage(row) {
  return {
    id:          row.id,
    timestamp:   row.timestamp ?? Date.parse(row.received_at),
    message:     row.message,
    type:        row.type,
    agency:      row.agency,
    alias:       row.alias,
    incident_id: row.incident_id,
    parsed: {
      address:         row.parsed_address,
      eventType:       row.parsed_event_type,
      description:     row.parsed_description,
      mapRef:          row.parsed_map_ref,
      sixFigure:       row.parsed_six_figure,
      alarmLevel:      row.parsed_alarm_level,
      corner:          row.parsed_corner,
      messageCategory: row.parsed_message_category,
      isCancellation:  row.parsed_is_cancellation,
    },
  };
}
