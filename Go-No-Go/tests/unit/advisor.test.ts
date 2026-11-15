import { describe, expect, it } from 'vitest';
import {
  generateMissionAdvisorReport,
  requestOptionalAiExplanation,
} from '../../src/engine/advisor';
import { MISSION_PRESETS, resolveMissionEntities, useMissionStore } from '../../src/store/missionStore';

describe('Deterministic Rule-Based Mission Advisor', () => {
  it('marks baseline GO FLOODWATCH preset as FLIGHT_READY with zero critical blockers', () => {
    const baseline = MISSION_PRESETS[0];
    const resolved = resolveMissionEntities({
      ...useMissionStore.getState(),
      scenarioId: baseline.scenarioId,
      busId: baseline.busId,
      subsystemIds: { ...baseline.subsystemIds },
      instrumentIds: [...baseline.instrumentIds],
      orbitId: baseline.orbitId,
      launchVehicleId: baseline.launchVehicleId,
      customAltitudeKm: null,
      customInclinationDeg: null,
    });

    const report = generateMissionAdvisorReport(resolved);
    expect(report.overallVerdict).toBe('FLIGHT_READY');
    expect(report.criticalCount).toBe(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.disclaimer).toContain('Deterministic rule-based');
  });

  it('flags optical-only CubeSat in FLOODWATCH with cloud/SAR and power/comms/mass findings', () => {
    const cubesat = MISSION_PRESETS[1];
    const resolved = resolveMissionEntities({
      ...useMissionStore.getState(),
      scenarioId: cubesat.scenarioId,
      busId: cubesat.busId,
      subsystemIds: { ...cubesat.subsystemIds },
      instrumentIds: [...cubesat.instrumentIds],
      orbitId: cubesat.orbitId,
      launchVehicleId: cubesat.launchVehicleId,
      customAltitudeKm: null,
      customInclinationDeg: null,
    });

    const report = generateMissionAdvisorReport(resolved);
    expect(report.overallVerdict).toBe('CRITICAL_REDESIGN');
    expect(report.criticalCount).toBeGreaterThan(0);
    expect(report.recommendations.some((r) => r.id === 'adv-science-floodwatch-sar')).toBe(true);
    expect(report.recommendations.every((r) => r.route.startsWith('/'))).toBe(true);
  });

  it('detects 0 instruments and sub-surface invalid orbit as CRITICAL blockers', () => {
    const baseline = MISSION_PRESETS[0];
    const resolved = resolveMissionEntities({
      ...useMissionStore.getState(),
      scenarioId: baseline.scenarioId,
      busId: baseline.busId,
      subsystemIds: { ...baseline.subsystemIds },
      instrumentIds: [],
      orbitId: baseline.orbitId,
      launchVehicleId: baseline.launchVehicleId,
      customAltitudeKm: 50,
      customInclinationDeg: 97.6,
    });

    const report = generateMissionAdvisorReport(resolved);
    expect(report.overallVerdict).toBe('CRITICAL_REDESIGN');
    expect(report.recommendations.some((r) => r.id === 'adv-orbit-invalid')).toBe(true);
    expect(report.recommendations.some((r) => r.id === 'adv-science-empty')).toBe(true);
  });

  it('keeps optional AI narrative hook cleanly separated and fails closed when unconfigured or unreachable', async () => {
    const baseline = MISSION_PRESETS[0];
    const resolved = resolveMissionEntities({
      ...useMissionStore.getState(),
      scenarioId: baseline.scenarioId,
      busId: baseline.busId,
      subsystemIds: { ...baseline.subsystemIds },
      instrumentIds: [...baseline.instrumentIds],
      orbitId: baseline.orbitId,
      launchVehicleId: baseline.launchVehicleId,
      customAltitudeKm: null,
      customInclinationDeg: null,
    });
    const report = generateMissionAdvisorReport(resolved);

    const disabled = await requestOptionalAiExplanation({
      scenarioCode: resolved.scenario.code,
      report,
      endpointOverride: '',
    });
    expect(disabled.status).toBe('DISABLED');

    const unreachable = await requestOptionalAiExplanation({
      scenarioCode: resolved.scenario.code,
      report,
      endpointOverride: 'https://example.invalid/advisor',
      fetchImpl: async () => {
        throw new Error('Network disabled');
      },
    });
    expect(unreachable.status).toBe('UNAVAILABLE');
    expect(unreachable.narrative).toBeUndefined();
  });
});
