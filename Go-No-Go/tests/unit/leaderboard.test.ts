import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDifficultyToScenario, MISSION_SCENARIOS } from '../../src/data/scenarios';
import { evaluateMissionScore } from '../../src/engine/scoring';
import type { LeaderboardVerificationTelemetry } from '../../src/types/leaderboard';
import { resolveMissionEntities, useMissionStore } from '../../src/store/missionStore';

const mockRpc = vi.fn();
const mockGetSession = vi.fn();
const mockSignInAnonymously = vi.fn();
const mockSupabaseState = {
  configured: false,
};

vi.mock('../../src/services/supabaseClient', () => ({
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
}));

import {
  buildLeaderboardVerificationTelemetry,
  fetchMissionLeaderboard,
  isValidIsoCountryCode,
  submitVerifiedMissionScore,
  validateLeaderboardSubmissionPayload,
  validatePlayerAlias,
} from '../../src/services/leaderboardService';

function createValidTelemetry(): LeaderboardVerificationTelemetry {
  useMissionStore.getState().resetMissionForNewAttempt();
  const state = useMissionStore.getState();
  const resolved = resolveMissionEntities(state);
  const report = evaluateMissionScore({
    scenario: resolved.scenario,
    difficulty: 'STANDARD',
    configurationName: state.configurationName,
    engineering: resolved.engineering,
    instruments: resolved.instruments,
    anomaliesResolvedCount: 2,
    anomaliesTotalCount: 2,
    finalSystemHealthPct: 98,
  });

  return buildLeaderboardVerificationTelemetry({
    report,
    engineering: resolved.engineering,
    scenario: resolved.scenario,
    instruments: resolved.instruments,
    configSignature: 'floodwatch-baseline-test',
  });
}

describe('International Leaderboard Validation, Offline Integrity & RPC Client', () => {
  beforeEach(() => {
    mockSupabaseState.configured = false;
    mockRpc.mockReset();
    mockGetSession.mockReset();
    mockSignInAnonymously.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'anon-uid-1' } } } });
    mockSignInAnonymously.mockResolvedValue({ data: { session: { user: { id: 'anon-uid-1' } } } });
    window.localStorage.clear();
  });

  afterEach(() => {
    useMissionStore.getState().resetMissionForNewAttempt();
  });

  it('validates ISO-3166-1 alpha-2 country codes strictly', () => {
    expect(isValidIsoCountryCode(null)).toBe(true);
    expect(isValidIsoCountryCode('')).toBe(true);
    expect(isValidIsoCountryCode('US')).toBe(true);
    expect(isValidIsoCountryCode('jp')).toBe(true);
    expect(isValidIsoCountryCode('GB')).toBe(true);
    expect(isValidIsoCountryCode('XX')).toBe(false);
    expect(isValidIsoCountryCode('ZZ')).toBe(false);
    expect(isValidIsoCountryCode('USA')).toBe(false);
    expect(isValidIsoCountryCode('1A')).toBe(false);
  });

  it('sanitizes and enforces pseudonymous pilot callsign rules', () => {
    const clean = validatePlayerAlias('  <script>Orbit-1</script>  ');
    expect(clean.valid).toBe(true);
    expect(clean.sanitized).not.toContain('<');
    expect(clean.sanitized).not.toContain('>');

    expect(validatePlayerAlias('A').valid).toBe(false);
    expect(validatePlayerAlias('X'.repeat(30)).valid).toBe(false);
  });

  it('rejects NO_GO, mission loss, and tampered telemetry locally before submission', () => {
    const valid = createValidTelemetry();
    expect(
      validateLeaderboardSubmissionPayload({
        playerAlias: 'FLIGHT-ALPHA',
        countryCode: 'CA',
        missionCode: 'FLOODWATCH',
        difficulty: 'STANDARD',
        seasonCode: '2026-S1',
        telemetry: valid,
      }).valid
    ).toBe(true);

    expect(
      validateLeaderboardSubmissionPayload({
        playerAlias: 'FLIGHT-ALPHA',
        countryCode: 'CA',
        missionCode: 'FLOODWATCH',
        difficulty: 'STANDARD',
        seasonCode: '2026-S1',
        telemetry: { ...valid, overallGateStatus: 'NO_GO' },
      }).valid
    ).toBe(false);

    expect(
      validateLeaderboardSubmissionPayload({
        playerAlias: 'FLIGHT-ALPHA',
        countryCode: 'CA',
        missionCode: 'FLOODWATCH',
        difficulty: 'STANDARD',
        seasonCode: '2026-S1',
        telemetry: { ...valid, batteryExhausted: true, finalSystemHealthPct: 0 },
      }).valid
    ).toBe(false);

    expect(
      validateLeaderboardSubmissionPayload({
        playerAlias: 'FLIGHT-ALPHA',
        countryCode: 'CA',
        missionCode: 'FLOODWATCH',
        difficulty: 'STANDARD',
        seasonCode: '2026-S1',
        telemetry: {
          ...valid,
          totalDataCapturedGb: 100,
          totalDataDownlinkedGb: 500,
        },
      }).valid
    ).toBe(false);

    expect(
      validateLeaderboardSubmissionPayload({
        playerAlias: 'FLIGHT-ALPHA',
        countryCode: 'ZZ',
        missionCode: 'FLOODWATCH',
        difficulty: 'STANDARD',
        seasonCode: '2026-S1',
        telemetry: valid,
      }).valid
    ).toBe(false);
  });

  it('never fabricates placeholder leaderboard rows when Supabase is offline', async () => {
    const result = await fetchMissionLeaderboard({
      missionCode: 'FLOODWATCH',
      difficulty: 'STANDARD',
      seasonCode: '2026-S1',
      countryCode: null,
      limit: 15,
      offset: 0,
    });

    expect(result.status).toBe('OFFLINE');
    expect(result.entries).toEqual([]);
    expect(result.totalCount).toBe(0);

    const submitRes = await submitVerifiedMissionScore({
      playerAlias: 'FLIGHT-ALPHA',
      countryCode: 'US',
      missionCode: 'FLOODWATCH',
      difficulty: 'STANDARD',
      configurationName: 'FLOODWATCH Test',
      telemetry: createValidTelemetry(),
    });
    expect(submitRes.ok).toBe(false);
    expect(submitRes.offline).toBe(true);
  });

  it('submits verified telemetry to Supabase RPC and queries filtered/paginated standings', async () => {
    mockSupabaseState.configured = true;
    const baseScenario = MISSION_SCENARIOS.find((s) => s.id === 'lunar-ice-02')!;
    const scenario = applyDifficultyToScenario(baseScenario, 'HARD');
    expect(scenario.budgetCapMusd).toBeLessThan(145);

    mockRpc.mockResolvedValueOnce({
      data: {
        ok: true,
        entryId: 'entry-uuid-123',
        verifiedScore: 91.4,
        bestScore: 91.4,
        grade: 'S',
        outcome: 'SUCCESS',
        isNewPersonalBest: true,
      },
      error: null,
    });

    const telemetry = createValidTelemetry();
    const submitRes = await submitVerifiedMissionScore({
      playerAlias: 'AQUA-DIRECTOR',
      countryCode: 'DE',
      missionCode: 'FLOODWATCH',
      difficulty: 'HARD',
      seasonCode: '2026-S1',
      configurationName: 'FLOODWATCH Hard Config',
      telemetry,
    });

    expect(submitRes.ok).toBe(true);
    expect(submitRes.verifiedScore).toBe(91.4);
    expect(submitRes.isNewPersonalBest).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith(
      'submit_verified_mission_score',
      expect.objectContaining({
        p_player_alias: 'AQUA-DIRECTOR',
        p_country_code: 'DE',
        p_mission_code: 'FLOODWATCH',
        p_difficulty: 'HARD',
        p_season_code: '2026-S1',
      })
    );

    mockRpc.mockResolvedValueOnce({
      data: {
        ok: false,
        error: 'Claimed score rejected by server recomputation.',
      },
      error: null,
    });

    const tamperedRes = await submitVerifiedMissionScore({
      playerAlias: 'AQUA-DIRECTOR',
      countryCode: 'DE',
      missionCode: 'FLOODWATCH',
      difficulty: 'HARD',
      configurationName: 'Tampered',
      telemetry: { ...telemetry, claimedTotalScore: 99.9 },
    });
    expect(tamperedRes.ok).toBe(false);
    expect(tamperedRes.error).toContain('rejected');

    mockRpc.mockResolvedValueOnce({
      data: {
        totalCount: 32,
        entries: [
          {
            id: 'entry-uuid-123',
            rank: 16,
            playerAlias: 'AQUA-DIRECTOR',
            countryCode: 'DE',
            missionCode: 'FLOODWATCH',
            difficulty: 'HARD',
            seasonCode: '2026-S1',
            configurationName: 'FLOODWATCH Hard Config',
            totalScore: 91.4,
            scienceScore: 33.5,
            reliabilityScore: 22.9,
            efficiencyScore: 15.0,
            commsScore: 15.0,
            riskCollabScore: 5.0,
            grade: 'S',
            outcome: 'SUCCESS',
            completionDurationSec: 432000,
            dataDownlinkedGb: 240.0,
            regionsMappedCount: 6,
            achievedAtIso: '2026-11-14T16:00:00Z',
            isCurrentPlayer: true,
          },
        ],
        playerEntry: {
          id: 'entry-uuid-123',
          rank: 16,
          playerAlias: 'AQUA-DIRECTOR',
          countryCode: 'DE',
          missionCode: 'FLOODWATCH',
          difficulty: 'HARD',
          seasonCode: '2026-S1',
          configurationName: 'FLOODWATCH Hard Config',
          totalScore: 91.4,
          scienceScore: 33.5,
          reliabilityScore: 22.9,
          efficiencyScore: 15.0,
          commsScore: 15.0,
          riskCollabScore: 5.0,
          grade: 'S',
          outcome: 'SUCCESS',
          completionDurationSec: 432000,
          dataDownlinkedGb: 240.0,
          regionsMappedCount: 6,
          achievedAtIso: '2026-11-14T16:00:00Z',
          isCurrentPlayer: true,
        },
        nearbyEntries: [],
      },
      error: null,
    });

    const boardRes = await fetchMissionLeaderboard({
      missionCode: 'FLOODWATCH',
      difficulty: 'HARD',
      seasonCode: '2026-S1',
      countryCode: 'DE',
      limit: 15,
      offset: 15,
    });

    expect(boardRes.status).toBe('OK');
    expect(boardRes.totalCount).toBe(32);
    expect(boardRes.entries).toHaveLength(1);
    expect(boardRes.entries[0]?.isCurrentPlayer).toBe(true);
    expect(boardRes.playerEntry?.rank).toBe(16);
    expect(mockRpc).toHaveBeenLastCalledWith(
      'get_mission_leaderboard',
      expect.objectContaining({
        p_country_code: 'DE',
        p_difficulty: 'HARD',
        p_season_code: '2026-S1',
        p_limit: 15,
        p_offset: 15,
      })
    );
  });
});
