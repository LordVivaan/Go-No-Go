import type { MassBudgetResult, PropulsionBudgetResult } from '../types/engineering';
import type { GateStatus } from '../types/mission';
import type { LaunchVehicle, OrbitalParameters, SpacecraftComponent } from '../types/spacecraft';
import { STANDARD_GRAVITY_M_S2 } from './constants';

/**
 * Computes Tsiolkovsky Rocket Equation Delta-V:
 * Δv = I_sp * g_0 * ln(m_wet / m_dry)  [m/s]
 */
export function computeTsiolkovskyDeltaVMps(
  ispSeconds: number,
  wetMassKg: number,
  dryMassKg: number
): number {
  if (ispSeconds <= 0 || wetMassKg <= dryMassKg || dryMassKg <= 0) {
    return 0;
  }
  return ispSeconds * STANDARD_GRAVITY_M_S2 * Math.log(wetMassKg / dryMassKg);
}

/**
 * Computes required propellant mass (kg) from dry mass, target Δv (m/s), and Isp (s):
 * m_prop = m_dry · (exp(Δv / (I_sp · g_0)) - 1)
 */
export function computeRequiredPropellantKg(
  dryMassKg: number,
  targetDeltaVMps: number,
  ispSeconds: number
): number {
  if (ispSeconds <= 0 || targetDeltaVMps <= 0 || dryMassKg <= 0) {
    return 0;
  }
  const massRatio = Math.exp(targetDeltaVMps / (ispSeconds * STANDARD_GRAVITY_M_S2));
  return dryMassKg * (massRatio - 1);
}

/**
 * Evaluates spacecraft Propulsion Delta-V, Thrust/Burn kinematics & NASA ODAR Orbital Debris Mitigation compliance.
 */
export function evaluatePropulsionBudget(params: {
  subsystems: SpacecraftComponent[];
  mass: MassBudgetResult;
  orbit: OrbitalParameters;
  launchVehicle: LaunchVehicle;
  requiredDeltaVMarginPct?: number;
}): PropulsionBudgetResult {
  const { subsystems, mass, orbit, launchVehicle, requiredDeltaVMarginPct = 15.0 } = params;
  const thrusters = subsystems.filter((s) => s.category === 'PROPULSION');

  // Select primary thruster without mutating the caller's subsystems slice
  const primaryThruster = [...thrusters].sort(
    (a, b) => (b.ispSeconds ?? 0) - (a.ispSeconds ?? 0)
  )[0];
  const ispSeconds = primaryThruster?.ispSeconds ?? 0;
  const thrustNewtons = thrusters.reduce((sum, t) => sum + (t.thrustNewtons ?? 0), 0);

  const availableDeltaVMps = computeTsiolkovskyDeltaVMps(
    ispSeconds,
    mass.wetMassKg,
    mass.dryMassKg
  );

  // Required Delta-V = Orbit Maintenance + ODAR Disposal + Launch Injection Trim
  const requiredDeltaVMps = orbit.requiredDeltaVReserveMps + launchVehicle.injectionAccuracyMps;
  const deltaVMarginMps = availableDeltaVMps - requiredDeltaVMps;
  const deltaVMarginPct =
    requiredDeltaVMps > 0 ? (deltaVMarginMps / requiredDeltaVMps) * 100 : 100;

  const massFlowRateKgPerSec =
    ispSeconds > 0 && thrustNewtons > 0
      ? thrustNewtons / (ispSeconds * STANDARD_GRAVITY_M_S2)
      : 0;
  const maxBurnDurationSec =
    massFlowRateKgPerSec > 0 ? mass.propellantMassKg / massFlowRateKgPerSec : 0;
  const requiredPropellantKg = computeRequiredPropellantKg(
    mass.dryMassKg,
    requiredDeltaVMps,
    ispSeconds
  );

  // Low LEO (< 450 km) decays naturally within 25 years (NASA STD-8719.14 ODAR compliant even without thruster)
  const naturallyDecaysUnder25Yr =
    orbit.celestialBody === 'EARTH' && orbit.altitudeApogeeKm <= 450;
  const odarCompliant = naturallyDecaysUnder25Yr || availableDeltaVMps >= requiredDeltaVMps * 0.8;

  let status: GateStatus = 'GO';
  if (deltaVMarginMps < 0 && !naturallyDecaysUnder25Yr) {
    status = 'NO_GO';
  } else if (deltaVMarginPct < requiredDeltaVMarginPct) {
    status = 'CAUTION';
  }

  return {
    availableDeltaVMps: Number(availableDeltaVMps.toFixed(1)),
    requiredDeltaVMps: Number(requiredDeltaVMps.toFixed(1)),
    deltaVMarginMps: Number(deltaVMarginMps.toFixed(1)),
    deltaVMarginPct: Number(deltaVMarginPct.toFixed(1)),
    thrustNewtons: Number(thrustNewtons.toFixed(4)),
    massFlowRateKgPerSec: Number(massFlowRateKgPerSec.toFixed(6)),
    maxBurnDurationSec: Number(maxBurnDurationSec.toFixed(1)),
    requiredPropellantKg: Number(requiredPropellantKg.toFixed(3)),
    odarCompliant,
    status,
    trace: {
      id: 'propulsion-tsiolkovsky',
      title: 'Tsiolkovsky Rocket Equation, Burn Kinematics & ODAR Δv Budget',
      symbolicEquation:
        'Δv = I_sp·g₀·ln(m_wet/m_dry);  ṁ = F/(I_sp·g₀);  m_prop,req = m_dry·(e^(Δv_req/(I_sp·g₀)) - 1)',
      classification: 'PHYSICAL_LAW',
      referenceStandard: 'Tsiolkovsky (1903) & NASA-STD-8719.14 (ODAR 25-Year Rule)',
      inputs: {
        I_sp: { value: ispSeconds, unit: 's', description: 'Primary thruster specific impulse' },
        F_thrust: { value: Number(thrustNewtons.toFixed(3)), unit: 'N', description: 'Installed thruster force' },
        g_0: { value: STANDARD_GRAVITY_M_S2, unit: 'm/s²', description: 'Standard gravity constant' },
        m_wet: { value: mass.wetMassKg, unit: 'kg', description: 'Spacecraft wet mass at launch' },
        m_dry: { value: mass.dryMassKg, unit: 'kg', description: 'Spacecraft dry mass' },
        Δv_req: { value: Number(requiredDeltaVMps.toFixed(1)), unit: 'm/s', description: 'Required mission + disposal Δv' },
      },
      output: {
        value: Number(availableDeltaVMps.toFixed(1)),
        unit: 'm/s',
        formatted: `${availableDeltaVMps.toFixed(1)} m/s avail vs ${requiredDeltaVMps.toFixed(1)} m/s req (Req prop: ${requiredPropellantKg.toFixed(2)} kg)`,
      },
    },
  };
}
