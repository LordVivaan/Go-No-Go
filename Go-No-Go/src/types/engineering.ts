import type { FormulaTrace, GateStatus } from './mission';

export interface MassBudgetResult {
  dryMassKg: number;
  propellantMassKg: number;
  wetMassKg: number;
  maxBusMassKg: number;
  maxLaunchMassKg: number;
  busStructuralMarginKg: number;
  launchMarginKg: number;
  launchMarginPct: number;
  formFactorCompatible: boolean;
  incompatibilityReasons: string[];
  status: GateStatus;
  trace: FormulaTrace;
}

export interface OrbitalMechanicsResult {
  semiMajorAxisKm: number;
  eccentricity: number;
  perigeeRadiusKm: number;
  apogeeRadiusKm: number;
  velocityPerigeeMps: number;
  velocityApogeeMps: number;
  meanVelocityMps: number;
  orbitalPeriodSec: number;
  orbitalPeriodMin: number;
  orbitsPerDay: number;
  eclipseFraction: number;
  sunlightDurationSec: number;
  eclipseDurationSec: number;
  nodalPrecessionDegPerDay: number;
  isSunSynchronous: boolean;
  isGeostationary: boolean;
  isValidOrbit: boolean;
  orbitValidationMessage?: string;
  revisitHours: number;
  traces: FormulaTrace[];
}

export interface PowerBudgetResult {
  bolSolarPowerW: number;
  eolSolarPowerW: number;
  sunlightLoadW: number;
  eclipseLoadW: number;
  peakLoadW: number;
  peakSupplyW: number;
  peakPowerValid: boolean;
  orbitAverageRequiredPowerW: number;
  powerMarginW: number;
  powerMarginPct: number;
  batteryCapacityWh: number;
  batteryCapacityJ: number;
  maxBatteryDischargePowerW: number;
  eclipseEnergyDrawWh: number;
  eclipseEnergyDrawJ: number;
  eclipseDodPct: number;
  maxAllowedDodPct: number;
  minOperationalSocPct: number;
  status: GateStatus;
  traces: FormulaTrace[];
}

export interface DataAndLinkBudgetResult {
  dataGeneratedPerOrbitGb: number;
  dataGeneratedPerDayGb: number;
  compressionRatio: number;
  downlinkPerPassGb: number;
  passesPerDay: number;
  downlinkCapacityPerDayGb: number;
  netDataBacklogPerDayGb: number;
  storageCapacityGb: number;
  slantRangeKm: number;
  fsplDb: number;
  otherLossesDb: number;
  eirpDbw: number;
  receivedPowerDbw: number;
  ebN0ReceivedDb: number;
  ebN0RequiredDb: number;
  linkMarginDb: number;
  shannonCapacityCeilingMbps: number;
  status: GateStatus;
  traces: FormulaTrace[];
}

export interface PropulsionBudgetResult {
  availableDeltaVMps: number;
  requiredDeltaVMps: number;
  deltaVMarginMps: number;
  deltaVMarginPct: number;
  thrustNewtons: number;
  massFlowRateKgPerSec: number;
  maxBurnDurationSec: number;
  requiredPropellantKg: number;
  odarCompliant: boolean;
  status: GateStatus;
  trace: FormulaTrace;
}

export interface ThermalBalanceResult {
  equilibriumHotTempC: number;
  equilibriumColdTempC: number;
  equilibriumHotTempK: number;
  equilibriumColdTempK: number;
  thermalCapacityJPerK: number;
  minAllowedTempC: number;
  maxAllowedTempC: number;
  heaterPowerUsedW: number;
  status: GateStatus;
  traces: FormulaTrace[];
}

export interface CostBudgetResult {
  hardwareCostMusd: number;
  developmentCostMusd: number;
  integrationCostMusd: number;
  testingCostMusd: number;
  launchCostMusd: number;
  operationsCostMusd: number;
  totalSpentMusd: number;
  contingencyReserveMusd: number;
  totalRemainingMusd: number;
  safeRemainingMusd: number;
  budgetMarginPct: number;
  status: GateStatus;
  trace: FormulaTrace;
}

export interface ReliabilityResult {
  subsystemReliability: number;
  seriesChainReliability: number;
  redundantChainReliability: number;
  launchReliability: number;
  combinedMissionReliability: number;
  missionRiskProbability: number;
  riskScoreNormalized: number;
  hazardRatePerYear: number;
  minTrl: number;
  requiredReliabilityThreshold: number;
  hasRedundantAvionics: boolean;
  status: GateStatus;
  trace: FormulaTrace;
}

export type ValidationFindingSeverity = 'PASS' | 'WARNING' | 'FAIL' | 'INFORMATION';

export type ValidationSubsystem =
  | 'SCIENCE'
  | 'MASS'
  | 'POWER'
  | 'COMMS'
  | 'DATA'
  | 'ORBIT'
  | 'PROPULSION'
  | 'THERMAL'
  | 'BUDGET'
  | 'RELIABILITY';

export interface ValidationFinding {
  id: string;
  subsystem: ValidationSubsystem;
  severity: ValidationFindingSeverity;
  title: string;
  actualValue: string;
  requiredValue: string;
  units: string;
  explanation: string;
  suggestedCorrectiveAction: string;
  resourceRoute: string;
}

export interface CMLChecklistItem {
  id: string;
  cmlLevel: number; // CML 1 to 6 (JPL 13-3547_A1b)
  kdpPhase: string; // e.g., 'KDP-B / SRR', 'KDP-C / PDR', 'KDP-D / CDR', 'FRR'
  category: 'SCIENCE' | 'MASS' | 'POWER' | 'COMMS_DATA' | 'ORBIT_PROPULSION' | 'THERMAL' | 'COST_RISK';
  title: string;
  requirementText: string;
  measuredValueText: string;
  status: GateStatus;
  remediationHint?: string;
  resourceRoute?: string;
}

export interface ValidationVerdict {
  overallStatus: GateStatus;
  achievedCmlLevel: number;
  canLaunch: boolean;
  goCount: number;
  cautionCount: number;
  noGoCount: number;
  checklist: CMLChecklistItem[];
  findings: ValidationFinding[];
}

export interface EngineeringSummary {
  mass: MassBudgetResult;
  orbital: OrbitalMechanicsResult;
  power: PowerBudgetResult;
  commsData: DataAndLinkBudgetResult;
  propulsion: PropulsionBudgetResult;
  thermal: ThermalBalanceResult;
  budget: CostBudgetResult;
  reliability: ReliabilityResult;
  validation: ValidationVerdict;
}
