import { DEEP_SPACE_GROUND_STATIONS, GROUND_STATIONS } from '../data/groundStations';
import type { EngineeringSummary } from '../types/engineering';
import type { MissionDifficulty, ScenarioDefinition, ScenarioEventRule } from '../types/mission';
import type {
  ActiveAnomaly,
  InstrumentMode,
  SimEvent,
  TelemetryPoint,
} from '../types/simulation';
import type {
  OrbitalParameters,
  RFBand,
  ScientificInstrument,
  SpacecraftComponent,
} from '../types/spacecraft';
import { updateStorageBacklogGb } from './data';
import { sampleDeterministicAnomaly } from './events';
import { propagateKeplerianState } from './orbital';
import { stepBatteryEnergyWh } from './power';

const SCENARIO_SUBSYSTEM_TO_SIM: Record<
  ScenarioEventRule['subsystem'],
  SimEvent['subsystem']
> = {
  POWER: 'EPS',
  COMMS: 'COMMS',
  THERMAL: 'THERMAL',
  PROPULSION: 'PROPULSION',
  PAYLOAD: 'PAYLOAD',
  AVIONICS: 'FLIGHT_CONTROL',
};

export interface SimulationStepContext {
  scenario: ScenarioDefinition;
  orbit: OrbitalParameters;
  instruments: ScientificInstrument[];
  engineering: EngineeringSummary;
  instrumentMode: InstrumentMode;
  activeAnomalies: ActiveAnomaly[];
  seed: number;
  difficulty?: MissionDifficulty;
  disabledInstrumentIds?: string[];
  bus?: SpacecraftComponent;
  subsystems?: SpacecraftComponent[];
  safeModeActive?: boolean;
  heaterOverrideOn?: boolean;
  downlinkPriorityActive?: boolean;
}

function greatCircleDistanceDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) *
      Math.cos(lat2 * toRad) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return (2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))) / toRad;
}

/**
 * Computes the next deterministic TelemetryPoint and any generated SimEvents
 * over a time step `dtSeconds` (default 60 seconds).
 */
export function stepSimulationState(
  prev: TelemetryPoint,
  dtSeconds: number,
  ctx: SimulationStepContext
): {
  nextPoint: TelemetryPoint;
  newEvents: SimEvent[];
  triggeredAnomaly: ActiveAnomaly | null;
  mappedRegionId: string | null;
} {
  const {
    scenario,
    orbit,
    instruments,
    engineering,
    instrumentMode,
    activeAnomalies,
    seed,
    difficulty = 'STANDARD',
    disabledInstrumentIds = [],
    bus,
    subsystems,
    safeModeActive = false,
    heaterOverrideOn = false,
    downlinkPriorityActive = true,
  } = ctx;

  const activeInstruments = instruments.filter((inst) => !disabledInstrumentIds.includes(inst.id));

  const metSeconds = prev.metSeconds + dtSeconds;
  const orbitalPeriodSec = Math.max(600, engineering.orbital.orbitalPeriodSec);
  const orbitNumber = Math.floor(metSeconds / orbitalPeriodSec) + 1;

  // 1. Propagate 3D Keplerian state
  const state = propagateKeplerianState(orbit, metSeconds);
  const inEclipse = state.inEclipse;

  const newEvents: SimEvent[] = [];

  // 1b. Emit scheduled scenario events when crossing their trigger MET hour
  if (scenario.scenarioEvents?.length) {
    for (const sEvt of scenario.scenarioEvents) {
      const triggerSec = sEvt.triggerMetHours * 3600;
      if (prev.metSeconds < triggerSec && metSeconds >= triggerSec) {
        newEvents.push({
          id: `evt-scen-${sEvt.id}-${metSeconds}`,
          metSeconds,
          type: 'MILESTONE',
          severity: 'WARNING',
          subsystem: SCENARIO_SUBSYSTEM_TO_SIM[sEvt.subsystem],
          title: sEvt.title,
          description: sEvt.description,
        });
      }
    }
  }

  if (inEclipse !== prev.inEclipse) {
    newEvents.push({
      id: `evt-ecl-${metSeconds}`,
      metSeconds,
      type: inEclipse ? 'ECLIPSE_ENTER' : 'ECLIPSE_EXIT',
      severity: 'INFO',
      subsystem: 'EPS',
      title: inEclipse
        ? 'Spacecraft Entered Umbra Eclipse Shadow'
        : 'Spacecraft Exited Eclipse into Sunlight',
      description: inEclipse
        ? 'Solar array output dropped to 0 W; discharging Li-Ion secondary battery bank.'
        : 'Solar arrays illuminated; recharging battery bank via peak-power tracker.',
    });
  }

  // Determine effective instrument mode early so overflight mapping respects Safe Mode / load shedding
  const minOpSocPct = engineering.power.minOperationalSocPct ?? 20.0;
  const loadShedActive = prev.batterySocPct <= minOpSocPct;
  const effectiveMode: InstrumentMode =
    safeModeActive || loadShedActive ? 'OFF' : instrumentMode;

  // 2. Check Target Flood Basin Overflight (swath-aware & cloud-penetration-aware)
  const maxSwathKm = activeInstruments.reduce((m, i) => Math.max(m, i.swathWidthKm), 0);
  const effectiveAngularRadiusDeg = Math.max(10.5, Math.min(18.0, 10.5 + maxSwathKm / 85));
  const hasCloudPenetrating = activeInstruments.some((i) => i.cloudPenetrating);
  const payloadCanMap =
    activeInstruments.length > 0 && effectiveMode !== 'OFF' && effectiveMode !== 'STANDBY';

  let activeTargetRegionId: string | null = null;
  let mappedRegionId: string | null = null;
  for (const region of scenario.targetRegions) {
    const angularDistDeg = greatCircleDistanceDeg(
      state.latitudeDeg,
      state.longitudeDeg,
      region.latitudeDeg,
      region.longitudeDeg
    );
    if (angularDistDeg <= effectiveAngularRadiusDeg) {
      activeTargetRegionId = region.id;
      if (prev.activeTargetRegionId !== region.id && payloadCanMap) {
        const cloudObscured =
          scenario.code === 'FLOODWATCH' &&
          region.cloudCoverFraction >= 0.7 &&
          !hasCloudPenetrating;
        if (cloudObscured) {
          newEvents.push({
            id: `evt-cloud-${metSeconds}-${region.id}`,
            metSeconds,
            type: 'TARGET_OVERFLIGHT',
            severity: 'WARNING',
            subsystem: 'PAYLOAD',
            title: `Cloud-Obscured Pass: ${region.name}`,
            description: `${Math.round(region.cloudCoverFraction * 100)}% monsoon cloud cover blocked optical capture without cloud-penetrating SAR.`,
          });
        } else {
          mappedRegionId = region.id;
          newEvents.push({
            id: `evt-targ-${metSeconds}-${region.id}`,
            metSeconds,
            type: 'TARGET_OVERFLIGHT',
            severity: 'INFO',
            subsystem: 'PAYLOAD',
            title: `Target Overflight: ${region.name}`,
            description: `Acquiring swath over ${region.name} (${Math.round(region.cloudCoverFraction * 100)}% cloud cover) in ${effectiveMode} mode.`,
          });
        }
      }
      break;
    }
  }

  // 3. Resolve Primary RF Band & Ground Station Contact Pass
  const antennas = subsystems?.filter((s) => s.category === 'ANTENNA') ?? [];
  const primaryAntenna =
    antennas.length > 0
      ? [...antennas].sort((a, b) => (b.downlinkRateMbps ?? 0) - (a.downlinkRateMbps ?? 0))[0]
      : undefined;
  const primaryBand: RFBand | undefined = primaryAntenna?.rfBand;
  const networkStations =
    scenario.celestialBody === 'EARTH' ? GROUND_STATIONS : DEEP_SPACE_GROUND_STATIONS;
  const stationPool =
    primaryBand !== undefined
      ? networkStations.filter((gs) => gs.supportedBands.includes(primaryBand))
      : networkStations;

  let activeGroundStationId: string | null = null;
  let activeStationPassSec = 420;
  for (const gs of stationPool) {
    const angularDistDeg = greatCircleDistanceDeg(
      state.latitudeDeg,
      state.longitudeDeg,
      gs.latitudeDeg,
      gs.longitudeDeg
    );
    if (angularDistDeg <= 16.0) {
      activeGroundStationId = gs.id;
      activeStationPassSec = gs.avgPassDurationSec;
      if (prev.activeGroundStationId !== gs.id) {
        newEvents.push({
          id: `evt-gs-${metSeconds}-${gs.id}`,
          metSeconds,
          type: 'GROUND_PASS_START',
          severity: 'INFO',
          subsystem: 'COMMS',
          title: `AOS Contact: ${gs.name}`,
          description: `Acquisition of Signal (AOS) established with ${gs.name}; initiating high-rate SSR science dump.`,
        });
      }
      break;
    }
  }

  // 4. Check Deterministic Anomaly Injection
  const unresolvedAnomalies = activeAnomalies.filter((a) => !a.resolved);
  const triggeredAnomaly = sampleDeterministicAnomaly({
    metSeconds,
    seed,
    systemReliability: engineering.reliability.combinedMissionReliability,
    existingCodes: activeAnomalies.map((a) => a.code),
    difficulty,
  });

  if (triggeredAnomaly) {
    unresolvedAnomalies.push(triggeredAnomaly);
    newEvents.push({
      id: `evt-anom-${metSeconds}-${triggeredAnomaly.code}`,
      metSeconds,
      type: 'ANOMALY_INJECTED',
      severity: triggeredAnomaly.severity,
      subsystem: triggeredAnomaly.subsystem,
      title: `ALERT: ${triggeredAnomaly.title}`,
      description: triggeredAnomaly.description,
      requiresAction: true,
      resolved: false,
      recommendedCommandId: triggeredAnomaly.mitigationCommand,
    });
  }

  // 5. Compute Electrical Power & Battery SoC
  const solarAnomalyMult = unresolvedAnomalies.reduce(
    (acc, a) => acc * a.solarEfficiencyMultiplier,
    1.0
  );
  const anomalyPowerPenaltyW = unresolvedAnomalies.reduce(
    (sum, a) => sum + a.powerPenaltyW,
    0
  );
  const anomalyTempOffsetC = unresolvedAnomalies.reduce(
    (sum, a) => sum + a.tempOffsetC,
    0
  );
  const anomalyDownlinkMult = unresolvedAnomalies.reduce(
    (acc, a) => acc * a.downlinkMultiplier,
    1.0
  );

  const modePowerScale =
    effectiveMode === 'HIGH_RES'
      ? 1.0
      : effectiveMode === 'NOMINAL_SURVEY'
        ? activeTargetRegionId
          ? 0.9
          : 0.45
        : effectiveMode === 'STANDBY'
          ? 0.0
          : 0.0;

  // Deterministic bus + subsystem draw (never negative even if sunlightLoadW < baseBusLoadW)
  const rawBaseLoadW =
    bus && subsystems
      ? bus.powerDrawW +
        subsystems
          .filter((s) => s.category !== 'SOLAR_ARRAY')
          .reduce((s, c) => s + c.powerDrawW, 0)
      : Math.max(10, engineering.power.eclipseLoadW * 0.72);
  const baseBusLoadW = safeModeActive || loadShedActive ? rawBaseLoadW * 0.55 : rawBaseLoadW;

  const instrumentPowerW =
    effectiveMode === 'OFF'
      ? 0
      : activeInstruments.reduce((sum, inst) => {
          const canOperate = !inEclipse || inst.nightCapable;
          if (effectiveMode === 'STANDBY' || !canOperate) {
            return sum + inst.powerStandbyW;
          }
          return (
            sum +
            inst.powerStandbyW +
            (inst.powerOperatingW - inst.powerStandbyW) * modePowerScale
          );
        }, 0);

  const thermalHeaterW =
    inEclipse || heaterOverrideOn
      ? (heaterOverrideOn ? 18 : 0) + engineering.thermal.heaterPowerUsedW
      : 0;

  const powerLoadW = Math.max(
    5,
    baseBusLoadW + instrumentPowerW + thermalHeaterW + anomalyPowerPenaltyW
  );
  const solarGenerationW = inEclipse
    ? 0
    : engineering.power.eolSolarPowerW * solarAnomalyMult;

  const netPowerW = solarGenerationW - powerLoadW;
  const batteryCapWh = Math.max(0, engineering.power.batteryCapacityWh);
  const currentEnergyWh = (prev.batterySocPct / 100) * batteryCapWh;
  const battStep = stepBatteryEnergyWh({
    currentEnergyWh,
    capacityWh: batteryCapWh,
    netPowerW,
    dtSeconds,
    maxDodFraction: engineering.power.maxAllowedDodPct / 100,
    minOperationalSocPct: minOpSocPct,
  });
  const batterySocPct = battStep.socPct;

  if (battStep.belowMinOperationalSoc && prev.batterySocPct > minOpSocPct && !battStep.exhausted) {
    newEvents.push({
      id: `evt-batt-shed-${metSeconds}`,
      metSeconds,
      type: 'ANOMALY_INJECTED',
      severity: 'WARNING',
      subsystem: 'EPS',
      title: `Battery Below ${minOpSocPct.toFixed(0)}% SoC — Automated Payload Load Shedding`,
      description:
        'Battery dropped below minimum operational reserve. Science instruments commanded OFF to protect spacecraft bus.',
      requiresAction: true,
    });
  }

  if (battStep.exhausted && prev.batterySocPct > 0) {
    newEvents.push({
      id: `evt-batt-empty-${metSeconds}`,
      metSeconds,
      type: 'ANOMALY_INJECTED',
      severity: 'CRITICAL',
      subsystem: 'EPS',
      title: 'Battery Exhausted (0% SoC) — Emergency Bus Brownout',
      description:
        'Battery energy reached 0 Wh. Spacecraft forced payload into Safe Mode until solar arrays recharge.',
      requiresAction: true,
    });
  }

  // 6. Compute Science Data Capture, SSR Backlog & Ground Downlink (decimal MB = Mbps*s/8, 1 GB = 1000 MB)
  const totalInstRateMbps = activeInstruments.reduce((s, i) => s + i.dataRateMbps, 0);
  const activeCaptureMultiplier =
    effectiveMode === 'OFF' || effectiveMode === 'STANDBY' || battStep.exhausted || battStep.belowMinOperationalSoc
      ? 0
      : activeTargetRegionId
        ? effectiveMode === 'HIGH_RES'
          ? 1.0
          : 0.75
        : 0.08;

  const compressionRatio = Math.max(1.0, engineering.commsData.compressionRatio ?? 1.0);
  const capturedGbStep =
    (totalInstRateMbps * activeCaptureMultiplier * dtSeconds) / (8000 * compressionRatio);

  // Downlink using actual primary antenna bit rate (Mbps) when RF link closes & passes exist
  const nominalDownlinkRateMbps =
    primaryAntenna?.downlinkRateMbps ??
    (engineering.commsData.downlinkPerPassGb * 8000) / Math.max(1, activeStationPassSec);
  const downlinkCapGb =
    downlinkPriorityActive &&
    !battStep.exhausted &&
    !battStep.belowMinOperationalSoc &&
    engineering.commsData.linkMarginDb >= 0 &&
    engineering.commsData.passesPerDay > 0 &&
    activeGroundStationId
      ? (nominalDownlinkRateMbps * anomalyDownlinkMult * dtSeconds) / 8000
      : 0;

  const maxSsrGb = Math.max(16, engineering.commsData.storageCapacityGb);
  const ssrStep = updateStorageBacklogGb({
    currentBacklogGb: prev.ssrBacklogGb + capturedGbStep,
    generatedGb: 0,
    downlinkCapacityGb: downlinkCapGb,
    storageCapacityGb: maxSsrGb,
  });
  const downlinkedGbStep = ssrStep.downlinkedGb;
  const ssrBacklogGb = ssrStep.nextBacklogGb;
  const lostGbStep = ssrStep.overflowedGb;

  if (lostGbStep > 0 && prev.ssrBacklogGb < maxSsrGb) {
    newEvents.push({
      id: `evt-ssr-overflow-${metSeconds}`,
      metSeconds,
      type: 'ANOMALY_INJECTED',
      severity: 'WARNING',
      subsystem: 'COMMS',
      title: 'Onboard SSR Buffer Overflow — Science Data Dropped',
      description: `Solid-State Recorder saturated at ${maxSsrGb} GB. Switch payload to Standby or trigger Priority Downlink.`,
      requiresAction: true,
    });
  }

  // 7. Lumped-capacitance thermal ODE step (invariant to dtSeconds) & propellant kinematics
  const targetTempC =
    (inEclipse
      ? engineering.thermal.equilibriumColdTempC
      : engineering.thermal.equilibriumHotTempC) +
    anomalyTempOffsetC +
    (heaterOverrideOn ? 8.5 : 0);
  const thermalTauSec = Math.max(
    900,
    (engineering.thermal.thermalCapacityJPerK ?? 45000) / 30.0
  );
  const thermalRelaxAlpha = 1 - Math.exp(-Math.max(0, dtSeconds) / thermalTauSec);
  const temperatureC =
    prev.temperatureC + (targetTempC - prev.temperatureC) * thermalRelaxAlpha;

  // Micro-impulse attitude desaturation / orbit maintenance duty cycle (~0.015% burn duty when propulsion exists)
  const propUsedKg =
    prev.propellantRemainingKg > 0 && engineering.propulsion.massFlowRateKgPerSec > 0
      ? Math.min(
          prev.propellantRemainingKg,
          engineering.propulsion.massFlowRateKgPerSec * dtSeconds * 0.00015
        )
      : 0;

  const dtHours = Math.max(0, dtSeconds) / 3600;
  const healthPenaltyPerHour =
    (battStep.exhausted ? 60.0 : battStep.belowMinOperationalSoc ? 2.0 : 0) +
    (temperatureC > 48 || temperatureC < -15 ? 2.5 : 0) +
    unresolvedAnomalies.length * 0.35;
  const systemHealthPct = Math.max(
    0,
    Math.min(100, prev.systemHealthPct - healthPenaltyPerHour * dtHours)
  );

  const nextPoint: TelemetryPoint = {
    metSeconds,
    orbitNumber,
    trueAnomalyDeg: Number(state.trueAnomalyDeg.toFixed(1)),
    latitudeDeg: Number(state.latitudeDeg.toFixed(2)),
    longitudeDeg: Number(state.longitudeDeg.toFixed(2)),
    altitudeKm: Number(state.altitudeKm.toFixed(1)),
    velocityMps: Number(state.velocityMps.toFixed(1)),
    positionEciKm: state.positionEciKm,
    inEclipse,
    solarGenerationW: Number(solarGenerationW.toFixed(1)),
    powerLoadW: Number(powerLoadW.toFixed(1)),
    batterySocPct: Number(batterySocPct.toFixed(1)),
    ssrBacklogGb: Number(ssrBacklogGb.toFixed(2)),
    cumulativeDataCapturedGb: Number(
      (prev.cumulativeDataCapturedGb + capturedGbStep).toFixed(2)
    ),
    cumulativeDataDownlinkedGb: Number(
      (prev.cumulativeDataDownlinkedGb + downlinkedGbStep).toFixed(2)
    ),
    cumulativeDataLostGb: Number((prev.cumulativeDataLostGb + lostGbStep).toFixed(2)),
    propellantRemainingKg: Number(
      Math.max(0, prev.propellantRemainingKg - propUsedKg).toFixed(4)
    ),
    temperatureC: Number(temperatureC.toFixed(1)),
    linkMarginDb: Number(
      (
        engineering.commsData.linkMarginDb -
        (anomalyDownlinkMult < 1 ? 2.4 : 0)
      ).toFixed(2)
    ),
    activeGroundStationId,
    activeTargetRegionId,
    systemHealthPct: Number(systemHealthPct.toFixed(2)),
  };

  return {
    nextPoint,
    newEvents,
    triggeredAnomaly,
    mappedRegionId,
  };
}
