import { describe, expect, it } from 'vitest';
import { evaluateCostBudget } from '../../src/engine/budget';
import {
  calculateDownlink,
  computeFsplDb,
  computeLinkDistanceKm,
  computeSlantRangeKm,
  evaluateDataAndLinkBudget,
} from '../../src/engine/communications';
import {
  EARTH_SIDEREAL_DAY_SEC,
  GM_EARTH,
  JOULES_PER_WATT_HOUR,
  R_EARTH_EQ_KM,
  SOLAR_CONSTANT_1AU_W_M2,
} from '../../src/engine/constants';
import { computeScienceDataGeneration, updateStorageBacklogGb } from '../../src/engine/data';
import {
  calculateDataBacklog,
  calculateMass,
  calculatePowerMargin,
  calculateRemainingBudget,
  evaluateMassBudget,
} from '../../src/engine/mass';
import {
  computeEclipseFraction,
  computeSunSynchronousInclinationDeg,
  eccentricToTrueAnomalyRad,
  evaluateOrbitalMechanics,
  meanToEccentricAnomalyRad,
  propagateKeplerianState,
} from '../../src/engine/orbital';
import {
  computeSolarIrradianceAtAu,
  evaluatePowerBudget,
  stepBatteryEnergyWh,
} from '../../src/engine/power';
import {
  computeRequiredPropellantKg,
  computeTsiolkovskyDeltaVMps,
  evaluatePropulsionBudget,
} from '../../src/engine/propulsion';
import { evaluateReliabilityAndRisk } from '../../src/engine/reliability';
import { evaluateThermalBalance } from '../../src/engine/thermal';
import type {
  GroundStation,
  LaunchVehicle,
  OrbitalParameters,
  ScientificInstrument,
  SpacecraftComponent,
} from '../../src/types/spacecraft';

const mockSmallSatBus: SpacecraftComponent = {
  id: 'bus-espa-150',
  name: 'ESPA-Class SmallSat Bus',
  category: 'BUS',
  compatibleFormFactors: ['ESPA', 'SMALLSAT'],
  massKg: 42,
  powerDrawW: 24,
  maxPayloadMassKg: 180,
  payloadSlots: 3,
  radiatorAreaM2: 1.1,
  absorptivityAlpha: 0.38,
  emissivityEpsilon: 0.82,
  trl: 9,
  reliability3Yr: 0.97,
  costMusd: 9.5,
  description: 'Heritage aluminum-honeycomb ESPA ring SmallSat bus.',
};

const mockSubsystems: SpacecraftComponent[] = [
  {
    id: 'sa-deploy-gaas',
    name: 'Dual-Wing Deployable Triple-Junction GaAs Array',
    category: 'SOLAR_ARRAY',
    compatibleFormFactors: ['SMALLSAT', 'ESPA'],
    massKg: 11,
    powerDrawW: 0,
    powerOutputW: 420,
    solarAreaM2: 1.45,
    cellEfficiency: 0.295,
    trl: 9,
    reliability3Yr: 0.98,
    costMusd: 4.8,
    description: 'High-efficiency deployable solar array.',
  },
  {
    id: 'bat-liion-1200',
    name: '1200 Wh Space-Qualified Li-Ion Battery Pack',
    category: 'BATTERY',
    compatibleFormFactors: ['SMALLSAT', 'ESPA'],
    massKg: 9.5,
    powerDrawW: 1,
    batteryCapacityWh: 1200,
    maxDodFraction: 0.35,
    trl: 9,
    reliability3Yr: 0.985,
    costMusd: 2.9,
    description: 'Space-qualified lithium-ion secondary battery.',
  },
  {
    id: 'ant-xband-dish',
    name: 'X-Band High-Gain Gimbaled Parabolic Dish',
    category: 'ANTENNA',
    compatibleFormFactors: ['SMALLSAT', 'ESPA'],
    massKg: 4.2,
    powerDrawW: 18,
    rfBand: 'X_BAND',
    txPowerW: 12,
    antennaGainDbi: 24.0,
    downlinkRateMbps: 150,
    trl: 8,
    reliability3Yr: 0.97,
    costMusd: 3.4,
    description: 'High-rate X-Band science downlink assembly.',
  },
  {
    id: 'prop-monoprop-hydrazine',
    name: 'Hydrazine Monopropellant Blowdown Thruster Module',
    category: 'PROPULSION',
    compatibleFormFactors: ['SMALLSAT', 'ESPA'],
    massKg: 6.5,
    propellantMassKg: 14.0,
    powerDrawW: 6,
    ispSeconds: 225,
    thrustNewtons: 4.5,
    trl: 9,
    reliability3Yr: 0.975,
    costMusd: 3.8,
    description: 'Orbit maintenance & ODAR deorbit module.',
  },
  {
    id: 'therm-louvers-rad',
    name: 'Active Thermal Louver & Survival Heater Assembly',
    category: 'THERMAL',
    compatibleFormFactors: ['SMALLSAT', 'ESPA'],
    massKg: 3.8,
    powerDrawW: 4,
    radiatorAreaM2: 0.55,
    absorptivityAlpha: 0.32,
    emissivityEpsilon: 0.85,
    heaterPowerW: 14,
    trl: 8,
    reliability3Yr: 0.985,
    costMusd: 1.9,
    description: 'Active thermal control.',
  },
  {
    id: 'avio-radhard-ssr',
    name: 'Rad-Tolerant OBC & 256 GB Solid-State Recorder',
    category: 'AVIONICS',
    compatibleFormFactors: ['6U', 'SMALLSAT', 'ESPA'],
    massKg: 3.2,
    powerDrawW: 10,
    storageCapacityGb: 256,
    isRedundant: true,
    trl: 9,
    reliability3Yr: 0.985,
    costMusd: 3.2,
    description: 'Dual-string flight computer & SSR.',
  },
];

const mockSarInstrument: ScientificInstrument = {
  id: 'inst-cband-sar',
  name: 'C-Band Synthetic Aperture Radar (SAR)',
  shortCode: 'C-SAR',
  type: 'SAR',
  minFormFactor: 'SMALLSAT',
  massKg: 48,
  powerOperatingW: 145,
  powerStandbyW: 18,
  dataRateMbps: 120,
  defaultDutyCycle: 0.06,
  swathWidthKm: 85,
  resolutionM: 5.0,
  cloudPenetrating: true,
  nightCapable: true,
  trl: 8,
  reliability3Yr: 0.95,
  costMusd: 21.0,
  floodScienceUtility: 0.95,
  description: 'All-weather day/night radar.',
  tradeOffNote: 'High power and mass.',
};

const mockSsoOrbit: OrbitalParameters = {
  id: 'orbit-sso-550-dd',
  name: '550 km Dawn-Dusk Sun-Synchronous Orbit',
  regime: 'SSO_DAWN_DUSK',
  celestialBody: 'EARTH',
  altitudePerigeeKm: 550,
  altitudeApogeeKm: 550,
  inclinationDeg: 97.59,
  raanDeg: 90,
  argPerigeeDeg: 0,
  meanAnomalyDeg: 0,
  solarBetaAngleDeg: 72,
  requiredDeltaVReserveMps: 145,
  description: 'Full-sun Dawn-Dusk SSO for radar power stability.',
};

const mockLauncher: LaunchVehicle = {
  id: 'lv-dedicated-small',
  name: 'Dedicated SmallSat SSO Launcher',
  provider: 'Orbital Express',
  supportedFormFactors: ['6U', 'SMALLSAT', 'ESPA'],
  maxMassLeoKg: 300,
  maxMassSsoKg: 225,
  maxMassCislunarKg: 60,
  fairingDiameterM: 1.8,
  fairingHeightM: 3.2,
  costMusd: 16.5,
  reliability: 0.96,
  injectionAccuracyMps: 18,
  description: 'Dedicated SSO launch vehicle.',
};

const mockGroundStation: GroundStation = {
  id: 'gs-svalbard',
  name: 'Svalbard Polar Station',
  location: 'Spitsbergen, Norway (78.2°N)',
  latitudeDeg: 78.22,
  longitudeDeg: 15.4,
  minElevationDeg: 10,
  supportedBands: ['S_BAND', 'X_BAND', 'KA_BAND'],
  gOverTDbPerK: 31.5,
  avgPassDurationSec: 540,
};

describe('GO / NO-GO Aerospace Engineering Engine — Unit Verification', () => {
  it('preserves baseline helper functions from initial mass.js & communications.js', () => {
    expect(calculateMass([{ mass: 10 }, { massKg: 25 }])).toBe(35);
    expect(calculatePowerMargin(200, [{ powerDraw: 50 }, { powerDrawW: 70 }])).toBe(80);
    const budget = calculateRemainingBudget(100, [{ cost: 20 }], 10, 15, 5);
    expect(budget.totalRemaining).toBe(50);
    expect(budget.safeRemaining).toBe(30); // 100 - 20(reserve) - 50(spent)
    expect(calculateDataBacklog(10, 25, 15, 50)).toBe(20);
    expect(calculateDataBacklog(40, 25, 5, 50)).toBe(50); // capped at maxStorage
    expect(calculateDownlink(80, 100)).toBe(1000); // 80 Mbps * 100 s / 8 = 1000 MB
  });

  it('computes accurate Vis-Viva orbital velocity, period, and J2 Sun-Synchronous precession at 550 km', () => {
    const orbital = evaluateOrbitalMechanics(mockSsoOrbit, 85);
    expect(orbital.semiMajorAxisKm).toBeCloseTo(6378.137 + 550, 2);
    expect(orbital.meanVelocityMps).toBeGreaterThan(7580);
    expect(orbital.meanVelocityMps).toBeLessThan(7595);
    expect(orbital.orbitalPeriodMin).toBeGreaterThan(95.4);
    expect(orbital.orbitalPeriodMin).toBeLessThan(95.9);
    expect(orbital.nodalPrecessionDegPerDay).toBeCloseTo(0.9856, 2);
    expect(orbital.isSunSynchronous).toBe(true);
    // At beta = 72 deg (> beta_crit ~ 67 deg), Dawn-Dusk orbit has 0 eclipse fraction
    expect(orbital.eclipseFraction).toBe(0);
  });

  it('round-trips Kepler anomaly solver and propagates 3D ECI coordinates without bitwise-XOR bug', () => {
    const e = 0.25;
    const M = 1.1;
    const E = meanToEccentricAnomalyRad(e, M);
    expect(E - e * Math.sin(E)).toBeCloseTo(M, 7);
    const nu = eccentricToTrueAnomalyRad(e, E);
    expect(nu).toBeGreaterThan(M);

    const state0 = propagateKeplerianState(mockSsoOrbit, 0);
    const radius0 = Math.hypot(...state0.positionEciKm);
    expect(radius0).toBeCloseTo(6378.137 + 550, 1);
    expect(state0.altitudeKm).toBeCloseTo(550, 1);
  });

  it('computes cylindrical shadow eclipse fraction for low-beta LEO orbit', () => {
    const fEcl = computeEclipseFraction(6378.137 + 550, 6378.137, 0);
    expect(fEcl).toBeGreaterThan(0.34);
    expect(fEcl).toBeLessThan(0.38);
  });

  it('evaluates spacecraft dry/wet mass budget and launch mass margin', () => {
    const mass = evaluateMassBudget({
      bus: mockSmallSatBus,
      subsystems: mockSubsystems,
      instruments: [mockSarInstrument],
      launchVehicle: mockLauncher,
      orbitalRegime: mockSsoOrbit.regime,
    });
    expect(mass.dryMassKg).toBeCloseTo(128.2, 1);
    expect(mass.propellantMassKg).toBeCloseTo(14.0, 1);
    expect(mass.wetMassKg).toBeCloseTo(142.2, 1);
    expect(mass.launchMarginPct).toBeGreaterThan(15);
    expect(mass.status).toBe('GO');
  });

  it('evaluates EOL solar power, load balance, and battery DoD', () => {
    const orbital = evaluateOrbitalMechanics(mockSsoOrbit, 85);
    const power = evaluatePowerBudget({
      bus: mockSmallSatBus,
      subsystems: mockSubsystems,
      instruments: [mockSarInstrument],
      orbital,
    });
    expect(power.eolSolarPowerW).toBeGreaterThan(250);
    expect(power.powerMarginW).toBeGreaterThan(50);
    expect(power.status).toBe('GO');
  });

  it('evaluates X-Band RF link budget (FSPL, EIRP, Eb/N0, Link Margin) and daily data volume', () => {
    const slantKm = computeSlantRangeKm(550, 10);
    expect(slantKm).toBeGreaterThan(1650);
    expect(slantKm).toBeLessThan(1850);

    const fsplDb = computeFsplDb(1500, 8.2e9);
    expect(fsplDb).toBeCloseTo(174.25, 1);

    const orbital = evaluateOrbitalMechanics(mockSsoOrbit, 85);
    const dataGen = computeScienceDataGeneration({
      instruments: [mockSarInstrument],
      orbitalPeriodSec: orbital.orbitalPeriodSec,
      orbitsPerDay: orbital.orbitsPerDay,
    });
    expect(dataGen.dataPerDayGb).toBeGreaterThan(20);

    const link = evaluateDataAndLinkBudget({
      subsystems: mockSubsystems,
      instruments: [mockSarInstrument],
      orbital,
      groundStations: [
        mockGroundStation,
        { ...mockGroundStation, id: 'gs-2' },
        { ...mockGroundStation, id: 'gs-3' },
        { ...mockGroundStation, id: 'gs-4' },
      ],
    });
    expect(link.linkMarginDb).toBeGreaterThan(3.0);
    expect(link.status).toBe('GO');
  });

  it('evaluates Tsiolkovsky propulsion delta-V, thermal balance, cost reserve, and NPR 8705.4B reliability', () => {
    const dv = computeTsiolkovskyDeltaVMps(220, 150, 135);
    expect(dv).toBeCloseTo(227.31, 1);

    const mass = evaluateMassBudget({
      bus: mockSmallSatBus,
      subsystems: mockSubsystems,
      instruments: [mockSarInstrument],
      launchVehicle: mockLauncher,
      orbitalRegime: mockSsoOrbit.regime,
    });
    const prop = evaluatePropulsionBudget({
      subsystems: mockSubsystems,
      mass,
      orbit: mockSsoOrbit,
      launchVehicle: mockLauncher,
    });
    expect(prop.availableDeltaVMps).toBeGreaterThan(prop.requiredDeltaVMps);
    expect(prop.status).toBe('GO');

    const orbital = evaluateOrbitalMechanics(mockSsoOrbit, 85);
    const power = evaluatePowerBudget({
      bus: mockSmallSatBus,
      subsystems: mockSubsystems,
      instruments: [mockSarInstrument],
      orbital,
    });
    const thermal = evaluateThermalBalance({
      bus: mockSmallSatBus,
      subsystems: mockSubsystems,
      power,
    });
    expect(thermal.equilibriumHotTempC).toBeLessThan(45);
    expect(thermal.equilibriumColdTempC).toBeGreaterThan(-10);
    expect(thermal.status).toBe('GO');

    const cost = evaluateCostBudget({
      budgetCapMusd: 95,
      developmentCostMusd: 6.5,
      operationsCostMusd: 3.5,
      bus: mockSmallSatBus,
      subsystems: mockSubsystems,
      instruments: [mockSarInstrument],
      launchVehicle: mockLauncher,
    });
    expect(cost.totalRemainingMusd).toBeGreaterThan(0);

    const rel = evaluateReliabilityAndRisk({
      bus: mockSmallSatBus,
      subsystems: mockSubsystems,
      instruments: [mockSarInstrument],
      launchVehicle: mockLauncher,
      riskClass: 'C',
    });
    expect(rel.subsystemReliability).toBeGreaterThan(0.8);
    expect(rel.hazardRatePerYear).toBeGreaterThan(0);
    expect(rel.status).toBe('GO');
    expect(cost.integrationCostMusd).toBeGreaterThan(0);
    expect(cost.testingCostMusd).toBeGreaterThan(0);
  });

  it('computes J2 Sun-Synchronous inclination, GEO period, and non-SSO LEO distinction', () => {
    const inc550 = computeSunSynchronousInclinationDeg(550);
    expect(inc550).toBeCloseTo(97.59, 1);
    const inc700 = computeSunSynchronousInclinationDeg(700);
    expect(inc700).toBeCloseTo(98.19, 1);
    expect(computeSunSynchronousInclinationDeg(8000)).toBeNull();

    const geoRes = evaluateOrbitalMechanics({
      ...mockSsoOrbit,
      id: 'orbit-geo-35786',
      regime: 'GEO',
      altitudePerigeeKm: 35786,
      altitudeApogeeKm: 35786,
      inclinationDeg: 0.1,
    });
    expect(geoRes.orbitalPeriodMin).toBeCloseTo(1436, 0);
    expect(geoRes.isSunSynchronous).toBe(false);

    const leoNonSso = evaluateOrbitalMechanics({
      ...mockSsoOrbit,
      id: 'orbit-leo-400-iss',
      regime: 'LEO_ISS',
      altitudePerigeeKm: 400,
      altitudeApogeeKm: 400,
      inclinationDeg: 51.6,
    });
    expect(leoNonSso.isSunSynchronous).toBe(false);
  });

  it('enforces battery charge/discharge efficiencies, DoD bounds, and non-negative energy floor', () => {
    const disch = stepBatteryEnergyWh({
      currentEnergyWh: 100,
      capacityWh: 1000,
      netPowerW: -200,
      dtSeconds: 3600,
      dischargeEfficiency: 0.9,
      maxDodFraction: 0.35,
    });
    expect(disch.nextEnergyWh).toBe(0);
    expect(disch.exhausted).toBe(true);
    expect(disch.dodBreached).toBe(true);

    const chg = stepBatteryEnergyWh({
      currentEnergyWh: 950,
      capacityWh: 1000,
      netPowerW: 300,
      dtSeconds: 3600,
      chargeEfficiency: 0.9,
      maxDodFraction: 0.35,
    });
    expect(chg.nextEnergyWh).toBe(1000);
    expect(chg.socPct).toBe(100);
    expect(chg.exhausted).toBe(false);
  });

  // --- Independent Hand-Calculated Phase 1 Verification Suite ---

  it('mass: calculates launch margin strictly against destination-orbit capacity & rejects incompatible regimes', () => {
    // Mars SSO must NOT match Earth SSO (uses cislunar/deep-space ceiling = 60 kg, vs LEO=300, SSO=225)
    const marsMass = evaluateMassBudget({
      bus: mockSmallSatBus,
      subsystems: mockSubsystems,
      instruments: [mockSarInstrument],
      launchVehicle: mockLauncher,
      orbitalRegime: 'MARS_SSO',
    });
    expect(marsMass.maxLaunchMassKg).toBe(60);
    // Dry mass = 42 + (11+9.5+4.2+6.5+3.8+3.2) + 48 = 128.2 kg; prop = 14 kg; wet = 142.2 kg
    expect(marsMass.dryMassKg).toBeCloseTo(128.2, 2);
    expect(marsMass.propellantMassKg).toBeCloseTo(14.0, 2);
    expect(marsMass.wetMassKg).toBeCloseTo(142.2, 2);
    expect(marsMass.launchMarginKg).toBeCloseTo(60 - 142.2, 1);
    expect(marsMass.status).toBe('NO_GO');

    // Oversized instrument incompatible with 6U bus
    const cubeBus: SpacecraftComponent = {
      ...mockSmallSatBus,
      id: 'bus-6u',
      compatibleFormFactors: ['6U'],
      maxPayloadMassKg: 10,
      payloadSlots: 1,
    };
    const badCube = evaluateMassBudget({
      bus: cubeBus,
      subsystems: mockSubsystems,
      instruments: [mockSarInstrument],
      launchVehicle: mockLauncher,
      orbitalRegime: 'LEO',
    });
    expect(badCube.formFactorCompatible).toBe(false);
    expect(badCube.incompatibilityReasons.length).toBeGreaterThan(0);
    expect(badCube.status).toBe('NO_GO');
  });

  it('power: verifies 1/r^2 irradiance, zero cosine at 90 deg, Joule conversion, and peak-demand NO_GO failure', () => {
    // Inverse square law at Mars semi-major axis (1.524 AU): 1361 / 1.524^2 = 586.0 W/m^2
    expect(computeSolarIrradianceAtAu(1.0)).toBeCloseTo(SOLAR_CONSTANT_1AU_W_M2, 6);
    expect(computeSolarIrradianceAtAu(1.524)).toBeCloseTo(1361 / (1.524 * 1.524), 2);
    expect(computeSolarIrradianceAtAu(0)).toBe(0);

    const orb550 = evaluateOrbitalMechanics(mockSsoOrbit, 85);
    // 90 deg incidence gives strictly 0 solar power (no artificial 0.1 floor)
    const zeroIncidence = evaluatePowerBudget({
      bus: mockSmallSatBus,
      subsystems: mockSubsystems,
      instruments: [mockSarInstrument],
      orbital: orb550,
      sunIncidenceAngleDeg: 90,
    });
    expect(zeroIncidence.bolSolarPowerW).toBe(0);
    expect(zeroIncidence.eolSolarPowerW).toBe(0);
    expect(zeroIncidence.status).toBe('NO_GO');

    // Average power PASSES (low 2% duty cycle), yet peak simultaneous demand FAILS (tiny 120 Wh 1C battery < peak eclipse load)
    const lowDutyHighPeakInst: ScientificInstrument = {
      ...mockSarInstrument,
      powerOperatingW: 160,
      powerStandbyW: 5,
      defaultDutyCycle: 0.02,
      nightCapable: true,
    };
    const tinyBatterySubsystems = mockSubsystems.map((s) =>
      s.category === 'BATTERY' ? { ...s, batteryCapacityWh: 120 } : s
    );
    const peakFailOrbit = evaluateOrbitalMechanics({
      ...mockSsoOrbit,
      regime: 'SSO_NOON_MIDNIGHT',
      solarBetaAngleDeg: 10, // introduces eclipse shadow
    });
    const peakFailPower = evaluatePowerBudget({
      bus: mockSmallSatBus,
      subsystems: tinyBatterySubsystems,
      instruments: [lowDutyHighPeakInst],
      orbital: peakFailOrbit,
    });
    expect(peakFailPower.powerMarginW).toBeGreaterThan(0); // Average passes
    expect(peakFailPower.peakPowerValid).toBe(false); // Peak fails (1C 120W < ~220W peak)!
    expect(peakFailPower.status).toBe('NO_GO');
    expect(peakFailPower.batteryCapacityJ).toBeCloseTo(120 * JOULES_PER_WATT_HOUR, 0);
  });

  it('communications & data: prevents zero-station passes, over-downlink, overflow loss, and computes deep-space FSPL + Shannon ceiling', () => {
    const orb = evaluateOrbitalMechanics(mockSsoOrbit, 85);
    // Zero compatible ground stations -> 0 passes/day, 0 GB/day downlink, NO_GO
    const kaAntenna: SpacecraftComponent = {
      id: 'ant-ka',
      name: 'Ka-Band Dish',
      category: 'ANTENNA',
      compatibleFormFactors: ['SMALLSAT'],
      massKg: 4,
      powerDrawW: 20,
      rfBand: 'KA_BAND',
      txPowerW: 10,
      antennaGainDbi: 30,
      downlinkRateMbps: 200,
      trl: 8,
      reliability3Yr: 0.98,
      costMusd: 3,
      description: 'Ka antenna',
    };
    const uhfOnlyStation: GroundStation = {
      ...mockGroundStation,
      supportedBands: ['UHF'],
    };
    const noMatch = evaluateDataAndLinkBudget({
      subsystems: [kaAntenna],
      instruments: [mockSarInstrument],
      orbital: orb,
      groundStations: [uhfOnlyStation],
    });
    expect(noMatch.passesPerDay).toBe(0);
    expect(noMatch.downlinkCapacityPerDayGb).toBe(0);
    expect(noMatch.status).toBe('NO_GO');

    // Deep-space Lunar range >> Earth LEO slant range -> much larger FSPL and lower P_rx
    const lunarRangeKm = computeLinkDistanceKm({
      celestialBody: 'MOON',
      semiMajorAxisKm: 1837.4,
      elevationAngleDeg: 10,
    });
    expect(lunarRangeKm).toBeGreaterThan(384000);
    const fsplLunar = computeFsplDb(lunarRangeKm, 8.2e9);
    const fsplLeo = computeFsplDb(1500, 8.2e9);
    expect(fsplLunar - fsplLeo).toBeCloseTo(20 * Math.log10(lunarRangeKm / 1500), 2);

    // Compression + explicit storage overflow cap & never downlinking more than buffered
    const genUncompressed = computeScienceDataGeneration({
      instruments: [mockSarInstrument], // 120 Mbps * 0.06 * 5736s / 8000 = ~5.16 GB/orbit
      orbitalPeriodSec: 5736,
      orbitsPerDay: 15,
      compressionRatio: 1.0,
    });
    const genCompressed = computeScienceDataGeneration({
      instruments: [mockSarInstrument],
      orbitalPeriodSec: 5736,
      orbitsPerDay: 15,
      compressionRatio: 2.0,
    });
    expect(genCompressed.dataPerOrbitGb).toBeCloseTo(genUncompressed.dataPerOrbitGb / 2, 2);

    const ssrNoOverdraw = updateStorageBacklogGb({
      currentBacklogGb: 4.0,
      generatedGb: 1.0,
      downlinkCapacityGb: 10.0,
      storageCapacityGb: 50.0,
    });
    expect(ssrNoOverdraw.downlinkedGb).toBe(4.0);
    expect(ssrNoOverdraw.nextBacklogGb).toBe(1.0);

    const ssrOverflow = updateStorageBacklogGb({
      currentBacklogGb: 48.0,
      generatedGb: 5.0,
      downlinkCapacityGb: 0,
      storageCapacityGb: 50.0,
    });
    expect(ssrOverflow.nextBacklogGb).toBe(50.0);
    expect(ssrOverflow.overflowedGb).toBe(3.0);

    // Nominal X-band link check + theoretical Shannon ceiling > operational bit rate when positive Eb/N0
    const nominalLink = evaluateDataAndLinkBudget({
      subsystems: mockSubsystems,
      instruments: [mockSarInstrument],
      orbital: orb,
      groundStations: [mockGroundStation],
    });
    expect(nominalLink.shannonCapacityCeilingMbps).toBeGreaterThan(150);
  });

  it('orbital: checks exact circular hand values, GEO sidereal period, extreme eccentricity Kepler solver, and invalid orbits', () => {
    // Hand check circular Earth orbit at h = 400 km: r = 6778.137 km
    const rMeters = (R_EARTH_EQ_KM + 400) * 1000;
    const expectedV = Math.sqrt(GM_EARTH / rMeters);
    const expectedT = 2 * Math.PI * Math.sqrt(Math.pow(rMeters, 3) / GM_EARTH);
    const circ = evaluateOrbitalMechanics({
      ...mockSsoOrbit,
      regime: 'LEO_ISS',
      altitudePerigeeKm: 400,
      altitudeApogeeKm: 400,
      inclinationDeg: 51.6,
    });
    expect(circ.isValidOrbit).toBe(true);
    expect(circ.meanVelocityMps).toBeCloseTo(expectedV, 0);
    expect(circ.orbitalPeriodSec).toBeCloseTo(expectedT, 0);

    // GEO sidereal period check (~86164.1 s -> 35786 km altitude, equatorial)
    const geo = evaluateOrbitalMechanics({
      ...mockSsoOrbit,
      regime: 'GEO',
      altitudePerigeeKm: 35786,
      altitudeApogeeKm: 35786,
      inclinationDeg: 0.05,
    });
    expect(geo.isGeostationary).toBe(true);
    expect(Math.abs(geo.orbitalPeriodSec - EARTH_SIDEREAL_DAY_SEC)).toBeLessThan(30);

    // Extreme eccentricity Kepler solver stability (e = 0.995)
    const eExtreme = 0.995;
    const meanAnom = 0.15;
    const eccentricAnom = meanToEccentricAnomalyRad(eExtreme, meanAnom);
    expect(eccentricAnom - eExtreme * Math.sin(eccentricAnom)).toBeCloseTo(meanAnom, 9);
    const nu = eccentricToTrueAnomalyRad(eExtreme, eccentricAnom);
    expect(Number.isFinite(nu)).toBe(true);

    // Invalid sub-surface orbit must flag isValidOrbit = false
    const invalidOrb = evaluateOrbitalMechanics({
      ...mockSsoOrbit,
      altitudePerigeeKm: -500,
      altitudeApogeeKm: 500,
    });
    expect(invalidOrb.isValidOrbit).toBe(false);
  });

  it('propulsion, thermal & reliability: checks Tsiolkovsky burn kinematics, Kelvin/capacitance, and fixes 0.35 payload bug', () => {
    const orb = evaluateOrbitalMechanics(mockSsoOrbit, 85);
    const mass = evaluateMassBudget({
      bus: mockSmallSatBus,
      subsystems: mockSubsystems,
      instruments: [mockSarInstrument],
      launchVehicle: mockLauncher,
      orbitalRegime: 'SSO_DAWN_DUSK',
    });
    const prop = evaluatePropulsionBudget({
      subsystems: mockSubsystems,
      mass,
      orbit: mockSsoOrbit,
      launchVehicle: mockLauncher,
    });
    // m_dot = F / (Isp * g0) = 4.5 / (225 * 9.80665) = 0.00203943 kg/s
    const expectedMdot = 4.5 / (225 * 9.80665);
    expect(prop.massFlowRateKgPerSec).toBeCloseTo(expectedMdot, 5);
    expect(prop.maxBurnDurationSec).toBeCloseTo(14.0 / expectedMdot, 0);
    const checkReqProp = computeRequiredPropellantKg(
      mass.dryMassKg,
      prop.requiredDeltaVMps,
      225
    );
    expect(prop.requiredPropellantKg).toBeCloseTo(checkReqProp, 2);

    const pwr = evaluatePowerBudget({
      bus: mockSmallSatBus,
      subsystems: mockSubsystems,
      instruments: [mockSarInstrument],
      orbital: orb,
    });
    const therm = evaluateThermalBalance({
      bus: mockSmallSatBus,
      subsystems: mockSubsystems,
      power: pwr,
      orbital: orb,
      celestialBody: 'EARTH',
      spacecraftMassKg: mass.wetMassKg,
    });
    expect(therm.equilibriumHotTempK).toBeCloseTo(therm.equilibriumHotTempC + 273.15, 0);
    expect(therm.equilibriumColdTempK).toBeCloseTo(therm.equilibriumColdTempC + 273.15, 0);
    expect(therm.thermalCapacityJPerK).toBeGreaterThan(50000);

    // Reliability: 2 instruments (R=0.8 each over 3yr) in parallel must equal 1 - (1-0.8)^2 = 0.96, NOT 1 - 0.04*0.35 = 0.986
    const instA: ScientificInstrument = { ...mockSarInstrument, id: 'ia', reliability3Yr: 0.8 };
    const instB: ScientificInstrument = { ...mockSarInstrument, id: 'ib', reliability3Yr: 0.8 };
    const idealBus: SpacecraftComponent = { ...mockSmallSatBus, reliability3Yr: 0.9999 };
    const rel = evaluateReliabilityAndRisk({
      bus: idealBus,
      subsystems: [],
      instruments: [instA, instB],
      launchVehicle: { ...mockLauncher, reliability: 0.999 },
      riskClass: 'D',
      designLifetimeYears: 3.0,
    });
    // bus (0.9999) * payload (0.96) = ~0.960 (strictly <= 0.961, NOT 0.986 from old 0.35 bug)
    expect(rel.subsystemReliability).toBeCloseTo(0.96, 2);
    expect(rel.subsystemReliability).toBeLessThan(0.965);
  });
});
