import type { EngineeringSummary } from '../types/engineering';
import type { ScenarioDefinition } from '../types/mission';
import type { MissionScoreReport } from '../types/simulation';
import type {
  LaunchVehicle,
  OrbitalParameters,
  ScientificInstrument,
  SpacecraftComponent,
} from '../types/spacecraft';

export type AdvisorPriority = 'CRITICAL' | 'HIGH' | 'OPTIMIZATION';

export interface AdvisorRecommendation {
  id: string;
  domain:
    | 'MASS'
    | 'POWER'
    | 'ORBIT'
    | 'SCIENCE'
    | 'COMMS'
    | 'PROPULSION'
    | 'THERMAL'
    | 'RELIABILITY'
    | 'BUDGET';
  priority: AdvisorPriority;
  title: string;
  engineeringBasis: string;
  action: string;
  route: string;
  estimatedImpact: string;
}

export interface MissionAdvisorReport {
  overallVerdict: 'FLIGHT_READY' | 'MARGINAL_TRADE_REQUIRED' | 'CRITICAL_REDESIGN';
  summary: string;
  criticalCount: number;
  highCount: number;
  optimizationCount: number;
  recommendations: AdvisorRecommendation[];
  disclaimer: string;
}

export interface OptionalAiAdvisorResponse {
  status: 'DISABLED' | 'OK' | 'UNAVAILABLE';
  narrative?: string;
  providerNote: string;
}

const PRIORITY_RANK: Record<AdvisorPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  OPTIMIZATION: 2,
};

/**
 * Deterministic rule-based Mission Systems Engineering Advisor.
 * Consumes pre-computed SI engineering telemetry and mission scoring without
 * introducing non-deterministic outputs or bypassing hard FRR gates.
 */
export function generateMissionAdvisorReport(params: {
  scenario: ScenarioDefinition;
  bus: SpacecraftComponent;
  subsystems: SpacecraftComponent[];
  instruments: ScientificInstrument[];
  orbit: OrbitalParameters;
  launchVehicle: LaunchVehicle;
  engineering: EngineeringSummary;
  scorePreview: MissionScoreReport;
}): MissionAdvisorReport {
  const { scenario, bus, subsystems, instruments, orbit, launchVehicle, engineering, scorePreview } = params;
  const recommendations: AdvisorRecommendation[] = [];
  const primaryAntenna = subsystems.find((s) => s.category === 'ANTENNA');

  // 1. Orbital mechanics & geometry validity
  if (!engineering.orbital.isValidOrbit || orbit.celestialBody !== scenario.celestialBody) {
    recommendations.push({
      id: 'adv-orbit-invalid',
      domain: 'ORBIT',
      priority: 'CRITICAL',
      title: 'Resolve non-physical or incompatible orbital parameters',
      engineeringBasis:
        engineering.orbital.orbitValidationMessage ??
        `Perigee radius (${engineering.orbital.perigeeRadiusKm.toFixed(1)} km) or target body (${orbit.celestialBody}) violates orbital safety bounds for ${scenario.celestialBody}.`,
      action:
        'Raise perigee above atmospheric/surface clearance or pick the scenario recommended orbit in Orbit Planner.',
      route: '/orbit',
      estimatedImpact: 'Restores valid two-body ephemeris and unblocks FRR Orbit gate.',
    });
  } else if (
    scenario.celestialBody === 'EARTH' &&
    orbit.regime.startsWith('SSO') &&
    !engineering.orbital.isSunSynchronous
  ) {
    recommendations.push({
      id: 'adv-orbit-sso-drift',
      domain: 'ORBIT',
      priority: 'HIGH',
      title: 'Tune inclination to maintain J2 Sun-Synchronous precession',
      engineeringBasis: `J2 nodal precession is ${engineering.orbital.nodalPrecessionDegPerDay.toFixed(3)} deg/day vs Earth 0.9856 deg/day solar rate.`,
      action: 'Adjust inclination toward ~97.6 deg–98.2 deg (or select a pre-tuned SSO orbit).',
      route: '/orbit',
      estimatedImpact: 'Eliminates local solar time drift across multi-year observations.',
    });
  }

  // 2. Mass, form factor & destination-orbit launch capacity
  if (!engineering.mass.formFactorCompatible || engineering.mass.launchMarginKg < 0) {
    recommendations.push({
      id: 'adv-mass-compatibility',
      domain: 'MASS',
      priority: 'CRITICAL',
      title: 'Eliminate spacecraft/launch-vehicle mass or envelope incompatibility',
      engineeringBasis:
        engineering.mass.incompatibilityReasons[0] ??
        `Wet mass (${engineering.mass.wetMassKg.toFixed(1)} kg) exceeds destination capacity (${engineering.mass.maxLaunchMassKg.toFixed(1)} kg) on ${launchVehicle.name}.`,
      action:
        'Select a higher-capacity launch vehicle for this destination orbit, upgrade the bus envelope, or trim payload mass.',
      route: '/orbit',
      estimatedImpact: 'Restores positive launch margin and structural compatibility.',
    });
  } else if (engineering.mass.launchMarginPct < 15) {
    recommendations.push({
      id: 'adv-mass-margin',
      domain: 'MASS',
      priority: 'HIGH',
      title: 'Increase launch mass reserve toward NASA >= 15% Phase-A target',
      engineeringBasis: `Current launch margin is ${engineering.mass.launchMarginPct.toFixed(1)}% (${engineering.mass.launchMarginKg.toFixed(1)} kg remaining for ${orbit.regime}).`,
      action: 'Upgrade launch tier or reduce wet mass to absorb late-phase mass growth.',
      route: '/orbit',
      estimatedImpact: 'Moves Mass FRR gate from CAUTION to GO.',
    });
  }

  // 3. Power: peak demand, orbit average, and battery eclipse depth of discharge
  if (!engineering.power.peakPowerValid) {
    recommendations.push({
      id: 'adv-power-peak',
      domain: 'POWER',
      priority: 'CRITICAL',
      title: 'Instantaneous peak electrical load exceeds array + battery discharge limit',
      engineeringBasis: `Peak simultaneous load (${engineering.power.peakLoadW.toFixed(1)} W) exceeds max peak supply (${engineering.power.peakSupplyW.toFixed(1)} W including battery 1C discharge cap).`,
      action:
        'Upgrade battery capacity (increases W·h and peak W discharge capability), select larger solar wings, or remove high-draw simultaneous payloads.',
      route: '/architecture',
      estimatedImpact: 'Prevents brownout during simultaneous payload + downlink passes.',
    });
  }
  if (engineering.power.powerMarginPct < 0) {
    recommendations.push({
      id: 'adv-power-average',
      domain: 'POWER',
      priority: 'CRITICAL',
      title: 'Fix negative orbit-average power margin',
      engineeringBasis: `EOL solar output (${engineering.power.eolSolarPowerW.toFixed(1)} W) cannot sustain orbit-average load (${engineering.power.orbitAverageRequiredPowerW.toFixed(1)} W, margin ${engineering.power.powerMarginPct.toFixed(1)}%).`,
      action:
        scenario.celestialBody === 'EARTH'
          ? 'Switch to Dawn-Dusk SSO to minimize eclipse duration, increase solar array area, or reduce active payload power.'
          : 'Select deep-space / larger solar arrays sized for local solar irradiance and eclipse fraction.',
      route: '/architecture',
      estimatedImpact: 'Prevents steady-state battery depletion across consecutive orbits.',
    });
  } else if (engineering.power.eclipseDodPct > engineering.power.maxAllowedDodPct) {
    recommendations.push({
      id: 'adv-power-dod',
      domain: 'POWER',
      priority: 'CRITICAL',
      title: 'Reduce eclipse Battery Depth-of-Discharge (DoD) below cycle-life limit',
      engineeringBasis: `Eclipse draw drives ${engineering.power.eclipseDodPct.toFixed(1)}% DoD, above the ${engineering.power.maxAllowedDodPct.toFixed(1)}% safe operational threshold.`,
      action: 'Install a higher-capacity Li-Ion battery pack or pick an orbit with a lower eclipse fraction.',
      route: '/architecture',
      estimatedImpact: 'Protects battery cells from premature cycle degradation over mission life.',
    });
  } else if (engineering.power.powerMarginPct < 20) {
    recommendations.push({
      id: 'adv-power-margin-caution',
      domain: 'POWER',
      priority: 'HIGH',
      title: 'Build orbit-average power margin above 20% EOL reserve',
      engineeringBasis: `Power margin is ${engineering.power.powerMarginPct.toFixed(1)}% at end-of-life (solar ${engineering.power.eolSolarPowerW.toFixed(1)} W at ${scenario.solarFluxWPerM2} W/m²).`,
      action: 'Upgrade solar array area or reduce duty-cycle draw for comfortable EOL reserve.',
      route: '/architecture',
      estimatedImpact: 'Transitions Power FRR gate from CAUTION to GO.',
    });
  }

  // 4. Science instruments & scenario fit
  if (instruments.length === 0) {
    recommendations.push({
      id: 'adv-science-empty',
      domain: 'SCIENCE',
      priority: 'CRITICAL',
      title: 'Mount at least one scientific instrument payload',
      engineeringBasis: `0 instruments mounted on ${bus.name}; science return is 0 / 35 pts.`,
      action: 'Select mission-relevant instruments on the Spacecraft Builder page.',
      route: '/architecture',
      estimatedImpact: 'Enables KPP compliance and scientific achievement scoring.',
    });
  } else if (scenario.celestialBody === 'EARTH' && scenario.code === 'FLOODWATCH') {
    const hasSar = instruments.some((inst) => inst.type === 'SAR');
    const avgCloud =
      scenario.targetRegions.reduce((acc, r) => acc + r.cloudCoverFraction, 0) /
      Math.max(1, scenario.targetRegions.length);
    if (!hasSar && avgCloud >= 0.4) {
      recommendations.push({
        id: 'adv-science-floodwatch-sar',
        domain: 'SCIENCE',
        priority: 'HIGH',
        title: 'Add C-Band SAR for monsoon all-weather & night flood mapping',
        engineeringBasis: `Target basins average ${(avgCloud * 100).toFixed(0)}% cloud cover; optical/SWIR sensors cannot image flooded river deltas beneath thick monsoon clouds.`,
        action: 'Mount C-Band SAR (requires ESPA/SmallSat bus envelope & higher peak power).',
        route: '/architecture',
        estimatedImpact: 'Satisfies all-weather & night KPP thresholds for +10–15 science pts.',
      });
    }
  }

  // 5. Communications & Solid-State Recorder sizing
  if (engineering.commsData.passesPerDay <= 0) {
    recommendations.push({
      id: 'adv-comms-band-mismatch',
      domain: 'COMMS',
      priority: 'CRITICAL',
      title: 'Zero RF passes per day — ground network incompatible with antenna band',
      engineeringBasis: `Selected ground stations do not support the active antenna band (${primaryAntenna?.rfBand ?? 'UNKNOWN'}), yielding 0 passes/day and 0 GB/day downlink.`,
      action: 'Verify antenna selection and compatible ground station coverage.',
      route: '/architecture',
      estimatedImpact: 'Restores ground contact schedule and enables science data return.',
    });
  } else if (engineering.commsData.linkMarginDb < 3) {
    recommendations.push({
      id: 'adv-comms-link-margin',
      domain: 'COMMS',
      priority: engineering.commsData.linkMarginDb < 0 ? 'CRITICAL' : 'HIGH',
      title: 'Improve RF downlink margin above 3.0 dB threshold',
      engineeringBasis: `Estimated link margin is ${engineering.commsData.linkMarginDb.toFixed(1)} dB over slant range ${engineering.commsData.slantRangeKm.toFixed(0)} km (FSPL ${engineering.commsData.fsplDb.toFixed(1)} dB).`,
      action: 'Upgrade to higher-gain X-Band or Ka-Band antenna or lower orbital altitude.',
      route: '/architecture',
      estimatedImpact: 'Eliminates link closure dropouts during low-elevation passes.',
    });
  } else if (engineering.commsData.netDataBacklogPerDayGb > 0.5) {
    const estDaysFull =
      engineering.commsData.storageCapacityGb / engineering.commsData.netDataBacklogPerDayGb;
    const daysFull = Number.isFinite(estDaysFull) ? `${estDaysFull.toFixed(1)} days` : 'soon';
    recommendations.push({
      id: 'adv-comms-backlog',
      domain: 'COMMS',
      priority: 'HIGH',
      title: 'Downlink capacity lags daily science generation (SSR overflow risk)',
      engineeringBasis: `Net daily backlog grows by +${engineering.commsData.netDataBacklogPerDayGb.toFixed(1)} GB/day; ${engineering.commsData.storageCapacityGb} GB SSR overflows in ~${daysFull}.`,
      action: 'Upgrade antenna downlink rate (X-Band/Ka-Band), add high-latitude ground passes, or tune instrument duty cycles.',
      route: '/architecture',
      estimatedImpact: 'Prevents buffer overwrites and improves Returned Data score.',
    });
  }

  // 6. Propulsion & NASA ODAR end-of-life disposal
  if (!engineering.propulsion.odarCompliant || engineering.propulsion.deltaVMarginMps < 0) {
    recommendations.push({
      id: 'adv-propulsion-dv',
      domain: 'PROPULSION',
      priority: 'CRITICAL',
      title: 'Close Δv deficit and satisfy 25-year orbital disposal requirement',
      engineeringBasis: `Available Δv (${engineering.propulsion.availableDeltaVMps.toFixed(1)} m/s) is insufficient for required station-keeping + disposal (${engineering.propulsion.requiredDeltaVMps.toFixed(1)} m/s).`,
      action: 'Upgrade propulsion module (Green Monopropellant or Hall Thruster) or lower target orbital altitude.',
      route: '/architecture',
      estimatedImpact: 'Satisfies NASA NPR 8715.6 ODAR compliance and unblocks Propulsion gate.',
    });
  }

  // 7. Thermal & Reliability
  if (engineering.thermal.status === 'NO_GO') {
    recommendations.push({
      id: 'adv-thermal-limits',
      domain: 'THERMAL',
      priority: 'CRITICAL',
      title: 'Keep equilibrium spacecraft temperatures within Li-Ion & electronics limits',
      engineeringBasis: `Simplified thermal envelope predicts ${engineering.thermal.equilibriumColdTempC.toFixed(1)} °C cold to ${engineering.thermal.equilibriumHotTempC.toFixed(1)} °C hot.`,
      action: 'Upgrade thermal control subsystem (e.g. Active Louvers / Heat Pipes) or avoid harsh beta-angle extremes.',
      route: '/architecture',
      estimatedImpact: 'Restores safe operating temperatures across sunlit/eclipse swings.',
    });
  }

  if (
    engineering.reliability.status === 'NO_GO' ||
    ((scenario.riskClass === 'A' || scenario.riskClass === 'B') &&
      !engineering.reliability.hasRedundantAvionics)
  ) {
    recommendations.push({
      id: 'adv-reliability-redundancy',
      domain: 'RELIABILITY',
      priority: engineering.reliability.status === 'NO_GO' ? 'CRITICAL' : 'HIGH',
      title: `Align avionics redundancy with Class ${scenario.riskClass} reliability standard`,
      engineeringBasis: `Series-modeled subsystem reliability is ${(engineering.reliability.subsystemReliability * 100).toFixed(1)}% (threshold ${(engineering.reliability.requiredReliabilityThreshold * 100).toFixed(1)}%).`,
      action: 'Select Dual-String Redundant RAD750 Flight Computer and avoid low-TRL single-string hardware.',
      route: '/architecture',
      estimatedImpact: 'Raises mission completion & reliability score (25 pts weight).',
    });
  }

  // 8. Budget reserve
  if (engineering.budget.safeRemainingMusd < 0) {
    recommendations.push({
      id: 'adv-budget-reserve',
      domain: 'BUDGET',
      priority: engineering.budget.totalRemainingMusd < 0 ? 'CRITICAL' : 'HIGH',
      title: 'Restore NASA 20% unallocated lifecycle cost reserve',
      engineeringBasis: `Total spent $${engineering.budget.totalSpentMusd.toFixed(1)}M leaves $${engineering.budget.safeRemainingMusd.toFixed(1)}M safe reserve against $${scenario.budgetCapMusd.toFixed(1)}M cap.`,
      action: 'Switch to ESPA rideshare or trim non-essential instruments/bus tier to recover reserve.',
      route: '/orbit',
      estimatedImpact: 'Eliminates cost overrun risk and preserves Resource Efficiency score.',
    });
  }

  // 9. Optimization advice when flight-ready
  if (recommendations.length === 0) {
    if (engineering.orbital.revisitHours > 18 && scenario.targetRegions.length > 0) {
      recommendations.push({
        id: 'adv-opt-revisit',
        domain: 'ORBIT',
        priority: 'OPTIMIZATION',
        title: 'Consider lower-altitude SSO or wider-swath instrument to cut target revisit time',
        engineeringBasis: `All 7 FRR gates are GO (score preview ${scorePreview.totalScore}/100), with estimated revisit of ${engineering.orbital.revisitHours.toFixed(1)} hours.`,
        action: 'Verify revisit time meets target KPP goal threshold before Launch Readiness Poll.',
        route: '/orbit',
        estimatedImpact: 'Could push Science Achievement closer to maximum 35/35.',
      });
    } else {
      recommendations.push({
        id: 'adv-opt-ready',
        domain: 'SCIENCE',
        priority: 'OPTIMIZATION',
        title: 'Baseline configuration is balanced across mass, power, RF link & budget',
        engineeringBasis: `7/7 FRR gates GO, Launch Margin ${engineering.mass.launchMarginPct.toFixed(1)}%, Power Margin ${engineering.power.powerMarginPct.toFixed(1)}%, Link Margin ${engineering.commsData.linkMarginDb.toFixed(1)} dB.`,
        action: 'Proceed to Launch Sequence and execute the operational timeline simulation.',
        route: '/orbit',
        estimatedImpact: 'Ready for Launch Poll & Simulation Verification.',
      });
    }
  }

  recommendations.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  const criticalCount = recommendations.filter((r) => r.priority === 'CRITICAL').length;
  const highCount = recommendations.filter((r) => r.priority === 'HIGH').length;
  const optimizationCount = recommendations.filter((r) => r.priority === 'OPTIMIZATION').length;

  const overallVerdict =
    criticalCount > 0 || !engineering.validation.canLaunch
      ? 'CRITICAL_REDESIGN'
      : highCount > 0
        ? 'MARGINAL_TRADE_REQUIRED'
        : 'FLIGHT_READY';

  const summary =
    overallVerdict === 'FLIGHT_READY'
      ? `Flight-Ready configuration (${engineering.validation.goCount}/7 GO gates). Ready for Launch Sequence.`
      : overallVerdict === 'MARGINAL_TRADE_REQUIRED'
        ? `${highCount} engineering margin trade(s) recommended before flight certification.`
        : `${criticalCount} critical engineering defect(s) block launch readiness — resolve red gates first.`;

  return {
    overallVerdict,
    summary,
    criticalCount,
    highCount,
    optimizationCount,
    recommendations,
    disclaimer:
      'Deterministic rule-based systems engineering advisor derived strictly from live SI subsystem calculations. Never overrides FRR gate decisions.',
  };
}

export function isOptionalAiProviderConfigured(): boolean {
  const endpoint = import.meta.env.VITE_ADVISOR_ENDPOINT as string | undefined;
  return Boolean(endpoint && endpoint.trim().startsWith('http'));
}

/**
 * Cleanly separated optional server-side AI explanation hook.
 * Never embeds provider secrets in the browser bundle and never computes or alters
 * engineering numbers. Fails closed to deterministic rule-based guidance.
 */
export async function requestOptionalAiExplanation(params: {
  scenarioCode: string;
  report: MissionAdvisorReport;
  endpointOverride?: string;
  fetchImpl?: typeof fetch;
}): Promise<OptionalAiAdvisorResponse> {
  const endpoint =
    params.endpointOverride ??
    (import.meta.env.VITE_ADVISOR_ENDPOINT as string | undefined) ??
    '';

  if (!endpoint || !endpoint.trim().startsWith('http')) {
    return {
      status: 'DISABLED',
      providerNote:
        'Optional server-side AI advisor endpoint (VITE_ADVISOR_ENDPOINT) is not configured; using deterministic SI rule engine.',
    };
  }

  const fetchFn = params.fetchImpl ?? globalThis.fetch;
  try {
    const response = await fetchFn(endpoint.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioCode: params.scenarioCode,
        overallVerdict: params.report.overallVerdict,
        recommendations: params.report.recommendations.map((r) => ({
          domain: r.domain,
          priority: r.priority,
          title: r.title,
          engineeringBasis: r.engineeringBasis,
        })),
      }),
    });

    if (!response.ok) {
      return {
        status: 'UNAVAILABLE',
        providerNote: `Server AI advisor endpoint returned HTTP ${response.status}; deterministic rule guidance remains active.`,
      };
    }

    const data = (await response.json()) as { narrative?: unknown; model?: string };
    if (typeof data.narrative !== 'string' || !data.narrative.trim()) {
      return {
        status: 'UNAVAILABLE',
        providerNote: 'Invalid AI advisor payload schema; falling back to deterministic guidance.',
      };
    }

    return {
      status: 'OK',
      narrative: data.narrative.trim(),
      providerNote: `Server-side narrative (${data.model ?? 'configured provider'}) — educational commentary only.`,
    };
  } catch {
    return {
      status: 'UNAVAILABLE',
      providerNote: 'Server AI advisor unreachable; deterministic SI rule engine remains active.',
    };
  }
}
