-- Gemini AI Engineering Evaluation + Deterministic Score Leaderboard Integration
-- Adds separate ai_score, deterministic_score, and ai_category_scores storage
-- while preserving provisional verification rules and competition tie-ranking (1, 1, 3, 4).

ALTER TABLE public.leaderboard_entries
  ADD COLUMN IF NOT EXISTS ai_score numeric(5,1),
  ADD COLUMN IF NOT EXISTS deterministic_score numeric(5,1),
  ADD COLUMN IF NOT EXISTS ai_category_scores jsonb;

CREATE OR REPLACE FUNCTION public.attach_ai_evaluation_metadata(
  p_entry_id uuid,
  p_player_token text,
  p_evaluation_id text,
  p_evaluation_version text,
  p_evaluation_model text,
  p_snapshot_hash text,
  p_ai_score numeric DEFAULT NULL,
  p_deterministic_score numeric DEFAULT NULL,
  p_ai_category_scores jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_player_key text := NULL;
  v_science numeric;
  v_reliability numeric;
  v_resource numeric;
  v_comms numeric;
  v_risk numeric;
  v_sum numeric;
  v_updated_id uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    v_player_key := 'uid:' || encode(digest(v_uid::text, 'sha256'), 'hex');
  ELSIF p_player_token IS NOT NULL AND p_player_token ~ '^[A-Za-z0-9_-]{16,128}$' THEN
    v_player_key := 'tok:' || encode(digest(p_player_token, 'sha256'), 'hex');
  END IF;

  IF v_player_key IS NULL OR p_entry_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PLAYER_OR_ENTRY');
  END IF;

  IF p_ai_score IS NOT NULL AND (p_ai_score < 0 OR p_ai_score > 100) THEN
    RAISE EXCEPTION 'ai_score must be between 0 and 100';
  END IF;

  IF p_deterministic_score IS NOT NULL AND (p_deterministic_score < 0 OR p_deterministic_score > 100) THEN
    RAISE EXCEPTION 'deterministic_score must be between 0 and 100';
  END IF;

  IF p_ai_category_scores IS NOT NULL THEN
    v_science := (p_ai_category_scores ->> 'science')::numeric;
    v_reliability := (p_ai_category_scores ->> 'reliability')::numeric;
    v_resource := (p_ai_category_scores ->> 'resourceEfficiency')::numeric;
    v_comms := (p_ai_category_scores ->> 'communications')::numeric;
    v_risk := (p_ai_category_scores ->> 'riskManagement')::numeric;

    IF v_science IS NULL OR v_science < 0 OR v_science > 35
       OR v_reliability IS NULL OR v_reliability < 0 OR v_reliability > 25
       OR v_resource IS NULL OR v_resource < 0 OR v_resource > 15
       OR v_comms IS NULL OR v_comms < 0 OR v_comms > 15
       OR v_risk IS NULL OR v_risk < 0 OR v_risk > 10 THEN
      RAISE EXCEPTION 'ai_category_scores contains out-of-bounds category values';
    END IF;

    v_sum := round((v_science + v_reliability + v_resource + v_comms + v_risk)::numeric, 1);
    IF p_ai_score IS NOT NULL AND abs(v_sum - round(p_ai_score::numeric, 1)) > 0.2 THEN
      RAISE EXCEPTION 'ai_score does not match sum of ai_category_scores';
    END IF;
  END IF;

  UPDATE public.leaderboard_entries
  SET
    evaluation_id = nullif(trim(p_evaluation_id), ''),
    evaluation_version = nullif(trim(p_evaluation_version), ''),
    evaluation_model = nullif(trim(p_evaluation_model), ''),
    snapshot_hash = nullif(trim(p_snapshot_hash), ''),
    ai_score = CASE WHEN p_ai_score IS NOT NULL THEN round(p_ai_score::numeric, 1) ELSE ai_score END,
    deterministic_score = CASE
      WHEN p_deterministic_score IS NOT NULL THEN round(p_deterministic_score::numeric, 1)
      ELSE coalesce(deterministic_score, total_score)
    END,
    ai_category_scores = coalesce(p_ai_category_scores, ai_category_scores)
  WHERE id = p_entry_id
    AND player_key = v_player_key
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Entry not found or player key mismatch');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'entryId', v_updated_id,
    'verificationStatus', 'PROVISIONAL'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mission_leaderboard(
  p_mission_code text,
  p_difficulty text,
  p_season_code text DEFAULT '2026-S1',
  p_country_code text DEFAULT NULL,
  p_player_token text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_player_key text := NULL;
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_country text := nullif(upper(trim(coalesce(p_country_code, ''))), '');
  v_total_count integer := 0;
  v_entries jsonb := '[]'::jsonb;
  v_player_entry jsonb := NULL;
  v_nearby_entries jsonb := '[]'::jsonb;
  v_player_row_num integer := NULL;
BEGIN
  IF v_uid IS NOT NULL THEN
    v_player_key := 'uid:' || encode(digest(v_uid::text, 'sha256'), 'hex');
  ELSIF p_player_token IS NOT NULL AND p_player_token ~ '^[A-Za-z0-9_-]{16,128}$' THEN
    v_player_key := 'tok:' || encode(digest(p_player_token, 'sha256'), 'hex');
  END IF;

  WITH ranked AS (
    SELECT
      le.id,
      RANK() OVER (
        ORDER BY round(coalesce(le.ai_score, le.total_score)::numeric, 1) DESC
      )::integer AS rank,
      ROW_NUMBER() OVER (
        ORDER BY
          round(coalesce(le.ai_score, le.total_score)::numeric, 1) DESC,
          le.achieved_at ASC,
          le.id ASC
      )::integer AS row_num,
      le.player_alias,
      le.country_code,
      le.mission_code,
      le.difficulty,
      le.season_code,
      le.configuration_name,
      le.total_score,
      le.ai_score,
      coalesce(le.deterministic_score, le.total_score) AS deterministic_score,
      le.ai_category_scores,
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
      le.achieved_at,
      (v_player_key IS NOT NULL AND le.player_key = v_player_key) AS is_current_player
    FROM public.leaderboard_entries le
    WHERE le.mission_code = p_mission_code
      AND le.difficulty = p_difficulty
      AND (p_season_code = 'ALL_TIME' OR le.season_code = p_season_code)
      AND (v_country IS NULL OR le.country_code = v_country)
  )
  SELECT
    (SELECT count(*)::integer FROM ranked),
    coalesce(
      (
        SELECT jsonb_agg(
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
            'aiScore', r.ai_score,
            'deterministicScore', r.deterministic_score,
            'aiCategoryScores', r.ai_category_scores,
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
            'achievedAtIso', r.achieved_at,
            'isCurrentPlayer', r.is_current_player
          )
          ORDER BY r.row_num ASC
        )
        FROM (
          SELECT * FROM ranked
          ORDER BY row_num ASC
          LIMIT v_limit OFFSET v_offset
        ) r
      ),
      '[]'::jsonb
    ),
    (
      SELECT jsonb_build_object(
        'id', r.id,
        'rank', r.rank,
        'playerAlias', r.player_alias,
        'countryCode', r.country_code,
        'missionCode', r.mission_code,
        'difficulty', r.difficulty,
        'seasonCode', r.season_code,
        'configurationName', r.configuration_name,
        'totalScore', r.total_score,
        'aiScore', r.ai_score,
        'deterministicScore', r.deterministic_score,
        'aiCategoryScores', r.ai_category_scores,
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
        'achievedAtIso', r.achieved_at,
        'isCurrentPlayer', r.is_current_player
      )
      FROM ranked r
      WHERE r.is_current_player = true
      ORDER BY r.row_num ASC
      LIMIT 1
    ),
    (
      SELECT r.row_num
      FROM ranked r
      WHERE r.is_current_player = true
      ORDER BY r.row_num ASC
      LIMIT 1
    )
  INTO v_total_count, v_entries, v_player_entry, v_player_row_num;

  IF v_player_row_num IS NOT NULL THEN
    WITH ranked AS (
      SELECT
        le.id,
        RANK() OVER (
          ORDER BY round(coalesce(le.ai_score, le.total_score)::numeric, 1) DESC
        )::integer AS rank,
        ROW_NUMBER() OVER (
          ORDER BY
            round(coalesce(le.ai_score, le.total_score)::numeric, 1) DESC,
            le.achieved_at ASC,
            le.id ASC
        )::integer AS row_num,
        le.player_alias,
        le.country_code,
        le.mission_code,
        le.difficulty,
        le.season_code,
        le.configuration_name,
        le.total_score,
        le.ai_score,
        coalesce(le.deterministic_score, le.total_score) AS deterministic_score,
        le.ai_category_scores,
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
        le.achieved_at,
        (v_player_key IS NOT NULL AND le.player_key = v_player_key) AS is_current_player
      FROM public.leaderboard_entries le
      WHERE le.mission_code = p_mission_code
        AND le.difficulty = p_difficulty
        AND (p_season_code = 'ALL_TIME' OR le.season_code = p_season_code)
        AND (v_country IS NULL OR le.country_code = v_country)
    )
    SELECT coalesce(
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
          'aiScore', r.ai_score,
          'deterministicScore', r.deterministic_score,
          'aiCategoryScores', r.ai_category_scores,
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
          'achievedAtIso', r.achieved_at,
          'isCurrentPlayer', r.is_current_player
        )
        ORDER BY r.row_num ASC
      ),
      '[]'::jsonb
    )
    INTO v_nearby_entries
    FROM ranked r
    WHERE r.row_num BETWEEN greatest(1, v_player_row_num - 2) AND (v_player_row_num + 2);
  END IF;

  RETURN jsonb_build_object(
    'totalCount', coalesce(v_total_count, 0),
    'entries', coalesce(v_entries, '[]'::jsonb),
    'playerEntry', v_player_entry,
    'nearbyEntries', coalesce(v_nearby_entries, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.attach_ai_evaluation_metadata(
  uuid, text, text, text, text, text, numeric, numeric, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_ai_evaluation_metadata(
  uuid, text, text, text, text, text, numeric, numeric, jsonb
) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_mission_leaderboard(
  text, text, text, text, text, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mission_leaderboard(
  text, text, text, text, text, integer, integer
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
