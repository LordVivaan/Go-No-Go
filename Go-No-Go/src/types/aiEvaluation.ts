import type { EngineeringSummary } from './engineering';
import type { MissionDifficulty, ScenarioDefinition } from './mission';
import type { LaunchVehicle, OrbitalParameters, ScientificInstrument, SpacecraftComponent } from './spacecraft';

export type AiCategoryKey =
  | 'science'
  | 'reliability'
  | 'resourceEfficiency'
  | 'communications'
  | 'riskManagement';

export interface AiCategoryScores {
  science: number; // 0-35
  reliability: number; // 0-25
  resourceEfficiency: number; // 0-15
  communications: number; // 0-15
  riskManagement: number; // 0-10
}

export interface AiDeductionItem {
  category: AiCategoryKey;
  points: number;
  finding: string;
  engineeringImpact: string;
  recommendedCorrection: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export type AiAssessment = 'GO' | 'CAUTION' | 'NO-GO';

export interface AiMissionEvaluationReport {
  evaluationId: string;
  evaluationVersion: string;
  model: string;
  snapshotHash: string;
  overallScore: number;
  categoryScores: AiCategoryScores;
  assessment: AiAssessment;
  summary: string;
  strengths: string[];
  deductions: AiDeductionItem[];
  criticalFailures: string[];
  engineeringRationale: string[];
  limitations: string[];
  educationalDisclaimer: string;
  evaluatedAtIso: string;
  cached?: boolean;
}

export interface DeterministicScoreReference {
  totalScore: number;
  scienceScore: number;
  completionReliabilityScore: number;
  resourceEfficiencyScore: number;
  dataCommsScore: number;
  riskCollabScore: number;
  outcome: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'MISSION_LOSS';
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface OperationsPlanConfig {
  missionDurationDays: number;
  payloadDutyCyclePct: number;
  downlinkCadencePerDay: number;
  powerReservePct: number;
  attitudePriority: 'SCIENCE_NADIR' | 'SUN_TRACKING' | 'COMMS_POINTING' | 'BALANCED';
  observationSchedule: 'CONTINUOUS' | 'TARGET_WINDOWS' | 'ECLIPSE_SAFE';
}

export interface MissionEvaluationRequestPayload {
  runId: string;
  configurationName: string;
  difficulty: MissionDifficulty;
  scenario: Pick<
    ScenarioDefinition,
    'id' | 'code' | 'title' | 'celestialBody' | 'budgetCapMusd' | 'simulationDurationDays'
  > & {
    primaryObjective: string;
    targetRegionsCount: number;
  };
  bus: Pick<
    SpacecraftComponent,
    'id' | 'name' | 'massKg' | 'powerDrawW' | 'costMusd' | 'maxPayloadMassKg' | 'compatibleFormFactors'
  >;
  instruments: Array<
    Pick<
      ScientificInstrument,
      | 'id'
      | 'name'
      | 'type'
      | 'massKg'
      | 'powerOperatingW'
      | 'dataRateMbps'
      | 'resolutionM'
      | 'defaultDutyCycle'
      | 'nightCapable'
      | 'cloudPenetrating'
    > & {
      effectiveDutyCyclePct: number;
    }
  >;
  subsystems: Array<Pick<SpacecraftComponent, 'id' | 'category' | 'name' | 'massKg' | 'powerDrawW' | 'powerOutputW' | 'costMusd'>>;
  orbit: OrbitalParameters;
  launchVehicle: Pick<LaunchVehicle, 'id' | 'name' | 'provider' | 'costMusd' | 'reliability'>;
  operationsPlan: OperationsPlanConfig;
  userLaunchAuthorization: 'PENDING' | 'GO' | 'NO_GO';
  riskAcknowledged: boolean;
  engineering: EngineeringSummary;
  simulation: {
    completed: boolean;
    outcome: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'MISSION_LOSS';
    failureReason?: string;
    completionDurationSec: number;
    totalDataCapturedGb: number;
    totalDataDownlinkedGb: number;
    totalDataLostGb: number;
    regionsMappedCount: number;
    anomaliesResolvedCount: number;
    anomaliesTotalCount: number;
    finalSystemHealthPct: number;
    batteryExhausted: boolean;
    eventsLog: string[];
  };
  deterministicScore: DeterministicScoreReference;
}
