import type { OrbitalMechanicsResult, PowerBudgetResult } from '../types/engineering';
import type { GateStatus } from '../types/mission';
import type { ScientificInstrument, SpacecraftComponent } from '../types/spacecraft';
import { DEG_TO_RAD, JOULES_PER_WATT_HOUR, SOLAR_CONSTANT_1AU_W_M2 } from './constants';

const INHERENT_DEGRADATION_ID = 0.77; // SMAD Table 21-10 nominal array assembly factor
const ANNUAL_CELL_DEGRADATION = 0.025; // 2.5% per year radiation/UV degradation
const BATTERY_CHARGE_EFFICIENCY = 0.92;
const BATTERY_DISCHARGE_EFFICIENCY = 0.92;
const BATTERY_MAX_DISCHARGE_C_RATE = 1.0; // Conservative 1C continuous discharge limit for space Li-Ion packs
const MIN_OPERATIONAL_SOC_PCT = 20.0; // Critical brownout / load-shedding floor (80% max emergency DoD)

/**
 * Computes solar irradiance (W/m²) at heliocentric distance r (AU) using the inverse-square law:
 * G(r) = G_1AU / r²
 * Reference: NASA Goddard Solar Constant at 1 AU = 1361 W/m².
 */
export function computeSolarIrradianceAtAu(distanceAu: number): number {
  if (!Number.isFinite(distanceAu) || distanceAu <= 0) {
    return 0;
  }
  return SOLAR_CONSTANT_1AU_W_M2 / (distanceAu * distanceAu);
}

export interface BatteryStepResult {
  nextEnergyWh: number;
  nextEnergyJ: number;
  socPct: number;
  dodPct: number;
  exhausted: boolean;
  dodBreached: boolean;
  belowMinOperationalSoc: boolean;
}

/**
 * Advances battery stored energy (Wh and J) over dtSeconds with strict unit separation
 * (1 Wh = 3,600 J; W * s = J), charging/discharging efficiencies, non-negative energy floor,
 * Depth-of-Discharge monitoring, and minimum operational state-of-charge threshold.
 */
export function stepBatteryEnergyWh(params: {
  currentEnergyWh: number;
  capacityWh: number;
  netPowerW: number;
  dtSeconds: number;
  chargeEfficiency?: number;
  dischargeEfficiency?: number;
  maxDodFraction?: number;
  minOperationalSocPct?: number;
}): BatteryStepResult {
  const {
    currentEnergyWh,
    capacityWh,
    netPowerW,
    dtSeconds,
    chargeEfficiency = BATTERY_CHARGE_EFFICIENCY,
    dischargeEfficiency = BATTERY_DISCHARGE_EFFICIENCY,
    maxDodFraction = 0.35,
    minOperationalSocPct = MIN_OPERATIONAL_SOC_PCT,
  } = params;

  const safeCapWh = Math.max(0, capacityWh);
  if (safeCapWh <= 0) {
    return {
      nextEnergyWh: 0,
      nextEnergyJ: 0,
      socPct: 0,
      dodPct: 100,
      exhausted: true,
      dodBreached: true,
      belowMinOperationalSoc: true,
    };
  }

  const clampedCurrentWh = Math.max(0, Math.min(safeCapWh, currentEnergyWh));
  const dtHours = Math.max(0, dtSeconds) / 3600.0;

  const energyDeltaWh =
    netPowerW >= 0
      ? netPowerW * dtHours * Math.min(1, Math.max(0.1, chargeEfficiency))
      : (netPowerW * dtHours) / Math.min(1, Math.max(0.1, dischargeEfficiency));

  const nextEnergyWh = Math.max(0, Math.min(safeCapWh, clampedCurrentWh + energyDeltaWh));
  const socPct = Number(((nextEnergyWh / safeCapWh) * 100).toFixed(2));
  const dodPct = Number((100 - socPct).toFixed(2));
  const exhausted = nextEnergyWh <= 0.001;
  const dodBreached = dodPct > maxDodFraction * 100;
  const belowMinOperationalSoc = socPct < minOperationalSocPct;

  return {
    nextEnergyWh: Number(nextEnergyWh.toFixed(4)),
    nextEnergyJ: Number((nextEnergyWh * JOULES_PER_WATT_HOUR).toFixed(1)),
    socPct,
    dodPct,
    exhausted,
    dodBreached,
    belowMinOperationalSoc,
  };
}

/**
 * Evaluates the Spacecraft Electrical Power Subsystem (EPS) in SI units (W, Wh).
 * Computes BOL/EOL Solar Generation, Orbit-Average Power Required, Power Margin,
 * and Battery Eclipse Depth of Discharge (DoD).
 */
export function evaluatePowerBudget(params: {
  bus: SpacecraftComponent;
  subsystems: SpacecraftComponent[];
  instruments: ScientificInstrument[];
  orbital: OrbitalMechanicsResult;
  solarFluxWPerM2?: number;
  sunIncidenceAngleDeg?: number;
  designLifetimeYears?: number;
  requiredPowerMarginPct?: number;
  maxAllowedDodOverridePct?: number;
}): PowerBudgetResult {
  const {
    bus,
    subsystems,
    instruments,
    orbital,
    solarFluxWPerM2 = SOLAR_CONSTANT_1AU_W_M2,
    sunIncidenceAngleDeg = 15.0,
    designLifetimeYears = 3.0,
    requiredPowerMarginPct = 15.0,
    maxAllowedDodOverridePct,
  } = params;

  const solarArrays = subsystems.filter((s) => s.category === 'SOLAR_ARRAY');
  const batteries = subsystems.filter((s) => s.category === 'BATTERY');

  // Cosine incidence factor: 0 at >= 90 deg grazing/backside incidence (no artificial floor)
  const cosTheta = Math.max(0, Math.cos(sunIncidenceAngleDeg * DEG_TO_RAD));
  const fluxRatio = solarFluxWPerM2 / SOLAR_CONSTANT_1AU_W_M2;

  // BOL Solar Power P_BOL = sum of array outputs scaled by flux & cosine incidence
  const bolSolarPowerW = solarArrays.reduce((sum, sa) => {
    if (sa.solarAreaM2 && sa.cellEfficiency) {
      return sum + solarFluxWPerM2 * sa.solarAreaM2 * sa.cellEfficiency * INHERENT_DEGRADATION_ID * cosTheta;
    }
    return sum + (sa.powerOutputW ?? 0) * fluxRatio * cosTheta;
  }, 0);

  const lifeDegradationFactor = Math.pow(1 - ANNUAL_CELL_DEGRADATION, Math.max(0, designLifetimeYears));
  const eolSolarPowerW = bolSolarPowerW * lifeDegradationFactor;

  // Base bus + non-heater subsystem loads (using component continuous powerDrawW)
  const baseSubsystemsLoadW =
    bus.powerDrawW +
    subsystems
      .filter((s) => s.category !== 'SOLAR_ARRAY' && s.category !== 'THERMAL')
      .reduce((sum, s) => sum + s.powerDrawW, 0);

  const thermalComponents = subsystems.filter((s) => s.category === 'THERMAL');
  const activeCoolingLoadW = thermalComponents.reduce((sum, t) => sum + t.powerDrawW, 0);
  const eclipseHeaterLoadW = thermalComponents.reduce((sum, t) => sum + (t.heaterPowerW ?? 8), 0);

  // Average duty-cycled instrument loads vs simultaneous peak operating loads
  const instrumentDayLoadW = instruments.reduce((sum, inst) => {
    const duty = Math.max(0, Math.min(1, inst.defaultDutyCycle));
    return sum + inst.powerOperatingW * duty + inst.powerStandbyW * (1 - duty);
  }, 0);

  const instrumentEclipseLoadW = instruments.reduce((sum, inst) => {
    if (inst.nightCapable) {
      const duty = Math.max(0, Math.min(1, inst.defaultDutyCycle * 0.75));
      return sum + inst.powerOperatingW * duty + inst.powerStandbyW * (1 - duty);
    }
    return sum + inst.powerStandbyW;
  }, 0);

  const instrumentPeakDayLoadW = instruments.reduce((sum, inst) => sum + inst.powerOperatingW, 0);
  const instrumentPeakEclipseLoadW = instruments.reduce(
    (sum, inst) => sum + (inst.nightCapable ? inst.powerOperatingW : inst.powerStandbyW),
    0
  );

  const sunlightLoadW = baseSubsystemsLoadW + activeCoolingLoadW + instrumentDayLoadW;
  const eclipseLoadW = baseSubsystemsLoadW + eclipseHeaterLoadW + instrumentEclipseLoadW;

  const peakSunlitLoadW = baseSubsystemsLoadW + activeCoolingLoadW + instrumentPeakDayLoadW;
  const peakEclipseLoadW = baseSubsystemsLoadW + eclipseHeaterLoadW + instrumentPeakEclipseLoadW;

  const tSunSec = Math.max(0, orbital.sunlightDurationSec);
  const tEclSec = Math.max(0, orbital.eclipseDurationSec);

  // SMAD Eq. 21-7: Required solar array power to power day loads AND recharge battery from eclipse
  const rechargePowerRequiredW =
    tSunSec > 0
      ? (eclipseLoadW * tEclSec) / (BATTERY_CHARGE_EFFICIENCY * BATTERY_DISCHARGE_EFFICIENCY * tSunSec)
      : eclipseLoadW > 0
        ? 999999
        : 0;
  const orbitAverageRequiredPowerW = sunlightLoadW + rechargePowerRequiredW;

  const powerMarginW = eolSolarPowerW - orbitAverageRequiredPowerW;
  const powerMarginPct =
    orbitAverageRequiredPowerW > 0 ? (powerMarginW / orbitAverageRequiredPowerW) * 100 : -100;

  const batteryCapacityWh = batteries.reduce((sum, b) => sum + (b.batteryCapacityWh ?? 0), 0);
  const batteryCapacityJ = batteryCapacityWh * JOULES_PER_WATT_HOUR;
  const maxBatteryDischargePowerW = batteryCapacityWh * BATTERY_MAX_DISCHARGE_C_RATE;
  const hardwareMaxDodPct =
    batteries.length > 0 ? Math.max(...batteries.map((b) => (b.maxDodFraction ?? 0.35) * 100)) : 30.0;
  const maxAllowedDodPct =
    maxAllowedDodOverridePct !== undefined
      ? Math.min(hardwareMaxDodPct, maxAllowedDodOverridePct)
      : hardwareMaxDodPct;

  const eclipseHours = tEclSec / 3600.0;
  const eclipseEnergyDrawWh = (eclipseLoadW * eclipseHours) / BATTERY_DISCHARGE_EFFICIENCY;
  const eclipseEnergyDrawJ = eclipseEnergyDrawWh * JOULES_PER_WATT_HOUR;
  const eclipseDodPct = batteryCapacityWh > 0 ? (eclipseEnergyDrawWh / batteryCapacityWh) * 100 : 100.0;

  // Peak power validation: spacecraft must satisfy both sunlit simultaneous peak (solar + battery discharge)
  // and eclipse peak (battery discharge only at rated C-rate).
  const sunlitPeakMarginW = eolSolarPowerW + maxBatteryDischargePowerW - peakSunlitLoadW;
  const eclipsePeakMarginW =
    tEclSec > 0 ? maxBatteryDischargePowerW - peakEclipseLoadW : Number.POSITIVE_INFINITY;
  const peakPowerValid =
    batteryCapacityWh > 0 && sunlitPeakMarginW >= 0 && eclipsePeakMarginW >= 0;

  const peakLoadW =
    eclipsePeakMarginW < sunlitPeakMarginW ? peakEclipseLoadW : peakSunlitLoadW;
  const peakSupplyW =
    eclipsePeakMarginW < sunlitPeakMarginW
      ? maxBatteryDischargePowerW
      : eolSolarPowerW + maxBatteryDischargePowerW;

  const minOperationalSocPct = MIN_OPERATIONAL_SOC_PCT;
  const usableEnergyWh = batteryCapacityWh * (1 - minOperationalSocPct / 100);
  const eclipseBreachesMinSoc = eclipseEnergyDrawWh > usableEnergyWh;

  let status: GateStatus = 'GO';
  if (
    powerMarginW < 0 ||
    !peakPowerValid ||
    eclipseDodPct > 80 ||
    eclipseBreachesMinSoc ||
    batteryCapacityWh <= 0 ||
    solarArrays.length === 0 ||
    eolSolarPowerW <= 0
  ) {
    status = 'NO_GO';
  } else if (powerMarginPct < requiredPowerMarginPct || eclipseDodPct > maxAllowedDodPct) {
    status = 'CAUTION';
  }

  return {
    bolSolarPowerW: Number(bolSolarPowerW.toFixed(1)),
    eolSolarPowerW: Number(eolSolarPowerW.toFixed(1)),
    sunlightLoadW: Number(sunlightLoadW.toFixed(1)),
    eclipseLoadW: Number(eclipseLoadW.toFixed(1)),
    peakLoadW: Number(peakLoadW.toFixed(1)),
    peakSupplyW: Number(peakSupplyW.toFixed(1)),
    peakPowerValid,
    orbitAverageRequiredPowerW: Number(orbitAverageRequiredPowerW.toFixed(1)),
    powerMarginW: Number(powerMarginW.toFixed(1)),
    powerMarginPct: Number(powerMarginPct.toFixed(1)),
    batteryCapacityWh: Number(batteryCapacityWh.toFixed(1)),
    batteryCapacityJ: Number(batteryCapacityJ.toFixed(0)),
    maxBatteryDischargePowerW: Number(maxBatteryDischargePowerW.toFixed(1)),
    eclipseEnergyDrawWh: Number(eclipseEnergyDrawWh.toFixed(1)),
    eclipseEnergyDrawJ: Number(eclipseEnergyDrawJ.toFixed(0)),
    eclipseDodPct: Number(eclipseDodPct.toFixed(1)),
    maxAllowedDodPct: Number(maxAllowedDodPct.toFixed(1)),
    minOperationalSocPct,
    status,
    traces: [
      {
        id: 'eps-solar-balance',
        title: 'EOL Solar Power, Orbit-Average Balance & Peak Power Check',
        symbolicEquation:
          'P_EOL = G₀ A_sa η_cell I_d cos(θ) (1 - d)^L;   P_req = P_day + (P_ecl T_ecl) / (η_c η_d T_sun);   P_peak ≤ P_EOL + P_bat,max',
        classification: 'ENGINEERING_APPROXIMATION',
        referenceStandard: 'SMAD Ch. 21 (Eq. 21-7) Electrical Power Subsystem Sizing',
        inputs: {
          G_0: { value: solarFluxWPerM2, unit: 'W/m²', description: 'Ambient solar irradiance' },
          cos_theta: { value: Number(cosTheta.toFixed(3)), unit: '-', description: 'Cosine of sun incidence angle' },
          P_BOL: { value: Number(bolSolarPowerW.toFixed(1)), unit: 'W', description: 'Beginning-of-Life array power' },
          P_day: { value: Number(sunlightLoadW.toFixed(1)), unit: 'W', description: 'Average daylight load' },
          P_ecl: { value: Number(eclipseLoadW.toFixed(1)), unit: 'W', description: 'Average eclipse load' },
          P_peak: { value: Number(peakLoadW.toFixed(1)), unit: 'W', description: 'Peak simultaneous demand (governing case)' },
          P_peak_cap: { value: Number(peakSupplyW.toFixed(1)), unit: 'W', description: 'Available peak supply (1C battery + EOL solar)' },
        },
        output: {
          value: Number(powerMarginPct.toFixed(1)),
          unit: '%',
          formatted: `${eolSolarPowerW.toFixed(1)} W avg vs ${orbitAverageRequiredPowerW.toFixed(1)} W req | Peak: ${peakLoadW.toFixed(0)}/${peakSupplyW.toFixed(0)} W`,
        },
      },
      {
        id: 'eps-battery-dod',
        title: 'Battery Eclipse Depth of Discharge (DoD) & Energy Draw',
        symbolicEquation: 'E_draw(J) = 3600 · (P_ecl · T_ecl / 3600) / η_d;   DoD_% = (E_draw / E_bat) × 100',
        classification: 'PHYSICAL_LAW',
        referenceStandard: 'NASA CubeSat 101 / Li-Ion Cycle Life Derating Standard',
        inputs: {
          E_bat: { value: batteryCapacityWh, unit: 'Wh', description: `Nameplate Li-Ion battery capacity (${batteryCapacityJ.toFixed(0)} J)` },
          T_ecl: { value: Number((tEclSec / 60).toFixed(1)), unit: 'min', description: 'Orbital shadow duration' },
          E_draw: { value: Number(eclipseEnergyDrawWh.toFixed(1)), unit: 'Wh', description: `Energy extracted per eclipse (${eclipseEnergyDrawJ.toFixed(0)} J)` },
        },
        output: {
          value: Number(eclipseDodPct.toFixed(1)),
          unit: '%',
          formatted: `${eclipseDodPct.toFixed(1)}% DoD (Cyclic Limit: ${maxAllowedDodPct.toFixed(0)}%, Emergency Floor: ${minOperationalSocPct.toFixed(0)}% SoC)`,
        },
      },
    ],
  };
}
