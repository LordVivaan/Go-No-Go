import type { GateStatus, MissionDifficulty } from './mission';

export type InstrumentMode = 'HIGH_RES' | 'NOMINAL_SURVEY' | 'STANDBY' | 'OFF';

export type SimEventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type SimEventType =
  | 'ANOMALY_INJECTED'
  | 'OPERATOR_COMMAND'
  | 'GROUND_PASS_START'
  | 'GROUND_PASS_END'
  | 'TARGET_OVERFLIGHT'
  | 'ECLIPSE_ENTER'
  | 'ECLIPSE_EXIT'
  | 'MILESTONE';

export interface SimEvent {
  id: string;
  metSeconds: number;
  type: SimEventType;
  severity: SimEventSeverity;
  subsystem: 'EPS' | 'COMMS' | 'THERMAL' | 'PROPULSION' | 'PAYLOAD' | 'ORBIT' | 'FLIGHT_CONTROL';
  title: string;
  description: string;
  requiresAction?: boolean;
  resolved?: boolean;
  recommendedCommandId?: string;
}

export interface TelemetryPoint {
  metSeconds: number;
  orbitNumber: number;
  trueAnomalyDeg: number;
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeKm: number;
  velocityMps: number;
  positionEciKm: [number, number, number];
  inEclipse: boolean;
  solarGenerationW: number;
  powerLoadW: number;
  batterySocPct: number;
  ssrBacklogGb: number;
  cumulativeDataCapturedGb: number;
  cumulativeDataDownlinkedGb: number;
  cumulativeDataLostGb: number;
  propellantRemainingKg: number;
  temperatureC: number;
  linkMarginDb: number;
  activeGroundStationId: string | null;
  activeTargetRegionId: string | null;
  systemHealthPct: number;
}

export interface ActiveAnomaly {
  id: string;
  code: string;
  title: string;
  subsystem: 'EPS' | 'COMMS' | 'THERMAL' | 'PROPULSION' | 'PAYLOAD';
  severity: 'WARNING' | 'CRITICAL';
  triggeredAtMetSec: number;
  description: string;
  powerPenaltyW: number;
  solarEfficiencyMultiplier: number;
  tempOffsetC: number;
  downlinkMultiplier: number;
  mitigationCommand: string;
  mitigationLabel: string;
  resolved: boolean;
}

export interface KPPEvaluationItem {
  kppId: string;
  name: string;
  measuredText: string;
  thresholdText: string;
  goalText: string;
  status: GateStatus;
  scoreNormalized: number; // 0.0 to 1.0
}

export interface MissionScoreReport {
  runId: string;
  scenarioId: string;
  difficulty: MissionDifficulty;
  configurationName: string;
  completedAtIso: string;
  seed: number;
  completionDurationSec: number;
  outcome: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'MISSION_LOSS';
  failureReason?: string;
  totalScore: number; // 0 to 100 (35 + 25 + 15 + 15 + 10)
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  scienceScore: number; // out of 35
  completionReliabilityScore: number; // out of 25
  resourceEfficiencyScore: number; // out of 15
  dataCommsScore: number; // out of 15
  riskCollabScore: number; // out of 10 (Risk Management)
  penaltiesApplied: string[];
  totalDataCapturedGb: number;
  totalDataDownlinkedGb: number;
  totalDataLostGb: number;
  floodRegionsMappedCount: number;
  anomaliesResolvedCount: number;
  anomaliesTotalCount: number;
  kppEvaluations: KPPEvaluationItem[];
  debriefNotes: string[];
}
