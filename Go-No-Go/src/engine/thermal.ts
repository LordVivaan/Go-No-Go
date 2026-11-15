import type { OrbitalMechanicsResult, PowerBudgetResult, ThermalBalanceResult } from '../types/engineering';
import type { CelestialBodyId, GateStatus } from '../types/mission';
import type { SpacecraftComponent } from '../types/spacecraft';
import {
  KELVIN_OFFSET,
  R_ASTEROID_REF_KM,
  R_EARTH_EQ_KM,
  R_MARS_KM,
  R_MOON_KM,
  SOLAR_CONSTANT_1AU_W_M2,
  STEFAN_BOLTZMANN,
} from './constants';

const BODY_THERMAL_ENVIRONMENT: Record<
  CelestialBodyId,
  { radiusKm: number; albedo: number; irFluxWPerM2: number }
> = {
  EARTH: { radiusKm: R_EARTH_EQ_KM, albedo: 0.30, irFluxWPerM2: 237.0 },
  MOON: { radiusKm: R_MOON_KM, albedo: 0.12, irFluxWPerM2: 15.0 },
  MARS: { radiusKm: R_MARS_KM, albedo: 0.25, irFluxWPerM2: 110.0 },
  ASTEROID: { radiusKm: R_ASTEROID_REF_KM, albedo: 0.08, irFluxWPerM2: 2.0 },
};

const EFFECTIVE_SPACECRAFT_CP_J_PER_KG_K = 900.0; // Aluminum-alloy 6061/7075 lumped specific heat approximation

/**
 * Evaluates a simplified single-node isothermal radiative thermal equilibrium in Sunlight (Hot Case)
 * and Eclipse/Standby (Cold Case) in both Kelvin (K) and Celsius (°C), accounting for MLI blanketing,
 * inverse-square planetary view factor, and active thermal louver turndown ratio (SMAD Table 22-8).
 *
 * NOTE: Simplified 1-node educational model — NOT a multi-node spacecraft thermal design analysis.
 */
export function evaluateThermalBalance(params: {
  bus: SpacecraftComponent;
  subsystems: SpacecraftComponent[];
  power: PowerBudgetResult;
  orbital?: OrbitalMechanicsResult;
  solarFluxWPerM2?: number;
  celestialBody?: CelestialBodyId;
  spacecraftMassKg?: number;
}): ThermalBalanceResult {
  const {
    bus,
    subsystems,
    power,
    orbital,
    solarFluxWPerM2 = SOLAR_CONSTANT_1AU_W_M2,
    celestialBody = 'EARTH',
    spacecraftMassKg,
  } = params;

  const thermalControl = subsystems.find((s) => s.category === 'THERMAL');
  const env = BODY_THERMAL_ENVIRONMENT[celestialBody];

  const busAreaM2 = bus.radiatorAreaM2 ?? 0.55;
  const louverAreaM2 = thermalControl?.radiatorAreaM2 ?? 0.0;
  const totalSurfaceAreaM2 = busAreaM2 + louverAreaM2;

  const alphaBus = bus.absorptivityAlpha ?? 0.42;
  const alphaLouver = thermalControl?.absorptivityAlpha ?? alphaBus;
  const alphaEffective =
    (alphaBus * busAreaM2 + alphaLouver * louverAreaM2) / Math.max(0.05, totalSurfaceAreaM2);

  // Effective IR emissivity: MLI-blanketed bus + open radiator louvers in Hot Case
  const epsilonBus = bus.emissivityEpsilon ?? 0.52;
  const epsilonLouverOpen = thermalControl?.emissivityEpsilon ?? 0.82;
  const epsilonHot =
    (epsilonBus * 0.78 * busAreaM2 + epsilonLouverOpen * louverAreaM2) /
    Math.max(0.05, totalSurfaceAreaM2);

  // Active louvers close in cold case (turndown ratio modeled per SMAD Table 22-8)
  const epsilonCold = thermalControl ? epsilonHot * 0.28 : epsilonHot * 0.50;

  // Approximate geometric nadir view factor F = min(0.5, (R_body / a)^2), falling naturally at GEO/deep-space
  const rOrbitKm = orbital?.semiMajorAxisKm ?? env.radiusKm + 650;
  const radiusRatio = Math.min(1, env.radiusKm / Math.max(env.radiusKm, rOrbitKm));
  const planetViewFactor = Math.min(0.5, Math.max(0.005, radiusRatio * radiusRatio * 0.5));

  const projectedSolarAreaM2 = totalSurfaceAreaM2 * 0.30;
  const nadirAreaM2 = totalSurfaceAreaM2 * 0.32;
  const heaterPowerUsedW = thermalControl?.heaterPowerW ?? 8.0;

  // Hot Case (Sunlight + Albedo + Planetary IR + Sunlight Internal Dissipation)
  const qDirectSolarW = alphaEffective * solarFluxWPerM2 * projectedSolarAreaM2;
  const qAlbedoW =
    alphaEffective * env.albedo * solarFluxWPerM2 * nadirAreaM2 * planetViewFactor;
  const qPlanetIrW = epsilonHot * env.irFluxWPerM2 * nadirAreaM2 * planetViewFactor;
  const qInternalHotW = power.sunlightLoadW * 0.90;

  const qTotalHotW = qDirectSolarW + qAlbedoW + qPlanetIrW + qInternalHotW;
  const tempHotKelvin = Math.pow(
    qTotalHotW / Math.max(1e-12, STEFAN_BOLTZMANN * epsilonHot * totalSurfaceAreaM2),
    0.25
  );
  const equilibriumHotTempC = tempHotKelvin - KELVIN_OFFSET;

  // Cold Case (Eclipse or Standby Minimum Load with Louvers Closed & Survival Heater)
  const eclipseFraction = orbital?.eclipseFraction ?? 0.35;
  const solarColdContributionW = eclipseFraction === 0 ? qDirectSolarW * 0.55 : qAlbedoW * 0.35;
  const qInternalColdW = power.eclipseLoadW * 0.90 + heaterPowerUsedW;
  const qTotalColdW = qPlanetIrW + solarColdContributionW + qInternalColdW;

  const rawTempColdKelvin = Math.pow(
    qTotalColdW / Math.max(1e-12, STEFAN_BOLTZMANN * epsilonCold * totalSurfaceAreaM2),
    0.25
  );
  const tempColdKelvin = Math.min(tempHotKelvin - 4.0, rawTempColdKelvin);
  const equilibriumColdTempC = tempColdKelvin - KELVIN_OFFSET;

  const totalMassKg =
    spacecraftMassKg ??
    bus.massKg + subsystems.reduce((sum, s) => sum + s.massKg, 0);
  const thermalCapacityJPerK = Math.max(500, totalMassKg * EFFECTIVE_SPACECRAFT_CP_J_PER_KG_K);

  const minAllowedTempC = -10.0;
  const maxAllowedTempC = 45.0;

  let status: GateStatus = 'GO';
  if (equilibriumColdTempC < -20.0 || equilibriumHotTempC > 55.0) {
    status = 'NO_GO';
  } else if (equilibriumColdTempC < minAllowedTempC || equilibriumHotTempC > maxAllowedTempC) {
    status = 'CAUTION';
  }

  return {
    equilibriumHotTempC: Number(equilibriumHotTempC.toFixed(1)),
    equilibriumColdTempC: Number(equilibriumColdTempC.toFixed(1)),
    equilibriumHotTempK: Number(tempHotKelvin.toFixed(1)),
    equilibriumColdTempK: Number(tempColdKelvin.toFixed(1)),
    thermalCapacityJPerK: Number(thermalCapacityJPerK.toFixed(0)),
    minAllowedTempC,
    maxAllowedTempC,
    heaterPowerUsedW: Number(heaterPowerUsedW.toFixed(1)),
    status,
    traces: [
      {
        id: 'thermal-stefan-boltzmann',
        title: 'Simplified Single-Node Radiative Thermal Balance (Educational Model)',
        symbolicEquation:
          'T_eq(K) = [ (α_s G₀ A_proj + Q_albedo + Q_IR + Q_int) / (σ ε_IR A_rad) ]^(1/4);   T_C = T_K - 273.15',
        classification: 'ENGINEERING_APPROXIMATION',
        referenceStandard: 'SMAD Ch. 22 (Single-Node Isothermal Radiative Equilibrium; not detailed FEM thermal analysis)',
        inputs: {
          alpha_over_epsilon: {
            value: Number((alphaEffective / epsilonHot).toFixed(2)),
            unit: 'α/ε',
            description: 'Effective solar absorptivity to hot IR emissivity ratio',
          },
          view_factor: {
            value: Number(planetViewFactor.toFixed(3)),
            unit: '-',
            description: `${celestialBody} radiative view factor`,
          },
          A_rad: { value: Number(totalSurfaceAreaM2.toFixed(2)), unit: 'm²', description: 'Total effective radiating surface area' },
          C_th: { value: Number(thermalCapacityJPerK.toFixed(0)), unit: 'J/K', description: 'Lumped spacecraft thermal capacitance' },
          Q_hot: { value: Number(qTotalHotW.toFixed(1)), unit: 'W', description: 'Total absorbed/dissipated heat in sun' },
          Q_cold: { value: Number(qTotalColdW.toFixed(1)), unit: 'W', description: 'Total heat in cold case (with heater)' },
        },
        output: {
          value: Number(equilibriumHotTempC.toFixed(1)),
          unit: '°C',
          formatted: `[${equilibriumColdTempC.toFixed(1)}°C (${tempColdKelvin.toFixed(0)} K), ${equilibriumHotTempC >= 0 ? '+' : ''}${equilibriumHotTempC.toFixed(1)}°C (${tempHotKelvin.toFixed(0)} K)]`,
        },
        notes:
          'Simplified single-node radiative educational model assuming isothermal bus and uniform surface coatings; does not replace multi-node spacecraft thermal engineering.',
      },
    ],
  };
}
