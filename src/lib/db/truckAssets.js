import { supabase } from '../supabase';

// ── Tools catalogue ───────────────────────────────────────────────────────────

export async function getTools() {
  const { data, error } = await supabase.from('truck_tools').select('*').order('name');
  if (error) throw error;
  return data || [];
}

export async function upsertTool(tool) {
  const { data, error } = await supabase
    .from('truck_tools')
    .upsert(tool, { onConflict: 'id' })
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
  const { data, error } = await supabase
    .from('truck_equipment')
    .upsert(eq, { onConflict: 'id' })
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
  const { data, error } = await supabase
    .from('truck_consumables')
    .upsert(c, { onConflict: 'id' })
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
