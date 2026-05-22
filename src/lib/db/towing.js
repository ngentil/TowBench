import { supabase } from '../supabase';

// ── Depots ────────────────────────────────────────────────────────────────────────────────

export async function getDepots() {
  const { data, error } = await supabase
    .from('depots')
    .select('*')
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function upsertDepot(depot) {
  const now = new Date().toISOString();
  const isNew = !depot.id;
  const { data, error } = await supabase
    .from('depots')
    .upsert(
      { ...depot, ...(isNew ? { created_at: now } : {}) },
      { onConflict: 'id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDepot(id) {
  const { error } = await supabase.from('depots').delete().eq('id', id);
  if (error) throw error;
}

// ── Tow Trucks ─────────────────────────────────────────────────────────────────────────

export async function getTrucks() {
  const { data, error } = await supabase
    .from('tow_trucks')
    .select('*, depot:depots(id, name, suburb)')
    .order('plate');
  if (error) throw error;
  return data || [];
}

export async function upsertTruck(truck) {
  const now = new Date().toISOString();
  const isNew = !truck.id;
  const { depot, ...row } = truck; // strip joined relation before upsert
  const { data, error } = await supabase
    .from('tow_trucks')
    .upsert(
      { ...row, updated_at: now, ...(isNew ? { created_at: now } : {}) },
      { onConflict: 'id' }
    )
    .select('*, depot:depots(id, name, suburb)')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTruck(id) {
  const { error } = await supabase.from('tow_trucks').delete().eq('id', id);
  if (error) throw error;
}

// ── Allocation log ────────────────────────────────────────────────────────────────────────────

export async function logAllocations(features) {
  if (!features.length) return;
  const now = new Date().toISOString();
  // Dedupe by event_id — feed occasionally returns the same event twice
  const seen = new Set();
  const unique = features.filter(f => {
    const id = String(f.properties?.eventId);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const rows = unique.map(f => {
    const p = f.properties || {};
    return {
      event_id:         String(p.eventId),
      road_name:        p.closedRoadName || null,
      suburb:           p.reference?.startIntersectionLocality || null,
      status:           p.status || null,
      description:      p.description || null,
      data:             f,
      event_created_at: p.lastUpdated || p.created || null,
      last_seen:        now,
    };
  });
  const { error } = await supabase
    .from('tow_allocation_log')
    .upsert(rows, { onConflict: 'event_id', ignoreDuplicates: false });
  if (error) console.warn('logAllocations failed:', error.message);
}

export async function markAllocationsCleared(eventIds) {
  if (!eventIds.length) return;
  const { error } = await supabase
    .from('tow_allocation_log')
    .update({ cleared_at: new Date().toISOString() })
    .in('event_id', eventIds)
    .is('cleared_at', null);
  if (error) console.warn('markAllocationsCleared failed:', error.message);
}

export async function getAllocationsForAnalytics(days = 31) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('tow_allocation_log')
    .select('event_id, road_name, suburb, data, event_created_at, first_seen, last_seen, cleared_at')
    .gte('last_seen', since)
    .order('first_seen', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getRecentAllocations(hours = 744) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('tow_allocation_log')
    .select('*')
    .gte('last_seen', since)
    .order('last_seen', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({
    ...r.data,
    _logMeta: { firstSeen: r.first_seen, lastSeen: r.last_seen, clearedAt: r.cleared_at },
  }));
}
