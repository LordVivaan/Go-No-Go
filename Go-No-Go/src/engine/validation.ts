import { DEEP_SPACE_GROUND_STATIONS, GROUND_STATIONS } from '../data/groundStations';
import { DIFFICULTY_PROFILES } from '../data/scenarios';
import type {
  CMLChecklistItem,
  EngineeringSummary,
  ValidationFinding,
  ValidationFindingSeverity,
  ValidationVerdict,
} from '../types/engineering';
import type { GateStatus, MissionDifficulty, ScenarioDefinition } from '../types/mission';
import type {
  GroundStation,
  LaunchVehicle,
  OrbitalParameters,
  ScientificInstrument,
  SpacecraftComponent,
} from '../types/spacecraft';
import { evaluateCostBudget } from './budget';
import { evaluateDataAndLinkBudget } from './communications';
import { evaluateMassBudget } from './mass';
import { evaluateOrbitalMechanics } from './orbital';
import { evaluatePowerBudget } from './power';
import { evaluatePropulsionBudget } from './propulsion';
import { evaluateReliabilityAndRisk } from './reliability';
import { evaluateThermalBalance } from './thermal';

/**
 * Evaluates all 8 aerospace engineering domains for a spacecraft configuration
 * and produces a JPL CML 1–6 & NASA NPR 7120.5F / 8705.4B Flight Readiness Review
 * (GO / CAUTION / NO_GO) decision with full FormulaTrace provenance.
 */
export function evaluateMissionEngineering(params: {
  scenario: ScenarioDefinition;
  bus: SpacecraftComponent;
  subsystems: SpacecraftComponent[];
  instruments: ScientificInstrument[];
  orbit: OrbitalParameters;
  launchVehicle: LaunchVehicle;
  groundStations?: GroundStation[];
  difficulty?: MissionDifficulty;
}): EngineeringSummary {
  const {
    scenario,
    bus,
    subsystems,
    instruments,
    orbit,
    launchVehicle,
    groundStations,
    difficulty = 'STANDARD',
  } = params;

  const profile = DIFFICULTY_PROFILES[difficulty];
  const activeGroundStations =
    groundStations ??
    (scenario.celestialBody === 'EARTH' ? GROUND_STATIONS : DEEP_SPACE_GROUND_STATIONS);

  const maxSwathKm =
    instruments.length > 0 ? Math.max(...instruments.map((i) => i.swathWidthKm)) : 120;

  const orbital = evaluateOrbitalMechanics(orbit, maxSwathKm);

  const mass = evaluateMassBudget({
    bus,
    subsystems,
    instruments,
    launchVehicle,
    orbitalRegime: orbit.regime,
    requiredMarginPct: profile.minMassMarginPct,
  });

  const power = evaluatePowerBudget({
    bus,
    subsystems,
    instruments,
    orbital,
    designLifetimeYears: scenario.designLifetimeYears,
    solarFluxWPerM2: scenario.solarFluxWPerM2,
    requiredPowerMarginPct: profile.minPowerMarginPct,
    maxAllowedDodOverridePct: profile.maxBatteryDodPct,
  });

  const commsData = evaluateDataAndLinkBudget({
    subsystems,
    instruments,
    orbital,
    groundStations: activeGroundStations,
    celestialBody: orbit.celestialBody,
    compressionRatio: scenario.telemetryConstraints?.dataCompressionRatio ?? 1.0,
    requiredLinkMarginDb: profile.minLinkMarginDb,
  });

  const propulsion = evaluatePropulsionBudget({
    subsystems,
    mass,
    orbit,
    launchVehicle,
    requiredDeltaVMarginPct: profile.minDeltaVMarginPct,
  });

  const thermal = evaluateThermalBalance({
    bus,
    subsystems,
    power,
    orbital,
    solarFluxWPerM2: scenario.solarFluxWPerM2,
    celestialBody: orbit.celestialBody,
    spacecraftMassKg: mass.wetMassKg,
  });

  const budget = evaluateCostBudget({
    budgetCapMusd: scenario.budgetCapMusd,
    developmentCostMusd: scenario.developmentCostMusd,
    operationsCostMusd: scenario.operationsCostMusd,
    bus,
    subsystems,
    instruments,
    launchVehicle,
  });

  const reliability = evaluateReliabilityAndRisk({
    bus,
    subsystems,
    instruments,
    launchVehicle,
    riskClass: scenario.riskClass,
    designLifetimeYears: scenario.designLifetimeYears,
  });

  // Science & Cloud Penetration Gate
  const hasCloudPenetrating = instruments.some((inst) => inst.cloudPenetrating);
  const hasNightCapable = instruments.some((inst) => inst.nightCapable);

  let scienceStatus: GateStatus = 'GO';
  let scienceMeasured = `${instruments.length} Instrument(s) · ${hasCloudPenetrating ? 'All-Weather Radar/Active' : 'Optical/Passive Only'}`;
  let scienceRemediation: string | undefined;

  const isLunarScenario =
    scenario.celestialBody === 'MOON' ||
    scenario.code === 'LUNAR ICE MAPPER' ||
    scenario.code === 'LUNAR SCOUT';

  if (instruments.length === 0) {
    scienceStatus = 'NO_GO';
    scienceMeasured = '0 Instruments Selected';
    scienceRemediation = 'Select at least 1 scientific instrument in the Spacecraft Builder.';
  } else if (!mass.formFactorCompatible) {
    scienceStatus = 'NO_GO';
    scienceMeasured = `Envelope/Slot Mismatch (${instruments.length}/${bus.payloadSlots ?? 3} slots)`;
    scienceRemediation =
      mass.incompatibilityReasons[0] ??
      'Upgrade spacecraft bus form factor (e.g. ESPA SmallSat) or remove oversized instruments.';
  } else if (scenario.code === 'FLOODWATCH' && !hasCloudPenetrating) {
    scienceStatus = 'CAUTION';
    scienceMeasured = `${instruments.map((i) => i.shortCode).join(' + ')} (Blocked by 85% Monsoon Cloud Deck)`;
    scienceRemediation =
      'Add C-Band SAR, X-Band SAR, or Ka-Band Altimeter for all-weather monsoon flood mapping.';
  } else if (isLunarScenario && !hasNightCapable) {
    scienceStatus = 'NO_GO';
    scienceMeasured = 'Daylight-Only Sensor on Lunar PSR Mission';
    scienceRemediation = 'Add Neutron Spectrometer, Thermal IR, or Radar for unilluminated craters.';
  }

  const orbitPropStatus: GateStatus =
    !orbital.isValidOrbit || orbit.celestialBody !== scenario.celestialBody
      ? 'NO_GO'
      : propulsion.status;

  const checklist: CMLChecklistItem[] = [
    {
      id: 'chk-cml1-science',
      cmlLevel: 2,
      kdpPhase: 'KDP-A / MCR',
      category: 'SCIENCE',
      title: 'Science Traceability & All-Weather Payload Fit',
      requirementText:
        scenario.code === 'FLOODWATCH'
          ? '≥1 Cloud-Penetrating Sensor & Bus Slot Fit'
          : isLunarScenario
            ? '≥1 Night/PSR-Capable Sensor & Bus Slot Fit'
            : '≥1 Compatible Primary Sensor',
      measuredValueText: scienceMeasured,
      status: scienceStatus,
      remediationHint: scienceRemediation,
      resourceRoute: '/architecture?category=INSTRUMENTS',
    },
    {
      id: 'chk-cml3-mass',
      cmlLevel: 3,
      kdpPhase: 'KDP-B / SRR',
      category: 'MASS',
      title: 'AIAA S-120A Wet Mass & Launch Fairing Margin',
      requirementText: `≥ ${profile.minMassMarginPct.toFixed(1)}% Launch & Structural Mass Margin`,
      measuredValueText: `${mass.wetMassKg} kg / ${mass.maxLaunchMassKg} kg (${mass.launchMarginPct > 0 ? '+' : ''}${mass.launchMarginPct}%)`,
      status: mass.status,
      remediationHint:
        mass.status !== 'GO'
          ? mass.incompatibilityReasons[0] ??
            'Upgrade spacecraft bus / launch vehicle or reduce heavy payload mass.'
          : undefined,
      resourceRoute: mass.formFactorCompatible ? '/orbit' : '/architecture?category=BUS',
    },
    {
      id: 'chk-cml4-power',
      cmlLevel: 4,
      kdpPhase: 'KDP-C / PDR',
      category: 'POWER',
      title: 'SMAD Eq. 21-7 EOL Power Margin & Eclipse Battery DoD',
      requirementText: `≥ ${profile.minPowerMarginPct}% Power Margin, Peak Load Fit & ≤ ${power.maxAllowedDodPct}% Battery DoD`,
      measuredValueText: `${power.eolSolarPowerW} W EOL (${power.powerMarginPct > 0 ? '+' : ''}${power.powerMarginPct}%) · Peak ${power.peakLoadW}/${power.peakSupplyW} W · ${power.eclipseDodPct}% DoD`,
      status: power.status,
      remediationHint:
        power.status !== 'GO'
          ? !power.peakPowerValid
            ? 'Peak simultaneous load exceeds battery discharge + solar rating; add larger battery capacity.'
            : 'Select larger GaAs solar wings, higher Wh Li-Ion battery, or Dawn-Dusk SSO orbit.'
          : undefined,
      resourceRoute: '/architecture?category=SOLAR_ARRAY',
    },
    {
      id: 'chk-cml4-comms',
      cmlLevel: 4,
      kdpPhase: 'KDP-C / PDR',
      category: 'COMMS_DATA',
      title: 'RF Eb/N0 Link Margin & Daily SSR Data Closure',
      requirementText: `≥ ${profile.minLinkMarginDb.toFixed(1)} dB Link Margin & 0 GB Daily Backlog`,
      measuredValueText: `${commsData.linkMarginDb >= 0 ? '+' : ''}${commsData.linkMarginDb} dB · ${commsData.dataGeneratedPerDayGb} / ${commsData.downlinkCapacityPerDayGb} GB/d`,
      status: commsData.status,
      remediationHint:
        commsData.status !== 'GO'
          ? 'Upgrade S-Band patch to X-Band Gimbaled Horn (150 Mbps) or Ka-Band Dish (600 Mbps).'
          : undefined,
      resourceRoute: '/architecture?category=ANTENNA',
    },
    {
      id: 'chk-cml5-orbit-prop',
      cmlLevel: 5,
      kdpPhase: 'KDP-D / CDR',
      category: 'ORBIT_PROPULSION',
      title: 'Tsiolkovsky Δv Margin & NASA ODAR 25-Year Disposal',
      requirementText: `Valid ${scenario.celestialBody} Orbit & ≥ ${propulsion.requiredDeltaVMps} m/s Δv`,
      measuredValueText: !orbital.isValidOrbit
        ? orbital.orbitValidationMessage ?? 'Invalid Keplerian Orbit'
        : `${propulsion.availableDeltaVMps} m/s Δv (${propulsion.deltaVMarginPct > 0 ? '+' : ''}${propulsion.deltaVMarginPct}%) · ${orbital.revisitHours}h Revisit`,
      status: orbitPropStatus,
      remediationHint: !orbital.isValidOrbit
        ? orbital.orbitValidationMessage
        : orbit.celestialBody !== scenario.celestialBody
          ? `Select an orbit around ${scenario.celestialBody}.`
          : propulsion.status !== 'GO'
            ? 'Equip AF-M315E Green Monopropellant or Xenon Hall Thruster.'
            : undefined,
      resourceRoute: '/orbit',
    },
    {
      id: 'chk-cml5-thermal',
      cmlLevel: 5,
      kdpPhase: 'KDP-D / CDR',
      category: 'THERMAL',
      title: 'Single-Node Radiative Thermal Equilibrium (Hot/Cold)',
      requirementText: '[-10.0°C to +45.0°C] Operational Envelope',
      measuredValueText: `[${thermal.equilibriumColdTempC}°C Cold, ${thermal.equilibriumHotTempC >= 0 ? '+' : ''}${thermal.equilibriumHotTempC}°C Hot]`,
      status: thermal.status,
      remediationHint:
        thermal.status !== 'GO'
          ? 'Equip Active Bimetallic Thermal Louvers + Ammonia Heat Pipes.'
          : undefined,
      resourceRoute: '/architecture?category=THERMAL',
    },
    {
      id: 'chk-cml6-cost-risk',
      cmlLevel: 6,
      kdpPhase: 'FRR / LAUNCH',
      category: 'COST_RISK',
      title: 'NPR 7120.5F Budget Reserve & NPR 8705.4B Reliability',
      requirementText: `≤ $${scenario.budgetCapMusd}M Cap & R ≥ ${(reliability.requiredReliabilityThreshold * 100).toFixed(0)}%`,
      measuredValueText: `$${budget.totalSpentMusd}M Spent ($${budget.safeRemainingMusd}M Safe) · R=${(reliability.combinedMissionReliability * 100).toFixed(1)}%`,
      status:
        budget.status === 'NO_GO' || reliability.status === 'NO_GO'
          ? 'NO_GO'
          : budget.status === 'CAUTION' || reliability.status === 'CAUTION'
            ? 'CAUTION'
            : 'GO',
      remediationHint:
        budget.status !== 'GO'
          ? 'Reduce hardware/launch spend to preserve 20% Phase B/C cost reserve.'
          : reliability.status !== 'GO'
            ? 'Select dual-redundant RAD750 C&DH avionics and flight-proven TRL 8–9 components.'
            : undefined,
      resourceRoute: '/architecture?category=AVIONICS',
    },
  ];

  const toSeverity = (s: GateStatus): ValidationFindingSeverity =>
    s === 'GO' ? 'PASS' : s === 'CAUTION' ? 'WARNING' : 'FAIL';

  const findings: ValidationFinding[] = [
    {
      id: 'finding-science-payload',
      subsystem: 'SCIENCE',
      severity: toSeverity(scienceStatus),
      title: 'Payload Cloud Penetration & Bus Compatibility',
      actualValue: scienceMeasured,
      requiredValue: scenario.code === 'FLOODWATCH' ? '≥1 Cloud-Penetrating Sensor & Bus Fit' : '≥1 Valid Sensor',
      units: 'sensors',
      explanation:
        scienceStatus === 'GO'
          ? 'Selected instruments satisfy payload slot/form-factor limits and all-weather monsoon observation requirements.'
          : scienceRemediation ?? 'Payload configuration does not meet primary mission science goals.',
      suggestedCorrectiveAction:
        scienceRemediation ?? 'No corrective action required; payload meets baseline requirements.',
      resourceRoute: '/architecture?category=INSTRUMENTS',
    },
    {
      id: 'finding-mass-margin',
      subsystem: 'MASS',
      severity: toSeverity(mass.status),
      title: 'Spacecraft Wet Mass & Launch Margin',
      actualValue: `${mass.wetMassKg} (${mass.launchMarginPct > 0 ? '+' : ''}${mass.launchMarginPct}%)`,
      requiredValue: `≤ ${mass.maxLaunchMassKg.toFixed(1)} LV / ≤ ${mass.maxBusMassKg.toFixed(1)} Bus (≥${profile.minMassMarginPct}% margin)`,
      units: 'kg',
      explanation: !mass.formFactorCompatible
        ? mass.incompatibilityReasons.join(' ') ||
          'Bus form factor, payload slots, or launcher envelope is incompatible with the selected hardware.'
        : `Wet mass ${mass.wetMassKg} kg vs destination-orbit launcher limit ${mass.maxLaunchMassKg.toFixed(1)} kg; dry/payload mass vs bus structural limit ${mass.maxBusMassKg.toFixed(1)} kg.`,
      suggestedCorrectiveAction:
        mass.status === 'GO'
          ? 'Maintain mass control reserve.'
          : mass.incompatibilityReasons[0] ??
            'Switch to ESPA SmallSat Bus, reduce instrument mass, or select a higher-capacity launch vehicle.',
      resourceRoute: !mass.formFactorCompatible ? '/architecture?category=BUS' : '/orbit',
    },
    {
      id: 'finding-power-eps',
      subsystem: 'POWER',
      severity: toSeverity(power.status),
      title: 'EOL Solar Power, Peak Load & Eclipse Battery DoD',
      actualValue: `${power.eolSolarPowerW} W (${power.powerMarginPct}%) · Peak ${power.peakLoadW}/${power.peakSupplyW} W · ${power.eclipseDodPct}% DoD`,
      requiredValue: `≥ ${power.orbitAverageRequiredPowerW} W avg, ≥${profile.minPowerMarginPct}% margin, Peak ≤ ${power.peakSupplyW} W, ≤ ${power.maxAllowedDodPct}% DoD`,
      units: 'W / % DoD',
      explanation: !power.peakPowerValid
        ? `Simultaneous peak power demand (${power.peakLoadW} W) exceeds available peak supply (${power.peakSupplyW} W).`
        : `End-of-life solar generation (${power.eolSolarPowerW} W) vs. orbit-average demand (${power.orbitAverageRequiredPowerW} W) across ${(orbital.eclipseFraction * 100).toFixed(1)}% orbital eclipse.`,
      suggestedCorrectiveAction:
        power.status === 'GO'
          ? 'Power subsystem meets SMAD Eq. 21-7 average, peak, and battery DoD margins.'
          : !power.peakPowerValid
            ? 'Install higher capacity Li-Ion battery pack to raise 1C peak discharge rating.'
            : 'Increase solar array area, upgrade Li-Ion battery Wh capacity, or use Dawn-Dusk SSO.',
      resourceRoute: '/architecture?category=SOLAR_ARRAY',
    },
    {
      id: 'finding-comms-link',
      subsystem: 'COMMS',
      severity: commsData.linkMarginDb < 0 ? 'FAIL' : commsData.linkMarginDb < profile.minLinkMarginDb ? 'WARNING' : 'PASS',
      title: 'RF Downlink Eb/N0 Link Margin',
      actualValue: `${commsData.linkMarginDb >= 0 ? '+' : ''}${commsData.linkMarginDb}`,
      requiredValue: `≥ +${profile.minLinkMarginDb.toFixed(1)}`,
      units: 'dB',
      explanation: `RF link closes with ${commsData.ebN0ReceivedDb} dB received Eb/N0 over ${commsData.slantRangeKm} km slant range (FSPL ${commsData.fsplDb} dB).`,
      suggestedCorrectiveAction:
        commsData.linkMarginDb >= profile.minLinkMarginDb
          ? `RF link margin exceeds ${profile.minLinkMarginDb.toFixed(1)} dB FRR threshold.`
          : 'Select X-Band High-Gain Horn or Ka-Band Parabolic Dish for positive link margin.',
      resourceRoute: '/architecture?category=ANTENNA',
    },
    {
      id: 'finding-data-ssr',
      subsystem: 'DATA',
      severity:
        commsData.netDataBacklogPerDayGb > commsData.storageCapacityGb * 0.5
          ? 'FAIL'
          : commsData.netDataBacklogPerDayGb > 0
            ? 'WARNING'
            : 'PASS',
      title: 'Daily Science Data Generation vs. Downlink Closure',
      actualValue: `${commsData.dataGeneratedPerDayGb} gen / ${commsData.downlinkCapacityPerDayGb} down`,
      requiredValue: `≤ ${commsData.downlinkCapacityPerDayGb} (0 backlog)`,
      units: 'GB/day',
      explanation: `Payload generates ${commsData.dataGeneratedPerDayGb} GB/day vs. ${commsData.downlinkCapacityPerDayGb} GB/day across ${commsData.passesPerDay} ground passes into ${commsData.storageCapacityGb} GB SSR.`,
      suggestedCorrectiveAction:
        commsData.netDataBacklogPerDayGb <= 0
          ? 'Daily data volume clears SSR without overflow.'
          : 'Upgrade antenna downlink Mbps or install higher-capacity Rad-Hard SSR.',
      resourceRoute: '/architecture?category=ANTENNA',
    },
    {
      id: 'finding-propulsion-dv',
      subsystem: 'PROPULSION',
      severity: toSeverity(
        !orbital.isValidOrbit || orbit.celestialBody !== scenario.celestialBody
          ? 'NO_GO'
          : propulsion.status
      ),
      title: 'Tsiolkovsky Δv Reserve, Orbit Validity & ODAR Disposal',
      actualValue: !orbital.isValidOrbit
        ? orbital.orbitValidationMessage ?? 'Invalid Orbit'
        : `${propulsion.availableDeltaVMps} (${propulsion.deltaVMarginPct}%)`,
      requiredValue: `Valid ${scenario.celestialBody} Orbit & ≥ ${propulsion.requiredDeltaVMps} m/s`,
      units: 'm/s',
      explanation: !orbital.isValidOrbit
        ? orbital.orbitValidationMessage ?? 'Orbital mechanics solver flagged invalid orbit geometry.'
        : `Onboard propellant yields ${propulsion.availableDeltaVMps} m/s Δv; ODAR 25-year deorbit compliance is ${propulsion.odarCompliant ? 'verified' : 'not satisfied'}.`,
      suggestedCorrectiveAction: !orbital.isValidOrbit
        ? orbital.orbitValidationMessage ?? 'Choose a valid bound closed orbit.'
        : orbit.celestialBody !== scenario.celestialBody
          ? `Choose an orbit around ${scenario.celestialBody}.`
          : propulsion.status === 'GO'
            ? 'Propulsion Δv and ODAR disposal budget nominal.'
            : 'Install AF-M315E Green Monopropellant or Xenon Hall Thruster.',
      resourceRoute: '/architecture?category=PROPULSION',
    },
    {
      id: 'finding-thermal-balance',
      subsystem: 'THERMAL',
      severity: toSeverity(thermal.status),
      title: 'Hot / Cold Radiative Thermal Equilibrium',
      actualValue: `${thermal.equilibriumColdTempC} to ${thermal.equilibriumHotTempC >= 0 ? '+' : ''}${thermal.equilibriumHotTempC}`,
      requiredValue: `${thermal.minAllowedTempC} to +${thermal.maxAllowedTempC}`,
      units: '°C',
      explanation: `Simplified single-node radiative balance reaches ${thermal.equilibriumHotTempC >= 0 ? '+' : ''}${thermal.equilibriumHotTempC}°C in full sun and ${thermal.equilibriumColdTempC}°C in eclipse (${thermal.heaterPowerUsedW} W heater).`,
      suggestedCorrectiveAction:
        thermal.status === 'GO'
          ? 'Thermal temperatures remain inside electronic survival limits.'
          : 'Add Active Bimetallic Thermal Louvers & Survival Heaters.',
      resourceRoute: '/architecture?category=THERMAL',
    },
    {
      id: 'finding-budget-reserve',
      subsystem: 'BUDGET',
      severity: toSeverity(budget.status),
      title: 'Mission Life-Cycle Cost & 20% Contingency Reserve',
      actualValue: `$${budget.totalSpentMusd}M ($${budget.safeRemainingMusd}M safe)`,
      requiredValue: `≤ $${(scenario.budgetCapMusd * 0.8).toFixed(1)}M pre-reserve ($${scenario.budgetCapMusd}M cap)`,
      units: '$M USD',
      explanation: `Includes $${budget.hardwareCostMusd}M HW, $${budget.developmentCostMusd}M Dev, $${budget.integrationCostMusd}M Integration, $${budget.testingCostMusd}M Testing, $${budget.launchCostMusd}M Launch, $${budget.operationsCostMusd}M Ops.`,
      suggestedCorrectiveAction:
        budget.status === 'GO'
          ? 'Cost stays below the 80% ceiling, preserving full 20% contingency.'
          : 'Trim hardware or rideshare launch cost to restore the 20% contingency reserve.',
      resourceRoute: '/architecture',
    },
    {
      id: 'finding-reliability-risk',
      subsystem: 'RELIABILITY',
      severity: toSeverity(reliability.status),
      title: `NPR 8705.4B Class ${scenario.riskClass} Reliability & TRL`,
      actualValue: `${(reliability.subsystemReliability * 100).toFixed(1)}% (TRL ${reliability.minTrl})`,
      requiredValue: `≥ ${(reliability.requiredReliabilityThreshold * 100).toFixed(0)}%`,
      units: '% / TRL',
      explanation: `Series/parallel reliability over ${scenario.designLifetimeYears} yr (λ=${reliability.hazardRatePerYear}/yr), combined launch+spacecraft reliability ${(reliability.combinedMissionReliability * 100).toFixed(1)}%.`,
      suggestedCorrectiveAction:
        reliability.status === 'GO'
          ? 'Redundancy and TRL meet Class C assurance criteria.'
          : 'Equip dual-redundant flight avionics and TRL ≥ 8 hardware.',
      resourceRoute: '/architecture?category=AVIONICS',
    },
    {
      id: 'finding-orbit-regime-info',
      subsystem: 'ORBIT',
      severity: 'INFORMATION',
      title: 'Orbital Mechanics & Sun-Synchronous Precession Advisory',
      actualValue: `${orbital.nodalPrecessionDegPerDay}°/day (${orbital.isSunSynchronous ? 'Sun-Synchronous' : 'Non-SSO'})`,
      requiredValue: '+0.9856°/day for Earth SSO',
      units: 'deg/day',
      explanation: `${orbit.name}: period ${orbital.orbitalPeriodMin} min, eccentricity ${orbital.eccentricity}, revisit ~${orbital.revisitHours} hr.`,
      suggestedCorrectiveAction:
        orbital.isSunSynchronous || orbit.regime === 'GEO'
          ? 'Informational telemetry for mission operations planning.'
          : 'Non-SSO LEO/HEO orbits precess across local solar time; verify eclipse thermal/power margins.',
      resourceRoute: '/orbit',
    },
  ];

  const goCount = checklist.filter((c) => c.status === 'GO').length;
  const cautionCount = checklist.filter((c) => c.status === 'CAUTION').length;
  const noGoCount = checklist.filter((c) => c.status === 'NO_GO').length;

  const overallStatus: GateStatus =
    noGoCount > 0 ? 'NO_GO' : cautionCount > 0 ? 'CAUTION' : 'GO';

  const achievedCmlLevel = noGoCount > 0 ? 3 : cautionCount > 0 ? 5 : 6;

  const validation: ValidationVerdict = {
    overallStatus,
    achievedCmlLevel,
    canLaunch: overallStatus !== 'NO_GO',
    goCount,
    cautionCount,
    noGoCount,
    checklist,
    findings,
  };

  return {
    mass,
    orbital,
    power,
    commsData,
    propulsion,
    thermal,
    budget,
    reliability,
    validation,
  };
}
