-- =============================================================================
-- GO / NO-GO — Competition Tie Ranking & AI Evaluation Metadata
-- =============================================================================
-- 1. Adds nullable evaluation provenance columns to leaderboard_entries.
-- 2. Updates get_mission_leaderboard to use standard competition tie-ranking
--    (RANK() OVER ORDER BY total_score DESC), sorting tied players by earliest
--    achieved_at ASC, id ASC.
-- 3. Adds attach_ai_evaluation_metadata RPC to record OpenAI evaluation
--    provenance on the player's own leaderboard entry without breaking existing
--    submit_verified_mission_score callers.
-- =============================================================================

alter table public.leaderboard_entries
  add column if not exists evaluation_id text,
  add column if not exists evaluation_version text,
  add column if not exists evaluation_model text,
  add column if not exists snapshot_hash text;

create or replace function public.attach_ai_evaluation_metadata(
  p_entry_id uuid,
  p_player_token text,
  p_evaluation_id text,
  p_evaluation_version text,
  p_evaluation_model text,
  p_snapshot_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_player_key text := null;
  v_updated_id uuid := null;
begin
  if v_uid is not null then
    v_player_key := 'uid:' || encode(digest(v_uid::text, 'sha256'), 'hex');
  elsif p_player_token is not null and p_player_token ~ '^[A-Za-z0-9_-]{16,128}$' then
    v_player_key := 'tok:' || encode(digest(p_player_token, 'sha256'), 'hex');
  end if;

  if v_player_key is null or p_entry_id is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PLAYER_OR_ENTRY');
  end if;

  update public.leaderboard_entries
  set
    evaluation_id = nullif(left(trim(coalesce(p_evaluation_id, '')), 120), ''),
    evaluation_version = nullif(left(trim(coalesce(p_evaluation_version, '')), 64), ''),
    evaluation_model = nullif(left(trim(coalesce(p_evaluation_model, '')), 64), ''),
    snapshot_hash = nullif(left(trim(coalesce(p_snapshot_hash, '')), 128), ''),
    updated_at = now()
  where id = p_entry_id
    and player_key = v_player_key
  returning id into v_updated_id;

  if v_updated_id is null then
    return jsonb_build_object('ok', false, 'error', 'ENTRY_NOT_FOUND_OR_FORBIDDEN');
  end if;

  return jsonb_build_object('ok', true, 'entryId', v_updated_id);
end;
$$;

grant execute on function public.attach_ai_evaluation_metadata(uuid, text, text, text, text, text) to anon, authenticated;

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
      rank() over (
        order by round(le.total_score::numeric, 1) desc
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
      le.evaluation_id,
      le.evaluation_version,
      le.evaluation_model,
      le.snapshot_hash,
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
    order by rank asc, achieved_at asc, id asc
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
          'evaluationId', p.evaluation_id,
          'evaluationVersion', p.evaluation_version,
          'evaluationModel', p.evaluation_model,
          'snapshotHash', p.snapshot_hash,
          'achievedAtIso', p.achieved_at,
          'isCurrentPlayer', p.is_current_player
        )
        order by p.rank asc, p.achieved_at asc, p.id asc
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
        'evaluationId', r.evaluation_id,
        'evaluationVersion', r.evaluation_version,
        'evaluationModel', r.evaluation_model,
        'snapshotHash', r.snapshot_hash,
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
        rank() over (
          order by round(le.total_score::numeric, 1) desc
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
        le.evaluation_id,
        le.evaluation_version,
        le.evaluation_model,
        le.snapshot_hash,
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
          'evaluationId', r.evaluation_id,
          'evaluationVersion', r.evaluation_version,
          'evaluationModel', r.evaluation_model,
          'snapshotHash', r.snapshot_hash,
          'achievedAtIso', r.achieved_at,
          'isCurrentPlayer', r.is_current_player
        )
        order by r.rank asc, r.achieved_at asc, r.id asc
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

grant execute on function public.get_mission_leaderboard(text, text, text, text, text, integer, integer) to anon, authenticated;

notify pgrst, 'reload schema';
