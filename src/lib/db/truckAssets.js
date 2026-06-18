import { supabase } from '../supabase';

// ── Tools catalogue ───────────────────────────────────────────────────────────

export async function getTools() {
  const { data, error } = await supabase.from('truck_tools').select('*').order('name');
  if (error) throw error;
  return data || [];
}

export async function upsertTool(tool) {
  const row = {
    name:             tool.name,
    brand:            tool.brand            || null,
    model:            tool.model            || null,
    category:         tool.category         || null,
    condition:        tool.condition        || 'Good',
    purchase_date:    tool.purchase_date    || null,
    purchase_price:   parseFloat(tool.purchase_price) || 0,
    warranty_expiry:  tool.warranty_expiry  || null,
    storage_location: tool.storage_location || null,
    serial_no:        tool.serial_no        || null,
    notes:            tool.notes            || null,
    photos:           tool.photos           || [],
  };
  if (tool.id) row.id = tool.id;
  const { data, error } = await supabase
    .from('truck_tools')
    .upsert(row, { onConflict: 'id' })
    .select().single();
  if (error) throw error;
  return data;
}

export async function deleteTool(id) {
  const { error } = await supabase.from('truck_tools').delete().eq('id', id);
  if (error) throw error;
}

// ── Equipment catalogue ───────────────────────────────────────────────────────

export async function getEquipment() {
  const { data, error } = await supabase.from('truck_equipment').select('*').order('name');
  if (error) throw error;
  return data || [];
}

export async function upsertEquipment(eq) {
  const row = {
    name:     eq.name,
    brand:    eq.brand    || null,
    model:    eq.model    || null,
    category: eq.category || null,
    serial_no:eq.serial_no|| null,
    status:   eq.status   || 'Active',
    year:     eq.year     ? parseInt(eq.year) : null,
    hours:    eq.hours    != null && eq.hours !== '' ? parseFloat(eq.hours) : null,
    location: eq.location || null,
    notes:    eq.notes    || null,
    photos:   eq.photos   || [],
  };
  if (eq.id) row.id = eq.id;
  const { data, error } = await supabase
    .from('truck_equipment')
    .upsert(row, { onConflict: 'id' })
    .select().single();
  if (error) throw error;
  return data;
}

export async function deleteEquipment(id) {
  const { error } = await supabase.from('truck_equipment').delete().eq('id', id);
  if (error) throw error;
}

// ── Consumables catalogue ─────────────────────────────────────────────────────

export async function getConsumables() {
  const { data, error } = await supabase.from('truck_consumables').select('*').order('name');
  if (error) throw error;
  return data || [];
}

export async function upsertConsumable(c) {
  const row = {
    name:     c.name,
    brand:    c.brand    || null,
    category: c.category || null,
    unit:     c.unit     || 'each',
    notes:    c.notes    || null,
    photos:   c.photos   || [],
  };
  if (c.id) row.id = c.id;
  const { data, error } = await supabase
    .from('truck_consumables')
    .upsert(row, { onConflict: 'id' })
    .select().single();
  if (error) throw error;
  return data;
}

export async function deleteConsumable(id) {
  const { error } = await supabase.from('truck_consumables').delete().eq('id', id);
  if (error) throw error;
}

// ── Assignments ───────────────────────────────────────────────────────────────

export async function getAssignments(truckId) {
  const { data, error } = await supabase
    .from('truck_asset_assignments')
    .select('*')
    .eq('truck_id', truckId)
    .order('asset_type')
    .order('asset_name');
  if (error) throw error;
  return data || [];
}

export async function assignAsset({ truckId, assetType, assetId, assetName, notes }) {
  const { data, error } = await supabase
    .from('truck_asset_assignments')
    .insert({ truck_id: truckId, asset_type: assetType, asset_id: assetId, asset_name: assetName, notes: notes || null })
    .select().single();
  if (error) throw error;
  return data;
}

export async function unassignAsset(assignmentId) {
  const { error } = await supabase.from('truck_asset_assignments').delete().eq('id', assignmentId);
  if (error) throw error;
}
