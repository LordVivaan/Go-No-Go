import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSupabaseClientFromEnv,
  getSupabaseDiagnostics,
  validateSupabaseEnv,
} from '../../src/services/supabaseClient';
import { resolveMissionEntities, useMissionStore, getMissionConfigSignature } from '../../src/store/missionStore';
import { evaluateMissionScore } from '../../src/engine/scoring';

const mockRpc = vi.fn();
const mockGetSession = vi.fn();
const mockSignInAnonymously = vi.fn();
const mockSupabaseState = {
  configured: false,
};

vi.mock('../../src/services/supabaseClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/supabaseClient')>();
  return {
    ...actual,
    get isSupabaseConfigured() {
      return mockSupabaseState.configured;
    },
    get supabaseClient() {
      return mockSupabaseState.configured
        ? {
            auth: {
              getSession: mockGetSession,
              signInAnonymously: mockSignInAnonymously,
            },
            rpc: mockRpc,
          }
        : null;
    },
  };
});

import {
  buildLeaderboardVerificationTelemetry,
  submitVerifiedMissionScore,
} from '../../src/services/leaderboardService';
import { LeaderboardPanel } from '../../src/components/LeaderboardPanel';

describe('Supabase Environment, Auth Errors, Leaderboard States & Security Audit', () => {
  beforeEach(() => {
    mockSupabaseState.configured = false;
    mockRpc.mockReset();
    mockGetSession.mockReset();
    mockSignInAnonymously.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    useMissionStore.getState().resetMissionForNewAttempt();
  });

  it('rejects missing, malformed, and placeholder Supabase configurations', () => {
    expect(validateSupabaseEnv({}).configured).toBe(false);
    expect(
      validateSupabaseEnv({
        VITE_SUPABASE_URL: 'not-a-url',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_valid_length_key_1234',
      }).configured
    ).toBe(false);
    expect(
      validateSupabaseEnv({
        VITE_SUPABASE_URL: 'https://your-project-ref.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_valid_length_key_1234',
      }).configured
    ).toBe(false);
    expect(
      validateSupabaseEnv({
        VITE_SUPABASE_URL: 'https://yckvuuapqgiqagswxhqv.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'your-supabase-publishable-key-here',
      }).configured
    ).toBe(false);

    const invalid = createSupabaseClientFromEnv({
      VITE_SUPABASE_URL: 'ftp://invalid.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'short',
    });
    expect(invalid.configured).toBe(false);
    expect(invalid.client).toBeNull();

    // Reject secret/service-role keys in browser-facing variables
    const secretRejected = validateSupabaseEnv({
      VITE_SUPABASE_URL: 'https://yckvuuapqgiqagswxhqv.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_never_put_in_vite_browser_env',
    });
    expect(secretRejected.configured).toBe(false);
    expect(secretRejected.reason).toContain('Secret or service-role');

    const diag = getSupabaseDiagnostics({
      VITE_SUPABASE_URL: 'https://yckvuuapqgiqagswxhqv.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_1234567890',
    });
    expect(diag).toEqual({
      configured: true,
      hasUrl: true,
      hasPublishableKey: true,
      keyKind: 'publishable',
    });
    expect(JSON.stringify(diag)).not.toContain('yckvuuapqgiqagswxhqv');
    expect(JSON.stringify(diag)).not.toContain('sb_publishable_test_key');
  });

  it('initializes Supabase client cleanly with VITE_SUPABASE_PUBLISHABLE_KEY or fallback anon key', () => {
    const primary = createSupabaseClientFromEnv({
      VITE_SUPABASE_URL: 'https://yckvuuapqgiqagswxhqv.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_1234567890',
    });
    expect(primary.configured).toBe(true);
    expect(primary.client).not.toBeNull();

    const fallback = createSupabaseClientFromEnv({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test_anon_key_payload',
    });
    expect(fallback.configured).toBe(true);
    expect(fallback.client).not.toBeNull();
  });

  it('handles authentication errors gracefully and strips client verification overrides', async () => {
    mockSupabaseState.configured = true;
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSignInAnonymously.mockResolvedValue({
      data: { session: null },
      error: { message: 'Anonymous sign-ins are disabled' },
    });
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        entryId: 'entry-1',
        verifiedScore: 88.5,
        bestScore: 88.5,
        grade: 'A',
        outcome: 'SUCCESS',
        isNewPersonalBest: true,
        isVerified: false,
        verificationStatus: 'PROVISIONAL',
      },
      error: null,
    });

    useMissionStore.getState().applyPreset('preset-lunar-nominal-go');
    const state = useMissionStore.getState();
    const resolved = resolveMissionEntities(state);
    const report = evaluateMissionScore({
      scenario: resolved.scenario,
      difficulty: state.difficulty,
      configurationName: state.configurationName,
      engineering: resolved.engineering,
      instruments: resolved.instruments,
      anomaliesResolvedCount: 2,
      anomaliesTotalCount: 2,
      finalSystemHealthPct: 98,
    });

    const telemetry = buildLeaderboardVerificationTelemetry({
      report,
      engineering: resolved.engineering,
      scenario: resolved.scenario,
      instruments: resolved.instruments,
      configSignature: getMissionConfigSignature(state),
    }) as unknown as Record<string, unknown>;

    // Attempt unauthorized client-side verification override
    telemetry.isVerified = true;
    telemetry.verificationStatus = 'VERIFIED';

    const res = await submitVerifiedMissionScore({
      playerAlias: 'FLIGHT-TEST',
      countryCode: 'US',
      missionCode: 'LUNAR SCOUT',
      difficulty: 'STANDARD',
      configurationName: state.configurationName,
      telemetry: telemetry as unknown as Parameters<typeof submitVerifiedMissionScore>[0]['telemetry'],
    });

    expect(res.ok).toBe(true);
    expect(res.isVerified).toBe(false);
    expect(res.verificationStatus).toBe('PROVISIONAL');
    expect(res.authWarning).toContain('Anonymous auth unavailable');

    const sentTelemetry = mockRpc.mock.calls[0]?.[1]?.p_telemetry as Record<string, unknown>;
    expect(sentTelemetry.isVerified).toBeUndefined();
    expect(sentTelemetry.verificationStatus).toBeUndefined();
  });

  it('renders loading, empty, error, and populated provisional states in LeaderboardPanel', async () => {
    mockSupabaseState.configured = true;
    useMissionStore.getState().applyPreset('preset-lunar-nominal-go');
    const state = useMissionStore.getState();
    const resolved = resolveMissionEntities(state);

    // 1. Loading -> Empty state
    let resolveQuery!: (value: unknown) => void;
    mockRpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        })
    );

    render(
      <MemoryRouter>
        <LeaderboardPanel
          report={resolved.scorePreview}
          engineering={resolved.engineering}
          scenario={resolved.scenario}
          instruments={resolved.instruments}
          difficulty={state.difficulty}
          configSignature={getMissionConfigSignature(state)}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/Loading verified standings/i)).toBeTruthy();

    resolveQuery({
      data: { totalCount: 0, entries: [], playerEntry: null, nearbyEntries: [] },
      error: null,
    });

    expect(await screen.findByText(/No verified runs recorded yet/i)).toBeTruthy();

    // 2. Error state on refresh
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'RLS permission denied' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    await waitFor(() => {
      expect(screen.getByText(/Unable to load leaderboard standings/i)).toBeTruthy();
      expect(screen.getByText(/RLS permission denied/i)).toBeTruthy();
    });

    // 3. Populated provisional entry state
    mockRpc.mockResolvedValueOnce({
      data: {
        totalCount: 1,
        entries: [
          {
            id: 'row-1',
            rank: 1,
            playerAlias: 'ORBIT-01',
            countryCode: 'US',
            missionCode: 'FLOODWATCH',
            difficulty: 'STANDARD',
            seasonCode: '2026-S1',
            configurationName: 'FLOODWATCH Baseline',
            totalScore: 91.2,
            scienceScore: 34.0,
            reliabilityScore: 22.2,
            efficiencyScore: 15.0,
            commsScore: 15.0,
            riskCollabScore: 5.0,
            grade: 'S',
            outcome: 'SUCCESS',
            completionDurationSec: 432000,
            dataDownlinkedGb: 180.5,
            regionsMappedCount: 6,
            isVerified: false,
            verificationStatus: 'PROVISIONAL',
            achievedAtIso: '2026-11-15T08:00:00Z',
            isCurrentPlayer: true,
          },
        ],
        playerEntry: null,
        nearbyEntries: [],
      },
      error: null,
    });
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    expect(await screen.findByText('ORBIT-01')).toBeTruthy();
    expect(screen.getByText('PROVISIONAL')).toBeTruthy();
  });
});
