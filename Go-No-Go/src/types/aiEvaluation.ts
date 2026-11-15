import type { EvaluationBasis } from '../data/nasaReferences';
import type { EngineeringSummary } from './engineering';
import type { MissionDifficulty, ScenarioDefinition } from './mission';
import type { LaunchVehicle, OrbitalParameters, ScientificInstrument, SpacecraftComponent } from './spacecraft';

export interface EvaluationDeduction {
  criterion: string;
  category: 'science' | 'reliability' | 'resource_efficiency' | 'data_comms' | 'risk_management';
  status: 'ASSESSED' | 'NOT_ASSESSED';
  maxPoints: number;
  pointsAwarded: number;
  pointsDeducted: number;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
  observedValue: string;
  expectedValueOrLimit: string;
  unit: string;
  evidence: string;
  technicalExplanation: string;
  consequence: string;
  recommendedCorrection: string;
  tradeOffs: string;
  basis: EvaluationBasis;
  nasaReferenceCode: string | null;
  nasaReferenceVersion: string | null;
  nasaReferenceUrl: string | null;
}

export interface AiCategoryEvaluation {
  weight: number;
  score: number; // 0-100
  weightedPoints: number;
  strengths: string[];
  deductions: EvaluationDeduction[];
}

export interface AiEngineeringRecommendation {
  title: string;
  whatFailed: string;
  whyItFailed: string;
  rootCause: string;
  recommendedChange: string;
  targetComponentOrParameter: string;
  suggestedParameterRange: string;
  tradeOff: string;
  verificationToRepeat: string;
}

export interface AiNasaReferenceCitation {
  code: string;
  title: string;
  version: string;
  url: string;
  basis: EvaluationBasis;
  relevance: string;
}

export interface AiMissionEvaluationReport {
  evaluationId: string;
  evaluationVersion: string;
  model: string;
  snapshotHash: string;
  overallScore: number;
  outcome: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'MISSION_LOSS';
  executiveSummary: string;
  categories: {
    science: AiCategoryEvaluation;
    reliability: AiCategoryEvaluation;
    resource_efficiency: AiCategoryEvaluation;
    data_comms: AiCategoryEvaluation;
    risk_management: AiCategoryEvaluation;
  };
  criticalFailures: string[];
  minorFindings: string[];
  engineeringRecommendations: AiEngineeringRecommendation[];
  nasaReferences: AiNasaReferenceCitation[];
  missionSuccesses: string[];
  missionLimitations: string[];
  evaluatedAtIso: string;
  cached?: boolean;
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
}
