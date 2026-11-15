-- =============================================================================
-- GO / NO-GO (GNG) — Leaderboard RPC Execute Grants & PostgREST Schema Reload
-- Safe, idempotent, non-destructive migration:
--   1. Re-affirms public schema USAGE and EXECUTE grants on leaderboard RPCs
--      for anon and authenticated roles (preserves all table data & RLS).
--   2. Notifies PostgREST to reload its schema cache so RPC calls resolve.
-- =============================================================================

grant usage on schema public to anon, authenticated;

grant execute on function public.submit_verified_mission_score(
  text, text, text, text, text, text, text, jsonb
) to anon, authenticated;

grant execute on function public.get_mission_leaderboard(
  text, text, text, text, text, integer, integer
) to anon, authenticated;

notify pgrst, 'reload schema';
