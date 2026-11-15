import { isSupabaseConfigured, supabaseClient } from './supabaseClient';
import type { EngineeringSummary } from '../types/engineering';
import type { MissionDifficulty, ScenarioDefinition } from '../types/mission';
import type { MissionScoreReport } from '../types/simulation';
import type { ScientificInstrument } from '../types/spacecraft';
import {
  CURRENT_SEASON_CODE,
  type LeaderboardEntry,
  type LeaderboardQueryParams,
  type LeaderboardQueryResult,
  type LeaderboardSubmissionResult,
  type LeaderboardVerificationTelemetry,
} from '../types/leaderboard';

const PLAYER_IDENTITY_STORAGE_KEY = 'gng_player_identity_v1';

const VALID_MISSION_CODES = new Set([
  'LUNAR SCOUT',
  'LUNAR ICE MAPPER',
  'MARS OBSERVER',
  'MARS RELAY',
  'ASTEROID EXPLORER',
  'NEAR-EARTH ASTEROID',
  'FLOODWATCH', // Historical compatibility for legacy database records; not in public MISSION_SCENARIOS
]);

const VALID_DIFFICULTIES = new Set<MissionDifficulty>(['STANDARD', 'HARD', 'EXPERT']);

// Full official ISO-3166-1 alpha-2 code set mirroring PostgreSQL is_valid_iso_country_code
const VALID_ISO_ALPHA2_CODES = new Set([
  'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ',
  'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ',
  'CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ',
  'DE','DJ','DK','DM','DO','DZ',
  'EC','EE','EG','EH','ER','ES','ET',
  'FI','FJ','FK','FM','FO','FR',
  'GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY',
  'HK','HM','HN','HR','HT','HU',
  'ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT',
  'JE','JM','JO','JP',
  'KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ',
  'LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY',
  'MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ',
  'NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ',
  'OM',
  'PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY',
  'QA',
  'RE','RO','RS','RU','RW',
  'SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ',
  'TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ',
  'UA','UG','UM','US','UY','UZ',
  'VA','VC','VE','VG','VI','VN','VU',
  'WF','WS',
  'YE','YT',
  'ZA','ZM','ZW',
]);

export interface PlayerIdentity {
  playerToken: string;
  playerAlias: string;
  countryCode: string | null;
}

function generatePlayerToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `gng_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

function getSafeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Validates whether an optional country code is a genuine ISO-3166-1 alpha-2 code.
 * Empty/null values represent explicit opt-out ("Global / Unspecified").
 */
export function isValidIsoCountryCode(code?: string | null): boolean {
  if (code == null || code.trim() === '') return true;
  const normalized = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) && VALID_ISO_ALPHA2_CODES.has(normalized);
}

/** Strips unsafe markup characters and collapses extra whitespace from pilot callsigns. */
export function sanitizePlayerAlias(alias: string): string {
  return alias
    .replace(/[<>&"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Validates pseudonymous pilot callsigns (2–24 characters, no PII required). */
export function validatePlayerAlias(alias: string): {
  valid: boolean;
  sanitized: string;
  error?: string;
} {
  const sanitized = sanitizePlayerAlias(alias);
  if (sanitized.length < 2) {
    return { valid: false, sanitized, error: 'Callsign must be at least 2 characters.' };
  }
  if (sanitized.length > 24) {
    return { valid: false, sanitized, error: 'Callsign must be 24 characters or fewer.' };
  }
  return { valid: true, sanitized };
}

/**
 * Loads or generates a pseudonymous leaderboard identity token and user display preferences.
 * Strictly used for leaderboard identity only — never stores mission state or save slots.
 */
export function getOrCreatePlayerIdentity(): PlayerIdentity {
  const storage = getSafeStorage();
  if (storage) {
    try {
      const raw = storage.getItem(PLAYER_IDENTITY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PlayerIdentity>;
        if (
          typeof parsed.playerToken === 'string' &&
          /^[A-Za-z0-9_-]{16,128}$/.test(parsed.playerToken)
        ) {
          const aliasCheck = validatePlayerAlias(parsed.playerAlias ?? 'FLIGHT-01');
          const country =
            parsed.countryCode && isValidIsoCountryCode(parsed.countryCode)
              ? parsed.countryCode.trim().toUpperCase()
              : null;
          return {
            playerToken: parsed.playerToken,
            playerAlias: aliasCheck.valid ? aliasCheck.sanitized : 'FLIGHT-01',
            countryCode: country,
          };
        }
      }
    } catch {
      // Fall through to generate a fresh pseudonymous identity token.
    }
  }

  const created: PlayerIdentity = {
    playerToken: generatePlayerToken(),
    playerAlias: 'FLIGHT-01',
    countryCode: null,
  };
  storage?.setItem(PLAYER_IDENTITY_STORAGE_KEY, JSON.stringify(created));
  return created;
}

/** Persists the player's chosen pseudonymous callsign and optional country preference. */
export function savePlayerIdentityPreferences(
  playerAlias: string,
  countryCode: string | null
): PlayerIdentity {
  const current = getOrCreatePlayerIdentity();
  const aliasCheck = validatePlayerAlias(playerAlias);
  const normalizedCountry =
    countryCode && countryCode.trim() !== '' && isValidIsoCountryCode(countryCode)
      ? countryCode.trim().toUpperCase()
      : null;

  const updated: PlayerIdentity = {
    playerToken: current.playerToken,
    playerAlias: aliasCheck.valid ? aliasCheck.sanitized : current.playerAlias,
    countryCode: normalizedCountry,
  };

  getSafeStorage()?.setItem(PLAYER_IDENTITY_STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

/** Builds structured engineering & simulation telemetry for server-side score verification. */
export function buildLeaderboardVerificationTelemetry(params: {
  report: MissionScoreReport;
  engineering: EngineeringSummary;
  scenario: ScenarioDefinition;
  instruments: ScientificInstrument[];
  configSignature: string;
  finalSystemHealthPct?: number;
}): LeaderboardVerificationTelemetry {
  const {
    report,
    engineering,
    scenario,
    instruments,
    configSignature,
    finalSystemHealthPct = 100,
  } = params;
  const avgFloodUtility =
    instruments.length > 0
      ? Math.min(
          1.0,
          instruments.reduce((sum, i) => sum + i.floodScienceUtility, 0) /
            Math.max(1, instruments.length * 0.75)
        )
      : 0;

  return {
    overallGateStatus: engineering.validation.overallStatus,
    massStatus: engineering.mass.status,
    powerStatus: engineering.power.status,
    propulsionStatus: engineering.propulsion.status,
    budgetStatus: engineering.budget.status,
    thermalStatus: engineering.thermal.status,
    wetMassKg: engineering.mass.wetMassKg,
    maxBusMassKg: engineering.mass.maxBusMassKg,
    maxLaunchMassKg: engineering.mass.maxLaunchMassKg,
    powerMarginPct: engineering.power.powerMarginPct,
    eclipseDodPct: engineering.power.eclipseDodPct,
    maxAllowedDodPct: engineering.power.maxAllowedDodPct,
    totalSpentMusd: engineering.budget.totalSpentMusd,
    budgetCapMusd: scenario.budgetCapMusd,
    avgFloodUtility: Number(avgFloodUtility.toFixed(4)),
    instrumentCount: instruments.length,
    hasCloudPenetrating: instruments.some((i) => i.cloudPenetrating),
    hasNightCapable: instruments.some((i) => i.nightCapable),
    totalDataCapturedGb: report.totalDataCapturedGb,
    totalDataDownlinkedGb: report.totalDataDownlinkedGb,
    totalDataLostGb: report.totalDataLostGb,
    floodRegionsMappedCount: report.floodRegionsMappedCount,
    targetRegionsTotalCount: scenario.targetRegions.length,
    combinedMissionReliability: engineering.reliability.combinedMissionReliability,
    finalSystemHealthPct: Math.max(0, Math.min(100, finalSystemHealthPct)),
    batteryExhausted:
      report.outcome === 'MISSION_LOSS' && report.failureReason?.includes('battery') === true,
    linkMarginDb: engineering.commsData.linkMarginDb,
    netDataBacklogPerDayGb: engineering.commsData.netDataBacklogPerDayGb,
    storageCapacityGb: engineering.commsData.storageCapacityGb,
    odarCompliant: engineering.propulsion.odarCompliant,
    anomaliesResolvedCount: report.anomaliesResolvedCount,
    anomaliesTotalCount: report.anomaliesTotalCount,
    completionDurationSec: Math.max(60, Math.round(report.completionDurationSec)),
    seed: report.seed,
    configSignature,
    claimedTotalScore: report.totalScore,
  };
}

/** Validates submission parameters and telemetry invariants prior to network dispatch. */
export function validateLeaderboardSubmissionPayload(params: {
  playerAlias: string;
  countryCode?: string | null;
  missionCode: string;
  difficulty: MissionDifficulty;
  seasonCode: string;
  telemetry: LeaderboardVerificationTelemetry;
}): { valid: boolean; error?: string } {
  const aliasCheck = validatePlayerAlias(params.playerAlias);
  if (!aliasCheck.valid) {
    return { valid: false, error: aliasCheck.error };
  }

  if (!isValidIsoCountryCode(params.countryCode)) {
    return { valid: false, error: 'Selected country code must be a valid ISO-3166-1 alpha-2 code.' };
  }

  const missionCode = params.missionCode.trim().toUpperCase();
  if (!VALID_MISSION_CODES.has(missionCode)) {
    return { valid: false, error: `Unsupported mission code "${params.missionCode}".` };
  }

  if (!VALID_DIFFICULTIES.has(params.difficulty)) {
    return { valid: false, error: `Unsupported difficulty "${params.difficulty}".` };
  }

  if (!/^[0-9]{4}-S[1-4]$/.test(params.seasonCode.trim().toUpperCase())) {
    return { valid: false, error: 'Invalid season identifier format.' };
  }

  const t = params.telemetry;
  if (t.overallGateStatus === 'NO_GO' || t.batteryExhausted || t.finalSystemHealthPct <= 0) {
    return {
      valid: false,
      error: 'Only flights that passed Flight Readiness (GO/CAUTION) without mission loss can be submitted.',
    };
  }

  if (t.claimedTotalScore < 50 || t.claimedTotalScore > 100) {
    return {
      valid: false,
      error: 'Mission score must be between 50 and 100 to qualify for verified leaderboard rankings.',
    };
  }

  if (
    t.instrumentCount < 1 ||
    t.wetMassKg <= 0 ||
    t.wetMassKg > t.maxLaunchMassKg ||
    t.totalDataDownlinkedGb > t.totalDataCapturedGb * 1.05 + 0.1 ||
    t.anomaliesResolvedCount > t.anomaliesTotalCount ||
    t.completionDurationSec < 60
  ) {
    return {
      valid: false,
      error: 'Flight telemetry contains invalid physical bounds and was blocked before submission.',
    };
  }

  return { valid: true };
}

/** Submits a mission result for authoritative server-side score recomputation and ranking. */
export async function submitVerifiedMissionScore(params: {
  playerAlias: string;
  countryCode?: string | null;
  missionCode: string;
  difficulty: MissionDifficulty;
  seasonCode?: string;
  configurationName: string;
  telemetry: LeaderboardVerificationTelemetry;
}): Promise<LeaderboardSubmissionResult> {
  const seasonCode = (params.seasonCode ?? CURRENT_SEASON_CODE).trim().toUpperCase();
  const normalizedCountry =
    params.countryCode && params.countryCode.trim() !== ''
      ? params.countryCode.trim().toUpperCase()
      : null;

  const check = validateLeaderboardSubmissionPayload({
    playerAlias: params.playerAlias,
    countryCode: normalizedCountry,
    missionCode: params.missionCode,
    difficulty: params.difficulty,
    seasonCode,
    telemetry: params.telemetry,
  });
  if (!check.valid) {
    return { ok: false, error: check.error };
  }

  const identity = savePlayerIdentityPreferences(params.playerAlias, normalizedCountry);

  if (!isSupabaseConfigured || !supabaseClient) {
    return {
      ok: false,
      offline: true,
      error: 'International leaderboard is currently offline (Supabase not configured).',
    };
  }

  let authWarning: string | undefined;

  try {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) {
      authWarning = `Session check failed (${sessionError.message}); using pseudonymous fallback token.`;
    } else if (!sessionData?.session) {
      try {
        const { error: anonError } = await supabaseClient.auth.signInAnonymously();
        if (anonError) {
          authWarning = `Anonymous auth unavailable (${anonError.message}); using pseudonymous fallback token.`;
        }
      } catch (anonErr) {
        authWarning =
          anonErr instanceof Error
            ? `Anonymous auth unavailable (${anonErr.message}); using pseudonymous fallback token.`
            : 'Anonymous auth unavailable; using pseudonymous fallback token.';
      }
    }

    // Strip any client-side verification flags defensively; the server owns verification_status.
    const sanitizedTelemetry = JSON.parse(JSON.stringify(params.telemetry)) as Record<
      string,
      unknown
    >;
    delete sanitizedTelemetry.isVerified;
    delete sanitizedTelemetry.is_verified;
    delete sanitizedTelemetry.verificationStatus;
    delete sanitizedTelemetry.verification_status;

    const { data, error } = await supabaseClient.rpc('submit_verified_mission_score', {
      p_player_token: identity.playerToken,
      p_player_alias: identity.playerAlias,
      p_country_code: identity.countryCode,
      p_mission_code: params.missionCode.trim().toUpperCase(),
      p_difficulty: params.difficulty,
      p_season_code: seasonCode,
      p_configuration_name: params.configurationName.trim().slice(0, 80),
      p_telemetry: sanitizedTelemetry as unknown as import('../types/database.types').Json,
    });

    if (error) {
      return { ok: false, authWarning, error: formatLeaderboardRpcError(error.message) };
    }

    const payload = (data ?? {}) as Record<string, unknown>;
    if (payload.ok !== true) {
      return {
        ok: false,
        authWarning,
        error:
          typeof payload.error === 'string'
            ? payload.error
            : 'Score rejected by server verification.',
      };
    }

    const verificationStatus =
      payload.verificationStatus === 'VERIFIED' ||
      payload.verificationStatus === 'UNVERIFIED' ||
      payload.verificationStatus === 'PROVISIONAL'
        ? payload.verificationStatus
        : 'PROVISIONAL';

    return {
      ok: true,
      authWarning,
      entryId: typeof payload.entryId === 'string' ? payload.entryId : undefined,
      verifiedScore:
        typeof payload.verifiedScore === 'number' ? payload.verifiedScore : undefined,
      bestScore: typeof payload.bestScore === 'number' ? payload.bestScore : undefined,
      grade: typeof payload.grade === 'string' ? payload.grade : undefined,
      outcome: typeof payload.outcome === 'string' ? payload.outcome : undefined,
      isNewPersonalBest: Boolean(payload.isNewPersonalBest),
      isVerified: Boolean(payload.isVerified),
      verificationStatus,
    };
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : 'Unable to reach verification server.';
    return {
      ok: false,
      authWarning,
      error: formatLeaderboardRpcError(rawMessage),
    };
  }
}

function formatLeaderboardRpcError(rawMessage: string): string {
  const lower = rawMessage.toLowerCase();
  if (
    lower.includes('could not find the function') ||
    lower.includes('schema cache') ||
    lower.includes('pgrst202')
  ) {
    return `Leaderboard unavailable: RPC function not found. (${rawMessage})`;
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('fetch failed') ||
    lower.includes('load failed') ||
    lower.includes('network request failed') ||
    lower.includes('unable to reach')
  ) {
    return `Leaderboard temporarily unavailable: connection error (${rawMessage})`;
  }
  return rawMessage;
}

/** Fetches ranked international leaderboard standings without fabricating placeholder entries when offline. */
export async function fetchMissionLeaderboard(
  params: LeaderboardQueryParams
): Promise<LeaderboardQueryResult> {
  if (!isSupabaseConfigured || !supabaseClient) {
    return {
      status: 'OFFLINE',
      totalCount: 0,
      entries: [],
      playerEntry: null,
      nearbyEntries: [],
    };
  }

  const normalizedCountry =
    params.countryCode && params.countryCode.trim() !== ''
      ? params.countryCode.trim().toUpperCase()
      : null;

  if (normalizedCountry && !isValidIsoCountryCode(normalizedCountry)) {
    return {
      status: 'ERROR',
      totalCount: 0,
      entries: [],
      playerEntry: null,
      nearbyEntries: [],
      errorMessage: 'Invalid ISO-3166-1 alpha-2 country filter.',
    };
  }

  try {
    const identity = getOrCreatePlayerIdentity();
    const { data, error } = await supabaseClient.rpc('get_mission_leaderboard', {
      p_mission_code: params.missionCode.trim().toUpperCase(),
      p_difficulty: params.difficulty,
      p_season_code: params.seasonCode.trim().toUpperCase(),
      p_country_code: normalizedCountry,
      p_player_token: identity.playerToken,
      p_limit: Math.min(100, Math.max(1, params.limit ?? 25)),
      p_offset: Math.max(0, params.offset ?? 0),
    });

    if (error) {
      return {
        status: 'ERROR',
        totalCount: 0,
        entries: [],
        playerEntry: null,
        nearbyEntries: [],
        errorMessage: formatLeaderboardRpcError(error.message),
      };
    }

    const payload = (data ?? {}) as Record<string, unknown>;
    return {
      status: 'OK',
      totalCount: typeof payload.totalCount === 'number' ? payload.totalCount : 0,
      entries: Array.isArray(payload.entries) ? (payload.entries as LeaderboardEntry[]) : [],
      playerEntry: (payload.playerEntry as LeaderboardEntry | null) ?? null,
      nearbyEntries: Array.isArray(payload.nearbyEntries)
        ? (payload.nearbyEntries as LeaderboardEntry[])
        : [],
    };
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : 'Leaderboard query failed.';
    return {
      status: 'ERROR',
      totalCount: 0,
      entries: [],
      playerEntry: null,
      nearbyEntries: [],
      errorMessage: formatLeaderboardRpcError(rawMessage),
    };
  }
}
