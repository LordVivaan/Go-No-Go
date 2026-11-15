-- =============================================================================
-- GO / NO-GO (GNG) — Provisional Leaderboard Verification & RLS Hardening
-- Non-destructive migration:
--   1. Adds explicit verification_status ('PROVISIONAL' | 'VERIFIED' | 'UNVERIFIED')
--      to public.leaderboard_entries and defaults is_verified to false.
--   2. Ensures browser-submitted telemetry scores are always recorded as
--      PROVISIONAL (never auto-marked verified without authoritative replay).
--   3. Exposes isVerified & verificationStatus in get_mission_leaderboard RPC.
--   4. Hardens profiles update policy with explicit WITH CHECK (auth.uid() = id).
-- =============================================================================

-- 1. Harden profiles update policy
do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can update own profile'
  ) then
    drop policy "Users can update own profile" on public.profiles;
  end if;
end $$;

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 2. Add verification_status and default is_verified = false on leaderboard_entries
alter table public.leaderboard_entries
  add column if not exists verification_status text not null default 'PROVISIONAL';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leaderboard_entries_verification_status_check'
      and conrelid = 'public.leaderboard_entries'::regclass
  ) then
    alter table public.leaderboard_entries
      add constraint leaderboard_entries_verification_status_check
      check (verification_status in ('PROVISIONAL', 'VERIFIED', 'UNVERIFIED'));
  end if;
end $$;

alter table public.leaderboard_entries
  alter column is_verified set default false;

-- Downgrade any prior browser-submitted rows that were auto-marked true without server replay
update public.leaderboard_entries
set is_verified = false,
    verification_status = 'PROVISIONAL'
where is_verified = true
  and verification_status = 'PROVISIONAL';

create index if not exists idx_leaderboard_verification_status
  on public.leaderboard_entries (verification_status, mission_code, difficulty, season_code);

-- Re-affirm zero direct table access for browser roles
alter table public.leaderboard_entries enable row level security;
revoke all on table public.leaderboard_entries from anon, authenticated;

alter table public.leaderboard_submission_audit enable row level security;
revoke all on table public.leaderboard_submission_audit from anon, authenticated;

-- 3. Update submit_verified_mission_score to always enforce PROVISIONAL status
create or replace function public.submit_verified_mission_score(
  p_player_token text,
  p_player_alias text,
  p_country_code text default null,
  p_mission_code text default 'FLOODWATCH',
  p_difficulty text default 'STANDARD',
  p_season_code text default '2026-S1',
  p_configuration_name text default 'FLOODWATCH Spacecraft',
  p_telemetry jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_player_key text;
  v_clean_alias text;
  v_clean_config text;
  v_country text;
  v_mission text;
  v_difficulty text;
  v_season text;
  v_recent_count integer;
  v_overall_gate text;
  v_mass_status text;
  v_power_status text;
  v_prop_status text;
  v_budget_status text;
  v_thermal_status text;
  v_wet_mass numeric;
  v_max_bus_mass numeric;
  v_max_launch_mass numeric;
  v_total_spent numeric;
  v_budget_cap numeric;
  v_avg_flood_utility numeric;
  v_instrument_count integer;
  v_has_cloud boolean;
  v_has_night boolean;
  v_data_captured numeric;
  v_data_downlinked numeric;
  v_data_lost numeric;
  v_regions_mapped integer;
  v_regions_total integer;
  v_combined_rel numeric;
  v_final_health numeric;
  v_battery_exhausted boolean;
  v_link_margin numeric;
  v_net_backlog numeric;
  v_storage_cap numeric;
  v_odar_compliant boolean;
  v_anom_resolved integer;
  v_anom_total integer;
  v_duration_sec integer;
  v_seed bigint;
  v_config_sig text;
  v_claimed_score numeric;
  v_is_floodwatch boolean;
  v_is_lunar boolean;
  v_downlink_ratio numeric;
  v_region_ratio numeric;
  v_domain_bonus numeric;
  v_science_score numeric(4,1);
  v_rel_score numeric(4,1);
  v_eff_score numeric(4,1);
  v_req_link_margin numeric;
  v_link_ratio numeric;
  v_ssr_ratio numeric;
  v_overflow_penalty numeric;
  v_comms_score numeric(4,1);
  v_odar_pts numeric;
  v_unresolved integer;
  v_anom_pts numeric;
  v_thermal_pts numeric;
  v_risk_score numeric(4,1);
  v_raw_total numeric;
  v_science_unmet boolean;
  v_outcome text;
  v_final_total numeric(5,1);
  v_grade text;
  v_verification_hash text;
  v_existing record;
  v_entry_id uuid;
  v_best_score numeric(5,1);
  v_is_new_pb boolean := false;
begin
  -- Identify submitter via Supabase Auth UID if present, else hashed pseudonymous token
  if v_uid is not null then
    v_player_key := 'uid:' || encode(digest(v_uid::text, 'sha256'), 'hex');
  else
    if p_player_token is null or p_player_token !~ '^[A-Za-z0-9_-]{16,128}$' then
      return jsonb_build_object('ok', false, 'error', 'Invalid pseudonymous player session token.');
    end if;
    v_player_key := 'tok:' || encode(digest(p_player_token, 'sha256'), 'hex');
  end if;

  -- Validate & normalize public inputs
  v_clean_alias := trim(regexp_replace(regexp_replace(coalesce(p_player_alias, ''), '[<>&"'']', '', 'g'), '\s+', ' ', 'g'));
  if char_length(v_clean_alias) < 2 or char_length(v_clean_alias) > 24 then
    return jsonb_build_object('ok', false, 'error', 'Pilot callsign must be between 2 and 24 characters.');
  end if;

  v_clean_config := left(trim(regexp_replace(coalesce(p_configuration_name, 'FLOODWATCH Spacecraft'), '[<>&]', '', 'g')), 80);
  if char_length(v_clean_config) < 1 then
    v_clean_config := 'FLOODWATCH Spacecraft';
  end if;

  v_country := nullif(upper(trim(coalesce(p_country_code, ''))), '');
  if v_country is not null and not public.is_valid_iso_country_code(v_country) then
    return jsonb_build_object('ok', false, 'error', 'Country code must be a valid ISO-3166-1 alpha-2 code.');
  end if;

  v_mission := upper(trim(coalesce(p_mission_code, 'FLOODWATCH')));
  if v_mission not in (
    'FLOODWATCH',
    'LUNAR ICE MAPPER',
    'LUNAR SCOUT',
    'MARS OBSERVER',
    'MARS RELAY',
    'ASTEROID EXPLORER',
    'NEAR-EARTH ASTEROID'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Unsupported mission code for leaderboard.');
  end if;

  v_difficulty := upper(trim(coalesce(p_difficulty, 'STANDARD')));
  if v_difficulty not in ('STANDARD', 'HARD', 'EXPERT') then
    return jsonb_build_object('ok', false, 'error', 'Difficulty must be STANDARD, HARD, or EXPERT.');
  end if;

  v_season := upper(trim(coalesce(p_season_code, '2026-S1')));
  if v_season !~ '^[0-9]{4}-S[1-4]$' then
    return jsonb_build_object('ok', false, 'error', 'Invalid season code format.');
  end if;

  -- Sliding-window rate limit (max 8 submissions per 10 minutes per player key)
  select count(*) into v_recent_count
  from public.leaderboard_submission_audit
  where player_key = v_player_key
    and created_at > now() - interval '10 minutes';

  if v_recent_count >= 8 then
    return jsonb_build_object('ok', false, 'error', 'Rate limit exceeded. Wait a few minutes before submitting again.');
  end if;

  -- Extract and range-check mission telemetry payload
  v_overall_gate := upper(coalesce(p_telemetry->>'overallGateStatus', 'NO_GO'));
  v_mass_status := upper(coalesce(p_telemetry->>'massStatus', 'NO_GO'));
  v_power_status := upper(coalesce(p_telemetry->>'powerStatus', 'NO_GO'));
  v_prop_status := upper(coalesce(p_telemetry->>'propulsionStatus', 'NO_GO'));
  v_budget_status := upper(coalesce(p_telemetry->>'budgetStatus', 'NO_GO'));
  v_thermal_status := upper(coalesce(p_telemetry->>'thermalStatus', 'NO_GO'));

  if v_overall_gate not in ('GO', 'CAUTION', 'NO_GO')
     or v_mass_status not in ('GO', 'CAUTION', 'NO_GO')
     or v_power_status not in ('GO', 'CAUTION', 'NO_GO')
     or v_prop_status not in ('GO', 'CAUTION', 'NO_GO')
     or v_budget_status not in ('GO', 'CAUTION', 'NO_GO')
     or v_thermal_status not in ('GO', 'CAUTION', 'NO_GO') then
    return jsonb_build_object('ok', false, 'error', 'Invalid engineering gate status flags.');
  end if;

  v_wet_mass := coalesce((p_telemetry->>'wetMassKg')::numeric, 0);
  v_max_bus_mass := coalesce((p_telemetry->>'maxBusMassKg')::numeric, 0);
  v_max_launch_mass := coalesce((p_telemetry->>'maxLaunchMassKg')::numeric, 0);
  v_total_spent := coalesce((p_telemetry->>'totalSpentMusd')::numeric, 0);
  v_budget_cap := coalesce((p_telemetry->>'budgetCapMusd')::numeric, 0);
  v_avg_flood_utility := least(1.0, greatest(0.0, coalesce((p_telemetry->>'avgFloodUtility')::numeric, 0)));
  v_instrument_count := coalesce((p_telemetry->>'instrumentCount')::integer, 0);
  v_has_cloud := coalesce((p_telemetry->>'hasCloudPenetrating')::boolean, false);
  v_has_night := coalesce((p_telemetry->>'hasNightCapable')::boolean, false);
  v_data_captured := greatest(0.0, coalesce((p_telemetry->>'totalDataCapturedGb')::numeric, 0));
  v_data_downlinked := greatest(0.0, coalesce((p_telemetry->>'totalDataDownlinkedGb')::numeric, 0));
  v_data_lost := greatest(0.0, coalesce((p_telemetry->>'totalDataLostGb')::numeric, 0));
  v_regions_mapped := greatest(0, coalesce((p_telemetry->>'floodRegionsMappedCount')::integer, 0));
  v_regions_total := greatest(0, coalesce((p_telemetry->>'targetRegionsTotalCount')::integer, 0));
  v_combined_rel := least(1.0, greatest(0.0, coalesce((p_telemetry->>'combinedMissionReliability')::numeric, 0)));
  v_final_health := coalesce((p_telemetry->>'finalSystemHealthPct')::numeric, 0);
  v_battery_exhausted := coalesce((p_telemetry->>'batteryExhausted')::boolean, false);
  v_link_margin := coalesce((p_telemetry->>'linkMarginDb')::numeric, -99);
  v_net_backlog := coalesce((p_telemetry->>'netDataBacklogPerDayGb')::numeric, 0);
  v_storage_cap := greatest(0.1, coalesce((p_telemetry->>'storageCapacityGb')::numeric, 1));
  v_odar_compliant := coalesce((p_telemetry->>'odarCompliant')::boolean, false);
  v_anom_resolved := greatest(0, coalesce((p_telemetry->>'anomaliesResolvedCount')::integer, 0));
  v_anom_total := greatest(0, coalesce((p_telemetry->>'anomaliesTotalCount')::integer, 0));
  v_duration_sec := coalesce((p_telemetry->>'completionDurationSec')::integer, 0);
  v_seed := coalesce((p_telemetry->>'seed')::bigint, 20261114);
  v_config_sig := left(coalesce(p_telemetry->>'configSignature', 'unknown'), 160);
  v_claimed_score := coalesce((p_telemetry->>'claimedTotalScore')::numeric, -1);

  -- Enforce mission eligibility and physical consistency bounds
  if v_overall_gate = 'NO_GO' or v_battery_exhausted or v_final_health <= 0 then
    insert into public.leaderboard_submission_audit (player_key, mission_code, difficulty, accepted, claimed_score, rejection_reason)
    values (v_player_key, v_mission, v_difficulty, false, v_claimed_score, 'NO_GO or Mission Loss runs are ineligible for leaderboard.');
    return jsonb_build_object('ok', false, 'error', 'Only launched flights without mission loss (SUCCESS / PARTIAL_SUCCESS) qualify.');
  end if;

  if v_instrument_count < 1 or v_instrument_count > 6
     or v_wet_mass <= 0 or v_wet_mass > v_max_launch_mass or v_wet_mass > v_max_bus_mass * 1.15
     or v_total_spent <= 0 or v_total_spent > v_budget_cap * 1.15
     or v_data_downlinked > v_data_captured * 1.05 + 0.1
     or (v_regions_total > 0 and v_regions_mapped > v_regions_total)
     or v_anom_resolved > v_anom_total
     or v_duration_sec < 60 or v_duration_sec > 31536000 then
    insert into public.leaderboard_submission_audit (player_key, mission_code, difficulty, accepted, claimed_score, rejection_reason)
    values (v_player_key, v_mission, v_difficulty, false, v_claimed_score, 'Telemetry failed physical consistency validation.');
    return jsonb_build_object('ok', false, 'error', 'Telemetry payload failed server physical plausibility validation.');
  end if;

  -- Server-side score recomputation mirroring src/engine/scoring.ts (35/25/15/15/10)
  v_is_floodwatch := (v_mission = 'FLOODWATCH');
  v_is_lunar := (v_mission in ('LUNAR ICE MAPPER', 'LUNAR SCOUT'));

  v_downlink_ratio := case when v_data_captured > 0 then least(1.0, v_data_downlinked / v_data_captured) else 0.0 end;
  v_region_ratio := case when v_regions_total > 0 then least(1.0, v_regions_mapped::numeric / v_regions_total::numeric) else 1.0 end;
  v_domain_bonus := case
    when v_is_floodwatch then (case when v_has_cloud then 8 else 2 end)
    when v_is_lunar then (case when v_has_night then 8 else 2 end)
    when v_instrument_count >= 2 then 8
    else 5
  end;

  v_science_score := round(least(35.0, greatest(0.0,
    v_avg_flood_utility * 17.0 + v_domain_bonus + v_downlink_ratio * 5.0 + v_region_ratio * 5.0
  )), 1);

  v_rel_score := round(least(25.0, greatest(0.0,
    v_combined_rel * 14.0
    + least(1.0, greatest(0.0, v_final_health / 100.0)) * 7.0
    + (case when v_overall_gate = 'GO' then 4 else 2 end)
  )), 1);

  v_eff_score := round(least(15.0,
    ((case v_mass_status when 'GO' then 1.0 when 'CAUTION' then 0.6 else 0.15 end)
    + (case v_power_status when 'GO' then 1.0 when 'CAUTION' then 0.6 else 0.15 end)
    + (case v_prop_status when 'GO' then 1.0 when 'CAUTION' then 0.6 else 0.15 end)
    + (case v_budget_status when 'GO' then 1.0 when 'CAUTION' then 0.6 else 0.15 end)) * 3.75
  ), 1);

  v_req_link_margin := case v_difficulty
    when 'STANDARD' then 3.0
    when 'HARD' then 4.5
    else 6.0
  end;

  v_link_ratio := case
    when v_link_margin >= v_req_link_margin then 1.0
    when v_link_margin >= 0 then 0.6
    else 0.1
  end;

  v_ssr_ratio := case
    when v_net_backlog <= 0 then 1.0
    when v_net_backlog < v_storage_cap * 0.5 then 0.5
    else 0.15
  end;

  v_overflow_penalty := case when v_data_lost > 0 then least(3.0, v_data_lost * 0.1) else 0.0 end;
  v_comms_score := round(greatest(0.0, least(15.0,
    v_link_ratio * 6.0 + v_ssr_ratio * 5.0 + v_downlink_ratio * 4.0 - v_overflow_penalty
  )), 1);

  v_odar_pts := case when v_odar_compliant then 4.0 else 0.0 end;
  v_unresolved := greatest(0, v_anom_total - v_anom_resolved);
  v_anom_pts := case
    when v_anom_total = 0 then 4.0
    else greatest(0.0, 4.0 * (v_anom_resolved::numeric / v_anom_total::numeric) - v_unresolved * 0.5)
  end;
  v_thermal_pts := (case v_thermal_status when 'GO' then 1.0 when 'CAUTION' then 0.6 else 0.15 end) * 2.0;
  v_risk_score := round(least(10.0, greatest(0.0, v_odar_pts + v_anom_pts + v_thermal_pts)), 1);

  v_raw_total := v_science_score + v_rel_score + v_eff_score + v_comms_score + v_risk_score;

  if v_raw_total < 50 then
    insert into public.leaderboard_submission_audit (player_key, mission_code, difficulty, accepted, claimed_score, verified_score, rejection_reason)
    values (v_player_key, v_mission, v_difficulty, false, v_claimed_score, least(40.0, round(v_raw_total, 1)), 'Score below minimum orbital mission success floor.');
    return jsonb_build_object('ok', false, 'error', 'Mission score below minimum threshold (< 50 pts).');
  end if;

  v_science_unmet := (v_is_floodwatch and not v_has_cloud) or (v_is_lunar and not v_has_night);
  if v_overall_gate = 'CAUTION' or v_raw_total < 78 or v_science_unmet then
    v_outcome := 'PARTIAL_SUCCESS';
    v_final_total := round(least(v_raw_total, 74.0), 1);
  else
    v_outcome := 'SUCCESS';
    v_final_total := round(least(100.0, v_raw_total), 1);
  end if;

  -- Reject client claim tampering beyond normal 1-pt rounding drift
  if abs(v_claimed_score - v_final_total) > 1.0 then
    insert into public.leaderboard_submission_audit (player_key, mission_code, difficulty, accepted, claimed_score, verified_score, rejection_reason)
    values (v_player_key, v_mission, v_difficulty, false, v_claimed_score, v_final_total, 'Claimed score did not match server recomputation.');
    return jsonb_build_object('ok', false, 'error', 'Claimed score rejected by server recomputation.');
  end if;

  v_grade := case
    when v_final_total >= 89 and v_overall_gate = 'GO' then 'S'
    when v_final_total >= 78 then 'A'
    when v_final_total >= 66 then 'B'
    when v_final_total >= 54 then 'C'
    when v_final_total >= 42 then 'D'
    else 'F'
  end;

  v_verification_hash := encode(digest(
    v_player_key || '|' || v_mission || '|' || v_difficulty || '|' || v_season || '|' ||
    v_final_total::text || '|' || v_config_sig || '|' || v_seed::text,
    'sha256'
  ), 'hex');

  select id, total_score, completion_duration_sec
  into v_existing
  from public.leaderboard_entries
  where player_key = v_player_key
    and mission_code = v_mission
    and difficulty = v_difficulty
    and season_code = v_season;

  -- Note: Browser-submitted telemetry cannot be independently replayed server-side;
  -- entries are always recorded as PROVISIONAL (is_verified = false) regardless of client payload.
  if not found then
    insert into public.leaderboard_entries (
      user_id, player_key, player_alias, country_code, mission_code, difficulty,
      season_code, configuration_name, total_score, science_score, reliability_score,
      efficiency_score, comms_score, risk_collab_score, grade, outcome,
      completion_duration_sec, data_downlinked_gb, regions_mapped_count,
      seed, config_signature, verification_hash, is_verified, verification_status
    ) values (
      v_uid, v_player_key, v_clean_alias, v_country, v_mission, v_difficulty,
      v_season, v_clean_config, v_final_total, v_science_score, v_rel_score,
      v_eff_score, v_comms_score, v_risk_score, v_grade, v_outcome,
      v_duration_sec, round(v_data_downlinked, 2), v_regions_mapped,
      v_seed, v_config_sig, v_verification_hash, false, 'PROVISIONAL'
    )
    returning id, total_score into v_entry_id, v_best_score;
    v_is_new_pb := true;
  elsif v_final_total > v_existing.total_score
     or (v_final_total = v_existing.total_score and v_duration_sec < v_existing.completion_duration_sec) then
    update public.leaderboard_entries
    set
      player_alias = v_clean_alias,
      country_code = coalesce(v_country, country_code),
      configuration_name = v_clean_config,
      total_score = v_final_total,
      science_score = v_science_score,
      reliability_score = v_rel_score,
      efficiency_score = v_eff_score,
      comms_score = v_comms_score,
      risk_collab_score = v_risk_score,
      grade = v_grade,
      outcome = v_outcome,
      completion_duration_sec = v_duration_sec,
      data_downlinked_gb = round(v_data_downlinked, 2),
      regions_mapped_count = v_regions_mapped,
      seed = v_seed,
      config_signature = v_config_sig,
      verification_hash = v_verification_hash,
      is_verified = false,
      verification_status = 'PROVISIONAL',
      achieved_at = now(),
      updated_at = now()
    where id = v_existing.id
    returning id, total_score into v_entry_id, v_best_score;
    v_is_new_pb := true;
  else
    -- Keep existing higher personal best; allow updating display alias/country only
    update public.leaderboard_entries
    set
      player_alias = v_clean_alias,
      country_code = coalesce(v_country, country_code),
      updated_at = now()
    where id = v_existing.id
    returning id, total_score into v_entry_id, v_best_score;
    v_is_new_pb := false;
  end if;

  insert into public.leaderboard_submission_audit (
    player_key, mission_code, difficulty, accepted, claimed_score, verified_score
  ) values (
    v_player_key, v_mission, v_difficulty, true, v_claimed_score, v_final_total
  );

  return jsonb_build_object(
    'ok', true,
    'entryId', v_entry_id,
    'verifiedScore', v_final_total,
    'bestScore', v_best_score,
    'grade', v_grade,
    'outcome', v_outcome,
    'isNewPersonalBest', v_is_new_pb,
    'isVerified', false,
    'verificationStatus', 'PROVISIONAL'
  );
end;
$$;

-- 4. Update get_mission_leaderboard to expose isVerified & verificationStatus
create or replace function public.get_mission_leaderboard(
  p_mission_code text default 'FLOODWATCH',
  p_difficulty text default 'STANDARD',
  p_season_code text default '2026-S1',
  p_country_code text default null,
  p_player_token text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_player_key text := null;
  v_mission text := upper(trim(coalesce(p_mission_code, 'FLOODWATCH')));
  v_difficulty text := upper(trim(coalesce(p_difficulty, 'STANDARD')));
  v_season text := upper(trim(coalesce(p_season_code, '2026-S1')));
  v_country text := nullif(upper(trim(coalesce(p_country_code, ''))), '');
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 25)));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total_count integer := 0;
  v_entries jsonb := '[]'::jsonb;
  v_player_entry jsonb := null;
  v_nearby_entries jsonb := '[]'::jsonb;
  v_player_rank bigint := null;
begin
  if v_uid is not null then
    v_player_key := 'uid:' || encode(digest(v_uid::text, 'sha256'), 'hex');
  elsif p_player_token is not null and p_player_token ~ '^[A-Za-z0-9_-]{16,128}$' then
    v_player_key := 'tok:' || encode(digest(p_player_token, 'sha256'), 'hex');
  end if;

  if v_country is not null and not public.is_valid_iso_country_code(v_country) then
    return jsonb_build_object(
      'totalCount', 0,
      'entries', '[]'::jsonb,
      'playerEntry', null,
      'nearbyEntries', '[]'::jsonb
    );
  end if;

  with ranked as (
    select
      le.id,
      row_number() over (
        order by le.total_score desc, le.completion_duration_sec asc, le.achieved_at asc, le.id asc
      ) as rank,
      le.player_alias,
      le.country_code,
      le.mission_code,
      le.difficulty,
      le.season_code,
      le.configuration_name,
      le.total_score,
      le.science_score,
      le.reliability_score,
      le.efficiency_score,
      le.comms_score,
      le.risk_collab_score,
      le.grade,
      le.outcome,
      le.completion_duration_sec,
      le.data_downlinked_gb,
      le.regions_mapped_count,
      le.is_verified,
      le.verification_status,
      le.achieved_at,
      (v_player_key is not null and le.player_key = v_player_key) as is_current_player
    from public.leaderboard_entries le
    where le.mission_code = v_mission
      and le.difficulty = v_difficulty
      and (v_season = 'ALL_TIME' or le.season_code = v_season)
      and (v_country is null or le.country_code = v_country)
  ),
  paged as (
    select * from ranked
    order by rank asc
    limit v_limit
    offset v_offset
  )
  select
    (select count(*) from ranked),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'rank', p.rank,
          'playerAlias', p.player_alias,
          'countryCode', p.country_code,
          'missionCode', p.mission_code,
          'difficulty', p.difficulty,
          'seasonCode', p.season_code,
          'configurationName', p.configuration_name,
          'totalScore', p.total_score,
          'scienceScore', p.science_score,
          'reliabilityScore', p.reliability_score,
          'efficiencyScore', p.efficiency_score,
          'commsScore', p.comms_score,
          'riskCollabScore', p.risk_collab_score,
          'grade', p.grade,
          'outcome', p.outcome,
          'completionDurationSec', p.completion_duration_sec,
          'dataDownlinkedGb', p.data_downlinked_gb,
          'regionsMappedCount', p.regions_mapped_count,
          'isVerified', p.is_verified,
          'verificationStatus', p.verification_status,
          'achievedAtIso', p.achieved_at,
          'isCurrentPlayer', p.is_current_player
        )
        order by p.rank asc
      )
      from paged p
    ), '[]'::jsonb),
    (select rank from ranked where is_current_player limit 1),
    (
      select jsonb_build_object(
        'id', r.id,
        'rank', r.rank,
        'playerAlias', r.player_alias,
        'countryCode', r.country_code,
        'missionCode', r.mission_code,
        'difficulty', r.difficulty,
        'seasonCode', r.season_code,
        'configurationName', r.configuration_name,
        'totalScore', r.total_score,
        'scienceScore', r.science_score,
        'reliabilityScore', r.reliability_score,
        'efficiencyScore', r.efficiency_score,
        'commsScore', r.comms_score,
        'riskCollabScore', r.risk_collab_score,
        'grade', r.grade,
        'outcome', r.outcome,
        'completionDurationSec', r.completion_duration_sec,
        'dataDownlinkedGb', r.data_downlinked_gb,
        'regionsMappedCount', r.regions_mapped_count,
        'isVerified', r.is_verified,
        'verificationStatus', r.verification_status,
        'achievedAtIso', r.achieved_at,
        'isCurrentPlayer', r.is_current_player
      )
      from ranked r
      where r.is_current_player
      limit 1
    )
  into v_total_count, v_entries, v_player_rank, v_player_entry;

  if v_player_rank is not null then
    with ranked as (
      select
        le.id,
        row_number() over (
          order by le.total_score desc, le.completion_duration_sec asc, le.achieved_at asc, le.id asc
        ) as rank,
        le.player_alias,
        le.country_code,
        le.mission_code,
        le.difficulty,
        le.season_code,
        le.configuration_name,
        le.total_score,
        le.science_score,
        le.reliability_score,
        le.efficiency_score,
        le.comms_score,
        le.risk_collab_score,
        le.grade,
        le.outcome,
        le.completion_duration_sec,
        le.data_downlinked_gb,
        le.regions_mapped_count,
        le.is_verified,
        le.verification_status,
        le.achieved_at,
        (v_player_key is not null and le.player_key = v_player_key) as is_current_player
      from public.leaderboard_entries le
      where le.mission_code = v_mission
        and le.difficulty = v_difficulty
        and (v_season = 'ALL_TIME' or le.season_code = v_season)
        and (v_country is null or le.country_code = v_country)
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'rank', r.rank,
          'playerAlias', r.player_alias,
          'countryCode', r.country_code,
          'missionCode', r.mission_code,
          'difficulty', r.difficulty,
          'seasonCode', r.season_code,
          'configurationName', r.configuration_name,
          'totalScore', r.total_score,
          'scienceScore', r.science_score,
          'reliabilityScore', r.reliability_score,
          'efficiencyScore', r.efficiency_score,
          'commsScore', r.comms_score,
          'riskCollabScore', r.risk_collab_score,
          'grade', r.grade,
          'outcome', r.outcome,
          'completionDurationSec', r.completion_duration_sec,
          'dataDownlinkedGb', r.data_downlinked_gb,
          'regionsMappedCount', r.regions_mapped_count,
          'isVerified', r.is_verified,
          'verificationStatus', r.verification_status,
          'achievedAtIso', r.achieved_at,
          'isCurrentPlayer', r.is_current_player
        )
        order by r.rank asc
      ),
      '[]'::jsonb
    )
    into v_nearby_entries
    from ranked r
    where r.rank between greatest(1, v_player_rank - 2) and (v_player_rank + 2);
  end if;

  return jsonb_build_object(
    'totalCount', v_total_count,
    'entries', v_entries,
    'playerEntry', v_player_entry,
    'nearbyEntries', v_nearby_entries
  );
end;
$$;
