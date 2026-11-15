export type RiskClass = 'A' | 'B' | 'C' | 'D';

export type CelestialBodyId = 'EARTH' | 'MOON' | 'MARS' | 'ASTEROID';

export type MissionSegment = 'LAUNCH' | 'SPACE' | 'GROUND' | 'USER';

export type GateStatus = 'GO' | 'CAUTION' | 'NO_GO';

export type MissionDifficulty = 'STANDARD' | 'HARD' | 'EXPERT';

export interface DifficultyProfile {
  id: MissionDifficulty;
  label: string;
  subtitle: string;
  description: string;
  budgetMultiplier: number;
  minMassMarginPct: number;
  minPowerMarginPct: number;
  maxBatteryDodPct: number;
  minLinkMarginDb: number;
  minDeltaVMarginPct: number;
  scienceDataMultiplier: number;
  anomalyRateMultiplier: number;
  anomalyStressMultiplier: number;
}

export type FormulaClassification =
  | 'PHYSICAL_LAW'
  | 'ENGINEERING_APPROXIMATION'
  | 'GAMEPLAY_RULE';

export interface FormulaTrace {
  id: string;
  title: string;
  symbolicEquation: string;
  classification: FormulaClassification;
  referenceStandard: string;
  inputs: Record<string, { value: number | string; unit: string; description: string }>;
  output: { value: number; unit: string; formatted: string };
  notes?: string;
}

export interface KeyPerformanceParameter {
  id: string;
  name: string;
  metricKey:
    | 'revisitHours'
    | 'dailyDataGb'
    | 'bestResolutionM'
    | 'allWeatherCapable'
    | 'nightCapable'
    | 'deltaVMarginPct'
    | 'systemReliability';
  unit: string;
  thresholdValue: number | boolean;
  goalValue: number | boolean;
  comparison: 'LTE' | 'GTE' | 'BOOL_TRUE';
  description: string;
}

export interface TargetRegion {
  id: string;
  name: string;
  latitudeDeg: number;
  longitudeDeg: number;
  radiusKm: number;
  cloudCoverFraction: number; // 0.0 to 1.0
  priorityWeight: number;
  description: string;
}

export interface ScenarioTelemetryConstraints {
  minPowerMarginPct: number;
  maxEclipseDodPct: number;
  minLinkMarginDb: number;
  minDeltaVMarginPct: number;
  dataCompressionRatio: number;
}

export interface ScenarioEventRule {
  id: string;
  triggerMetHours: number;
  title: string;
  description: string;
  subsystem: 'POWER' | 'COMMS' | 'THERMAL' | 'PROPULSION' | 'PAYLOAD' | 'AVIONICS';
}

export interface ScenarioScoringProfile {
  scienceWeight: number;
  reliabilityWeight: number;
  resourceWeight: number;
  commsWeight: number;
  riskCollabWeight: number;
}

export interface ScenarioDefinition {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  celestialBody: CelestialBodyId;
  riskClass: RiskClass; // NPR 8705.4B
  budgetCapMusd: number; // $M USD
  developmentCostMusd: number; // Base Phase A-D SE/PM cost ($M)
  operationsCostMusd: number; // Mission operations & ground segment cost ($M)
  designLifetimeYears: number;
  simulationDurationDays: number;
  solarFluxWPerM2: number; // 1361 for Earth/Moon (1 AU), 586 for Mars (1.524 AU)
  recommendedOrbitId: string;
  briefing: {
    context: string;
    primaryObjective: string;
    constraintsSummary: string[];
    segments: Record<MissionSegment, string>;
  };
  targetRegions: TargetRegion[];
  kpps: KeyPerformanceParameter[];
  requiredInstrumentTypes?: string[];
  telemetryConstraints?: ScenarioTelemetryConstraints;
  scenarioEvents?: ScenarioEventRule[];
  scoringProfile?: ScenarioScoringProfile;
  isPlayable: boolean;
}
