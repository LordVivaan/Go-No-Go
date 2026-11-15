import type { ScientificInstrument } from '../types/spacecraft';

/**
 * Computes science data volume generated per orbit and per day in decimal Gigabytes
 * (1 GB = 1,000 MB = 10^9 bytes; 1 MB = 10^6 bytes; 1 byte = 8 bits).
 *
 * Assumptions:
 * - Instrument active time per orbit = orbitalPeriodSec * clamp(defaultDutyCycle, 0, 1).
 * - Optional lossless/lossy onboard compressionRatio >= 1.0 defaults to 1.0 (uncompressed raw stream).
 */
export function computeScienceDataGeneration(params: {
  instruments: ScientificInstrument[];
  orbitalPeriodSec: number;
  orbitsPerDay: number;
  compressionRatio?: number;
}): {
  dataPerOrbitGb: number;
  dataPerDayGb: number;
  compressionRatio: number;
} {
  const { instruments, orbitalPeriodSec, orbitsPerDay, compressionRatio = 1.0 } = params;
  const safeCompression = Math.max(1.0, compressionRatio);

  const rawDataPerOrbitMb = instruments.reduce((sumMb, inst) => {
    const duty = Math.max(0, Math.min(1, inst.defaultDutyCycle));
    const activeSeconds = Math.max(0, orbitalPeriodSec) * duty;
    const megabitsGenerated = Math.max(0, inst.dataRateMbps) * activeSeconds;
    const megabytesGenerated = megabitsGenerated / 8.0;
    return sumMb + megabytesGenerated;
  }, 0);

  const dataPerOrbitGb = rawDataPerOrbitMb / safeCompression / 1000.0;
  const dataPerDayGb = dataPerOrbitGb * Math.max(0, orbitsPerDay);

  return {
    dataPerOrbitGb: Number(dataPerOrbitGb.toFixed(3)),
    dataPerDayGb: Number(dataPerDayGb.toFixed(2)),
    compressionRatio: safeCompression,
  };
}

/**
 * Updates Solid-State Recorder (SSR) backlog with explicit ring-buffer/overflow cap semantics
 * and prevents downlinking more data than currently buffered.
 */
export function updateStorageBacklogGb(params: {
  currentBacklogGb: number;
  generatedGb: number;
  downlinkCapacityGb: number;
  storageCapacityGb: number;
}): {
  nextBacklogGb: number;
  downlinkedGb: number;
  overflowedGb: number;
  utilizationPct: number;
} {
  const safeCap = Math.max(0.001, params.storageCapacityGb);
  const clampedCurrent = Math.max(0, params.currentBacklogGb);
  const generated = Math.max(0, params.generatedGb);
  const capacity = Math.max(0, params.downlinkCapacityGb);

  const downlinkedGb = Math.min(clampedCurrent, capacity);
  const postDownlink = clampedCurrent - downlinkedGb;
  const uncapped = postDownlink + generated;
  const overflowedGb = Math.max(0, uncapped - safeCap);
  const nextBacklogGb = Math.min(safeCap, uncapped);

  return {
    nextBacklogGb: Number(nextBacklogGb.toFixed(4)),
    downlinkedGb: Number(downlinkedGb.toFixed(4)),
    overflowedGb: Number(overflowedGb.toFixed(4)),
    utilizationPct: Number(((nextBacklogGb / safeCap) * 100).toFixed(2)),
  };
}
