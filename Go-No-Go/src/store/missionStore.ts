import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { SPACECRAFT_BUSES, SUBSYSTEM_COMPONENTS } from '../data/components';
import { SCIENTIFIC_INSTRUMENTS } from '../data/instruments';
import { LAUNCH_VEHICLES } from '../data/launchVehicles';
import { ORBIT_CATALOG } from '../data/orbits';
import {
  DEFAULT_SCENARIO_ID,
  MISSION_SCENARIOS,
  applyDifficultyToScenario,
} from '../data/scenarios';
import { evaluateMissionScore } from '../engine/scoring';
import { evaluateMissionEngineering } from '../engine/validation';
import { clearRecordedEoDatasetUsage } from '../services/planetaryComputerService';
import { clearRecordedWeatherUsage } from '../services/weatherService';
import type { EngineeringSummary } from '../types/engineering';
import type { MissionDifficulty, ScenarioDefinition } from '../types/mission';
import type { MissionScoreReport } from '../types/simulation';
import type {
  ComponentCategory,
  LaunchVehicle,
  OrbitalParameters,
  ScientificInstrument,
  SpacecraftComponent,
} from '../types/spacecraft';

export interface MissionPreset {
  id: string;
  name: string;
  badge: string;
  description: string;
  scenarioId: string;
  busId: string;
  subsystemIds: Record<Exclude<ComponentCategory, 'BUS'>, string>;
  instrumentIds: string[];
  orbitId: string;
  launchVehicleId: string;
}

export const MISSION_PRESETS: MissionPreset[] = [
  {
    id: 'preset-lunar-nominal-go',
    name: 'Lunar Scout Polar Baseline (Flight-Ready GO)',
    badge: 'RECOMMENDED · GO',
    description:
      'Balanced ESPA-class SmallSat combining a Neutron/Gamma Spectrometer and Thermal IR Imager in a 100 km Lunar Polar orbit with X-Band downlink and Hall-Effect propulsion.',
    scenarioId: 'lunar-ice-02',
    busId: 'bus-espa-smallsat',
    subsystemIds: {
      SOLAR_ARRAY: 'solar-wings-espa',
      BATTERY: 'batt-liion-650wh',
      ANTENNA: 'comm-kaband-hga',
      PROPULSION: 'prop-hall-xenon',
      THERMAL: 'therm-active-louvers',
      AVIONICS: 'avio-rad750-redundant',
    },
    instrumentIds: ['inst-neutron-spectrometer', 'inst-thermal-ir'],
    orbitId: 'orbit-lunar-polar-100',
    launchVehicleId: 'lv-dedicated-smallsat',
  },
  {
    id: 'preset-cubesat-nogo-demo',
    name: '6U CubeSat Optical Scout (Constraint-Limited NO-GO)',
    badge: 'BUDGET DEMO · NO-GO',
    description:
      'Ultra-low-cost 6U CubeSat carrying a daylight-only Optical RGB camera in 400 km LEO. Demonstrates how insufficient payload capability, orbit mismatch, and tight margins trigger a strict NO-GO hold.',
    scenarioId: 'lunar-ice-02',
    busId: 'bus-cubesat-6u',
    subsystemIds: {
      SOLAR_ARRAY: 'solar-body-6u',
      BATTERY: 'batt-liion-120wh',
      ANTENNA: 'comm-sband-patch',
      PROPULSION: 'prop-cold-gas',
      THERMAL: 'therm-passive-mli',
      AVIONICS: 'avio-rad-tolerant-single',
    },
    instrumentIds: ['inst-optical-rgb'],
    orbitId: 'orbit-leo-400-iss',
    launchVehicleId: 'lv-ppod-rideshare',
  },
  {
    id: 'preset-mars-observer-go',
    name: 'Mars Observer Deep-Space Relay (Flagship GO)',
    badge: 'DEEP SPACE · GO',
    description:
      'Medium Observatory carrying Thermal IR and Multispectral SWIR with a ROSA solar array, Ka-band high-gain dish, and Xenon Hall propulsion in 400 km Martian SSO.',
    scenarioId: 'mars-areo-03',
    busId: 'bus-medium-observatory',
    subsystemIds: {
      SOLAR_ARRAY: 'solar-wings-deep-space',
      BATTERY: 'batt-liion-1500wh',
      ANTENNA: 'comm-kaband-hga',
      PROPULSION: 'prop-hall-xenon',
      THERMAL: 'therm-active-louvers',
      AVIONICS: 'avio-rad750-redundant',
    },
    instrumentIds: ['inst-thermal-ir', 'inst-multispectral-swir'],
    orbitId: 'orbit-mars-sso-400',
    launchVehicleId: 'lv-medium-eelv',
  },
];

export type LaunchAuthorizationStatus = 'PENDING' | 'GO' | 'NO_GO';

export interface MissionStoreState {
  configurationName: string;
  difficulty: MissionDifficulty;
  scenarioId: string;
  busId: string;
  subsystemIds: Record<Exclude<ComponentCategory, 'BUS'>, string>;
  instrumentIds: string[];
  orbitId: string;
  customAltitudeKm: number | null;
  customPerigeeKm: number | null;
  customApogeeKm: number | null;
  customInclinationDeg: number | null;
  launchVehicleId: string;
  userLaunchAuthorization: LaunchAuthorizationStatus;
  riskAcknowledged: boolean;

  // Actions
  setConfigurationName: (name: string) => void;
  setDifficulty: (difficulty: MissionDifficulty) => void;
  selectScenario: (scenarioId: string) => void;
  selectBus: (busId: string) => void;
  selectSubsystem: (category: Exclude<ComponentCategory, 'BUS'>, componentId: string) => void;
  toggleInstrument: (instrumentId: string) => void;
  selectOrbit: (orbitId: string) => void;
  setCustomOrbitParams: (
    perigeeKm: number | null,
    inclinationDeg: number | null,
    apogeeKm?: number | null
  ) => void;
  selectLaunchVehicle: (launchVehicleId: string) => void;
  authorizeLaunch: (riskAcknowledged?: boolean) => void;
  holdLaunch: () => void;
  applyPreset: (presetId: string) => void;
  resetMissionForNewAttempt: () => void;
}

export type ResolveMissionInput = {
  configurationName?: string;
  difficulty?: MissionDifficulty;
  scenarioId: string;
  busId: string;
  subsystemIds: Record<Exclude<ComponentCategory, 'BUS'>, string>;
  instrumentIds: string[];
  orbitId: string;
  customAltitudeKm?: number | null;
  customPerigeeKm?: number | null;
  customApogeeKm?: number | null;
  customInclinationDeg: number | null;
  launchVehicleId: string;
};

export type ResolvedMissionEntities = {
  difficulty: MissionDifficulty;
  scenario: ScenarioDefinition;
  bus: SpacecraftComponent;
  subsystems: SpacecraftComponent[];
  instruments: ScientificInstrument[];
  orbit: OrbitalParameters;
  launchVehicle: LaunchVehicle;
  engineering: EngineeringSummary;
  scorePreview: MissionScoreReport;
};

let lastResolveInput: ResolveMissionInput | null = null;
let lastResolveOutput: ResolvedMissionEntities | null = null;

function isSameResolveInput(a: ResolveMissionInput, b: ResolveMissionInput): boolean {
  if (
    a.configurationName !== b.configurationName ||
    (a.difficulty ?? 'STANDARD') !== (b.difficulty ?? 'STANDARD') ||
    a.scenarioId !== b.scenarioId ||
    a.busId !== b.busId ||
    a.orbitId !== b.orbitId ||
    a.customAltitudeKm !== b.customAltitudeKm ||
    a.customPerigeeKm !== b.customPerigeeKm ||
    a.customApogeeKm !== b.customApogeeKm ||
    a.customInclinationDeg !== b.customInclinationDeg ||
    a.launchVehicleId !== b.launchVehicleId
  ) {
    return false;
  }
  if (a.instrumentIds.length !== b.instrumentIds.length) {
    return false;
  }
  for (let i = 0; i < a.instrumentIds.length; i += 1) {
    if (a.instrumentIds[i] !== b.instrumentIds[i]) {
      return false;
    }
  }
  const keysA = Object.keys(a.subsystemIds) as Array<Exclude<ComponentCategory, 'BUS'>>;
  const keysB = Object.keys(b.subsystemIds) as Array<Exclude<ComponentCategory, 'BUS'>>;
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const key of keysA) {
    if (a.subsystemIds[key] !== b.subsystemIds[key]) {
      return false;
    }
  }
  return true;
}

/** Resolve active mission configuration into physics, engineering, and preview score entities (memoized for identical configs). */
export function resolveMissionEntities(state: ResolveMissionInput): ResolvedMissionEntities {
  if (lastResolveInput && lastResolveOutput && isSameResolveInput(lastResolveInput, state)) {
    return lastResolveOutput;
  }

  const difficulty: MissionDifficulty = state.difficulty ?? 'STANDARD';
  const baseScenario =
    MISSION_SCENARIOS.find((s) => s.id === state.scenarioId) ?? MISSION_SCENARIOS[0];
  const scenario = applyDifficultyToScenario(baseScenario, difficulty);

  const bus =
    SPACECRAFT_BUSES.find((b) => b.id === state.busId) ?? SPACECRAFT_BUSES[1];

  const subsystems = Object.values(state.subsystemIds)
    .map((id) => SUBSYSTEM_COMPONENTS.find((c) => c.id === id))
    .filter((c): c is SpacecraftComponent => Boolean(c));

  const instruments = state.instrumentIds
    .map((id) => SCIENTIFIC_INSTRUMENTS.find((inst) => inst.id === id))
    .filter((inst): inst is ScientificInstrument => Boolean(inst));

  const baseOrbit =
    ORBIT_CATALOG.find((o) => o.id === state.orbitId) ?? ORBIT_CATALOG[1];
  const perigeeKm =
    state.customPerigeeKm ?? state.customAltitudeKm ?? baseOrbit.altitudePerigeeKm;
  const rawApogeeKm =
    state.customApogeeKm ??
    state.customPerigeeKm ??
    state.customAltitudeKm ??
    baseOrbit.altitudeApogeeKm;
  const apogeeKm = Math.max(perigeeKm, rawApogeeKm);

  const orbit: OrbitalParameters = {
    ...baseOrbit,
    altitudePerigeeKm: perigeeKm,
    altitudeApogeeKm: apogeeKm,
    inclinationDeg: state.customInclinationDeg ?? baseOrbit.inclinationDeg,
  };

  const launchVehicle =
    LAUNCH_VEHICLES.find((lv) => lv.id === state.launchVehicleId) ?? LAUNCH_VEHICLES[1];

  const engineering = evaluateMissionEngineering({
    scenario,
    bus,
    subsystems,
    instruments,
    orbit,
    launchVehicle,
    difficulty,
  });

  const scorePreview = evaluateMissionScore({
    scenario,
    difficulty,
    configurationName: state.configurationName ?? 'GNG-Baseline Spacecraft Config',
    engineering,
    instruments,
  });

  const resolved: ResolvedMissionEntities = {
    difficulty,
    scenario,
    bus,
    subsystems,
    instruments,
    orbit,
    launchVehicle,
    engineering,
    scorePreview,
  };

  lastResolveInput = {
    ...state,
    difficulty,
    subsystemIds: { ...state.subsystemIds },
    instrumentIds: [...state.instrumentIds],
  };
  lastResolveOutput = resolved;

  return resolved;
}

const defaultPreset = MISSION_PRESETS[0];

export const useMissionStore = create<MissionStoreState>()((set, get) => ({
  configurationName: 'GNG-Baseline Spacecraft Config',
  difficulty: 'STANDARD',
  scenarioId: DEFAULT_SCENARIO_ID,
  busId: defaultPreset.busId,
  subsystemIds: { ...defaultPreset.subsystemIds },
  instrumentIds: [...defaultPreset.instrumentIds],
  orbitId: defaultPreset.orbitId,
  customAltitudeKm: null,
  customPerigeeKm: null,
  customApogeeKm: null,
  customInclinationDeg: null,
  launchVehicleId: defaultPreset.launchVehicleId,
  userLaunchAuthorization: 'PENDING',
  riskAcknowledged: false,

  setConfigurationName: (name) => set({ configurationName: name }),

  setDifficulty: (difficulty) =>
    set({ difficulty, userLaunchAuthorization: 'PENDING', riskAcknowledged: false }),

  selectScenario: (scenarioId) => {
    const scenario =
      MISSION_SCENARIOS.find((s) => s.id === scenarioId) ?? MISSION_SCENARIOS[0];
    set({
      scenarioId,
      orbitId: scenario.recommendedOrbitId ?? get().orbitId,
      customAltitudeKm: null,
      customPerigeeKm: null,
      customApogeeKm: null,
      customInclinationDeg: null,
      userLaunchAuthorization: 'PENDING',
      riskAcknowledged: false,
    });
  },

  selectBus: (busId) =>
    set({ busId, userLaunchAuthorization: 'PENDING', riskAcknowledged: false }),

  selectSubsystem: (category, componentId) =>
    set((state) => ({
      subsystemIds: {
        ...state.subsystemIds,
        [category]: componentId,
      },
      userLaunchAuthorization: 'PENDING',
      riskAcknowledged: false,
    })),

  toggleInstrument: (instrumentId) =>
    set((state) => {
      const exists = state.instrumentIds.includes(instrumentId);
      if (exists) {
        return {
          instrumentIds: state.instrumentIds.filter((id) => id !== instrumentId),
          userLaunchAuthorization: 'PENDING',
          riskAcknowledged: false,
        };
      }
      return {
        instrumentIds: [...state.instrumentIds, instrumentId],
        userLaunchAuthorization: 'PENDING',
        riskAcknowledged: false,
      };
    }),

  selectOrbit: (orbitId) =>
    set({
      orbitId,
      customAltitudeKm: null,
      customPerigeeKm: null,
      customApogeeKm: null,
      customInclinationDeg: null,
      userLaunchAuthorization: 'PENDING',
      riskAcknowledged: false,
    }),

  setCustomOrbitParams: (perigeeKm, inclinationDeg, apogeeKm) =>
    set({
      customAltitudeKm: perigeeKm,
      customPerigeeKm: perigeeKm,
      customApogeeKm: apogeeKm !== undefined ? apogeeKm : perigeeKm,
      customInclinationDeg: inclinationDeg,
      userLaunchAuthorization: 'PENDING',
      riskAcknowledged: false,
    }),

  selectLaunchVehicle: (launchVehicleId) =>
    set({ launchVehicleId, userLaunchAuthorization: 'PENDING', riskAcknowledged: false }),

  authorizeLaunch: (riskAcknowledged = false) =>
    set({
      userLaunchAuthorization: 'GO',
      riskAcknowledged,
    }),

  holdLaunch: () =>
    set({
      userLaunchAuthorization: 'NO_GO',
      riskAcknowledged: false,
    }),

  applyPreset: (presetId) => {
    const preset = MISSION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    set({
      configurationName: preset.name,
      scenarioId: preset.scenarioId,
      busId: preset.busId,
      subsystemIds: { ...preset.subsystemIds },
      instrumentIds: [...preset.instrumentIds],
      orbitId: preset.orbitId,
      customAltitudeKm: null,
      customPerigeeKm: null,
      customApogeeKm: null,
      customInclinationDeg: null,
      launchVehicleId: preset.launchVehicleId,
      userLaunchAuthorization: 'PENDING',
      riskAcknowledged: false,
    });
  },

  resetMissionForNewAttempt: () => {
    clearRecordedEoDatasetUsage();
    clearRecordedWeatherUsage();
    set({
      configurationName: 'GNG-Baseline Spacecraft Config',
      difficulty: 'STANDARD',
      scenarioId: DEFAULT_SCENARIO_ID,
      busId: defaultPreset.busId,
      subsystemIds: { ...defaultPreset.subsystemIds },
      instrumentIds: [...defaultPreset.instrumentIds],
      orbitId: defaultPreset.orbitId,
      customAltitudeKm: null,
      customPerigeeKm: null,
      customApogeeKm: null,
      customInclinationDeg: null,
      launchVehicleId: defaultPreset.launchVehicleId,
      userLaunchAuthorization: 'PENDING',
      riskAcknowledged: false,
    });
  },
}));

/** Build a stable signature string representing the active hardware, payload, orbit, difficulty, and scenario selection. */
export function getMissionConfigSignature(state: ResolveMissionInput): string {
  const subs = Object.entries(state.subsystemIds)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',');
  return [
    state.scenarioId,
    state.difficulty ?? 'STANDARD',
    state.busId,
    subs,
    [...state.instrumentIds].sort().join(','),
    state.orbitId,
    state.customPerigeeKm ?? state.customAltitudeKm ?? 'default',
    state.customApogeeKm ?? state.customAltitudeKm ?? 'default',
    state.customInclinationDeg ?? 'default',
    state.launchVehicleId,
  ].join('|');
}

/** React hook returning memoized resolved mission entities using shallow Zustand subscription. */
export function useResolvedMission(): ResolvedMissionEntities {
  const slice = useMissionStore(
    useShallow((s) => ({
      configurationName: s.configurationName,
      difficulty: s.difficulty,
      scenarioId: s.scenarioId,
      busId: s.busId,
      subsystemIds: s.subsystemIds,
      instrumentIds: s.instrumentIds,
      orbitId: s.orbitId,
      customAltitudeKm: s.customAltitudeKm,
      customPerigeeKm: s.customPerigeeKm,
      customApogeeKm: s.customApogeeKm,
      customInclinationDeg: s.customInclinationDeg,
      launchVehicleId: s.launchVehicleId,
    }))
  );
  return resolveMissionEntities(slice);
}
