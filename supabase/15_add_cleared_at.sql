-- Track when allocations disappear from the VicRoads live feed
ALTER TABLE tow_allocation_log ADD COLUMN IF NOT EXISTS cleared_at timestamptz;

-- Allow authenticated users to update cleared_at (already covered by migration 14 policy,
-- but included here for clarity if policies are re-applied in isolation)
