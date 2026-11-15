// =============================================================================
// GO / NO-GO (GNG) — Edge Function: submit-mission-score
// Validates incoming mission score requests and forwards them to the
// authoritative PostgreSQL RPC `public.submit_verified_mission_score`.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SubmitMissionScoreRequest {
  playerToken: string;
  playerAlias: string;
  countryCode?: string | null;
  missionCode?: string;
  difficulty?: string;
  seasonCode?: string;
  configurationName?: string;
  telemetry: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabasePublishableKey =
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabasePublishableKey) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Leaderboard backend environment not configured.' }),
      {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const body = (await req.json()) as Partial<SubmitMissionScoreRequest>;
    if (
      !body ||
      typeof body.playerToken !== 'string' ||
      typeof body.playerAlias !== 'string' ||
      typeof body.telemetry !== 'object' ||
      body.telemetry === null
    ) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid submission request payload.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(supabaseUrl, supabasePublishableKey, {
      global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.rpc('submit_verified_mission_score', {
      p_player_token: body.playerToken,
      p_player_alias: body.playerAlias,
      p_country_code: body.countryCode ?? null,
      p_mission_code: body.missionCode ?? 'FLOODWATCH',
      p_difficulty: body.difficulty ?? 'STANDARD',
      p_season_code: body.seasonCode ?? '2026-S1',
      p_configuration_name: body.configurationName ?? 'FLOODWATCH Spacecraft',
      p_telemetry: body.telemetry,
    });

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = (data ?? { ok: false, error: 'Empty server response' }) as Record<
      string,
      unknown
    >;
    const statusCode = result.ok === true ? 200 : 422;

    return new Response(JSON.stringify(result), {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : 'Unexpected submission processing error',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
