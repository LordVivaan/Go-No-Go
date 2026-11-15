import { describe, expect, it } from 'vitest';
import { createSeededRng, sampleDeterministicAnomaly } from '../../src/engine/events';
import { evaluateMissionScore } from '../../src/engine/scoring';
import { resolveMissionEntities, useMissionStore } from '../../src/store/missionStore';
import { useSimulationStore } from '../../src/store/simulationStore';

describe('GO / NO-GO Phase 5 & 6 — Deterministic Orbital Simulation & Operations', () => {
  it('produces reproducible random sequences from Mulberry32 seeded PRNG', () => {
    const rngA = createSeededRng(20261114);
    const rngB = createSeededRng(20261114);

    const seqA = [rngA(), rngA(), rngA()];
    const seqB = [rngB(), rngB(), rngB()];
    expect(seqA).toEqual(seqB);
  });

  it('keeps fixed-timestep simulation invariant across 1x vs batched elapsed seconds', () => {
    useMissionStore.getState().resetMissionForNewAttempt();
    useMissionStore.getState().applyPreset('preset-lunar-nominal-go');

    // Run A: 120 small steps of 30s (3600s simulated)
    useSimulationStore.getState().initializeSimulation(20261114);
    for (let i = 0; i < 120; i++) {
      useSimulationStore.getState().advanceSimulationByElapsedSeconds(30);
    }
    const telemetryA = useSimulationStore.getState().currentTelemetry;

    // Run B: 12 larger chunks of 300s (also 3600s simulated)
    useSimulationStore.getState().initializeSimulation(20261114);
    for (let i = 0; i < 12; i++) {
      useSimulationStore.getState().advanceSimulationByElapsedSeconds(300);
    }
    const telemetryB = useSimulationStore.getState().currentTelemetry;

    expect(telemetryA.metSeconds).toBe(3600);
    expect(telemetryB.metSeconds).toBe(3600);
    expect(telemetryA.batterySocPct).toBe(telemetryB.batterySocPct);
    expect(telemetryA.cumulativeDataCapturedGb).toBe(telemetryB.cumulativeDataCapturedGb);
  });

  it('reduces power demand and data capture when an instrument is toggled off in orbit', () => {
    useMissionStore.getState().resetMissionForNewAttempt();
    useMissionStore.getState().applyPreset('preset-lunar-nominal-go');

    // Baseline all instruments active for 1 hour
    useSimulationStore.getState().initializeSimulation(20261114);
    useSimulationStore.getState().fastForwardSimulationHours(1, 60);
    const allActiveTelemetry = useSimulationStore.getState().currentTelemetry;

    // Toggle Thermal IR payload off from T=0 and compare 1 hour
    useSimulationStore.getState().initializeSimulation(20261114);
    useSimulationStore.getState().toggleInstrumentActive('inst-thermal-ir');
    useSimulationStore.getState().fastForwardSimulationHours(1, 60);
    const thermalDisabledTelemetry = useSimulationStore.getState().currentTelemetry;

    expect(thermalDisabledTelemetry.cumulativeDataCapturedGb).toBeLessThan(
      allActiveTelemetry.cumulativeDataCapturedGb
    );
    expect(thermalDisabledTelemetry.powerLoadW).toBeLessThan(allActiveTelemetry.powerLoadW);
  });

  it('propagates 72h orbital simulation deterministically and generates an authentic S/A report', () => {
    const missionStore = useMissionStore.getState();
    missionStore.resetMissionForNewAttempt();
    missionStore.applyPreset('preset-lunar-nominal-go');

    const simStore = useSimulationStore.getState();
    simStore.initializeSimulation(20261114);

    // Step 2 hours incrementally first using fixed 60s physics steps
    for (let i = 0; i < 120; i++) {
      useSimulationStore.getState().tickSimulation(60);
    }

    const after2h = useSimulationStore.getState();
    expect(after2h.currentTelemetry.metSeconds).toBe(7200);
    expect(after2h.currentTelemetry.orbitNumber).toBeGreaterThanOrEqual(2);
    expect(after2h.currentTelemetry.batterySocPct).toBeGreaterThan(50);

    // Run deterministic multi-day orbital simulation across priority flood basins
    useSimulationStore.getState().fastForwardSimulationHours(70, 60);

    // Resolve any active deterministic anomalies so operations score stays clean
    const anomalies = useSimulationStore.getState().activeAnomalies;
    for (const a of anomalies) {
      useSimulationStore.getState().executeMitigationCommand(a.mitigationCommand);
    }
    useSimulationStore.getState().executeManualDownlinkBurst();
    useSimulationStore.getState().executeOrbitTrimBurn();

    const report = useSimulationStore.getState().completeMissionAndGenerateReport();
    expect(report.outcome).toBe('SUCCESS');
    expect(report.difficulty).toBe('STANDARD');
    expect(report.totalScore).toBeGreaterThanOrEqual(78);
    expect(report.totalScore).toBeLessThanOrEqual(100);
    expect(['S', 'A']).toContain(report.grade);
    expect(report.floodRegionsMappedCount).toBeGreaterThanOrEqual(3);
    expect(report.totalDataDownlinkedGb).toBeGreaterThan(10);
  });

  it('applies MISSION_LOSS cap (max 40 pts, Grade F) on battery exhaustion failure', () => {
    const missionStore = useMissionStore.getState();
    missionStore.applyPreset('preset-lunar-nominal-go');
    const resolved = resolveMissionEntities(useMissionStore.getState());

    const failedReport = evaluateMissionScore({
      scenario: resolved.scenario,
      configurationName: 'Exhausted Bus Failure Case',
      engineering: resolved.engineering,
      instruments: resolved.instruments,
      totalDataCapturedGb: 18,
      totalDataDownlinkedGb: 5,
      floodRegionsMappedCount: 1,
      batteryExhausted: true,
      finalSystemHealthPct: 0,
    });

    expect(failedReport.outcome).toBe('MISSION_LOSS');
    expect(failedReport.grade).toBe('F');
    expect(failedReport.totalScore).toBeLessThanOrEqual(40);
    expect(failedReport.failureReason).toBeTruthy();
  });

  it('scales deterministic anomaly probability & stress under EXPERT difficulty', () => {
    let stdCount = 0;
    let expertCount = 0;
    let firstExpertStress = 0;

    for (let hour = 1; hour <= 120; hour++) {
      const stdAnom = sampleDeterministicAnomaly({
        metSeconds: hour * 3600,
        seed: 2026,
        systemReliability: 0.72,
        existingCodes: [],
        difficulty: 'STANDARD',
      });
      if (stdAnom) stdCount++;

      const expAnom = sampleDeterministicAnomaly({
        metSeconds: hour * 3600,
        seed: 2026,
        systemReliability: 0.72,
        existingCodes: [],
        difficulty: 'EXPERT',
      });
      if (expAnom) {
        expertCount++;
        if (firstExpertStress === 0) firstExpertStress = expAnom.powerPenaltyW;
      }
    }

    expect(expertCount).toBeGreaterThan(0);
    expect(expertCount).toBeGreaterThanOrEqual(stdCount);
    expect(firstExpertStress).toBeGreaterThan(0);
  });
});
