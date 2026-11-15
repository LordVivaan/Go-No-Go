import { afterEach, describe, expect, it } from 'vitest';
import { getRuntimeDiagnostics, installSafeDiagnostics } from '../../src/services/diagnostics';
import { getSupabaseDiagnostics } from '../../src/services/supabaseClient';
import { clearPlanetaryTextureCachesForTest } from '../../src/scenes/planetaryTextures';

describe('Production Runtime Diagnostics Registration', () => {
  afterEach(() => {
    clearPlanetaryTextureCachesForTest();
    delete (window as unknown as { __GNG_DIAGNOSTICS__?: unknown }).__GNG_DIAGNOSTICS__;
  });

  it('registers window.__GNG_DIAGNOSTICS__ unconditionally and returns safe diagnostics', () => {
    installSafeDiagnostics();

    const fn = (window as unknown as { __GNG_DIAGNOSTICS__?: unknown }).__GNG_DIAGNOSTICS__;
    expect(typeof fn).toBe('function');

    const result = (fn as () => ReturnType<typeof getRuntimeDiagnostics>)();
    expect(result).toHaveProperty('supabase');
    expect(result).toHaveProperty('leaderboard');
    expect(result).toHaveProperty('planetaryTextures');
    expect(result.supabase.configured).toBe(true);
    expect(result.supabase.clientInitialized).toBe(true);
    expect(result.supabase.hasUrl).toBe(true);
    expect(result.supabase.hasPublishableKey).toBe(true);
    expect(typeof result.leaderboard.status).toBe('string');
    expect(Array.isArray(result.planetaryTextures)).toBe(true);
    expect(result.planetaryTextures.map((p) => p.body)).toEqual([
      'EARTH',
      'MOON',
      'MARS',
      'ASTEROID',
    ]);

    // Must never expose credential values, URLs, or secrets
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('sb_publishable_');
    expect(serialized).not.toContain('sb_secret_');
    expect(serialized).not.toContain('supabase.co');
    expect(serialized).not.toContain('service_role');
  });

  it('reports useful diagnostics when Supabase is unconfigured or unavailable', () => {
    const missing = getSupabaseDiagnostics({});
    expect(missing).toEqual({
      configured: false,
      clientInitialized: false,
      hasUrl: false,
      hasPublishableKey: false,
      keyKind: 'missing',
      reason: 'Public Supabase URL or publishable key is missing.',
    });

    const partial = getSupabaseDiagnostics({
      url: 'https://example.supabase.co',
    });
    expect(partial.configured).toBe(false);
    expect(partial.clientInitialized).toBe(false);
    expect(partial.hasUrl).toBe(true);
    expect(partial.hasPublishableKey).toBe(false);
    expect(partial.keyKind).toBe('missing');
    expect(JSON.stringify(partial)).not.toContain('example.supabase.co');
  });
});
