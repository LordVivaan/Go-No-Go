/**
 * Public browser-facing Supabase configuration for GO / NO-GO.
 *
 * SECURITY NOTE:
 * The Supabase project URL and publishable key are intentionally public client-side
 * configuration and are expected to appear in the browser bundle. All table access
 * is protected by PostgreSQL Row-Level Security (RLS) and SECURITY DEFINER RPCs.
 * Never place SUPABASE_SECRET_KEY or service-role credentials in this file.
 */
export const SUPABASE_PUBLIC_CONFIG = {
  url: "https://yckvuuapqgiqagswxhqv.supabase.co",
  publishableKey: "sb_publishable_T1IaTtPtmZ22DFMbp9DvGw_p9BHO0DN",
} as const;
