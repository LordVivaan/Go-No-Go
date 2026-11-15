import { DIFFICULTY_PROFILES } from '../data/scenarios';
import type { MissionDifficulty } from '../types/mission';
import type { ActiveAnomaly } from '../types/simulation';

/**
 * Mulberry32 deterministic PRNG so seeded mission runs and replays are 100% reproducible.
 */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return function nextRandom(): number {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ANOMALY_CATALOG: Omit<ActiveAnomaly, 'id' | 'triggeredAtMetSec' | 'resolved'>[] = [
  {
    code: 'ANOM-EPS-CME',
    title: 'Solar Coronal Mass Ejection (Proton Flux Spike)',
    subsystem: 'EPS',
    severity: 'WARNING',
    description:
      'High-energy solar proton event temporarily reduces solar wing voltage regulation by 18% and elevates single-event upset risk.',
    powerPenaltyW: 12,
    solarEfficiencyMultiplier: 0.82,
    tempOffsetC: 4.5,
    downlinkMultiplier: 1.0,
    mitigationCommand: 'CMD_EPS_MPPT_TRIM',
    mitigationLabel: 'Re-bias Solar Array MPPT Bus & Scrub EDAC Memory',
  },
  {
    code: 'ANOM-COMMS-MONSOON',
    title: 'Severe Tropical Rain Fade on X/Ka-Band Downlink',
    subsystem: 'COMMS',
    severity: 'WARNING',
    description:
      'Heavy convective precipitation over mid-latitude ground station attenuates carrier-to-noise ratio, reducing effective downlink rate by 35%.',
    powerPenaltyW: 8,
    solarEfficiencyMultiplier: 1.0,
    tempOffsetC: 1.0,
    downlinkMultiplier: 0.65,
    mitigationCommand: 'CMD_COMMS_ACM_BOOST',
    mitigationLabel: 'Engage Adaptive Coding & Modulation (ACM) High-Gain Mode',
  },
  {
    code: 'ANOM-THERM-LOUVER',
    title: 'Radiator Louver Actuator Stiction in Sunlit Arc',
    subsystem: 'THERMAL',
    severity: 'CRITICAL',
    description:
      'Bimetallic louver actuator sticking partially closed during peak SAR radar operation, driving payload deck temperature +11°C above nominal.',
    powerPenaltyW: 15,
    solarEfficiencyMultiplier: 1.0,
    tempOffsetC: 11.0,
    downlinkMultiplier: 1.0,
    mitigationCommand: 'CMD_THERM_CYCLE_LOOP',
    mitigationLabel: 'Cycle Auxiliary Heat-Pipe Bypass & Pulse Louver Servo',
  },
  {
    code: 'ANOM-PAYLOAD-SAA',
    title: 'South Atlantic Anomaly (SAA) SAR Formatter Latch-Up',
    subsystem: 'PAYLOAD',
    severity: 'CRITICAL',
    description:
      'Trapped inner Van Allen belt proton strike in the South Atlantic Anomaly triggered a high-current state in the radar chirp generator.',
    powerPenaltyW: 35,
    solarEfficiencyMultiplier: 1.0,
    tempOffsetC: 6.5,
    downlinkMultiplier: 0.8,
    mitigationCommand: 'CMD_PAYLOAD_BUS_RESET',
    mitigationLabel: 'Switch to Redundant B-Side Formatter & Reset Radar FPGA',
  },
];

/**
 * Deterministically samples whether an on-orbit anomaly triggers at the given MET step.
 */
export function sampleDeterministicAnomaly(params: {
  metSeconds: number;
  seed: number;
  systemReliability: number;
  existingCodes: string[];
  difficulty?: MissionDifficulty;
}): ActiveAnomaly | null {
  const { metSeconds, seed, systemReliability, existingCodes, difficulty = 'STANDARD' } = params;
  // Check at fixed 3,600s (1-hour) intervals
  if (metSeconds <= 0 || metSeconds % 3600 !== 0) return null;

  const profile = DIFFICULTY_PROFILES[difficulty];
  const stepIndex = Math.floor(metSeconds / 3600);
  const rng = createSeededRng(seed + stepIndex * 7919);
  const roll = rng();

  // Higher system reliability lowers anomaly probability per hour; difficulty scales incidence rate
  const hourlyTriggerThreshold = Math.min(
    0.65,
    Math.max(0.05, (1 - systemReliability) * 1.15) * profile.anomalyRateMultiplier
  );
  if (roll > hourlyTriggerThreshold) return null;

  const available = ANOMALY_CATALOG.filter((a) => !existingCodes.includes(a.code));
  if (available.length === 0) return null;

  const chosen = available[Math.floor(rng() * available.length)];
  const stress = profile.anomalyStressMultiplier;
  return {
    ...chosen,
    powerPenaltyW: Number((chosen.powerPenaltyW * stress).toFixed(1)),
    tempOffsetC: Number((chosen.tempOffsetC * stress).toFixed(1)),
    id: `anom-${metSeconds}-${chosen.code}`,
    triggeredAtMetSec: metSeconds,
    resolved: false,
  };
}
