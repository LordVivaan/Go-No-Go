import { getPlanetaryTextureDiagnostics, type PlanetaryTextureDiagnostic } from '../scenes/planetaryTextures';
import { getSupabaseDiagnostics, type SupabaseDiagnostics } from './supabaseClient';

export interface AppRuntimeDiagnostics {
  supabase: SupabaseDiagnostics;
  planetaryTextures: PlanetaryTextureDiagnostic[];
}

/**
 * Returns safe runtime diagnostics for Supabase configuration presence
 * and planetary texture loading status without exposing any credentials.
 */
export function getRuntimeDiagnostics(): AppRuntimeDiagnostics {
  return {
    supabase: getSupabaseDiagnostics(),
    planetaryTextures: getPlanetaryTextureDiagnostics(),
  };
}

export function installSafeDiagnostics(): void {
  if (typeof window === 'undefined') return;
  const target = window as unknown as {
    __GNG_DIAGNOSTICS__?: () => AppRuntimeDiagnostics;
  };
  target.__GNG_DIAGNOSTICS__ = getRuntimeDiagnostics;
}
