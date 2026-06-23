-- Stores validated (six_figure → lat/lng) calibration pairs
CREATE TABLE IF NOT EXISTS grid_calibration (
  id bigserial PRIMARY KEY,
  six_fig text NOT NULL,
  map_ref text,
  grid_x smallint NOT NULL,
  grid_y_raw smallint NOT NULL,  -- raw last-3-digits before unwrapping
  lat numeric(9,6) NOT NULL,
  lng numeric(9,6) NOT NULL,
  source_address text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(six_fig)
);
ALTER TABLE grid_calibration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read grid_calibration" ON grid_calibration FOR SELECT USING (true);
CREATE POLICY "service insert grid_calibration" ON grid_calibration FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service update grid_calibration" ON grid_calibration FOR UPDATE TO service_role USING (true);

-- Stores the current fitted transform coefficients (single row, id=1)
CREATE TABLE IF NOT EXISTS grid_transform (
  id int PRIMARY KEY DEFAULT 1,
  lat_a numeric(12,9),  -- intercept
  lat_b numeric(12,9),  -- coefficient for x
  lat_c numeric(12,9),  -- coefficient for y (unwrapped)
  lng_a numeric(12,9),
  lng_b numeric(12,9),
  lng_c numeric(12,9),
  n_pts int,
  rmse_km numeric(6,3),
  p90_km numeric(6,3),
  fitted_at timestamptz DEFAULT now()
);
ALTER TABLE grid_transform ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read grid_transform" ON grid_transform FOR SELECT USING (true);
CREATE POLICY "service upsert grid_transform" ON grid_transform FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed with current hardcoded coefficients as a starting point
INSERT INTO grid_transform (id, lat_a, lat_b, lat_c, lng_a, lng_b, lng_c, n_pts, rmse_km)
VALUES (1, -37.939185, -0.0000071, 0.0009726, 144.763386, 0.0009672, 0.0000420, 27, 2.96)
ON CONFLICT (id) DO NOTHING;
