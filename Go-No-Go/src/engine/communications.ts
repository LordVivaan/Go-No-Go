import type { DataAndLinkBudgetResult, OrbitalMechanicsResult } from '../types/engineering';
import type { CelestialBodyId, GateStatus } from '../types/mission';
import type { GroundStation, RFBand, ScientificInstrument, SpacecraftComponent } from '../types/spacecraft';
import {
  BOLTZMANN_DBW_PER_K_HZ,
  DEG_TO_RAD,
  EARTH_MARS_MEAN_DISTANCE_KM,
  EARTH_MOON_MEAN_DISTANCE_KM,
  EARTH_NEA_REFERENCE_DISTANCE_KM,
  R_EARTH_EQ_KM,
  SPEED_OF_LIGHT_M_S,
} from './constants';
import { computeScienceDataGeneration } from './data';

/**
 * Preserved baseline helper from initial src/engine/communications.js
 * Converts Megabits (Mb) to Megabytes (MB) by dividing by 8.
 */
export function calculateDownlink(rateMbps: number, durationSeconds: number): number {
  return (rateMbps * durationSeconds) / 8;
}

const BAND_FREQUENCY_HZ: Record<RFBand, number> = {
  UHF: 437.0e6, // 437 MHz Amateur/CubeSat UHF
  S_BAND: 2.25e9, // 2.25 GHz Space Research S-Band
  X_BAND: 8.2e9, // 8.2 GHz Earth Exploration Satellite Service X-Band
  KA_BAND: 26.5e9, // 26.5 GHz High-Rate Ka-Band
};

const BAND_ATMOSPHERIC_LOSS_DB: Record<RFBand, number> = {
  UHF: 0.4,
  S_BAND: 0.6,
  X_BAND: 1.5,
  KA_BAND: 3.8, // Rain/water-vapor attenuation margin
};

/**
 * Computes slant range d (km) from a ground station at elevation angle epsilon (deg)
 * to a satellite at orbital altitude h (km).
 */
export function computeSlantRangeKm(
  altitudeKm: number,
  elevationAngleDeg = 10.0,
  bodyRadiusKm = R_EARTH_EQ_KM
): number {
  const epsRad = elevationAngleDeg * DEG_TO_RAD;
  const rOrbitRatio = (bodyRadiusKm + altitudeKm) / bodyRadiusKm;
  const sinEps = Math.sin(epsRad);
  const cosEps = Math.cos(epsRad);
  const dKm = bodyRadiusKm * (Math.sqrt(rOrbitRatio * rOrbitRatio - cosEps * cosEps) - sinEps);
  return Math.max(altitudeKm, dKm);
}

/**
 * Computes Free-Space Path Loss (FSPL) in dB:
 * FSPL_dB = 20 log10(d_m) + 20 log10(f_Hz) + 20 log10(4π / c)
 */
export function computeFsplDb(slantRangeKm: number, frequencyHz: number): number {
  const dMeters = Math.max(1000, slantRangeKm * 1000);
  const constantTermDb = 20 * Math.log10((4 * Math.PI) / SPEED_OF_LIGHT_M_S); // -147.55 dB
  return 20 * Math.log10(dMeters) + 20 * Math.log10(frequencyHz) + constantTermDb;
}

const ASSUMED_GROUND_SYSTEM_NOISE_TEMP_K = 150.0; // Illustrative cooled/low-noise ground LNA T_sys for P_rx decomposition

/**
 * Computes spacecraft-to-Earth slant range (km) across Earth orbits and deep-space regimes.
 */
export function computeLinkDistanceKm(params: {
  celestialBody: CelestialBodyId;
  semiMajorAxisKm: number;
  elevationAngleDeg: number;
}): number {
  const { celestialBody, semiMajorAxisKm, elevationAngleDeg } = params;
  switch (celestialBody) {
    case 'MOON':
      return EARTH_MOON_MEAN_DISTANCE_KM + Math.max(100, semiMajorAxisKm);
    case 'MARS':
      return EARTH_MARS_MEAN_DISTANCE_KM;
    case 'ASTEROID':
      return EARTH_NEA_REFERENCE_DISTANCE_KM;
    case 'EARTH':
    default: {
      const meanAltitudeKm = Math.max(150, semiMajorAxisKm - R_EARTH_EQ_KM);
      return computeSlantRangeKm(meanAltitudeKm, elevationAngleDeg, R_EARTH_EQ_KM);
    }
  }
}

/**
 * Evaluates full RF Communications Link Budget & Onboard SSR Data Backlog.
 * For Earth-orbiting missions, evaluates link margin at the antenna's nominal hardware downlink rate.
 * For cislunar/deep-space missions (MOON, MARS, ASTEROID), models CCSDS/DSN adaptive symbol-rate
 * throttling derived directly from the link equation C/N0, Eb/N0_req, and requiredLinkMarginDb,
 * clamped between a 1 kbps (0.001 Mbps) minimum telemetry floor and the hardware max rate.
 */
export function evaluateDataAndLinkBudget(params: {
  subsystems: SpacecraftComponent[];
  instruments: ScientificInstrument[];
  orbital: OrbitalMechanicsResult;
  groundStations: GroundStation[];
  celestialBody?: CelestialBodyId;
  compressionRatio?: number;
  requiredLinkMarginDb?: number;
}): DataAndLinkBudgetResult {
  const {
    subsystems,
    instruments,
    orbital,
    groundStations,
    celestialBody = 'EARTH',
    compressionRatio = 1.0,
    requiredLinkMarginDb = 3.0,
  } = params;

  const antennas = subsystems.filter((s) => s.category === 'ANTENNA');
  const avionics = subsystems.filter((s) => s.category === 'AVIONICS');

  // Select primary high-rate downlink antenna without mutating the input array
  const primaryAntenna =
    [...antennas].sort((a, b) => (b.downlinkRateMbps ?? 0) - (a.downlinkRateMbps ?? 0))[0] ?? {
      id: 'default-uhf',
      name: 'Fallback UHF Monopole',
      rfBand: 'UHF' as RFBand,
      txPowerW: 1.0,
      antennaGainDbi: 2.0,
      downlinkRateMbps: 0.1,
    };

  const rfBand: RFBand = primaryAntenna.rfBand ?? 'S_BAND';
  const freqHz = BAND_FREQUENCY_HZ[rfBand];
  const txPowerW = Math.max(0.01, primaryAntenna.txPowerW ?? 2.0);
  const txGainDbi = primaryAntenna.antennaGainDbi ?? 6.0;
  const rawDownlinkRateMbps = Math.max(0.001, primaryAntenna.downlinkRateMbps ?? 2.0);
  const lineLossDb = 1.2;
  const pointingLossDb = 0.8;
  const atmLossDb = BAND_ATMOSPHERIC_LOSS_DB[rfBand];
  const otherLossesDb = lineLossDb + pointingLossDb + atmLossDb;

  // EIRP (dBW) = 10 log10(P_tx_W) + G_tx_dBi - L_line_dB
  const eirpDbw = 10 * Math.log10(txPowerW) + txGainDbi - lineLossDb;

  const compatibleStations = groundStations.filter((gs) => gs.supportedBands.includes(rfBand));
  const referenceStation = compatibleStations[0] ?? groundStations[0] ?? {
    minElevationDeg: 10,
    gOverTDbPerK: 22.5,
    avgPassDurationSec: 420,
  };

  const slantRangeKm = computeLinkDistanceKm({
    celestialBody,
    semiMajorAxisKm: orbital.semiMajorAxisKm,
    elevationAngleDeg: referenceStation.minElevationDeg,
  });
  const fsplDb = computeFsplDb(slantRangeKm, freqHz);

  // Decompose G_rx assuming reference ground system noise temp T_sys = 150 K so P_rx is in consistent dBW
  const rxGainEstDbi =
    referenceStation.gOverTDbPerK + 10 * Math.log10(ASSUMED_GROUND_SYSTEM_NOISE_TEMP_K);
  const receivedPowerDbw = eirpDbw - fsplDb - atmLossDb - pointingLossDb + rxGainEstDbi;

  // Carrier-to-noise-density ratio C/N0 (dB-Hz) = EIRP - FSPL - L_atm - L_point + (G/T)_rx - k_B
  const cOverN0DbHz =
    eirpDbw -
    fsplDb -
    atmLossDb -
    pointingLossDb +
    referenceStation.gOverTDbPerK -
    BOLTZMANN_DBW_PER_K_HZ;

  const ebN0RequiredDb = 9.6; // Uncoded/lightly-coded QPSK BER 1e-5 benchmark threshold

  // For deep-space missions, derive the maximum sustainable symbol rate from C/N0 and target margin,
  // bounded below by a 1 kbps (0.001 Mbps) minimum telemetry floor and above by the hardware max rate.
  const maxClosedRateMbps =
    Math.pow(10, (cOverN0DbHz - (ebN0RequiredDb + requiredLinkMarginDb)) / 10) / 1e6;
  const throttledMbps = Math.floor(maxClosedRateMbps * 10000) / 10000;
  const downlinkRateMbps =
    celestialBody === 'EARTH'
      ? rawDownlinkRateMbps
      : Math.max(0.001, Math.min(rawDownlinkRateMbps, throttledMbps));

  // Eb/N0_rcvd (dB) = C/N0 - 10 log10(R_bps)
  const dataRateBps = downlinkRateMbps * 1e6;
  const ebN0ReceivedDb = cOverN0DbHz - 10 * Math.log10(dataRateBps);
  const linkMarginDb = ebN0ReceivedDb - ebN0RequiredDb;

  // Theoretical Shannon-Hartley AWGN channel capacity ceiling assuming reference bandwidth B = R_b (1 Hz/bps):
  // C = B * log2(1 + SNR), where SNR = Eb/N0 * (R_b / B) = Eb/N0 at B = R_b.
  // Labeled strictly as a theoretical ceiling, never a guaranteed operational rate.
  const snrLinear = Math.pow(10, Math.min(80, Math.max(-60, ebN0ReceivedDb)) / 10);
  const shannonCapacityCeilingMbps =
    (dataRateBps * Math.log2(1 + snrLinear)) / 1e6;

  // Science data generation & downlink volume
  const { dataPerOrbitGb, dataPerDayGb, compressionRatio: appliedCompression } =
    computeScienceDataGeneration({
      instruments,
      orbitalPeriodSec: orbital.orbitalPeriodSec,
      orbitsPerDay: orbital.orbitsPerDay,
      compressionRatio,
    });

  // Zero compatible stations means zero usable passes & zero downlink capacity
  const passesPerDay =
    compatibleStations.length === 0
      ? 0
      : Math.max(2, Math.round(compatibleStations.length * 2.4));
  const passDurationSec = referenceStation.avgPassDurationSec;
  const downlinkPerPassMb =
    compatibleStations.length > 0 && linkMarginDb >= 0
      ? calculateDownlink(downlinkRateMbps, passDurationSec)
      : 0;
  const downlinkPerPassGb = downlinkPerPassMb / 1000.0;
  const downlinkCapacityPerDayGb = downlinkPerPassGb * passesPerDay;
  const netDataBacklogPerDayGb = Math.max(0, dataPerDayGb - downlinkCapacityPerDayGb);

  const storageCapacityGb =
    avionics.reduce((sum, a) => sum + (a.storageCapacityGb ?? 0), 0) || 16.0;

  let status: GateStatus = 'GO';
  if (
    antennas.length === 0 ||
    compatibleStations.length === 0 ||
    linkMarginDb < 0 ||
    netDataBacklogPerDayGb > storageCapacityGb * 0.5
  ) {
    status = 'NO_GO';
  } else if (linkMarginDb < requiredLinkMarginDb || netDataBacklogPerDayGb > 0) {
    status = 'CAUTION';
  }

  return {
    dataGeneratedPerOrbitGb: Number(dataPerOrbitGb.toFixed(3)),
    dataGeneratedPerDayGb: Number(dataPerDayGb.toFixed(2)),
    compressionRatio: appliedCompression,
    downlinkPerPassGb: Number(downlinkPerPassGb.toFixed(2)),
    passesPerDay,
    downlinkCapacityPerDayGb: Number(downlinkCapacityPerDayGb.toFixed(2)),
    netDataBacklogPerDayGb: Number(netDataBacklogPerDayGb.toFixed(2)),
    storageCapacityGb: Number(storageCapacityGb.toFixed(1)),
    slantRangeKm: Number(slantRangeKm.toFixed(1)),
    fsplDb: Number(fsplDb.toFixed(2)),
    otherLossesDb: Number(otherLossesDb.toFixed(2)),
    eirpDbw: Number(eirpDbw.toFixed(2)),
    receivedPowerDbw: Number(receivedPowerDbw.toFixed(2)),
    ebN0ReceivedDb: Number(ebN0ReceivedDb.toFixed(2)),
    ebN0RequiredDb,
    linkMarginDb: Number(linkMarginDb.toFixed(2)),
    shannonCapacityCeilingMbps: Number(shannonCapacityCeilingMbps.toFixed(2)),
    status,
    traces: [
      {
        id: 'rf-link-budget',
        title: 'RF Downlink Eb/N₀, Received Power & Link Margin',
        symbolicEquation:
          'EIRP = 10log₁₀(P_tx)+G_tx-L_line;  Eb/N₀ = EIRP-FSPL-L_atm-L_pt+(G/T)-k_B-10log₁₀(R_b);  C_shannon = B log₂(1+SNR)',
        classification: 'PHYSICAL_LAW',
        referenceStandard: 'CCSDS 401.0-B / SMAD Ch. 16 Communications Architecture',
        inputs: {
          band: { value: rfBand, unit: `${(freqHz / 1e9).toFixed(2)} GHz`, description: 'Carrier frequency band' },
          EIRP: { value: Number(eirpDbw.toFixed(2)), unit: 'dBW', description: 'Transmitter Effective Isotropic Radiated Power' },
          slantRange: { value: Number(slantRangeKm.toFixed(1)), unit: 'km', description: 'Slant range at min elevation' },
          FSPL: { value: Number(fsplDb.toFixed(2)), unit: 'dB', description: 'Free-Space Path Loss' },
          L_other: { value: Number(otherLossesDb.toFixed(2)), unit: 'dB', description: 'Line + pointing + atmospheric losses' },
          P_rx: { value: Number(receivedPowerDbw.toFixed(2)), unit: 'dBW', description: 'Estimated received carrier power (T_sys=150 K)' },
          dataRate: { value: downlinkRateMbps, unit: 'Mbps', description: 'Operational link bit rate' },
        },
        output: {
          value: Number(linkMarginDb.toFixed(2)),
          unit: 'dB',
          formatted: `${linkMarginDb >= 0 ? '+' : ''}${linkMarginDb.toFixed(2)} dB (Eb/N₀ = ${ebN0ReceivedDb.toFixed(1)} dB | Theoretical Shannon ceiling: ${shannonCapacityCeilingMbps.toFixed(1)} Mbps)`,
        },
        notes:
          'A link margin ≥ +3.0 dB is required for nominal GO status. Shannon capacity is reported strictly as a theoretical AWGN ceiling at B = R_b, not a guaranteed link rate.',
      },
      {
        id: 'ssr-data-budget',
        title: 'Daily Science Data Generation vs. Ground Downlink Volume',
        symbolicEquation: 'D_down = ((R_Mbps × Δt_pass / 8) / 1000) × N_passes;   ΔB_day = max(0, D_gen - D_down)',
        classification: 'PHYSICAL_LAW',
        referenceStandard: 'NASA SmallSat Mission Design & Ground Segment Guidelines',
        inputs: {
          D_gen_day: { value: Number(dataPerDayGb.toFixed(2)), unit: 'GB/day', description: `Daily payload data generated (${appliedCompression}x compression)` },
          D_down_day: { value: Number(downlinkCapacityPerDayGb.toFixed(2)), unit: 'GB/day', description: `Daily downlink capacity (${passesPerDay} passes/day)` },
          C_SSR: { value: storageCapacityGb, unit: 'GB', description: 'Onboard Solid-State Recorder capacity' },
        },
        output: {
          value: Number((downlinkCapacityPerDayGb - dataPerDayGb).toFixed(2)),
          unit: 'GB/day',
          formatted: `${downlinkCapacityPerDayGb.toFixed(1)} GB/day downlink vs ${dataPerDayGb.toFixed(1)} GB/day generated`,
        },
      },
    ],
  };
}
