import type {
  DifficultyProfile,
  MissionDifficulty,
  ScenarioDefinition,
} from '../types/mission';

export const DIFFICULTY_PROFILES: Record<MissionDifficulty, DifficultyProfile> = {
  STANDARD: {
    id: 'STANDARD',
    label: 'Standard',
    subtitle: 'Class C Baseline',
    description:
      'Nominal NASA Phase-A margins (15% mass & power), 100% baseline budget cap, and standard solar/weather anomaly frequency.',
    budgetMultiplier: 1.0,
    minMassMarginPct: 15.0,
    minPowerMarginPct: 15.0,
    maxBatteryDodPct: 35.0,
    minLinkMarginDb: 3.0,
    minDeltaVMarginPct: 10.0,
    scienceDataMultiplier: 1.0,
    anomalyRateMultiplier: 1.0,
    anomalyStressMultiplier: 1.0,
  },
  HARD: {
    id: 'HARD',
    label: 'Hard',
    subtitle: 'Constrained Envelope',
    description:
      'Reduced cost cap (92%), stricter 18% launch/power margins, 30% max battery DoD, +4.5 dB RF link floor, +25% daily science quota, and 1.45× anomaly intensity.',
    budgetMultiplier: 0.92,
    minMassMarginPct: 18.0,
    minPowerMarginPct: 18.0,
    maxBatteryDodPct: 30.0,
    minLinkMarginDb: 4.5,
    minDeltaVMarginPct: 15.0,
    scienceDataMultiplier: 1.25,
    anomalyRateMultiplier: 1.45,
    anomalyStressMultiplier: 1.3,
  },
  EXPERT: {
    id: 'EXPERT',
    label: 'Expert',
    subtitle: 'Flight Director Flagship',
    description:
      'Tight 85% cost ceiling, 22% mass/power reserves, 25% max battery DoD, +6.0 dB RF link margin, +50% science volume requirement, and 1.9× anomaly severity.',
    budgetMultiplier: 0.85,
    minMassMarginPct: 22.0,
    minPowerMarginPct: 22.0,
    maxBatteryDodPct: 25.0,
    minLinkMarginDb: 6.0,
    minDeltaVMarginPct: 22.0,
    scienceDataMultiplier: 1.5,
    anomalyRateMultiplier: 1.9,
    anomalyStressMultiplier: 1.6,
  },
};

/**
 * Returns a scenario definition scaled by the selected MissionDifficulty so difficulty genuinely
 * governs budget caps, telemetry limits, KPP science floors, and operational difficulty.
 */
export function applyDifficultyToScenario(
  scenario: ScenarioDefinition,
  difficulty: MissionDifficulty
): ScenarioDefinition {
  if (difficulty === 'STANDARD') {
    return scenario;
  }
  const profile = DIFFICULTY_PROFILES[difficulty];
  const scaledBudget = Number((scenario.budgetCapMusd * profile.budgetMultiplier).toFixed(1));

  return {
    ...scenario,
    budgetCapMusd: scaledBudget,
    telemetryConstraints: {
      minPowerMarginPct: profile.minPowerMarginPct,
      maxEclipseDodPct: profile.maxBatteryDodPct,
      minLinkMarginDb: profile.minLinkMarginDb,
      minDeltaVMarginPct: profile.minDeltaVMarginPct,
      dataCompressionRatio: scenario.telemetryConstraints?.dataCompressionRatio ?? 1.0,
    },
    kpps: scenario.kpps.map((kpp) => {
      if (kpp.metricKey === 'dailyDataGb' && typeof kpp.thresholdValue === 'number') {
        return {
          ...kpp,
          thresholdValue: Math.round(kpp.thresholdValue * profile.scienceDataMultiplier),
          goalValue:
            typeof kpp.goalValue === 'number'
              ? Math.round(kpp.goalValue * profile.scienceDataMultiplier)
              : kpp.goalValue,
        };
      }
      if (kpp.metricKey === 'deltaVMarginPct' && typeof kpp.thresholdValue === 'number') {
        return {
          ...kpp,
          thresholdValue: Math.max(kpp.thresholdValue, profile.minDeltaVMarginPct),
        };
      }
      return kpp;
    }),
  };
}

export const MISSION_SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'lunar-ice-02',
    code: 'LUNAR SCOUT',
    title: 'South Pole Volatile & Permanently Shadowed Crater Orbiter',
    subtitle: 'Low-Altitude Lunar Polar Mapping of Water-Ice Deposits for Artemis Logistics',
    celestialBody: 'MOON',
    riskClass: 'B',
    budgetCapMusd: 145.0,
    developmentCostMusd: 12.0,
    operationsCostMusd: 6.0,
    designLifetimeYears: 2.0,
    simulationDurationDays: 3,
    solarFluxWPerM2: 1361.0,
    recommendedOrbitId: 'orbit-lunar-polar-100',
    isPlayable: true,
    requiredInstrumentTypes: ['SPECTROMETER', 'THERMAL_IR', 'ALTIMETER'],
    telemetryConstraints: {
      minPowerMarginPct: 20,
      maxEclipseDodPct: 35,
      minLinkMarginDb: 3.0,
      minDeltaVMarginPct: 10,
      dataCompressionRatio: 1.5,
    },
    scenarioEvents: [
      {
        id: 'evt-lunar-psr',
        triggerMetHours: 8,
        title: 'Shackleton PSR Cryogenic Thermal Transit',
        description: 'Low-altitude polar pass over < 40 K crater floor challenges thermal radiator turndown.',
        subsystem: 'THERMAL',
      },
      {
        id: 'evt-lunar-mascon',
        triggerMetHours: 24,
        title: 'Lunar Mascon Frozen-Orbit Trim Window',
        description: 'Requires propulsive Δv margin to maintain 100 km periapsis clearance.',
        subsystem: 'PROPULSION',
      },
    ],
    scoringProfile: {
      scienceWeight: 35,
      reliabilityWeight: 25,
      resourceWeight: 15,
      commsWeight: 15,
      riskCollabWeight: 10,
    },
    briefing: {
      context:
        'Permanently Shadowed Regions (PSRs) near the lunar south pole (Shackleton, Cabeus, Haworth craters) harbor ancient water-ice volatiles at cryogenic temperatures (< 40 K).',
      primaryObjective:
        'Design a lunar polar orbiter equipped with neutron/thermal spectroscopy or radar altimetry to map subsurface hydrogen abundance and surface roughness for upcoming polar landers.',
      constraintsSummary: [
        'Total life-cycle cost ≤ $145.0M USD (NASA Class B risk profile)',
        'Requires night-capable active radar, altimeter, or neutron/thermal IR spectrometer',
        'Propulsion Δv ≥ 180 m/s for lunar mascon orbit maintenance',
      ],
      segments: {
        LAUNCH: 'Cislunar translunar injection (TLI) via ESPA-Grande or Medium-Lift vehicle.',
        SPACE: 'Low-altitude 100 km polar lunar orbiter with high-impulse monopropellant or Hall propulsion.',
        GROUND: 'Deep Space Network / Near Space Network high-gain X/Ka-band telemetry.',
        USER: 'Artemis lunar surface traverse planners and ISRU volatile prospecting teams.',
      },
    },
    targetRegions: [
      {
        id: 'crater-shackleton',
        name: 'Shackleton Crater Rim & Floor',
        latitudeDeg: -89.9,
        longitudeDeg: 0.0,
        radiusKm: 120,
        cloudCoverFraction: 0.0,
        priorityWeight: 0.45,
        description: 'Permanently shadowed interior with illuminated peaks of eternal light.',
      },
      {
        id: 'crater-cabeus',
        name: 'Cabeus Volatile Basin',
        latitudeDeg: -84.9,
        longitudeDeg: -35.5,
        radiusKm: 180,
        cloudCoverFraction: 0.0,
        priorityWeight: 0.35,
        description: 'Confirmed LCROSS water-ice plume site.',
      },
      {
        id: 'crater-tycho',
        name: 'Tycho Calibration Highlands',
        latitudeDeg: -43.3,
        longitudeDeg: -11.4,
        radiusKm: 220,
        cloudCoverFraction: 0.0,
        priorityWeight: 0.20,
        description: 'Mid-latitude radiometric and altimetric calibration target.',
      },
    ],
    kpps: [
      {
        id: 'kpp-lunar-night',
        name: 'PSR Unilluminated Sensing Capability',
        metricKey: 'nightCapable',
        unit: 'bool',
        thresholdValue: true,
        goalValue: true,
        comparison: 'BOOL_TRUE',
        description: 'Must operate in permanently shadowed craters without direct sunlight.',
      },
      {
        id: 'kpp-lunar-dv',
        name: 'Lunar Orbit Maintenance Δv Margin',
        metricKey: 'deltaVMarginPct',
        unit: '%',
        thresholdValue: 10,
        goalValue: 25,
        comparison: 'GTE',
        description: 'Propulsive margin above lunar mascon station-keeping requirement.',
      },
    ],
  },
  {
    id: 'mars-areo-03',
    code: 'MARS OBSERVER',
    title: 'Martian Polar Cap & Dust Storm Telecom Orbiter',
    subtitle: 'High-Bandwidth Deep-Space Ka/X-Band Relay & Atmospheric Sounding',
    celestialBody: 'MARS',
    riskClass: 'B',
    budgetCapMusd: 260.0,
    developmentCostMusd: 22.0,
    operationsCostMusd: 12.0,
    designLifetimeYears: 5.0,
    simulationDurationDays: 3,
    solarFluxWPerM2: 586.0,
    recommendedOrbitId: 'orbit-mars-sso-400',
    isPlayable: true,
    requiredInstrumentTypes: ['THERMAL_IR', 'MULTISPECTRAL', 'SAR'],
    telemetryConstraints: {
      minPowerMarginPct: 20,
      maxEclipseDodPct: 35,
      minLinkMarginDb: 3.0,
      minDeltaVMarginPct: 10,
      dataCompressionRatio: 2.0,
    },
    scenarioEvents: [
      {
        id: 'evt-mars-dust',
        triggerMetHours: 10,
        title: 'Hellas Basin Regional Dust Storm Opacity Spike',
        description: 'Surface optical contrast falls; thermal IR sounding & relay links take priority.',
        subsystem: 'PAYLOAD',
      },
      {
        id: 'evt-mars-dsn',
        triggerMetHours: 22,
        title: 'Deep Space Network 34m Ka/X-Band Relay Pass',
        description: 'High free-space path loss (~225M km mean range) tests high-gain parabolic link closure.',
        subsystem: 'COMMS',
      },
    ],
    scoringProfile: {
      scienceWeight: 35,
      reliabilityWeight: 25,
      resourceWeight: 15,
      commsWeight: 15,
      riskCollabWeight: 10,
    },
    briefing: {
      context:
        'Global dust storms on Mars obscure the surface and threaten surface rovers with solar power brownouts. At 1.524 AU, inverse-square solar irradiance drops to ~586 W/m².',
      primaryObjective:
        'Design a high-reliability Martian Sun-Synchronous orbiter combining thermal/multispectral atmospheric sounding with high-gain deep-space telecommunications and oversized solar arrays.',
      constraintsSummary: [
        'Total life-cycle cost ≤ $260.0M USD',
        'Must maintain ≥ 15% power margin at reduced Martian solar irradiance (586 W/m²)',
        'High-gain X/Ka-band parabolic dish for Deep Space Network link closure',
      ],
      segments: {
        LAUNCH: 'Medium-lift interplanetary injection vehicle.',
        SPACE: 'Mars aero-capture / SSO orbiter with large roll-out solar arrays.',
        GROUND: 'NASA Deep Space Network (Goldstone, Madrid, Canberra).',
        USER: 'Mars surface rover operations and planetary climate science teams.',
      },
    },
    targetRegions: [
      {
        id: 'mars-jezero',
        name: 'Jezero Crater Paleolake Delta',
        latitudeDeg: 18.38,
        longitudeDeg: 77.58,
        radiusKm: 280,
        cloudCoverFraction: 0.55,
        priorityWeight: 0.40,
        description: 'Active surface rover relay zone and carbonate/phyllosilicate delta deposit.',
      },
      {
        id: 'mars-hellas',
        name: 'Hellas Planitia Dust Genesis Basin',
        latitudeDeg: -42.4,
        longitudeDeg: 70.5,
        radiusKm: 650,
        cloudCoverFraction: 0.85,
        priorityWeight: 0.35,
        description: 'Primary initiation basin for planet-encircling Martian dust storms.',
      },
      {
        id: 'mars-planum-australe',
        name: 'Planum Australe CO₂/H₂O Ice Cap',
        latitudeDeg: -85.0,
        longitudeDeg: 160.0,
        radiusKm: 400,
        cloudCoverFraction: 0.30,
        priorityWeight: 0.25,
        description: 'Layered polar ice deposits and seasonal CO₂ sublimation jets.',
      },
    ],
    kpps: [
      {
        id: 'kpp-mars-dv',
        name: 'Mars Orbit Trim Δv Margin',
        metricKey: 'deltaVMarginPct',
        unit: '%',
        thresholdValue: 10,
        goalValue: 25,
        comparison: 'GTE',
        description: 'Propulsive Δv reserve for orbit maintenance.',
      },
    ],
  },
  {
    id: 'nea-rendezvous-04',
    code: 'ASTEROID EXPLORER',
    title: 'Near-Earth Asteroid Rubble-Pile Rendezvous',
    subtitle: 'Microgravity Proximity Operations, Regolith Tomography & Mass Determination',
    celestialBody: 'ASTEROID',
    riskClass: 'B',
    budgetCapMusd: 195.0,
    developmentCostMusd: 16.0,
    operationsCostMusd: 8.0,
    designLifetimeYears: 3.5,
    simulationDurationDays: 3,
    solarFluxWPerM2: 750.0, // Inverse-square irradiance near ~1.35 AU NEA aphelion (1361 / 1.35^2 ~ 747 W/m^2)
    recommendedOrbitId: 'orbit-asteroid-prox-5',
    isPlayable: true,
    requiredInstrumentTypes: ['ALTIMETER', 'SPECTROMETER', 'MULTISPECTRAL'],
    telemetryConstraints: {
      minPowerMarginPct: 20,
      maxEclipseDodPct: 30,
      minLinkMarginDb: 3.0,
      minDeltaVMarginPct: 15,
      dataCompressionRatio: 1.5,
    },
    scenarioEvents: [
      {
        id: 'evt-nea-srp',
        triggerMetHours: 14,
        title: 'Solar Radiation Pressure (SRP) Microgravity Orbit Trim',
        description: 'Millimeter-per-second orbital perturbations require precision reaction-wheel/thruster momentum dumps.',
        subsystem: 'PROPULSION',
      },
      {
        id: 'evt-nea-lidar',
        triggerMetHours: 30,
        title: 'Nightingale Crater Regolith Altimetry Survey',
        description: 'High-density shape-model & hydrated mineral mapping burst increases onboard SSR volume.',
        subsystem: 'PAYLOAD',
      },
    ],
    scoringProfile: {
      scienceWeight: 35,
      reliabilityWeight: 25,
      resourceWeight: 15,
      commsWeight: 15,
      riskCollabWeight: 10,
    },
    briefing: {
      context:
        'Characterize the internal rubble-pile porosity, surface boulder hazard distribution, and hydrated mineral composition of a potentially hazardous carbonaceous Near-Earth Asteroid.',
      primaryObjective:
        'Rendezvous and map boulder hazards and hydrated phyllosilicates using laser/radar altimetry and neutron/multispectral spectroscopy.',
      constraintsSummary: [
        'Total life-cycle cost ≤ $195.0M USD',
        'High-Isp Xenon Hall-Effect propulsion recommended for deep-space Δv margin',
      ],
      segments: {
        LAUNCH: 'Dedicated escape trajectory launch.',
        SPACE: 'Solar-electric deep-space proximity operations spacecraft.',
        GROUND: 'Deep Space Network X/Ka-band telemetry.',
        USER: 'Planetary defense coordination office and sample-return navigators.',
      },
    },
    targetRegions: [
      {
        id: 'nea-nightingale',
        name: 'Nightingale Sample Crater',
        latitudeDeg: 56.0,
        longitudeDeg: 42.0,
        radiusKm: 180,
        cloudCoverFraction: 0.0,
        priorityWeight: 0.50,
        description: 'Freshly exposed carbonaceous regolith surrounded by hazard boulders.',
      },
      {
        id: 'nea-equatorial-ridge',
        name: 'Equatorial Spinning Top Ridge',
        latitudeDeg: 0.0,
        longitudeDeg: 180.0,
        radiusKm: 240,
        cloudCoverFraction: 0.0,
        priorityWeight: 0.50,
        description: 'YORP-accelerated equatorial bulge and mass-shedding zone.',
      },
    ],
    kpps: [
      {
        id: 'kpp-nea-dv',
        name: 'Proximity Operations Δv Margin',
        metricKey: 'deltaVMarginPct',
        unit: '%',
        thresholdValue: 15,
        goalValue: 30,
        comparison: 'GTE',
        description: 'Propulsive Δv reserve for microgravity station-keeping.',
      },
    ],
  },
];

export const DEFAULT_SCENARIO_ID = 'lunar-ice-02';
