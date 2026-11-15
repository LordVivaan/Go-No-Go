import { create } from 'zustand';
import { STANDARD_GRAVITY_M_S2 } from '../engine/constants';
import { propagateKeplerianState } from '../engine/orbital';
import { computeTsiolkovskyDeltaVMps } from '../engine/propulsion';
import { evaluateMissionScore } from '../engine/scoring';
import { stepSimulationState } from '../engine/simulation';
import type {
  ActiveAnomaly,
  InstrumentMode,
  MissionScoreReport,
  SimEvent,
  TelemetryPoint,
} from '../types/simulation';
import { getMissionConfigSignature, resolveMissionEntities, useMissionStore } from './missionStore';

export const FIXED_PHYSICS_DT_SECONDS = 60;

export interface SimulationStoreState {
  isRunning: boolean;
  speedMultiplier: 1 | 10 | 60 | 300;
  seed: number;
  simAccumulatorSec: number;
  missionSignature: string;
  instrumentMode: InstrumentMode;
  disabledInstrumentIds: string[];
  safeModeActive: boolean;
  heaterOverrideOn: boolean;
  downlinkPriorityActive: boolean;
  batteryExhaustedDuringRun: boolean;
  currentTelemetry: TelemetryPoint;
  telemetryHistory: TelemetryPoint[];
  events: SimEvent[];
  activeAnomalies: ActiveAnomaly[];
  mappedRegionIds: string[];
  completedReport: MissionScoreReport | null;

  // Actions
  initializeSimulation: (customSeed?: number, autoStart?: boolean) => void;
  syncWithMissionIfIdle: () => void;
  tickSimulation: (dtSeconds?: number) => void;
  advanceSimulationByElapsedSeconds: (simDeltaSeconds: number) => void;
  fastForwardSimulationHours: (hours?: number, stepSec?: number) => void;
  togglePlayPause: () => void;
  setSpeedMultiplier: (mult: 1 | 10 | 60 | 300) => void;
  setInstrumentMode: (mode: InstrumentMode) => void;
  toggleInstrumentActive: (instrumentId: string) => void;
  toggleSafeMode: () => void;
  toggleHeaterOverride: () => void;
  toggleDownlinkPriority: () => void;
  executeMitigationCommand: (commandId: string) => void;
  executeManualDownlinkBurst: () => void;
  executeOrbitTrimBurn: () => void;
  completeMissionAndGenerateReport: () => MissionScoreReport;
}

function createInitialTelemetry(): TelemetryPoint {
  const missionState = useMissionStore.getState();
  const { orbit, engineering } = resolveMissionEntities(missionState);
  const state0 = propagateKeplerianState(orbit, 0);

  return {
    metSeconds: 0,
    orbitNumber: 1,
    trueAnomalyDeg: Number(state0.trueAnomalyDeg.toFixed(1)),
    latitudeDeg: Number(state0.latitudeDeg.toFixed(2)),
    longitudeDeg: Number(state0.longitudeDeg.toFixed(2)),
    altitudeKm: Number(state0.altitudeKm.toFixed(1)),
    velocityMps: Number(state0.velocityMps.toFixed(1)),
    positionEciKm: state0.positionEciKm,
    inEclipse: false,
    solarGenerationW: engineering.power.eolSolarPowerW,
    powerLoadW: engineering.power.sunlightLoadW,
    batterySocPct: 96.0,
    ssrBacklogGb: 2.4,
    cumulativeDataCapturedGb: 2.4,
    cumulativeDataDownlinkedGb: 0,
    cumulativeDataLostGb: 0,
    propellantRemainingKg: engineering.mass.propellantMassKg,
    temperatureC: Number(
      (
        (engineering.thermal.equilibriumHotTempC +
          engineering.thermal.equilibriumColdTempC) /
        2
      ).toFixed(1)
    ),
    linkMarginDb: engineering.commsData.linkMarginDb,
    activeGroundStationId: null,
    activeTargetRegionId: null,
    systemHealthPct: 100.0,
  };
}

export const useSimulationStore = create<SimulationStoreState>((set, get) => ({
  isRunning: false,
  speedMultiplier: 60,
  seed: 20261114,
  simAccumulatorSec: 0,
  missionSignature: getMissionConfigSignature(useMissionStore.getState()),
  instrumentMode: 'NOMINAL_SURVEY',
  disabledInstrumentIds: [],
  safeModeActive: false,
  heaterOverrideOn: false,
  downlinkPriorityActive: true,
  batteryExhaustedDuringRun: false,
  currentTelemetry: createInitialTelemetry(),
  telemetryHistory: [createInitialTelemetry()],
  events: [
    {
      id: 'evt-init-0',
      metSeconds: 0,
      type: 'MILESTONE',
      severity: 'INFO',
      subsystem: 'FLIGHT_CONTROL',
      title: 'Orbital Insertion & Solar Array Deployment Confirmed',
      description:
        'Spacecraft acquired 3-axis nadir pointing attitude; payload and X/Ka-band transceivers initialized.',
    },
  ],
  activeAnomalies: [],
  mappedRegionIds: [],
  completedReport: null,

  initializeSimulation: (customSeed = 20261114, autoStart = false) => {
    const initialPoint = createInitialTelemetry();
    const sig = getMissionConfigSignature(useMissionStore.getState());
    set({
      isRunning: autoStart,
      seed: customSeed,
      simAccumulatorSec: 0,
      missionSignature: sig,
      instrumentMode: 'NOMINAL_SURVEY',
      disabledInstrumentIds: [],
      safeModeActive: false,
      heaterOverrideOn: false,
      downlinkPriorityActive: true,
      batteryExhaustedDuringRun: false,
      currentTelemetry: initialPoint,
      telemetryHistory: [initialPoint],
      activeAnomalies: [],
      mappedRegionIds: [],
      completedReport: null,
      events: [
        {
          id: 'evt-init-0',
          metSeconds: 0,
          type: 'MILESTONE',
          severity: 'INFO',
          subsystem: 'FLIGHT_CONTROL',
          title: 'Orbital Insertion & Solar Array Deployment Confirmed',
          description:
            'Spacecraft acquired 3-axis nadir pointing attitude; payload and X/Ka-band transceivers initialized.',
        },
      ],
    });
  },

  syncWithMissionIfIdle: () => {
    const state = get();
    const currentSig = getMissionConfigSignature(useMissionStore.getState());
    if (state.currentTelemetry.metSeconds === 0 && state.missionSignature !== currentSig) {
      state.initializeSimulation(state.seed);
    }
  },

  tickSimulation: (dtSeconds = FIXED_PHYSICS_DT_SECONDS) => {
    const state = get();
    const missionState = useMissionStore.getState();
    const { difficulty, scenario, bus, subsystems, orbit, instruments, engineering } =
      resolveMissionEntities(missionState);

    const { nextPoint, newEvents, triggeredAnomaly, resolvedAnomalyIds, mappedRegionId } =
      stepSimulationState(state.currentTelemetry, dtSeconds, {
        scenario,
        orbit,
        instruments,
        engineering,
        bus,
        subsystems,
        instrumentMode: state.instrumentMode,
        activeAnomalies: state.activeAnomalies,
        seed: state.seed,
        difficulty,
        disabledInstrumentIds: state.disabledInstrumentIds,
        safeModeActive: state.safeModeActive,
        heaterOverrideOn: state.heaterOverrideOn,
        downlinkPriorityActive: state.downlinkPriorityActive,
      });

    let updatedAnomalies = state.activeAnomalies.map((a) =>
      resolvedAnomalyIds.includes(a.id) ? { ...a, resolved: true } : a
    );
    if (triggeredAnomaly) {
      updatedAnomalies = [...updatedAnomalies, triggeredAnomaly];
    }

    const resolvedCommands = new Set(
      state.activeAnomalies
        .filter((a) => resolvedAnomalyIds.includes(a.id))
        .map((a) => a.mitigationCommand)
    );
    const updatedPrevEvents =
      resolvedCommands.size > 0
        ? state.events.map((e) =>
            e.recommendedCommandId && resolvedCommands.has(e.recommendedCommandId)
              ? { ...e, resolved: true }
              : e
          )
        : state.events;

    const updatedMappedRegions =
      mappedRegionId && !state.mappedRegionIds.includes(mappedRegionId)
        ? [...state.mappedRegionIds, mappedRegionId]
        : state.mappedRegionIds;

    const exhaustedNow = state.batteryExhaustedDuringRun || nextPoint.batterySocPct <= 0;
    const missionLostNow = nextPoint.systemHealthPct <= 0;

    set({
      isRunning: missionLostNow ? false : state.isRunning,
      safeModeActive: nextPoint.batterySocPct <= 0 ? true : state.safeModeActive,
      batteryExhaustedDuringRun: exhaustedNow,
      currentTelemetry: nextPoint,
      telemetryHistory: [...state.telemetryHistory.slice(-359), nextPoint],
      events: [...newEvents.reverse(), ...updatedPrevEvents].slice(0, 120),
      activeAnomalies: updatedAnomalies,
      mappedRegionIds: updatedMappedRegions,
    });
  },

  /** Frame-rate-independent fixed-timestep physics accumulator so all speeds reproduce identical orbital states. */
  advanceSimulationByElapsedSeconds: (simDeltaSeconds) => {
    if (!Number.isFinite(simDeltaSeconds) || simDeltaSeconds <= 0) return;
    const clampedDelta = Math.min(simDeltaSeconds, FIXED_PHYSICS_DT_SECONDS * 60);
    const totalPending = get().simAccumulatorSec + clampedDelta;
    const fixedSteps = Math.floor(totalPending / FIXED_PHYSICS_DT_SECONDS);
    const remainder = totalPending - fixedSteps * FIXED_PHYSICS_DT_SECONDS;

    if (fixedSteps <= 0) {
      set({ simAccumulatorSec: remainder });
      return;
    }

    const missionState = useMissionStore.getState();
    const { difficulty, scenario, bus, subsystems, orbit, instruments, engineering } =
      resolveMissionEntities(missionState);

    const state = get();
    let curr = state.currentTelemetry;
    let anomalies = [...state.activeAnomalies];
    let mapped = [...state.mappedRegionIds];
    let events = [...state.events];
    const history = [...state.telemetryHistory];
    let safeMode = state.safeModeActive;
    let battExhausted = state.batteryExhaustedDuringRun;
    let isRunning = state.isRunning;

    for (let i = 0; i < fixedSteps; i++) {
      const { nextPoint, newEvents, triggeredAnomaly, resolvedAnomalyIds, mappedRegionId } =
        stepSimulationState(curr, FIXED_PHYSICS_DT_SECONDS, {
          scenario,
          orbit,
          instruments,
          engineering,
          bus,
          subsystems,
          instrumentMode: state.instrumentMode,
          activeAnomalies: anomalies,
          seed: state.seed,
          difficulty,
          disabledInstrumentIds: state.disabledInstrumentIds,
          safeModeActive: safeMode,
          heaterOverrideOn: state.heaterOverrideOn,
          downlinkPriorityActive: state.downlinkPriorityActive,
        });

      curr = nextPoint;
      if (resolvedAnomalyIds.length > 0) {
        const resolvedCmds = new Set(
          anomalies
            .filter((a) => resolvedAnomalyIds.includes(a.id))
            .map((a) => a.mitigationCommand)
        );
        anomalies = anomalies.map((a) =>
          resolvedAnomalyIds.includes(a.id) ? { ...a, resolved: true } : a
        );
        events = events.map((e) =>
          e.recommendedCommandId && resolvedCmds.has(e.recommendedCommandId)
            ? { ...e, resolved: true }
            : e
        );
      }
      if (triggeredAnomaly) anomalies = [...anomalies, triggeredAnomaly];
      if (mappedRegionId && !mapped.includes(mappedRegionId)) {
        mapped = [...mapped, mappedRegionId];
      }
      if (newEvents.length > 0) {
        events = [...newEvents.reverse(), ...events].slice(0, 120);
      }
      if (nextPoint.batterySocPct <= 0) {
        battExhausted = true;
        safeMode = true;
      }
      history.push(nextPoint);
      const durationSec = scenario.simulationDurationDays * 86400;
      if (nextPoint.systemHealthPct <= 0 || nextPoint.metSeconds >= durationSec) {
        isRunning = false;
        break;
      }
    }

    set({
      isRunning,
      simAccumulatorSec: remainder,
      safeModeActive: safeMode,
      batteryExhaustedDuringRun: battExhausted,
      currentTelemetry: curr,
      telemetryHistory: history.slice(-360),
      events,
      activeAnomalies: anomalies,
      mappedRegionIds: mapped,
    });
  },

  fastForwardSimulationHours: (hours = 24, stepSec = FIXED_PHYSICS_DT_SECONDS) => {
    const steps = Math.max(1, Math.round((hours * 3600) / stepSec));
    const missionState = useMissionStore.getState();
    const { difficulty, scenario, bus, subsystems, orbit, instruments, engineering } =
      resolveMissionEntities(missionState);

    const state = get();
    let curr = state.currentTelemetry;
    let anomalies = [...state.activeAnomalies];
    let mapped = [...state.mappedRegionIds];
    let events = [...state.events];
    const history = [...state.telemetryHistory];
    let safeMode = state.safeModeActive;
    let battExhausted = state.batteryExhaustedDuringRun;

    const sampleStride = Math.max(1, Math.floor(steps / 120));

    for (let i = 0; i < steps; i++) {
      const { nextPoint, newEvents, triggeredAnomaly, resolvedAnomalyIds, mappedRegionId } =
        stepSimulationState(curr, stepSec, {
          scenario,
          orbit,
          instruments,
          engineering,
          bus,
          subsystems,
          instrumentMode: state.instrumentMode,
          activeAnomalies: anomalies,
          seed: state.seed,
          difficulty,
          disabledInstrumentIds: state.disabledInstrumentIds,
          safeModeActive: safeMode,
          heaterOverrideOn: state.heaterOverrideOn,
          downlinkPriorityActive: state.downlinkPriorityActive,
        });

      curr = nextPoint;
      if (resolvedAnomalyIds.length > 0) {
        const resolvedCmds = new Set(
          anomalies
            .filter((a) => resolvedAnomalyIds.includes(a.id))
            .map((a) => a.mitigationCommand)
        );
        anomalies = anomalies.map((a) =>
          resolvedAnomalyIds.includes(a.id) ? { ...a, resolved: true } : a
        );
        events = events.map((e) =>
          e.recommendedCommandId && resolvedCmds.has(e.recommendedCommandId)
            ? { ...e, resolved: true }
            : e
        );
      }
      if (triggeredAnomaly) anomalies = [...anomalies, triggeredAnomaly];
      if (mappedRegionId && !mapped.includes(mappedRegionId)) {
        mapped = [...mapped, mappedRegionId];
      }
      if (newEvents.length > 0) {
        events = [...newEvents.reverse(), ...events].slice(0, 120);
      }
      if (nextPoint.batterySocPct <= 0) {
        battExhausted = true;
        safeMode = true;
      }
      if (i % sampleStride === 0 || i === steps - 1) {
        history.push(nextPoint);
      }
      if (nextPoint.systemHealthPct <= 0) {
        break;
      }
    }

    set({
      isRunning: false,
      simAccumulatorSec: 0,
      safeModeActive: safeMode,
      batteryExhaustedDuringRun: battExhausted,
      currentTelemetry: curr,
      telemetryHistory: history.slice(-360),
      events,
      activeAnomalies: anomalies,
      mappedRegionIds: mapped,
    });
  },

  togglePlayPause: () => set((state) => ({ isRunning: !state.isRunning })),

  setSpeedMultiplier: (speedMultiplier) => set({ speedMultiplier }),

  setInstrumentMode: (instrumentMode) =>
    set((state) => ({
      instrumentMode,
      safeModeActive: false,
      events: [
        {
          id: `evt-cmd-mode-${Date.now()}`,
          metSeconds: state.currentTelemetry.metSeconds,
          type: 'OPERATOR_COMMAND',
          severity: 'INFO',
          subsystem: 'PAYLOAD',
          title: `Payload Mode Changed -> ${instrumentMode}`,
          description: `Flight Controller commanded payload duty cycle mode to ${instrumentMode}.`,
        },
        ...state.events,
      ],
    })),

  toggleInstrumentActive: (instrumentId) =>
    set((state) => {
      const currentlyDisabled = state.disabledInstrumentIds.includes(instrumentId);
      const nextDisabled = currentlyDisabled
        ? state.disabledInstrumentIds.filter((id) => id !== instrumentId)
        : [...state.disabledInstrumentIds, instrumentId];
      return {
        disabledInstrumentIds: nextDisabled,
        events: [
          {
            id: `evt-inst-toggle-${Date.now()}-${instrumentId}`,
            metSeconds: state.currentTelemetry.metSeconds,
            type: 'OPERATOR_COMMAND',
            severity: 'INFO',
            subsystem: 'PAYLOAD',
            title: currentlyDisabled
              ? `Instrument Activated: ${instrumentId}`
              : `Instrument Powered Off: ${instrumentId}`,
            description: currentlyDisabled
              ? 'Instrument powered ON and restored to observation queue.'
              : 'Instrument switched OFF to reduce electrical load and SSR write rate.',
          },
          ...state.events,
        ],
      };
    }),

  toggleSafeMode: () =>
    set((state) => {
      const next = !state.safeModeActive;
      return {
        safeModeActive: next,
        instrumentMode: next ? 'OFF' : state.instrumentMode,
        events: [
          {
            id: `evt-safe-${Date.now()}`,
            metSeconds: state.currentTelemetry.metSeconds,
            type: 'OPERATOR_COMMAND',
            severity: next ? 'WARNING' : 'INFO',
            subsystem: 'FLIGHT_CONTROL',
            title: next ? 'Spacecraft Commanded to SAFE MODE' : 'Exited SAFE MODE -> Nominal Bus',
            description: next
              ? 'All non-essential payloads powered down to conserve EPS battery reserves.'
              : 'Bus power nominal; operators may re-enable science payloads.',
          },
          ...state.events,
        ],
      };
    }),

  toggleHeaterOverride: () =>
    set((state) => {
      const next = !state.heaterOverrideOn;
      return {
        heaterOverrideOn: next,
        events: [
          {
            id: `evt-heater-${Date.now()}`,
            metSeconds: state.currentTelemetry.metSeconds,
            type: 'OPERATOR_COMMAND',
            severity: 'INFO',
            subsystem: 'THERMAL',
            title: next ? 'Survival Heater Override ENABLED (+18 W)' : 'Survival Heater Override OFF',
            description: next
              ? 'Auxiliary bus heaters commanded ON to protect electronics from cold soak.'
              : 'Returned thermal loop to passive louver/radiator regulation.',
          },
          ...state.events,
        ],
      };
    }),

  toggleDownlinkPriority: () =>
    set((state) => {
      const next = !state.downlinkPriorityActive;
      return {
        downlinkPriorityActive: next,
        events: [
          {
            id: `evt-dl-sched-${Date.now()}`,
            metSeconds: state.currentTelemetry.metSeconds,
            type: 'OPERATOR_COMMAND',
            severity: 'INFO',
            subsystem: 'COMMS',
            title: next ? 'Ground Contact Downlink Scheduler ARMED' : 'Downlink Hold (SSR Buffering Only)',
            description: next
              ? 'Automated ground-station pass downlink active during NSN visibility windows.'
              : 'Science products queued in onboard Solid-State Recorder pending contact release.',
          },
          ...state.events,
        ],
      };
    }),

  executeMitigationCommand: (commandId) =>
    set((state) => {
      const target = state.activeAnomalies.find(
        (a) => a.mitigationCommand === commandId && !a.resolved
      );
      if (!target) return state;

      const updatedAnomalies = state.activeAnomalies.map((a) =>
        a.id === target.id ? { ...a, resolved: true } : a
      );

      const updatedEvents: SimEvent[] = [
        {
          id: `evt-resolve-${Date.now()}`,
          metSeconds: state.currentTelemetry.metSeconds,
          type: 'OPERATOR_COMMAND',
          severity: 'INFO',
          subsystem: target.subsystem,
          title: `RESOLVED: ${target.title}`,
          description: `Executed ${target.mitigationLabel}. Subsystem telemetry returning to nominal envelope.`,
        },
        ...state.events.map((e) =>
          e.recommendedCommandId === commandId ? { ...e, resolved: true } : e
        ),
      ];

      return {
        activeAnomalies: updatedAnomalies,
        events: updatedEvents,
      };
    }),

  executeManualDownlinkBurst: () =>
    set((state) => {
      const missionState = useMissionStore.getState();
      const { engineering } = resolveMissionEntities(missionState);
      if (engineering.commsData.linkMarginDb < 0 || state.currentTelemetry.batterySocPct <= 0) {
        return {
          events: [
            {
              id: `evt-burst-fail-${Date.now()}`,
              metSeconds: state.currentTelemetry.metSeconds,
              type: 'OPERATOR_COMMAND',
              severity: 'CRITICAL',
              subsystem: 'COMMS',
              title: 'Priority Downlink Blocked (Insufficient Link Margin / Bus Power)',
              description:
                'RF link margin is negative or bus battery exhausted; cannot execute priority SSR dump.',
            },
            ...state.events,
          ],
        };
      }

      const hasDirectPass = Boolean(state.currentTelemetry.activeGroundStationId);
      if (!hasDirectPass && state.currentTelemetry.batterySocPct <= 25) {
        return {
          events: [
            {
              id: `evt-burst-reserve-${Date.now()}`,
              metSeconds: state.currentTelemetry.metSeconds,
              type: 'OPERATOR_COMMAND',
              severity: 'WARNING',
              subsystem: 'COMMS',
              title: 'Relay Burst Inhibited (Battery Reserve <= 25%)',
              description:
                'No ground station pass is active and battery SoC is too low for an emergency high-power relay burst.',
            },
            ...state.events,
          ],
        };
      }

      const maxBurstGb = hasDirectPass ? 6.5 : 3.5;
      const batteryPenaltyPct = hasDirectPass ? 0 : 1.2;
      const dumpGb = Math.min(state.currentTelemetry.ssrBacklogGb, maxBurstGb);
      if (dumpGb <= 0) return state;

      const updatedPoint: TelemetryPoint = {
        ...state.currentTelemetry,
        ssrBacklogGb: Number((state.currentTelemetry.ssrBacklogGb - dumpGb).toFixed(2)),
        batterySocPct: Number(
          Math.max(0, state.currentTelemetry.batterySocPct - batteryPenaltyPct).toFixed(1)
        ),
        cumulativeDataDownlinkedGb: Number(
          (state.currentTelemetry.cumulativeDataDownlinkedGb + dumpGb).toFixed(2)
        ),
      };

      return {
        currentTelemetry: updatedPoint,
        events: [
          {
            id: `evt-burst-${Date.now()}`,
            metSeconds: state.currentTelemetry.metSeconds,
            type: 'OPERATOR_COMMAND',
            severity: 'INFO',
            subsystem: 'COMMS',
            title: hasDirectPass
              ? `Direct Station SSR Priority Dump (+${dumpGb.toFixed(1)} GB)`
              : `Emergency Relay SSR Dump (+${dumpGb.toFixed(1)} GB, -${batteryPenaltyPct}% SoC)`,
            description: hasDirectPass
              ? `Executed priority X/Ka-Band burst downlink over ${state.currentTelemetry.activeGroundStationId}.`
              : 'Out-of-station pass; routed compressed SSR burst via orbital relay at elevated RF power draw.',
          },
          ...state.events,
        ],
      };
    }),

  executeOrbitTrimBurn: () =>
    set((state) => {
      const missionState = useMissionStore.getState();
      const { subsystems, engineering } = resolveMissionEntities(missionState);
      const thrusters = subsystems.filter((s) => s.category === 'PROPULSION');
      const primaryThruster = [...thrusters].sort(
        (a, b) => (b.ispSeconds ?? 0) - (a.ispSeconds ?? 0)
      )[0];
      const ispSec = primaryThruster?.ispSeconds ?? 0;

      if (ispSec <= 0 || state.currentTelemetry.propellantRemainingKg <= 0.05) {
        return {
          events: [
            {
              id: `evt-burn-fail-${Date.now()}`,
              metSeconds: state.currentTelemetry.metSeconds,
              type: 'OPERATOR_COMMAND',
              severity: 'WARNING',
              subsystem: 'PROPULSION',
              title: 'Trim Burn Inhibited (Insufficient Propellant or No Thruster)',
              description:
                'Cannot execute orbit maintenance burn without active propulsion and propellant reserve.',
            },
            ...state.events,
          ],
        };
      }

      const targetDvMps = 4.5;
      const currentTotalMassKg =
        engineering.mass.dryMassKg + state.currentTelemetry.propellantRemainingKg;
      const rawBurnMassKg =
        currentTotalMassKg * (1 - Math.exp(-targetDvMps / (ispSec * STANDARD_GRAVITY_M_S2)));
      const propBurnedKg = Math.min(state.currentTelemetry.propellantRemainingKg, rawBurnMassKg);
      const actualDvMps = computeTsiolkovskyDeltaVMps(
        ispSec,
        currentTotalMassKg,
        currentTotalMassKg - propBurnedKg
      );
      const remainingKg = Math.max(0, state.currentTelemetry.propellantRemainingKg - propBurnedKg);

      const updatedPoint: TelemetryPoint = {
        ...state.currentTelemetry,
        propellantRemainingKg: Number(remainingKg.toFixed(3)),
      };
      return {
        currentTelemetry: updatedPoint,
        events: [
          {
            id: `evt-burn-${Date.now()}`,
            metSeconds: state.currentTelemetry.metSeconds,
            type: 'OPERATOR_COMMAND',
            severity: 'INFO',
            subsystem: 'PROPULSION',
            title: `Executed ${actualDvMps.toFixed(1)} m/s Trim Burn (-${propBurnedKg.toFixed(3)} kg Propellant)`,
            description: `Corrected ground-track drift via ${primaryThruster?.name ?? 'thruster'} (Isp ${ispSec} s).`,
          },
          ...state.events,
        ],
      };
    }),

  completeMissionAndGenerateReport: () => {
    const state = get();
    const missionState = useMissionStore.getState();
    const { difficulty, scenario, instruments, engineering } =
      resolveMissionEntities(missionState);

    const resolvedCount = state.activeAnomalies.filter((a) => a.resolved).length;
    const totalAnom = state.activeAnomalies.length;

    const capturedGb = state.currentTelemetry.cumulativeDataCapturedGb;
    const downlinkedGb = state.currentTelemetry.cumulativeDataDownlinkedGb;
    const lostGb = state.currentTelemetry.cumulativeDataLostGb;
    const completionDurationSec = Math.max(60, Math.round(state.currentTelemetry.metSeconds));

    const report = evaluateMissionScore({
      scenario,
      difficulty,
      configurationName: missionState.configurationName,
      engineering,
      instruments,
      seed: state.seed,
      completionDurationSec,
      totalDataCapturedGb: capturedGb,
      totalDataDownlinkedGb: downlinkedGb,
      totalDataLostGb: lostGb,
      floodRegionsMappedCount: state.mappedRegionIds.length,
      anomaliesResolvedCount: resolvedCount,
      anomaliesTotalCount: totalAnom,
      batteryExhausted: state.batteryExhaustedDuringRun,
      finalSystemHealthPct: state.currentTelemetry.systemHealthPct,
    });

    set({ isRunning: false, completedReport: report });
    return report;
  },
}));
