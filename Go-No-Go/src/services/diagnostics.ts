import { getPlanetaryTextureDiagnostics, type PlanetaryTextureDiagnostic } from '../scenes/planetaryTextures';
import {
  getLeaderboardDiagnosticStatus,
  type LeaderboardDiagnosticStatus,
} from './leaderboardService';
import { getSupabaseDiagnostics, type SupabaseDiagnostics } from './supabaseClient';

export interface AppRuntimeDiagnostics {
  supabase: SupabaseDiagnostics;
  leaderboard: LeaderboardDiagnosticStatus;
  planetaryTextures: PlanetaryTextureDiagnostic[];
}

/**
 * Returns safe runtime diagnostics for bundled public Supabase configuration,
 * leaderboard request status, and planetary texture loading status without
 * exposing any credentials, URLs, keys, or tokens.
 */
export function getRuntimeDiagnostics(): AppRuntimeDiagnostics {
  return {
    supabase: getSupabaseDiagnostics(),
    leaderboard: getLeaderboardDiagnosticStatus(),
    planetaryTextures: getPlanetaryTextureDiagnostics(),
  };
}

declare global {
  interface Window {
    __GNG_DIAGNOSTICS__?: () => AppRuntimeDiagnostics;
  }
}

export function installSafeDiagnostics(): void {
  if (typeof window === 'undefined') return;
  window.__GNG_DIAGNOSTICS__ = getRuntimeDiagnostics;
}
