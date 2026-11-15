import type { MissionDifficulty } from './mission';

export type LeaderboardScope = 'GLOBAL' | 'COUNTRY' | 'SEASON';

export const CURRENT_SEASON_CODE = '2026-S1';

export const SEASON_OPTIONS = [
  { code: '2026-S1', label: '2026 Season 1' },
  { code: 'ALL_TIME', label: 'All Seasons' },
] as const;

export interface IsoCountryOption {
  code: string;
  name: string;
}

export const ISO_COUNTRY_OPTIONS: IsoCountryOption[] = [
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'DE', name: 'Germany' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EG', name: 'Egypt' },
  { code: 'ES', name: 'Spain' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'GR', name: 'Greece' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IL', name: 'Israel' },
  { code: 'IN', name: 'India' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KR', name: 'South Korea' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MX', name: 'Mexico' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NO', name: 'Norway' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'QA', name: 'Qatar' },
  { code: 'RO', name: 'Romania' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SE', name: 'Sweden' },
  { code: 'SG', name: 'Singapore' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TR', name: 'Turkey' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'US', name: 'United States' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'ZA', name: 'South Africa' },
];

export type VerificationStatus = 'PROVISIONAL' | 'VERIFIED' | 'UNVERIFIED';

export interface LeaderboardEntry {
  id: string;
  rank: number;
  playerAlias: string;
  countryCode: string | null;
  missionCode: string;
  difficulty: MissionDifficulty;
  seasonCode: string;
  configurationName: string;
  totalScore: number;
  aiScore?: number | null;
  deterministicScore?: number | null;
  aiCategoryScores?: {
    science: number;
    reliability: number;
    resourceEfficiency: number;
    communications: number;
    riskManagement: number;
  } | null;
  scienceScore: number;
  reliabilityScore: number;
  efficiencyScore: number;
  commsScore: number;
  riskCollabScore: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  outcome: 'SUCCESS' | 'PARTIAL_SUCCESS';
  completionDurationSec: number;
  dataDownlinkedGb: number;
  regionsMappedCount: number;
  isVerified?: boolean;
  verificationStatus?: VerificationStatus;
  evaluationId?: string | null;
  evaluationVersion?: string | null;
  evaluationModel?: string | null;
  achievedAtIso: string;
  isCurrentPlayer?: boolean;
}

export interface LeaderboardQueryParams {
  missionCode: string;
  difficulty: MissionDifficulty;
  seasonCode: string;
  countryCode?: string | null;
  limit?: number;
  offset?: number;
}

export type LeaderboardStateClassification =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED_LOADING'
  | 'ONLINE'
  | 'EMPTY'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'PERMISSION_ERROR'
  | 'RPC_MISSING';

export interface LeaderboardQueryResult {
  status: 'OK' | 'OFFLINE' | 'ERROR';
  classification?: LeaderboardStateClassification;
  totalCount: number;
  entries: LeaderboardEntry[];
  playerEntry: LeaderboardEntry | null;
  nearbyEntries: LeaderboardEntry[];
  errorMessage?: string;
}

export interface LeaderboardVerificationTelemetry {
  overallGateStatus: 'GO' | 'CAUTION' | 'NO_GO';
  massStatus: 'GO' | 'CAUTION' | 'NO_GO';
  powerStatus: 'GO' | 'CAUTION' | 'NO_GO';
  propulsionStatus: 'GO' | 'CAUTION' | 'NO_GO';
  budgetStatus: 'GO' | 'CAUTION' | 'NO_GO';
  thermalStatus: 'GO' | 'CAUTION' | 'NO_GO';
  wetMassKg: number;
  maxBusMassKg: number;
  maxLaunchMassKg: number;
  powerMarginPct: number;
  eclipseDodPct: number;
  maxAllowedDodPct: number;
  totalSpentMusd: number;
  budgetCapMusd: number;
  avgFloodUtility: number;
  instrumentCount: number;
  hasCloudPenetrating: boolean;
  hasNightCapable: boolean;
  totalDataCapturedGb: number;
  totalDataDownlinkedGb: number;
  totalDataLostGb: number;
  floodRegionsMappedCount: number;
  targetRegionsTotalCount: number;
  combinedMissionReliability: number;
  finalSystemHealthPct: number;
  batteryExhausted: boolean;
  linkMarginDb: number;
  netDataBacklogPerDayGb: number;
  storageCapacityGb: number;
  odarCompliant: boolean;
  anomaliesResolvedCount: number;
  anomaliesTotalCount: number;
  completionDurationSec: number;
  seed: number;
  configSignature: string;
  claimedTotalScore: number;
}

export interface LeaderboardSubmissionResult {
  ok: boolean;
  offline?: boolean;
  authWarning?: string;
  entryId?: string;
  verifiedScore?: number;
  bestScore?: number;
  grade?: string;
  outcome?: string;
  isNewPersonalBest?: boolean;
  isVerified?: boolean;
  verificationStatus?: VerificationStatus;
  error?: string;
}
