-- Comprehensive per-user metrics view for rvro.org
-- Query via service role key: SELECT * FROM user_metrics ORDER BY total_revenue DESC;

CREATE OR REPLACE VIEW user_metrics AS
WITH jobs AS (
  SELECT
    user_id,
    COUNT(*)                                                          AS job_count,
    COUNT(*) FILTER (WHERE status = 'completed')                     AS jobs_completed,
    COUNT(*) FILTER (WHERE status = 'in_progress')                   AS jobs_active,
    COUNT(*) FILTER (WHERE status = 'cancelled')                     AS jobs_cancelled,
    COALESCE(SUM(tow_fee) FILTER (WHERE status = 'completed'), 0)   AS job_revenue,
    COALESCE(SUM(tow_fee) FILTER (
      WHERE status = 'completed'
        AND dispatched_at >= date_trunc('month', now())
    ), 0)                                                             AS revenue_this_month,
    COALESCE(SUM(tow_fee) FILTER (
      WHERE status = 'completed'
        AND dispatched_at >= date_trunc('week', now())
    ), 0)                                                             AS revenue_this_week,
    COALESCE(SUM(distance_km), 0)                                    AS total_distance_km,
    ROUND(AVG(distance_km)::numeric, 2)                              AS avg_distance_km,
    -- Avg response time: dispatch → arrived at pickup
    ROUND(AVG(
      EXTRACT(EPOCH FROM (arrived_pickup_at - dispatched_at)) / 60
    ) FILTER (WHERE arrived_pickup_at IS NOT NULL)::numeric, 1)      AS avg_response_min,
    -- Avg total job time: dispatch → arrived at dropoff
    ROUND(AVG(
      EXTRACT(EPOCH FROM (arrived_dropoff_at - dispatched_at)) / 60
    ) FILTER (WHERE arrived_dropoff_at IS NOT NULL)::numeric, 1)     AS avg_job_duration_min,
    -- Geographic bounding box of all pickup locations
    MIN(pickup_lat)   AS area_lat_min,
    MAX(pickup_lat)   AS area_lat_max,
    MIN(pickup_lng)   AS area_lng_min,
    MAX(pickup_lng)   AS area_lng_max,
    MAX(dispatched_at)                                               AS last_job_at,
    -- Most common tow type
    MODE() WITHIN GROUP (ORDER BY tow_type)                          AS most_common_tow_type
  FROM dispatched_jobs
  GROUP BY user_id
),
ins AS (
  SELECT
    ti.user_id,
    COUNT(*)                                                          AS tow_in_count,
    COUNT(*) FILTER (WHERE ti.date_out IS NULL AND NOT COALESCE(ti.cancelled, false)) AS in_storage_count,
    COUNT(*) FILTER (WHERE ti.stolen)                                AS stolen_count,
    COUNT(*) FILTER (WHERE ti.impound)                               AS impound_count,
    COALESCE(SUM(ti.tow_fee), 0)                                    AS tow_in_revenue,
    COALESCE(SUM(ti.distance_km), 0)                                AS tow_in_distance_km,
    -- Accrued storage revenue: vehicles still in × days × daily rate
    COALESCE(SUM(
      CASE
        WHEN ti.date_out IS NULL
         AND NOT COALESCE(ti.cancelled, false)
         AND st.daily_rate > 0
        THEN GREATEST(1, EXTRACT(DAY FROM now() - ti.date_in)::int) * st.daily_rate
      END
    ), 0)                                                             AS storage_revenue_accrued
  FROM tow_ins ti
  LEFT JOIN storage_types st ON st.id = ti.storage_type_id
  GROUP BY ti.user_id
),
allocs AS (
  SELECT
    user_id,
    COUNT(*)                                                          AS allocation_count,
    COUNT(*) FILTER (WHERE cleared_at IS NULL)                       AS allocations_active,
    MAX(last_seen)                                                    AS last_allocation_seen,
    MIN(first_seen)                                                   AS first_allocation_seen,
    -- Avg on-scene duration (capped at 24h to exclude outliers)
    ROUND(AVG(
      EXTRACT(EPOCH FROM (cleared_at - first_seen)) / 60
    ) FILTER (
      WHERE cleared_at IS NOT NULL
        AND EXTRACT(EPOCH FROM (cleared_at - first_seen)) / 60 BETWEEN 1 AND 1440
    )::numeric, 0)                                                    AS avg_allocation_duration_min,
    COUNT(DISTINCT suburb)                                            AS unique_suburbs,
    -- Most active suburb
    MODE() WITHIN GROUP (ORDER BY suburb)                            AS top_suburb
  FROM tow_allocation_log
  GROUP BY user_id
)
SELECT
  -- Identity
  up.id                                                               AS user_id,
  up.email,
  up.first_name,
  up.last_name,
  up.company_name,
  up.plate,
  up.da_number,
  up.state,
  up.role,
  up.onboarded_at,
  up.created_at                                                       AS account_created_at,

  -- Fleet
  (SELECT COUNT(*) FROM tow_trucks WHERE user_id = up.id)           AS truck_count,
  (SELECT COUNT(*) FROM depots      WHERE user_id = up.id)           AS depot_count,

  -- ── Revenue ──────────────────────────────────────────────────────
  ROUND((COALESCE(j.job_revenue,     0)
       + COALESCE(i.tow_in_revenue,  0))::numeric, 2)               AS total_revenue,
  ROUND(COALESCE(j.job_revenue,      0)::numeric, 2)                AS job_revenue,
  ROUND(COALESCE(i.tow_in_revenue,   0)::numeric, 2)                AS tow_in_revenue,
  ROUND(COALESCE(i.storage_revenue_accrued, 0)::numeric, 2)         AS storage_revenue_accrued,
  ROUND((COALESCE(j.job_revenue, 0)
       + COALESCE(i.tow_in_revenue, 0))::numeric, 2)               AS total_revenue_all_time,
  ROUND(COALESCE(j.revenue_this_month, 0)::numeric, 2)              AS revenue_this_month,
  ROUND(COALESCE(j.revenue_this_week,  0)::numeric, 2)              AS revenue_this_week,

  -- ── Jobs ─────────────────────────────────────────────────────────
  COALESCE(j.job_count,        0)                                    AS job_count,
  COALESCE(j.jobs_completed,   0)                                    AS jobs_completed,
  COALESCE(j.jobs_active,      0)                                    AS jobs_active,
  COALESCE(j.jobs_cancelled,   0)                                    AS jobs_cancelled,
  j.last_job_at,
  j.most_common_tow_type,

  -- ── Distance ─────────────────────────────────────────────────────
  ROUND((COALESCE(j.total_distance_km, 0)
       + COALESCE(i.tow_in_distance_km, 0))::numeric, 1)            AS total_distance_km,
  ROUND(COALESCE(j.avg_distance_km, 0)::numeric, 1)                 AS avg_distance_km,

  -- ── Efficiency ───────────────────────────────────────────────────
  j.avg_response_min,
  j.avg_job_duration_min,

  -- ── Geographic coverage ──────────────────────────────────────────
  -- Bounding box corners
  j.area_lat_min, j.area_lat_max,
  j.area_lng_min, j.area_lng_max,
  -- Approximate operational area in km² from bounding box
  ROUND(CASE WHEN j.area_lat_min IS NOT NULL THEN
    ABS(j.area_lat_max - j.area_lat_min) * 111.0
    * ABS(j.area_lng_max - j.area_lng_min) * 111.0
    * COS(RADIANS((j.area_lat_min + j.area_lat_max) / 2.0))
  END::numeric, 1)                                                   AS operational_area_km2,

  -- ── Tow-ins & storage ────────────────────────────────────────────
  COALESCE(i.tow_in_count,    0)                                     AS tow_in_count,
  COALESCE(i.in_storage_count, 0)                                    AS vehicles_in_storage,
  COALESCE(i.stolen_count,    0)                                     AS stolen_count,
  COALESCE(i.impound_count,   0)                                     AS impound_count,

  -- ── Allocation monitoring (VicRoads feed) ────────────────────────
  COALESCE(a.allocation_count,    0)                                  AS allocation_count,
  COALESCE(a.allocations_active,  0)                                  AS allocations_active,
  a.last_allocation_seen,
  a.first_allocation_seen,
  a.avg_allocation_duration_min,
  COALESCE(a.unique_suburbs,      0)                                  AS unique_suburbs_monitored,
  a.top_suburb

FROM user_profiles up
LEFT JOIN jobs   j ON j.user_id = up.id
LEFT JOIN ins    i ON i.user_id = up.id
LEFT JOIN allocs a ON a.user_id = up.id;

-- Service role only — never exposed to app users
REVOKE SELECT ON user_metrics FROM anon, authenticated;
GRANT  SELECT ON user_metrics TO service_role;
