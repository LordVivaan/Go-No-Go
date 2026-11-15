import type { ReliabilityResult } from '../types/engineering';
import type { GateStatus, RiskClass } from '../types/mission';
import type { LaunchVehicle, ScientificInstrument, SpacecraftComponent } from '../types/spacecraft';

const RISK_CLASS_THRESHOLDS: Record<
  RiskClass,
  { minReliability: number; minTrl: number; requireRedundantAvionics: boolean }
> = {
  A: { minReliability: 0.90, minTrl: 7, requireRedundantAvionics: true },
  B: { minReliability: 0.86, minTrl: 6, requireRedundantAvionics: true },
  C: { minReliability: 0.78, minTrl: 5, requireRedundantAvionics: false },
  D: { minReliability: 0.68, minTrl: 4, requireRedundantAvionics: false },
};

/**
 * Evaluates Series/Parallel Subsystem Reliability & NASA NPR 8705.4B Payload Risk Classification compliance.
 */
export function evaluateReliabilityAndRisk(params: {
  bus: SpacecraftComponent;
  subsystems: SpacecraftComponent[];
  instruments: ScientificInstrument[];
  launchVehicle: LaunchVehicle;
  riskClass: RiskClass;
  designLifetimeYears?: number;
}): ReliabilityResult {
  const { bus, subsystems, instruments, launchVehicle, riskClass, designLifetimeYears = 3.0 } = params;

  const allItems = [bus, ...subsystems, ...instruments];
  const minTrl = allItems.length > 0 ? Math.min(...allItems.map((i) => i.trl)) : 9;

  // Constant-hazard-rate lifetime scaling from 3-year catalog reliability to designLifetimeYears:
  // lambda_i = -ln(R_3yr) / 3, R_i(T) = exp(-lambda_i * T)
  const scaleToLifetime = (r3Yr: number) => {
    const safeR = Math.max(0.01, Math.min(0.9999, r3Yr));
    const lambdaPerYr = -Math.log(safeR) / 3.0;
    return Math.exp(-lambdaPerYr * Math.max(0.25, designLifetimeYears));
  };

  // Strict series chain (single-string non-redundant bus/subsystem units)
  const seriesItems = [bus, ...subsystems].filter((i) => !i.isRedundant);
  const redundantItems = [bus, ...subsystems].filter((i) => i.isRedundant);

  const seriesChainReliability = seriesItems.reduce(
    (prod, item) => prod * scaleToLifetime(item.reliability3Yr),
    1.0
  );

  // Independent 1-of-2 hot/cold parallel redundancy assumption: R_par = 1 - (1 - R(T))^2
  const redundantChainReliability = redundantItems.reduce((prod, item) => {
    const r = scaleToLifetime(item.reliability3Yr);
    return prod * (1 - Math.pow(1 - r, 2));
  }, 1.0);

  const busAndSubReliability = seriesChainReliability * redundantChainReliability;

  // Payload reliability:
  // - Single sensor: direct series R_inst(T)
  // - Multiple sensors: 1-of-N parallel science survival 1 - prod(1 - R_j(T)) (assumes independent channels, no artificial multiplier)
  const payloadReliability =
    instruments.length === 0
      ? 0
      : instruments.length === 1
        ? scaleToLifetime(instruments[0].reliability3Yr)
        : 1 -
          instruments.reduce(
            (unrelProd, inst) => unrelProd * (1 - scaleToLifetime(inst.reliability3Yr)),
            1.0
          );

  // Low TRL (< 6) introduces schedule/on-orbit infant mortality penalty
  const trlPenalty = minTrl < 5 ? 0.08 : minTrl === 5 ? 0.03 : 0.0;
  const subsystemReliability = Math.max(
    0.001,
    Math.min(0.999, busAndSubReliability * payloadReliability * (1 - trlPenalty))
  );

  const hazardRatePerYear =
    -Math.log(subsystemReliability) / Math.max(0.25, designLifetimeYears);

  const launchReliability = launchVehicle.reliability;
  const combinedMissionReliability = subsystemReliability * launchReliability;
  const missionRiskProbability = 1 - combinedMissionReliability;

  // Game-level normalized risk index [0, 1] combining failure probability & low-TRL exposure
  const riskScoreNormalized = Math.max(
    0,
    Math.min(1, missionRiskProbability * 0.8 + (minTrl < 6 ? (6 - minTrl) * 0.05 : 0))
  );

  const hasRedundantAvionics = subsystems.some(
    (s) => s.category === 'AVIONICS' && s.isRedundant === true
  );
  const threshold = RISK_CLASS_THRESHOLDS[riskClass];

  let status: GateStatus = 'GO';
  if (
    subsystemReliability < threshold.minReliability - 0.08 ||
    minTrl < threshold.minTrl - 1 ||
    (threshold.requireRedundantAvionics && !hasRedundantAvionics)
  ) {
    status = 'NO_GO';
  } else if (subsystemReliability < threshold.minReliability || minTrl < threshold.minTrl) {
    status = 'CAUTION';
  }

  return {
    subsystemReliability: Number(subsystemReliability.toFixed(3)),
    seriesChainReliability: Number(seriesChainReliability.toFixed(3)),
    redundantChainReliability: Number(redundantChainReliability.toFixed(3)),
    launchReliability: Number(launchReliability.toFixed(3)),
    combinedMissionReliability: Number(combinedMissionReliability.toFixed(3)),
    missionRiskProbability: Number(missionRiskProbability.toFixed(3)),
    riskScoreNormalized: Number(riskScoreNormalized.toFixed(3)),
    hazardRatePerYear: Number(hazardRatePerYear.toFixed(4)),
    minTrl,
    requiredReliabilityThreshold: threshold.minReliability,
    hasRedundantAvionics,
    status,
    trace: {
      id: 'reliability-npr-8705',
      title: `Subsystem Reliability & NPR 8705.4B Class ${riskClass} Risk Benchmark (Educational)`,
      symbolicEquation:
        'λ = -ln(R_sys)/T;   R_series = ∏ R_i(T);   R_par = ∏ [1 - (1 - R_j(T))²];   R_sys = R_series·R_par·R_pay·(1 - p_TRL)',
      classification: 'ENGINEERING_APPROXIMATION',
      referenceStandard: 'NASA NPR 8705.4B Risk Classification (Educational constant-hazard approximation)',
      inputs: {
        riskClass: { value: `Class ${riskClass}`, unit: 'NPR 8705.4B', description: 'Payload risk tolerance class' },
        R_series: { value: Number((seriesChainReliability * 100).toFixed(1)), unit: '%', description: 'Single-string series chain reliability' },
        R_parallel: { value: Number((redundantChainReliability * 100).toFixed(1)), unit: '%', description: 'Independent redundant chain reliability' },
        R_LV: { value: Number((launchReliability * 100).toFixed(1)), unit: '%', description: 'Launch vehicle reliability' },
        lambda_yr: { value: Number(hazardRatePerYear.toFixed(4)), unit: 'yr⁻¹', description: 'Equivalent spacecraft constant hazard rate' },
        min_TRL: { value: minTrl, unit: 'TRL 1-9', description: 'Lowest component Technology Readiness Level' },
      },
      output: {
        value: Number((subsystemReliability * 100).toFixed(1)),
        unit: '%',
        formatted: `R_sys = ${(subsystemReliability * 100).toFixed(1)}% (Req ≥ ${(threshold.minReliability * 100).toFixed(0)}%) | Risk Index = ${riskScoreNormalized.toFixed(2)}`,
      },
      notes:
        'Assumes statistically independent constant-hazard-rate failures (exponential model) and 1-of-2 parallel redundancy where flagged. Educational engineering estimate — not formal NASA Safety & Mission Assurance certification.',
    },
  };
}
