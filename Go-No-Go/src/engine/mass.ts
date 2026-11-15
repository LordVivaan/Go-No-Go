import type { MassBudgetResult } from '../types/engineering';
import type { GateStatus } from '../types/mission';
import type { FormFactor, LaunchVehicle, SpacecraftComponent, ScientificInstrument } from '../types/spacecraft';

/**
 * Preserved baseline helper from initial src/engine/mass.js
 */
export function calculateMass(components: Array<{ mass?: number; massKg?: number }>): number {
  return components.reduce(
    (total, component) => total + (component.massKg ?? component.mass ?? 0),
    0
  );
}

/**
 * Preserved baseline helper from initial src/engine/mass.js
 */
export function calculatePowerMargin(
  powerGenerated: number,
  components: Array<{ powerDraw?: number; powerDrawW?: number }>
): number {
  const powerConsumed = components.reduce(
    (total, component) => total + (component.powerDrawW ?? component.powerDraw ?? 0),
    0
  );
  return powerGenerated - powerConsumed;
}

/**
 * Preserved baseline helper from initial src/engine/mass.js
 */
export function calculateRemainingBudget(
  initialBudget: number,
  components: Array<{ cost?: number; costMusd?: number }>,
  devCost: number,
  launchCost: number,
  opsCost: number,
  integrationCost = 0,
  testingCost = 0
): { totalRemaining: number; safeRemaining: number } {
  const componentCost = components.reduce(
    (total, component) => total + (component.costMusd ?? component.cost ?? 0),
    0
  );
  const totalSpent = componentCost + devCost + integrationCost + testingCost + launchCost + opsCost;
  const contingencyReserve = initialBudget * 0.20;
  return {
    totalRemaining: initialBudget - totalSpent,
    safeRemaining: initialBudget - contingencyReserve - totalSpent,
  };
}

/**
 * Preserved baseline helper from initial src/engine/mass.js
 */
export function calculateDataBacklog(
  previousBacklog: number,
  dataGenerated: number,
  dataTransmitted: number,
  maxStorage: number
): number {
  let currentBacklog = previousBacklog + dataGenerated - dataTransmitted;
  currentBacklog = Math.max(0, currentBacklog);
  return Math.min(currentBacklog, maxStorage);
}

const FORM_FACTOR_RANK: Record<FormFactor, number> = {
  '1U': 1,
  '3U': 2,
  '6U': 3,
  SMALLSAT: 4,
  ESPA: 5,
};

/**
 * Computes full Spacecraft Dry/Wet Mass Budget & Launch Mass Margin in SI units (kg).
 *
 * Units: All masses in kilograms (kg); margins in kg and %.
 * Assumptions:
 * - Dry mass = bus structure + non-propellant subsystem hardware + scientific instruments.
 * - Wet mass = dry mass + usable/loaded propellant mass.
 * - Launch margin is computed strictly against the launch vehicle's payload capacity
 *   for the selected destination orbital regime (LEO, SSO, MEO, GEO/Molniya/Deep-Space),
 *   while bus structural capacity (maxBusMassKg) is verified independently.
 */
export function evaluateMassBudget(params: {
  bus: SpacecraftComponent;
  subsystems: SpacecraftComponent[];
  instruments: ScientificInstrument[];
  launchVehicle: LaunchVehicle;
  orbitalRegime: string;
  requiredMarginPct?: number;
}): MassBudgetResult {
  const { bus, subsystems, instruments, launchVehicle, orbitalRegime, requiredMarginPct = 15.0 } = params;

  const subsystemDryMassKg = subsystems.reduce((sum, s) => sum + s.massKg, 0);
  const instrumentMassKg = instruments.reduce((sum, i) => sum + i.massKg, 0);
  const dryMassKg = bus.massKg + subsystemDryMassKg + instrumentMassKg;

  const propellantMassKg = subsystems.reduce((sum, s) => sum + (s.propellantMassKg ?? 0), 0);
  const wetMassKg = dryMassKg + propellantMassKg;

  const maxBusMassKg = bus.maxPayloadMassKg ?? 250;
  const busFormFactor = bus.compatibleFormFactors[0] ?? 'SMALLSAT';
  const busRank = FORM_FACTOR_RANK[busFormFactor];

  const incompatibilityReasons: string[] = [];

  // Check if all selected instruments and subsystems fit inside the selected bus form factor
  const instrumentsFitBus = instruments.every((inst) => FORM_FACTOR_RANK[inst.minFormFactor] <= busRank);
  if (!instrumentsFitBus) {
    incompatibilityReasons.push(`One or more instruments exceed ${busFormFactor} bus envelope.`);
  }
  const subsystemsFitBus = subsystems.every((sub) =>
    sub.compatibleFormFactors.some((ff) => FORM_FACTOR_RANK[ff] <= busRank)
  );
  if (!subsystemsFitBus) {
    incompatibilityReasons.push(`One or more subsystems are incompatible with ${busFormFactor} bus.`);
  }
  const lvSupportsBus = launchVehicle.supportedFormFactors.includes(busFormFactor);
  if (!lvSupportsBus) {
    incompatibilityReasons.push(`${launchVehicle.name} does not support ${busFormFactor} spacecraft dispenser/adapter.`);
  }
  const withinSlotLimit = instruments.length <= (bus.payloadSlots ?? 4);
  if (!withinSlotLimit) {
    incompatibilityReasons.push(`Instrument count (${instruments.length}) exceeds ${busFormFactor} payload slot limit (${bus.payloadSlots ?? 4}).`);
  }

  // Determine launch vehicle payload capacity strictly for the chosen destination orbit
  let maxLaunchMassKg = launchVehicle.maxMassLeoKg;
  if (
    orbitalRegime === 'GEO' ||
    orbitalRegime === 'MOLNIYA' ||
    orbitalRegime.includes('LUNAR') ||
    orbitalRegime.includes('MARS') ||
    orbitalRegime.includes('ASTEROID')
  ) {
    maxLaunchMassKg = launchVehicle.maxMassCislunarKg;
  } else if (orbitalRegime === 'MEO') {
    maxLaunchMassKg = Math.round((launchVehicle.maxMassSsoKg + launchVehicle.maxMassCislunarKg) / 2);
  } else if (orbitalRegime.includes('SSO')) {
    maxLaunchMassKg = launchVehicle.maxMassSsoKg;
  }

  const busStructuralMarginKg = maxBusMassKg - wetMassKg;
  if (busStructuralMarginKg < 0) {
    incompatibilityReasons.push(`Wet mass (${wetMassKg.toFixed(1)} kg) exceeds bus structural limit (${maxBusMassKg.toFixed(1)} kg).`);
  }

  const launchMarginKg = maxLaunchMassKg - wetMassKg;
  const launchMarginPct = maxLaunchMassKg > 0 ? (launchMarginKg / maxLaunchMassKg) * 100 : -100;
  if (launchMarginKg < 0) {
    incompatibilityReasons.push(
      `Wet mass (${wetMassKg.toFixed(1)} kg) exceeds ${launchVehicle.name} ${orbitalRegime} capacity (${maxLaunchMassKg.toFixed(1)} kg).`
    );
  }

  const formFactorCompatible =
    instrumentsFitBus &&
    subsystemsFitBus &&
    lvSupportsBus &&
    withinSlotLimit &&
    busStructuralMarginKg >= 0;

  let status: GateStatus = 'GO';
  if (!formFactorCompatible || launchMarginKg < 0) {
    status = 'NO_GO';
  } else if (launchMarginPct < requiredMarginPct) {
    status = 'CAUTION';
  }

  return {
    dryMassKg: Number(dryMassKg.toFixed(2)),
    propellantMassKg: Number(propellantMassKg.toFixed(2)),
    wetMassKg: Number(wetMassKg.toFixed(2)),
    maxBusMassKg: Number(maxBusMassKg.toFixed(2)),
    maxLaunchMassKg: Number(maxLaunchMassKg.toFixed(2)),
    busStructuralMarginKg: Number(busStructuralMarginKg.toFixed(2)),
    launchMarginKg: Number(launchMarginKg.toFixed(2)),
    launchMarginPct: Number(launchMarginPct.toFixed(1)),
    formFactorCompatible,
    incompatibilityReasons,
    status,
    trace: {
      id: 'mass-budget',
      title: 'Spacecraft Wet Mass & Launch Margin',
      symbolicEquation:
        'm_dry = m_bus + Σ m_sub + Σ m_inst;  m_wet = m_dry + m_prop;  Margin_% = ((m_LV(orbit) - m_wet) / m_LV(orbit)) × 100',
      classification: 'PHYSICAL_LAW',
      referenceStandard: 'NASA GEVS (GSFC-STD-7000A) / AIAA S-120A Mass Properties Control',
      inputs: {
        m_bus: { value: bus.massKg, unit: 'kg', description: `Bus dry structure (${bus.name})` },
        m_subsystems: { value: Number(subsystemDryMassKg.toFixed(2)), unit: 'kg', description: 'Total subsystem dry mass' },
        m_instruments: { value: Number(instrumentMassKg.toFixed(2)), unit: 'kg', description: 'Total science payload mass' },
        m_prop: { value: Number(propellantMassKg.toFixed(2)), unit: 'kg', description: 'Onboard propellant load' },
        m_LV_orbit: { value: maxLaunchMassKg, unit: 'kg', description: `Launch vehicle capacity for ${orbitalRegime}` },
        m_bus_max: { value: maxBusMassKg, unit: 'kg', description: 'Bus structural wet-mass limit' },
      },
      output: {
        value: Number(launchMarginPct.toFixed(1)),
        unit: '%',
        formatted: `${wetMassKg.toFixed(1)} / ${maxLaunchMassKg.toFixed(1)} kg (${launchMarginPct.toFixed(1)}% launch margin)`,
      },
      notes: 'AIAA S-120A / NASA Phase B guidelines recommend ≥ 15% unallocated launch mass margin prior to CDR.',
    },
  };
}
